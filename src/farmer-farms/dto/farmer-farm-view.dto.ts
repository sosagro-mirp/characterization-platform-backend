import { ApiProperty } from '@nestjs/swagger';
import { FARMER_FARM_ROLES } from '../entities/farmer-farm.entity';
import type { FarmerFarmRole } from '../entities/farmer-farm.entity';

/**
 * Spec 94 — modelos de RESPUESTA (solo documentación Swagger; el servicio
 * devuelve objetos con esta misma forma, ver `farm-views.ts`).
 */

/** Cultivo de una finca con su id propio (el que referencian las encuestas). */
export class FarmCropRefDto {
  @ApiProperty({ format: 'uuid' }) farmCropId: string;
  @ApiProperty({ format: 'uuid' }) cropId: string;
  @ApiProperty({ example: 'Café' }) name: string;
}

/** Elemento de `farms[]` en `GET /farmers`, `/farmers/search`, `/farmers/:id` y `extract-farmer`. */
export class FarmerFarmViewDto {
  @ApiProperty({ format: 'uuid' }) farmId: string;
  @ApiProperty() name: string;
  @ApiProperty({ nullable: true, type: String }) vereda: string | null;
  @ApiProperty({
    nullable: true,
    description: 'Municipio de la finca: { townId, name }.',
    type: 'object',
    properties: {
      townId: { type: 'string', format: 'uuid' },
      name: { type: 'string' },
    },
  })
  town: { townId: string; name: string } | null;
  @ApiProperty({ enum: FARMER_FARM_ROLES }) role: FarmerFarmRole;
  @ApiProperty({
    description:
      'Finca principal del productor: es la que además sale como `farm` (deprecado).',
  })
  isPrimary: boolean;
  @ApiProperty({
    type: [FarmCropRefDto],
    description: 'Cultivos ACTIVOS de la finca.',
  })
  crops: FarmCropRefDto[];
}

/** Elemento de `farmers[]` en `GET /farms/:id`. */
export class FarmFarmerViewDto {
  @ApiProperty({ format: 'uuid' }) farmerId: string;
  @ApiProperty() name: string;
  @ApiProperty({ enum: FARMER_FARM_ROLES }) role: FarmerFarmRole;
  @ApiProperty() isPrimary: boolean;
}

/** Respuesta de `POST/PATCH /farmers/:id/farms`. */
export class FarmerFarmLinkDto {
  @ApiProperty({ format: 'uuid' }) farmerId: string;
  @ApiProperty({ format: 'uuid' }) farmId: string;
  @ApiProperty({ enum: FARMER_FARM_ROLES }) role: FarmerFarmRole;
  @ApiProperty() isPrimary: boolean;
  @ApiProperty({
    enum: ['backfill', 'extraction', 'public_process', 'admin'],
    description: 'Quién creó el vínculo.',
  })
  source: string;
}
