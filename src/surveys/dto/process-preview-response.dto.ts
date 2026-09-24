import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type {
  DocumentStatus,
  FarmAction,
  PreviewWarningCode,
  ProcessPreview,
} from '../public-submission-plan';

// Spec 93 — forma de `GET /surveys/:id/process-preview`. La construye la
// función pura `buildPublicSubmissionPlan`; estas clases solo la documentan.

class PreviewIdentityDto {
  @ApiProperty({ nullable: true }) name: string | null;
  @ApiProperty({
    nullable: true,
    description: 'Documento normalizado (sin puntos, espacios ni guiones).',
  })
  documentId: string | null;
  @ApiProperty({ nullable: true }) phone: string | null;
}

class PreviewFarmerCandidateDto {
  @ApiProperty({ format: 'uuid' }) farmerId: string;
  @ApiProperty() name: string;
}

class PreviewDocumentDto {
  @ApiProperty({ enum: ['new', 'same_person_match', 'collision'] })
  status: DocumentStatus;
  @ApiProperty({
    format: 'uuid',
    nullable: true,
    description: 'Productor que se reutilizaría (`same_person_match`).',
  })
  farmerId: string | null;
  @ApiProperty({ type: [PreviewFarmerCandidateDto] })
  candidates: PreviewFarmerCandidateDto[];
}

class PreviewSharedFarmCandidateDto {
  @ApiProperty({ enum: ['farm', 'pending_submission'] })
  source: 'farm' | 'pending_submission';
  @ApiProperty({ format: 'uuid', nullable: true }) farmId: string | null;
  @ApiProperty({ format: 'uuid', nullable: true }) surveyId: string | null;
  @ApiProperty() name: string;
  @ApiProperty({ nullable: true }) vereda: string | null;
}

class PreviewFarmDto {
  @ApiProperty({ enum: ['create', 'link', 'complete', 'none'] })
  action: FarmAction;
  @ApiProperty({ format: 'uuid', nullable: true }) farmId: string | null;
  @ApiProperty({
    type: [PreviewSharedFarmCandidateDto],
    description:
      'Fincas (o envíos pendientes) con el mismo nombre normalizado y vereda. Nada se vincula solo.',
  })
  sharedCandidates: PreviewSharedFarmCandidateDto[];
}

class PreviewResolvedCropDto {
  @ApiProperty({ format: 'uuid' }) cropId: string;
  @ApiProperty() name: string;
}

class PreviewCropsDto {
  @ApiProperty({ type: [PreviewResolvedCropDto] })
  resolved: PreviewResolvedCropDto[];
  @ApiProperty({
    type: [String],
    description: 'Textos de opciones de cultivo sin `metadataId`.',
  })
  unmapped: string[];
}

class PreviewFieldToCompleteDto {
  @ApiProperty({ enum: ['farmer', 'farm'] }) entity: 'farmer' | 'farm';
  @ApiProperty() field: string;
  @ApiProperty({ description: 'Valor que se escribiría (columna hoy vacía).' })
  value: unknown;
}

class PreviewWarningDto {
  @ApiProperty({
    enum: [
      'respondent_not_producer',
      'missing_town',
      'area_converted',
      'area_unit_unknown',
      'multi_value_truncated',
      'different_farm_name_existing_farmer',
      'duplicate_document_in_pending',
    ],
  })
  code: PreviewWarningCode;
  @ApiPropertyOptional() message?: string;
}

export class ProcessPreviewResponseDto implements ProcessPreview {
  @ApiProperty({ format: 'uuid' }) surveyId: string;
  @ApiProperty({ type: PreviewIdentityDto }) identity: PreviewIdentityDto;
  @ApiProperty({ type: PreviewDocumentDto }) document: PreviewDocumentDto;
  @ApiProperty({ type: PreviewFarmDto }) farm: PreviewFarmDto;
  @ApiProperty({ type: PreviewCropsDto }) crops: PreviewCropsDto;
  @ApiProperty({ type: [PreviewFieldToCompleteDto] })
  fieldsToComplete: PreviewFieldToCompleteDto[];
  @ApiProperty({ type: [PreviewWarningDto] }) warnings: PreviewWarningDto[];
}
