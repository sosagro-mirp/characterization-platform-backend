import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { ActorType } from 'src/actor-types/entities/actor-type.entity';
import { CampaignSession } from 'src/campaign-sessions/entities/campaign-session.entity';
import {
  normalizeDocumentId,
  selectFarmerByDocument,
} from 'src/farmers/document-id';
import { Farmer } from 'src/farmers/entities/farmer.entity';
import { FarmerDocumentCollision } from 'src/farmers/entities/farmer-document-collision.entity';
import { Farm } from 'src/farms/entities/farm.entity';
import {
  addFarmCrops,
  anchorSurvey,
  linkFarmerToFarm,
  listActiveFarmCrops,
} from 'src/farmer-farms/farm-links';
import type { FarmerFarmRole } from 'src/farmer-farms/entities/farmer-farm.entity';
import { pickFarmCrop } from 'src/farmer-farms/pick-farm-crop';
import { Survey } from 'src/surveys/entities/survey.entity';
import type { ExtractionStatus } from 'src/surveys/entities/survey.entity';
import { Town } from 'src/towns/entities/town.entity';
import { TypeOfCrop } from 'src/types-of-crops/entities/type-of-crop.entity';
import { DataSource, DeepPartial, EntityManager, IsNull } from 'typeorm';
import { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import { ROLES } from '../auth/constants';
import { ConsentRecordsService } from '../consents/consent-records.service';
import { resolveCropsFromResponses } from '../surveys/crop-extraction';
import {
  FARM_COMPLETABLE_FIELDS,
  FARMER_COMPLETABLE_FIELDS,
  FieldToComplete,
} from '../surveys/public-submission-plan';
import {
  buildSystemFieldMapWithWarnings,
  SystemFieldValue,
} from '../surveys/system-field-map';
import {
  DocumentCollisionError,
  upsertDocumentCollision,
} from './document-collision';
import {
  chooseFarm,
  FieldDiscrepancyCandidate,
  isExtractable,
  planFieldChanges,
  roleFromProfiles,
} from './extraction-plan';

export type ExtractionTrigger = 'batch' | 'alias' | 'public_process' | 'replay';

export interface ExtractOptions {
  trigger: ExtractionTrigger;
  /** Resolución explícita de una colisión de documento (spec 68). */
  resolution?: 'same_person' | 'separate_person';
  /** Decisión del administrador sobre la finca (canal público). */
  farmDecision?: { mode: 'create' | 'link'; farmId?: string } | null;
  /** Municipio que asigna el administrador cuando el envío no lo trae. */
  townId?: string;
  /** Rol del productor en la finca; por defecto el del perfil o `producer`. */
  role?: FarmerFarmRole;
  reviewedBy?: string;
  /** `false` en las llamadas internas para no re-extraer en cascada. */
  cascade?: boolean;
  /**
   * Solo la cascada: no toma `extract-farmer:<encuesta>` (el orden fijo de locks
   * ya tiene tomado `farmer:<id>` y pedir otra encuesta podría interbloquear).
   */
  skipSurveyLock?: boolean;
}

export interface ExtractionChanges {
  farmerCreated: boolean;
  farmCreated: boolean;
  farmLinked: boolean;
  farmerFieldsCompleted: string[];
  farmFieldsCompleted: string[];
  discrepanciesCreated: number;
  cropsAdded: string[];
}

export interface ExtractionResult {
  /** `null` cuando la encuesta no tiene respuestas y no se tocó nada. */
  status: ExtractionStatus | null;
  farmer: Farmer | null;
  existed: boolean;
  farm: Farm | null;
  farmCropId: string | null;
  crops: TypeOfCrop[];
  farmCrops: { farmCropId: string; cropId: string; name: string }[];
  role: FarmerFarmRole | null;
  changes: ExtractionChanges;
}

export interface SurveyExtractionView {
  status: ExtractionStatus | null;
  farmerId: string | null;
  farmerName: string | null;
  existed: boolean | null;
  clientFarmerId: string | null;
  farm: { farmId: string; name: string } | null;
  farmCropId: string | null;
  crops: { cropId: string; name: string }[];
  collision?: {
    documentId: string;
    submittedName: string;
    existingFarmer: { farmerId: string; name: string };
  };
  openDiscrepancies: number;
  extractedAt: string | null;
}

interface FarmerIdentity {
  respondentIsProducer: boolean;
  name?: string;
  phone?: string;
  email?: string;
  documentId?: string;
}

const emptyChanges = (): ExtractionChanges => ({
  farmerCreated: false,
  farmCreated: false,
  farmLinked: false,
  farmerFieldsCompleted: [],
  farmFieldsCompleted: [],
  discrepanciesCreated: 0,
  cropsAdded: [],
});

/**
 * Spec 95 — extracción unificada del productor, la finca y los cultivos.
 *
 * Una sola ruta, en el backend, idempotente y sin pisar valores (D-H3-B): la
 * disparan `POST /responses/batch` (`runForBatch`), el procesado público y los
 * alias `extract-farmer` / `extract-crops`. Siempre corre dentro de una
 * transacción que abre el llamador (`manager`).
 */
@Injectable()
export class FarmerExtractionService {
  private readonly logger = new Logger(FarmerExtractionService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly consentRecordsService: ConsentRecordsService,
  ) {}

  /**
   * `UPDATE … RETURNING` por `manager.query` devuelve `[filas, afectadas]` en
   * TypeORM (a diferencia de `SELECT`/`INSERT`): se normaliza a las filas.
   */
  private async updateReturning<T>(
    manager: EntityManager,
    sql: string,
    params: unknown[],
  ): Promise<T[]> {
    const raw = (await manager.query(sql, params)) as unknown;
    if (Array.isArray(raw) && raw.length === 2 && Array.isArray(raw[0])) {
      return raw[0] as T[];
    }
    return raw as T[];
  }

  // ── locks ────────────────────────────────────────────────────────────────

  /**
   * Lock por encuesta: dos llamadas concurrentes sobre la misma encuesta se
   * serializan; sobre encuestas distintas no se estorban. La cota evita que una
   * petición colgada retenga una conexión del pool indefinidamente (55P03).
   */
  async lockSurvey(manager: EntityManager, surveyId: string): Promise<void> {
    await this.advisoryLock(manager, `extract-farmer:${surveyId}`);
  }

  private async advisoryLock(
    manager: EntityManager,
    key: string,
  ): Promise<void> {
    await manager.query("SET LOCAL lock_timeout = '10s'");
    await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [key]);
  }

  // ── punto de enganche del batch ──────────────────────────────────────────

  /**
   * `POST /responses/batch`: extrae bajo un `SAVEPOINT` para que NINGÚN fallo de
   * la extracción escape al batch (C11). Colisión sin resolver → colisión
   * pendiente y `collision`; cualquier otro error → `error`.
   */
  async runForBatch(manager: EntityManager, surveyId: string): Promise<void> {
    await manager.query('SAVEPOINT farmer_extraction');
    try {
      await this.extract(manager, surveyId, { trigger: 'batch' });
      await manager.query('RELEASE SAVEPOINT farmer_extraction');
      return;
    } catch (err) {
      await manager.query('ROLLBACK TO SAVEPOINT farmer_extraction');
      await this.recordBatchFailure(manager, surveyId, err);
    }
  }

  private async recordBatchFailure(
    manager: EntityManager,
    surveyId: string,
    err: unknown,
  ): Promise<void> {
    await manager.query('SAVEPOINT farmer_extraction_status');
    try {
      if (err instanceof DocumentCollisionError) {
        await this.recordPendingCollision(manager, err);
      } else {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.error(
          `[extraction] batch extraction failed for survey=${surveyId}: ${message}`,
          err instanceof Error ? err.stack : undefined,
        );
        await manager.query(
          `UPDATE surveys SET extraction_status = 'error', extraction_error = $2, extracted_at = NULL WHERE survey_id = $1`,
          [surveyId, message.slice(0, 2000)],
        );
      }
      await manager.query('RELEASE SAVEPOINT farmer_extraction_status');
    } catch (secondary) {
      await manager.query('ROLLBACK TO SAVEPOINT farmer_extraction_status');
      this.logger.error(
        `[extraction] could not record the extraction outcome of survey=${surveyId}: ${
          secondary instanceof Error ? secondary.message : String(secondary)
        }`,
        secondary instanceof Error ? secondary.stack : undefined,
      );
    }
  }

  /** Deja la colisión pendiente (spec 68) y la encuesta en `collision`. */
  async recordPendingCollision(
    manager: EntityManager,
    err: DocumentCollisionError,
  ): Promise<void> {
    await upsertDocumentCollision(manager, {
      documentId: err.documentId,
      submittedName: err.submittedName,
      existingFarmer: err.existingFarmer,
      resolution: null,
      survey: { surveyId: err.surveyId } as Survey,
    });
    await manager.query(
      `UPDATE surveys SET extraction_status = 'collision', extraction_error = NULL, extracted_at = NULL WHERE survey_id = $1`,
      [err.surveyId],
    );
  }

  // ── extracción ───────────────────────────────────────────────────────────

  async extract(
    manager: EntityManager,
    surveyId: string,
    opts: ExtractOptions,
  ): Promise<ExtractionResult> {
    if (!opts.skipSurveyLock) await this.lockSurvey(manager, surveyId);

    const survey = await manager.findOne(Survey, {
      where: { surveyId },
      relations: [
        'responses',
        'responses.question',
        'responses.option',
        'campaignSession',
        'farmer',
      ],
    });
    if (!survey) throw new NotFoundException('Survey not found');

    const responses = survey.responses ?? [];
    const catalog = await manager.find(TypeOfCrop);
    const { crops } = resolveCropsFromResponses(responses, catalog);
    const changes = emptyChanges();

    // Sin respuestas (borrador huérfano, spec 70): no se extrae nada.
    if (responses.length === 0) {
      return this.buildResult(manager, survey, {
        status: null,
        farmer: survey.farmer ?? null,
        existed: !!survey.farmer,
        crops,
        changes,
      });
    }

    const session = survey.campaignSession
      ? await manager.findOne(CampaignSession, {
          where: { sessionId: survey.campaignSession.sessionId },
          relations: ['crops', 'farmer'],
        })
      : null;

    // Idempotencia: ya se extrajo de esta encuesta. Un reintento no repite el
    // trabajo, pero sí repara lo barato e idempotente (enlace de la sesión,
    // constancias huérfanas y anclaje a la finca principal).
    if (survey.extractionStatus === 'done' && survey.farmer) {
      await this.anchorToKnownFarm(manager, survey, survey.farmer.id);
      await this.propagate(manager, survey, session, survey.farmer, {
        opts,
        fromIdentity: false,
        changes,
      });
      return this.buildResult(manager, survey, {
        status: 'done',
        farmer: survey.farmer,
        existed: this.farmerExistedBefore(survey.farmer, survey),
        crops,
        changes,
      });
    }

    const { fieldMap } = buildSystemFieldMapWithWarnings(responses);
    const identity = this.pickFarmerIdentity(fieldMap);
    const extractable = isExtractable(responses);

    // ── productor ──────────────────────────────────────────────────────────
    let farmer: Farmer | null = survey.farmer ?? null;
    let existed = farmer !== null;
    let fromIdentity = false;
    let collisionWith: Farmer | null = null;

    if (!farmer && identity.name) {
      if (!identity.respondentIsProducer) {
        await this.persistRespondentData(manager, surveyId, fieldMap);
      }
      const documentKey = normalizeDocumentId(identity.documentId);
      if (documentKey) {
        // Dos encuestas distintas con el mismo documento nuevo no crean dos
        // productores: la segunda espera y encuentra al de la primera.
        await this.advisoryLock(manager, `farmer-doc:${documentKey}`);
      }
      const resolved = await this.resolveExistingFarmer(manager, {
        surveyId,
        documentId: identity.documentId,
        name: identity.name,
        phone: identity.phone,
        resolution: opts.resolution,
      });
      farmer = resolved.farmer;
      existed = resolved.existed;
      collisionWith = resolved.collisionWith;
      fromIdentity = true;

      if (!farmer) {
        farmer = await manager.save<Farmer>(
          manager.create(Farmer, {
            name: identity.name,
            documentId: identity.documentId ?? null,
            phone: identity.phone ?? null,
            email: identity.email ?? null,
            gender: (fieldMap['farmer.gender'] as string | undefined) ?? null,
            age: (fieldMap['farmer.age'] as number | undefined) ?? null,
            experienceYears:
              (fieldMap['farmer.experienceYears'] as number | undefined) ??
              null,
            isMainIncome:
              (fieldMap['farmer.isMainIncome'] as boolean | undefined) ?? null,
            educationLevel:
              (fieldMap['farmer.educationLevel'] as string | undefined) ?? null,
          }),
        );
        changes.farmerCreated = true;
      }
    }

    if (!farmer) {
      // Sin identidad propia: el productor conocido de la sesión o del alias.
      farmer = session?.farmer ?? null;
      if (!farmer && survey.clientFarmerId) {
        farmer = await this.findFarmerByAlias(manager, survey.clientFarmerId);
      }
      existed = farmer !== null;
    }

    if (!farmer) {
      const status: ExtractionStatus = !extractable
        ? 'not_applicable'
        : survey.clientFarmerId
          ? 'pending_alias'
          : 'no_identity';
      await this.markStatus(manager, surveyId, status);
      return this.buildResult(manager, survey, {
        status,
        farmer: null,
        existed: false,
        crops,
        changes,
      });
    }

    await this.advisoryLock(manager, `farmer:${farmer.id}`);
    // Otra extracción del mismo productor pudo completar campos mientras
    // esperábamos el lock: se relee para no decidir con datos obsoletos.
    if (!changes.farmerCreated) {
      farmer = await manager.findOneOrFail(Farmer, {
        where: { id: farmer.id },
      });
    }

    // ── encuesta sin nada que extraer: solo se ancla al productor conocido ──
    if (!extractable) {
      await anchorSurvey(manager, surveyId, {
        ...(survey.farmer ? {} : { farmerId: farmer.id }),
      });
      await this.anchorToKnownFarm(manager, survey, farmer.id);
      await this.propagate(manager, survey, session, farmer, {
        opts,
        fromIdentity,
        changes,
      });
      await this.markStatus(manager, surveyId, 'not_applicable');
      return this.buildResult(manager, survey, {
        status: 'not_applicable',
        farmer,
        existed,
        crops,
        changes,
      });
    }

    // ── finca ──────────────────────────────────────────────────────────────
    const town = await this.resolveTown(
      manager,
      responses,
      session?.sessionId ?? null,
      opts.townId,
    );
    const submittedFarmName =
      (fieldMap['farm.name'] as string | undefined) ?? null;
    const farmValues = await this.submittedFarmValues(
      manager,
      fieldMap,
      town?.townId ?? null,
      session?.sessionId ?? null,
    );
    const responseIdBySystemField = new Map<string, string>();
    for (const r of responses) {
      const sf = r.question?.systemField;
      if (sf && !responseIdBySystemField.has(sf)) {
        responseIdBySystemField.set(sf, r.responseId);
      }
    }

    const farmerFarms = await this.listFarmerFarms(manager, farmer.id);
    const choice = chooseFarm({
      anchoredFarmId: survey.farmId ?? null,
      farms: farmerFarms,
      submittedName: submittedFarmName,
      origin: survey.origin === 'public' ? 'public' : 'field',
      decision: opts.farmDecision ?? null,
    });

    const profiles = await this.respondentProfiles(manager, responses);
    const role: FarmerFarmRole = opts.role ?? roleFromProfiles(profiles);
    const linkSource =
      opts.trigger === 'public_process' ? 'public_process' : 'extraction';

    const discrepancies: {
      entityType: 'farmer' | 'farm';
      farmerId: string | null;
      farmId: string | null;
      candidate: FieldDiscrepancyCandidate;
    }[] = [];

    // Productor existente: completa vacíos y registra diferencias.
    if (!changes.farmerCreated) {
      const farmerPlan = planFieldChanges(
        'farmer',
        this.pickValues(farmer, FARMER_COMPLETABLE_FIELDS),
        this.submittedFarmerValues(fieldMap, identity),
      );
      await this.applyCompletion(
        manager,
        'farmer',
        farmer.id,
        farmerPlan.complete,
        null,
      );
      changes.farmerFieldsCompleted.push(
        ...farmerPlan.complete.map((f) => f.field),
      );
      for (const candidate of farmerPlan.discrepancies) {
        discrepancies.push({
          entityType: 'farmer',
          farmerId: farmer.id,
          farmId: null,
          candidate,
        });
      }
    }

    let farm: Farm | null = null;
    if (choice.action === 'create') {
      const values = { ...farmValues };
      delete values.townId;
      farm = await manager.save<Farm>(
        manager.create(Farm, {
          ...(values as DeepPartial<Farm>),
          name: submittedFarmName!,
          location: null,
          town: town ?? undefined,
        }),
      );
      await linkFarmerToFarm(manager, {
        farmerId: farmer.id,
        farmId: farm.farmId,
        role,
        source: linkSource,
      });
      changes.farmCreated = true;
    } else if (choice.action === 'link') {
      farm = await manager.findOne(Farm, { where: { farmId: choice.farmId! } });
      if (!farm) throw new NotFoundException('Farm not found');
      await linkFarmerToFarm(manager, {
        farmerId: farmer.id,
        farmId: farm.farmId,
        role,
        source: linkSource,
      });
      changes.farmLinked = true;
    } else if (choice.farmId) {
      farm = await manager.findOne(Farm, {
        where: { farmId: choice.farmId },
        relations: ['town'],
      });
      if (!farm) throw new NotFoundException('Farm not found');
      if (choice.nameDiffers) {
        // D-H3-2: no se crea otra finca ni se completan sus campos; solo se
        // deja constancia de que el envío trae otro nombre.
        discrepancies.push({
          entityType: 'farm',
          farmerId: null,
          farmId: farm.farmId,
          candidate: {
            entity: 'farm',
            field: 'name',
            systemField: 'farm.name',
            currentValue: farm.name,
            submittedValue: submittedFarmName,
          },
        });
      } else {
        const farmPlan = planFieldChanges(
          'farm',
          {
            ...this.pickValues(farm, FARM_COMPLETABLE_FIELDS),
            townId: farm.town?.townId ?? null,
          },
          farmValues,
        );
        await this.applyCompletion(
          manager,
          'farm',
          farm.farmId,
          farmPlan.complete,
          town,
        );
        changes.farmFieldsCompleted.push(
          ...farmPlan.complete.map((f) => f.field),
        );
        for (const candidate of farmPlan.discrepancies) {
          discrepancies.push({
            entityType: 'farm',
            farmerId: null,
            farmId: farm.farmId,
            candidate,
          });
        }
      }
    }

    changes.discrepanciesCreated += await this.recordDiscrepancies(
      manager,
      surveyId,
      discrepancies,
      responseIdBySystemField,
    );

    // ── cultivos ───────────────────────────────────────────────────────────
    let farmCrops: { farmCropId: string; cropId: string; name: string }[] = [];
    let farmCropId: string | null = survey.farmCropId ?? null;
    const previousSessionCropIds = (session?.crops ?? []).map((c) => c.cropId);
    if (session && crops.length > 0) {
      // `campaign_sessions_crops` se sigue escribiendo como hoy: las
      // condiciones de paso de la campaña lo leen hasta H8.
      session.crops = crops;
      await manager.save(CampaignSession, session);
    }
    if (farm) {
      const before = new Set(
        (await listActiveFarmCrops(manager, farm.farmId)).map((c) => c.cropId),
      );
      const added = await addFarmCrops(
        manager,
        farm.farmId,
        crops.map((c) => c.cropId),
      );
      changes.cropsAdded = added
        .map((c) => c.cropId)
        .filter((id) => !before.has(id));
      const nameOf = new Map(crops.map((c) => [c.cropId, c.name]));
      farmCrops = added.map((c) => ({
        farmCropId: c.farmCropId,
        cropId: c.cropId,
        name: nameOf.get(c.cropId) ?? '',
      }));
      if (!farmCropId) {
        const active = await listActiveFarmCrops(manager, farm.farmId);
        // Un `cropId` explícito de POST /surveys manda: se ancla al cultivo de
        // finca de ese cultivo y, si la finca no lo tiene, no se ancla ninguno
        // (el `crop_id` del cliente se conserva).
        const [{ crop_id: explicitCropId }] = await manager.query<
          { crop_id: string | null }[]
        >('SELECT crop_id FROM surveys WHERE survey_id = $1', [surveyId]);
        farmCropId = explicitCropId
          ? (active.find((a) => a.cropId === explicitCropId)?.farmCropId ??
            null)
          : (pickFarmCrop(active, [
              crops.map((c) => c.cropId),
              previousSessionCropIds,
            ]).farmCropId ?? null);
      }
    }

    await anchorSurvey(manager, surveyId, {
      // Solo se completa; nunca se cambia el productor de una encuesta.
      ...(survey.farmer ? {} : { farmerId: farmer.id }),
      ...(farm ? { farmId: farm.farmId } : {}),
      ...(farm && farmCropId ? { farmCropId } : {}),
    });

    await this.propagate(manager, survey, session, farmer, {
      opts,
      fromIdentity,
      changes,
    });

    // Una resolución declarada sobre una colisión ya avisada se registra como
    // resuelta (crea la fila si esta es la única llamada, sin 409 previo).
    if (collisionWith && opts.resolution && identity.name) {
      await upsertDocumentCollision(manager, {
        documentId: identity.documentId!,
        submittedName: identity.name,
        existingFarmer: collisionWith,
        resolution: opts.resolution,
        survey,
      });
    }

    await this.markStatus(manager, surveyId, 'done');
    return {
      ...(await this.buildResult(manager, survey, {
        status: 'done',
        farmer,
        existed,
        crops,
        changes,
        farmId: farm?.farmId ?? null,
        farmCropId,
        farmCrops,
        role,
      })),
    };
  }

  // ── piezas ───────────────────────────────────────────────────────────────

  private async markStatus(
    manager: EntityManager,
    surveyId: string,
    status: ExtractionStatus,
  ): Promise<void> {
    await manager.query(
      `UPDATE surveys SET extraction_status = $2, extraction_error = NULL, extracted_at = now() WHERE survey_id = $1`,
      [surveyId, status],
    );
  }

  private async buildResult(
    manager: EntityManager,
    survey: Survey,
    r: {
      status: ExtractionStatus | null;
      farmer: Farmer | null;
      existed: boolean;
      crops: TypeOfCrop[];
      changes: ExtractionChanges;
      farmId?: string | null;
      farmCropId?: string | null;
      farmCrops?: { farmCropId: string; cropId: string; name: string }[];
      role?: FarmerFarmRole | null;
    },
  ): Promise<ExtractionResult> {
    const farmId =
      r.farmId !== undefined
        ? r.farmId
        : ((
            await manager.query<{ farm_id: string | null }[]>(
              'SELECT farm_id FROM surveys WHERE survey_id = $1',
              [survey.surveyId],
            )
          )[0]?.farm_id ?? null);
    const farm = farmId
      ? await manager.findOne(Farm, { where: { farmId } })
      : null;
    return {
      status: r.status,
      farmer: r.farmer,
      existed: r.existed,
      farm,
      farmCropId: r.farmCropId ?? survey.farmCropId ?? null,
      crops: r.crops,
      farmCrops: r.farmCrops ?? [],
      role: r.role ?? null,
      changes: r.changes,
    };
  }

  /** El productor ya existía cuando se creó la encuesta (no salió de ella). */
  private farmerExistedBefore(farmer: Farmer, survey: Survey): boolean {
    return farmer.createdAt.getTime() < survey.createdAt.getTime();
  }

  /** Ancla la encuesta a la finca del productor si aún no tiene una. */
  private async anchorToKnownFarm(
    manager: EntityManager,
    survey: Survey,
    farmerId: string,
  ): Promise<void> {
    const [row] = await manager.query<{ farm_id: string | null }[]>(
      'SELECT farm_id FROM surveys WHERE survey_id = $1',
      [survey.surveyId],
    );
    if (row?.farm_id) return;
    const farms = await this.listFarmerFarms(manager, farmerId);
    const principal = farms.find((f) => f.isPrimary) ?? farms[0];
    if (!principal) return;
    await anchorSurvey(manager, survey.surveyId, {
      farmerId,
      farmId: principal.farmId,
    });
  }

  /**
   * Enlaces que dependen del productor ya resuelto: sesión, encuestas hermanas,
   * constancias de consentimiento, alias provisional y encuestas que esperaban
   * ese alias. Todo idempotente.
   */
  private async propagate(
    manager: EntityManager,
    survey: Survey,
    session: CampaignSession | null,
    farmer: Farmer,
    ctx: {
      opts: ExtractOptions;
      fromIdentity: boolean;
      changes: ExtractionChanges;
    },
  ): Promise<void> {
    const { opts } = ctx;
    const cascade = opts.cascade !== false;
    const waiting: string[] = [];

    if (session) {
      if (ctx.fromIdentity && session.farmer?.id !== farmer.id) {
        await manager.update(
          CampaignSession,
          { sessionId: session.sessionId },
          { farmer },
        );
      }
      const siblings = await this.updateReturning<{
        survey_id: string;
        extraction_status: string | null;
      }>(
        manager,
        `UPDATE surveys SET farmer_id = $1
          WHERE campaign_session_id = $2 AND farmer_id IS NULL AND survey_id <> $3
            AND (extraction_status IS NULL OR extraction_status IN ('no_identity', 'pending_alias'))
        RETURNING survey_id, extraction_status`,
        [farmer.id, session.sessionId, survey.surveyId],
      );
      waiting.push(
        ...siblings
          .filter((s) => s.extraction_status !== null)
          .map((s) => s.survey_id),
      );
      await this.safeConsentLink(manager, `session=${session.sessionId}`, () =>
        this.consentRecordsService.linkOrphansToFarmer(
          session.sessionId,
          farmer.id,
          manager,
        ),
      );
    }

    await this.safeConsentLink(manager, `survey=${survey.surveyId}`, () =>
      this.consentRecordsService.linkOrphansToFarmerBySurvey(
        survey.surveyId,
        farmer.id,
        manager,
      ),
    );

    if (survey.clientFarmerId) {
      await manager.query(
        `INSERT INTO farmer_client_aliases (client_farmer_id, farmer_id, survey_id)
         VALUES ($1, $2, $3) ON CONFLICT (client_farmer_id) DO NOTHING`,
        [survey.clientFarmerId, farmer.id, survey.surveyId],
      );
      const byAlias = await this.updateReturning<{ survey_id: string }>(
        manager,
        `UPDATE surveys SET farmer_id = $1
          WHERE client_farmer_id = $2 AND farmer_id IS NULL AND survey_id <> $3
            AND (extraction_status IS NULL OR extraction_status IN ('no_identity', 'pending_alias'))
        RETURNING survey_id`,
        [farmer.id, survey.clientFarmerId, survey.surveyId],
      );
      waiting.push(...byAlias.map((s) => s.survey_id));
    }

    if (cascade) {
      for (const id of [...new Set(waiting)].filter(Boolean)) {
        await this.safeConsentLink(manager, `survey=${id}`, () =>
          this.consentRecordsService.linkOrphansToFarmerBySurvey(
            id,
            farmer.id,
            manager,
          ),
        );
        await this.extract(manager, id, {
          trigger: opts.trigger,
          cascade: false,
          skipSurveyLock: true,
        });
      }
    }
  }

  /**
   * Mejor esfuerzo bajo `SAVEPOINT` (spec 78, B4 / spec 84): un fallo del
   * backfill de constancias no debe abortar la transacción ni la extracción.
   */
  private async safeConsentLink(
    manager: EntityManager,
    label: string,
    run: () => Promise<void>,
  ): Promise<void> {
    await manager.query('SAVEPOINT consent_backfill');
    try {
      await run();
      await manager.query('RELEASE SAVEPOINT consent_backfill');
    } catch (err) {
      await manager.query('ROLLBACK TO SAVEPOINT consent_backfill');
      this.logger.error(
        `[extraction] failed to link orphan consent records for ${label}: ${
          err instanceof Error ? err.message : String(err)
        }`,
        err instanceof Error ? err.stack : undefined,
      );
    }
  }

  private async findFarmerByAlias(
    manager: EntityManager,
    clientFarmerId: string,
  ): Promise<Farmer | null> {
    const rows = await manager.query<{ farmer_id: string }[]>(
      'SELECT farmer_id FROM farmer_client_aliases WHERE client_farmer_id = $1',
      [clientFarmerId],
    );
    if (!rows[0]) return null;
    return manager.findOne(Farmer, { where: { id: rows[0].farmer_id } });
  }

  /** Fincas del productor, la principal primero; cae al espejo `farmers.farm_id`. */
  private async listFarmerFarms(
    manager: EntityManager,
    farmerId: string,
  ): Promise<{ farmId: string; name: string; isPrimary: boolean }[]> {
    const links = await manager.query<
      { farmId: string; name: string; isPrimary: boolean }[]
    >(
      `SELECT ff.farm_id AS "farmId", f.name AS name, ff.is_primary AS "isPrimary"
         FROM farmer_farms ff JOIN farms f ON f.farm_id = ff.farm_id
        WHERE ff.farmer_id = $1
        ORDER BY ff.is_primary DESC, ff.created_at ASC`,
      [farmerId],
    );
    if (links.length > 0) return links;
    const mirror = await manager.query<{ farmId: string; name: string }[]>(
      `SELECT f.farm_id AS "farmId", f.name AS name
         FROM farmers fr JOIN farms f ON f.farm_id = fr.farm_id
        WHERE fr.id = $1`,
      [farmerId],
    );
    return mirror.map((m) => ({ ...m, isPrimary: true }));
  }

  private pickValues(
    source: object,
    fields: readonly string[],
  ): Record<string, unknown> {
    const record = source as Record<string, unknown>;
    return Object.fromEntries(fields.map((f) => [f, record[f] ?? null]));
  }

  private submittedFarmerValues(
    fieldMap: Record<string, SystemFieldValue>,
    identity: FarmerIdentity,
  ): Record<string, unknown> {
    return {
      phone: identity.phone,
      email: identity.email,
      gender: fieldMap['farmer.gender'],
      age: fieldMap['farmer.age'],
      experienceYears: fieldMap['farmer.experienceYears'],
      isMainIncome: fieldMap['farmer.isMainIncome'],
      educationLevel: fieldMap['farmer.educationLevel'],
    };
  }

  /**
   * Valores de la finca que trae el envío. Spec 95 (D-H3-10): la vereda que la
   * encuesta no trae se toma de otra encuesta de la misma sesión.
   */
  private async submittedFarmValues(
    manager: EntityManager,
    fieldMap: Record<string, SystemFieldValue>,
    townId: string | null,
    sessionId: string | null,
  ): Promise<Record<string, unknown>> {
    let vereda: SystemFieldValue | undefined = fieldMap['farm.vereda'];
    if (vereda === undefined && sessionId) {
      vereda =
        (await this.siblingTextValue(manager, sessionId, 'farm.vereda')) ??
        undefined;
    }
    return {
      vereda,
      corregimiento: fieldMap['farm.corregimiento'],
      latitude: fieldMap['farm.latitude'],
      longitude: fieldMap['farm.longitude'],
      altitude: fieldMap['farm.altitude'],
      area: fieldMap['farm.area'],
      waterAccess: fieldMap['farm.waterAccess'],
      internetAccess: fieldMap['farm.internetAccess'],
      hasElectricityAccess: fieldMap['farm.hasElectricityAccess'],
      mainAccessType: fieldMap['farm.mainAccessType'],
      electricitySourceType: fieldMap['farm.electricitySourceType'],
      waterSourceType: fieldMap['farm.waterSourceType'],
      plotCount: fieldMap['farm.plotCount'],
      townId,
    };
  }

  private async siblingTextValue(
    manager: EntityManager,
    sessionId: string,
    systemField: string,
  ): Promise<string | null> {
    const rows = await manager.query<{ text_value: string | null }[]>(
      `SELECT r.text_value
         FROM responses r
         JOIN surveys s ON s.survey_id = r.survey_id
         JOIN questions q ON q.question_id = r.question_id
        WHERE s.campaign_session_id = $1 AND q.system_field = $2
          AND r.text_value IS NOT NULL AND btrim(r.text_value) <> ''
        LIMIT 1`,
      [sessionId, systemField],
    );
    return rows[0]?.text_value ?? null;
  }

  /**
   * Municipio: el de la propia encuesta (por el `metadataId` de su opción), el
   * de otra encuesta de la sesión y, por último, el que indicó el administrador.
   */
  private async resolveTown(
    manager: EntityManager,
    responses: Survey['responses'],
    sessionId: string | null,
    adminTownId?: string,
  ): Promise<Town | null> {
    const ownMetadataId = responses.find(
      (r) => r.question?.systemField === 'farm.town',
    )?.option?.metadataId;
    let metadataId: string | null | undefined = ownMetadataId;
    if (!metadataId && sessionId) {
      const rows = await manager.query<{ metadata_id: string }[]>(
        `SELECT o.metadata_id
           FROM responses r
           JOIN surveys s ON s.survey_id = r.survey_id
           JOIN questions q ON q.question_id = r.question_id
           JOIN options_question o ON o.option_id = r.option_id
          WHERE s.campaign_session_id = $1 AND q.system_field = 'farm.town'
            AND o.metadata_id IS NOT NULL
          LIMIT 1`,
        [sessionId],
      );
      metadataId = rows[0]?.metadata_id;
    }
    if (metadataId) {
      const town = await manager.findOne(Town, {
        where: { townId: metadataId },
      });
      if (town) return town;
      this.logger.warn(
        `Town not found for metadataId=${metadataId} — farm.town left null`,
      );
    }
    if (adminTownId) {
      const town = await manager.findOne(Town, {
        where: { townId: adminTownId },
      });
      if (!town) throw new NotFoundException('Town not found');
      return town;
    }
    return null;
  }

  private async respondentProfiles(
    manager: EntityManager,
    responses: Survey['responses'],
  ): Promise<{ optionText: string; actorType: string }[]> {
    const withMetadata = responses.filter((r) => r.option?.metadataId);
    if (withMetadata.length === 0) return [];
    const actorTypes = new Map(
      (await manager.find(ActorType)).map((a) => [a.actorTypeId, a.name]),
    );
    return withMetadata.flatMap((r) => {
      const actorType = actorTypes.get(r.option!.metadataId!);
      return actorType && r.option
        ? [{ optionText: r.option.text, actorType }]
        : [];
    });
  }

  private async applyCompletion(
    manager: EntityManager,
    entity: 'farmer' | 'farm',
    id: string,
    fields: FieldToComplete[],
    town: Town | null,
  ): Promise<void> {
    if (fields.length === 0) return;
    const patch: Record<string, unknown> = {};
    for (const { field, value } of fields) {
      if (field === 'townId') patch.town = town;
      else patch[field] = value;
    }
    if (entity === 'farmer') {
      await manager.update(Farmer, id, patch as QueryDeepPartialEntity<Farmer>);
    } else {
      await manager.update(Farm, id, patch as QueryDeepPartialEntity<Farm>);
    }
  }

  private async recordDiscrepancies(
    manager: EntityManager,
    surveyId: string,
    items: {
      entityType: 'farmer' | 'farm';
      farmerId: string | null;
      farmId: string | null;
      candidate: FieldDiscrepancyCandidate;
    }[],
    responseIdBySystemField: Map<string, string>,
  ): Promise<number> {
    let created = 0;
    for (const item of items) {
      const { candidate } = item;
      const rows = await manager.query<{ discrepancy_id: string }[]>(
        `INSERT INTO entity_field_discrepancies
           (entity_type, farmer_id, farm_id, field, system_field, current_value, submitted_value, survey_id, response_id)
         SELECT $1::varchar, $2::uuid, $3::uuid, $4::varchar, $5::varchar, $6::jsonb, $7::jsonb, $8::uuid, $9::uuid
          WHERE NOT EXISTS (
            SELECT 1 FROM entity_field_discrepancies d
             WHERE d.entity_type = $1::varchar AND d.survey_id = $8::uuid AND d.field = $4::varchar
               AND COALESCE(d.farmer_id, d.farm_id) = COALESCE($2::uuid, $3::uuid))
         RETURNING discrepancy_id`,
        [
          item.entityType,
          item.farmerId,
          item.farmId,
          candidate.field,
          candidate.systemField,
          JSON.stringify(candidate.currentValue ?? null),
          JSON.stringify(candidate.submittedValue ?? null),
          surveyId,
          candidate.systemField
            ? (responseIdBySystemField.get(candidate.systemField) ?? null)
            : null,
        ],
      );
      created += rows.length;
    }
    return created;
  }

  // ── identidad (spec 68) ──────────────────────────────────────────────────

  /**
   * Quién es el respondiente y con qué datos se identifica. Q9 = false (otros
   * instrumentos): el productor es otra persona y se usan sus campos; si faltan
   * nombre o documento se toman provisionalmente los del respondiente.
   */
  pickFarmerIdentity(
    fieldMap: Record<string, SystemFieldValue>,
  ): FarmerIdentity {
    const str = (key: string): string | undefined => {
      const value = fieldMap[key];
      return value === undefined ? undefined : String(value);
    };
    // undefined: Q9 no estaba en el instrumento → se trata como true.
    const respondentIsProducer = fieldMap['farmer.isRespondent'] !== false;
    if (respondentIsProducer) {
      return {
        respondentIsProducer,
        name: str('farmer.name'),
        phone: str('farmer.phone'),
        email: str('farmer.email'),
        documentId: str('farmer.documentId'),
      };
    }
    return {
      respondentIsProducer,
      name: str('farmer.producerName') || str('farmer.name'),
      phone: str('farmer.producerPhone'),
      email: str('farmer.producerEmail'),
      documentId: str('farmer.producerDocumentId') || str('farmer.documentId'),
    };
  }

  /** Q9 = false: guarda los datos del respondiente en la encuesta. */
  async persistRespondentData(
    manager: EntityManager,
    surveyId: string,
    fieldMap: Record<string, SystemFieldValue>,
  ): Promise<void> {
    await manager.update(Survey, surveyId, {
      respondentName:
        (fieldMap['farmer.name'] as string | undefined) || undefined,
      respondentPhone:
        (fieldMap['farmer.phone'] as string | undefined) || undefined,
      respondentDocumentId:
        (fieldMap['farmer.documentId'] as string | undefined) || undefined,
      respondentEmail:
        (fieldMap['farmer.email'] as string | undefined) || undefined,
    });
  }

  /**
   * Spec 93 (D-H2-8) — el documento se compara normalizado (sin puntos,
   * espacios ni guiones; lo guardado no se reescribe) y con orden determinista:
   * el más antiguo primero, con el id como desempate.
   */
  async findFarmersByDocument(
    manager: EntityManager,
    documentKey: string,
    withFarm = false,
  ): Promise<Farmer[]> {
    const qb = manager
      .createQueryBuilder(Farmer, 'f')
      .where(
        "regexp_replace(f.document_id, '[.\\s-]', '', 'g') = :documentKey",
        {
          documentKey,
        },
      )
      .orderBy('f.createdAt', 'ASC')
      .addOrderBy('f.id', 'ASC');
    if (withFarm) {
      qb.leftJoinAndSelect('f.farm', 'farm').leftJoinAndSelect(
        'farm.town',
        'farmTown',
      );
    }
    return qb.getMany();
  }

  /**
   * Dedup por documento y luego por nombre + teléfono. Con varios productores
   * del mismo documento prefiere al que coincide en nombre. Lanza
   * `DocumentCollisionError` ante una colisión sin resolución; con
   * `separate_person` fuerza la creación de un productor nuevo (también se
   * omite el nivel 2, que reutilizaría en silencio a otro por nombre +
   * teléfono y contradiría la decisión explícita, spec 68 criterio 5).
   */
  async resolveExistingFarmer(
    manager: EntityManager,
    params: {
      surveyId: string;
      documentId?: string;
      name: string;
      phone?: string;
      resolution?: 'same_person' | 'separate_person';
    },
  ): Promise<{
    farmer: Farmer | null;
    existed: boolean;
    collisionWith: Farmer | null;
  }> {
    let farmer: Farmer | null = null;
    let collisionWith: Farmer | null = null;

    const documentKey = normalizeDocumentId(params.documentId);
    if (documentKey) {
      const candidates = await this.findFarmersByDocument(manager, documentKey);
      const selection = selectFarmerByDocument(candidates, params.name);
      if (selection.match) {
        farmer = selection.match;
      } else if (selection.collisionWith) {
        collisionWith = selection.collisionWith;
        if (params.resolution === 'same_person') {
          farmer = collisionWith;
        } else if (params.resolution !== 'separate_person') {
          throw new DocumentCollisionError(
            params.surveyId,
            params.documentId!,
            params.name,
            collisionWith,
          );
        }
      }
    }

    if (!farmer && params.phone && params.resolution !== 'separate_person') {
      farmer = await manager.findOne(Farmer, {
        where: { name: params.name, phone: params.phone },
        order: { createdAt: 'ASC', id: 'ASC' },
      });
    }

    return { farmer, existed: farmer !== null, collisionWith };
  }

  // ── lectura ──────────────────────────────────────────────────────────────

  /**
   * `GET /surveys/:id/extraction`. Un POLLSTER solo ve las suyas: 404, no 403,
   * para no revelar que una encuesta ajena existe (spec 92).
   */
  async getSurveyExtraction(
    surveyId: string,
    requester: AuthenticatedUser,
  ): Promise<SurveyExtractionView> {
    const manager = this.dataSource.manager;
    const survey = await manager.findOne(Survey, {
      where: { surveyId },
      relations: [
        'user',
        'farmer',
        'farm',
        'responses',
        'responses.question',
        'responses.option',
      ],
    });
    if (!survey) throw new NotFoundException('Survey not found');
    if (
      requester.role === ROLES.POLLSTER &&
      survey.user?.userId !== requester.userId
    ) {
      throw new NotFoundException('Survey not found');
    }

    const status: ExtractionStatus | null =
      survey.extractionStatus ??
      (survey.origin === 'public' && survey.reviewStatus === 'pending'
        ? 'awaiting_review'
        : null);

    const { crops } = resolveCropsFromResponses(
      survey.responses ?? [],
      await manager.find(TypeOfCrop),
    );

    const view: SurveyExtractionView = {
      status,
      farmerId: survey.farmer?.id ?? null,
      farmerName: survey.farmer?.name ?? null,
      existed: survey.farmer
        ? this.farmerExistedBefore(survey.farmer, survey)
        : null,
      clientFarmerId: survey.clientFarmerId ?? null,
      farm: survey.farm
        ? { farmId: survey.farm.farmId, name: survey.farm.name }
        : null,
      farmCropId: survey.farmCropId ?? null,
      crops: crops.map((c) => ({ cropId: c.cropId, name: c.name })),
      openDiscrepancies: Number(
        (
          await manager.query<{ n: string }[]>(
            `SELECT COUNT(*)::text AS n FROM entity_field_discrepancies WHERE survey_id = $1 AND status = 'open'`,
            [surveyId],
          )
        )[0].n,
      ),
      extractedAt: survey.extractedAt ? survey.extractedAt.toISOString() : null,
    };

    const pending = await manager.findOne(FarmerDocumentCollision, {
      where: { survey: { surveyId }, resolution: IsNull() },
      relations: ['existingFarmer'],
      order: { createdAt: 'DESC' },
    });
    if (pending && !survey.farmer) {
      view.collision = {
        documentId: pending.documentId,
        submittedName: pending.submittedName,
        existingFarmer: {
          farmerId: pending.existingFarmer.id,
          name: pending.existingFarmer.name,
        },
      };
    }
    return view;
  }
}
