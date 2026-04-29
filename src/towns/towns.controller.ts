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
import { TownsService } from './towns.service';
import { CreateTownDto } from './dto/create-town.dto';
import { UpdateTownDto } from './dto/update-town.dto';

@ApiTags('Towns')
@ApiBearerAuth()
@Roles(ROLES.ADMIN)
@Controller('towns')
export class TownsController {
  constructor(private readonly townsService: TownsService) {}

  @Post()
  @ApiOperation({ summary: 'Crear municipio' })
  @ApiResponse({ status: 201, description: 'Municipio creado.' })
  @ApiResponse({ status: 400, description: 'Datos de entrada inválidos.' })
  create(@Body() createTownDto: CreateTownDto) {
    return this.townsService.create(createTownDto);
  }

  @Get()
  @ApiOperation({ summary: 'Listar municipios' })
  @ApiResponse({ status: 200, description: 'Lista de municipios.' })
  findAll() {
    return this.townsService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener municipio por ID' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Municipio encontrado.' })
  @ApiResponse({ status: 404, description: 'Municipio no encontrado.' })
  findOne(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.townsService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Actualizar municipio' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Municipio actualizado.' })
  @ApiResponse({ status: 404, description: 'Municipio no encontrado.' })
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() updateTownDto: UpdateTownDto,
  ) {
    return this.townsService.update(id, updateTownDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Eliminar municipio' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Municipio eliminado.' })
  @ApiResponse({ status: 404, description: 'Municipio no encontrado.' })
  remove(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.townsService.remove(id);
  }
}
