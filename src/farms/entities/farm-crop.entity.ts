import { Farm } from 'src/farms/entities/farm.entity';
import { TypeOfCrop } from 'src/types-of-crops/entities/type-of-crop.entity';
import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';

/**
 * Spec 94 (D-H3-A) — cultivo de una finca como entidad propia (tabla
 * `farms_crops`, que antes era la tabla puente de un `@ManyToMany`). Las
 * encuestas se anclan a `farm_crop_id`, así que un cultivo nunca se borra:
 * se archiva (`archived_at`) y se reactiva si vuelve.
 *
 * `UQ_farms_crops_id_farm` es el destino de la FK compuesta de
 * `surveys (farm_crop_id, farm_id)`: la base rechaza un cultivo de otra finca.
 */
@Entity({ name: 'farms_crops' })
@Unique('UQ_farms_crops_farm_crop', ['farmId', 'cropId'])
@Unique('UQ_farms_crops_id_farm', ['farmCropId', 'farmId'])
export class FarmCrop {
  @PrimaryGeneratedColumn('uuid', {
    name: 'farm_crop_id',
    primaryKeyConstraintName: 'PK_farms_crops',
  })
  farmCropId: string;

  @Column({ name: 'farm_id', type: 'uuid' })
  farmId: string;

  @Column({ name: 'crop_id', type: 'uuid' })
  cropId: string;

  @ManyToOne(() => Farm, (farm) => farm.farmCrops, {
    nullable: false,
    onDelete: 'CASCADE',
    onUpdate: 'CASCADE',
  })
  @JoinColumn({ name: 'farm_id', referencedColumnName: 'farmId' })
  farm: Farm;

  @ManyToOne(() => TypeOfCrop, {
    nullable: false,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({
    name: 'crop_id',
    referencedColumnName: 'cropId',
    foreignKeyConstraintName: 'FK_farms_crops_crop',
  })
  crop: TypeOfCrop;

  @CreateDateColumn({
    name: 'created_at',
    type: 'timestamp',
    default: () => 'CURRENT_TIMESTAMP',
  })
  createdAt: Date;

  /** NULL = activo. Con fecha = quitado de la finca; las encuestas lo conservan. */
  @Column({ name: 'archived_at', type: 'timestamp', nullable: true })
  archivedAt: Date | null;
}
