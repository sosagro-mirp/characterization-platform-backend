import { PartialType } from '@nestjs/mapped-types';
import { CreateTownDto } from './create-town.dto';

export class UpdateTownDto extends PartialType(CreateTownDto) {}
