import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import type { ConditionType, LogicalOperator } from '../../entities/step-condition.entity';

export class CreateStepConditionDto {
  @ApiProperty({ example: 1, minimum: 1 })
  @IsInt()
  @Min(1)
  order: number;

  @ApiPropertyOptional({ enum: ['AND', 'OR'], description: 'Requerido para order > 1' })
  @IsOptional()
  @IsEnum(['AND', 'OR'])
  logicalOperator?: LogicalOperator;

  @ApiProperty({ enum: ['question', 'crop'] })
  @IsEnum(['question', 'crop'])
  conditionType: ConditionType;

  @ApiPropertyOptional({ format: 'uuid', description: 'Requerido si conditionType = question' })
  @ValidateIf((o) => o.conditionType === 'question')
  @IsUUID()
  conditionQuestionId?: string;

  @ApiPropertyOptional({ example: 'si', maxLength: 50, description: 'Solo para conditionType = question' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  conditionValue?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Requerido si conditionType = crop' })
  @ValidateIf((o) => o.conditionType === 'crop')
  @IsUUID()
  conditionCropId?: string;
}
