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

  /** UUID del tipo de pregunta (open_text, numeric, numeric_with_unit, yes_no, single_choice, multiple_choice, likert, compliance) */
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

  /**
   * Indica si la pregunta forma parte de los criterios de selección de
   * unidades productivas. Por defecto `false`.
   */
  @ApiPropertyOptional({ example: false, default: false })
  @IsOptional()
  @IsBoolean()
  isSelectionCriteria?: boolean;

  /**
   * Indica si la pregunta es estratégica para el despliegue de requerimientos
   * y la caracterización tecnológica de la zona. Por defecto `false`.
   */
  @ApiPropertyOptional({ example: false, default: false })
  @IsOptional()
  @IsBoolean()
  isKeyQuestion?: boolean;

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

  /** Campo del dominio al que mapea esta pregunta. Formato: 'entidad.campo' (ej. 'farmer.name', 'farm.latitude', 'crop.Café') */
  @ApiPropertyOptional({ example: 'farmer.name', maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  systemField?: string;
}
