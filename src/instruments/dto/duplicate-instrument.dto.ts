import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class DuplicateInstrumentDto {
  /** Nombre de la copia del instrumento */
  @ApiProperty({ example: 'Diagnóstico Cafetero 2024 (copia)', maxLength: 255 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  /** Número de versión de la copia */
  @ApiProperty({ example: 1, minimum: 1 })
  @IsInt()
  @Min(1)
  version: number;

  /** Fecha de publicación de la copia (ISO 8601). Por defecto, la fecha actual. */
  @ApiPropertyOptional({ example: '2026-08-26' })
  @IsOptional()
  @IsDateString()
  publishDate?: string;
}
