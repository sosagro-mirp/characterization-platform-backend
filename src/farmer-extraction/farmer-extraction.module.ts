import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConsentsModule } from '../consents/consents.module';
import { EntityFieldDiscrepancy } from './entities/entity-field-discrepancy.entity';
import { FarmerClientAlias } from './entities/farmer-client-alias.entity';
import { DiscrepanciesController } from './discrepancies.controller';
import { DiscrepanciesService } from './discrepancies.service';
import { FarmerExtractionService } from './farmer-extraction.service';

/**
 * Spec 95 — extracción unificada del productor, la finca y los cultivos, y las
 * entidades de discrepancias y alias. Lo importan `SurveysModule` y
 * `ResponsesModule`; la API de discrepancias (`DiscrepanciesController`) vive aquí.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([EntityFieldDiscrepancy, FarmerClientAlias]),
    ConsentsModule,
  ],
  controllers: [DiscrepanciesController],
  providers: [FarmerExtractionService, DiscrepanciesService],
  exports: [FarmerExtractionService, DiscrepanciesService, TypeOrmModule],
})
export class FarmerExtractionModule {}
