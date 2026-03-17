import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TypeOfQuestion } from './entities/type-of-question.entity';

@Module({
  imports: [TypeOrmModule.forFeature([TypeOfQuestion])],
})
export class TypesOfQuestionsModule {}
