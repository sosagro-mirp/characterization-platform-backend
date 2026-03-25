import { IsNotEmpty, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateCooperativeDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  name: string;

  @IsUUID()
  departmentId: string;
}
