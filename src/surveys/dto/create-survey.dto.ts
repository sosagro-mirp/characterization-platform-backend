import {
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsOptional,
  IsUUID,
} from 'class-validator';

export class CreateSurveyDto {
  @IsOptional()
  @IsUUID()
  farmerId?: string;

  @IsOptional()
  @IsUUID()
  userId?: string;

  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @IsUUID(undefined, { each: true })
  instrumentIds: string[];

  @IsOptional()
  @IsBoolean()
  sincronized?: boolean;
}
