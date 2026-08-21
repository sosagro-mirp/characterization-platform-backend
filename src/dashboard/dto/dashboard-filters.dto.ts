import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
} from 'class-validator';
import { AGE_RANGE_BUCKETS } from '../dashboard-response-filters.config';

export class DashboardFiltersDto {
  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'Filtra por instrumento. Mutuamente excluyente con categoryId.',
  })
  @IsOptional()
  @IsUUID()
  instrumentId?: string;

  @ApiPropertyOptional({
    description:
      'Filtra por categoría temática (C1–C15, spec 43). Agrega las preguntas de todos los instrumentos activos de la categoría. Mutuamente excluyente con instrumentId.',
    example: 'C15',
  })
  @IsOptional()
  @IsString()
  @Matches(/^C([1-9]|1[0-5])$/, {
    message: 'categoryId debe tener el formato C1..C15.',
  })
  categoryId?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Filtra por departamento.',
  })
  @IsOptional()
  @IsUUID()
  departmentId?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Filtra por municipio.' })
  @IsOptional()
  @IsUUID()
  townId?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Filtra por cultivo.' })
  @IsOptional()
  @IsUUID()
  cropId?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Filtra por tipo de actor.',
  })
  @IsOptional()
  @IsUUID()
  actorTypeId?: string;

  @ApiPropertyOptional({
    description:
      'Filtro global derivado de respuestas (spec 43, D3): género del productor. Coincide por el texto exacto de la opción de la pregunta fuente (systemField farmer.gender, S1a·15).',
    example: 'Mujer',
  })
  @IsOptional()
  @IsString()
  gender?: string;

  @ApiPropertyOptional({
    description:
      'Filtro global derivado de respuestas (spec 43, D3): rango de edad, sobre la pregunta fuente numérica (systemField farmer.age, S1a·16).',
    enum: AGE_RANGE_BUCKETS,
  })
  @IsOptional()
  @IsIn(AGE_RANGE_BUCKETS)
  ageRange?: string;

  @ApiPropertyOptional({
    description:
      'Filtro global derivado de respuestas (spec 43, D3): nivel educativo. Coincide por el texto exacto de la opción de la pregunta fuente (systemField farmer.educationLevel, S11·Hab·1).',
    example: 'Técnico',
  })
  @IsOptional()
  @IsString()
  educationLevel?: string;

  @ApiPropertyOptional({
    description:
      'Filtro global derivado de respuestas (spec 43, D3): calidad de conectividad. Coincide por el texto exacto de la opción de la pregunta fuente ("¿Cómo describiría la calidad de la señal móvil en la finca?", instrumento S8E — sin systemField dedicado, localizada por texto).',
    example: 'Señal buena',
  })
  @IsOptional()
  @IsString()
  connectivity?: string;

  @ApiPropertyOptional({
    description:
      'Filtro global derivado de respuestas (spec 43, D3): grupo poblacional. Selección múltiple — lista de textos de opción separados por coma (OR entre ellos), sobre la pregunta fuente ("¿Pertenece el productor a...?", instrumento S1a — sin systemField, localizada por texto).',
    example: 'Comunidad LGBTIQ+,Municipio en zona PDET',
  })
  @IsOptional()
  @IsString()
  populationGroup?: string;

  @ApiPropertyOptional({
    description:
      'Filtro global derivado de respuestas (spec 43, D3): perfil del productor. Coincide por el texto exacto de la opción de la pregunta fuente ("Perfil del productor", instrumento S1a — sin systemField, localizada por texto).',
    example: 'Encargado de cultivo',
  })
  @IsOptional()
  @IsString()
  profile?: string;

  @ApiPropertyOptional({
    description:
      'Filtro global derivado de respuestas (spec 43, D3): tenencia de la tierra. Coincide por el texto exacto de la opción de la pregunta fuente ("La unidad productiva es:", instrumento S1b — sin systemField, localizada por texto).',
    example: 'Propietario(a) con título formal',
  })
  @IsOptional()
  @IsString()
  tenure?: string;

  @ApiPropertyOptional({
    description:
      'Filtro global derivado de respuestas (spec 43, D3): etapa de la cadena productiva. Selección múltiple — lista de textos de opción separados por coma (OR entre ellos), sobre la pregunta fuente ("¿En qué etapas de la cadena productiva participa?", instrumento S1b — sin systemField, localizada por texto).',
    example: 'Cosecha,Poscosecha / procesamiento',
  })
  @IsOptional()
  @IsString()
  chainStage?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'Filtro global derivado de respuestas (spec 43, D3): campaña. Filtra por survey.campaignSession.campaign.',
  })
  @IsOptional()
  @IsUUID()
  campaignId?: string;

  @ApiPropertyOptional({
    description:
      'Filtro global derivado de respuestas (spec 43, D3): fecha mínima de sincronización de la encuesta (survey.createdAt), inclusive.',
    example: '2026-01-01',
  })
  @IsOptional()
  @IsISO8601()
  dateFrom?: string;

  @ApiPropertyOptional({
    description:
      'Filtro global derivado de respuestas (spec 43, D3): fecha máxima de sincronización de la encuesta (survey.createdAt), inclusive.',
    example: '2026-06-30',
  })
  @IsOptional()
  @IsISO8601()
  dateTo?: string;
}
