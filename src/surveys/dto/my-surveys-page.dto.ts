import { ApiProperty } from '@nestjs/swagger';
import { MySurveyItemDto } from './my-survey-item.dto';

export class MySurveysPageDto {
  @ApiProperty({ type: [MySurveyItemDto] })
  items: MySurveyItemDto[];
  @ApiProperty() total: number;
  @ApiProperty() page: number;
  @ApiProperty() limit: number;
}
