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
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { ROLES } from '../auth/constants';
import { CreateQuestionDto } from './dto/create-question.dto';
import { UpdateQuestionDto } from './dto/update-question.dto';
import { CopyQuestionDto } from './dto/copy-question.dto';
import { Question } from './entities/question.entity';
import { CopyQuestionResult, QuestionsService } from './questions.service';

@ApiTags('Questions')
@ApiBearerAuth()
@Roles(ROLES.ADMIN, ROLES.RESEARCHER)
@Controller('sections/:sectionId/questions')
export class QuestionsController {
  constructor(private readonly questionsService: QuestionsService) {}

  @Post()
  @ApiOperation({
    summary: 'Crear pregunta',
    description: 'Crea una pregunta dentro de una sección.',
  })
  @ApiParam({
    name: 'sectionId',
    format: 'uuid',
    description: 'ID de la sección padre',
  })
  @ApiResponse({ status: 201, description: 'Pregunta creada.' })
  @ApiResponse({ status: 400, description: 'Datos de entrada inválidos.' })
  @ApiResponse({ status: 404, description: 'Sección no encontrada.' })
  create(
    @Param('sectionId', new ParseUUIDPipe()) sectionId: string,
    @Body() createQuestionDto: CreateQuestionDto,
  ) {
    return this.questionsService.create(sectionId, createQuestionDto);
  }

  @Post('copy')
  @ApiOperation({
    summary: 'Copiar pregunta desde otra sección',
    description:
      'Copia una pregunta —con sus opciones— al final de esta sección, ' +
      'esté la de origen en el mismo instrumento o en otro distinto. La ' +
      'condición de visibilidad de la pregunta de origen nunca viaja: se ' +
      'reporta en `droppedCondition` cuando existía.',
  })
  @ApiParam({
    name: 'sectionId',
    format: 'uuid',
    description: 'ID de la sección destino',
  })
  @ApiResponse({ status: 201, description: 'Pregunta copiada.' })
  @ApiResponse({
    status: 404,
    description: 'Sección destino o pregunta de origen no encontrada.',
  })
  copy(
    @Param('sectionId', new ParseUUIDPipe()) sectionId: string,
    @Body() copyQuestionDto: CopyQuestionDto,
  ): Promise<CopyQuestionResult> {
    return this.questionsService.copyToSection(sectionId, copyQuestionDto);
  }

  @Get(':questionId')
  @ApiOperation({ summary: 'Obtener pregunta por ID' })
  @ApiParam({
    name: 'sectionId',
    format: 'uuid',
    description: 'ID de la sección padre',
  })
  @ApiParam({
    name: 'questionId',
    format: 'uuid',
    description: 'ID de la pregunta',
  })
  @ApiResponse({ status: 200, description: 'Pregunta encontrada.' })
  @ApiResponse({ status: 404, description: 'Pregunta no encontrada.' })
  findOne(
    @Param('questionId', new ParseUUIDPipe()) questionId: string,
  ): Promise<Question> {
    return this.questionsService.findOne(questionId);
  }

  @Patch(':questionId')
  @ApiOperation({ summary: 'Actualizar pregunta' })
  @ApiParam({ name: 'sectionId', format: 'uuid' })
  @ApiParam({ name: 'questionId', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Pregunta actualizada.' })
  @ApiResponse({ status: 404, description: 'Pregunta no encontrada.' })
  update(
    @Param('sectionId', new ParseUUIDPipe()) sectionId: string,
    @Param('questionId', new ParseUUIDPipe()) questionId: string,
    @Body() updateQuestionDto: UpdateQuestionDto,
  ) {
    return this.questionsService.update(
      sectionId,
      questionId,
      updateQuestionDto,
    );
  }

  @Delete(':questionId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Eliminar pregunta',
    description:
      'Spec 84: rechaza con 409 si la pregunta tiene respuestas, o si otra ' +
      'pregunta visible o un paso de campaña depende de su condición. Para ' +
      'una pregunta con respuestas que sobra, usar archivar en su lugar.',
  })
  @ApiParam({ name: 'sectionId', format: 'uuid' })
  @ApiParam({ name: 'questionId', format: 'uuid' })
  @ApiResponse({ status: 204, description: 'Pregunta eliminada.' })
  @ApiResponse({ status: 404, description: 'Pregunta no encontrada.' })
  @ApiResponse({
    status: 409,
    description: 'La pregunta tiene respuestas o dependientes activos.',
  })
  remove(
    @Param('sectionId', new ParseUUIDPipe()) sectionId: string,
    @Param('questionId', new ParseUUIDPipe()) questionId: string,
  ) {
    return this.questionsService.remove(sectionId, questionId);
  }

  @Patch(':questionId/archive')
  @ApiOperation({
    summary: 'Archivar pregunta',
    description:
      'Spec 84: la pregunta deja de mostrarse en el render, el formulario ' +
      'público y la caché móvil, pero sus respuestas se conservan. Se ' +
      'rechaza con 409 si otra pregunta visible o un paso de campaña ' +
      'depende de su condición.',
  })
  @ApiParam({ name: 'sectionId', format: 'uuid' })
  @ApiParam({ name: 'questionId', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Pregunta archivada.' })
  @ApiResponse({ status: 404, description: 'Pregunta no encontrada.' })
  @ApiResponse({ status: 409, description: 'Tiene dependientes activos.' })
  archive(
    @Param('sectionId', new ParseUUIDPipe()) sectionId: string,
    @Param('questionId', new ParseUUIDPipe()) questionId: string,
  ) {
    return this.questionsService.archive(sectionId, questionId);
  }

  @Patch(':questionId/unarchive')
  @ApiOperation({
    summary: 'Desarchivar pregunta',
    description: 'Spec 84: la pregunta vuelve a mostrarse.',
  })
  @ApiParam({ name: 'sectionId', format: 'uuid' })
  @ApiParam({ name: 'questionId', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Pregunta desarchivada.' })
  @ApiResponse({ status: 404, description: 'Pregunta no encontrada.' })
  unarchive(
    @Param('sectionId', new ParseUUIDPipe()) sectionId: string,
    @Param('questionId', new ParseUUIDPipe()) questionId: string,
  ) {
    return this.questionsService.unarchive(sectionId, questionId);
  }
}
