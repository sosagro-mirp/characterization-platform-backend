import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';

export class UpdateQuestionDto {
  @ApiPropertyOptional({ example: '¿Cuántos años lleva cultivando?', maxLength: 255 })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  text?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  typeId?: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  isRequired?: boolean;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  isSelectionCriteria?: boolean;

  @ApiPropertyOptional({ example: 2, minimum: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  order?: number;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  conditionQuestionId?: string | null;

  @ApiPropertyOptional({ example: 'si', maxLength: 50 })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  conditionValue?: string | null;
}
