import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { PolygonDto } from './polygon.dto';

export class CreateFarmPlotDto {
  @ApiProperty({ format: 'uuid', description: 'ID de la finca a la que pertenece el lote' })
  @IsUUID()
  farmId: string;

  @ApiProperty({ example: 'Lote cafetero norte', maxLength: 100 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @ApiPropertyOptional({ example: 'Zona de café arábigo junto al río', maxLength: 255 })
  @IsString()
  @IsOptional()
  @MaxLength(255)
  description?: string;

  @ApiPropertyOptional({ example: 2.5, description: 'Área del lote en hectáreas' })
  @IsNumber()
  @IsOptional()
  @Min(0)
  area?: number;

  @ApiPropertyOptional({ default: false })
  @IsBoolean()
  @IsOptional()
  capturedOffline?: boolean;

  @ApiPropertyOptional({ type: () => PolygonDto })
  @ValidateNested()
  @Type(() => PolygonDto)
  @IsOptional()
  polygon?: PolygonDto;
}
