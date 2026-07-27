import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ApiKeyResponseDto {
  @ApiProperty({ format: 'uuid' })
  apiKeyId: string;

  @ApiProperty()
  name: string;

  @ApiProperty({ example: 'a1b2c3d4' })
  keyPrefix: string;

  @ApiProperty({ example: ['read', 'write'] })
  scopes: string[];

  @ApiProperty({ format: 'uuid' })
  userId: string;

  @ApiPropertyOptional({ format: 'date-time', nullable: true })
  expiresAt: string | null;

  @ApiPropertyOptional({ format: 'date-time', nullable: true })
  revokedAt: string | null;

  @ApiPropertyOptional({ format: 'date-time', nullable: true })
  lastUsedAt: string | null;

  @ApiProperty({ format: 'date-time' })
  createdAt: string;
}

export class ApiKeyCreatedResponseDto extends ApiKeyResponseDto {
  @ApiProperty({
    example: 'sosagro_sk_a1b2c3d4_9f8e7d6c5b4a3928...',
    description:
      'Secreto completo de la key. Se muestra únicamente en esta respuesta; no se puede recuperar después.',
  })
  key: string;
}
