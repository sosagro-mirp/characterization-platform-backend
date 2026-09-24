import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ActorType } from 'src/actor-types/entities/actor-type.entity';
import { CampaignSession } from 'src/campaign-sessions/entities/campaign-session.entity';
import { Department } from 'src/departments/entities/department.entity';
import { Farm } from 'src/farms/entities/farm.entity';
import { Farmer } from 'src/farmers/entities/farmer.entity';
import { FarmerDocumentCollision } from 'src/farmers/entities/farmer-document-collision.entity';
import {
  normalizeDocumentId,
  selectFarmerByDocument,
} from 'src/farmers/document-id';
import { Instrument } from 'src/instruments/entities/instrument.entity';
import { Response } from 'src/responses/entities/response.entity';
import { Town } from 'src/towns/entities/town.entity';
import { TypeOfCrop } from 'src/types-of-crops/entities/type-of-crop.entity';
import { User } from 'src/users/entities/user.entity';
import { DeepPartial, EntityManager, In, Repository } from 'typeorm';
import { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';
import { resolveCropsFromResponses } from './crop-extraction';
import { CreateSurveyDto } from './dto/create-survey.dto';
import { ExtractFarmerDto } from './dto/extract-farmer.dto';
import { OverwriteSurveyDto } from './dto/overwrite-survey.dto';
import { ProcessPublicSubmissionDto } from './dto/process-public-submission.dto';
import { SkipStepDto } from './dto/skip-step.dto';
import { Survey } from './entities/survey.entity';
import {
  buildPublicSubmissionPlan,
  completeFields,
  ExistingFarmCandidate,
  FARM_COMPLETABLE_FIELDS,
  FARMER_COMPLETABLE_FIELDS,
  FieldToComplete,
  normalizeFarmKey,
  PendingSubmissionPeer,
  PlanFarmerRecord,
  ProcessPreview,
} from './public-submission-plan';
import {
  buildSystemFieldMap,
  buildSystemFieldMapWithWarnings,
  SystemFieldValue,
} from './system-field-map';
import { convertAreaToHectares } from './unit-conversion';
import { ConsentRecordsService } from '../consents/consent-records.service';

export interface SurveyFilters {
  actorTypeId?: string;
  departmentId?: string;
  townId?: string;
  vereda?: string;
  cropId?: string;
  instrumentId?: string;
  farmerId?: string;
}

// Spec 79 — fila de la bandeja de revisión de envíos públicos.
export interface PublicSubmissionRow {
  surveyId: string;
  instrumentId: string;
  instrumentName: string;
  createdAt: Date;
  responseCount: number;
  reviewStatus: string;
  // Spec 93 — identidad declarada en el envío, para decidir desde la lista.
  farmerName: string | null;
  farmerDocumentId: string | null;
}

// Spec 93 — colisión de documento detectada dentro de la transacción. Se
// separa detectar de registrar: la transacción se revierte y la fila de
// colisión pendiente se escribe aparte (`toCollisionConflict`) antes del 409.
class DocumentCollisionError extends Error {
  constructor(
    readonly surveyId: string,
    readonly documentId: string,
    readonly submittedName: string,
    readonly existingFarmer: Farmer,
  ) {
    super('document collision');
  }
}

interface FarmerIdentity {
  respondentIsProducer: boolean;
  name?: string;
  phone?: string;
  email?: string;
  documentId?: string;
}

@Injectable()
export class SurveysService {
  private readonly logger = new Logger(SurveysService.name);

  constructor(
    @InjectRepository(Survey)
    private readonly surveysRepository: Repository<Survey>,
    @InjectRepository(Instrument)
    private readonly instrumentsRepository: Repository<Instrument>,
    @InjectRepository(Farmer)
    private readonly farmersRepository: Repository<Farmer>,
    @InjectRepository(Farm)
    private readonly farmsRepository: Repository<Farm>,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    @InjectRepository(ActorType)
    private readonly actorTypesRepository: Repository<ActorType>,
    @InjectRepository(Department)
    private readonly departmentsRepository: Repository<Department>,
    @InjectRepository(Town)
    private readonly townsRepository: Repository<Town>,
    @InjectRepository(TypeOfCrop)
    private readonly typesOfCropsRepository: Repository<TypeOfCrop>,
    @InjectRepository(CampaignSession)
    private readonly campaignSessionsRepository: Repository<CampaignSession>,
    @InjectRepository(Response)
    private readonly responsesRepository: Repository<Response>,
    @InjectRepository(FarmerDocumentCollision)
    private readonly documentCollisionsRepository: Repository<FarmerDocumentCollision>,
    private readonly consentRecordsService: ConsentRecordsService,
  ) {}

  async create(
    createSurveyDto: CreateSurveyDto,
    userId?: string,
  ): Promise<Survey> {
    // Spec 70, Fase 9 — idempotencia: si el cliente ya envió este
    // clientSurveyId antes (reintento tras perder la respuesta de un POST
    // que sí llegó), devolver la encuesta existente en vez de duplicarla.
    if (createSurveyDto.clientSurveyId) {
      const existing = await this.surveysRepository.findOne({
        where: { clientSurveyId: createSurveyDto.clientSurveyId },
      });
      if (existing) {
        return existing;
      }
    }

    const instruments = await this.instrumentsRepository.find({
      where: {
        instrumentId: In(createSurveyDto.instrumentIds),
      },
    });

    if (instruments.length !== createSurveyDto.instrumentIds.length) {
      throw new NotFoundException('One or more instruments were not found');
    }

    let farmer: Farmer | null = null;
    if (createSurveyDto.farmerId) {
      farmer = await this.farmersRepository.findOne({
        where: { id: createSurveyDto.farmerId },
      });

      if (!farmer) {
        throw new NotFoundException('Farmer not found');
      }
    }

    let user: User | null = null;
    if (userId) {
      user = await this.usersRepository.findOne({
        where: { userId },
      });

      if (!user) {
        throw new UnauthorizedException(
          'User account not found — please log in again',
        );
      }
    }

    let actorType: ActorType | null = null;
    if (createSurveyDto.actorTypeId) {
      actorType = await this.actorTypesRepository.findOne({
        where: { actorTypeId: createSurveyDto.actorTypeId },
      });

      if (!actorType) {
        throw new NotFoundException('ActorType not found');
      }
    }

    let department: Department | null = null;
    if (createSurveyDto.departmentId) {
      department = await this.departmentsRepository.findOne({
        where: { departmentId: createSurveyDto.departmentId },
      });

      if (!department) {
        throw new NotFoundException('Department not found');
      }
    }

    let town: Town | null = null;
    if (createSurveyDto.townId) {
      town = await this.townsRepository.findOne({
        where: { townId: createSurveyDto.townId },
      });

      if (!town) {
        throw new NotFoundException('Town not found');
      }
    }

    let crop: TypeOfCrop | null = null;
    if (createSurveyDto.cropId) {
      crop = await this.typesOfCropsRepository.findOne({
        where: { cropId: createSurveyDto.cropId },
      });

      if (!crop) {
        throw new NotFoundException('TypeOfCrop not found');
      }
    }

    let campaignSession: CampaignSession | null = null;
    if (createSurveyDto.campaignSessionId) {
      campaignSession = await this.campaignSessionsRepository.findOne({
        where: { sessionId: createSurveyDto.campaignSessionId },
      });
      if (!campaignSession) {
        throw new NotFoundException('CampaignSession not found');
      }
    }

    const survey = this.surveysRepository.create({
      farmer: farmer ?? undefined,
      user: user ?? undefined,
      instruments,
      sincronized: createSurveyDto.sincronized ?? false,
      actorType: actorType ?? undefined,
      department: department ?? undefined,
      town: town ?? undefined,
      vereda: createSurveyDto.vereda,
      crop: crop ?? undefined,
      campaignSession: campaignSession ?? undefined,
      stepOrder: createSurveyDto.stepOrder,
      clientSurveyId: createSurveyDto.clientSurveyId,
    });

    try {
      return await this.surveysRepository.save(survey);
    } catch (err) {
      // Spec 70, Fase 9 — carrera real: dos peticiones concurrentes con el
      // mismo clientSurveyId pueden pasar juntas la comprobación previa.
      // Postgres 23505 = unique_violation contra el índice único parcial de
      // client_survey_id; en ese caso, releer y devolver la fila que ganó la
      // carrera en vez de propagar el error.
      const isUniqueViolation =
        createSurveyDto.clientSurveyId &&
        typeof err === 'object' &&
        err !== null &&
        (err as { code?: string }).code === '23505';

      if (isUniqueViolation) {
        const existing = await this.surveysRepository.findOne({
          where: { clientSurveyId: createSurveyDto.clientSurveyId },
        });
        if (existing) {
          return existing;
        }
      }

      throw err;
    }
  }

  async findAll(filters: SurveyFilters): Promise<Survey[]> {
    const qb = this.surveysRepository
      .createQueryBuilder('survey')
      .leftJoinAndSelect('survey.instruments', 'instrument')
      .leftJoin('survey.campaignSession', 'campaignSession');

    if (filters.actorTypeId) {
      qb.leftJoin('survey.actorType', 'actorType').andWhere(
        'actorType.actorTypeId = :actorTypeId',
        { actorTypeId: filters.actorTypeId },
      );
    }

    if (filters.departmentId) {
      qb.leftJoin('survey.department', 'department').andWhere(
        'department.departmentId = :departmentId',
        { departmentId: filters.departmentId },
      );
    }

    if (filters.townId) {
      qb.leftJoin('survey.town', 'town').andWhere('town.townId = :townId', {
        townId: filters.townId,
      });
    }

    if (filters.vereda) {
      qb.andWhere('survey.vereda ILIKE :vereda', {
        vereda: `%${filters.vereda}%`,
      });
    }

    if (filters.cropId) {
      qb.leftJoin('survey.crop', 'crop').andWhere('crop.cropId = :cropId', {
        cropId: filters.cropId,
      });
    }

    if (filters.instrumentId) {
      qb.andWhere('instrument.instrumentId = :instrumentId', {
        instrumentId: filters.instrumentId,
      });
    }

    if (filters.farmerId) {
      qb.andWhere(
        '(survey.farmer = :farmerId OR campaignSession.farmer = :farmerId)',
        { farmerId: filters.farmerId },
      );
    }

    return qb.getMany();
  }

  async markAsSynchronized(surveyId: string): Promise<Survey> {
    const survey = await this.surveysRepository.findOne({
      where: { surveyId },
    });

    if (!survey) {
      throw new NotFoundException('Survey not found');
    }

    survey.sincronized = true;
    return this.surveysRepository.save(survey);
  }

  /**
   * Spec 84 (hallazgo de la ronda de pruebas, 2026-09-13) — serializa las
   * extracciones concurrentes de la MISMA encuesta y las hace idempotentes.
   *
   * Sin esto, dos llamadas simultáneas leían ambas "no existe productor con
   * este documento" antes de que cualquiera escribiera, y creaban dos
   * productores con el mismo documento y dos fincas duplicadas (reproducido
   * dos veces desde el flujo web, con ~0,5 s de diferencia). La detección de
   * colisiones del spec 68 no lo atrapa: compara contra lo ya guardado, y
   * aquí ninguna de las dos había guardado todavía.
   *
   * No se resuelve con un índice único sobre `farmers.document_id`: la
   * resolución `separate_person` del spec 68 crea a propósito un segundo
   * productor con el mismo documento. La clave de idempotencia correcta es
   * la **encuesta**: extraer dos veces de la misma encuesta debe devolver el
   * mismo productor. Eso cubre también el reintento de la cola de
   * sincronización del móvil.
   */
  async extractFarmer(
    surveyId: string,
    dto: ExtractFarmerDto = {},
  ): Promise<{ farmer: Farmer; existed: boolean }> {
    try {
      return await this.surveysRepository.manager.transaction(
        async (manager) => {
          await this.lockSurvey(manager, surveyId);
          return await this.extractFarmerLocked(surveyId, dto, manager);
        },
      );
    } catch (err) {
      throw await this.toCollisionConflict(err);
    }
  }

  // Lock por encuesta: dos llamadas concurrentes sobre la misma encuesta se
  // serializan; sobre encuestas distintas no se estorban.
  // Cota a la espera del lock: sin ella una petición colgada retiene una
  // conexión del pool indefinidamente. Al expirar, Postgres lanza 55P03 y la
  // petición falla rápido en vez de quedarse pendiente.
  private async lockSurvey(
    manager: EntityManager,
    surveyId: string,
  ): Promise<void> {
    await manager.query("SET LOCAL lock_timeout = '10s'");
    await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
      `extract-farmer:${surveyId}`,
    ]);
  }

  // Spec 68 — una colisión sin resolución nunca fusiona en silencio: se
  // registra como pendiente y se rechaza con 409 sin haber mutado nada más.
  // La transacción principal ya se revirtió; la fila se escribe en una
  // transacción corta propia, bajo el mismo lock, para que un reintento
  // simultáneo no duplique la fila pendiente.
  private async toCollisionConflict(err: unknown): Promise<unknown> {
    if (!(err instanceof DocumentCollisionError)) return err;
    await this.documentCollisionsRepository.manager.transaction(
      async (manager) => {
        await this.lockSurvey(manager, err.surveyId);
        await this.upsertDocumentCollision(manager, {
          documentId: err.documentId,
          submittedName: err.submittedName,
          existingFarmer: err.existingFarmer,
          resolution: null,
          survey: { surveyId: err.surveyId } as Survey,
        });
      },
    );
    return new ConflictException({
      message: 'El documento ya está registrado a nombre de otra persona',
      documentId: err.documentId,
      submittedName: err.submittedName,
      existingFarmer: {
        farmerId: err.existingFarmer.id,
        name: err.existingFarmer.name,
      },
    });
  }

  private async extractFarmerLocked(
    surveyId: string,
    dto: ExtractFarmerDto,
    manager: EntityManager,
  ): Promise<{ farmer: Farmer; existed: boolean }> {
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

    // Ya se extrajo de esta encuesta: devolver el mismo productor en vez de
    // crear otro. Es lo que convierte un reintento en una operación inocua.
    //
    // Antes del lock, una segunda extracción volvía a ejecutar el enlace de
    // la sesión y el backfill de constancias huérfanas — era, de hecho, la
    // única vía para reparar una constancia que hubiera quedado sin
    // productor. El retorno temprano la eliminaría, así que ambos se
    // reejecutan aquí: son idempotentes (un UPDATE al mismo valor) y baratos.
    if (survey.farmer) {
      const farmer = survey.farmer;
      if (survey.campaignSession) {
        await manager.update(
          CampaignSession,
          { sessionId: survey.campaignSession.sessionId },
          { farmer },
        );
        await manager.query('SAVEPOINT consent_backfill_retry');
        try {
          await this.consentRecordsService.linkOrphansToFarmer(
            survey.campaignSession.sessionId,
            farmer.id,
            manager,
          );
          await manager.query('RELEASE SAVEPOINT consent_backfill_retry');
        } catch (err) {
          await manager.query('ROLLBACK TO SAVEPOINT consent_backfill_retry');
          this.logger.error(
            `[extractFarmer] retry backfill failed for session=${survey.campaignSession.sessionId}: ${
              err instanceof Error ? err.message : String(err)
            }`,
            err instanceof Error ? err.stack : undefined,
          );
        }
      }
      return { farmer, existed: true };
    }

    const fieldMap = buildSystemFieldMap(survey.responses ?? []);

    // Resolve farm.town from the selected option's metadataId (townId)
    let resolvedTown: Town | null = null;
    const townResponse = (survey.responses ?? []).find(
      (r) => r.question?.systemField === 'farm.town',
    );
    if (townResponse?.option?.metadataId) {
      resolvedTown = await manager.findOne(Town, {
        where: { townId: townResponse.option.metadataId },
      });
      if (!resolvedTown) {
        console.warn(
          `[extractFarmer] Town not found for metadataId=${townResponse.option.metadataId} — farm.town left null`,
        );
      }
    }

    const identity = this.pickFarmerIdentity(fieldMap);
    if (!identity.respondentIsProducer) {
      await this.persistRespondentData(manager, surveyId, fieldMap);
    }
    const farmerName = identity.name;
    const farmerPhone = identity.phone;
    const farmerEmail = identity.email;
    const farmerDocumentId = identity.documentId;

    if (!farmerName) {
      throw new UnprocessableEntityException(
        'farmer.name is required to extract farmer',
      );
    }

    // Dedup by two levels (documentId, then name + phone). Spec 68 — a shared
    // documentId is no longer treated as absolute identity: an existing farmer
    // with that document but a name that doesn't reasonably match is a
    // collision, not automatically the same person. See
    // `resolveExistingFarmer`, which throws when it is unresolved.
    const resolved = await this.resolveExistingFarmer(manager, {
      surveyId,
      documentId: farmerDocumentId,
      name: farmerName,
      phone: farmerPhone,
      resolution: dto.resolution,
    });
    let farmer: Farmer | null = resolved.farmer;
    const existed = resolved.existed;
    // Farmer this documentId already belonged to, set only when a
    // collision was detected — used below to record/resolve it.
    const collisionWithFarmer: Farmer | null = resolved.collisionWith;

    if (!farmer) {
      // Create Farm if at least a farm name is available
      let farm: Farm | null = null;
      const farmName = fieldMap['farm.name'] as string | undefined;
      if (farmName) {
        farm = await manager.save<Farm>(
          manager.create(Farm, {
            name: farmName,
            location: null,
            vereda: (fieldMap['farm.vereda'] as string | undefined) ?? null,
            // Spec 84 — campo del instrumento de Registro (S_REG).
            corregimiento:
              (fieldMap['farm.corregimiento'] as string | undefined) ?? null,
            latitude: (fieldMap['farm.latitude'] as number | undefined) ?? null,
            longitude:
              (fieldMap['farm.longitude'] as number | undefined) ?? null,
            altitude: (fieldMap['farm.altitude'] as number | undefined) ?? null,
            area: (fieldMap['farm.area'] as number | undefined) ?? null,
            waterAccess:
              (fieldMap['farm.waterAccess'] as boolean | undefined) ?? null,
            internetAccess:
              (fieldMap['farm.internetAccess'] as boolean | undefined) ?? null,
            hasElectricityAccess:
              (fieldMap['farm.hasElectricityAccess'] as boolean | undefined) ??
              null,
            mainAccessType:
              (fieldMap['farm.mainAccessType'] as string | undefined) ?? null,
            electricitySourceType:
              (fieldMap['farm.electricitySourceType'] as string | undefined) ??
              null,
            waterSourceType:
              (fieldMap['farm.waterSourceType'] as string | undefined) ?? null,
            plotCount:
              (fieldMap['farm.plotCount'] as number | undefined) ?? null,
            town: resolvedTown ?? undefined,
          }),
        );
      }

      farmer = await manager.save<Farmer>(
        manager.create(Farmer, {
          name: farmerName,
          documentId: farmerDocumentId ?? null,
          phone: farmerPhone ?? null,
          email: farmerEmail ?? null,
          gender: (fieldMap['farmer.gender'] as string | undefined) ?? null,
          age: (fieldMap['farmer.age'] as number | undefined) ?? null,
          experienceYears:
            (fieldMap['farmer.experienceYears'] as number | undefined) ?? null,
          isMainIncome:
            (fieldMap['farmer.isMainIncome'] as boolean | undefined) ?? null,
          educationLevel:
            (fieldMap['farmer.educationLevel'] as string | undefined) ?? null,
          farm: farm ?? undefined,
        }),
      );
    }

    // Spec 84 — deja constancia de qué productor salió de esta encuesta. Es
    // la clave de idempotencia que lee la guarda del principio: sin esto, un
    // segundo `extract-farmer` sobre la misma encuesta vuelve a crear.
    await manager.update(Survey, surveyId, { farmer });

    // Link farmer to the CampaignSession if the survey belongs to one
    if (survey.campaignSession) {
      await manager.update(
        CampaignSession,
        { sessionId: survey.campaignSession.sessionId },
        { farmer },
      );

      // Spec 78, criterio 6 — el consentimiento se registra antes de S1,
      // cuando el Farmer todavía no existe (ConsentRecord.farmer_id queda en
      // null, anclado solo por session_id). Aquí es donde el Farmer recién
      // resuelto (nuevo o ya existente) queda disponible por primera vez, así
      // que es el punto correcto para el backfill. Best-effort: un fallo aquí
      // no debe tumbar la extracción del agricultor, que ya se completó.
      // Spec 84 — `SAVEPOINT` para que "mejor esfuerzo" siga significando lo
      // mismo dentro de una transacción. Sin él, un fallo aquí aborta la
      // transacción entera (Postgres 25P02), el `catch` de abajo se lo traga
      // y el COMMIT final se degrada a ROLLBACK **sin lanzar**: el método
      // devolvería 201 con un productor que nunca se guardó. El savepoint
      // acota el daño al backfill y deja la extracción intacta, que es la
      // decisión B4 del spec 78 (visible, no fatal).
      await manager.query('SAVEPOINT consent_backfill');
      try {
        await this.consentRecordsService.linkOrphansToFarmer(
          survey.campaignSession.sessionId,
          farmer.id,
          // Spec 84 — misma transacción: el agricultor todavía no está
          // confirmado y otra conexión no lo vería (FK), dejando la
          // constancia huérfana.
          manager,
        );
        await manager.query('RELEASE SAVEPOINT consent_backfill');
      } catch (err) {
        await manager.query('ROLLBACK TO SAVEPOINT consent_backfill');
        // B4 (auditoría spec 78) — `error`, no `warn`: un fallo aquí deja una
        // constancia de consentimiento huérfana (criterio 6 incumplido) y
        // debe quedar visible en los logs estructurados de producción, no
        // perdido entre líneas de `console`.
        this.logger.error(
          `[extractFarmer] failed to link orphan consent records for session=${survey.campaignSession.sessionId}: ${
            err instanceof Error ? err.message : String(err)
          }`,
          err instanceof Error ? err.stack : undefined,
        );
      }
    }

    // A resolution was declared for a previously-detected collision — record
    // it as resolved (creates the row if this is the first and only call,
    // e.g. a resolution submitted without a prior 409 round-trip).
    if (collisionWithFarmer && dto.resolution) {
      await this.upsertDocumentCollision(manager, {
        documentId: farmerDocumentId!,
        submittedName: farmerName,
        existingFarmer: collisionWithFarmer,
        resolution: dto.resolution,
        survey,
      });
    }

    return { farmer, existed };
  }

  // Quién es el respondiente y con qué datos se identifica. Q9 = false (otros
  // instrumentos): el productor es otra persona y se usan sus campos; si faltan
  // nombre o documento se toman provisionalmente los del respondiente.
  private pickFarmerIdentity(
    fieldMap: Record<string, SystemFieldValue>,
  ): FarmerIdentity {
    const str = (key: string): string | undefined => {
      const value = fieldMap[key];
      return value === undefined ? undefined : String(value);
    };
    // undefined means Q9 was not in the instrument (other instruments) → treat as true.
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

  // Q9 = false: persist respondent data on the Survey.
  private async persistRespondentData(
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

  // Spec 93 (D-H2-8) — el documento se compara normalizado (sin puntos,
  // espacios ni guiones; lo guardado no se reescribe) y con orden determinista:
  // el más antiguo primero, con el id como desempate.
  private async findFarmersByDocument(
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

  // Dedup por documento y luego por nombre + teléfono. Con varios productores
  // del mismo documento prefiere al que coincide en nombre. Lanza
  // `DocumentCollisionError` ante una colisión sin resolución; con
  // `separate_person` fuerza la creación de un productor nuevo (también se
  // omite el nivel 2, que reutilizaría en silencio a otro por nombre + teléfono
  // y contradiría la decisión explícita, spec 68 criterio 5).
  private async resolveExistingFarmer(
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

  // Spec 68 — one pending (unresolved) row per (documentId, submittedName,
  // existingFarmer) combination: a retry without a resolution (e.g. the
  // mobile sync queue retrying a deferred collision) updates the same row
  // instead of piling up duplicates. Resolving it later updates that same
  // row rather than inserting a second one.
  private async upsertDocumentCollision(
    manager: EntityManager,
    params: {
      documentId: string;
      submittedName: string;
      existingFarmer: Farmer;
      resolution: 'same_person' | 'separate_person' | null;
      survey: Survey;
    },
  ): Promise<void> {
    const repository = manager.getRepository(FarmerDocumentCollision);
    const existingRow = await repository.findOne({
      where: {
        documentId: params.documentId,
        submittedName: params.submittedName,
        existingFarmer: { id: params.existingFarmer.id },
      },
    });

    if (existingRow) {
      if (existingRow.resolution) return; // already resolved — leave as-is
      // `.update()`, not load-then-`.save()`: `existingRow` above doesn't
      // fetch the `survey`/`existingFarmer` relations, and saving that
      // partial entity back could null out `survey_id` on a repeated
      // pending hit (e.g. a retried 409 without a resolution). `.update()`
      // only touches the columns given here.
      //
      // Spec 93 — la fila pasa a apuntar a la encuesta que la vuelve a
      // disparar: el mismo documento + nombre llega en envíos distintos y
      // quien la resuelve la ve desde el envío que está revisando.
      await repository.update(existingRow.collisionId, {
        resolution: params.resolution,
        resolvedAt: params.resolution ? new Date() : null,
        survey: params.survey,
      });
      return;
    }

    await repository.save(
      repository.create({
        documentId: params.documentId,
        submittedName: params.submittedName,
        existingFarmer: params.existingFarmer,
        existingFarmerName: params.existingFarmer.name,
        resolution: params.resolution,
        resolvedAt: params.resolution ? new Date() : null,
        survey: params.survey,
      }),
    );
  }

  async checkDuplicate(
    farmerId: string,
    instrumentId: string,
    campaignId: string,
  ): Promise<{ hasDuplicate: boolean; surveyId?: string }> {
    const row = await this.surveysRepository
      .createQueryBuilder('survey')
      .innerJoin('survey.campaignSession', 'session')
      .innerJoin('session.campaign', 'campaign')
      .innerJoin('survey.instruments', 'instrument')
      .leftJoin('survey.farmer', 'surveyFarmer')
      .leftJoin('session.farmer', 'sessionFarmer')
      .leftJoin('survey.responses', 'response')
      .where('campaign.campaignId = :campaignId', { campaignId })
      .andWhere('instrument.instrumentId = :instrumentId', { instrumentId })
      .andWhere(
        '(surveyFarmer.id = :farmerId OR sessionFarmer.id = :farmerId)',
        { farmerId },
      )
      .andWhere('response.responseId IS NOT NULL')
      .orderBy('survey.createdAt', 'DESC')
      .select('survey.surveyId', 'surveyId')
      .limit(1)
      .getRawOne<{ surveyId: string } | undefined>();

    if (!row) return { hasDuplicate: false };
    return { hasDuplicate: true, surveyId: row.surveyId };
  }

  // Spec 70, Fase 4 — solo descarta el duplicado; ya no crea la encuesta de
  // reemplazo. Crearla aquí, vacía, era uno de los vectores que dejaban
  // encuestas huérfanas cuando el encuestador abandonaba tras sobrescribir.
  // El cliente inicia el reemplazo con `beginSurvey()` (mobile), igual que
  // cualquier otro inicio de instrumento — el registro real solo se crea al
  // sincronizar, cuando exista al menos una respuesta.
  async overwriteSurvey(
    dto: OverwriteSurveyDto,
  ): Promise<{ discardedSurveyId: string }> {
    const survey = await this.surveysRepository.findOne({
      where: { surveyId: dto.surveyId },
      relations: ['instruments', 'campaignSession', 'campaignSession.campaign'],
    });
    if (!survey) throw new NotFoundException('Survey not found');

    const targetSession = await this.campaignSessionsRepository.findOne({
      where: { sessionId: dto.sessionId },
      relations: ['campaign'],
    });
    if (!targetSession)
      throw new NotFoundException('CampaignSession not found');

    if (
      survey.campaignSession?.campaign?.campaignId !==
      targetSession.campaign?.campaignId
    ) {
      throw new BadRequestException(
        'Survey does not belong to the same campaign as the session',
      );
    }

    // Clear pivot table rows before removing to avoid FK constraint violations
    survey.instruments = [];
    await this.surveysRepository.save(survey);
    await this.surveysRepository.remove(survey);

    return { discardedSurveyId: dto.surveyId };
  }

  // Spec 70, Fase 6 — auditoría de solo lectura de las encuestas huérfanas
  // vacías que dejaron los vectores 1-3 antes de la Fase 1-4 de este spec.
  // El discriminador que hace segura esta lista (y el borrado que la usa) es
  // la existencia de una encuesta HERMANA en la misma sesión y el mismo
  // stepOrder que SÍ tiene respuestas: un marcador de paso saltado
  // (`skipStep()`) es siempre la única encuesta de su paso, así que nunca
  // tiene hermana y nunca puede aparecer aquí.
  async findOrphanSurveys(): Promise<
    Array<{
      surveyId: string;
      createdAt: Date;
      stepOrder: number;
      siblingSurveyId: string;
    }>
  > {
    return this.surveysRepository
      .createQueryBuilder('survey')
      .leftJoin('survey.responses', 'response')
      .innerJoin(
        Survey,
        'sibling',
        'sibling.campaignSession = survey.campaignSession ' +
          'AND sibling.stepOrder = survey.stepOrder ' +
          'AND sibling.surveyId != survey.surveyId',
      )
      .innerJoin('sibling.responses', 'siblingResponse')
      .where('survey.campaignSession IS NOT NULL')
      .andWhere('survey.stepOrder IS NOT NULL')
      .andWhere('response.responseId IS NULL')
      .distinctOn(['survey.surveyId'])
      .orderBy('survey.surveyId', 'ASC')
      .addOrderBy('sibling.createdAt', 'ASC')
      .select('survey.surveyId', 'surveyId')
      .addSelect('survey.createdAt', 'createdAt')
      .addSelect('survey.stepOrder', 'stepOrder')
      .addSelect('sibling.surveyId', 'siblingSurveyId')
      .getRawMany();
  }

  // Borrado acotado: solo acepta encuestas que aparecerían en
  // `findOrphanSurveys()` — sin respuestas propias y con una hermana con
  // respuestas en la misma sesión/paso. Nunca borra en cascada nada con
  // datos de campo, y nunca acepta un marcador de paso saltado (siempre es
  // la única encuesta de su paso, así que nunca tiene la hermana requerida).
  async deleteOrphanSurvey(
    surveyId: string,
  ): Promise<{ deletedSurveyId: string }> {
    const survey = await this.surveysRepository.findOne({
      where: { surveyId },
      relations: ['instruments', 'campaignSession', 'responses'],
    });
    if (!survey) throw new NotFoundException('Survey not found');

    if (survey.responses && survey.responses.length > 0) {
      throw new ConflictException('Cannot delete a survey that has responses');
    }

    if (!survey.campaignSession || survey.stepOrder == null) {
      throw new ConflictException(
        'Survey is not an auditable orphan candidate (missing session or stepOrder)',
      );
    }

    const siblingWithResponses = await this.surveysRepository
      .createQueryBuilder('sibling')
      .innerJoin('sibling.responses', 'response')
      .where('sibling.campaignSession = :sessionId', {
        sessionId: survey.campaignSession.sessionId,
      })
      .andWhere('sibling.stepOrder = :stepOrder', {
        stepOrder: survey.stepOrder,
      })
      .andWhere('sibling.surveyId != :surveyId', { surveyId })
      .getOne();

    if (!siblingWithResponses) {
      throw new ConflictException(
        'Survey has no sibling with responses in the same session/step — not a provable orphan',
      );
    }

    // Clear pivot table rows before removing to avoid FK constraint violations
    survey.instruments = [];
    await this.surveysRepository.save(survey);
    await this.surveysRepository.remove(survey);

    return { deletedSurveyId: surveyId };
  }

  async skipStep(dto: SkipStepDto): Promise<{ surveyId: string }> {
    const session = await this.campaignSessionsRepository.findOne({
      where: { sessionId: dto.sessionId },
    });
    if (!session) throw new NotFoundException('CampaignSession not found');

    const instrument = await this.instrumentsRepository.findOne({
      where: { instrumentId: dto.instrumentId },
    });
    if (!instrument) throw new NotFoundException('Instrument not found');

    // Spec 70, Fase 10 — idempotencia: sin esto, un doble salto (o un salto
    // offline sobre un paso que otro dispositivo ya completó mientras tanto)
    // crea una segunda fila para el mismo (sesión, stepOrder). Esa segunda
    // fila, sin respuestas, tendría un hermano CON respuestas en su mismo
    // paso — exactamente el discriminador que GET /api/surveys/orphans usa
    // para detectar huérfanas — y aparecería ahí como falso positivo. Si ya
    // existe cualquier encuesta para este paso (marcador previo o una
    // completada de verdad), se devuelve esa en vez de crear otra: el paso ya
    // está resuelto, saltado u online, y no hace falta un segundo registro.
    const existing = await this.surveysRepository.findOne({
      where: {
        campaignSession: { sessionId: dto.sessionId },
        stepOrder: dto.stepOrder,
      },
    });
    if (existing) {
      return { surveyId: existing.surveyId };
    }

    // Create an empty survey as a skip marker — getNextStep treats any survey
    // with a stepOrder as "completed" regardless of whether it has responses.
    const survey = this.surveysRepository.create({
      campaignSession: session,
      instruments: [instrument],
      stepOrder: dto.stepOrder,
    });

    try {
      const saved = await this.surveysRepository.save(survey);
      return { surveyId: saved.surveyId };
    } catch (err) {
      // Misma carrera que en create() (Fase 9): dos llamadas concurrentes a
      // skip-step para el mismo paso pueden pasar juntas la comprobación de
      // arriba. Sin índice único que lo garantice a nivel de base de datos
      // (deliberado — ver D8 en el spec: un paso admite legítimamente más de
      // una encuesta durante el flujo de duplicados/sobrescritura), la
      // defensa aquí es de mejor esfuerzo: releer y devolver lo que exista.
      const raced = await this.surveysRepository.findOne({
        where: {
          campaignSession: { sessionId: dto.sessionId },
          stepOrder: dto.stepOrder,
        },
      });
      if (raced) {
        return { surveyId: raced.surveyId };
      }
      throw err;
    }
  }

  async findSurveyResponses(surveyId: string) {
    const survey = await this.surveysRepository.findOne({
      where: { surveyId },
      relations: { instruments: true },
    });

    if (!survey) {
      throw new NotFoundException('Survey not found');
    }

    const responses = await this.responsesRepository
      .createQueryBuilder('response')
      .innerJoinAndSelect('response.question', 'question')
      .innerJoinAndSelect('question.type', 'type')
      .innerJoinAndSelect('question.section', 'section')
      .leftJoinAndSelect('response.option', 'option')
      .leftJoinAndSelect('response.attachments', 'attachment')
      .where('response.survey = :surveyId', { surveyId })
      .orderBy('section.order', 'ASC')
      .addOrderBy('question.order', 'ASC')
      .getMany();

    return {
      surveyId: survey.surveyId,
      instrumentName: survey.instruments?.[0]?.name ?? null,
      syncedAt: survey.updatedAt.toISOString(),
      responses: responses.map((r) => {
        const attachment = r.attachments?.[0] ?? null;
        return {
          responseId: r.responseId,
          questionId: r.question.questionId,
          questionText: r.question.text,
          questionType: r.question.type.name,
          sectionTitle: r.question.section.name,
          textValue: r.textValue ?? null,
          numericValue: r.numericValue ?? null,
          booleanValue: r.booleanValue ?? null,
          optionText: r.option?.text ?? null,
          publicUrl: attachment?.publicUrl ?? null,
          mimeType: attachment?.mimeType ?? null,
          originalFilename: attachment?.originalFilename ?? null,
        };
      }),
    };
  }

  async extractCrops(surveyId: string): Promise<{ crops: TypeOfCrop[] }> {
    const survey = await this.surveysRepository.findOne({
      where: { surveyId },
      relations: [
        'responses',
        'responses.question',
        'responses.option',
        'campaignSession',
      ],
    });

    if (!survey) throw new NotFoundException('Survey not found');

    // Collect farm.* fields to create/update Farm if the instrument includes
    // them. Los cultivos (`crop.*` y `farm.mainCrop`, este último del
    // instrumento de Registro S_REG, spec 84) los resuelve
    // `resolveCropsFromResponses` (spec 93), compartido con el canal público.
    const farmFieldMap: Record<string, string | number | boolean> = {};
    for (const response of survey.responses ?? []) {
      const sf = response.question?.systemField;
      if (!sf || sf.startsWith('crop.') || sf === 'farm.mainCrop') continue;
      if (sf.startsWith('farm.')) {
        const value =
          response.textValue ?? response.numericValue ?? response.booleanValue;
        if (value === undefined || value === null) continue;
        if (
          sf === 'farm.area' &&
          typeof response.numericValue === 'number' &&
          response.option?.text
        ) {
          // Spec 93 — el área se guarda en hectáreas; unidad desconocida → sin área.
          const { hectares } = convertAreaToHectares(
            response.numericValue,
            response.option.text,
          );
          if (hectares !== null) farmFieldMap[sf] = hectares;
          continue;
        }
        farmFieldMap[sf] = value;
      }
    }

    const { crops } = resolveCropsFromResponses(
      survey.responses ?? [],
      await this.typesOfCropsRepository.find(),
    );

    // Assign crops to CampaignSession via direct relation update to avoid cascading nulls
    if (survey.campaignSession) {
      const session = await this.campaignSessionsRepository.findOne({
        where: { sessionId: survey.campaignSession.sessionId },
        relations: ['crops', 'farmer', 'farmer.farm'],
      });
      if (session) {
        session.crops = crops;
        await this.campaignSessionsRepository.save(session);

        // Create or update Farm from farm.* fields present in this survey (e.g. S1b)
        const farmName = farmFieldMap['farm.name'] as string | undefined;
        if (farmName && session.farmer) {
          // Resolve farm.town from ANY survey in this session (may live in a different instrument)
          let resolvedTown: Town | null = null;
          const townResponse = await this.responsesRepository
            .createQueryBuilder('r')
            .innerJoin('r.survey', 's')
            .innerJoin('r.question', 'q')
            .leftJoinAndSelect('r.option', 'o')
            .where('s.campaignSession = :sessionId', {
              sessionId: session.sessionId,
            })
            .andWhere('q.systemField = :sf', { sf: 'farm.town' })
            .andWhere('o.metadataId IS NOT NULL')
            .getOne();
          if (townResponse?.option?.metadataId) {
            resolvedTown = await this.townsRepository.findOne({
              where: { townId: townResponse.option.metadataId },
            });
          }

          let farm: Farm | null = session.farmer.farm ?? null;
          const farmFields = {
            name: farmName,
            town: resolvedTown ?? undefined,
            area:
              (farmFieldMap['farm.area'] as number | undefined) ?? undefined,
            vereda:
              (farmFieldMap['farm.vereda'] as string | undefined) ?? undefined,
            // Spec 84 — campo del instrumento de Registro (S_REG).
            corregimiento:
              (farmFieldMap['farm.corregimiento'] as string | undefined) ??
              undefined,
            latitude:
              (farmFieldMap['farm.latitude'] as number | undefined) ??
              undefined,
            longitude:
              (farmFieldMap['farm.longitude'] as number | undefined) ??
              undefined,
            altitude:
              (farmFieldMap['farm.altitude'] as number | undefined) ??
              undefined,
            waterAccess:
              (farmFieldMap['farm.waterAccess'] as boolean | undefined) ??
              undefined,
            internetAccess:
              (farmFieldMap['farm.internetAccess'] as boolean | undefined) ??
              undefined,
            hasElectricityAccess:
              (farmFieldMap['farm.hasElectricityAccess'] as
                | boolean
                | undefined) ?? undefined,
            mainAccessType:
              (farmFieldMap['farm.mainAccessType'] as string | undefined) ??
              undefined,
            electricitySourceType:
              (farmFieldMap['farm.electricitySourceType'] as
                | string
                | undefined) ?? undefined,
            waterSourceType:
              (farmFieldMap['farm.waterSourceType'] as string | undefined) ??
              undefined,
            plotCount:
              (farmFieldMap['farm.plotCount'] as number | undefined) ??
              undefined,
          };
          if (farm?.farmId) {
            // Update existing farm (farmsRepository.update doesn't handle relations; use save)
            Object.assign(farm, farmFields);
            await this.farmsRepository.save(farm);
            farm = await this.farmsRepository.findOne({
              where: { farmId: farm.farmId },
              relations: ['crops'],
            });
          } else {
            // Create new farm and link to farmer
            farm = await this.farmsRepository.save(
              this.farmsRepository.create({ ...farmFields, location: null }),
            );
            await this.farmersRepository.update(session.farmer.id, { farm });
          }
          // Propagate crops to farm
          if (farm) {
            const farmWithCrops = await this.farmsRepository.findOne({
              where: { farmId: farm.farmId },
              relations: ['crops'],
            });
            if (farmWithCrops) {
              farmWithCrops.crops = crops;
              await this.farmsRepository.save(farmWithCrops);
            }
          }
        } else if (session.farmer?.farm?.farmId) {
          // No farm.* fields in this survey but farm already exists — just propagate crops
          const farm = await this.farmsRepository.findOne({
            where: { farmId: session.farmer.farm.farmId },
            relations: ['crops'],
          });
          if (farm) {
            farm.crops = crops;
            await this.farmsRepository.save(farm);
          }
        }
      }
    }

    return { crops };
  }

  // ── Spec 79 — bandeja de revisión de envíos públicos ──────────────────────

  async findPublicSubmissions(filters: {
    instrumentId?: string;
    reviewStatus?: 'pending' | 'processed' | 'discarded';
  }): Promise<PublicSubmissionRow[]> {
    const qb = this.surveysRepository
      .createQueryBuilder('survey')
      .innerJoinAndSelect('survey.instruments', 'instrument')
      .where('survey.origin = :origin', { origin: 'public' });

    if (filters.instrumentId) {
      qb.andWhere('instrument.instrumentId = :instrumentId', {
        instrumentId: filters.instrumentId,
      });
    }

    if (filters.reviewStatus) {
      qb.andWhere('survey.reviewStatus = :reviewStatus', {
        reviewStatus: filters.reviewStatus,
      });
    }

    qb.orderBy('survey.createdAt', 'DESC');

    const surveys = await qb.getMany();
    if (surveys.length === 0) return [];

    // Una sola consulta agregada para el conteo de respuestas, en vez de
    // N+1 por envío (ver spec 55, mismo criterio aplicado aquí).
    const counts = await this.responsesRepository
      .createQueryBuilder('response')
      .select('response.survey', 'surveyId')
      .addSelect('COUNT(*)', 'count')
      .where('response.survey IN (:...surveyIds)', {
        surveyIds: surveys.map((s) => s.surveyId),
      })
      .groupBy('response.survey')
      .getRawMany<{ surveyId: string; count: string }>();
    const countBySurveyId = new Map(
      counts.map((row) => [row.surveyId, Number(row.count)]),
    );

    // Spec 93 — nombre y documento declarados, en una sola consulta para todo el lote.
    const identityRows = await this.surveysRepository.manager.query<
      {
        surveyId: string;
        systemField: string;
        textValue: string | null;
        numericValue: number | null;
      }[]
    >(
      `SELECT r.survey_id AS "surveyId", q.system_field AS "systemField",
              r.text_value AS "textValue", r.numeric_value AS "numericValue"
         FROM responses r
         JOIN questions q ON q.question_id = r.question_id
        WHERE r.survey_id = ANY($1::uuid[])
          AND q.system_field IN ('farmer.name', 'farmer.documentId')`,
      [surveys.map((s) => s.surveyId)],
    );
    const identityBySurveyId = new Map<
      string,
      { name: string | null; documentId: string | null }
    >();
    for (const row of identityRows) {
      const identity = identityBySurveyId.get(row.surveyId) ?? {
        name: null,
        documentId: null,
      };
      const value =
        row.textValue ??
        (row.numericValue !== null ? String(row.numericValue) : null);
      if (row.systemField === 'farmer.name') identity.name = value;
      else identity.documentId = value;
      identityBySurveyId.set(row.surveyId, identity);
    }

    return surveys.map((survey) => ({
      surveyId: survey.surveyId,
      instrumentId: survey.instruments?.[0]?.instrumentId ?? '',
      instrumentName: survey.instruments?.[0]?.name ?? '',
      createdAt: survey.createdAt,
      responseCount: countBySurveyId.get(survey.surveyId) ?? 0,
      reviewStatus: survey.reviewStatus ?? 'pending',
      farmerName: identityBySurveyId.get(survey.surveyId)?.name ?? null,
      farmerDocumentId:
        identityBySurveyId.get(survey.surveyId)?.documentId ?? null,
    }));
  }

  private async findPublicSurveyOrThrow(surveyId: string): Promise<Survey> {
    const survey = await this.surveysRepository.findOne({
      where: { surveyId },
    });

    if (!survey) throw new NotFoundException('Survey not found');

    if (survey.origin !== 'public') {
      throw new ConflictException(
        'Esta encuesta no es un envío del canal público.',
      );
    }

    return survey;
  }

  // Spec 93 — carga un envío público pendiente con lo que necesitan tanto la
  // vista previa como el procesado. Con `manager` dentro de una transacción
  // lee el estado ya bloqueado.
  private async loadPendingPublicSubmission(
    manager: EntityManager,
    surveyId: string,
  ): Promise<Survey> {
    const survey = await manager.findOne(Survey, {
      where: { surveyId },
      relations: [
        'responses',
        'responses.question',
        'responses.option',
        'farmer',
      ],
    });

    if (!survey) throw new NotFoundException('Survey not found');

    if (survey.origin !== 'public') {
      throw new ConflictException(
        'Esta encuesta no es un envío del canal público.',
      );
    }

    if (survey.reviewStatus !== 'pending') {
      throw new ConflictException(
        `Este envío ya fue revisado (estado: ${survey.reviewStatus}).`,
      );
    }

    return survey;
  }

  // El municipio del envío (por el `metadataId` de su opción) tiene prioridad;
  // si no lo trae, el que indicó el administrador.
  private async resolveSubmissionTown(
    manager: EntityManager,
    responses: Response[],
    adminTownId?: string,
  ): Promise<Town | null> {
    const metadataId = responses.find(
      (r) => r.question?.systemField === 'farm.town',
    )?.option?.metadataId;
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

  private submittedFarmValues(
    fieldMap: Record<string, SystemFieldValue>,
    townId: string | null,
  ): Record<string, unknown> {
    return {
      vereda: fieldMap['farm.vereda'],
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

  // Lo que hoy tiene el productor / la finca en las columnas completables.
  // El productor debe venir con `farm` y `farm.town` cargados.
  private toPlanFarmer(farmer: Farmer): PlanFarmerRecord {
    const pick = (
      source: object,
      fields: readonly string[],
    ): Record<string, unknown> => {
      const record = source as Record<string, unknown>;
      return Object.fromEntries(fields.map((f) => [f, record[f] ?? null]));
    };
    return {
      farmerId: farmer.id,
      name: farmer.name,
      values: pick(farmer, FARMER_COMPLETABLE_FIELDS),
      farm: farmer.farm
        ? {
            farmId: farmer.farm.farmId,
            name: farmer.farm.name,
            values: {
              ...pick(farmer.farm, FARM_COMPLETABLE_FIELDS),
              townId: farmer.farm.town?.townId ?? null,
            },
          }
        : null,
    };
  }

  private async reloadFarmerWithFarm(
    manager: EntityManager,
    farmerId: string,
  ): Promise<Farmer> {
    return manager.findOneOrFail(Farmer, {
      where: { id: farmerId },
      relations: ['farm', 'farm.town'],
    });
  }

  // Otro envío pendiente del canal público, resumido a lo que sirve para
  // detectar documentos repetidos y fincas compartidas.
  private async loadPendingPeers(
    manager: EntityManager,
    excludeSurveyId: string,
  ): Promise<PendingSubmissionPeer[]> {
    const rows = await manager.query<
      {
        surveyId: string;
        systemField: string;
        textValue: string | null;
        numericValue: number | null;
        metadataId: string | null;
      }[]
    >(
      `SELECT s.survey_id AS "surveyId", q.system_field AS "systemField",
              r.text_value AS "textValue", r.numeric_value AS "numericValue",
              o.metadata_id AS "metadataId"
         FROM surveys s
         JOIN responses r ON r.survey_id = s.survey_id
         JOIN questions q ON q.question_id = r.question_id
         LEFT JOIN options_question o ON o.option_id = r.option_id
        WHERE s.origin = 'public' AND s.review_status = 'pending'
          AND s.survey_id <> $1
          AND q.system_field IN ('farmer.documentId', 'farm.name', 'farm.vereda', 'farm.town')`,
      [excludeSurveyId],
    );

    const peers = new Map<string, PendingSubmissionPeer>();
    for (const row of rows) {
      const peer = peers.get(row.surveyId) ?? {
        surveyId: row.surveyId,
        documentId: null,
        name: '',
        vereda: null,
        townId: null,
      };
      if (row.systemField === 'farmer.documentId') {
        peer.documentId = normalizeDocumentId(
          row.textValue ?? row.numericValue,
        );
      } else if (row.systemField === 'farm.name') {
        peer.name = row.textValue ?? '';
      } else if (row.systemField === 'farm.vereda') {
        peer.vereda = row.textValue;
      } else {
        peer.townId = row.metadataId;
      }
      peers.set(row.surveyId, peer);
    }
    return [...peers.values()];
  }

  // Fincas con el mismo nombre normalizado. El filtro SQL replica de forma
  // aproximada `normalizeFarmKey` (tildes y signos); la comparación final,
  // con vereda y municipio, la hace el planificador.
  private async findFarmsByNormalizedName(
    manager: EntityManager,
    nameKey: string,
  ): Promise<ExistingFarmCandidate[]> {
    if (!nameKey) return [];
    return manager.query<ExistingFarmCandidate[]>(
      `SELECT f.farm_id AS "farmId", f.name AS name, f.vereda AS vereda,
              f.town_id AS "townId"
         FROM farms f
        WHERE btrim(regexp_replace(
                translate(lower(f.name), 'áéíóúüñ', 'aeiouun'),
                '[^a-z0-9]+', ' ', 'g')) = $1
        LIMIT 50`,
      [nameKey],
    );
  }

  // Spec 93 (D-H2-13) — solo lectura: anticipa lo que hará `process-public`
  // con las mismas decisiones. No escribe nada, ni la fila de colisión.
  async previewPublicSubmission(
    surveyId: string,
    query: { townId?: string } = {},
  ): Promise<ProcessPreview> {
    const manager = this.surveysRepository.manager;
    const survey = await this.loadPendingPublicSubmission(manager, surveyId);
    const responses = survey.responses ?? [];

    const { fieldMap, warnings } = buildSystemFieldMapWithWarnings(responses);
    const identity = this.pickFarmerIdentity(fieldMap);
    const town = await this.resolveSubmissionTown(
      manager,
      responses,
      query.townId,
    );
    const { crops, unmapped } = resolveCropsFromResponses(
      responses,
      await manager.find(TypeOfCrop),
    );

    const documentKey = normalizeDocumentId(identity.documentId);
    let linkedFarmer: PlanFarmerRecord | null = null;
    let documentCandidates: PlanFarmerRecord[] = [];
    let phoneMatch: PlanFarmerRecord | null = null;
    if (survey.farmer) {
      linkedFarmer = this.toPlanFarmer(
        await this.reloadFarmerWithFarm(manager, survey.farmer.id),
      );
    } else {
      if (documentKey) {
        documentCandidates = (
          await this.findFarmersByDocument(manager, documentKey, true)
        ).map((f) => this.toPlanFarmer(f));
      }
      if (documentCandidates.length === 0 && identity.name && identity.phone) {
        const byPhone = await manager.findOne(Farmer, {
          where: { name: identity.name, phone: identity.phone },
          relations: ['farm', 'farm.town'],
          order: { createdAt: 'ASC', id: 'ASC' },
        });
        phoneMatch = byPhone ? this.toPlanFarmer(byPhone) : null;
      }
    }

    const farmName = fieldMap['farm.name'] as string | undefined;
    const vereda = fieldMap['farm.vereda'] as string | undefined;
    const actorTypes = new Map(
      (await manager.find(ActorType)).map((a) => [a.actorTypeId, a.name]),
    );

    return buildPublicSubmissionPlan({
      surveyId,
      identity: {
        name: identity.name ?? null,
        documentId: documentKey,
        phone: identity.phone ?? null,
      },
      documentCandidates,
      phoneMatch,
      linkedFarmer,
      submission: {
        farmerValues: this.submittedFarmerValues(fieldMap, identity),
        farm: {
          name: farmName ?? null,
          vereda: vereda ?? null,
          townId: town?.townId ?? null,
          values: this.submittedFarmValues(fieldMap, town?.townId ?? null),
        },
      },
      crops: {
        resolved: crops.map((c) => ({ cropId: c.cropId, name: c.name })),
        unmapped,
      },
      respondentProfiles: responses.flatMap((r) => {
        const actorType = r.option?.metadataId
          ? actorTypes.get(r.option.metadataId)
          : undefined;
        return actorType && r.option
          ? [{ optionText: r.option.text, actorType }]
          : [];
      }),
      fieldWarnings: warnings,
      existingFarmCandidates: farmName
        ? await this.findFarmsByNormalizedName(
            manager,
            normalizeFarmKey(farmName),
          )
        : [],
      pendingPeers: await this.loadPendingPeers(manager, surveyId),
    });
  }

  private async applyCompletion(
    manager: EntityManager,
    entity: 'farmer' | 'farm',
    id: string,
    target: Farmer | Farm,
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
    Object.assign(target, patch);
  }

  // Suma cultivos a la finca sin quitar ninguno. No toca `campaign_sessions_crops`.
  private async addCropsToFarm(
    manager: EntityManager,
    farmId: string,
    crops: TypeOfCrop[],
  ): Promise<void> {
    if (crops.length === 0) return;
    await manager.query(
      `INSERT INTO farms_crops (farm_id, crop_id)
       SELECT $1::uuid, c.crop_id FROM unnest($2::uuid[]) AS c(crop_id)
        WHERE NOT EXISTS (
          SELECT 1 FROM farms_crops fc
           WHERE fc.farm_id = $1::uuid AND fc.crop_id = c.crop_id)`,
      [farmId, crops.map((c) => c.cropId)],
    );
  }

  // Finca para un productor que aún no tiene: vincular a una existente (el
  // administrador la eligió, y no se le modifica ninguna columna) o crear la
  // del envío si trae nombre.
  private async createOrLinkFarm(
    manager: EntityManager,
    decision: ProcessPublicSubmissionDto['farm'],
    fieldMap: Record<string, SystemFieldValue>,
    town: Town | null,
  ): Promise<Farm | null> {
    if (decision?.mode === 'link') {
      const farm = await manager.findOne(Farm, {
        where: { farmId: decision.farmId },
      });
      if (!farm) throw new NotFoundException('Farm not found');
      return farm;
    }

    const farmName = fieldMap['farm.name'] as string | undefined;
    if (!farmName) return null;
    const values = this.submittedFarmValues(fieldMap, null);
    delete values.townId;
    return manager.save<Farm>(
      manager.create(Farm, {
        ...(values as DeepPartial<Farm>),
        name: farmName,
        location: null,
        town: town ?? undefined,
      }),
    );
  }

  // Criterio 11/12 — mismo criterio de colisión del spec 68 que `extractFarmer`.
  // Spec 93: todo ocurre en UNA transacción bajo el lock de la encuesta —
  // comprobar el estado, extraer, actuar sobre la finca, sumar cultivos,
  // reanclar la constancia y marcar `processed`. Si algo falla no queda nada;
  // ante colisión sin resolver responde 409 y el envío queda `pending`.
  async processPublicSubmission(
    surveyId: string,
    dto: ProcessPublicSubmissionDto,
    reviewedByUserId?: string,
  ): Promise<{ farmer: Farmer; existed: boolean }> {
    try {
      return await this.surveysRepository.manager.transaction(
        async (manager) => {
          await this.lockSurvey(manager, surveyId);
          return await this.processPublicLocked(
            manager,
            surveyId,
            dto,
            reviewedByUserId,
          );
        },
      );
    } catch (err) {
      throw await this.toCollisionConflict(err);
    }
  }

  private async processPublicLocked(
    manager: EntityManager,
    surveyId: string,
    dto: ProcessPublicSubmissionDto,
    reviewedByUserId?: string,
  ): Promise<{ farmer: Farmer; existed: boolean }> {
    // Se relee dentro del lock: un procesado concurrente ya pudo terminar.
    const survey = await this.loadPendingPublicSubmission(manager, surveyId);
    const responses = survey.responses ?? [];

    const { fieldMap } = buildSystemFieldMapWithWarnings(responses);
    const identity = this.pickFarmerIdentity(fieldMap);
    if (!identity.name) {
      throw new UnprocessableEntityException(
        'farmer.name is required to extract farmer',
      );
    }
    if (!identity.respondentIsProducer) {
      await this.persistRespondentData(manager, surveyId, fieldMap);
    }

    const town = await this.resolveSubmissionTown(
      manager,
      responses,
      dto.townId,
    );
    const { crops } = resolveCropsFromResponses(
      responses,
      await manager.find(TypeOfCrop),
    );

    let farmer: Farmer | null = survey.farmer ?? null;
    let existed = farmer !== null;
    let collisionWith: Farmer | null = null;
    if (!farmer) {
      const resolved = await this.resolveExistingFarmer(manager, {
        surveyId,
        documentId: identity.documentId,
        name: identity.name,
        phone: identity.phone,
        resolution: dto.resolution,
      });
      farmer = resolved.farmer;
      existed = resolved.existed;
      collisionWith = resolved.collisionWith;
    }

    let farm: Farm | null;
    if (farmer) {
      // Misma persona: completa solo lo vacío, nunca pisa un valor no nulo.
      farmer = await this.reloadFarmerWithFarm(manager, farmer.id);
      const plan = this.toPlanFarmer(farmer);
      await this.applyCompletion(
        manager,
        'farmer',
        farmer.id,
        farmer,
        completeFields(
          'farmer',
          plan.values,
          this.submittedFarmerValues(fieldMap, identity),
        ),
        town,
      );
      farm = farmer.farm ?? null;
      if (farm && plan.farm) {
        await this.applyCompletion(
          manager,
          'farm',
          farm.farmId,
          farm,
          completeFields(
            'farm',
            plan.farm.values,
            this.submittedFarmValues(fieldMap, town?.townId ?? null),
          ),
          town,
        );
      } else {
        // Una finca por productor hasta H3: si ya tiene, no se crea otra.
        farm = await this.createOrLinkFarm(manager, dto.farm, fieldMap, town);
        if (farm) {
          await manager.update(Farmer, farmer.id, { farm });
          farmer.farm = farm;
        }
      }
    } else {
      farm = await this.createOrLinkFarm(manager, dto.farm, fieldMap, town);
      farmer = await manager.save<Farmer>(
        manager.create(Farmer, {
          name: identity.name,
          documentId: identity.documentId ?? null,
          phone: identity.phone ?? null,
          email: identity.email ?? null,
          gender: (fieldMap['farmer.gender'] as string | undefined) ?? null,
          age: (fieldMap['farmer.age'] as number | undefined) ?? null,
          experienceYears:
            (fieldMap['farmer.experienceYears'] as number | undefined) ?? null,
          isMainIncome:
            (fieldMap['farmer.isMainIncome'] as boolean | undefined) ?? null,
          educationLevel:
            (fieldMap['farmer.educationLevel'] as string | undefined) ?? null,
          farm: farm ?? undefined,
        }),
      );
    }

    if (farm) await this.addCropsToFarm(manager, farm.farmId, crops);

    await manager.update(Survey, surveyId, {
      farmer: { id: farmer.id } as Farmer,
      reviewStatus: 'processed',
      reviewedBy: reviewedByUserId
        ? ({ userId: reviewedByUserId } as User)
        : null,
      reviewedAt: new Date(),
    });

    await this.consentRecordsService.linkOrphansToFarmerBySurvey(
      surveyId,
      farmer.id,
      manager,
    );

    if (collisionWith && dto.resolution) {
      await this.upsertDocumentCollision(manager, {
        documentId: identity.documentId!,
        submittedName: identity.name,
        existingFarmer: collisionWith,
        resolution: dto.resolution,
        survey,
      });
    }

    return { farmer, existed };
  }

  // Criterio 13 — descartar es un cambio de estado, no un borrado: la
  // encuesta y sus respuestas se conservan para auditoría. Idempotente
  // sobre un envío ya descartado (reintentar no es un error).
  async discardPublicSubmission(
    surveyId: string,
    reviewedByUserId?: string,
  ): Promise<{ surveyId: string; reviewStatus: string }> {
    const survey = await this.findPublicSurveyOrThrow(surveyId);

    if (survey.reviewStatus === 'processed') {
      throw new ConflictException(
        'Este envío ya fue procesado y no puede descartarse.',
      );
    }

    if (survey.reviewStatus !== 'discarded') {
      await this.surveysRepository.update(surveyId, {
        reviewStatus: 'discarded',
        reviewedBy: reviewedByUserId
          ? ({ userId: reviewedByUserId } as User)
          : null,
        reviewedAt: new Date(),
      });
    }

    return { surveyId, reviewStatus: 'discarded' };
  }
}
