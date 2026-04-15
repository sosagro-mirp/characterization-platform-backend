import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsString, MaxLength, Min } from 'class-validator';

export class CreateSectionDto {
  /** Nombre de la sección del instrumento */
  @ApiProperty({ example: 'Información General', maxLength: 100 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  /** Posición de la sección dentro del instrumento (empieza en 1) */
  @ApiProperty({ example: 1, minimum: 1 })
  @IsInt()
  @Min(1)
  order: number;
}
