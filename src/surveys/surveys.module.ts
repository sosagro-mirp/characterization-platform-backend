import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Farmer } from 'src/farmers/entities/farmer.entity';
import { Instrument } from 'src/instruments/entities/instrument.entity';
import { User } from 'src/users/entities/user.entity';
import { SurveysController } from './surveys.controller';
import { Survey } from './entities/survey.entity';
import { SurveysService } from './surveys.service';

@Module({
  imports: [TypeOrmModule.forFeature([Survey, Instrument, Farmer, User])],
  controllers: [SurveysController],
  providers: [SurveysService],
})
export class SurveysModule {}
