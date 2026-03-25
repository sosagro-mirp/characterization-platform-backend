import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { CreateQuestionDto } from './dto/create-question.dto';
import { Question } from './entities/question.entity';
import { QuestionsService } from './questions.service';

@Controller('sections/:sectionId/questions')
export class QuestionsController {
  constructor(private readonly questionsService: QuestionsService) {}

  @Post()
  create(
    @Param('sectionId', new ParseUUIDPipe()) sectionId: string,
    @Body() createQuestionDto: CreateQuestionDto,
  ) {
    return this.questionsService.create(sectionId, createQuestionDto);
  }

  @Get(':questionId')
  findOne(
    @Param('questionId', new ParseUUIDPipe()) questionId: string,
  ): Promise<Question> {
    return this.questionsService.findOne(questionId);
  }
}
