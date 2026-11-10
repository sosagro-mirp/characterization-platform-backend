import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
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
import { FarmPlotsService } from './farm-plots.service';
import { CreateFarmPlotDto } from './dto/create-farm-plot.dto';
import { UpdateFarmPlotDto } from './dto/update-farm-plot.dto';

@ApiTags('Farm Plots')
@ApiBearerAuth()
@Controller('farm-plots')
export class FarmPlotsController {
  constructor(private readonly farmPlotsService: FarmPlotsService) {}

  @Post()
  @Roles(ROLES.ADMIN, ROLES.POLLSTER)
  @ApiOperation({ summary: 'Crear lote con polígono GPS' })
  @ApiResponse({ status: 201, description: 'Lote creado.' })
  @ApiResponse({ status: 400, description: 'Datos de entrada inválidos.' })
  @ApiResponse({ status: 404, description: 'Finca no encontrada.' })
  create(@Body() dto: CreateFarmPlotDto) {
    return this.farmPlotsService.create(dto);
  }

  @Get('by-farm/:farmId')
  @Roles(ROLES.ADMIN, ROLES.RESEARCHER, ROLES.POLLSTER)
  @ApiOperation({ summary: 'Listar lotes de una finca' })
  @ApiParam({ name: 'farmId', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Lista de lotes de la finca.' })
  @ApiResponse({ status: 404, description: 'Finca no encontrada.' })
  findByFarm(@Param('farmId', ParseUUIDPipe) farmId: string) {
    return this.farmPlotsService.findByFarm(farmId);
  }

  @Get(':farmPlotId')
  @Roles(ROLES.ADMIN, ROLES.RESEARCHER, ROLES.POLLSTER)
  @ApiOperation({ summary: 'Obtener un lote por ID' })
  @ApiParam({ name: 'farmPlotId', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Datos del lote.' })
  @ApiResponse({ status: 404, description: 'Lote no encontrado.' })
  findOne(@Param('farmPlotId', ParseUUIDPipe) farmPlotId: string) {
    return this.farmPlotsService.findOne(farmPlotId);
  }

  @Patch(':farmPlotId')
  @Roles(ROLES.ADMIN, ROLES.POLLSTER)
  @ApiOperation({ summary: 'Actualizar un lote' })
  @ApiParam({ name: 'farmPlotId', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Lote actualizado.' })
  @ApiResponse({ status: 404, description: 'Lote o finca no encontrado.' })
  update(
    @Param('farmPlotId', ParseUUIDPipe) farmPlotId: string,
    @Body() dto: UpdateFarmPlotDto,
  ) {
    return this.farmPlotsService.update(farmPlotId, dto);
  }

  @Delete(':farmPlotId')
  @HttpCode(204)
  @Roles(ROLES.ADMIN)
  @ApiOperation({ summary: 'Eliminar un lote' })
  @ApiParam({ name: 'farmPlotId', format: 'uuid' })
  @ApiResponse({ status: 204, description: 'Lote eliminado.' })
  @ApiResponse({ status: 404, description: 'Lote no encontrado.' })
  remove(@Param('farmPlotId', ParseUUIDPipe) farmPlotId: string) {
    return this.farmPlotsService.remove(farmPlotId);
  }
}
