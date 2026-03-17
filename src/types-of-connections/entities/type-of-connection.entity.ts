import { FarmerConnection } from 'src/farmers-connections/entities/farmer-connection.entity';
import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'type_of_conections' })
export class TypeOfConnection {
  @PrimaryGeneratedColumn('uuid', {
    name: 'connection_id',
  })
  connectionId: string;

  @Column({
    type: 'varchar',
    length: 50,
    nullable: false,
  })
  name: string;

  @OneToMany(
    () => FarmerConnection,
    (farmerConnection) => farmerConnection.connection,
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
