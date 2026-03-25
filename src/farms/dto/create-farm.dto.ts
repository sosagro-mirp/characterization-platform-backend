import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateFarmDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  name: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  location: string;

  @IsNumber()
  @Min(0)
  area: number;

  @IsBoolean()
  waterAccess: boolean;

  @IsBoolean()
  internetAccess: boolean;

  @IsBoolean()
  hasStabilityElectricity: boolean;

  @IsBoolean()
  technicalAssistanceAccess: boolean;

  @IsOptional()
  @IsUUID()
  townId?: string;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsUUID(undefined, { each: true })
  cropIds?: string[];

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsUUID(undefined, { each: true })
  deviceIds?: string[];
}
