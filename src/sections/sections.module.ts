import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Section } from './entities/section.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Section])],
})
export class SectionsModule {}
