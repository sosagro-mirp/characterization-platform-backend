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
import { MediaAttachmentStatus } from 'src/media-attachments/entities/media-attachment.entity';
import { Response } from 'src/responses/entities/response.entity';
import { Town } from 'src/towns/entities/town.entity';
import { TypeOfCrop } from 'src/types-of-crops/entities/type-of-crop.entity';
import { User } from 'src/users/entities/user.entity';
import { EntityManager, In, IsNull, Repository } from 'typeorm';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import { ROLES } from '../auth/constants';
import { resolveCropsFromResponses } from './crop-extraction';
import { CreateSurveyDto } from './dto/create-survey.dto';
import { ExtractFarmerDto } from './dto/extract-farmer.dto';
import { ListMySurveysQueryDto } from './dto/list-my-surveys-query.dto';
import { MySurveysPageDto } from './dto/my-surveys-page.dto';
import { OverwriteSurveyDto } from './dto/overwrite-survey.dto';
import { PollsterSurveyResponseRowDto } from './dto/pollster-survey-response.dto';
import { ProcessPublicSubmissionDto } from './dto/process-public-submission.dto';
import { SkipStepDto } from './dto/skip-step.dto';
import { Survey } from './entities/survey.entity';
import {
  buildPublicSubmissionPlan,
  ExistingFarmCandidate,
  FARM_COMPLETABLE_FIELDS,
  FARMER_COMPLETABLE_FIELDS,
  normalizeFarmKey,
  PendingSubmissionPeer,
  PlanFarmerRecord,
  ProcessPreview,
} from './public-submission-plan';
import {
  buildSystemFieldMapWithWarnings,
  SystemFieldValue,
} from './system-field-map';
import { anchorSurvey } from 'src/farmer-farms/farm-links';
import {
  FARMER_VIEW_RELATIONS,
  toFarmerView,
} from 'src/farmer-farms/farm-views';
import { MediaCleanupService } from 'src/media-attachments/media-cleanup.service';
import { ConsentRecordsService } from '../consents/consent-records.service';
import { DocumentCollisionError } from '../farmer-extraction/document-collision';
import {
  planFieldChanges,
  roleFromProfiles,
} from '../farmer-extraction/extraction-plan';
import { FarmerExtractionService } from '../farmer-extraction/farmer-extraction.service';

export interface SurveyFilters {
  actorTypeId?: string;
  departmentId?: string;
  townId?: string;
  vereda?: string;
  cropId?: string;
  instrumentId?: string;
  farmerId?: string;
  /** Spec 94 — encuestas ancladas a esta finca (`surveys.farm_id`). */
  farmId?: string;
  /** Spec 94 — encuestas ancladas a este cultivo de finca (`surveys.farm_crop_id`). */
  farmCropId?: string;
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
    private readonly mediaCleanup: MediaCleanupService,
    private readonly extraction: FarmerExtractionService,
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
        relations: ['farmer'],
      });
      if (!campaignSession) {
        throw new NotFoundException('CampaignSession not found');
      }
    }

    // Spec 95 — el productor se hereda del alias provisional (si ya se resolvió)
    // o de la sesión de campaña, cuando el cliente no lo indica.
    if (!farmer && createSurveyDto.clientFarmerId) {
      const [alias] = await this.surveysRepository.manager.query<
        { farmer_id: string }[]
      >(
        'SELECT farmer_id FROM farmer_client_aliases WHERE client_farmer_id = $1',
        [createSurveyDto.clientFarmerId],
      );
      if (alias) {
        farmer = await this.farmersRepository.findOne({
          where: { id: alias.farmer_id },
        });
      }
    }
    if (!farmer && campaignSession?.farmer) {
      farmer = campaignSession.farmer;
    }

    const anchors = await this.resolveCreateAnchors(
      createSurveyDto,
      farmer,
      crop,
    );

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
      clientFarmerId: createSurveyDto.clientFarmerId,
    });

    try {
      const saved = await this.surveysRepository.save(survey);
      if (anchors.farmId) {
        // `farm_id` / `farm_crop_id` se escriben solo con `anchorSurvey` (spec 94).
        await anchorSurvey(this.surveysRepository.manager, saved.surveyId, {
          farmId: anchors.farmId,
          ...(anchors.farmCropId ? { farmCropId: anchors.farmCropId } : {}),
        });
        saved.farmId = anchors.farmId;
        saved.farmCropId = anchors.farmCropId;
      }
      return saved;
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

  /**
   * Spec 95 — `farmId` / `farmCropId` de `POST /surveys`, validados contra el
   * productor y la finca. `cropId` se resuelve como cultivo activo de la finca.
   */
  private async resolveCreateAnchors(
    dto: CreateSurveyDto,
    farmer: Farmer | null,
    crop: TypeOfCrop | null,
  ): Promise<{ farmId: string | null; farmCropId: string | null }> {
    const manager = this.surveysRepository.manager;
    let farmId = dto.farmId ?? null;
    let farmCropId = dto.farmCropId ?? null;

    if (farmCropId) {
      const [farmCrop] = await manager.query<{ farm_id: string }[]>(
        'SELECT farm_id FROM farms_crops WHERE farm_crop_id = $1',
        [farmCropId],
      );
      if (!farmCrop) throw new NotFoundException('Farm crop not found');
      if (farmId && farmCrop.farm_id !== farmId) {
        throw new BadRequestException('farmCropId does not belong to farmId');
      }
      farmId = farmCrop.farm_id;
    }

    if (farmId) {
      const [farm] = await manager.query<{ farm_id: string }[]>(
        'SELECT farm_id FROM farms WHERE farm_id = $1',
        [farmId],
      );
      if (!farm) throw new NotFoundException('Farm not found');
      if (farmer) {
        const [linked] = await manager.query<{ ok: number }[]>(
          `SELECT 1 AS ok FROM farmer_farms WHERE farmer_id = $1 AND farm_id = $2
           UNION ALL SELECT 1 FROM farmers WHERE id = $1 AND farm_id = $2 LIMIT 1`,
          [farmer.id, farmId],
        );
        if (!linked) {
          throw new BadRequestException(
            'The farm does not belong to the farmer',
          );
        }
      }
      if (!farmCropId && crop) {
        const [match] = await manager.query<{ farm_crop_id: string }[]>(
          `SELECT farm_crop_id FROM farms_crops
            WHERE farm_id = $1 AND crop_id = $2 AND archived_at IS NULL`,
          [farmId, crop.cropId],
        );
        farmCropId = match?.farm_crop_id ?? null;
      }
    }
    return { farmId, farmCropId };
  }

  async findAll(filters: SurveyFilters): Promise<Survey[]> {
    // Spec 94 — cada fila trae `farm` y `crop` (solo id y nombre): la finca a
    // la que está anclada la encuesta y su cultivo (derivado del cultivo de
    // finca). `farmCropId` / `farmId` también salen como columnas.
    const qb = this.surveysRepository
      .createQueryBuilder('survey')
      .leftJoinAndSelect('survey.instruments', 'instrument')
      .leftJoin('survey.campaignSession', 'campaignSession')
      .leftJoin('survey.farm', 'farm')
      .addSelect(['farm.farmId', 'farm.name'])
      .leftJoin('survey.crop', 'crop')
      .addSelect(['crop.cropId', 'crop.name']);

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
      qb.andWhere('crop.cropId = :cropId', { cropId: filters.cropId });
    }

    if (filters.instrumentId) {
      qb.andWhere('instrument.instrumentId = :instrumentId', {
        instrumentId: filters.instrumentId,
      });
    }

    // `farmerId` sigue resolviendo los DOS caminos (encuesta y sesión) hasta H8.
    if (filters.farmerId) {
      qb.andWhere(
        '(survey.farmer = :farmerId OR campaignSession.farmer = :farmerId)',
        { farmerId: filters.farmerId },
      );
    }

    if (filters.farmId) {
      qb.andWhere('survey.farmId = :farmId', { farmId: filters.farmId });
    }

    if (filters.farmCropId) {
      qb.andWhere('survey.farmCropId = :farmCropId', {
        farmCropId: filters.farmCropId,
      });
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

  // Spec 68, Fase 8 — aplica el documento corregido sobre la respuesta ya
  // persistida de la encuesta. Elige la misma respuesta que la extracción
  // usaría como documento del agricultor: la del productor cuando el
  // encuestado no lo es (Q9 = false) y esa respuesta existe, la del
  // encuestado en cualquier otro caso.
  private async applyCorrectedDocumentId(
    manager: EntityManager,
    surveyId: string,
    correctedDocumentId: string,
    requester?: AuthenticatedUser,
  ): Promise<void> {
    // El DTO ya recorta; esto es una segunda barrera para que un valor en
    // blanco o fuera de rango nunca llegue a la respuesta.
    const corrected = correctedDocumentId.trim();
    if (corrected.length < 3 || corrected.length > 50) {
      throw new BadRequestException(
        'correctedDocumentId must be between 3 and 50 characters',
      );
    }

    const survey = await manager.findOne(Survey, {
      where: { surveyId },
      relations: ['responses', 'responses.question', 'user', 'farmer'],
    });
    if (!survey) throw new NotFoundException('Survey not found');

    // Un POLLSTER solo corrige sus propias encuestas (mismo criterio que
    // `findSurveyResponses`, spec 92): 404, sin revelar que la ajena existe.
    // Una encuesta sin dueño (anterior a spec 86) se trata como propia, igual
    // que en el móvil.
    if (
      requester?.role === ROLES.POLLSTER &&
      survey.user &&
      survey.user.userId !== requester.userId
    ) {
      throw new NotFoundException('Survey not found');
    }

    // Con el agricultor ya extraído, reescribir la respuesta dejaría la
    // encuesta y el agricultor con documentos distintos.
    // Salvo que sea un reintento idempotente: si el POST anterior se confirmó
    // pero la respuesta se perdió, el móvil reenvía el mismo documento
    // corregido (`withNetworkRetry`) y debe recibir al agricultor, no un 422.
    if (survey.farmer) {
      if (
        normalizeDocumentId(survey.farmer.documentId) ===
        normalizeDocumentId(corrected)
      ) {
        return;
      }
      throw new UnprocessableEntityException(
        'Survey already has a farmer; its document can no longer be corrected',
      );
    }

    const responses = survey.responses ?? [];
    const isRespondent = responses.find(
      (r) => r.question?.systemField === 'farmer.isRespondent',
    )?.booleanValue;

    const producerResponse = responses.find(
      (r) => r.question?.systemField === 'farmer.producerDocumentId',
    );
    const respondentResponse = responses.find(
      (r) => r.question?.systemField === 'farmer.documentId',
    );

    const target =
      isRespondent === false && producerResponse
        ? producerResponse
        : respondentResponse;

    if (!target) {
      throw new UnprocessableEntityException(
        'Survey has no document response to correct',
      );
    }

    await manager.update(Response, target.responseId, {
      textValue: corrected,
    });

    // La colisión que registró el documento mal digitado era un error de
    // captura: se cierra como `corrected` para que no quede pendiente para
    // siempre en el registro ni en `list_document_collisions`. Si el
    // documento nuevo también choca, esa colisión se registra aparte.
    await manager.update(
      FarmerDocumentCollision,
      { survey: { surveyId }, resolution: IsNull() },
      { resolution: 'corrected', resolvedAt: new Date() },
    );

    this.logger.log(
      `[extractFarmer] corrected documentId on response ${target.responseId} of survey ${surveyId}`,
    );
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
    requester?: AuthenticatedUser,
  ): Promise<{
    farmer: Farmer;
    existed: boolean;
    crops: TypeOfCrop[];
    extraction: {
      status: string | null;
      farmId: string | null;
      farmCropId: string | null;
    };
  }> {
    try {
      // Spec 68, Fase 8 — "Corregir el documento". Para cuando el encuestador
      // ve el aviso, la encuesta ya está sincronizada y `createMany()` ignora
      // un batch cuya encuesta ya tiene respuestas, así que la corrección solo
      // llega por aquí. Va en su propia transacción, antes de la extracción:
      // si el documento nuevo también colisiona, la transacción principal se
      // revierte, y la corrección debe sobrevivir a ese 409 — el móvil ya la
      // descartó y el reintento leerá el documento persistido.
      const { correctedDocumentId } = dto;
      if (correctedDocumentId) {
        await this.surveysRepository.manager.transaction(async (manager) => {
          await this.extraction.lockSurvey(manager, surveyId);
          await this.applyCorrectedDocumentId(
            manager,
            surveyId,
            correctedDocumentId,
            requester,
          );
        });
      }
      // Spec 95 — alias delgado sobre la extracción unificada. El batch ya pudo
      // haber extraído: entonces esto es idempotente y devuelve al mismo productor.
      const result = await this.surveysRepository.manager.transaction(
        async (manager) => {
          const extracted = await this.extraction.extract(manager, surveyId, {
            trigger: 'alias',
            resolution: dto.resolution,
          });
          if (!extracted.farmer) {
            throw new UnprocessableEntityException(
              'farmer.name is required to extract farmer',
            );
          }
          return extracted;
        },
      );
      // Spec 94 (C7) — el productor sale con `farm` (la principal, con
      // `crops`) y `farms[]`, igual que `GET /farmers/:id`.
      return {
        farmer: await this.loadFarmerView(result.farmer!),
        existed: result.existed,
        crops: result.crops,
        extraction: {
          status: result.status,
          farmId: result.farm?.farmId ?? null,
          farmCropId: result.farmCropId,
        },
      };
    } catch (err) {
      throw await this.toCollisionConflict(err);
    }
  }

  /** Productor con la forma de `GET /farmers/:id` (spec 94); cae al original si no se halla. */
  private async loadFarmerView(farmer: Farmer): Promise<Farmer> {
    const full = await this.farmersRepository.findOne({
      where: { id: farmer.id },
      relations: [...FARMER_VIEW_RELATIONS],
    });
    return full ? toFarmerView(full) : farmer;
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
        await this.extraction.lockSurvey(manager, err.surveyId);
        await this.extraction.recordPendingCollision(manager, err);
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

    // Claves de multimedia en R2: se recolectan antes de borrar las filas y el
    // borrado real ocurre después (spec 85, D4).
    const mediaKeys = await this.mediaCleanup.collectBySurveys(
      this.surveysRepository.manager,
      [dto.surveyId],
    );

    // Clear pivot table rows before removing to avoid FK constraint violations
    survey.instruments = [];
    await this.surveysRepository.save(survey);
    await this.surveysRepository.remove(survey);

    await this.mediaCleanup.deleteAfterCommit(mediaKeys);

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

    const mediaKeys = await this.mediaCleanup.collectBySurveys(
      this.surveysRepository.manager,
      [surveyId],
    );

    // Clear pivot table rows before removing to avoid FK constraint violations
    survey.instruments = [];
    await this.surveysRepository.save(survey);
    await this.surveysRepository.remove(survey);

    await this.mediaCleanup.deleteAfterCommit(mediaKeys);

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

  // Spec 92, Fase 1 — GET /api/surveys/mine. Ver D7 (paginación) y el punto 1
  // de "Alcance" del spec para el detalle de cada filtro/campo.
  async findMine(
    userId: string,
    query: ListMySurveysQueryDto,
  ): Promise<MySurveysPageDto> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const qb = this.surveysRepository
      .createQueryBuilder('survey')
      .leftJoin('survey.farmer', 'surveyFarmer')
      .leftJoin('survey.campaignSession', 'campaignSession')
      .leftJoin('campaignSession.farmer', 'sessionFarmer')
      .leftJoin('campaignSession.campaign', 'campaign')
      // Spec 94 — finca y cultivo a los que está anclada la encuesta.
      .leftJoin('survey.farm', 'surveyFarm')
      .leftJoin('survey.crop', 'surveyCrop')
      .where('survey.user = :userId', { userId })
      .andWhere('survey.origin = :origin', { origin: 'field' })
      .andWhere(
        'EXISTS (SELECT 1 FROM responses r WHERE r.survey_id = survey.survey_id)',
      );

    if (query.search) {
      // Escapa los comodines de ILIKE antes de envolver en '%...%' — un
      // '%' o '_' literal en la búsqueda no debe comportarse como comodín.
      const escaped = query.search.replace(/[\\%_]/g, (c) => `\\${c}`);
      qb.andWhere(
        "(COALESCE(surveyFarmer.name, sessionFarmer.name) ILIKE :search ESCAPE '\\' " +
          "OR COALESCE(surveyFarmer.documentId, sessionFarmer.documentId) ILIKE :search ESCAPE '\\')",
        { search: `%${escaped}%` },
      );
    }

    // Clonada antes de fijar el SELECT de la página — getCount() ignora los
    // selects, pero clonar deja explícito que ambas consultas comparten
    // exactamente los mismos joins/where.
    const total = await qb.clone().getCount();

    const rawRows = await qb
      .select('survey.surveyId', 'surveyId')
      .addSelect('survey.clientSurveyId', 'clientSurveyId')
      .addSelect('survey.createdAt', 'createdAt')
      .addSelect('survey.updatedAt', 'updatedAt')
      .addSelect('surveyFarmer.id', 'surveyFarmerId')
      .addSelect('surveyFarmer.name', 'surveyFarmerName')
      .addSelect('sessionFarmer.id', 'sessionFarmerId')
      .addSelect('sessionFarmer.name', 'sessionFarmerName')
      .addSelect('campaign.name', 'campaignName')
      .addSelect('surveyFarm.farmId', 'farmId')
      .addSelect('surveyFarm.name', 'farmName')
      .addSelect('surveyCrop.cropId', 'cropId')
      .addSelect('surveyCrop.name', 'cropName')
      .addSelect(
        '(SELECT i.name FROM surveys_instruments si ' +
          'JOIN instruments i ON i.instrument_id = si.instrument_id ' +
          'WHERE si.survey_id = survey.survey_id ORDER BY i.name, i.instrument_id LIMIT 1)',
        'instrumentName',
      )
      // COUNT(DISTINCT question_id): una selección múltiple con varias
      // opciones guarda varias filas de response para la misma pregunta y
      // debe contar 1, no una por opción.
      .addSelect(
        '(SELECT COUNT(DISTINCT r.question_id) FROM responses r ' +
          'WHERE r.survey_id = survey.survey_id)',
        'responseCount',
      )
      .orderBy('survey.createdAt', 'DESC')
      .addOrderBy('survey.surveyId', 'DESC')
      .offset((page - 1) * limit)
      .limit(limit)
      .getRawMany<{
        surveyId: string;
        clientSurveyId: string | null;
        createdAt: Date;
        updatedAt: Date;
        surveyFarmerId: string | null;
        surveyFarmerName: string | null;
        sessionFarmerId: string | null;
        sessionFarmerName: string | null;
        campaignName: string | null;
        farmId: string | null;
        farmName: string | null;
        cropId: string | null;
        cropName: string | null;
        instrumentName: string | null;
        responseCount: string;
      }>();

    const items = rawRows.map((row) => ({
      surveyId: row.surveyId,
      clientSurveyId: row.clientSurveyId ?? null,
      instrumentName: row.instrumentName ?? null,
      campaignName: row.campaignName ?? null,
      farmer: row.surveyFarmerId
        ? { farmerId: row.surveyFarmerId, name: row.surveyFarmerName! }
        : row.sessionFarmerId
          ? { farmerId: row.sessionFarmerId, name: row.sessionFarmerName! }
          : null,
      farm: row.farmId ? { farmId: row.farmId, name: row.farmName! } : null,
      crop: row.cropId ? { cropId: row.cropId, name: row.cropName! } : null,
      responseCount: Number(row.responseCount),
      createdAt: new Date(row.createdAt).toISOString(),
      updatedAt: new Date(row.updatedAt).toISOString(),
    }));

    return { items, total, page, limit };
  }

  /** Spec 95 — `GET /surveys/:id/extraction`. */
  getExtraction(surveyId: string, requester: AuthenticatedUser) {
    return this.extraction.getSurveyExtraction(surveyId, requester);
  }

  async findSurveyResponses(surveyId: string, requester: AuthenticatedUser) {
    const survey = await this.surveysRepository.findOne({
      where: { surveyId },
      relations: { instruments: true, user: true, farm: true, crop: true },
    });

    if (!survey) {
      throw new NotFoundException('Survey not found');
    }

    // Spec 92, Fase 2 — un POLLSTER solo ve sus propias encuestas. 404, no
    // 403: no debe revelar que una encuesta ajena existe.
    const isPollster = requester.role === ROLES.POLLSTER;
    if (isPollster && survey.user?.userId !== requester.userId) {
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

    const rows = responses.map((r) => {
      // Adjunto subido con éxito — no basta con que exista una fila: el spec
      // 85 deja filas 'pending'/'failed' que nunca deben contar como evidencia.
      const uploadedAttachment =
        r.attachments?.find(
          (a) => a.status === MediaAttachmentStatus.UPLOADED,
        ) ?? null;
      const attachment = r.attachments?.[0] ?? null;

      return {
        responseId: r.responseId,
        questionId: r.question.questionId,
        questionText: r.question.text,
        questionType: r.question.type.name,
        // Spec 92 (aditivos para todos los roles): sectionId, sectionOrder, hasAttachment.
        sectionId: r.question.section.sectionId,
        sectionTitle: r.question.section.name,
        sectionOrder: r.question.section.order,
        textValue: r.textValue ?? null,
        numericValue: r.numericValue ?? null,
        booleanValue: r.booleanValue ?? null,
        optionText: r.option?.text ?? null,
        // Spec 89 — la respuesta "Otros" lleva su texto en textValue.
        isOther: r.option?.isOther ?? false,
        hasAttachment: uploadedAttachment !== null,
        // Spec 85: sin publicUrl; la evidencia se pide con URL firmada.
        attachmentId: attachment?.attachmentId ?? null,
        attachmentStatus: attachment?.status ?? null,
        mimeType: attachment?.mimeType ?? null,
        originalFilename: attachment?.originalFilename ?? null,
      };
    });

    return {
      surveyId: survey.surveyId,
      instrumentName: survey.instruments?.[0]?.name ?? null,
      // Spec 94 — finca y cultivo a los que está anclada la encuesta (para
      // todos los roles, también el POLLSTER: no son datos de descarga).
      farm: survey.farm
        ? { farmId: survey.farm.farmId, name: survey.farm.name }
        : null,
      crop: survey.crop
        ? { cropId: survey.crop.cropId, name: survey.crop.name }
        : null,
      syncedAt: survey.updatedAt.toISOString(),
      // D2 — lista BLANCA: al POLLSTER solo le llegan estos 12 campos, elegidos
      // uno a uno. Un campo nuevo en `rows` (p. ej. attachmentId del spec 85)
      // no le llega por omisión.
      responses: isPollster
        ? rows.map(
            (row): PollsterSurveyResponseRowDto => ({
              responseId: row.responseId,
              questionId: row.questionId,
              questionText: row.questionText,
              questionType: row.questionType,
              sectionId: row.sectionId,
              sectionTitle: row.sectionTitle,
              sectionOrder: row.sectionOrder,
              textValue: row.textValue,
              numericValue: row.numericValue,
              booleanValue: row.booleanValue,
              optionText: row.optionText,
              hasAttachment: row.hasAttachment,
            }),
          )
        : rows,
    };
  }

  /**
   * Spec 95 — alias de `extract-crops`: devuelve los cultivos que resuelve la
   * encuesta (nunca un `[]` sintético) y se asegura de que la extracción
   * unificada haya corrido. La suma de cultivos a la finca, el ancla y la
   * escritura de `campaign_sessions_crops` viven en `FarmerExtractionService`.
   */
  async extractCrops(surveyId: string): Promise<{ crops: TypeOfCrop[] }> {
    return this.surveysRepository.manager.transaction(async (manager) => {
      try {
        const result = await this.extraction.extract(manager, surveyId, {
          trigger: 'alias',
        });
        return { crops: result.crops };
      } catch (err) {
        // Con una colisión sin resolver este alias no decide nada sobre el
        // productor: solo informa los cultivos de la encuesta.
        if (!(err instanceof DocumentCollisionError)) throw err;
        const survey = await manager.findOne(Survey, {
          where: { surveyId },
          relations: ['responses', 'responses.question', 'responses.option'],
        });
        if (!survey) throw new NotFoundException('Survey not found');
        const { crops } = resolveCropsFromResponses(
          survey.responses ?? [],
          await manager.find(TypeOfCrop),
        );
        return { crops };
      }
    });
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
    const identity = this.extraction.pickFarmerIdentity(fieldMap);
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
          await this.extraction.findFarmersByDocument(
            manager,
            documentKey,
            true,
          )
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

    const respondentProfiles = responses.flatMap((r) => {
      const actorType = r.option?.metadataId
        ? actorTypes.get(r.option.metadataId)
        : undefined;
      return actorType && r.option
        ? [{ optionText: r.option.text, actorType }]
        : [];
    });
    const submittedFarm = this.submittedFarmValues(
      fieldMap,
      town?.townId ?? null,
    );

    const plan = buildPublicSubmissionPlan({
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
          values: submittedFarm,
        },
      },
      crops: {
        resolved: crops.map((c) => ({ cropId: c.cropId, name: c.name })),
        unmapped,
      },
      respondentProfiles,
      fieldWarnings: warnings,
      existingFarmCandidates: farmName
        ? await this.findFarmsByNormalizedName(
            manager,
            normalizeFarmKey(farmName),
          )
        : [],
      pendingPeers: await this.loadPendingPeers(manager, surveyId),
    });

    // Spec 95 — rol, cultivos y discrepancias que el procesado registraría.
    const matched =
      linkedFarmer ??
      (documentCandidates.length > 0
        ? selectFarmerByDocument(documentCandidates, identity.name ?? '').match
        : phoneMatch);
    const discrepancies: NonNullable<ProcessPreview['discrepancies']> = [];
    if (matched) {
      discrepancies.push(
        ...planFieldChanges(
          'farmer',
          matched.values,
          this.submittedFarmerValues(fieldMap, identity),
        ).discrepancies,
      );
      const farmNameDiffers = plan.warnings.some(
        (w) => w.code === 'different_farm_name_existing_farmer',
      );
      if (matched.farm && !farmNameDiffers) {
        discrepancies.push(
          ...planFieldChanges('farm', matched.farm.values, submittedFarm)
            .discrepancies,
        );
      }
    }
    return {
      ...plan,
      role: roleFromProfiles(respondentProfiles),
      farmCrops: plan.crops.resolved,
      discrepancies: discrepancies.map((d) => ({
        entity: d.entity,
        field: d.field,
        systemField: d.systemField,
        currentValue: d.currentValue,
        submittedValue: d.submittedValue,
      })),
    };
  }

  // Criterio 11/12 — mismo criterio de colisión del spec 68 que `extractFarmer`.
  // Spec 93: todo ocurre en UNA transacción bajo el lock de la encuesta —
  // comprobar el estado, extraer, actuar sobre la finca, sumar cultivos,
  // reanclar la constancia y marcar `processed`. Si algo falla no queda nada;
  // ante colisión sin resolver responde 409 y el envío queda `pending`.
  // Spec 95: la extracción es la del servicio unificado (`public_process`).
  async processPublicSubmission(
    surveyId: string,
    dto: ProcessPublicSubmissionDto,
    reviewedByUserId?: string,
  ): Promise<{
    farmer: Farmer;
    existed: boolean;
    farm: { farmId: string; name: string } | null;
    farmCrops: { farmCropId: string; cropId: string; name: string }[];
    role: string;
  }> {
    try {
      return await this.surveysRepository.manager.transaction(
        async (manager) => {
          await this.extraction.lockSurvey(manager, surveyId);
          // Se relee dentro del lock: un procesado concurrente ya pudo terminar.
          await this.loadPendingPublicSubmission(manager, surveyId);
          const result = await this.extraction.extract(manager, surveyId, {
            trigger: 'public_process',
            resolution: dto.resolution,
            farmDecision: dto.farm ?? null,
            townId: dto.townId,
            role: dto.role,
            reviewedBy: reviewedByUserId,
          });
          if (!result.farmer) {
            throw new UnprocessableEntityException(
              'farmer.name is required to extract farmer',
            );
          }
          await manager.update(Survey, surveyId, {
            reviewStatus: 'processed',
            reviewedBy: reviewedByUserId
              ? ({ userId: reviewedByUserId } as User)
              : null,
            reviewedAt: new Date(),
          });
          const farmer = await manager.findOneOrFail(Farmer, {
            where: { id: result.farmer.id },
            relations: ['farm', 'farm.town'],
          });
          return {
            farmer,
            existed: result.existed,
            farm: result.farm
              ? { farmId: result.farm.farmId, name: result.farm.name }
              : null,
            farmCrops: result.farmCrops,
            role: result.role ?? 'producer',
          };
        },
      );
    } catch (err) {
      throw await this.toCollisionConflict(err);
    }
  }

  // Criterio 13 — descartar es un cambio de estado, no un borrado: la
  // encuesta y sus respuestas se conservan para auditoría. Idempotente
  // sobre un envío ya descartado (reintentar no es un error).
  async discardPublicSubmission(
    surveyId: string,
    reviewedByUserId?: string,
  ): Promise<{ surveyId: string; reviewStatus: string }> {
    // Spec 95 (D-H3-10) — bajo el lock de la encuesta: un procesado concurrente
    // no puede terminar entre la comprobación y la escritura.
    await this.surveysRepository.manager.transaction(async (manager) => {
      await this.extraction.lockSurvey(manager, surveyId);
      const survey = await manager.findOne(Survey, { where: { surveyId } });
      if (!survey) throw new NotFoundException('Survey not found');
      if (survey.origin !== 'public') {
        throw new ConflictException(
          'Esta encuesta no es un envío del canal público.',
        );
      }
      if (survey.reviewStatus === 'processed') {
        throw new ConflictException(
          'Este envío ya fue procesado y no puede descartarse.',
        );
      }
      if (survey.reviewStatus !== 'discarded') {
        await manager.update(Survey, surveyId, {
          reviewStatus: 'discarded',
          reviewedBy: reviewedByUserId
            ? ({ userId: reviewedByUserId } as User)
            : null,
          reviewedAt: new Date(),
        });
      }
    });

    return { surveyId, reviewStatus: 'discarded' };
  }
}
