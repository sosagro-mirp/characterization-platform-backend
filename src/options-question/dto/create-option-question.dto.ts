import {
  IsBoolean,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateOptionQuestionDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  text: string;

  @IsOptional()
  @IsNumber()
  value?: number;

  @IsOptional()
  @IsBoolean()
  isOther?: boolean;
}
