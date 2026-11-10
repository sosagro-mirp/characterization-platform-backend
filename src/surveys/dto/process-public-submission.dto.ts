import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsIn,
  IsOptional,
  IsUUID,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { FARMER_FARM_ROLES } from '../../farmer-farms/entities/farmer-farm.entity';
import type { FarmerFarmRole } from '../../farmer-farms/entities/farmer-farm.entity';
import { ExtractFarmerDto } from './extract-farmer.dto';

export class ProcessPublicFarmDecisionDto {
  @ApiProperty({
    enum: ['create', 'link'],
    description:
      '`create` (por defecto) crea la finca del envío; `link` deja al productor en una finca existente.',
  })
  @IsIn(['create', 'link'])
  mode: 'create' | 'link';

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Finca existente. Obligatoria con `mode = link`.',
  })
  @ValidateIf(
    (o: ProcessPublicFarmDecisionDto) =>
      o.mode === 'link' || o.farmId !== undefined,
  )
  @IsUUID()
  farmId?: string;
}

// Spec 93 — decisiones del administrador al procesar un envío público. Extiende
// la resolución de colisión del spec 68 con la finca y el municipio.
export class ProcessPublicSubmissionDto extends ExtractFarmerDto {
  @ApiPropertyOptional({ type: ProcessPublicFarmDecisionDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ProcessPublicFarmDecisionDto)
  farm?: ProcessPublicFarmDecisionDto;

  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'Municipio de la finca cuando el envío no lo trae (el del envío tiene prioridad).',
  })
  @IsOptional()
  @IsUUID()
  townId?: string;

  // Spec 95 (D-H3-3) — rol del productor en la finca que se vincula o crea.
  @ApiPropertyOptional({
    enum: FARMER_FARM_ROLES,
    description:
      'Rol del productor en la finca. Por defecto el del perfil declarado en el envío, o `producer`.',
  })
  @IsOptional()
  @IsIn([...FARMER_FARM_ROLES])
  role?: FarmerFarmRole;
}

export class ProcessPreviewQueryDto {
  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'Municipio que el administrador asignaría, para ver la vista previa con él.',
  })
  @IsOptional()
  @IsUUID()
  townId?: string;
}
