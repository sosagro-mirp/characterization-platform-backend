import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateQuestionDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  text: string;

  @IsUUID()
  typeId: string;

  @IsBoolean()
  isRequired: boolean;

  @IsInt()
  @Min(1)
  order: number;

  @IsOptional()
  @IsUUID()
  conditionQuestionId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  conditionValue?: string;
}
