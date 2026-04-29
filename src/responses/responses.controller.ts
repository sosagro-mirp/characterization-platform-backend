import { Body, Controller, ParseArrayPipe, Post } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';
import { CreateResponseDto } from './dto/create-response.dto';
import { ResponsesService } from './responses.service';

@ApiTags('Responses')
@Public()
@Controller('responses')
export class ResponsesController {
  constructor(private readonly responsesService: ResponsesService) {}

  @Post()
  @ApiOperation({ summary: 'Crear respuesta individual' })
  @ApiResponse({ status: 201, description: 'Respuesta creada.' })
  @ApiResponse({ status: 400, description: 'Datos de entrada inválidos.' })
  @ApiResponse({ status: 404, description: 'Encuesta o pregunta no encontrada.' })
  create(@Body() createResponseDto: CreateResponseDto) {
    return this.responsesService.create(createResponseDto);
  }

  @Post('batch')
  @ApiOperation({
    summary: 'Enviar respuestas en lote',
    description:
      'Envía todas las respuestas de una sesión de encuesta en una sola transacción DB. ' +
      'Endpoint crítico del flujo de encuesta — se llama al finalizar el cuestionario.',
  })
  @ApiResponse({ status: 201, description: 'Respuestas guardadas exitosamente.' })
  @ApiResponse({ status: 400, description: 'Datos inválidos. Verificar surveyId y questionIds.' })
  @ApiResponse({ status: 404, description: 'Encuesta o pregunta no encontrada.' })
  createMany(
    @Body(new ParseArrayPipe({ items: CreateResponseDto }))
    createResponseDtos: CreateResponseDto[],
  ) {
    return this.responsesService.createMany(createResponseDtos);
  }
}
