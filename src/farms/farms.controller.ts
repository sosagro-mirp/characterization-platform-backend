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
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { ROLES } from '../auth/constants';
import { FarmsService } from './farms.service';
import { CreateFarmDto } from './dto/create-farm.dto';
import { UpdateFarmDto } from './dto/update-farm.dto';

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
  @ApiOperation({ summary: 'Obtener finca por ID' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Finca encontrada.' })
  @ApiResponse({ status: 404, description: 'Finca no encontrada.' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.farmsService.findOne(id);
  }

  @Patch(':id')
  @Roles(ROLES.ADMIN, ROLES.RESEARCHER)
  @ApiOperation({ summary: 'Actualizar finca' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Finca actualizada.' })
  @ApiResponse({ status: 404, description: 'Finca no encontrada.' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() updateFarmDto: UpdateFarmDto) {
    return this.farmsService.update(id, updateFarmDto);
  }

  @Delete(':id')
  @Roles(ROLES.ADMIN)
  @ApiOperation({ summary: 'Eliminar finca' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Finca eliminada.' })
  @ApiResponse({ status: 404, description: 'Finca no encontrada.' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.farmsService.remove(+id);
  }
}
