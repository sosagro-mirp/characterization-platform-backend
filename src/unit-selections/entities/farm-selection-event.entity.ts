import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';
import type { SelectionStatus } from './farm-selection.entity';

/** Spec 99 — historial inalterable: no hay endpoints que lo editen ni borren. */
@Entity({ name: 'farm_selection_events' })
export class FarmSelectionEvent {
  @PrimaryGeneratedColumn('uuid', { name: 'event_id' })
  eventId: string;

  @Column({ name: 'farm_id', type: 'uuid' })
  farmId: string;

  @Column({ name: 'from_status', type: 'varchar', length: 20, nullable: true })
  fromStatus: SelectionStatus | null;

  @Column({ name: 'to_status', type: 'varchar', length: 20 })
  toStatus: SelectionStatus;

  @Column({ type: 'text' })
  reason: string;

  @Column({ name: 'user_id', type: 'uuid', nullable: true })
  userId: string | null;

  @Column({ name: 'user_name', type: 'varchar', length: 255 })
  userName: string;

  /** Cobertura de la finca por instrumento al momento de decidir. */
  @Column({ name: 'coverage_snapshot', type: 'jsonb' })
  coverageSnapshot: unknown;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;
}
