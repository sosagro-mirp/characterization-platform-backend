import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Survey } from 'src/surveys/entities/survey.entity';
import { Response } from 'src/responses/entities/response.entity';
import { Question } from 'src/questions/entities/question.entity';
import { OptionQuestion } from 'src/options-question/entities/option-question.entity';
import { TypeOfQuestion } from 'src/types-of-questions/entities/type-of-question.entity';
import { Section } from 'src/sections/entities/section.entity';
import { Instrument } from 'src/instruments/entities/instrument.entity';
import { Department } from 'src/departments/entities/department.entity';
import { Town } from 'src/towns/entities/town.entity';
import { TypeOfCrop } from 'src/types-of-crops/entities/type-of-crop.entity';
import { ActorType } from 'src/actor-types/entities/actor-type.entity';
import { DashboardCategory } from './entities/dashboard-category.entity';
import { DashboardChart } from './entities/dashboard-chart.entity';
import { DashboardChartSource } from './entities/dashboard-chart-source.entity';
import { DashboardChartEvent } from './entities/dashboard-chart-event.entity';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Survey,
      Response,
      Question,
      OptionQuestion,
      TypeOfQuestion,
      Section,
      Instrument,
      Department,
      Town,
      TypeOfCrop,
      ActorType,
      DashboardCategory,
      DashboardChart,
      DashboardChartSource,
      DashboardChartEvent,
    ]),
  ],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
