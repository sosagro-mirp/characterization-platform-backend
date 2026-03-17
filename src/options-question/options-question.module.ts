import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OptionQuestion } from './entities/option-question.entity';

@Module({
  imports: [TypeOrmModule.forFeature([OptionQuestion])],
})
export class OptionsQuestionModule {}
