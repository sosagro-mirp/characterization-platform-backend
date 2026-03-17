import { Farmer } from 'src/farmers/entities/farmer.entity';
import { Device } from 'src/devices/entities/device.entity';
import { Town } from 'src/towns/entities/town.entity';
import { TypeOfCrop } from 'src/types-of-crops/entities/type-of-crop.entity';
import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  JoinTable,
  ManyToMany,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'farms' })
export class Farm {
  @PrimaryGeneratedColumn('uuid', {
    name: 'farm_id',
  })
  farmId: string;

  @Column({
    type: 'varchar',
    length: 50,
    nullable: false,
  })
  name: string;

  @Column({
    type: 'varchar',
    length: 255,
  })
  location: string; // Coordenadas geográficas o dirección

  @Column({
    type: 'float',
    nullable: false,
  })
  area: number;

  @Column({
    name: 'water_access',
    type: 'boolean',
    nullable: false,
  })
  waterAccess: boolean;

  @Column({
    name: 'internet_access',
    type: 'boolean',
    nullable: false,
  })
  internetAccess: boolean;

  @Column({
    name: 'has_stability_electricity',
    type: 'boolean',
    nullable: false,
  })
  hasStabilityElectricity: boolean;

  @Column({
    name: 'technical_assistance_access',
    type: 'boolean',
    nullable: false,
  })
  technicalAssistanceAccess: boolean;

  @OneToMany(() => Farmer, (farmer) => farmer.farm)
  farmers: Farmer[];

  @ManyToMany(() => TypeOfCrop, (crop: TypeOfCrop) => crop.farms)
  @JoinTable({
    name: 'farms_crops',
    joinColumn: {
      name: 'farm_id',
      referencedColumnName: 'farmId',
    },
    inverseJoinColumn: {
      name: 'crop_id',
      referencedColumnName: 'cropId',
    },
  })
  crops: TypeOfCrop[];

  @ManyToMany(() => Device)
  @JoinTable({
    name: 'farms_devices',
    joinColumn: {
      name: 'farm_id',
      referencedColumnName: 'farmId',
    },
    inverseJoinColumn: {
      name: 'device_id',
      referencedColumnName: 'deviceId',
    },
  })
  devices: Device[];

  @ManyToOne(() => Town, (town) => town.farms, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({
    name: 'town_id',
    referencedColumnName: 'townId',
  })
  town?: Town;

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
