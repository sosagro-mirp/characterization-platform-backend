import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateInstrumentDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  @IsInt()
  @Min(1)
  version: number;

  @IsDateString()
  publishDate: string;

  @IsBoolean()
  isActive: boolean;

  @IsOptional()
  @IsArray()
  @IsUUID(undefined, { each: true })
  actorTypeIds?: string[];
}
