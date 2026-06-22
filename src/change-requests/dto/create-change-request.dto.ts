import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import type { ChangeRequestCategory } from '../entities/change-request.entity';

const VALID_CATEGORIES: ChangeRequestCategory[] = ['bug_ui', 'data_error', 'suggestion', 'other'];

export class CreateChangeRequestDto {
  @ApiProperty({ description: 'Descripción del problema o solicitud', maxLength: 2000 })
  @IsString()
  @MinLength(10)
  @MaxLength(2000)
  description: string;

  @ApiProperty({ required: false, description: 'Agricultor vinculado (solo tickets de mobile)' })
  @IsOptional()
  @IsUUID()
  farmerId?: string;

  @ApiProperty({ required: false, description: 'UUID generado en mobile para idempotencia' })
  @IsOptional()
  @IsString()
  @MaxLength(36)
  localId?: string;

  @ApiProperty({ required: false, enum: VALID_CATEGORIES, description: 'Categoría del ticket (obligatorio para tickets web)' })
  @IsOptional()
  @IsIn(VALID_CATEGORIES)
  category?: ChangeRequestCategory;
}
