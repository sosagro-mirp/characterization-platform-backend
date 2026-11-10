import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { ROLES } from '../auth/constants';
import { FarmsService } from './farms.service';
import { CreateFarmDto } from './dto/create-farm.dto';
import { UpdateFarmDto } from './dto/update-farm.dto';
import { AddFarmCropDto } from './dto/add-farm-crop.dto';
import { FarmCropRefDto } from 'src/farmer-farms/dto/farmer-farm-view.dto';

@ApiTags('Farms')
@ApiBearerAuth()
@Controller('farms')
export class FarmsController {
  constructor(private readonly farmsService: FarmsService) {}

  @Post()
  @Roles(ROLES.ADMIN)
  @ApiOperation({ summary: 'Crear finca' })
  @ApiResponse({ status: 201, description: 'Finca creada.' })
  @ApiResponse({ status: 400, description: 'Datos de entrada inválidos.' })
  create(@Body() createFarmDto: CreateFarmDto) {
    return this.farmsService.create(createFarmDto);
  }

  @Get()
  @Roles(ROLES.ADMIN)
  @ApiOperation({ summary: 'Listar fincas' })
  @ApiResponse({ status: 200, description: 'Lista de fincas.' })
  findAll() {
    return this.farmsService.findAll();
  }

  @Get(':id')
  @Roles(ROLES.ADMIN, ROLES.RESEARCHER)
  @ApiOperation({
    summary: 'Obtener finca por ID',
    description:
      'Spec 94. `crops` (cultivos activos, contrato histórico) se mantiene; se agregan ' +
      '`farmCrops` (activos con `farmCropId`, el que referencian las encuestas) y ' +
      '`farmers` (productores vinculados con `role` e `isPrimary`).',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Finca encontrada.' })
  @ApiResponse({ status: 404, description: 'Finca no encontrada.' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.farmsService.findOne(id);
  }

  @Patch(':id')
  @Roles(ROLES.ADMIN, ROLES.RESEARCHER)
  @ApiOperation({
    summary: 'Actualizar finca',
    description:
      'Spec 94. `cropIds` conserva su contrato pero es ADITIVO: suma los que faltan, ' +
      'reactiva los archivados que vuelven y ARCHIVA los que se quitan (las encuestas ' +
      'ancladas a un cultivo archivado lo conservan). Nunca borra cultivos de la finca.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Finca actualizada.' })
  @ApiResponse({ status: 404, description: 'Finca no encontrada.' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateFarmDto: UpdateFarmDto,
  ) {
    return this.farmsService.update(id, updateFarmDto);
  }

  @Post(':id/crops')
  @Roles(ROLES.ADMIN, ROLES.RESEARCHER)
  @ApiOperation({
    summary: 'Sumar un cultivo a la finca (spec 94)',
    description:
      'Idempotente: si el cultivo ya está activo no cambia nada; si estaba archivado, ' +
      'lo reactiva conservando su `farmCropId`.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({
    status: 201,
    type: FarmCropRefDto,
    description: 'Cultivo de la finca: { farmCropId, cropId, name }.',
  })
  @ApiResponse({ status: 404, description: 'Finca o cultivo no encontrado.' })
  addCrop(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AddFarmCropDto) {
    return this.farmsService.addCrop(id, dto);
  }

  @Delete(':id')
  @Roles(ROLES.ADMIN)
  @ApiOperation({ summary: 'Eliminar finca' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Finca eliminada.' })
  @ApiResponse({ status: 404, description: 'Finca no encontrada.' })
  @ApiResponse({
    status: 409,
    description: 'La finca tiene encuestas ancladas (spec 94).',
  })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.farmsService.remove(id);
  }
}
