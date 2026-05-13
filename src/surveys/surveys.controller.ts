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
  create(@Body() createSurveyDto: CreateSurveyDto) {
    return this.surveysService.create(createSurveyDto);
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
}
