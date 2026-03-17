import { Department } from 'src/departments/entities/department.entity';
import { Farm } from 'src/farms/entities/farm.entity';
import { Institution } from 'src/institutions/entities/institution.entity';
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

@Entity({ name: 'towns' })
export class Town {
  @PrimaryGeneratedColumn('uuid', {
    name: 'town_id',
  })
  townId: string;

  @Column({
    type: 'varchar',
    length: 50,
    nullable: false,
  })
  name: string;

  @ManyToOne(() => Department, (department) => department.towns, {
    nullable: false,
  })
  @JoinColumn({
    name: 'department_id',
    referencedColumnName: 'departmentId',
  })
  department: Department;

  @OneToMany(() => Farm, (farm) => farm.town)
  farms: Farm[];

  @OneToMany(() => Institution, (institution) => institution.town)
  institutions: Institution[];

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
