import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OptionQuestion } from 'src/options-question/entities/option-question.entity';
import { Question } from 'src/questions/entities/question.entity';
import { Survey } from 'src/surveys/entities/survey.entity';
import { MediaAttachment } from 'src/media-attachments/entities/media-attachment.entity';
import { FarmerExtractionModule } from '../farmer-extraction/farmer-extraction.module';
import { ResponsesController } from './responses.controller';
import { Response } from './entities/response.entity';
import { ResponsesService } from './responses.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Response,
      Survey,
      Question,
      OptionQuestion,
      MediaAttachment,
    ]),
    FarmerExtractionModule,
  ],
  controllers: [ResponsesController],
  providers: [ResponsesService],
})
export class ResponsesModule {}
