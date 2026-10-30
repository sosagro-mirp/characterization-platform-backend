import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';
import { INSTRUMENT_SCOPE_LEVELS } from '../entities/instrument.entity';
import type { InstrumentScopeLevel } from '../entities/instrument.entity';

export class UpdateInstrumentDto {
  @ApiPropertyOptional({ example: 'Diagnóstico Cafetero 2025', maxLength: 255 })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @ApiPropertyOptional({ example: 2, minimum: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  version?: number;

  @ApiPropertyOptional({ example: '2025-01-15' })
  @IsOptional()
  @IsDateString()
  publishDate?: string;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  /** Spec 79 — activa el enlace público /encuesta/{instrumentId}. Se rechaza con 422 si el instrumento tiene preguntas de imagen, audio o documento. */
  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;

  @ApiPropertyOptional({ example: 'S1', maxLength: 10 })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  code?: string | null;

  @ApiPropertyOptional({
    type: [String],
    format: 'uuid',
    example: ['550e8400-e29b-41d4-a716-446655440000'],
  })
  @IsOptional()
  @IsArray()
  @IsUUID(undefined, { each: true })
  actorTypeIds?: string[];

  /** Spec 98 — a quién se aplica: `farmer`, `farm` o `farm_crop`. `null` = sin declarar. */
  @ApiPropertyOptional({
    enum: INSTRUMENT_SCOPE_LEVELS,
    nullable: true,
    example: 'farm_crop',
  })
  @IsOptional()
  @IsIn(INSTRUMENT_SCOPE_LEVELS)
  scopeLevel?: InstrumentScopeLevel | null;

  /** Spec 98 — solo con `farm_crop`. Vacío = todos los cultivos. */
  @ApiPropertyOptional({ type: [String], format: 'uuid' })
  @IsOptional()
  @IsArray()
  @IsUUID(undefined, { each: true })
  cropIds?: string[];

  /** Spec 98 — los instrumentos del mismo grupo cuentan como una sola columna. */
  @ApiPropertyOptional({ example: 'REGISTRO', maxLength: 50, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  coverageGroup?: string | null;
}
