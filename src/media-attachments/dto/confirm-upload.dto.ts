import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsOptional, Min } from 'class-validator';

export class ConfirmUploadDto {
  @ApiPropertyOptional({ description: 'Tamaño real del archivo subido en bytes', example: 102400 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  actualFileSizeBytes?: number;
}
