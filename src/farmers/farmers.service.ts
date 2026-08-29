import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, In, Repository } from 'typeorm';
import { Farmer } from './entities/farmer.entity';
import { FarmerDocumentCollision } from './entities/farmer-document-collision.entity';
import { Farm } from 'src/farms/entities/farm.entity';
import { Town } from 'src/towns/entities/town.entity';
import { CampaignSession } from 'src/campaign-sessions/entities/campaign-session.entity';
import { Survey } from 'src/surveys/entities/survey.entity';
import { CreateFarmerDto } from './dto/create-farmer.dto';
import { UpdateFarmerDto } from './dto/update-farmer.dto';
import { FarmerDeletionPreviewDto } from './dto/deletion-preview.dto';
import { ConsentRecordsService } from '../consents/consent-records.service';

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
  private readonly logger = new Logger(FarmersService.name);

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
    private readonly consentRecordsService: ConsentRecordsService,
  ) {}

  // Spec 68 — colisiones de documentId detectadas por
  // `SurveysService.extractFarmer()` (resueltas o pendientes), para revisión
  // administrativa. Es la misma tabla que consulta la herramienta de
  // solo lectura del MCP `sosagro-admin` (Fase 6).
  async listDocumentCollisions() {
    const rows = await this.documentCollisionsRepository.find({
      relations: ['existingFarmer', 'survey'],
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
      // La encuesta (S1a) de origen — null solo si esa encuesta ya no
      // existe (SET NULL en la FK, ver el entity), nunca porque falte
      // registrarla: extractFarmer() siempre la conoce al detectar.
      surveyId: row.survey?.surveyId ?? null,
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

  // Fase 10 (cambio de alcance 2026-08-28) — cada agricultor del listado
  // lleva `hasPendingConsent`, para que el admin vea de un vistazo a quién le
  // falta el consentimiento informado, sin abrir cada detalle. El detalle
  // exacto (`valid | outdated_version | revoked | none`) sigue viviendo en
  // `GET /api/farmers/:id/consent`.
  async findAll(): Promise<Array<Farmer & { hasPendingConsent: boolean }>> {
    const farmers = await this.farmersRepository.find({
      relations: FARMER_RELATIONS,
      take: 500,
    });

    const pendingMap = await this.consentRecordsService.getPendingConsentMap(
      farmers.map((f) => f.id),
    );

    return farmers.map((farmer) =>
      Object.assign(farmer, {
        hasPendingConsent: pendingMap.get(farmer.id) ?? true,
      }),
    );
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

    const [sessionsCount, surveysCount, documentCollisionsCount] =
      await Promise.all([
        this.sessionsRepository.count({ where: { farmer: { id } } }),
        this.surveysRepository.count({ where: { farmer: { id } } }),
        // Spec 68 — farmer_document_collisions.existing_farmer_id también
        // referencia a farmers con ON DELETE RESTRICT; sin este conteo caía en
        // la red de seguridad genérica de abajo (409 con blockedBy vacío) en
        // vez de decir explícitamente qué lo bloquea.
        this.documentCollisionsRepository.count({
          where: { existingFarmer: { id } },
        }),
      ]);

    const blockedBy: BlockedByEntry[] = [];
    if (sessionsCount > 0) {
      blockedBy.push({ resource: 'campaign_sessions', count: sessionsCount });
    }
    if (surveysCount > 0) {
      blockedBy.push({ resource: 'surveys', count: surveysCount });
    }
    if (documentCollisionsCount > 0) {
      blockedBy.push({
        resource: 'farmer_document_collisions',
        count: documentCollisionsCount,
      });
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

  // ─────────────────────────────────────────────────────────────────────────
  // Spec 73 — borrado en cascada de un agricultor y sus datos derivados.
  // `getDeletionPreview` es de solo lectura; `removeCascade` ejecuta el
  // borrado en una transacción, en el orden verificado en producción
  // (`docs/testing/limpieza-produccion-2026-08-24.sql`):
  //   colisiones → encuestas (arrastra respuestas por CASCADE de DB) →
  //   sesiones → relaciones M:M/conexiones → agricultor → finca (si exclusiva)
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Resuelve qué se borraría/borró para un agricultor: sesiones, encuestas
   * (por los dos caminos posibles, sin duplicar — ver spec 73 "Contexto") y
   * si su finca es exclusiva o compartida con otro agricultor.
   */
  private async computeDeletionPlan(id: string) {
    const farmer = await this.farmersRepository.findOne({
      where: { id },
      relations: ['farm'],
    });
    if (!farmer) throw new NotFoundException('Farmer not found');

    const sessions = await this.sessionsRepository.find({
      where: { farmer: { id } },
    });
    const sessionIds = sessions.map((s) => s.sessionId);

    // `surveys.farmer_id` puede estar en NULL con el vínculo real viajando
    // por `campaign_session_id` (backlog: "surveys.farmer_id queda en NULL en
    // parte de las encuestas"). Ambos caminos, sin duplicar por id.
    const surveys = await this.surveysRepository.find({
      where: sessionIds.length
        ? [
            { farmer: { id } },
            { campaignSession: { sessionId: In(sessionIds) } },
          ]
        : { farmer: { id } },
    });

    const documentCollisionsCount =
      await this.documentCollisionsRepository.count({
        where: { existingFarmer: { id } },
      });

    let farmInfo: FarmerDeletionPreviewDto['farm'] = null;
    if (farmer.farm) {
      const farm = await this.farmsRepository.findOne({
        where: { farmId: farmer.farm.farmId },
        relations: ['farmers'],
      });
      const otherFarmers = (farm?.farmers ?? []).filter((f) => f.id !== id);
      farmInfo = {
        farmId: farmer.farm.farmId,
        name: farm?.name ?? farmer.farm.name,
        shared: otherFarmers.length > 0,
        willBeDeleted: otherFarmers.length === 0,
      };
    }

    return { farmer, sessionIds, surveys, documentCollisionsCount, farmInfo };
  }

  /** Ejecuta un `SELECT count(*) AS count ...` y devuelve el número, tipado. */
  private async queryCount(sql: string, params: unknown[]): Promise<number> {
    const rows = await this.farmersRepository.manager.query<
      { count: number | string }[]
    >(sql, params);
    return Number(rows[0]?.count ?? 0);
  }

  async getDeletionPreview(id: string): Promise<FarmerDeletionPreviewDto> {
    const { farmer, sessionIds, surveys, documentCollisionsCount, farmInfo } =
      await this.computeDeletionPlan(id);

    const surveyIds = surveys.map((s) => s.surveyId);
    const responsesCount = surveyIds.length
      ? await this.queryCount(
          'SELECT count(*)::int AS count FROM responses WHERE survey_id = ANY($1::uuid[])',
          [surveyIds],
        )
      : 0;

    const relationsCount = await this.queryCount(
      `SELECT
         (SELECT count(*) FROM farmers_technologies WHERE farmer_id = $1) +
         (SELECT count(*) FROM farmers_obstacles WHERE farmer_id = $1) +
         (SELECT count(*) FROM farmers_digital_funcionalities WHERE farmer_id = $1) +
         (SELECT count(*) FROM farmers_connections WHERE farmer_id = $1)
         AS count`,
      [id],
    );

    const changeRequestsCount = await this.queryCount(
      'SELECT count(*)::int AS count FROM change_requests WHERE farmer_id = $1',
      [id],
    );

    // Spec 78 — el borrado en cascada elimina también las constancias de
    // consentimiento del agricultor (derecho de supresión, Ley 1581/2012).
    const consentRecordsCount = await this.queryCount(
      'SELECT count(*)::int AS count FROM consent_records WHERE farmer_id = $1',
      [id],
    );

    return {
      farmerId: farmer.id,
      name: farmer.name,
      documentId: farmer.documentId,
      counts: {
        farms: farmInfo?.willBeDeleted ? 1 : 0,
        campaignSessions: sessionIds.length,
        surveys: surveyIds.length,
        responses: responsesCount,
        documentCollisions: documentCollisionsCount,
        relations: relationsCount,
        consentRecords: consentRecordsCount,
      },
      farm: farmInfo,
      preserved: { changeRequests: changeRequestsCount },
    };
  }

  async removeCascade(
    id: string,
    actor?: string,
  ): Promise<FarmerDeletionPreviewDto> {
    const { farmer, sessionIds, surveys, documentCollisionsCount, farmInfo } =
      await this.computeDeletionPlan(id);
    const surveyIds = surveys.map((s) => s.surveyId);

    await this.farmersRepository.manager.transaction(async (manager) => {
      // 1. Colisiones — RESTRICT, bloquean el borrado del agricultor.
      await manager.delete(FarmerDocumentCollision, {
        existingFarmer: { id },
      });

      // 2. Encuestas de ambos caminos. Arrastra `responses` por el CASCADE
      // declarado en `response.entity.ts` (FK real en Postgres).
      if (surveyIds.length) {
        await manager.delete(Survey, { surveyId: In(surveyIds) });
      }

      // 3. Sesiones de campaña del agricultor.
      if (sessionIds.length) {
        await manager.delete(CampaignSession, { sessionId: In(sessionIds) });
      }

      // 4. Relaciones M:M y conexiones — join tables sin repositorio propio.
      await manager.query(
        'DELETE FROM farmers_technologies WHERE farmer_id = $1',
        [id],
      );
      await manager.query(
        'DELETE FROM farmers_obstacles WHERE farmer_id = $1',
        [id],
      );
      await manager.query(
        'DELETE FROM farmers_digital_funcionalities WHERE farmer_id = $1',
        [id],
      );
      await manager.query(
        'DELETE FROM farmers_connections WHERE farmer_id = $1',
        [id],
      );

      // 5. Constancias de consentimiento (spec 78). El schema declara
      // ON DELETE CASCADE en consent_records.farmer_id, pero se borra aquí
      // de forma explícita — mismo criterio defensivo que el resto de esta
      // transacción, que no depende de que `synchronize` haya materializado
      // la FK con esa opción en todos los entornos.
      await manager.query('DELETE FROM consent_records WHERE farmer_id = $1', [
        id,
      ]);

      // 6. El agricultor.
      await manager.delete(Farmer, { id });

      // 7. La finca, solo si quedó sin otro agricultor que la referencie.
      if (farmInfo?.willBeDeleted) {
        await manager.delete(Farm, { farmId: farmInfo.farmId });
      }
    });

    this.logger.log(
      `Borrado en cascada: farmerId=${id} actor=${actor ?? 'desconocido'} ` +
        `sesiones=${sessionIds.length} encuestas=${surveyIds.length} ` +
        `colisiones=${documentCollisionsCount} ` +
        `finca=${farmInfo?.willBeDeleted ? farmInfo.farmId : 'conservada'}`,
    );

    return {
      farmerId: farmer.id,
      name: farmer.name,
      documentId: farmer.documentId,
      counts: {
        farms: farmInfo?.willBeDeleted ? 1 : 0,
        campaignSessions: sessionIds.length,
        surveys: surveyIds.length,
        responses: 0, // se calcula solo en el preview; el borrado no lo recuenta
        documentCollisions: documentCollisionsCount,
        relations: 0,
        consentRecords: 0, // idem: solo el preview lo recuenta
      },
      farm: farmInfo,
      preserved: { changeRequests: 0 },
    };
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
