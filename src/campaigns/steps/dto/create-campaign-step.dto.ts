import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateCampaignStepDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  instrumentId: string;

  @ApiProperty({ example: 1, minimum: 1 })
  @IsInt()
  @Min(1)
  order: number;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  conditionQuestionId?: string;

  @ApiPropertyOptional({ example: 'cafe', maxLength: 50 })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  conditionValue?: string;
}
