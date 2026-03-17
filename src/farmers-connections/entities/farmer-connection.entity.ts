import { Farmer } from 'src/farmers/entities/farmer.entity';
import { TypeOfConnection } from 'src/types-of-connections/entities/type-of-connection.entity';
import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'farmers_connections' })
export class FarmerConnection {
  @PrimaryGeneratedColumn('uuid', {
    name: 'farmer_connection_id',
  })
  farmerConnectionId: string;

  @ManyToOne(() => Farmer, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({
    name: 'farmer_id',
    referencedColumnName: 'id',
  })
  farmer: Farmer;

  @ManyToOne(() => TypeOfConnection, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({
    name: 'connection_id',
    referencedColumnName: 'connectionId',
  })
  connection: TypeOfConnection;

  @Column({
    type: 'varchar',
    length: 50,
    nullable: true,
  })
  provider?: string;

  @Column({
    name: 'average_speed',
    type: 'float',
    nullable: true,
  })
  averageSpeed?: number;

  @Column({
    type: 'varchar',
    length: 50,
    nullable: true,
  })
  stability?: string;

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
