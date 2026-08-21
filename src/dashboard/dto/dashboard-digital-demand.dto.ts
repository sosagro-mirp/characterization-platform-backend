import { ApiProperty } from '@nestjs/swagger';
import { AggregationOptionDto } from './dashboard-response.dto';

export class LikertRankingItemDto {
  @ApiProperty() questionId: string;
  @ApiProperty() questionText: string;
  @ApiProperty() sectionName: string;

  @ApiProperty({
    description: 'Media de acuerdo (1-5), ya invertida si el ítem lo requería.',
  })
  meanScore: number;

  @ApiProperty({
    type: [AggregationOptionDto],
    description:
      'Las 5 bandas de la escala, ordenadas por value ascendente — necesarias para la matriz divergente del diseño (no solo la media).',
  })
  bands: AggregationOptionDto[];

  @ApiProperty() answeredCount: number;
}

export class IndexByCutBucketDto {
  @ApiProperty({
    description: 'Etiqueta del corte (ej. "<30", "Técnico o tecnológico").',
  })
  label: string;

  @ApiProperty({
    nullable: true,
    description:
      'Índice de aceptación (D4) dentro de este corte. Null si suprimido.',
  })
  meanScore: number | null;

  @ApiProperty() suppressed: boolean;
}

export class BarriersRadarDto {
  @ApiProperty({ nullable: true }) b1: number | null;
  @ApiProperty({ nullable: true }) b2: number | null;
  @ApiProperty({ nullable: true }) b3: number | null;
}

export class InstitutionTrustItemDto {
  @ApiProperty() questionId: string;
  @ApiProperty() label: string;
  @ApiProperty({ nullable: true }) meanScore: number | null;
  @ApiProperty({ type: [AggregationOptionDto] }) bands: AggregationOptionDto[];
  @ApiProperty() suppressed: boolean;
}

export class DashboardDigitalDemandDto {
  @ApiProperty() suppressed: boolean;
  @ApiProperty({ required: false }) reason?: string;

  @ApiProperty({
    nullable: true,
    description:
      'D4: promedio de las medias de todos los ítems Likert ★ incluidos en likertRanking.',
  })
  acceptanceIndex: number | null;

  @ApiProperty({ type: [LikertRankingItemDto] })
  likertRanking: LikertRankingItemDto[];

  @ApiProperty({
    description:
      'Índice de aceptación (acceptanceIndex) recalculado por corte de edad/nivel educativo/conectividad.',
  })
  indexByCut: {
    age: IndexByCutBucketDto[];
    education: IndexByCutBucketDto[];
    connectivity: IndexByCutBucketDto[];
  };

  @ApiProperty({ type: BarriersRadarDto })
  barriersRadar: BarriersRadarDto;

  @ApiProperty({ type: [AggregationOptionDto] })
  adoptionBarriers: AggregationOptionDto[];

  @ApiProperty({ type: [InstitutionTrustItemDto] })
  institutionTrust: InstitutionTrustItemDto[];

  @ApiProperty({ type: [AggregationOptionDto] })
  digitalSkills: AggregationOptionDto[];

  @ApiProperty({ type: [AggregationOptionDto] })
  platforms: AggregationOptionDto[];

  @ApiProperty({ type: [AggregationOptionDto] })
  preferredChannel: AggregationOptionDto[];
}
