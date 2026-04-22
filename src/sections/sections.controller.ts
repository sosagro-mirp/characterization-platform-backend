import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CreateSectionDto } from './dto/create-section.dto';
import { UpdateSectionDto } from './dto/update-section.dto';
import { SectionsService } from './sections.service';

@ApiTags('Sections')
@Controller('instruments/:instrumentId/sections')
export class SectionsController {
  constructor(private readonly sectionsService: SectionsService) {}

  @Post()
  @ApiOperation({ summary: 'Crear sección', description: 'Crea una sección dentro de un instrumento.' })
  @ApiParam({ name: 'instrumentId', format: 'uuid', description: 'ID del instrumento padre' })
  @ApiResponse({ status: 201, description: 'Sección creada.' })
  @ApiResponse({ status: 400, description: 'Datos de entrada inválidos.' })
  @ApiResponse({ status: 404, description: 'Instrumento no encontrado.' })
  create(
    @Param('instrumentId', new ParseUUIDPipe()) instrumentId: string,
    @Body() createSectionDto: CreateSectionDto,
  ) {
    return this.sectionsService.create(instrumentId, createSectionDto);
  }

  @Get()
  @ApiOperation({ summary: 'Listar secciones de un instrumento' })
  @ApiParam({ name: 'instrumentId', format: 'uuid', description: 'ID del instrumento padre' })
  @ApiResponse({ status: 200, description: 'Lista de secciones.' })
  @ApiResponse({ status: 404, description: 'Instrumento no encontrado.' })
  findAll(@Param('instrumentId', new ParseUUIDPipe()) instrumentId: string) {
    return this.sectionsService.findAll(instrumentId);
  }

  @Get(':sectionId')
  @ApiOperation({ summary: 'Obtener sección por ID' })
  @ApiParam({ name: 'instrumentId', format: 'uuid', description: 'ID del instrumento padre' })
  @ApiParam({ name: 'sectionId', format: 'uuid', description: 'ID de la sección' })
  @ApiResponse({ status: 200, description: 'Sección encontrada.' })
  @ApiResponse({ status: 404, description: 'Sección no encontrada.' })
  findOne(
    @Param('instrumentId', new ParseUUIDPipe()) instrumentId: string,
    @Param('sectionId', new ParseUUIDPipe()) sectionId: string,
  ) {
    return this.sectionsService.findOne(instrumentId, sectionId);
  }

  @Patch(':sectionId')
  @ApiOperation({ summary: 'Actualizar sección' })
  @ApiParam({ name: 'instrumentId', format: 'uuid' })
  @ApiParam({ name: 'sectionId', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Sección actualizada.' })
  @ApiResponse({ status: 404, description: 'Sección no encontrada.' })
  update(
    @Param('instrumentId', new ParseUUIDPipe()) instrumentId: string,
    @Param('sectionId', new ParseUUIDPipe()) sectionId: string,
    @Body() updateSectionDto: UpdateSectionDto,
  ) {
    return this.sectionsService.update(instrumentId, sectionId, updateSectionDto);
  }

  @Delete(':sectionId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Eliminar sección' })
  @ApiParam({ name: 'instrumentId', format: 'uuid' })
  @ApiParam({ name: 'sectionId', format: 'uuid' })
  @ApiResponse({ status: 204, description: 'Sección eliminada.' })
  @ApiResponse({ status: 404, description: 'Sección no encontrada.' })
  remove(
    @Param('instrumentId', new ParseUUIDPipe()) instrumentId: string,
    @Param('sectionId', new ParseUUIDPipe()) sectionId: string,
  ) {
    return this.sectionsService.remove(instrumentId, sectionId);
  }
}
