import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataExportLog } from '../production-units/entities/data-export-log.entity';
import { ProductionUnitsModule } from '../production-units/production-units.module';
import { FarmSelectionEvent } from './entities/farm-selection-event.entity';
import { FarmSelection } from './entities/farm-selection.entity';
import { UnitSelectionsController } from './unit-selections.controller';
import { UnitSelectionsExportService } from './unit-selections-export.service';
import { UnitSelectionsService } from './unit-selections.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      FarmSelection,
      FarmSelectionEvent,
      DataExportLog,
    ]),
    ProductionUnitsModule,
  ],
  controllers: [UnitSelectionsController],
  providers: [UnitSelectionsService, UnitSelectionsExportService],
})
export class UnitSelectionsModule {}
