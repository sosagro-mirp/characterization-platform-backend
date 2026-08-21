import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ParseUUIDPipe } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { ROLES } from '../auth/constants';
import { CreateSurveyDto } from './dto/create-survey.dto';
import { CheckDuplicateQueryDto } from './dto/check-duplicate-query.dto';
import { OverwriteSurveyDto } from './dto/overwrite-survey.dto';
import { SkipStepDto } from './dto/skip-step.dto';
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
    description:
      'Crea una nueva sesión de encuesta y retorna el surveyId. Acepta contexto geográfico y de actor de forma opcional. ' +
      'Es idempotente respecto de clientSurveyId (spec 70, Fase 9): reenviar el mismo clientSurveyId devuelve la ' +
      'encuesta ya creada en vez de duplicarla, para que un cliente pueda reintentar con seguridad tras perder la ' +
      'respuesta de un POST que sí llegó al servidor.',
  })
  @ApiResponse({
    status: 201,
    description: 'Sesión de encuesta creada. Retorna surveyId.',
  })
  @ApiResponse({ status: 400, description: 'Datos de entrada inválidos.' })
  @ApiResponse({
    status: 404,
    description: 'Instrumento, agricultor o usuario no encontrado.',
  })
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
    description:
      'Lista sesiones de encuesta. Todos los filtros son opcionales y se combinan con AND.',
  })
  @ApiQuery({
    name: 'actorTypeId',
    required: false,
    description: 'Filtrar por tipo de actor',
    schema: { type: 'string', format: 'uuid' },
  })
  @ApiQuery({
    name: 'departmentId',
    required: false,
    description: 'Filtrar por departamento',
    schema: { type: 'string', format: 'uuid' },
  })
  @ApiQuery({
    name: 'townId',
    required: false,
    description: 'Filtrar por municipio',
    schema: { type: 'string', format: 'uuid' },
  })
  @ApiQuery({
    name: 'vereda',
    required: false,
    description: 'Búsqueda parcial por nombre de vereda (case-insensitive)',
  })
  @ApiQuery({
    name: 'cropId',
    required: false,
    description: 'Filtrar por cultivo',
    schema: { type: 'string', format: 'uuid' },
  })
  @ApiQuery({
    name: 'instrumentId',
    required: false,
    description: 'Filtrar por instrumento',
    schema: { type: 'string', format: 'uuid' },
  })
  @ApiQuery({
    name: 'farmerId',
    required: false,
    description:
      'Filtrar por agricultor (incluye surveys vinculados a través de campaign_sessions)',
    schema: { type: 'string', format: 'uuid' },
  })
  @ApiResponse({
    status: 200,
    description: 'Lista de encuestas con sus instrumentos asociados.',
  })
  findAll(
    @Query('actorTypeId') actorTypeId?: string,
    @Query('departmentId') departmentId?: string,
    @Query('townId') townId?: string,
    @Query('vereda') vereda?: string,
    @Query('cropId') cropId?: string,
    @Query('instrumentId') instrumentId?: string,
    @Query('farmerId') farmerId?: string,
  ) {
    const filters: SurveyFilters = {
      actorTypeId,
      departmentId,
      townId,
      vereda,
      cropId,
      instrumentId,
      farmerId,
    };
    return this.surveysService.findAll(filters);
  }

  @Get('check-duplicate')
  @ApiBearerAuth()
  @Roles(ROLES.ADMIN, ROLES.RESEARCHER, ROLES.POLLSTER)
  @ApiOperation({
    summary:
      'Verificar si el farmer ya respondió este instrumento en la campaña',
    description:
      'Retorna hasDuplicate=true y el surveyId del survey existente si el farmer ya tiene ' +
      'respuestas registradas para el instrumento dentro de la campaña indicada.',
  })
  @ApiQuery({
    name: 'farmerId',
    required: true,
    schema: { type: 'string', format: 'uuid' },
  })
  @ApiQuery({
    name: 'instrumentId',
    required: true,
    schema: { type: 'string', format: 'uuid' },
  })
  @ApiQuery({
    name: 'campaignId',
    required: true,
    schema: { type: 'string', format: 'uuid' },
  })
  @ApiResponse({
    status: 200,
    description: '{ hasDuplicate: boolean, surveyId?: string }',
  })
  checkDuplicate(@Query() query: CheckDuplicateQueryDto) {
    return this.surveysService.checkDuplicate(
      query.farmerId,
      query.instrumentId,
      query.campaignId,
    );
  }

  @Get('orphans')
  @ApiBearerAuth()
  @Roles(ROLES.ADMIN)
  @ApiOperation({
    summary: 'Auditar encuestas vacías huérfanas',
    description:
      'Lista encuestas sin respuestas que tienen una encuesta hermana en la misma sesión y ' +
      'el mismo stepOrder que SÍ tiene respuestas — ese es el discriminador que la distingue ' +
      'de un marcador de paso saltado (POST /api/surveys/skip-step), que siempre es la única ' +
      'encuesta de su paso y por eso nunca aparece en esta lista. Solo lectura. Spec 70.',
  })
  @ApiResponse({
    status: 200,
    description:
      'Array de { surveyId, createdAt, stepOrder, siblingSurveyId } — candidatas a borrado.',
  })
  findOrphanSurveys() {
    return this.surveysService.findOrphanSurveys();
  }

  @Post('overwrite')
  @ApiBearerAuth()
  @Roles(ROLES.ADMIN, ROLES.RESEARCHER, ROLES.POLLSTER)
  @ApiOperation({
    summary: 'Descartar un survey duplicado',
    description:
      'Elimina el survey duplicado (y sus respuestas en cascada). No crea ningún survey de ' +
      'reemplazo — el cliente inicia el nuevo con POST /api/surveys recién cuando exista al ' +
      'menos una respuesta (spec 70: evita dejar una fila vacía huérfana si el encuestador ' +
      'abandona después de sobrescribir). Retorna { discardedSurveyId } del survey eliminado.',
  })
  @ApiResponse({ status: 201, description: '{ discardedSurveyId: string }' })
  @ApiResponse({
    status: 400,
    description: 'El survey no pertenece a la misma campaña que la sesión.',
  })
  @ApiResponse({
    status: 404,
    description: 'Survey, sesión o instrumento no encontrado.',
  })
  overwriteSurvey(@Body() dto: OverwriteSurveyDto) {
    return this.surveysService.overwriteSurvey(dto);
  }

  @Post('skip-step')
  @ApiBearerAuth()
  @Roles(ROLES.ADMIN, ROLES.RESEARCHER, ROLES.POLLSTER)
  @ApiOperation({
    summary: 'Marcar un paso como completado sin registrar respuestas',
    description:
      'Crea un survey vacío con el stepOrder indicado, actuando como marcador para que ' +
      'getNextStep no vuelva a sugerir ese paso. Idempotente por (sessionId, stepOrder) ' +
      '(spec 70, Fase 10): si ya existe cualquier encuesta para ese paso —un marcador previo ' +
      'o una completada de verdad— devuelve esa en vez de crear una segunda.',
  })
  @ApiResponse({ status: 201, description: '{ surveyId: string }' })
  @ApiResponse({
    status: 404,
    description: 'Sesión o instrumento no encontrado.',
  })
  skipStep(@Body() dto: SkipStepDto) {
    return this.surveysService.skipStep(dto);
  }

  @Delete(':id')
  @ApiBearerAuth()
  @Roles(ROLES.ADMIN)
  @ApiOperation({
    summary: 'Borrar una encuesta huérfana candidata',
    description:
      'Borrado acotado: solo acepta encuestas que aparecerían en GET /api/surveys/orphans ' +
      '— sin respuestas propias y con una hermana con respuestas en la misma sesión y ' +
      'stepOrder. Rechaza con 409 cualquier encuesta con respuestas o que sea la única de su ' +
      'paso (incluye marcadores de paso saltado). Nunca borra en cascada datos de campo. Spec 70.',
  })
  @ApiParam({ name: 'id', format: 'uuid', description: 'ID de la encuesta' })
  @ApiResponse({ status: 200, description: '{ deletedSurveyId: string }' })
  @ApiResponse({ status: 404, description: 'Encuesta no encontrada.' })
  @ApiResponse({
    status: 409,
    description:
      'La encuesta tiene respuestas, o no tiene una hermana con respuestas en el mismo paso.',
  })
  deleteOrphanSurvey(@Param('id', ParseUUIDPipe) id: string) {
    return this.surveysService.deleteOrphanSurvey(id);
  }

  @Get(':id/responses')
  @ApiBearerAuth()
  @Roles(ROLES.ADMIN, ROLES.RESEARCHER)
  @ApiOperation({
    summary: 'Obtener respuestas de una encuesta',
    description:
      'Devuelve todas las respuestas de la encuesta indicada, con el texto de cada pregunta, tipo, sección y valor formateado.',
  })
  @ApiParam({ name: 'id', format: 'uuid', description: 'ID de la encuesta' })
  @ApiResponse({
    status: 200,
    description:
      'Respuestas de la encuesta con detalle de preguntas y opciones.',
  })
  @ApiResponse({ status: 404, description: 'Encuesta no encontrada.' })
  getSurveyResponses(@Param('id', ParseUUIDPipe) id: string) {
    return this.surveysService.findSurveyResponses(id);
  }

  @Patch(':id/sync')
  @ApiBearerAuth()
  @Roles(ROLES.ADMIN, ROLES.RESEARCHER, ROLES.POLLSTER)
  @ApiOperation({ summary: 'Marcar encuesta como sincronizada' })
  @ApiParam({
    name: 'id',
    format: 'uuid',
    description: 'ID de la sesión de encuesta',
  })
  @ApiResponse({
    status: 200,
    description: 'Encuesta marcada como sincronizada.',
  })
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
  @ApiParam({
    name: 'id',
    format: 'uuid',
    description: 'ID de la encuesta (survey)',
  })
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
  @ApiParam({
    name: 'id',
    format: 'uuid',
    description: 'ID de la encuesta (survey)',
  })
  @ApiResponse({ status: 201, description: '{ farmer, existed: boolean }' })
  @ApiResponse({ status: 404, description: 'Encuesta no encontrada.' })
  @ApiResponse({
    status: 422,
    description: 'Falta farmer.name en las respuestas.',
  })
  extractFarmer(@Param('id', ParseUUIDPipe) id: string) {
    return this.surveysService.extractFarmer(id);
  }
}
