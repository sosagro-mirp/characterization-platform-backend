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
import { CooperativesService } from './cooperatives.service';
import { CreateCooperativeDto } from './dto/create-cooperative.dto';
import { UpdateCooperativeDto } from './dto/update-cooperative.dto';

@ApiTags('Cooperatives')
@ApiBearerAuth()
@Roles(ROLES.ADMIN)
@Controller('cooperatives')
export class CooperativesController {
  constructor(private readonly cooperativesService: CooperativesService) {}

  @Post()
  @ApiOperation({ summary: 'Crear cooperativa' })
  @ApiResponse({ status: 201, description: 'Cooperativa creada.' })
  @ApiResponse({ status: 400, description: 'Datos de entrada inválidos.' })
  create(@Body() createCooperativeDto: CreateCooperativeDto) {
    return this.cooperativesService.create(createCooperativeDto);
  }

  @Get()
  @ApiOperation({ summary: 'Listar cooperativas' })
  @ApiResponse({ status: 200, description: 'Lista de cooperativas.' })
  findAll() {
    return this.cooperativesService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener cooperativa por ID' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Cooperativa encontrada.' })
  @ApiResponse({ status: 404, description: 'Cooperativa no encontrada.' })
  findOne(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.cooperativesService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Actualizar cooperativa' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Cooperativa actualizada.' })
  @ApiResponse({ status: 404, description: 'Cooperativa no encontrada.' })
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() updateCooperativeDto: UpdateCooperativeDto,
  ) {
    return this.cooperativesService.update(id, updateCooperativeDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Eliminar cooperativa' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Cooperativa eliminada.' })
  @ApiResponse({ status: 404, description: 'Cooperativa no encontrada.' })
  remove(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.cooperativesService.remove(id);
  }
}
