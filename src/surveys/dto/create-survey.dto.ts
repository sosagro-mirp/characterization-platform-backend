import {
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
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

  @IsOptional()
  @IsUUID()
  actorTypeId?: string;

  @IsOptional()
  @IsUUID()
  departmentId?: string;

  @IsOptional()
  @IsUUID()
  townId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  vereda?: string;

  @IsOptional()
  @IsUUID()
  cropId?: string;
}
