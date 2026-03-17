import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Institution } from './entities/institution.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Institution])],
})
export class InstitutionsModule {}
