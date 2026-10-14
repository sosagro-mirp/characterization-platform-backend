import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsOptional, IsUUID } from 'class-validator';
import { FARMER_FARM_ROLES } from 'src/farmer-farms/entities/farmer-farm.entity';
import type { FarmerFarmRole } from 'src/farmer-farms/entities/farmer-farm.entity';

/** Spec 94 — `POST /farmers/:id/farms`. */
export class LinkFarmerFarmDto {
  /** UUID de la finca (ya existente) a la que se vincula el productor */
  @ApiProperty({
    format: 'uuid',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsUUID()
  farmId: string;

  /** Rol del productor en la finca (por defecto `producer`) */
  @ApiPropertyOptional({
    enum: FARMER_FARM_ROLES,
    default: 'producer',
    example: 'worker',
  })
  @IsOptional()
  @IsIn(FARMER_FARM_ROLES)
  role?: FarmerFarmRole;

  /**
   * `true` la deja como finca principal y DESPLAZA a la actual (que queda no
   * principal); se actualiza el espejo `farmers.farm_id`. Si el productor no
   * tenía finca, el primer vínculo queda principal aunque no se indique.
   */
  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;
}
