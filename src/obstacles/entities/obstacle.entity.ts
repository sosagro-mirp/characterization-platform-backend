import { Farmer } from 'src/farmers/entities/farmer.entity';
import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'obstacles' })
export class Obstacle {
  @PrimaryGeneratedColumn('uuid', {
    name: 'obstacle_id',
  })
  obstacleId: string;

  @Column({
    type: 'varchar',
    length: 50,
    nullable: false,
  })
  name: string;

  @ManyToMany(() => Farmer, (farmer) => farmer.obstacles)
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
