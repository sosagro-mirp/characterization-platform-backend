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
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CreateOptionQuestionDto } from './dto/create-option-question.dto';
import { UpdateOptionQuestionDto } from './dto/update-option-question.dto';
import { OptionsQuestionService } from './options-question.service';

@ApiTags('Options')
@Controller('questions/:questionId/options')
export class OptionsQuestionController {
  constructor(
    private readonly optionsQuestionService: OptionsQuestionService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Crear opción de pregunta' })
  @ApiParam({ name: 'questionId', format: 'uuid', description: 'ID de la pregunta padre' })
  @ApiResponse({ status: 201, description: 'Opción creada.' })
  @ApiResponse({ status: 400, description: 'Datos de entrada inválidos.' })
  @ApiResponse({ status: 404, description: 'Pregunta no encontrada.' })
  create(
    @Param('questionId', new ParseUUIDPipe()) questionId: string,
    @Body() createOptionQuestionDto: CreateOptionQuestionDto,
  ) {
    return this.optionsQuestionService.create(
      questionId,
      createOptionQuestionDto,
    );
  }

  @Post('batch')
  @ApiOperation({
    summary: 'Crear opciones en lote',
    description: 'Crea múltiples opciones para una pregunta en una sola transacción.',
  })
  @ApiParam({ name: 'questionId', format: 'uuid', description: 'ID de la pregunta padre' })
  @ApiResponse({ status: 201, description: 'Opciones creadas en lote.' })
  @ApiResponse({ status: 400, description: 'Datos inválidos o pregunta no encontrada.' })
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
  @ApiOperation({ summary: 'Listar opciones de una pregunta' })
  @ApiParam({ name: 'questionId', format: 'uuid', description: 'ID de la pregunta padre' })
  @ApiResponse({ status: 200, description: 'Lista de opciones.' })
  findAll(@Param('questionId', new ParseUUIDPipe()) questionId: string) {
    return this.optionsQuestionService.findAll(questionId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener opción por ID' })
  @ApiParam({ name: 'questionId', format: 'uuid', description: 'ID de la pregunta padre' })
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
  @ApiOperation({ summary: 'Actualizar opción' })
  @ApiParam({ name: 'questionId', format: 'uuid', description: 'ID de la pregunta padre' })
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
  @ApiOperation({ summary: 'Eliminar opción' })
  @ApiParam({ name: 'questionId', format: 'uuid', description: 'ID de la pregunta padre' })
  @ApiParam({ name: 'id', format: 'uuid', description: 'ID de la opción' })
  @ApiResponse({ status: 200, description: 'Opción eliminada.' })
  @ApiResponse({ status: 404, description: 'Opción no encontrada.' })
  remove(
    @Param('questionId', new ParseUUIDPipe()) questionId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.optionsQuestionService.remove(questionId, id);
  }
}
