import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Question } from 'src/questions/entities/question.entity';
import { OptionsQuestionController } from './options-question.controller';
import { OptionsQuestionService } from './options-question.service';
import { OptionQuestion } from './entities/option-question.entity';

@Module({
  imports: [TypeOrmModule.forFeature([OptionQuestion, Question])],
  controllers: [OptionsQuestionController],
  providers: [OptionsQuestionService],
})
export class OptionsQuestionModule {}
