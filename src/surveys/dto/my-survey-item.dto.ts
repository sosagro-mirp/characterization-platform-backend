import { ApiProperty } from '@nestjs/swagger';

// Spec 92 — productor resuelto como survey.farmer ?? campaignSession.farmer.
export class MySurveyFarmerDto {
  @ApiProperty() farmerId: string;
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
    description:
      'Preguntas distintas con respuesta — una selección múltiple con varias opciones cuenta 1.',
  })
  responseCount: number;
  @ApiProperty() createdAt: string;
  @ApiProperty() updatedAt: string;
}
