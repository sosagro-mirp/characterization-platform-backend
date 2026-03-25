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
import { CreateOptionQuestionDto } from './dto/create-option-question.dto';
import { UpdateOptionQuestionDto } from './dto/update-option-question.dto';
import { OptionsQuestionService } from './options-question.service';

@Controller('questions/:questionId/options')
export class OptionsQuestionController {
  constructor(
    private readonly optionsQuestionService: OptionsQuestionService,
  ) {}

  @Post()
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
  findAll(@Param('questionId', new ParseUUIDPipe()) questionId: string) {
    return this.optionsQuestionService.findAll(questionId);
  }

  @Get(':id')
  findOne(
    @Param('questionId', new ParseUUIDPipe()) questionId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.optionsQuestionService.findOne(questionId, id);
  }

  @Patch(':id')
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
  remove(
    @Param('questionId', new ParseUUIDPipe()) questionId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.optionsQuestionService.remove(questionId, id);
  }
}
