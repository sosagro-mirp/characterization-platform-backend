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
import { isSameFarmerName } from 'src/farmers/name-matching';
import { Instrument } from 'src/instruments/entities/instrument.entity';
import { Response } from 'src/responses/entities/response.entity';
import { Town } from 'src/towns/entities/town.entity';
import { TypeOfCrop } from 'src/types-of-crops/entities/type-of-crop.entity';
import { User } from 'src/users/entities/user.entity';
import { In, Repository } from 'typeorm';
import { CreateSurveyDto } from './dto/create-survey.dto';
import { ExtractFarmerDto } from './dto/extract-farmer.dto';
import { OverwriteSurveyDto } from './dto/overwrite-survey.dto';
import { SkipStepDto } from './dto/skip-step.dto';
import { Survey } from './entities/survey.entity';
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

  async extractFarmer(
    surveyId: string,
    dto: ExtractFarmerDto = {},
  ): Promise<{ farmer: Farmer; existed: boolean }> {
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

    // Build systemField → value map from all responses that have systemField set.
    // farm.town is excluded: it resolves via option.metadataId, not a scalar value.
    const fieldMap: Record<string, string | number | boolean> = {};
    for (const response of survey.responses ?? []) {
      const sf = response.question?.systemField;
      if (!sf || sf === 'farm.town') continue;
      const value =
        response.textValue ?? response.numericValue ?? response.booleanValue;
      if (value !== undefined && value !== null) {
        fieldMap[sf] = value;
      }
    }

    // Resolve farm.town from the selected option's metadataId (townId)
    let resolvedTown: Town | null = null;
    const townResponse = (survey.responses ?? []).find(
      (r) => r.question?.systemField === 'farm.town',
    );
    if (townResponse?.option?.metadataId) {
      resolvedTown = await this.townsRepository.findOne({
        where: { townId: townResponse.option.metadataId },
      });
      if (!resolvedTown) {
        console.warn(
          `[extractFarmer] Town not found for metadataId=${townResponse.option.metadataId} — farm.town left null`,
        );
      }
    }

    // Determine whether the respondent is the producer.
    // undefined means Q9 was not in the instrument (other instruments) → treat as true.
    const isRespondent = fieldMap['farmer.isRespondent'] as boolean | undefined;
    const respondentIsProducer = isRespondent !== false;

    let farmerName: string | undefined;
    let farmerPhone: string | undefined;
    let farmerEmail: string | undefined;
    let farmerDocumentId: string | undefined;

    if (respondentIsProducer) {
      farmerName = fieldMap['farmer.name'] as string | undefined;
      farmerPhone = fieldMap['farmer.phone'] as string | undefined;
      farmerEmail = fieldMap['farmer.email'] as string | undefined;
      farmerDocumentId = fieldMap['farmer.documentId'] as string | undefined;
    } else {
      // Q9 = false: use producer fields; persist respondent data on the Survey
      farmerName = fieldMap['farmer.producerName'] as string | undefined;
      farmerPhone = fieldMap['farmer.producerPhone'] as string | undefined;
      farmerEmail = fieldMap['farmer.producerEmail'] as string | undefined;
      farmerDocumentId = fieldMap['farmer.producerDocumentId'] as
        | string
        | undefined;

      // Fallback: if producer name/documentId unknown, use respondent's as provisional
      if (!farmerName) {
        farmerName = fieldMap['farmer.name'] as string | undefined;
      }
      if (!farmerDocumentId) {
        farmerDocumentId = fieldMap['farmer.documentId'] as string | undefined;
      }

      await this.surveysRepository.update(surveyId, {
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

    if (!farmerName) {
      throw new UnprocessableEntityException(
        'farmer.name is required to extract farmer',
      );
    }

    // Dedup by two levels when Q9=false and producerDocumentId absent
    let farmer: Farmer | null = null;
    let existed = false;
    // Farmer this documentId already belonged to, set only when a
    // collision was detected — used below to record/resolve it.
    let collisionWithFarmer: Farmer | null = null;

    // Level 1: dedup by documentId. Spec 68 — a shared documentId is no
    // longer treated as absolute identity ("solid"): if an existing farmer
    // has that document but a name that doesn't reasonably match, this is a
    // documentId collision (typo, reused test data, two different people),
    // not automatically the same person. See farmers/name-matching.ts.
    if (farmerDocumentId) {
      const existingByDocument = await this.farmersRepository.findOne({
        where: { documentId: farmerDocumentId },
      });

      if (existingByDocument) {
        if (isSameFarmerName(existingByDocument.name, farmerName)) {
          farmer = existingByDocument;
          existed = true;
        } else {
          collisionWithFarmer = existingByDocument;

          if (dto.resolution === 'same_person') {
            farmer = existingByDocument;
            existed = true;
          } else if (dto.resolution === 'separate_person') {
            // Force the creation path below with this same documentId — the
            // level 2 (name+phone) dedup right below is also skipped for
            // this resolution, so this always creates a brand new farmer.
            farmer = null;
            existed = false;
          } else {
            // No resolution declared — never fuse in silence. Record the
            // (still-pending) collision and reject without mutating
            // anything else (no farmer created/modified, no CampaignSession
            // linked).
            await this.upsertDocumentCollision({
              documentId: farmerDocumentId,
              submittedName: farmerName,
              existingFarmer: existingByDocument,
              resolution: null,
              survey,
            });
            throw new ConflictException({
              message:
                'El documento ya está registrado a nombre de otra persona',
              documentId: farmerDocumentId,
              submittedName: farmerName,
              existingFarmer: {
                farmerId: existingByDocument.id,
                name: existingByDocument.name,
              },
            });
          }
        }
      }
    }

    // Level 2: dedup by name + phone (heuristic fallback when no documentId).
    // Spec 68 — skipped when `separate_person` forced the creation path
    // above: that resolution means "always create a new farmer with this
    // documentId", and letting this heuristic silently reuse a different
    // pre-existing farmer instead (matched by name+phone) would contradict
    // the encuestador's explicit decision and criterion 5, undetected —
    // the collision would still get recorded as "separate_person" even
    // though no new farmer was actually created.
    if (!farmer && farmerPhone && dto.resolution !== 'separate_person') {
      farmer = await this.farmersRepository.findOne({
        where: { name: farmerName, phone: farmerPhone },
      });
      if (farmer) existed = true;
    }

    if (!farmer) {
      // Create Farm if at least a farm name is available
      let farm: Farm | null = null;
      const farmName = fieldMap['farm.name'] as string | undefined;
      if (farmName) {
        farm = await this.farmsRepository.save(
          this.farmsRepository.create({
            name: farmName,
            location: null,
            vereda: (fieldMap['farm.vereda'] as string | undefined) ?? null,
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

      farmer = await this.farmersRepository.save(
        this.farmersRepository.create({
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

    // Link farmer to the CampaignSession if the survey belongs to one
    if (survey.campaignSession) {
      await this.campaignSessionsRepository.update(
        { sessionId: survey.campaignSession.sessionId },
        { farmer },
      );

      // Spec 78, criterio 6 — el consentimiento se registra antes de S1,
      // cuando el Farmer todavía no existe (ConsentRecord.farmer_id queda en
      // null, anclado solo por session_id). Aquí es donde el Farmer recién
      // resuelto (nuevo o ya existente) queda disponible por primera vez, así
      // que es el punto correcto para el backfill. Best-effort: un fallo aquí
      // no debe tumbar la extracción del agricultor, que ya se completó.
      try {
        await this.consentRecordsService.linkOrphansToFarmer(
          survey.campaignSession.sessionId,
          farmer.id,
        );
      } catch (err) {
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
      await this.upsertDocumentCollision({
        documentId: farmerDocumentId!,
        submittedName: farmerName,
        existingFarmer: collisionWithFarmer,
        resolution: dto.resolution,
        survey,
      });
    }

    return { farmer, existed };
  }

  // Spec 68 — one pending (unresolved) row per (documentId, submittedName,
  // existingFarmer) combination: a retry without a resolution (e.g. the
  // mobile sync queue retrying a deferred collision) updates the same row
  // instead of piling up duplicates. Resolving it later updates that same
  // row rather than inserting a second one.
  private async upsertDocumentCollision(params: {
    documentId: string;
    submittedName: string;
    existingFarmer: Farmer;
    resolution: 'same_person' | 'separate_person' | null;
    survey: Survey;
  }): Promise<void> {
    const existingRow = await this.documentCollisionsRepository.findOne({
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
      await this.documentCollisionsRepository.update(existingRow.collisionId, {
        resolution: params.resolution,
        resolvedAt: params.resolution ? new Date() : null,
      });
      return;
    }

    await this.documentCollisionsRepository.save(
      this.documentCollisionsRepository.create({
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
      relations: ['responses', 'responses.question', 'campaignSession'],
    });

    if (!survey) throw new NotFoundException('Survey not found');

    // Maps ASCII camelCase systemField keys to TypeOfCrop display names in DB
    const CROP_FIELD_MAP: Record<string, string> = {
      cacao: 'Cacao',
      cafe: 'Café',
      cannabis: 'Cannabis',
      canamo: 'Cáñamo',
    };

    // Collect crop names from affirmative yes/no responses with systemField 'crop.*'
    // Also collect farm.* fields to create/update Farm if the instrument includes them
    const cropNames: string[] = [];
    const farmFieldMap: Record<string, string | number | boolean> = {};
    for (const response of survey.responses ?? []) {
      const sf = response.question?.systemField;
      if (!sf) continue;
      if (sf.startsWith('crop.')) {
        if (response.booleanValue === true) {
          const key = sf.split('.')[1];
          const resolved = CROP_FIELD_MAP[key] ?? key;
          cropNames.push(resolved);
        }
      } else if (sf.startsWith('farm.')) {
        const value =
          response.textValue ?? response.numericValue ?? response.booleanValue;
        if (value !== undefined && value !== null) {
          farmFieldMap[sf] = value;
        }
      }
    }

    // Load matching TypeOfCrop entities by name
    const crops =
      cropNames.length > 0
        ? await this.typesOfCropsRepository.find({
            where: { name: In(cropNames) },
          })
        : [];

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
}
