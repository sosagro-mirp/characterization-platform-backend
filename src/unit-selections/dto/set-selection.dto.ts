import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsInt, IsNotEmpty, IsString, Min } from 'class-validator';
import { SELECTION_STATUSES } from '../entities/farm-selection.entity';
import type { SelectionStatus } from '../entities/farm-selection.entity';

export class SetSelectionDto {
  @ApiProperty({ enum: SELECTION_STATUSES })
  @IsIn(SELECTION_STATUSES)
  status: SelectionStatus;

  /** Obligatorio en todo cambio; un texto solo de espacios no cuenta. */
  @ApiProperty()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty()
  reason: string;

  /** Versión que la persona vio al abrir el diálogo (0 = sin decisión previa). */
  @ApiProperty({ minimum: 0 })
  @IsInt()
  @Min(0)
  expectedVersion: number;
}
