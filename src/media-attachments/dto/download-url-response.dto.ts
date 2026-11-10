import { ApiProperty } from '@nestjs/swagger';

export class DownloadUrlResponseDto {
  @ApiProperty({ format: 'uuid' })
  attachmentId: string;

  @ApiProperty({
    description:
      'URL firmada de lectura, de vida corta. Se emite bajo demanda y no debe almacenarse.',
  })
  url: string;

  @ApiProperty({ description: 'Vencimiento de la URL (ISO-8601).' })
  expiresAt: string;

  @ApiProperty({ example: 'image/jpeg' })
  mimeType: string;

  @ApiProperty({ type: String, nullable: true })
  originalFilename: string | null;
}
