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
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { ROLES } from '../auth/constants';
import { CreateTypeOfQuestionDto } from './dto/create-type-of-question.dto';
import { UpdateTypeOfQuestionDto } from './dto/update-type-of-question.dto';
import { TypesOfQuestionsService } from './types-of-questions.service';

@ApiTags('Question Types')
@ApiBearerAuth()
@Roles(ROLES.ADMIN)
@Controller('types-of-questions')
export class TypesOfQuestionsController {
  constructor(
    private readonly typesOfQuestionsService: TypesOfQuestionsService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Crear tipo de pregunta' })
  @ApiResponse({ status: 201, description: 'Tipo de pregunta creado.' })
  @ApiResponse({ status: 400, description: 'Datos de entrada inválidos.' })
  create(@Body() createTypeOfQuestionDto: CreateTypeOfQuestionDto) {
    return this.typesOfQuestionsService.create(createTypeOfQuestionDto);
  }

  @Get()
  @Roles(ROLES.ADMIN, ROLES.RESEARCHER)
  @ApiOperation({ summary: 'Listar tipos de pregunta' })
  @ApiResponse({ status: 200, description: 'Lista de tipos de pregunta.' })
  findAll() {
    return this.typesOfQuestionsService.findAll();
  }

  @Get(':id')
  @Roles(ROLES.ADMIN, ROLES.RESEARCHER)
  @ApiOperation({ summary: 'Obtener tipo de pregunta por ID' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Tipo de pregunta encontrado.' })
  @ApiResponse({ status: 404, description: 'Tipo de pregunta no encontrado.' })
  findOne(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.typesOfQuestionsService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Actualizar tipo de pregunta' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Tipo de pregunta actualizado.' })
  @ApiResponse({ status: 404, description: 'Tipo de pregunta no encontrado.' })
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() updateTypeOfQuestionDto: UpdateTypeOfQuestionDto,
  ) {
    return this.typesOfQuestionsService.update(id, updateTypeOfQuestionDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Eliminar tipo de pregunta' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Tipo de pregunta eliminado.' })
  @ApiResponse({ status: 404, description: 'Tipo de pregunta no encontrado.' })
  remove(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.typesOfQuestionsService.remove(id);
  }
}
