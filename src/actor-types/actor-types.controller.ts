import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ActorTypesService } from './actor-types.service';
import { CreateActorTypeDto } from './dto/create-actor-type.dto';
import { UpdateActorTypeDto } from './dto/update-actor-type.dto';

@Controller('actor-types')
export class ActorTypesController {
  constructor(private readonly actorTypesService: ActorTypesService) {}

  @Post()
  create(@Body() createActorTypeDto: CreateActorTypeDto) {
    return this.actorTypesService.create(createActorTypeDto);
  }

  @Get()
  findAll() {
    return this.actorTypesService.findAll();
  }

  @Get(':id')
  findOne(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.actorTypesService.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() updateActorTypeDto: UpdateActorTypeDto,
  ) {
    return this.actorTypesService.update(id, updateActorTypeDto);
  }

  @Delete(':id')
  remove(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.actorTypesService.remove(id);
  }
}
