import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
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
}