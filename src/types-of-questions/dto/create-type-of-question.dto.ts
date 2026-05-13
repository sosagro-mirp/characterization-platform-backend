import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreateTypeOfQuestionDto {
  /**
   * Nombre del tipo de pregunta.
   * Valores válidos: open_text, numeric, yes_no, single_choice, multiple_choice, likert, compliance
   */
  @ApiProperty({ example: 'single_choice', maxLength: 50 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  name: string;
}
