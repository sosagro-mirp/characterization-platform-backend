import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TypeOfInstitution } from './entities/type-of-institution.entity';

@Module({
  imports: [TypeOrmModule.forFeature([TypeOfInstitution])],
})
export class TypesOfInstitutionsModule {}
