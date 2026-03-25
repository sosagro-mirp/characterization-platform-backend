import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { CreateTypeOfQuestionDto } from './dto/create-type-of-question.dto';
import { UpdateTypeOfQuestionDto } from './dto/update-type-of-question.dto';
import { TypesOfQuestionsService } from './types-of-questions.service';

@Controller('types-of-questions')
export class TypesOfQuestionsController {
  constructor(
    private readonly typesOfQuestionsService: TypesOfQuestionsService,
  ) {}

  @Post()
  create(@Body() createTypeOfQuestionDto: CreateTypeOfQuestionDto) {
    return this.typesOfQuestionsService.create(createTypeOfQuestionDto);
  }

  @Get()
  findAll() {
    return this.typesOfQuestionsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.typesOfQuestionsService.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() updateTypeOfQuestionDto: UpdateTypeOfQuestionDto,
  ) {
    return this.typesOfQuestionsService.update(id, updateTypeOfQuestionDto);
  }

  @Delete(':id')
  remove(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.typesOfQuestionsService.remove(id);
  }
}
