import { Farmer } from 'src/farmers/entities/farmer.entity';
import { User } from 'src/users/entities/user.entity';
import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type ChangeRequestSource = 'mobile' | 'web';
export type ChangeRequestStatus = 'open' | 'resolved';
export type ChangeRequestCategory = 'bug_ui' | 'data_error' | 'suggestion' | 'other';

@Entity({ name: 'change_requests' })
export class ChangeRequest {
  @PrimaryGeneratedColumn('uuid', { name: 'change_request_id' })
  changeRequestId: string;

  @Column({ type: 'varchar', length: 2000, nullable: false })
  description: string;

  @Column({ type: 'varchar', length: 10, nullable: false, default: 'open' })
  status: ChangeRequestStatus;

  @Column({ type: 'varchar', length: 10, nullable: false })
  source: ChangeRequestSource;

  @Column({ type: 'varchar', length: 20, nullable: true, default: null })
  category: ChangeRequestCategory | null;

  @Column({ name: 'local_id', type: 'varchar', length: 36, nullable: true, default: null })
  localId: string | null;

  @ManyToOne(() => User, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'created_by_user_id', referencedColumnName: 'userId' })
  createdBy: User;

  @ManyToOne(() => Farmer, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'farmer_id', referencedColumnName: 'id' })
  farmer: Farmer | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'resolved_by_user_id', referencedColumnName: 'userId' })
  resolvedBy: User | null;

  @Column({ name: 'resolved_at', type: 'timestamp', nullable: true, default: null })
  resolvedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  updatedAt: Date;
}
