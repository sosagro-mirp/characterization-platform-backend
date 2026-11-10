import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseArrayPipe,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { ROLES } from '../auth/constants';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../auth/decorators/current-user.decorator';
import { CreateOptionQuestionDto } from './dto/create-option-question.dto';
import { UpdateOptionQuestionDto } from './dto/update-option-question.dto';
import { OptionsQuestionService } from './options-question.service';

@ApiTags('Options')
@ApiBearerAuth()
@Roles(ROLES.ADMIN)
@Controller('questions/:questionId/options')
export class OptionsQuestionController {
  constructor(
    private readonly optionsQuestionService: OptionsQuestionService,
  ) {}

  @Post()
  @Roles(ROLES.ADMIN, ROLES.RESEARCHER, ROLES.POLLSTER)
  @ApiOperation({
    summary: 'Crear opción de pregunta',
    description:
      'Admin/Investigador: crea una opción visible del instrumento. ' +
      'Encuestador (spec 86, cuarentena para clientes viejos que aún crean la ' +
      'opción "Otros" dinámica): responde 201, pero la opción nace archivada ' +
      'con origin=\'field\' y sus respuestas se normalizan a la opción "Otros" ' +
      'de la pregunta con este texto.',
  })
  @ApiParam({
    name: 'questionId',
    format: 'uuid',
    description: 'ID de la pregunta padre',
  })
  @ApiResponse({ status: 201, description: 'Opción creada.' })
  @ApiResponse({ status: 400, description: 'Datos de entrada inválidos.' })
  @ApiResponse({ status: 401, description: 'Sin sesión.' })
  @ApiResponse({ status: 404, description: 'Pregunta no encontrada.' })
  create(
    @Param('questionId', new ParseUUIDPipe()) questionId: string,
    @Body() createOptionQuestionDto: CreateOptionQuestionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.optionsQuestionService.create(
      questionId,
      createOptionQuestionDto,
      { quarantine: user?.role === ROLES.POLLSTER },
    );
  }

  @Post('batch')
  @Roles(ROLES.ADMIN, ROLES.RESEARCHER)
  @ApiOperation({
    summary: 'Crear opciones en lote',
    description:
      'Crea múltiples opciones para una pregunta en una sola transacción.',
  })
  @ApiParam({
    name: 'questionId',
    format: 'uuid',
    description: 'ID de la pregunta padre',
  })
  @ApiResponse({ status: 201, description: 'Opciones creadas en lote.' })
  @ApiResponse({
    status: 400,
    description: 'Datos inválidos o pregunta no encontrada.',
  })
  createMany(
    @Param('questionId', new ParseUUIDPipe()) questionId: string,
    @Body(new ParseArrayPipe({ items: CreateOptionQuestionDto }))
    createOptionQuestionDtos: CreateOptionQuestionDto[],
  ) {
    return this.optionsQuestionService.createMany(
      questionId,
      createOptionQuestionDtos,
    );
  }

  @Get()
  @Roles(ROLES.ADMIN, ROLES.RESEARCHER)
  @ApiOperation({ summary: 'Listar opciones de una pregunta' })
  @ApiParam({
    name: 'questionId',
    format: 'uuid',
    description: 'ID de la pregunta padre',
  })
  @ApiResponse({ status: 200, description: 'Lista de opciones.' })
  findAll(@Param('questionId', new ParseUUIDPipe()) questionId: string) {
    return this.optionsQuestionService.findAll(questionId);
  }

  @Get(':id')
  @Roles(ROLES.ADMIN, ROLES.RESEARCHER)
  @ApiOperation({ summary: 'Obtener opción por ID' })
  @ApiParam({
    name: 'questionId',
    format: 'uuid',
    description: 'ID de la pregunta padre',
  })
  @ApiParam({ name: 'id', format: 'uuid', description: 'ID de la opción' })
  @ApiResponse({ status: 200, description: 'Opción encontrada.' })
  @ApiResponse({ status: 404, description: 'Opción no encontrada.' })
  findOne(
    @Param('questionId', new ParseUUIDPipe()) questionId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.optionsQuestionService.findOne(questionId, id);
  }

  @Patch(':id')
  @Roles(ROLES.ADMIN, ROLES.RESEARCHER)
  @ApiOperation({ summary: 'Actualizar opción' })
  @ApiParam({
    name: 'questionId',
    format: 'uuid',
    description: 'ID de la pregunta padre',
  })
  @ApiParam({ name: 'id', format: 'uuid', description: 'ID de la opción' })
  @ApiResponse({ status: 200, description: 'Opción actualizada.' })
  @ApiResponse({ status: 404, description: 'Opción no encontrada.' })
  update(
    @Param('questionId', new ParseUUIDPipe()) questionId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() updateOptionQuestionDto: UpdateOptionQuestionDto,
  ) {
    return this.optionsQuestionService.update(
      questionId,
      id,
      updateOptionQuestionDto,
    );
  }

  @Delete(':id')
  @Roles(ROLES.ADMIN, ROLES.RESEARCHER)
  @ApiOperation({
    summary: 'Eliminar opción',
    description:
      'Spec 84: rechaza con 409 si la opción tiene respuestas. Para una ' +
      'opción con respuestas que sobra, usar archivar en su lugar.',
  })
  @ApiParam({
    name: 'questionId',
    format: 'uuid',
    description: 'ID de la pregunta padre',
  })
  @ApiParam({ name: 'id', format: 'uuid', description: 'ID de la opción' })
  @ApiResponse({ status: 200, description: 'Opción eliminada.' })
  @ApiResponse({ status: 404, description: 'Opción no encontrada.' })
  @ApiResponse({ status: 409, description: 'La opción tiene respuestas.' })
  remove(
    @Param('questionId', new ParseUUIDPipe()) questionId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.optionsQuestionService.remove(questionId, id);
  }

  @Patch(':id/archive')
  @Roles(ROLES.ADMIN, ROLES.RESEARCHER)
  @ApiOperation({
    summary: 'Archivar opción',
    description:
      'Spec 84: la opción deja de mostrarse; sus respuestas se conservan.',
  })
  @ApiParam({
    name: 'questionId',
    format: 'uuid',
    description: 'ID de la pregunta padre',
  })
  @ApiParam({ name: 'id', format: 'uuid', description: 'ID de la opción' })
  @ApiResponse({ status: 200, description: 'Opción archivada.' })
  @ApiResponse({ status: 404, description: 'Opción no encontrada.' })
  archive(
    @Param('questionId', new ParseUUIDPipe()) questionId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.optionsQuestionService.archive(questionId, id);
  }

  @Patch(':id/unarchive')
  @Roles(ROLES.ADMIN, ROLES.RESEARCHER)
  @ApiOperation({
    summary: 'Desarchivar opción',
    description: 'Spec 84: la opción vuelve a mostrarse.',
  })
  @ApiParam({
    name: 'questionId',
    format: 'uuid',
    description: 'ID de la pregunta padre',
  })
  @ApiParam({ name: 'id', format: 'uuid', description: 'ID de la opción' })
  @ApiResponse({ status: 200, description: 'Opción desarchivada.' })
  @ApiResponse({ status: 404, description: 'Opción no encontrada.' })
  unarchive(
    @Param('questionId', new ParseUUIDPipe()) questionId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.optionsQuestionService.unarchive(questionId, id);
  }
}
