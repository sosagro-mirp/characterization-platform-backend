import { Module } from '@nestjs/common';
import { CooperativesService } from './cooperatives.service';
import { CooperativesController } from './cooperatives.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Cooperative } from './entities/cooperative.entity';

@Module({
  controllers: [CooperativesController],
  providers: [CooperativesService],
  imports: [TypeOrmModule.forFeature([Cooperative])],
})
export class CooperativesModule {}
