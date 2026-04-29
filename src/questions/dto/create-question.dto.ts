import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateQuestionDto {
  /** Texto de la pregunta */
  @ApiProperty({ example: '¿Cuántos años lleva cultivando cacao?', maxLength: 255 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  text: string;

  /** UUID del tipo de pregunta (open_text, numeric, yes_no, single_choice, etc.) */
  @ApiProperty({
    format: 'uuid',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsUUID()
  typeId: string;

  /** Indica si la pregunta es obligatoria para continuar */
  @ApiProperty({ example: true })
  @IsBoolean()
  isRequired: boolean;

  /** Posición de la pregunta dentro de la sección (empieza en 1) */
  @ApiProperty({ example: 1, minimum: 1 })
  @IsInt()
  @Min(1)
  order: number;

  /**
   * UUID de la pregunta que controla la visibilidad de esta pregunta.
   * Si se define, la pregunta solo se muestra cuando la respuesta a
   * `conditionQuestionId` coincide con `conditionValue`.
   */
  @ApiPropertyOptional({
    format: 'uuid',
    example: '550e8400-e29b-41d4-a716-446655440001',
  })
  @IsOptional()
  @IsUUID()
  conditionQuestionId?: string;

  /** Valor esperado de la pregunta condición para que esta pregunta sea visible */
  @ApiPropertyOptional({ example: 'si', maxLength: 50 })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  conditionValue?: string;
}
