import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsUUID } from 'class-validator';

export class CopyQuestionDto {
  /** UUID de la pregunta de origen (de cualquier sección, del mismo o de otro instrumento) */
  @ApiProperty({
    format: 'uuid',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsUUID()
  @IsNotEmpty()
  sourceQuestionId: string;
}
