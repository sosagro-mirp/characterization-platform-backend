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

export class CreateResponseDto {
  /** UUID de la sesión de encuesta a la que pertenece esta respuesta */
  @ApiProperty({
    format: 'uuid',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsUUID()
  surveyId: string;

  /** UUID de la pregunta respondida */
  @ApiProperty({
    format: 'uuid',
    example: '550e8400-e29b-41d4-a716-446655440001',
  })
  @IsUUID()
  questionId: string;

  /** UUID de la opción seleccionada — usar para preguntas de tipo single_choice, likert, yes_no y multiple_choice */
  @ApiPropertyOptional({
    format: 'uuid',
    example: '550e8400-e29b-41d4-a716-446655440002',
  })
  @IsOptional()
  @IsUUID()
  optionId?: string;

  /** Valor texto — usar cuando la pregunta es de tipo open_text */
  @ApiPropertyOptional({ example: 'Variedad Castillo' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  textValue?: string;

  /** Valor numérico — usar cuando la pregunta es de tipo numeric */
  @ApiPropertyOptional({ example: 42.5 })
  @IsOptional()
  @IsNumber()
  numericValue?: number;

  /** Valor booleano — usar cuando la pregunta es de tipo yes_no */
  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  booleanValue?: boolean;
}
