import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, Matches } from 'class-validator';

export class DashboardFiltersDto {
  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'Filtra por instrumento. Mutuamente excluyente con categoryId.',
  })
  @IsOptional()
  @IsUUID()
  instrumentId?: string;

  @ApiPropertyOptional({
    description:
      'Filtra por categoría temática (C1–C15, spec 43). Agrega las preguntas de todos los instrumentos activos de la categoría. Mutuamente excluyente con instrumentId.',
    example: 'C15',
  })
  @IsOptional()
  @IsString()
  @Matches(/^C([1-9]|1[0-5])$/, {
    message: 'categoryId debe tener el formato C1..C15.',
  })
  categoryId?: string;

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
