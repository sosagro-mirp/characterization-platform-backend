import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Laboratory } from './entities/laboratory.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Laboratory])],
})
export class LaboratoriesModule {}
