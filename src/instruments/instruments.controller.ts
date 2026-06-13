import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsUUID } from 'class-validator';
import { Roles } from '../auth/decorators/roles.decorator';
import { ROLES } from '../auth/constants';
import { Public } from '../auth/decorators/public.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import { CreateInstrumentDto } from './dto/create-instrument.dto';
import { UpdateInstrumentDto } from './dto/update-instrument.dto';
import { InstrumentsService } from './instruments.service';

class FindAllInstrumentsQuery {
  @IsOptional()
  @IsUUID()
  actorTypeId?: string;

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true' || value === true)
  excludeSystem?: boolean;
}

@ApiTags('Instruments')
@Controller('instruments')
export class InstrumentsController {
  constructor(private readonly instrumentsService: InstrumentsService) {}

  @Post()
  @ApiBearerAuth()
  @Roles(ROLES.ADMIN)
  @ApiOperation({ summary: 'Crear instrumento de encuesta' })
  @ApiResponse({ status: 201, description: 'Instrumento creado.' })
  @ApiResponse({ status: 400, description: 'Datos de entrada inválidos.' })
  create(
    @Body() createInstrumentDto: CreateInstrumentDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.instrumentsService.create(createInstrumentDto, user?.userId);
  }

  @Public()
  @Get()
  @ApiOperation({
    summary: 'Listar instrumentos',
    description:
      'Retorna todos los instrumentos. Si se provee actorTypeId, filtra por tipo de actor. ' +
      'Si excludeSystem=true, omite los instrumentos del sistema (code IS NOT NULL, ej. S1, S2).',
  })
  @ApiQuery({
    name: 'actorTypeId',
    required: false,
    description: 'Filtrar instrumentos por tipo de actor',
    schema: { type: 'string', format: 'uuid' },
  })
  @ApiQuery({
    name: 'excludeSystem',
    required: false,
    description: 'Si true, excluye instrumentos con código de sistema (S1, S2, etc.)',
    schema: { type: 'boolean' },
  })
  @ApiResponse({ status: 200, description: 'Lista de instrumentos.' })
  findAll(@Query() query: FindAllInstrumentsQuery) {
    if (query.actorTypeId) {
      return this.instrumentsService.findByActorType(query.actorTypeId);
    }
    return this.instrumentsService.findAll(query.excludeSystem);
  }

  @Public()
  @Get('by-code/:code')
  @ApiOperation({ summary: 'Obtener instrumento por código (S1, S2, etc.)' })
  @ApiParam({ name: 'code', description: 'Código del instrumento (máx 10 chars)', example: 'S1' })
  @ApiResponse({ status: 200, description: '{ instrumentId, name }' })
  @ApiResponse({ status: 404, description: 'Instrumento no encontrado.' })
  findByCode(@Param('code') code: string) {
    return this.instrumentsService.findByCode(code);
  }

  @Public()
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
  @ApiBearerAuth()
  @Roles(ROLES.ADMIN, ROLES.RESEARCHER)
  @ApiOperation({ summary: 'Obtener instrumento por ID' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Instrumento encontrado.' })
  @ApiResponse({ status: 404, description: 'Instrumento no encontrado.' })
  findOne(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.instrumentsService.findOne(id);
  }

  @Patch(':id')
  @ApiBearerAuth()
  @Roles(ROLES.ADMIN, ROLES.RESEARCHER)
  @ApiOperation({ summary: 'Actualizar instrumento' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Instrumento actualizado.' })
  @ApiResponse({ status: 404, description: 'Instrumento no encontrado.' })
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() updateInstrumentDto: UpdateInstrumentDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    if (
      updateInstrumentDto.isActive !== undefined &&
      user.role !== ROLES.ADMIN
    ) {
      throw new ForbiddenException(
        'Only admin can activate or deactivate instruments',
      );
    }
    return this.instrumentsService.update(id, updateInstrumentDto, user?.userId);
  }

  @Delete(':id')
  @ApiBearerAuth()
  @Roles(ROLES.ADMIN)
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
