import { ApiProperty } from '@nestjs/swagger';
import { IsISO8601, IsOptional } from 'class-validator';

export class ResolvedSinceQueryDto {
  @ApiProperty({ required: false, description: 'Fecha ISO 8601 desde la que buscar solicitudes resueltas' })
  @IsOptional()
  @IsISO8601()
  since?: string;
}
