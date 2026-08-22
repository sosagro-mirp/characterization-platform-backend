import { PartialType } from '@nestjs/swagger';
import { CreateFarmPlotDto } from './create-farm-plot.dto';

export class UpdateFarmPlotDto extends PartialType(CreateFarmPlotDto) {}
