import {
  IsBoolean,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class CreateResponseDto {
  @IsUUID()
  surveyId: string;

  @IsUUID()
  questionId: string;

  @IsOptional()
  @IsUUID()
  optionId?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  textValue?: string;

  @IsOptional()
  @IsNumber()
  numericValue?: number;

  @IsOptional()
  @IsBoolean()
  booleanValue?: boolean;
}
