import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ActorType } from 'src/actor-types/entities/actor-type.entity';
import { CampaignSession } from 'src/campaign-sessions/entities/campaign-session.entity';
import { Department } from 'src/departments/entities/department.entity';
import { Farm } from 'src/farms/entities/farm.entity';
import { Farmer } from 'src/farmers/entities/farmer.entity';
import { Instrument } from 'src/instruments/entities/instrument.entity';
import { Town } from 'src/towns/entities/town.entity';
import { TypeOfCrop } from 'src/types-of-crops/entities/type-of-crop.entity';
import { User } from 'src/users/entities/user.entity';
import { SurveysController } from './surveys.controller';
import { Survey } from './entities/survey.entity';
import { SurveysService } from './surveys.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Survey,
      Instrument,
      Farmer,
      Farm,
      User,
      ActorType,
      Department,
      Town,
      TypeOfCrop,
      CampaignSession,
    ]),
  ],
  controllers: [SurveysController],
  providers: [SurveysService],
})
export class SurveysModule {}
