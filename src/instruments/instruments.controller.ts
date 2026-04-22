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
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';
import { CreateInstrumentDto } from './dto/create-instrument.dto';
import { UpdateInstrumentDto } from './dto/update-instrument.dto';
import { InstrumentsService } from './instruments.service';

class FindAllInstrumentsQuery {
  @IsOptional()
  @IsUUID()
  actorTypeId?: string;
}

@ApiTags('Instruments')
@Controller('instruments')
export class InstrumentsController {
  constructor(private readonly instrumentsService: InstrumentsService) {}

  @Post()
  @ApiOperation({ summary: 'Crear instrumento de encuesta' })
  @ApiResponse({ status: 201, description: 'Instrumento creado.' })
  @ApiResponse({ status: 400, description: 'Datos de entrada inválidos.' })
  create(@Body() createInstrumentDto: CreateInstrumentDto) {
    return this.instrumentsService.create(createInstrumentDto);
  }

  @Get()
  @ApiOperation({
    summary: 'Listar instrumentos',
    description: 'Retorna todos los instrumentos. Si se provee actorTypeId, filtra por tipo de actor.',
  })
  @ApiQuery({
    name: 'actorTypeId',
    required: false,
    description: 'Filtrar instrumentos por tipo de actor',
    schema: { type: 'string', format: 'uuid' },
  })
  @ApiResponse({ status: 200, description: 'Lista de instrumentos.' })
  findAll(@Query() query: FindAllInstrumentsQuery) {
    if (query.actorTypeId) {
      return this.instrumentsService.findByActorType(query.actorTypeId);
    }
    return this.instrumentsService.findAll();
  }

  @Get(':id/render')
  @ApiOperation({
    summary: 'Renderizar instrumento',
    description:
      'Retorna la estructura jerárquica completa del instrumento ' +
      '(sections → questions → options) lista para renderizar en la UI.',
  })
  @ApiParam({ name: 'id', format: 'uuid', description: 'ID del instrumento' })
  @ApiResponse({ status: 200, description: 'Estructura completa del instrumento.' })
  @ApiResponse({ status: 404, description: 'Instrumento no encontrado.' })
  findOneForRender(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.instrumentsService.findOneForRender(id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener instrumento por ID' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Instrumento encontrado.' })
  @ApiResponse({ status: 404, description: 'Instrumento no encontrado.' })
  findOne(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.instrumentsService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Actualizar instrumento' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Instrumento actualizado.' })
  @ApiResponse({ status: 404, description: 'Instrumento no encontrado.' })
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() updateInstrumentDto: UpdateInstrumentDto,
  ) {
    return this.instrumentsService.update(id, updateInstrumentDto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Eliminar instrumento' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 204, description: 'Instrumento eliminado.' })
  @ApiResponse({ status: 400, description: 'Instrumento con encuestas asociadas.' })
  @ApiResponse({ status: 404, description: 'Instrumento no encontrado.' })
  remove(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.instrumentsService.remove(id);
  }
}
