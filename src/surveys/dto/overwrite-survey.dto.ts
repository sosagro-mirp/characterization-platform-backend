import { IsUUID } from 'class-validator';

export class OverwriteSurveyDto {
  @IsUUID()
  surveyId: string;

  @IsUUID()
  sessionId: string;
}
