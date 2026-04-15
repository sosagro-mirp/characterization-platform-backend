import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
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
}
