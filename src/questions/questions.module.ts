import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OptionQuestion } from 'src/options-question/entities/option-question.entity';
import { Section } from 'src/sections/entities/section.entity';
import { TypeOfQuestion } from 'src/types-of-questions/entities/type-of-question.entity';
import { Question } from './entities/question.entity';
import { QuestionsController } from './questions.controller';
import { QuestionsService } from './questions.service';

@Module({
  imports: [TypeOrmModule.forFeature([Question, Section, TypeOfQuestion, OptionQuestion])],
  controllers: [QuestionsController],
  providers: [QuestionsService],
})
export class QuestionsModule {}
