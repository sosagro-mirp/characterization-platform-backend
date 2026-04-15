import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CreateQuestionDto } from './dto/create-question.dto';
import { Question } from './entities/question.entity';
import { QuestionsService } from './questions.service';

@ApiTags('Questions')
@Controller('sections/:sectionId/questions')
export class QuestionsController {
  constructor(private readonly questionsService: QuestionsService) {}

  @Post()
  @ApiOperation({ summary: 'Crear pregunta', description: 'Crea una pregunta dentro de una sección.' })
  @ApiParam({ name: 'sectionId', format: 'uuid', description: 'ID de la sección padre' })
  @ApiResponse({ status: 201, description: 'Pregunta creada.' })
  @ApiResponse({ status: 400, description: 'Datos de entrada inválidos.' })
  @ApiResponse({ status: 404, description: 'Sección no encontrada.' })
  create(
    @Param('sectionId', new ParseUUIDPipe()) sectionId: string,
    @Body() createQuestionDto: CreateQuestionDto,
  ) {
    return this.questionsService.create(sectionId, createQuestionDto);
  }

  @Get(':questionId')
  @ApiOperation({ summary: 'Obtener pregunta por ID' })
  @ApiParam({ name: 'sectionId', format: 'uuid', description: 'ID de la sección padre' })
  @ApiParam({ name: 'questionId', format: 'uuid', description: 'ID de la pregunta' })
  @ApiResponse({ status: 200, description: 'Pregunta encontrada.' })
  @ApiResponse({ status: 404, description: 'Pregunta no encontrada.' })
  findOne(
    @Param('questionId', new ParseUUIDPipe()) questionId: string,
  ): Promise<Question> {
    return this.questionsService.findOne(questionId);
  }
}
