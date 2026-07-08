import { ApiProperty } from '@nestjs/swagger';
import { DashboardFiltersDto } from './dashboard-filters.dto';

export class DashboardMetadataDto {
  @ApiProperty({
    description: 'Número de encuestas sincronizadas en la muestra filtrada.',
  })
  totalCount: number;

  @ApiProperty({
    required: false,
    description: 'Nombre del instrumento seleccionado, si aplica.',
  })
  instrumentName?: string;

  @ApiProperty({ required: false, description: 'Nombre del departamento filtrado, si aplica.' })
  departmentName?: string;

  @ApiProperty({ required: false, description: 'Nombre del municipio filtrado, si aplica.' })
  townName?: string;

  @ApiProperty({ required: false, description: 'Nombre del cultivo filtrado, si aplica.' })
  cropName?: string;

  @ApiProperty({ required: false, description: 'Nombre del tipo de actor filtrado, si aplica.' })
  actorTypeName?: string;

  @ApiProperty({
    required: false,
    nullable: true,
    description: 'Rango de fechas (createdAt mín/máx) de las encuestas en la muestra filtrada. Null si totalCount es 0.',
    example: { from: '2026-01-15T00:00:00.000Z', to: '2026-06-20T00:00:00.000Z' },
  })
  dateRange?: { from: string; to: string } | null;

  @ApiProperty({
    type: DashboardFiltersDto,
    description: 'Filtros aplicados, ecoados para referencia del cliente.',
  })
  filters: DashboardFiltersDto;
}

export class AggregationOptionDto {
  @ApiProperty() optionId: string;
  @ApiProperty() text: string;
  @ApiProperty() count: number;
  @ApiProperty() percentage: number;
  @ApiProperty({ nullable: true, type: Number }) value: number | null;
}

export class AggregationYesNoDto {
  @ApiProperty({ enum: ['yes_no'] }) type: 'yes_no';
  @ApiProperty() yesCount: number;
  @ApiProperty() noCount: number;
  @ApiProperty() yesPercentage: number;
  @ApiProperty() noPercentage: number;
}

export class AggregationChoicesDto {
  @ApiProperty({ enum: ['single_choice', 'multiple_choice', 'compliance'] })
  type: 'single_choice' | 'multiple_choice' | 'compliance';

  @ApiProperty({ type: [AggregationOptionDto] })
  options: AggregationOptionDto[];
}

export class AggregationLikertDto {
  @ApiProperty({ enum: ['likert'] }) type: 'likert';

  @ApiProperty({
    type: [AggregationOptionDto],
    description:
      'Conteo y % por nivel de la escala, ordenados por value ascendente.',
  })
  options: AggregationOptionDto[];

  @ApiProperty({
    nullable: true,
    type: Number,
    description:
      'Media de acuerdo (escala 1-5), ya invertida si isInverted=true.',
  })
  meanScore: number | null;

  @ApiProperty({
    description:
      'true si el ítem tiene systemField que empieza por "inverted:" y su puntaje ya fue recalculado como 6 - value.',
  })
  isInverted: boolean;
}

export class AggregationNumericDto {
  @ApiProperty({ enum: ['numeric'] }) type: 'numeric';
  @ApiProperty() count: number;
  @ApiProperty({ nullable: true, type: Number }) average: number | null;
  @ApiProperty({ nullable: true, type: Number }) median: number | null;
  @ApiProperty({ nullable: true, type: Number }) min: number | null;
  @ApiProperty({ nullable: true, type: Number }) max: number | null;
  @ApiProperty({ nullable: true, type: Number }) stdDev: number | null;
  @ApiProperty({
    nullable: true,
    type: Number,
    description: 'Primer cuartil (Q1), para box plot.',
  })
  q1: number | null;
  @ApiProperty({
    nullable: true,
    type: Number,
    description: 'Tercer cuartil (Q3), para box plot.',
  })
  q3: number | null;
  @ApiProperty({
    required: false,
    type: [Number],
    description:
      'Valores crudos sin identificador personal. Solo presente si count >= umbral de privacidad.',
  })
  distribution?: number[];
}

export type DashboardAggregation =
  | AggregationYesNoDto
  | AggregationChoicesDto
  | AggregationLikertDto
  | AggregationNumericDto;

export class DashboardQuestionDto {
  @ApiProperty() questionId: string;
  @ApiProperty() questionText: string;
  @ApiProperty() questionType: string;
  @ApiProperty() sectionName: string;

  @ApiProperty({ required: false, nullable: true })
  systemField: string | null;

  @ApiProperty({
    description:
      'true si systemField empieza por "inverted:" (escala likert invertida).',
  })
  isInverted: boolean;

  @ApiProperty({
    description:
      'Base real de respuestas efectivas a esta pregunta (denominador de los porcentajes).',
  })
  answeredCount: number;

  @ApiProperty({
    description:
      'true si answeredCount < umbral de privacidad; en ese caso aggregation es null.',
  })
  suppressed: boolean;

  @ApiProperty({
    nullable: true,
    description:
      'Estructura discriminada por questionType. Null si suppressed=true.',
  })
  aggregation: DashboardAggregation | null;
}

export class DashboardResponseDto {
  @ApiProperty({ type: DashboardMetadataDto })
  metadata: DashboardMetadataDto;

  @ApiProperty({
    description:
      'true si la muestra global (totalCount) tiene menos del umbral mínimo de privacidad.',
  })
  suppressed: boolean;

  @ApiProperty({ required: false })
  reason?: string;

  @ApiProperty({ type: [DashboardQuestionDto] })
  questions: DashboardQuestionDto[];
}
