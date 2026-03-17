import { Farm } from 'src/farms/entities/farm.entity';
import { Cooperative } from 'src/cooperatives/entities/cooperative.entity';
import { DigitalFuncionality } from 'src/digital-funcionality/entities/digital-funcionality.entity';
import { FarmerConnection } from 'src/farmers-connections/entities/farmer-connection.entity';
import { Obstacle } from 'src/obstacles/entities/obstacle.entity';
import { Technology } from 'src/technologies/entities/technology.entity';
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

@Entity({ name: 'farmers' })
export class Farmer {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({
    type: 'varchar',
    length: 255,
    nullable: false,
  })
  name: string;

  @Column({
    type: 'varchar',
    name: 'last_name',
    length: 255,
    nullable: false,
  })
  lastName: string;

  @Column({
    type: 'varchar',
    name: 'document_id',
    length: 50,
    nullable: false,
  })
  documentId: string;

  @Column({
    type: 'varchar',
    length: 255,
  })
  email: string;

  @Column({
    type: 'varchar',
    length: 255,
  })
  phone: string;

  @Column({
    type: 'int',
    nullable: false,
  })
  age: number;

  @Column({
    type: 'varchar',
    length: 50,
  })
  gender: string;

  @Column({
    type: 'varchar',
    name: 'education_level',
    length: 100,
    nullable: false,
  })
  educationLevel: string;

  @Column({
    type: 'int',
    name: 'experience_years',
  })
  experienceYears: number;

  @Column({
    type: 'int',
    name: 'family_size',
  })
  familySize: number;

  @Column({
    type: 'boolean',
    name: 'is_main_income',
  })
  isMainIncome: boolean;

  @Column('boolean', { name: 'participation_in_training' })
  participationInTraining: boolean;

  @ManyToOne(() => Farm, (farm) => farm.farmers, {
    nullable: true,
    onDelete: 'SET NULL', // Si la granja se elimina, el campo farm_id se establece en NULL
  })
  @JoinColumn({
    name: 'farm_id',
    referencedColumnName: 'farmId',
  })
  farm?: Farm;

  @ManyToOne(() => Cooperative, (cooperative) => cooperative.farmers, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({
    name: 'cooperative_id',
    referencedColumnName: 'cooperativeId',
  })
  cooperative?: Cooperative;

  @ManyToMany(() => Technology, (technology) => technology.farmers)
  @JoinTable({
    name: 'farmers_technologies',
    joinColumn: {
      name: 'farmer_id',
      referencedColumnName: 'id',
    },
    inverseJoinColumn: {
      name: 'technology_id',
      referencedColumnName: 'technologyId',
    },
  })
  technologies: Technology[];

  @ManyToMany(() => Obstacle, (obstacle) => obstacle.farmers)
  @JoinTable({
    name: 'farmers_obstacles',
    joinColumn: {
      name: 'farmer_id',
      referencedColumnName: 'id',
    },
    inverseJoinColumn: {
      name: 'obstacle_id',
      referencedColumnName: 'obstacleId',
    },
  })
  obstacles: Obstacle[];

  @ManyToMany(
    () => DigitalFuncionality,
    (digitalFuncionality) => digitalFuncionality.farmers,
  )
  @JoinTable({
    name: 'farmers_digital_funcionalities',
    joinColumn: {
      name: 'farmer_id',
      referencedColumnName: 'id',
    },
    inverseJoinColumn: {
      name: 'functionality_id',
      referencedColumnName: 'functionalityId',
    },
  })
  digitalFuncionalities: DigitalFuncionality[];

  @OneToMany(
    () => FarmerConnection,
    (farmerConnection) => farmerConnection.farmer,
  )
  farmerConnections: FarmerConnection[];

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
