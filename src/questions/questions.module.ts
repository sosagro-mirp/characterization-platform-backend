import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OptionQuestion } from 'src/options-question/entities/option-question.entity';
import { Section } from 'src/sections/entities/section.entity';
import { TypeOfQuestion } from 'src/types-of-questions/entities/type-of-question.entity';
import { Response } from 'src/responses/entities/response.entity';
import { StepCondition } from 'src/campaigns/entities/step-condition.entity';
import { Question } from './entities/question.entity';
import { QuestionsController } from './questions.controller';
import { QuestionsService } from './questions.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Question,
      Section,
      TypeOfQuestion,
      OptionQuestion,
      // Spec 84 — countResponses() y las guardas de dependientes leen estas
      // entidades directamente; no hay dependencia de sus servicios/módulos.
      Response,
      StepCondition,
    ]),
  ],
  controllers: [QuestionsController],
  providers: [QuestionsService],
})
export class QuestionsModule {}
