import { IsInt, IsUUID, Min } from 'class-validator';

export class OverwriteSurveyDto {
  @IsUUID()
  surveyId: string;

  @IsUUID()
  sessionId: string;

  @IsUUID()
  instrumentId: string;

  @IsInt()
  @Min(1)
  stepOrder: number;
}
