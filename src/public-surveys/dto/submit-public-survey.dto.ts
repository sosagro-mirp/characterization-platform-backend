import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';

// Spec 79 — el consentimiento del canal público replica los campos de
// CreateConsentRecordDto salvo `sessionId`: en este momento no existe
// CampaignSession, la constancia se ancla directamente a la encuesta.
export class PublicSurveyConsentDto {
  /** Si se omite, se resuelve la versión activa (published) en el momento del envío. */
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
}

// Deliberadamente sin `attachmentId`: el ValidationPipe global corre con
// `whitelist: true, forbidNonWhitelisted: true` (src/main.ts), así que un
// envío que incluya attachmentId se rechaza solo por no estar en esta clase
// — el canal público no admite preguntas multimedia (spec 79, punto 4).
export class PublicSurveyResponseItemDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  questionId: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  optionId?: string;

  @ApiPropertyOptional({ example: 'Variedad Castillo' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  textValue?: string;

  @ApiPropertyOptional({ example: 42.5 })
  @IsOptional()
  @IsNumber()
  numericValue?: number;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  booleanValue?: boolean;
}

export class SubmitPublicSurveyDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  instrumentId: string;

  @ApiProperty({ type: PublicSurveyConsentDto })
  @ValidateNested()
  @Type(() => PublicSurveyConsentDto)
  consent: PublicSurveyConsentDto;

  @ApiProperty({ type: [PublicSurveyResponseItemDto] })
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => PublicSurveyResponseItemDto)
  responses: PublicSurveyResponseItemDto[];
}
