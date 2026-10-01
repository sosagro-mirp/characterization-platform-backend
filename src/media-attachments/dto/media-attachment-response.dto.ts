import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  MediaAttachment,
  MediaAttachmentStatus,
} from '../entities/media-attachment.entity';

/**
 * Salida pública de un adjunto (spec 85). A propósito NO incluye `storageKey`
 * ni `publicUrl`: la lectura de la evidencia pasa por
 * `GET /media-attachments/:attachmentId/download-url`.
 */
export class MediaAttachmentResponseDto {
  @ApiProperty({ format: 'uuid' })
  attachmentId: string;

  @ApiPropertyOptional({ format: 'uuid' })
  questionId?: string;

  @ApiProperty({ example: 'image/jpeg' })
  mimeType: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  originalFilename?: string | null;

  @ApiPropertyOptional({ type: Number, nullable: true })
  fileSizeBytes?: number | null;

  @ApiProperty({ enum: MediaAttachmentStatus })
  status: MediaAttachmentStatus;

  @ApiProperty()
  createdAt: Date;
}

export function toMediaAttachmentResponse(
  attachment: MediaAttachment,
): MediaAttachmentResponseDto {
  return {
    attachmentId: attachment.attachmentId,
    questionId: attachment.question?.questionId,
    mimeType: attachment.mimeType,
    originalFilename: attachment.originalFilename ?? null,
    fileSizeBytes:
      attachment.fileSizeBytes === undefined ||
      attachment.fileSizeBytes === null
        ? null
        : Number(attachment.fileSizeBytes),
    status: attachment.status,
    createdAt: attachment.createdAt,
  };
}
