import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateInstrumentDto {
  /** Nombre descriptivo del instrumento de encuesta */
  @ApiProperty({ example: 'Diagnóstico Cafetero 2024', maxLength: 255 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  /** Número de versión del instrumento */
  @ApiProperty({ example: 1, minimum: 1 })
  @IsInt()
  @Min(1)
  version: number;

  /** Fecha de publicación del instrumento (ISO 8601) */
  @ApiProperty({ example: '2024-01-15' })
  @IsDateString()
  publishDate: string;

  /** Indica si el instrumento está activo y disponible para aplicar */
  @ApiProperty({ example: true })
  @IsBoolean()
  isActive: boolean;

  /** UUIDs de los tipos de actor que pueden responder este instrumento */
  @ApiPropertyOptional({
    type: [String],
    format: 'uuid',
    description: 'IDs de los tipos de actor asociados al instrumento',
    example: ['550e8400-e29b-41d4-a716-446655440000'],
  })
  @IsOptional()
  @IsArray()
  @IsUUID(undefined, { each: true })
  actorTypeIds?: string[];
}
