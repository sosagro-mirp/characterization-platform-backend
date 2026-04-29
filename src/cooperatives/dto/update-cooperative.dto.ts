import { PartialType } from '@nestjs/swagger';
import { CreateCooperativeDto } from './create-cooperative.dto';

export class UpdateCooperativeDto extends PartialType(CreateCooperativeDto) {}
