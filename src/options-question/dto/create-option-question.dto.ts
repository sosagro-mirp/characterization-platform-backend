import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class CreateOptionQuestionDto {
  /** Texto de la opción de respuesta */
  @ApiProperty({ example: 'Totalmente de acuerdo', maxLength: 255 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  text: string;

  /** Valor numérico asociado a la opción (útil para escalas Likert y similares) */
  @ApiPropertyOptional({ example: 5 })
  @IsOptional()
  @IsNumber()
  value?: number;

  /** Indica si esta opción es la opción abierta "Otro" que habilita texto libre */
  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  isOther?: boolean;

  /**
   * UUID de la fila de catálogo (departamento, municipio, tipo de cultivo o
   * tipo de actor) que esta opción representa. Se valida contra el catálogo
   * que corresponde al `systemField` de la pregunta; `null` lo limpia.
   */
  @ApiPropertyOptional({
    format: 'uuid',
    nullable: true,
    example: '3f2b8c1e-9d4a-4e6b-8a7c-1d2e3f4a5b6c',
  })
  @IsOptional()
  @IsUUID()
  metadataId?: string | null;
}
