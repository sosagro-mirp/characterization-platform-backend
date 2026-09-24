import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsIn,
  IsOptional,
  IsUUID,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
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
