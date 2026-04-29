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
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { ROLES } from '../auth/constants';
import { ActorTypesService } from './actor-types.service';
import { CreateActorTypeDto } from './dto/create-actor-type.dto';
import { UpdateActorTypeDto } from './dto/update-actor-type.dto';

@ApiTags('Actor Types')
@ApiBearerAuth()
@Roles(ROLES.ADMIN)
@Controller('actor-types')
export class ActorTypesController {
  constructor(private readonly actorTypesService: ActorTypesService) {}

  @Post()
  @ApiOperation({ summary: 'Crear tipo de actor' })
  @ApiResponse({ status: 201, description: 'Tipo de actor creado.' })
  @ApiResponse({ status: 400, description: 'Datos de entrada inválidos.' })
  create(@Body() createActorTypeDto: CreateActorTypeDto) {
    return this.actorTypesService.create(createActorTypeDto);
  }

  @Get()
  @ApiOperation({ summary: 'Listar tipos de actor' })
  @ApiResponse({ status: 200, description: 'Lista de tipos de actor.' })
  findAll() {
    return this.actorTypesService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener tipo de actor por ID' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Tipo de actor encontrado.' })
  @ApiResponse({ status: 404, description: 'Tipo de actor no encontrado.' })
  findOne(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.actorTypesService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Actualizar tipo de actor' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Tipo de actor actualizado.' })
  @ApiResponse({ status: 404, description: 'Tipo de actor no encontrado.' })
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() updateActorTypeDto: UpdateActorTypeDto,
  ) {
    return this.actorTypesService.update(id, updateActorTypeDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Eliminar tipo de actor' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Tipo de actor eliminado.' })
  @ApiResponse({ status: 404, description: 'Tipo de actor no encontrado.' })
  remove(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.actorTypesService.remove(id);
  }
}
