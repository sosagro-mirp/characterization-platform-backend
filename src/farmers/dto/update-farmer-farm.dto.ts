import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsOptional } from 'class-validator';
import { FARMER_FARM_ROLES } from 'src/farmer-farms/entities/farmer-farm.entity';
import type { FarmerFarmRole } from 'src/farmer-farms/entities/farmer-farm.entity';

/** Spec 94 — `PATCH /farmers/:id/farms/:farmId`. Sin desvincular (D-H3-7). */
export class UpdateFarmerFarmDto {
  /** Nuevo rol del productor en la finca */
  @ApiPropertyOptional({ enum: FARMER_FARM_ROLES, example: 'owner' })
  @IsOptional()
  @IsIn(FARMER_FARM_ROLES)
  role?: FarmerFarmRole;

  /**
   * `true` la marca como principal y desplaza a la actual; actualiza el espejo
   * `farmers.farm_id`. `false` sobre la principal se rechaza (400): hay que
   * designar otra como principal.
   */
  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;
}
