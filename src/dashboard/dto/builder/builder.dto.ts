import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export const AUDIENCES = ['public', 'private'] as const;
export const COMBINE_MODES = ['merge', 'compare'] as const;
export const LAYOUTS = ['normal', 'wide'] as const;
export const SOURCE_KINDS = ['questions', 'entity_metric'] as const;

export class CreateCategoryDto {
  @ApiProperty({ example: 'C15' })
  @IsString()
  @MaxLength(50)
  code: string;

  @ApiProperty()
  @IsString()
  @MaxLength(255)
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;
}

export class UpdateCategoryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(50)
  code?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class ReorderCategoriesDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @IsUUID('all', { each: true })
  categoryIds: string[];
}

export class ChartSeriesDto {
  @ApiPropertyOptional({
    description: 'Si falta, el backend asigna uno único por serie.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  seriesKey?: string;

  @ApiProperty()
  @IsString()
  @MaxLength(255)
  label: string;

  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('all', { each: true })
  questionIds: string[];
}

export class CreateChartDto {
  @ApiProperty()
  @IsUUID()
  categoryId: string;

  @ApiProperty()
  @IsString()
  @MaxLength(255)
  title: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  subtitle?: string;

  @ApiProperty({ enum: SOURCE_KINDS })
  @IsIn(SOURCE_KINDS)
  sourceKind: 'questions' | 'entity_metric';

  @ApiPropertyOptional({ description: 'Solo con sourceKind entity_metric.' })
  @IsOptional()
  @IsString()
  metricKey?: string;

  @ApiProperty()
  @IsString()
  chartKind: string;

  @ApiPropertyOptional({ enum: COMBINE_MODES })
  @IsOptional()
  @IsIn(COMBINE_MODES)
  combineMode?: 'merge' | 'compare';

  @ApiProperty({ enum: AUDIENCES })
  @IsIn(AUDIENCES)
  audience: 'public' | 'private';

  @ApiPropertyOptional({ enum: LAYOUTS })
  @IsOptional()
  @IsIn(LAYOUTS)
  layout?: 'normal' | 'wide';

  @ApiPropertyOptional({
    description:
      '{ optionsMismatchAck?, numericWithUnit?: { strategy, targetUnit?, factors? } }',
  })
  @IsOptional()
  @IsObject()
  settings?: Record<string, unknown>;

  @ApiPropertyOptional({ type: [ChartSeriesDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ChartSeriesDto)
  series?: ChartSeriesDto[];
}

export class UpdateChartDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  subtitle?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  metricKey?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  chartKind?: string;

  @ApiPropertyOptional({ enum: COMBINE_MODES })
  @IsOptional()
  @IsIn(COMBINE_MODES)
  combineMode?: 'merge' | 'compare';

  @ApiPropertyOptional({ enum: AUDIENCES })
  @IsOptional()
  @IsIn(AUDIENCES)
  audience?: 'public' | 'private';

  @ApiPropertyOptional({ enum: LAYOUTS })
  @IsOptional()
  @IsIn(LAYOUTS)
  layout?: 'normal' | 'wide';

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  settings?: Record<string, unknown>;

  @ApiPropertyOptional({ type: [ChartSeriesDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ChartSeriesDto)
  series?: ChartSeriesDto[];
}

export class ReorderChartsDto {
  @ApiProperty()
  @IsUUID()
  categoryId: string;

  @ApiProperty({ type: [String] })
  @IsArray()
  @IsUUID('all', { each: true })
  chartIds: string[];
}

/** Vista previa de una configuración sin guardar: un gráfico más la audiencia. */
export class PreviewChartDto extends CreateChartDto {}
