import { Farmer } from 'src/farmers/entities/farmer.entity';
import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'digital_funcionality' })
export class DigitalFuncionality {
  @PrimaryGeneratedColumn('uuid', {
    name: 'functionality_id',
  })
  functionalityId: string;

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
  category: string;

  @Column({
    type: 'text',
    nullable: true,
  })
  description?: string;

  @ManyToMany(
    () => Farmer,
    (farmer: Farmer): DigitalFuncionality[] => farmer.digitalFuncionalities,
  )
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
