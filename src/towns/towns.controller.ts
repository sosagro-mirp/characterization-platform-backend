import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';
import { Roles } from '../auth/decorators/roles.decorator';
import { ROLES } from '../auth/constants';
import { Public } from '../auth/decorators/public.decorator';
import { TownsService } from './towns.service';
import { CreateTownDto } from './dto/create-town.dto';
import { UpdateTownDto } from './dto/update-town.dto';

class FindAllTownsPublicQuery {
  @IsOptional()
  @IsUUID()
  departmentId?: string;
}

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

  @Public()
  @Get('public')
  @ApiOperation({
    summary: 'Listar municipios (público)',
    description: 'Ruta pública para el selector de filtros del dashboard. No requiere autenticación.',
  })
  @ApiQuery({
    name: 'departmentId',
    required: false,
    description: 'Filtrar municipios por departamento',
    schema: { type: 'string', format: 'uuid' },
  })
  @ApiResponse({ status: 200, description: 'Lista de municipios.' })
  findAllPublic(@Query() query: FindAllTownsPublicQuery) {
    return this.townsService.findAllPublic(query.departmentId);
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
