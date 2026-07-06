import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';

const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'audio/mpeg',
  'audio/mp4',
  'audio/m4a',
  'audio/webm',
  'application/pdf',
  'video/mp4',
];

const MAX_FILE_SIZE_BYTES = 200 * 1024 * 1024; // 200 MB

export class CreatePresignedUrlDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  surveyId: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  questionId: string;

  @ApiProperty({ enum: ALLOWED_MIME_TYPES })
  @IsString()
  @IsNotEmpty()
  @IsIn(ALLOWED_MIME_TYPES)
  mimeType: string;

  @ApiProperty({ example: 1048576 })
  @IsNumber()
  @Min(1)
  @Max(MAX_FILE_SIZE_BYTES)
  fileSizeBytes: number;

  @ApiPropertyOptional({ example: 'foto-cultivo.jpg' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  originalFilename?: string;
}
