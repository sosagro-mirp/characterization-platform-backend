import { ApiProperty } from '@nestjs/swagger';

// Spec 92 — productor resuelto como survey.farmer ?? campaignSession.farmer.
export class MySurveyFarmerDto {
  @ApiProperty() farmerId: string;
  @ApiProperty() name: string;
}

// Spec 94 — finca y cultivo a los que está anclada la encuesta.
export class MySurveyFarmDto {
  @ApiProperty() farmId: string;
  @ApiProperty() name: string;
}

export class MySurveyCropDto {
  @ApiProperty() cropId: string;
  @ApiProperty() name: string;
}

export class MySurveyItemDto {
  @ApiProperty() surveyId: string;
  @ApiProperty({ nullable: true, type: String })
  clientSurveyId: string | null;
  @ApiProperty({ nullable: true, type: String })
  instrumentName: string | null;
  @ApiProperty({ nullable: true, type: String })
  campaignName: string | null;
  @ApiProperty({ type: MySurveyFarmerDto, nullable: true })
  farmer: MySurveyFarmerDto | null;
  @ApiProperty({
    type: MySurveyFarmDto,
    nullable: true,
    description: 'Finca a la que está anclada la encuesta (spec 94).',
  })
  farm: MySurveyFarmDto | null;
  @ApiProperty({
    type: MySurveyCropDto,
    nullable: true,
    description:
      'Cultivo de la encuesta, derivado de su cultivo de finca (spec 94).',
  })
  crop: MySurveyCropDto | null;
  @ApiProperty({
    description:
      'Preguntas distintas con respuesta — una selección múltiple con varias opciones cuenta 1.',
  })
  responseCount: number;
  @ApiProperty() createdAt: string;
  @ApiProperty() updatedAt: string;
}
