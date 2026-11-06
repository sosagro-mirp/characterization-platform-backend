import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Farmer } from 'src/farmers/entities/farmer.entity';
import { Farm } from 'src/farms/entities/farm.entity';
import { In, Repository } from 'typeorm';
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

  private toView(
    row: EntityFieldDiscrepancy,
    extra: Pick<DiscrepancyView, 'liveValue'> & Partial<DiscrepancyView> = {
      liveValue: null,
    },
  ): DiscrepancyView {
    const liveValue = extra.liveValue;
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
      isStale: !sameValue(liveValue, row.currentValue),
      canApply:
        row.entityType !== 'farmer_farm' &&
        isApplicableField(row.entityType, row.field),
      ...extra,
    };
  }

  /**
   * Spec 100 — agrega el valor vivo de la entidad a cada discrepancia (y los
   * nombres de municipio y el número de productores de la finca). Se calcula
   * al leer: no hay estado nuevo.
   */
  private async enrich(
    rows: EntityFieldDiscrepancy[],
  ): Promise<DiscrepancyView[]> {
    const manager = this.repository.manager;
    const ids = (type: string, key: 'farmerId' | 'farmId') => [
      ...new Set(
        rows
          .filter((r) => r.entityType === type && r[key])
          .map((r) => r[key] as string),
      ),
    ];
    const farmerIds = ids('farmer', 'farmerId');
    const farmIds = ids('farm', 'farmId');
    const linkRows = rows.filter((r) => r.entityType === 'farmer_farm');

    const [farmers, farms, links, counts] = await Promise.all([
      farmerIds.length
        ? manager.find(Farmer, { where: { id: In(farmerIds) } })
        : [],
      farmIds.length
        ? manager.find(Farm, {
            where: { farmId: In(farmIds) },
            relations: { town: true },
          })
        : [],
      linkRows.length
        ? manager.query<Record<string, unknown>[]>(
            `SELECT * FROM farmer_farms WHERE farmer_id = ANY($1::uuid[]) AND farm_id = ANY($2::uuid[])`,
            [linkRows.map((r) => r.farmerId), linkRows.map((r) => r.farmId)],
          )
        : [],
      farmIds.length
        ? manager.query<{ farm_id: string; n: number }[]>(
            `SELECT farm_id, count(*)::int AS n FROM farmer_farms WHERE farm_id = ANY($1::uuid[]) GROUP BY farm_id`,
            [farmIds],
          )
        : [],
    ]);
    const farmerById = new Map<string, Farmer>(
      (farmers as Farmer[]).map((f): [string, Farmer] => [f.id, f]),
    );
    const farmById = new Map<string, Farm>(
      (farms as Farm[]).map((f): [string, Farm] => [f.farmId, f]),
    );
    const countByFarm = new Map<string, number>(
      (counts as { farm_id: string; n: number }[]).map((c) => [
        c.farm_id,
        Number(c.n),
      ]),
    );

    // Municipios que hay que nombrar (vivo, registrado y propuesto).
    const townIds = new Set<string>();
    for (const r of rows) {
      if (r.entityType === 'farm' && r.field === 'townId') {
        for (const v of [r.currentValue, r.submittedValue]) {
          if (typeof v === 'string') townIds.add(v);
        }
      }
    }
    const townNames = new Map<string, string>();
    if (townIds.size) {
      const towns = await manager.query<{ town_id: string; name: string }[]>(
        `SELECT town_id, name FROM towns WHERE town_id = ANY($1::uuid[])`,
        [[...townIds]],
      );
      for (const t of towns) townNames.set(t.town_id, t.name);
    }
    const label = (v: unknown): string | null =>
      typeof v === 'string' ? (townNames.get(v) ?? null) : null;

    return rows.map((row) => {
      let liveValue: unknown = null;
      const extra: Partial<DiscrepancyView> = {};
      if (row.entityType === 'farmer') {
        const farmer = row.farmerId ? farmerById.get(row.farmerId) : undefined;
        liveValue =
          (farmer as unknown as Record<string, unknown> | undefined)?.[
            row.field
          ] ?? null;
      } else if (row.entityType === 'farm') {
        const farm = row.farmId ? farmById.get(row.farmId) : undefined;
        liveValue =
          row.field === 'townId'
            ? (farm?.town?.townId ?? null)
            : ((farm as unknown as Record<string, unknown> | undefined)?.[
                row.field
              ] ?? null);
        if (row.field === 'townId') {
          extra.liveLabel = farm?.town?.name ?? null;
          extra.currentLabel = label(row.currentValue);
          extra.submittedLabel = label(row.submittedValue);
        }
        extra.farmFarmerCount = row.farmId
          ? (countByFarm.get(row.farmId) ?? 0)
          : 0;
      } else {
        const link = (links as Record<string, unknown>[]).find(
          (l) => l.farmer_id === row.farmerId && l.farm_id === row.farmId,
        );
        liveValue = link?.[snakeCase(row.field)] ?? null;
      }
      return this.toView(row, { liveValue, ...extra });
    });
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
    return this.enrich(await qb.getMany());
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
    return { items: await this.enrich(rows), total, page, limit };
  }

  async resolve(
    discrepancyId: string,
    action: 'apply' | 'dismiss',
    resolvedBy: string,
  ): Promise<DiscrepancyView> {
    const resolved = await this.repository.manager.transaction(
      async (manager) => {
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
        return row;
      },
    );
    // Valor vivo ya confirmado: en `dismiss` es el de la entidad, no el propuesto.
    return (await this.enrich([resolved]))[0];
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

function snakeCase(field: string): string {
  return field.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
}

/** Igualdad tolerante: null/undefined iguales, números y textos numéricos por valor. */
function sameValue(a: unknown, b: unknown): boolean {
  const empty = (v: unknown) => v === null || v === undefined || v === '';
  if (empty(a) || empty(b)) return empty(a) && empty(b);
  const na = Number(a);
  const nb = Number(b);
  if (
    typeof a !== 'object' &&
    typeof b !== 'object' &&
    !isNaN(na) &&
    !isNaN(nb)
  ) {
    return na === nb;
  }
  return JSON.stringify(a) === JSON.stringify(b);
}
