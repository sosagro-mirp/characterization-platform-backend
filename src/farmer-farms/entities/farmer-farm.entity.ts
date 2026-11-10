import { Farm } from 'src/farms/entities/farm.entity';
import { Farmer } from 'src/farmers/entities/farmer.entity';
import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

/** Catálogo de roles del productor en la finca (spec 94, D-H3-3). */
export const FARMER_FARM_ROLES = [
  'owner',
  'producer',
  'manager',
  'worker',
  'family',
  'other',
] as const;
export type FarmerFarmRole = (typeof FARMER_FARM_ROLES)[number];

/** Origen del vínculo (spec 94, "Modelo de datos"). */
export const FARMER_FARM_SOURCES = [
  'backfill',
  'extraction',
  'public_process',
  'admin',
] as const;
export type FarmerFarmSource = (typeof FARMER_FARM_SOURCES)[number];

/**
 * Spec 94 (D1) — vínculo N:M productor ↔ finca con rol. Es la fuente de verdad
 * de qué fincas tiene un productor; `farmers.farm_id` queda deprecado como
 * ESPEJO de la finca principal (`is_primary`) hasta H8: todo cambio de
 * principal debe actualizarlo (ver `farm-links.ts`).
 */
@Entity({ name: 'farmer_farms' })
@Unique('UQ_farmer_farms_farmer_farm', ['farmerId', 'farmId'])
@Index('UQ_farmer_farms_primary', ['farmerId'], {
  unique: true,
  where: '"is_primary" = true',
})
@Index('IDX_farmer_farms_farm', ['farmId'])
@Check(
  'CHK_farmer_farms_role',
  `"role" IN ('owner', 'producer', 'manager', 'worker', 'family', 'other')`,
)
export class FarmerFarm {
  @PrimaryGeneratedColumn('uuid', {
    name: 'farmer_farm_id',
    primaryKeyConstraintName: 'PK_farmer_farms',
  })
  farmerFarmId: string;

  @Column({ name: 'farmer_id', type: 'uuid' })
  farmerId: string;

  @Column({ name: 'farm_id', type: 'uuid' })
  farmId: string;

  @ManyToOne(() => Farmer, (farmer) => farmer.farmLinks, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({
    name: 'farmer_id',
    referencedColumnName: 'id',
    foreignKeyConstraintName: 'FK_farmer_farms_farmer',
  })
  farmer: Farmer;

  @ManyToOne(() => Farm, (farm) => farm.farmerLinks, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({
    name: 'farm_id',
    referencedColumnName: 'farmId',
    foreignKeyConstraintName: 'FK_farmer_farms_farm',
  })
  farm: Farm;

  @Column({ type: 'varchar', length: 20, nullable: false, default: 'producer' })
  role: FarmerFarmRole;

  @Column({
    name: 'is_primary',
    type: 'boolean',
    nullable: false,
    default: false,
  })
  isPrimary: boolean;

  @Column({ type: 'varchar', length: 20, nullable: false })
  source: FarmerFarmSource;

  @CreateDateColumn({
    name: 'created_at',
    type: 'timestamp',
    default: () => 'CURRENT_TIMESTAMP',
  })
  createdAt: Date;

  @UpdateDateColumn({
    name: 'updated_at',
    type: 'timestamp',
    default: () => 'CURRENT_TIMESTAMP',
  })
  updatedAt: Date;
}
