import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { ROLES } from '../auth/constants';
import { SearchQuestionsDto } from './dto/search-questions.dto';
import { QuestionsService, SearchQuestionsResult } from './questions.service';

/**
 * Spec 84, Fase 9 — búsqueda transversal de preguntas. Vive en un controlador
 * aparte porque `QuestionsController` cuelga de `sections/:sectionId`, y esta
 * búsqueda es justamente lo contrario: atraviesa todos los instrumentos.
 */
@ApiTags('questions')
@ApiBearerAuth()
@Roles(ROLES.ADMIN, ROLES.RESEARCHER)
@Controller('questions')
export class QuestionsSearchController {
  constructor(private readonly questionsService: QuestionsService) {}

  @Get('search')
  @ApiOperation({
    summary: 'Buscar preguntas por texto entre instrumentos',
    description:
      'Busca en el enunciado de las preguntas sin distinguir mayúsculas ni ' +
      'tildes. Pensada para detectar redundancias durante la depuración de ' +
      'instrumentos: cada coincidencia trae su sección, su instrumento y el ' +
      'número de respuestas que ya tiene, que es lo que decide si la pregunta ' +
      'se puede borrar o debe archivarse.',
  })
  @ApiResponse({ status: 200, description: 'Preguntas que coinciden.' })
  @ApiResponse({ status: 400, description: 'Parámetros inválidos.' })
  search(@Query() dto: SearchQuestionsDto): Promise<SearchQuestionsResult> {
    return this.questionsService.searchByText(dto);
  }
}
