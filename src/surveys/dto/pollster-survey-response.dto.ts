import { ApiProperty } from '@nestjs/swagger';

// Spec 92, D2 — lista blanca de campos que ve un POLLSTER en
// GET /:id/responses. Nunca publicUrl, mimeType ni originalFilename: la
// multimedia solo se indica con hasAttachment.
export class PollsterSurveyResponseRowDto {
  @ApiProperty() responseId: string;
  @ApiProperty() questionId: string;
  @ApiProperty() questionText: string;
  @ApiProperty() questionType: string;
  @ApiProperty() sectionId: string;
  @ApiProperty() sectionTitle: string;
  @ApiProperty() sectionOrder: number;
  @ApiProperty({ nullable: true, type: String })
  textValue: string | null;
  @ApiProperty({ nullable: true, type: Number })
  numericValue: number | null;
  @ApiProperty({ nullable: true, type: Boolean })
  booleanValue: boolean | null;
  @ApiProperty({ nullable: true, type: String })
  optionText: string | null;
  @ApiProperty()
  hasAttachment: boolean;
}
