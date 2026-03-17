import { Farmer } from 'src/farmers/entities/farmer.entity';
import { Department } from 'src/departments/entities/department.entity';
import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'cooperatives' })
export class Cooperative {
  @PrimaryGeneratedColumn('uuid', {
    name: 'cooperative_id',
  })
  cooperativeId: string;

  @Column({
    type: 'varchar',
    length: 50,
    nullable: false,
  })
  name: string;

  @ManyToOne(() => Department, (department) => department.cooperatives, {
    nullable: false,
  })
  @JoinColumn({
    name: 'department_id',
    referencedColumnName: 'departmentId',
  })
  department: Department;

  @OneToMany(() => Farmer, (farmer) => farmer.cooperative)
  farmers: Farmer[];

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
