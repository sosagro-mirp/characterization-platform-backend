import { Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ActorType } from 'src/actor-types/entities/actor-type.entity';
import { CampaignSession } from 'src/campaign-sessions/entities/campaign-session.entity';
import { Department } from 'src/departments/entities/department.entity';
import { Farm } from 'src/farms/entities/farm.entity';
import { Farmer } from 'src/farmers/entities/farmer.entity';
import { Instrument } from 'src/instruments/entities/instrument.entity';
import { Town } from 'src/towns/entities/town.entity';
import { TypeOfCrop } from 'src/types-of-crops/entities/type-of-crop.entity';
import { User } from 'src/users/entities/user.entity';
import { In, Repository } from 'typeorm';
import { CreateSurveyDto } from './dto/create-survey.dto';
import { Survey } from './entities/survey.entity';

export interface SurveyFilters {
  actorTypeId?: string;
  departmentId?: string;
  townId?: string;
  vereda?: string;
  cropId?: string;
  instrumentId?: string;
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
        throw new NotFoundException('User not found');
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
      .leftJoinAndSelect('survey.instruments', 'instrument');

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

    const name = fieldMap['farmer.name'] as string | undefined;
    if (!name) {
      throw new UnprocessableEntityException('farmer.name is required to extract farmer');
    }

    const documentId = fieldMap['farmer.documentId'] as string | undefined;

    // Dedup: if documentId is present and a farmer with that document already exists, reuse it
    let farmer: Farmer | null = null;
    let existed = false;
    if (documentId) {
      farmer = await this.farmersRepository.findOne({ where: { documentId } });
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
            longitude: (fieldMap['farm.longitude'] as number | undefined) ?? null,
            altitude: (fieldMap['farm.altitude'] as number | undefined) ?? null,
          }),
        );
      }

      farmer = await this.farmersRepository.save(
        this.farmersRepository.create({
          name,
          lastName: null,
          documentId: documentId ?? null,
          phone: (fieldMap['farmer.phone'] as string | undefined) ?? null,
          email: (fieldMap['farmer.email'] as string | undefined) ?? null,
          farm: farm ?? undefined,
        }),
      );
    }

    // Link farmer to the CampaignSession if the survey belongs to one
    if (survey.campaignSession) {
      survey.campaignSession.farmer = farmer;
      await this.campaignSessionsRepository.save(survey.campaignSession);
    }

    return { farmer, existed };
  }

  async extractCrops(surveyId: string): Promise<{ crops: TypeOfCrop[] }> {
    const survey = await this.surveysRepository.findOne({
      where: { surveyId },
      relations: ['responses', 'responses.question', 'campaignSession', 'campaignSession.crops'],
    });

    if (!survey) throw new NotFoundException('Survey not found');

    // Collect crop names from affirmative yes/no responses with systemField 'crop.*'
    const cropNames: string[] = [];
    for (const response of survey.responses ?? []) {
      const sf = response.question?.systemField;
      if (!sf?.startsWith('crop.')) continue;
      if (response.booleanValue === true) {
        cropNames.push(sf.split('.')[1]);
      }
    }

    // Load matching TypeOfCrop entities by name
    const crops =
      cropNames.length > 0
        ? await this.typesOfCropsRepository.find({ where: { name: In(cropNames) } })
        : [];

    // Assign to CampaignSession if survey belongs to one
    if (survey.campaignSession) {
      survey.campaignSession.crops = crops;
      await this.campaignSessionsRepository.save(survey.campaignSession);
    }

    return { crops };
  }
}
