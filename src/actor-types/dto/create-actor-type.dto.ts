import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateActorTypeDto {
  /** Nombre del tipo de actor (ej. propietario, extensionista, productor) */
  @ApiProperty({ example: 'extensionista', maxLength: 50 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  name: string;

  /** Descripción del rol del actor en el proceso productivo */
  @ApiPropertyOptional({
    example: 'Agente de campo o técnico agrícola',
    maxLength: 255,
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;
}
