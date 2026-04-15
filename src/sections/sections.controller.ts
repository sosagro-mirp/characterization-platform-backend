import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CreateSectionDto } from './dto/create-section.dto';
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
}
