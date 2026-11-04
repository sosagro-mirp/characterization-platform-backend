import { ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsObject, IsUUID } from 'class-validator';

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
}
