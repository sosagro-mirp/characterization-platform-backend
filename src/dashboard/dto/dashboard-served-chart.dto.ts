import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** Spec 109 — categoría servida por el dashboard (público o privado). */
export class ServedCategoryDto {
  @ApiProperty({ example: 'C1' })
  code: string;

  @ApiProperty({ example: 'Perfil del productor' })
  name: string;

  @ApiPropertyOptional({ nullable: true, type: String })
  description: string | null;
}

export class ServedSeriesDto {
  @ApiProperty({ example: 's1' })
  seriesKey: string;

  @ApiProperty()
  label: string;

  @ApiProperty({ example: 42 })
  answeredCount: number;

  @ApiProperty()
  suppressed: boolean;

  @ApiProperty({
    description:
      'Agregación del spec 107/108 según el tipo de pregunta o la métrica; null si la serie está suprimida.',
    nullable: true,
  })
  aggregation: unknown;
}

/** Spec 109 — gráfico servido: su configuración de dibujo y la agregación por serie. */
export class ServedChartDto {
  @ApiProperty({ format: 'uuid' })
  chartId: string;

  @ApiProperty()
  title: string;

  @ApiPropertyOptional({ nullable: true, type: String })
  subtitle: string | null;

  @ApiProperty({ enum: ['questions', 'entity_metric'] })
  sourceKind: string;

  @ApiPropertyOptional({ nullable: true, type: String })
  questionType: string | null;

  @ApiProperty({ example: 'donut' })
  chartKind: string;

  @ApiProperty({ enum: ['merge', 'compare'] })
  combineMode: string;

  @ApiProperty({ enum: ['normal', 'wide'] })
  layout: string;

  @ApiProperty({ enum: ['public', 'private'] })
  audience: string;

  @ApiProperty({
    description:
      'Ajustes de dibujo (p. ej. estrategia de numeric_with_unit). Sin factores internos.',
  })
  settings: Record<string, unknown>;

  @ApiProperty()
  suppressed: boolean;

  @ApiProperty({
    description:
      'Encuestas con respuesta (en comparación, la serie con más respuestas).',
  })
  answeredCount: number;

  @ApiProperty({
    type: [String],
    description: 'Procedencia: instrumentos de las fuentes válidas.',
  })
  instrumentNames: string[];

  @ApiPropertyOptional({ description: 'Solo en métricas de entidad (P13).' })
  metricKey?: string;

  @ApiPropertyOptional({
    type: [String],
    description:
      'Solo en métricas de entidad: filtros globales recibidos que la métrica no acepta.',
  })
  ignoredFilters?: string[];

  @ApiPropertyOptional({
    description: 'Normalización de unidades (P11), si aplica.',
  })
  normalization?: { targetUnit: string; excludedCount: number };

  @ApiProperty({ type: [ServedSeriesDto] })
  series: ServedSeriesDto[];
}

export class ServedChartsResponseDto {
  @ApiProperty({ type: ServedCategoryDto })
  category: ServedCategoryDto;

  @ApiProperty({
    nullable: true,
    type: Number,
    description: 'Encuestas que cumplen los filtros; null si está suprimida.',
  })
  totalCount: number | null;

  @ApiProperty({
    description:
      'true si la muestra con estos filtros está por debajo de MIN_SAMPLE_THRESHOLD.',
  })
  suppressed: boolean;

  @ApiProperty({ type: [ServedChartDto] })
  charts: ServedChartDto[];
}
