import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConsentsModule } from '../consents/consents.module';
import { DataExportLog } from './entities/data-export-log.entity';
import { ProductionUnitsController } from './production-units.controller';
import { ProductionUnitsExportService } from './production-units-export.service';
import { ProductionUnitsService } from './production-units.service';

@Module({
  imports: [TypeOrmModule.forFeature([DataExportLog]), ConsentsModule],
  controllers: [ProductionUnitsController],
  providers: [ProductionUnitsService, ProductionUnitsExportService],
  exports: [ProductionUnitsService],
})
export class ProductionUnitsModule {}
