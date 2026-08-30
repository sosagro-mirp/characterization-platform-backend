import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class CreateConsentRecordDto {
  /** Sesión de campaña sobre la que se otorga el consentimiento */
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  sessionId: string;

  /**
   * Versión del documento aceptado. Si se omite, se resuelve la versión
   * activa (`published`) en el momento del registro.
   */
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  consentDocumentId?: string;

  @ApiProperty({ example: true })
  @IsBoolean()
  acceptedDataProcessing: boolean;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  acceptedPhoto?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  acceptedAudio?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  acceptedVideo?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  acceptedFollowUpContact?: boolean;

  @ApiPropertyOptional({ maxLength: 255 })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  respondentName?: string;

  @ApiPropertyOptional({ maxLength: 50 })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  respondentDocumentId?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  onBehalfOfProducer?: boolean;

  /**
   * Fecha/hora en que el encuestado aceptó, tomada del dispositivo. En el
   * flujo offline de la app móvil puede ser muy anterior a la fecha de
   * recepción del backend — ver criterio 8 del spec.
   */
  @ApiProperty({ example: '2026-08-20T09:15:00.000Z' })
  @IsISO8601()
  @IsNotEmpty()
  acceptedAt: string;
}
