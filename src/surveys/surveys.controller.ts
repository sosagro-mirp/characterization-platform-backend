import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ParseUUIDPipe } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { ROLES } from '../auth/constants';
import { CreateSurveyDto } from './dto/create-survey.dto';
import { SurveyFilters, SurveysService } from './surveys.service';

@ApiTags('Surveys')
@Controller('surveys')
export class SurveysController {
  constructor(private readonly surveysService: SurveysService) {}

  @Post()
  @ApiBearerAuth()
  @Roles(ROLES.ADMIN, ROLES.RESEARCHER, ROLES.POLLSTER)
  @ApiOperation({
    summary: 'Crear sesión de encuesta',
    description: 'Crea una nueva sesión de encuesta y retorna el surveyId. Acepta contexto geográfico y de actor de forma opcional.',
  })
  @ApiResponse({ status: 201, description: 'Sesión de encuesta creada. Retorna surveyId.' })
  @ApiResponse({ status: 400, description: 'Datos de entrada inválidos.' })
  @ApiResponse({ status: 404, description: 'Instrumento, agricultor o usuario no encontrado.' })
  create(
    @Body() createSurveyDto: CreateSurveyDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.surveysService.create(createSurveyDto, user.userId);
  }

  @Get()
  @ApiBearerAuth()
  @Roles(ROLES.ADMIN)
  @ApiOperation({
    summary: 'Listar encuestas con filtros',
    description: 'Lista sesiones de encuesta. Todos los filtros son opcionales y se combinan con AND.',
  })
  @ApiQuery({ name: 'actorTypeId',  required: false, description: 'Filtrar por tipo de actor', schema: { type: 'string', format: 'uuid' } })
  @ApiQuery({ name: 'departmentId', required: false, description: 'Filtrar por departamento', schema: { type: 'string', format: 'uuid' } })
  @ApiQuery({ name: 'townId',       required: false, description: 'Filtrar por municipio', schema: { type: 'string', format: 'uuid' } })
  @ApiQuery({ name: 'vereda',       required: false, description: 'Búsqueda parcial por nombre de vereda (case-insensitive)' })
  @ApiQuery({ name: 'cropId',       required: false, description: 'Filtrar por cultivo', schema: { type: 'string', format: 'uuid' } })
  @ApiQuery({ name: 'instrumentId', required: false, description: 'Filtrar por instrumento', schema: { type: 'string', format: 'uuid' } })
  @ApiResponse({ status: 200, description: 'Lista de encuestas con sus instrumentos asociados.' })
  findAll(
    @Query('actorTypeId') actorTypeId?: string,
    @Query('departmentId') departmentId?: string,
    @Query('townId') townId?: string,
    @Query('vereda') vereda?: string,
    @Query('cropId') cropId?: string,
    @Query('instrumentId') instrumentId?: string,
  ) {
    const filters: SurveyFilters = {
      actorTypeId,
      departmentId,
      townId,
      vereda,
      cropId,
      instrumentId,
    };
    return this.surveysService.findAll(filters);
  }

  @Patch(':id/sync')
  @ApiBearerAuth()
  @Roles(ROLES.ADMIN, ROLES.RESEARCHER, ROLES.POLLSTER)
  @ApiOperation({ summary: 'Marcar encuesta como sincronizada' })
  @ApiParam({ name: 'id', format: 'uuid', description: 'ID de la sesión de encuesta' })
  @ApiResponse({ status: 200, description: 'Encuesta marcada como sincronizada.' })
  @ApiResponse({ status: 404, description: 'Encuesta no encontrada.' })
  markAsSynchronized(@Param('id', ParseUUIDPipe) id: string) {
    return this.surveysService.markAsSynchronized(id);
  }

  @Post(':id/extract-crops')
  @ApiBearerAuth()
  @Roles(ROLES.ADMIN, ROLES.RESEARCHER, ROLES.POLLSTER)
  @ApiOperation({
    summary: 'Extraer cultivos desde respuestas S2',
    description:
      'Lee las respuestas con systemField crop.* y valor true, identifica los TypeOfCrop ' +
      'correspondientes y los asigna a la CampaignSession.',
  })
  @ApiParam({ name: 'id', format: 'uuid', description: 'ID de la encuesta (survey)' })
  @ApiResponse({ status: 201, description: '{ crops: TypeOfCrop[] }' })
  @ApiResponse({ status: 404, description: 'Encuesta no encontrada.' })
  extractCrops(@Param('id', ParseUUIDPipe) id: string) {
    return this.surveysService.extractCrops(id);
  }

  @Post(':id/extract-farmer')
  @ApiBearerAuth()
  @Roles(ROLES.ADMIN, ROLES.RESEARCHER, ROLES.POLLSTER)
  @ApiOperation({
    summary: 'Extraer agricultor desde respuestas S1',
    description:
      'Lee las respuestas de la encuesta que tienen systemField asignado (prefijo farmer.* / farm.*), ' +
      'crea o reutiliza un Farmer y lo vincula a la CampaignSession.',
  })
  @ApiParam({ name: 'id', format: 'uuid', description: 'ID de la encuesta (survey)' })
  @ApiResponse({ status: 201, description: '{ farmer, existed: boolean }' })
  @ApiResponse({ status: 404, description: 'Encuesta no encontrada.' })
  @ApiResponse({ status: 422, description: 'Falta farmer.name en las respuestas.' })
  extractFarmer(@Param('id', ParseUUIDPipe) id: string) {
    return this.surveysService.extractFarmer(id);
  }
}
