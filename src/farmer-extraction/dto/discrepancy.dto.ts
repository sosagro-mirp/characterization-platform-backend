import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import {
  DISCREPANCY_ENTITY_TYPES,
  DISCREPANCY_STATUSES,
} from '../entities/entity-field-discrepancy.entity';
import type {
  DiscrepancyEntityType,
  DiscrepancyStatus,
} from '../entities/entity-field-discrepancy.entity';

export class ListDiscrepanciesQueryDto {
  @ApiPropertyOptional({ enum: DISCREPANCY_STATUSES })
  @IsOptional()
  @IsIn([...DISCREPANCY_STATUSES])
  status?: DiscrepancyStatus;

  @ApiPropertyOptional({ enum: DISCREPANCY_ENTITY_TYPES })
  @IsOptional()
  @IsIn([...DISCREPANCY_ENTITY_TYPES])
  entityType?: DiscrepancyEntityType;

  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 25 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

export class ListFarmerDiscrepanciesQueryDto {
  @ApiPropertyOptional({ enum: DISCREPANCY_STATUSES })
  @IsOptional()
  @IsIn([...DISCREPANCY_STATUSES])
  status?: DiscrepancyStatus;
}

export class ResolveDiscrepancyDto {
  @ApiProperty({
    enum: ['apply', 'dismiss'],
    description:
      '`apply` sobrescribe el valor en la entidad y marca `applied`; `dismiss` la deja como está y marca `dismissed`.',
  })
  @IsIn(['apply', 'dismiss'])
  action: 'apply' | 'dismiss';
}

export interface DiscrepancyView {
  discrepancyId: string;
  entityType: DiscrepancyEntityType;
  farmerId: string | null;
  farmId: string | null;
  field: string;
  systemField: string | null;
  currentValue: unknown;
  submittedValue: unknown;
  surveyId: string;
  responseId: string | null;
  status: DiscrepancyStatus;
  resolvedBy: string | null;
  resolvedAt: string | null;
  createdAt: string;
}
