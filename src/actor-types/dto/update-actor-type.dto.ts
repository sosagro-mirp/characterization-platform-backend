import { PartialType } from '@nestjs/swagger';
import { CreateActorTypeDto } from './create-actor-type.dto';

export class UpdateActorTypeDto extends PartialType(CreateActorTypeDto) {}
