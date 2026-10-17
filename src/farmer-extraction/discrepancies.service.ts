import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Farmer } from 'src/farmers/entities/farmer.entity';
import { Farm } from 'src/farms/entities/farm.entity';
import { Repository } from 'typeorm';
import { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';
import type {
  DiscrepancyView,
  ListDiscrepanciesQueryDto,
} from './dto/discrepancy.dto';
import {
  DiscrepancyStatus,
  EntityFieldDiscrepancy,
} from './entities/entity-field-discrepancy.entity';
import { isApplicableField } from './extraction-plan';

/**
 * Spec 95 (D-H3-6) — API de discrepancias: listar, aplicar y descartar. La
 * interfaz para resolverlas llega en H5; aquí solo la API.
 */
@Injectable()
export class DiscrepanciesService {
  constructor(
    @InjectRepository(EntityFieldDiscrepancy)
    private readonly repository: Repository<EntityFieldDiscrepancy>,
  ) {}

  private toView(row: EntityFieldDiscrepancy): DiscrepancyView {
    return {
      discrepancyId: row.discrepancyId,
      entityType: row.entityType,
      farmerId: row.farmerId,
      farmId: row.farmId,
      field: row.field,
      systemField: row.systemField,
      currentValue: row.currentValue,
      submittedValue: row.submittedValue,
      surveyId: row.surveyId,
      responseId: row.responseId,
      status: row.status,
      resolvedBy: row.resolvedBy,
      resolvedAt: row.resolvedAt ? row.resolvedAt.toISOString() : null,
      createdAt: row.createdAt.toISOString(),
    };
  }

  /** Discrepancias del productor y las de sus fincas. */
  async listForFarmer(
    farmerId: string,
    status?: DiscrepancyStatus,
  ): Promise<DiscrepancyView[]> {
    const qb = this.repository
      .createQueryBuilder('d')
      .where(
        `(d.farmer_id = :farmerId OR d.farm_id IN (
            SELECT ff.farm_id FROM farmer_farms ff WHERE ff.farmer_id = :farmerId
            UNION SELECT fr.farm_id FROM farmers fr WHERE fr.id = :farmerId AND fr.farm_id IS NOT NULL))`,
        { farmerId },
      )
      .orderBy('d.created_at', 'DESC');
    if (status) qb.andWhere('d.status = :status', { status });
    return (await qb.getMany()).map((row) => this.toView(row));
  }

  async list(query: ListDiscrepanciesQueryDto): Promise<{
    items: DiscrepancyView[];
    total: number;
    page: number;
    limit: number;
  }> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 25;
    const qb = this.repository
      .createQueryBuilder('d')
      .orderBy('d.created_at', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);
    if (query.status)
      qb.andWhere('d.status = :status', { status: query.status });
    if (query.entityType) {
      qb.andWhere('d.entity_type = :entityType', {
        entityType: query.entityType,
      });
    }
    const [rows, total] = await qb.getManyAndCount();
    return { items: rows.map((r) => this.toView(r)), total, page, limit };
  }

  async resolve(
    discrepancyId: string,
    action: 'apply' | 'dismiss',
    resolvedBy: string,
  ): Promise<DiscrepancyView> {
    return this.repository.manager.transaction(async (manager) => {
      const row = await manager.findOne(EntityFieldDiscrepancy, {
        where: { discrepancyId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!row) throw new NotFoundException('Discrepancy not found');
      if (row.status !== 'open') {
        throw new ConflictException(
          `La discrepancia ya fue resuelta (estado: ${row.status}).`,
        );
      }

      if (action === 'apply') {
        await this.applyValue(manager, row);
      }
      row.status = action === 'apply' ? 'applied' : 'dismissed';
      row.resolvedBy = resolvedBy;
      row.resolvedAt = new Date();
      await manager.update(EntityFieldDiscrepancy, discrepancyId, {
        status: row.status,
        resolvedBy,
        resolvedAt: row.resolvedAt,
      });
      return this.toView(row);
    });
  }

  private async applyValue(
    manager: Repository<EntityFieldDiscrepancy>['manager'],
    row: EntityFieldDiscrepancy,
  ): Promise<void> {
    const entity = row.entityType;
    if (entity === 'farmer_farm') {
      throw new BadRequestException(
        'Las discrepancias del vínculo productor–finca no se aplican desde aquí.',
      );
    }
    if (!isApplicableField(entity, row.field)) {
      throw new BadRequestException(
        `El campo «${row.field}» no se puede sobrescribir.`,
      );
    }
    const patch: Record<string, unknown> =
      row.field === 'townId'
        ? { town: row.submittedValue ? { townId: row.submittedValue } : null }
        : { [row.field]: row.submittedValue };

    if (entity === 'farmer') {
      if (!row.farmerId)
        throw new BadRequestException('Sin productor asociado.');
      await manager.update(
        Farmer,
        row.farmerId,
        patch as QueryDeepPartialEntity<Farmer>,
      );
    } else {
      if (!row.farmId) throw new BadRequestException('Sin finca asociada.');
      await manager.update(
        Farm,
        row.farmId,
        patch as QueryDeepPartialEntity<Farm>,
      );
    }
  }
}
