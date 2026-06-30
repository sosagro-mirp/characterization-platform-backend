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
    nullable: true,
  })
  location: string | null;

  @Column({
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  vereda: string | null;

  @Column({
    type: 'float',
    nullable: true,
  })
  area: number | null;

  @Column({
    name: 'water_access',
    type: 'boolean',
    nullable: true,
  })
  waterAccess: boolean | null;

  @Column({
    name: 'internet_access',
    type: 'boolean',
    nullable: true,
  })
  internetAccess: boolean | null;

  @Column({
    name: 'has_electricity_access',
    type: 'boolean',
    nullable: true,
  })
  hasElectricityAccess: boolean | null;

  @Column({
    name: 'technical_assistance_access',
    type: 'boolean',
    nullable: true,
  })
  technicalAssistanceAccess: boolean | null;

  @Column({
    type: 'float',
    nullable: true,
  })
  latitude: number | null;

  @Column({
    type: 'float',
    nullable: true,
  })
  longitude: number | null;

  @Column({
    type: 'float',
    nullable: true,
  })
  altitude: number | null;

  @Column({
    name: 'main_access_type',
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  mainAccessType: string | null;

  @Column({
    name: 'electricity_source_type',
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  electricitySourceType: string | null;

  @Column({
    name: 'water_source_type',
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  waterSourceType: string | null;

  @Column({
    name: 'plot_count',
    type: 'int',
    nullable: true,
  })
  plotCount: number | null;

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
