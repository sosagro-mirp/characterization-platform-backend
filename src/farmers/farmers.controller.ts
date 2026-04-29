import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { ROLES } from '../auth/constants';
import { FarmersService } from './farmers.service';
import { CreateFarmerDto } from './dto/create-farmer.dto';
import { UpdateFarmerDto } from './dto/update-farmer.dto';

@ApiTags('Farmers')
@ApiBearerAuth()
@Roles(ROLES.ADMIN)
@Controller('farmers')
export class FarmersController {
  constructor(private readonly farmersService: FarmersService) {}

  @Post()
  @ApiOperation({ summary: 'Crear agricultor' })
  @ApiResponse({ status: 201, description: 'Agricultor creado.' })
  @ApiResponse({ status: 400, description: 'Datos de entrada inválidos.' })
  create(@Body() createFarmerDto: CreateFarmerDto) {
    return this.farmersService.create(createFarmerDto);
  }

  @Get()
  @ApiOperation({ summary: 'Listar agricultores' })
  @ApiResponse({ status: 200, description: 'Lista de agricultores.' })
  findAll() {
    return this.farmersService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener agricultor por ID' })
  @ApiParam({ name: 'id', description: 'ID numérico del agricultor' })
  @ApiResponse({ status: 200, description: 'Agricultor encontrado.' })
  @ApiResponse({ status: 404, description: 'Agricultor no encontrado.' })
  findOne(@Param('id') id: string) {
    return this.farmersService.findOne(+id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Actualizar agricultor' })
  @ApiParam({ name: 'id', description: 'ID numérico del agricultor' })
  @ApiResponse({ status: 200, description: 'Agricultor actualizado.' })
  @ApiResponse({ status: 404, description: 'Agricultor no encontrado.' })
  update(@Param('id') id: string, @Body() updateFarmerDto: UpdateFarmerDto) {
    return this.farmersService.update(+id, updateFarmerDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Eliminar agricultor' })
  @ApiParam({ name: 'id', description: 'ID numérico del agricultor' })
  @ApiResponse({ status: 200, description: 'Agricultor eliminado.' })
  @ApiResponse({ status: 404, description: 'Agricultor no encontrado.' })
  remove(@Param('id') id: string) {
    return this.farmersService.remove(+id);
  }
}
