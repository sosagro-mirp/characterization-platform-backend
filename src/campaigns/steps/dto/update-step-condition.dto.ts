import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';
import type { ConditionType, LogicalOperator } from '../../entities/step-condition.entity';

export class UpdateStepConditionDto {
  @ApiPropertyOptional({ example: 2, minimum: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  order?: number;

  @ApiPropertyOptional({ enum: ['AND', 'OR'] })
  @IsOptional()
  @IsEnum(['AND', 'OR'])
  logicalOperator?: LogicalOperator;

  @ApiPropertyOptional({ enum: ['question', 'crop'] })
  @IsOptional()
  @IsEnum(['question', 'crop'])
  conditionType?: ConditionType;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  conditionQuestionId?: string;

  @ApiPropertyOptional({ example: 'si', maxLength: 50 })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  conditionValue?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  conditionCropId?: string;
}
