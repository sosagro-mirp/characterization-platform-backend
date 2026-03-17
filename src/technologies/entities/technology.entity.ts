import { Farmer } from 'src/farmers/entities/farmer.entity';
import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'technologies' })
export class Technology {
  @PrimaryGeneratedColumn('uuid', {
    name: 'technology_id',
  })
  technologyId: string;

  @Column({
    type: 'varchar',
    length: 50,
    nullable: false,
  })
  name: string;

  @Column({
    type: 'varchar',
    length: 50,
    nullable: false,
  })
  type: string;

  @Column({
    name: 'level_complexity',
    type: 'varchar',
    length: 50,
    nullable: false,
  })
  levelComplexity: string;

  @ManyToMany(() => Farmer, (farmer) => farmer.technologies)
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
