import { Cooperative } from 'src/cooperatives/entities/cooperative.entity';
import { Town } from 'src/towns/entities/town.entity';
import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'departments' })
export class Department {
  @PrimaryGeneratedColumn('uuid', {
    name: 'department_id',
  })
  departmentId: string;

  @Column({
    type: 'varchar',
    length: 50,
    nullable: false,
  })
  name: string;

  @OneToMany(() => Cooperative, (cooperative) => cooperative.department)
  cooperatives: Cooperative[];

  @OneToMany(() => Town, (town) => town.department)
  towns: Town[];

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
