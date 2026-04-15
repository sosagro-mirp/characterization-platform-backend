import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateActorTypeDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;
}
