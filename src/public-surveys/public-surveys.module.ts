import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConsentDocument } from 'src/consents/entities/consent-document.entity';
import { ConsentRecord } from 'src/consents/entities/consent-record.entity';
import { Instrument } from 'src/instruments/entities/instrument.entity';
import { InstrumentsModule } from 'src/instruments/instruments.module';
import { OptionQuestion } from 'src/options-question/entities/option-question.entity';
import { Question } from 'src/questions/entities/question.entity';
import { Response } from 'src/responses/entities/response.entity';
import { Survey } from 'src/surveys/entities/survey.entity';
import { PublicSurveysController } from './public-surveys.controller';
import { PublicSurveysService } from './public-surveys.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Instrument,
      Survey,
      Question,
      OptionQuestion,
      Response,
      ConsentDocument,
      ConsentRecord,
    ]),
    InstrumentsModule,
  ],
  controllers: [PublicSurveysController],
  providers: [PublicSurveysService],
})
export class PublicSurveysModule {}
