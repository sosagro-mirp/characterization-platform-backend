import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsNumber,
  IsOptional,
  ValidateNested,
} from 'class-validator';

export class PolygonPointDto {
  @ApiProperty({ example: 3.8612 })
  @IsNumber()
  lat: number;

  @ApiProperty({ example: -76.4213 })
  @IsNumber()
  lng: number;

  @ApiPropertyOptional({ example: 1250.5 })
  @IsNumber()
  @IsOptional()
  altitude: number | null;

  @ApiPropertyOptional({ example: 8.5 })
  @IsNumber()
  @IsOptional()
  accuracy: number | null;

  @ApiProperty({ example: '2026-06-19T14:30:00.000Z' })
  @IsDateString()
  capturedAt: string;
}

export class PolygonDto {
  @ApiProperty({ type: [PolygonPointDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PolygonPointDto)
  points: PolygonPointDto[];

  @ApiProperty({ example: '2026-06-19T14:35:00.000Z' })
  @IsDateString()
  closedAt: string;
}
