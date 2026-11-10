import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Question } from 'src/questions/entities/question.entity';
import { Response } from 'src/responses/entities/response.entity';
import { OptionsQuestionController } from './options-question.controller';
import { OptionsQuestionService } from './options-question.service';
import { OptionQuestion } from './entities/option-question.entity';

@Module({
  imports: [TypeOrmModule.forFeature([OptionQuestion, Question, Response])],
  controllers: [OptionsQuestionController],
  providers: [OptionsQuestionService],
})
export class OptionsQuestionModule {}
