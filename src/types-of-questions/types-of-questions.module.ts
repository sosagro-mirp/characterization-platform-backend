import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TypeOfQuestion } from './entities/type-of-question.entity';
import { TypesOfQuestionsController } from './types-of-questions.controller';
import { TypesOfQuestionsService } from './types-of-questions.service';

@Module({
  imports: [TypeOrmModule.forFeature([TypeOfQuestion])],
  controllers: [TypesOfQuestionsController],
  providers: [TypesOfQuestionsService],
  exports: [TypesOfQuestionsService],
})
export class TypesOfQuestionsModule {}
