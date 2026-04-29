import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'admin@sosagro.co' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'cambia-esta-clave', minLength: 8 })
  @IsString()
  @MinLength(8)
  password: string;
}
