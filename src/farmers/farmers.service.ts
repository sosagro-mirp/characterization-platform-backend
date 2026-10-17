import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, ILike, In, Repository } from 'typeorm';
import { Farmer } from './entities/farmer.entity';
import { FarmerDocumentCollision } from './entities/farmer-document-collision.entity';
import { Farm } from 'src/farms/entities/farm.entity';
import { Town } from 'src/towns/entities/town.entity';
import { CampaignSession } from 'src/campaign-sessions/entities/campaign-session.entity';
import { Survey } from 'src/surveys/entities/survey.entity';
import { CreateFarmerDto } from './dto/create-farmer.dto';
import { UpdateFarmerDto } from './dto/update-farmer.dto';
import {
  FarmDeletionInfo,
  FarmerDeletionPreviewDto,
} from './dto/deletion-preview.dto';
import { ConsentRecordsService } from '../consents/consent-records.service';
import { MediaCleanupService } from 'src/media-attachments/media-cleanup.service';
import {
  linkFarmerToFarm,
  promoteToPrimary,
} from 'src/farmer-farms/farm-links';
import {
  FARMER_VIEW_RELATIONS,
  toFarmerView,
} from 'src/farmer-farms/farm-views';
import { LinkFarmerFarmDto } from './dto/link-farmer-farm.dto';
import { UpdateFarmerFarmDto } from './dto/update-farmer-farm.dto';

// Spec 94 — `farm` (la principal, con `crops` derivado de los cultivos activos)
// y los vínculos para armar `farms[]`.
const FARMER_RELATIONS: string[] = [...FARMER_VIEW_RELATIONS];

/** Cultivos de finca que `search` necesita (activos y archivados, para filtrar). */
const SEARCH_FARM_CROPS_SELECT = {
  farmCropId: true,
  cropId: true,
  archivedAt: true,
  crop: { cropId: true, name: true },
} as const;

/** Vínculo productor–finca tal como lo devuelven `POST/PATCH /farmers/:id/farms`. */
export interface FarmerFarmLinkView {
  farmerId: string;
  farmId: string;
  role: string;
  isPrimary: boolean;
  source: string;
}

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
    // `@Optional()` solo para no romper las suites unitarias que arman este
    // servicio a mano; en la aplicación siempre está inyectado (spec 85).
    @Optional() private readonly mediaCleanup?: MediaCleanupService,
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

    // Spec 94 — finca, productor y vínculo principal (con espejo) en una
    // transacción: no puede quedar un productor con finca y sin vínculo.
    const farmerId = await this.farmersRepository.manager.transaction(
      async (manager) => {
        let farm: Farm | undefined;
        if (dto.farmName) {
          farm = await manager.save(
            Farm,
            manager.create(Farm, {
              name: dto.farmName,
              town,
              latitude: dto.latitude ?? null,
              longitude: dto.longitude ?? null,
              altitude: dto.altitude ?? null,
            }),
          );
        }

        const created = await manager.save(
          Farmer,
          manager.create(Farmer, {
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
        if (farm) {
          await linkFarmerToFarm(manager, {
            farmerId: created.id,
            farmId: farm.farmId,
            role: 'producer',
            isPrimary: true,
            source: 'admin',
          });
        }
        return created.id;
      },
    );

    return this.findOne(farmerId);
  }

  async search(query: string) {
    const farmers = await this.farmersRepository.find({
      select: {
        id: true,
        name: true,
        documentId: true,
        phone: true,
        farm: {
          farmId: true,
          name: true,
          town: { townId: true, name: true },
          farmCrops: SEARCH_FARM_CROPS_SELECT,
        },
        farmLinks: {
          farmerFarmId: true,
          role: true,
          isPrimary: true,
          createdAt: true,
          farm: {
            farmId: true,
            name: true,
            town: { townId: true, name: true },
            farmCrops: SEARCH_FARM_CROPS_SELECT,
          },
        },
      },
      relations: FARMER_RELATIONS,
      where: [
        { name: ILike(`%${query}%`) },
        { documentId: ILike(`%${query}%`) },
      ],
      take: 10,
    });
    // Endpoint @Public(): `farms[]` sin `vereda` (decisión del usuario 2026-10-14).
    return farmers.map((farmer) =>
      toFarmerView(farmer, { includeVereda: false }),
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Spec 94 — vínculo productor ↔ finca (N:M con rol). Sin desvincular
  // (D-H3-7: queda fuera de H3).
  // ─────────────────────────────────────────────────────────────────────────

  private async readLink(
    manager: EntityManager,
    farmerId: string,
    farmId: string,
  ): Promise<FarmerFarmLinkView | null> {
    const rows = await manager.query<
      {
        farmer_id: string;
        farm_id: string;
        role: string;
        is_primary: boolean;
        source: string;
      }[]
    >(
      `SELECT farmer_id, farm_id, role, is_primary, source
         FROM farmer_farms WHERE farmer_id = $1 AND farm_id = $2`,
      [farmerId, farmId],
    );
    const row = rows[0];
    if (!row) return null;
    return {
      farmerId: row.farmer_id,
      farmId: row.farm_id,
      role: row.role,
      isPrimary: row.is_primary,
      source: row.source,
    };
  }

  /** `POST /farmers/:id/farms` — 409 si el vínculo ya existe. */
  async linkFarm(
    farmerId: string,
    dto: LinkFarmerFarmDto,
  ): Promise<FarmerFarmLinkView> {
    const farmer = await this.farmersRepository.findOne({
      where: { id: farmerId },
    });
    if (!farmer) throw new NotFoundException('Farmer not found');
    const farm = await this.farmsRepository.findOne({
      where: { farmId: dto.farmId },
    });
    if (!farm) throw new NotFoundException('Farm not found');

    return this.farmersRepository.manager.transaction(async (manager) => {
      const result = await linkFarmerToFarm(manager, {
        farmerId,
        farmId: dto.farmId,
        role: dto.role ?? 'producer',
        isPrimary: dto.isPrimary,
        source: 'admin',
      });
      if (!result.created) {
        throw new ConflictException(
          'El productor ya está vinculado a esta finca',
        );
      }
      const link = await this.readLink(manager, farmerId, dto.farmId);
      return link as FarmerFarmLinkView;
    });
  }

  /** `PATCH /farmers/:id/farms/:farmId` — rol y/o finca principal. */
  async updateFarmLink(
    farmerId: string,
    farmId: string,
    dto: UpdateFarmerFarmDto,
  ): Promise<FarmerFarmLinkView> {
    return this.farmersRepository.manager.transaction(async (manager) => {
      // Mismo lock por productor que usa `linkFarmerToFarm`.
      await manager.query(`SELECT id FROM farmers WHERE id = $1 FOR UPDATE`, [
        farmerId,
      ]);
      const current = await this.readLink(manager, farmerId, farmId);
      if (!current) {
        throw new NotFoundException(
          'El productor no está vinculado a la finca',
        );
      }

      if (dto.isPrimary === false && current.isPrimary) {
        throw new BadRequestException(
          'No se puede quitar la finca principal sin designar otra: marque otra finca como principal',
        );
      }
      if (dto.role !== undefined && dto.role !== current.role) {
        await manager.query(
          `UPDATE farmer_farms SET role = $3, updated_at = now()
            WHERE farmer_id = $1 AND farm_id = $2`,
          [farmerId, farmId, dto.role],
        );
      }
      if (dto.isPrimary === true && !current.isPrimary) {
        await promoteToPrimary(manager, farmerId, farmId);
      }
      const updated = await this.readLink(manager, farmerId, farmId);
      return updated as FarmerFarmLinkView;
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
      Object.assign(toFarmerView(farmer), {
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
    return toFarmerView(farmer);
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
  //   sesiones → relaciones M:M/conexiones → vínculos de finca → agricultor →
  //   fincas exclusivas (spec 94: N:M, después de las encuestas por los RESTRICT)
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

    // Spec 94 — N:M. Una finca es "compartida" si otro productor tiene un
    // vínculo con ella (`farmer_farms`, o el espejo `farmers.farm_id`) o si
    // hay encuestas de OTRO productor ancladas a ella. Las encuestas de este
    // productor no cuentan: se borran antes que la finca.
    const surveyIds = surveys.map((s) => s.surveyId);
    const farmRows = await this.farmersRepository.manager.query<
      {
        farmId: string;
        name: string;
        isPrimary: boolean;
        shared: boolean;
      }[]
    >(
      `SELECT mine.farm_id AS "farmId", f.name AS name, mine.is_primary AS "isPrimary",
              (EXISTS (SELECT 1 FROM farmer_farms o
                        WHERE o.farm_id = mine.farm_id AND o.farmer_id <> $1)
               OR EXISTS (SELECT 1 FROM farmers m
                           WHERE m.farm_id = mine.farm_id AND m.id <> $1)
               OR EXISTS (SELECT 1 FROM surveys s
                           WHERE s.farm_id = mine.farm_id
                             AND NOT (s.survey_id = ANY($2::uuid[])))) AS shared
         FROM (SELECT ff.farm_id, ff.is_primary, ff.created_at
                 FROM farmer_farms ff WHERE ff.farmer_id = $1
               UNION ALL
               SELECT fr.farm_id, false, fr.created_at
                 FROM farmers fr
                WHERE fr.id = $1 AND fr.farm_id IS NOT NULL
                  AND NOT EXISTS (SELECT 1 FROM farmer_farms x
                                   WHERE x.farmer_id = $1 AND x.farm_id = fr.farm_id)
              ) mine
         JOIN farms f ON f.farm_id = mine.farm_id
        ORDER BY mine.is_primary DESC, mine.created_at ASC`,
      [id, surveyIds],
    );
    const farms: FarmDeletionInfo[] = farmRows.map((row) => ({
      farmId: row.farmId,
      name: row.name,
      shared: row.shared,
      willBeDeleted: !row.shared,
    }));
    // `farm` (contrato histórico) = la principal.
    const farmInfo: FarmerDeletionPreviewDto['farm'] =
      farms.find((f) => f.farmId === farmer.farm?.farmId) ?? farms[0] ?? null;

    return {
      farmer,
      sessionIds,
      surveys,
      documentCollisionsCount,
      farmInfo,
      farms,
    };
  }

  /** Ejecuta un `SELECT count(*) AS count ...` y devuelve el número, tipado. */
  private async queryCount(sql: string, params: unknown[]): Promise<number> {
    const rows = await this.farmersRepository.manager.query<
      { count: number | string }[]
    >(sql, params);
    return Number(rows[0]?.count ?? 0);
  }

  async getDeletionPreview(id: string): Promise<FarmerDeletionPreviewDto> {
    const {
      farmer,
      sessionIds,
      surveys,
      documentCollisionsCount,
      farmInfo,
      farms,
    } = await this.computeDeletionPlan(id);

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
        farms: farms.filter((f) => f.willBeDeleted).length,
        campaignSessions: sessionIds.length,
        surveys: surveyIds.length,
        responses: responsesCount,
        documentCollisions: documentCollisionsCount,
        relations: relationsCount,
        consentRecords: consentRecordsCount,
      },
      farm: farmInfo,
      farms,
      preserved: { changeRequests: changeRequestsCount },
    };
  }

  async removeCascade(
    id: string,
    actor?: string,
  ): Promise<FarmerDeletionPreviewDto> {
    const {
      farmer,
      sessionIds,
      surveys,
      documentCollisionsCount,
      farmInfo,
      farms,
    } = await this.computeDeletionPlan(id);
    const surveyIds = surveys.map((s) => s.surveyId);
    const farmsToDelete = farms.filter((f) => f.willBeDeleted);
    let mediaKeys: string[] = [];

    await this.farmersRepository.manager.transaction(async (manager) => {
      // 0. Claves de multimedia en R2, recolectadas ANTES de borrar las filas
      // de `media_attachments` (caen por CASCADE con la encuesta). El borrado
      // real en R2 ocurre después del commit (spec 85, D4).
      mediaKeys =
        (await this.mediaCleanup?.collectBySurveys(manager, surveyIds)) ?? [];

      // 1. Colisiones — RESTRICT, bloquean el borrado del agricultor.
      await manager.delete(FarmerDocumentCollision, {
        existingFarmer: { id },
      });

      // 1 bis. Alias de identidad provisional y discrepancias del productor y de
      // sus fincas (spec 95). El schema los borra por CASCADE; se borran aquí de
      // forma explícita, con el mismo criterio defensivo del resto.
      await manager.query(
        'DELETE FROM farmer_client_aliases WHERE farmer_id = $1',
        [id],
      );
      await manager.query(
        'DELETE FROM entity_field_discrepancies WHERE farmer_id = $1',
        [id],
      );

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

      // 6. Vínculos productor–finca (spec 94). El schema los borra por CASCADE
      // con el agricultor; se borran aquí de forma explícita, con el mismo
      // criterio defensivo del paso 5.
      await manager.query('DELETE FROM farmer_farms WHERE farmer_id = $1', [
        id,
      ]);

      // 7. El agricultor.
      await manager.delete(Farmer, { id });

      // 8. Las fincas que quedaron sin otro productor ni encuestas ajenas. Va
      // DESPUÉS de las encuestas (paso 2): `surveys.farm_id` y
      // `surveys.farm_crop_id` son RESTRICT (spec 94). Los cultivos de finca
      // y los lotes caen por CASCADE con la finca.
      for (const farm of farmsToDelete) {
        await manager.delete(Farm, { farmId: farm.farmId });
      }
    });

    const mediaObjects = (await this.mediaCleanup?.deleteAfterCommit(
      mediaKeys,
    )) ?? { deleted: 0, queued: 0 };

    this.logger.log(
      `Borrado en cascada: farmerId=${id} actor=${actor ?? 'desconocido'} ` +
        `sesiones=${sessionIds.length} encuestas=${surveyIds.length} ` +
        `colisiones=${documentCollisionsCount} ` +
        `multimedia=${mediaObjects.deleted} borrados/${mediaObjects.queued} en cola ` +
        `fincas borradas=${farmsToDelete.map((f) => f.farmId).join(',') || 'ninguna'} ` +
        `fincas conservadas=${farms.filter((f) => f.shared).length}`,
    );

    return {
      farmerId: farmer.id,
      name: farmer.name,
      documentId: farmer.documentId,
      counts: {
        farms: farmsToDelete.length,
        campaignSessions: sessionIds.length,
        surveys: surveyIds.length,
        responses: 0, // se calcula solo en el preview; el borrado no lo recuenta
        documentCollisions: documentCollisionsCount,
        relations: 0,
        consentRecords: 0, // idem: solo el preview lo recuenta
      },
      farm: farmInfo,
      farms,
      preserved: { changeRequests: 0 },
      mediaObjects,
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
