import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsObject,
  IsOptional,
  IsUUID,
} from 'class-validator';

export class ExportProductionUnitsDto {
  /** Fincas a exportar: las que el usuario tiene filtradas en la vista. */
  @ApiProperty({ type: [String], format: 'uuid' })
  @IsArray()
  @ArrayMaxSize(1000)
  @IsUUID(undefined, { each: true })
  farmIds: string[];

  /** Filtros de la vista; solo se registran, no se aplican. */
  @ApiProperty({ type: 'object', additionalProperties: true })
  @IsObject()
  filters: Record<string, unknown>;

  /** Spec 112 — cultivos filtrados en la vista: recortan el conteo de avance. */
  @ApiPropertyOptional({ type: [String], format: 'uuid' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsUUID(undefined, { each: true })
  progressCropIds?: string[];
}
