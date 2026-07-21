import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';

export class DashboardFiltersDto {
  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'Filtra por instrumento. Requerido para ver preguntas agregadas.',
  })
  @IsOptional()
  @IsUUID()
  instrumentId?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Filtra por departamento.',
  })
  @IsOptional()
  @IsUUID()
  departmentId?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Filtra por municipio.' })
  @IsOptional()
  @IsUUID()
  townId?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Filtra por cultivo.' })
  @IsOptional()
  @IsUUID()
  cropId?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Filtra por tipo de actor.',
  })
  @IsOptional()
  @IsUUID()
  actorTypeId?: string;
}
