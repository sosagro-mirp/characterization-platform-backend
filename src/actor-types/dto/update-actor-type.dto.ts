import { PartialType } from '@nestjs/mapped-types';
import { CreateActorTypeDto } from './create-actor-type.dto';

export class UpdateActorTypeDto extends PartialType(CreateActorTypeDto) {}
