import { Module } from '@nestjs/common';
import { ProductionUnitsController } from './production-units.controller';
import { ProductionUnitsService } from './production-units.service';

@Module({
  controllers: [ProductionUnitsController],
  providers: [ProductionUnitsService],
})
export class ProductionUnitsModule {}
