import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Farm } from 'src/farms/entities/farm.entity';
import { FarmPlot } from './entities/farm-plot.entity';
import { FarmPlotsController } from './farm-plots.controller';
import { FarmPlotsService } from './farm-plots.service';

@Module({
  imports: [TypeOrmModule.forFeature([FarmPlot, Farm])],
  controllers: [FarmPlotsController],
  providers: [FarmPlotsService],
})
export class FarmPlotsModule {}
