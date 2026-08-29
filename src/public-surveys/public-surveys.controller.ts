import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';
import { SubmitPublicSurveyDto } from './dto/submit-public-survey.dto';
import { PublicSurveysService } from './public-surveys.service';

// Spec 79 — canal público sin autenticación. Ambas rutas llevan @Public()
// explícito, aunque no sea estrictamente necesario documentarlo dos veces:
// deja claro en el propio controlador que este módulo entero es de
// recolección abierta, sin depender de que nadie olvide el decorador en un
// endpoint nuevo que se agregue después.
@ApiTags('Public Surveys')
@Public()
@Controller('public/surveys')
export class PublicSurveysController {
  constructor(private readonly publicSurveysService: PublicSurveysService) {}

  @Public()
  @Get(':instrumentId')
  @ApiOperation({
    summary: 'Cargar un instrumento por el canal público',
    description:
      'Estructura completa del instrumento (sections → questions → options) más ' +
      'el documento de consentimiento activo. 404 con { reason: "not_found" } si ' +
      'el instrumento no existe o no hay consentimiento publicado, y con ' +
      '{ reason: "closed" } si el instrumento existe pero ya no es público o está inactivo.',
  })
  @ApiParam({ name: 'instrumentId', format: 'uuid' })
  @ApiResponse({
    status: 200,
    description: 'Instrumento y consentimiento activo.',
  })
  @ApiResponse({
    status: 404,
    description: 'Instrumento inexistente o enlace cerrado.',
  })
  getPublicInstrument(
    @Param('instrumentId', new ParseUUIDPipe()) instrumentId: string,
  ) {
    return this.publicSurveysService.getPublicInstrument(instrumentId);
  }

  @Public()
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Enviar una encuesta pública',
    description:
      'Envío único y atómico: instrumento + consentimiento + respuestas en una ' +
      'sola transacción. No requiere autenticación, no crea agricultor ni usuario. ' +
      'La encuesta queda con origin="public" y reviewStatus="pending", pendiente ' +
      'de revisión manual en la bandeja administrativa.',
  })
  @ApiResponse({
    status: 201,
    description: 'Encuesta creada. Retorna { surveyId }.',
  })
  @ApiResponse({
    status: 400,
    description: 'Datos inválidos o consentimiento no aceptado.',
  })
  @ApiResponse({
    status: 403,
    description: 'El enlace ya no está recibiendo respuestas.',
  })
  @ApiResponse({
    status: 404,
    description: 'Instrumento, pregunta u opción no encontrada.',
  })
  submit(@Body() dto: SubmitPublicSurveyDto) {
    return this.publicSurveysService.submit(dto);
  }
}
