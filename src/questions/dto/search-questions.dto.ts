import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

/**
 * Spec 84, Fase 9 — búsqueda de preguntas por texto entre instrumentos, para
 * detectar redundancias durante la depuración (la misma pregunta repetida en
 * varios instrumentos). Solo lectura.
 */
export class SearchQuestionsDto {
  /** Texto a buscar dentro del enunciado de la pregunta (sin distinguir mayúsculas ni tildes) */
  @ApiProperty({ example: 'nombre de la finca', minLength: 2, maxLength: 255 })
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(255)
  q: string;

  /** Limita la búsqueda a estos instrumentos. Se acepta repetido (`?instrumentIds=a&instrumentIds=b`) o separado por comas. */
  @ApiPropertyOptional({ type: [String], format: 'uuid' })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.split(',').filter(Boolean) : value,
  )
  @IsArray()
  @IsUUID(undefined, { each: true })
  instrumentIds?: string[];

  /** Incluir preguntas archivadas (`archived_at` no nulo). Por defecto `false`. */
  @ApiPropertyOptional({ example: false, default: false })
  @IsOptional()
  @Transform(
    ({ value }: { value: unknown }) => value === true || value === 'true',
  )
  @IsBoolean()
  includeArchived?: boolean;
}
