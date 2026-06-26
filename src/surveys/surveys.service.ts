import { BadRequestException, Injectable, NotFoundException, UnauthorizedException, UnprocessableEntityException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ActorType } from 'src/actor-types/entities/actor-type.entity';
import { CampaignSession } from 'src/campaign-sessions/entities/campaign-session.entity';
import { Department } from 'src/departments/entities/department.entity';
import { Farm } from 'src/farms/entities/farm.entity';
import { Farmer } from 'src/farmers/entities/farmer.entity';
import { Instrument } from 'src/instruments/entities/instrument.entity';
import { Response } from 'src/responses/entities/response.entity';
import { Town } from 'src/towns/entities/town.entity';
import { TypeOfCrop } from 'src/types-of-crops/entities/type-of-crop.entity';
import { User } from 'src/users/entities/user.entity';
import { In, Repository } from 'typeorm';
import { CreateSurveyDto } from './dto/create-survey.dto';
import { OverwriteSurveyDto } from './dto/overwrite-survey.dto';
import { SkipStepDto } from './dto/skip-step.dto';
import { Survey } from './entities/survey.entity';

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
  ) {}

  async create(createSurveyDto: CreateSurveyDto, userId?: string): Promise<Survey> {
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
        throw new UnauthorizedException('User account not found — please log in again');
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
    });

    return await this.surveysRepository.save(survey);
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

  async extractFarmer(surveyId: string): Promise<{ farmer: Farmer; existed: boolean }> {
    const survey = await this.surveysRepository.findOne({
      where: { surveyId },
      relations: ['responses', 'responses.question', 'campaignSession'],
    });

    if (!survey) throw new NotFoundException('Survey not found');

    // Build systemField → value map from all responses that have systemField set
    const fieldMap: Record<string, string | number | boolean> = {};
    for (const response of survey.responses ?? []) {
      const sf = response.question?.systemField;
      if (!sf) continue;
      const value = response.textValue ?? response.numericValue ?? response.booleanValue;
      if (value !== undefined && value !== null) {
        fieldMap[sf] = value;
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
      farmerDocumentId = fieldMap['farmer.producerDocumentId'] as string | undefined;

      // Fallback: if producer name/documentId unknown, use respondent's as provisional
      if (!farmerName) {
        farmerName = fieldMap['farmer.name'] as string | undefined;
      }
      if (!farmerDocumentId) {
        farmerDocumentId = fieldMap['farmer.documentId'] as string | undefined;
      }

      await this.surveysRepository.update(surveyId, {
        respondentName: (fieldMap['farmer.name'] as string | undefined) || undefined,
        respondentPhone: (fieldMap['farmer.phone'] as string | undefined) || undefined,
        respondentDocumentId: (fieldMap['farmer.documentId'] as string | undefined) || undefined,
        respondentEmail: (fieldMap['farmer.email'] as string | undefined) || undefined,
      });
    }

    if (!farmerName) {
      throw new UnprocessableEntityException('farmer.name is required to extract farmer');
    }

    // Dedup by two levels when Q9=false and producerDocumentId absent
    let farmer: Farmer | null = null;
    let existed = false;

    // Level 1: dedup by documentId (solid)
    if (farmerDocumentId) {
      farmer = await this.farmersRepository.findOne({ where: { documentId: farmerDocumentId } });
      if (farmer) existed = true;
    }

    // Level 2: dedup by name + phone (heuristic fallback when no documentId)
    if (!farmer && farmerPhone) {
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
            vereda:                (fieldMap['farm.vereda']                as string  | undefined) ?? null,
            latitude:              (fieldMap['farm.latitude']              as number  | undefined) ?? null,
            longitude:             (fieldMap['farm.longitude']             as number  | undefined) ?? null,
            altitude:              (fieldMap['farm.altitude']              as number  | undefined) ?? null,
            area:                  (fieldMap['farm.area']                  as number  | undefined) ?? null,
            waterAccess:           (fieldMap['farm.waterAccess']           as boolean | undefined) ?? null,
            internetAccess:        (fieldMap['farm.internetAccess']        as boolean | undefined) ?? null,
            mainAccessType:        (fieldMap['farm.mainAccessType']        as string  | undefined) ?? null,
            electricitySourceType: (fieldMap['farm.electricitySourceType'] as string  | undefined) ?? null,
            waterSourceType:       (fieldMap['farm.waterSourceType']       as string  | undefined) ?? null,
            plotCount:             (fieldMap['farm.plotCount']             as number  | undefined) ?? null,
          }),
        );
      }

      farmer = await this.farmersRepository.save(
        this.farmersRepository.create({
          name: farmerName,
          lastName: null,
          documentId: farmerDocumentId ?? null,
          phone: farmerPhone ?? null,
          email: farmerEmail ?? null,
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
    }

    return { farmer, existed };
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

  async overwriteSurvey(dto: OverwriteSurveyDto): Promise<{ surveyId: string }> {
    const survey = await this.surveysRepository.findOne({
      where: { surveyId: dto.surveyId },
      relations: ['instruments', 'campaignSession', 'campaignSession.campaign'],
    });
    if (!survey) throw new NotFoundException('Survey not found');

    const targetSession = await this.campaignSessionsRepository.findOne({
      where: { sessionId: dto.sessionId },
      relations: ['campaign'],
    });
    if (!targetSession) throw new NotFoundException('CampaignSession not found');

    if (survey.campaignSession?.campaign?.campaignId !== targetSession.campaign?.campaignId) {
      throw new BadRequestException('Survey does not belong to the same campaign as the session');
    }

    const instrument = await this.instrumentsRepository.findOne({
      where: { instrumentId: dto.instrumentId },
    });
    if (!instrument) throw new NotFoundException('Instrument not found');

    // Clear pivot table rows before removing to avoid FK constraint violations
    survey.instruments = [];
    await this.surveysRepository.save(survey);
    await this.surveysRepository.remove(survey);

    const newSurvey = this.surveysRepository.create({
      campaignSession: targetSession,
      instruments: [instrument],
      stepOrder: dto.stepOrder,
    });
    const saved = await this.surveysRepository.save(newSurvey);
    return { surveyId: saved.surveyId };
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

    // Create an empty survey as a skip marker — getNextStep treats any survey
    // with a stepOrder as "completed" regardless of whether it has responses.
    const survey = this.surveysRepository.create({
      campaignSession: session,
      instruments: [instrument],
      stepOrder: dto.stepOrder,
    });
    const saved = await this.surveysRepository.save(survey);
    return { surveyId: saved.surveyId };
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
      cacao:    'Cacao',
      cafe:     'Café',
      cannabis: 'Cannabis',
      canamo:   'Cáñamo',
    };

    // Collect crop names from affirmative yes/no responses with systemField 'crop.*'
    const cropNames: string[] = [];
    for (const response of survey.responses ?? []) {
      const sf = response.question?.systemField;
      if (!sf?.startsWith('crop.')) continue;
      if (response.booleanValue === true) {
        const key = sf.split('.')[1];
        const resolved = CROP_FIELD_MAP[key] ?? key;
        cropNames.push(resolved);
      }
    }

    // Load matching TypeOfCrop entities by name
    const crops =
      cropNames.length > 0
        ? await this.typesOfCropsRepository.find({ where: { name: In(cropNames) } })
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

        // Propagate crops to the farmer's Farm so the admin edit UI reflects real data
        if (session.farmer?.farm?.farmId) {
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
