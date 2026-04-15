import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { FarmsService } from './farms.service';
import { CreateFarmDto } from './dto/create-farm.dto';
import { UpdateFarmDto } from './dto/update-farm.dto';

@ApiTags('Farms')
@Controller('farms')
export class FarmsController {
  constructor(private readonly farmsService: FarmsService) {}

  @Post()
  @ApiOperation({ summary: 'Crear finca' })
  @ApiResponse({ status: 201, description: 'Finca creada.' })
  @ApiResponse({ status: 400, description: 'Datos de entrada inválidos.' })
  create(@Body() createFarmDto: CreateFarmDto) {
    return this.farmsService.create(createFarmDto);
  }

  @Get()
  @ApiOperation({ summary: 'Listar fincas' })
  @ApiResponse({ status: 200, description: 'Lista de fincas.' })
  findAll() {
    return this.farmsService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener finca por ID' })
  @ApiParam({ name: 'id', description: 'ID numérico de la finca' })
  @ApiResponse({ status: 200, description: 'Finca encontrada.' })
  @ApiResponse({ status: 404, description: 'Finca no encontrada.' })
  findOne(@Param('id') id: string) {
    return this.farmsService.findOne(+id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Actualizar finca' })
  @ApiParam({ name: 'id', description: 'ID numérico de la finca' })
  @ApiResponse({ status: 200, description: 'Finca actualizada.' })
  @ApiResponse({ status: 404, description: 'Finca no encontrada.' })
  update(@Param('id') id: string, @Body() updateFarmDto: UpdateFarmDto) {
    return this.farmsService.update(+id, updateFarmDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Eliminar finca' })
  @ApiParam({ name: 'id', description: 'ID numérico de la finca' })
  @ApiResponse({ status: 200, description: 'Finca eliminada.' })
  @ApiResponse({ status: 404, description: 'Finca no encontrada.' })
  remove(@Param('id') id: string) {
    return this.farmsService.remove(+id);
  }
}
