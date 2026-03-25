import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Farmer } from 'src/farmers/entities/farmer.entity';
import { Instrument } from 'src/instruments/entities/instrument.entity';
import { User } from 'src/users/entities/user.entity';
import { In, Repository } from 'typeorm';
import { CreateSurveyDto } from './dto/create-survey.dto';
import { Survey } from './entities/survey.entity';

@Injectable()
export class SurveysService {
  constructor(
    @InjectRepository(Survey)
    private readonly surveysRepository: Repository<Survey>,
    @InjectRepository(Instrument)
    private readonly instrumentsRepository: Repository<Instrument>,
    @InjectRepository(Farmer)
    private readonly farmersRepository: Repository<Farmer>,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
  ) {}

  async create(createSurveyDto: CreateSurveyDto): Promise<Survey> {
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
    if (createSurveyDto.userId) {
      user = await this.usersRepository.findOne({
        where: { userId: createSurveyDto.userId },
      });

      if (!user) {
        throw new NotFoundException('User not found');
      }
    }

    const survey = this.surveysRepository.create({
      farmer: farmer ?? undefined,
      user: user ?? undefined,
      instruments,
      sincronized: createSurveyDto.sincronized ?? false,
    });

    return await this.surveysRepository.save(survey);
  }
}
