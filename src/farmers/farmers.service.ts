import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, Repository } from 'typeorm';
import { Farmer } from './entities/farmer.entity';
import { FarmerDocumentCollision } from './entities/farmer-document-collision.entity';
import { Farm } from 'src/farms/entities/farm.entity';
import { Town } from 'src/towns/entities/town.entity';
import { CampaignSession } from 'src/campaign-sessions/entities/campaign-session.entity';
import { Survey } from 'src/surveys/entities/survey.entity';
import { CreateFarmerDto } from './dto/create-farmer.dto';
import { UpdateFarmerDto } from './dto/update-farmer.dto';

const FARMER_RELATIONS = ['farm', 'farm.town', 'farm.crops'];

/** Código Postgres de `foreign_key_violation`. */
const POSTGRES_FK_VIOLATION = '23503';

interface BlockedByEntry {
  resource: string;
  count: number;
}

/**
 * Cuerpo del 409 de `remove()`. Se construye explícitamente con
 * `statusCode`/`error` (en vez de dejar que `ConflictException` los agregue,
 * como hace cuando se le pasa un string) para que el cuerpo tenga la misma
 * forma sin importar el mensaje pasado — y `blockedBy` siempre está presente,
 * aunque vacío, para que un cliente que haga `body.blockedBy.map(...)` (según
 * el contrato del criterio 3 del spec 50) nunca reciba `undefined`.
 */
function conflictBody(blockedBy: BlockedByEntry[] = []) {
  return {
    statusCode: 409,
    error: 'Conflict',
    message: 'Farmer has related records and cannot be deleted',
    blockedBy,
  };
}

@Injectable()
export class FarmersService {
  constructor(
    @InjectRepository(Farmer)
    private readonly farmersRepository: Repository<Farmer>,
    @InjectRepository(Farm)
    private readonly farmsRepository: Repository<Farm>,
    @InjectRepository(Town)
    private readonly townsRepository: Repository<Town>,
    @InjectRepository(CampaignSession)
    private readonly sessionsRepository: Repository<CampaignSession>,
    @InjectRepository(Survey)
    private readonly surveysRepository: Repository<Survey>,
    @InjectRepository(FarmerDocumentCollision)
    private readonly documentCollisionsRepository: Repository<FarmerDocumentCollision>,
  ) {}

  // Spec 68 — colisiones de documentId detectadas por
  // `SurveysService.extractFarmer()` (resueltas o pendientes), para revisión
  // administrativa. Es la misma tabla que consulta la herramienta de
  // solo lectura del MCP `sosagro-admin` (Fase 6).
  async listDocumentCollisions() {
    const rows = await this.documentCollisionsRepository.find({
      relations: ['existingFarmer'],
      order: { createdAt: 'DESC' },
    });

    return rows.map((row) => ({
      collisionId: row.collisionId,
      documentId: row.documentId,
      submittedName: row.submittedName,
      existingFarmer: {
        farmerId: row.existingFarmer?.id ?? null,
        name: row.existingFarmerName,
      },
      resolution: row.resolution,
      createdAt: row.createdAt,
      resolvedAt: row.resolvedAt,
    }));
  }

  async create(dto: CreateFarmerDto): Promise<Farmer> {
    let town: Town | undefined;
    if (dto.townId) {
      const found = await this.townsRepository.findOne({
        where: { townId: dto.townId },
      });
      if (!found) throw new NotFoundException('Town not found');
      town = found;
    }

    let farm: Farm | undefined;
    if (dto.farmName) {
      farm = await this.farmsRepository.save(
        this.farmsRepository.create({
          name: dto.farmName,
          town,
          latitude: dto.latitude ?? null,
          longitude: dto.longitude ?? null,
          altitude: dto.altitude ?? null,
        }),
      );
    }

    const farmer = await this.farmersRepository.save(
      this.farmersRepository.create({
        name: dto.name,
        documentId: dto.documentId,
        phone: dto.phone ?? null,
        email: dto.email ?? null,
        age: dto.age ?? null,
        gender: dto.gender ?? null,
        educationLevel: dto.educationLevel ?? null,
        experienceYears: dto.experienceYears ?? null,
        familySize: dto.familySize ?? null,
        isMainIncome: dto.isMainIncome ?? null,
        participationInTraining: dto.participationInTraining ?? null,
        farm,
      }),
    );

    return this.findOne(farmer.id);
  }

  async search(query: string) {
    return this.farmersRepository.find({
      select: {
        id: true,
        name: true,
        documentId: true,
        phone: true,
        farm: {
          farmId: true,
          name: true,
          town: { townId: true, name: true },
          crops: { cropId: true, name: true },
        },
      },
      relations: ['farm', 'farm.town', 'farm.crops'],
      where: [
        { name: ILike(`%${query}%`) },
        { documentId: ILike(`%${query}%`) },
      ],
      take: 10,
    });
  }

  async findAll(): Promise<Farmer[]> {
    return this.farmersRepository.find({
      relations: FARMER_RELATIONS,
      take: 500,
    });
  }

  async findOne(id: string): Promise<Farmer> {
    const farmer = await this.farmersRepository.findOne({
      where: { id },
      relations: [...FARMER_RELATIONS, 'cooperative'],
    });
    if (!farmer) throw new NotFoundException('Farmer not found');
    return farmer;
  }

  async update(id: string, dto: UpdateFarmerDto): Promise<Farmer> {
    const farmer = await this.findOne(id);
    Object.assign(farmer, dto);
    await this.farmersRepository.save(farmer);
    return this.findOne(id);
  }

  async remove(id: string): Promise<void> {
    const farmer = await this.findOne(id);

    const [sessionsCount, surveysCount] = await Promise.all([
      this.sessionsRepository.count({ where: { farmer: { id } } }),
      this.surveysRepository.count({ where: { farmer: { id } } }),
    ]);

    const blockedBy: BlockedByEntry[] = [];
    if (sessionsCount > 0) {
      blockedBy.push({ resource: 'campaign_sessions', count: sessionsCount });
    }
    if (surveysCount > 0) {
      blockedBy.push({ resource: 'surveys', count: surveysCount });
    }

    if (blockedBy.length > 0) {
      throw new ConflictException(conflictBody(blockedBy));
    }

    try {
      await this.farmersRepository.remove(farmer);
    } catch (error) {
      // Red de seguridad: si en el futuro una tabla nueva referencia
      // `farmers` y nadie la suma al conteo de arriba, esto evita que el bug
      // reaparezca como un 500 sin manejar (ver spec 50). `blockedBy` queda
      // vacío porque no sabemos qué tabla lo bloqueó — no se contó arriba.
      if (this.isForeignKeyViolation(error)) {
        throw new ConflictException(conflictBody());
      }
      throw error;
    }
  }

  private isForeignKeyViolation(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'driverError' in error &&
      typeof (error as { driverError?: unknown }).driverError === 'object' &&
      (error as { driverError?: { code?: unknown } }).driverError !== null &&
      (error as { driverError: { code?: unknown } }).driverError.code ===
        POSTGRES_FK_VIOLATION
    );
  }
}
