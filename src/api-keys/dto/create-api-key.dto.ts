import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsDateString,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { VALID_API_KEY_SCOPES } from '../constants';

export class CreateApiKeyDto {
  @ApiProperty({ example: 'MCP admin — laptop Santiago', maxLength: 100 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @ApiProperty({
    example: ['read', 'write'],
    enum: VALID_API_KEY_SCOPES,
    isArray: true,
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsIn(VALID_API_KEY_SCOPES, { each: true })
  scopes: string[];

  @ApiProperty({
    format: 'uuid',
    description: 'Usuario de servicio al que queda vinculada la key',
  })
  @IsUUID()
  userId: string;

  @ApiPropertyOptional({
    format: 'date-time',
    description: 'Fecha de expiración. Sin valor = sin expiración.',
  })
  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}
