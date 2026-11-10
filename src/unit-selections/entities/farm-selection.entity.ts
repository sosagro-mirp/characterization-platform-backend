import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

export const SELECTION_STATUSES = [
  'included',
  'excluded',
  'in_review',
] as const;
export type SelectionStatus = (typeof SELECTION_STATUSES)[number];

/** Spec 99 — decisión vigente sobre una finca. Sin fila = sin decisión. */
@Entity({ name: 'farm_selections' })
export class FarmSelection {
  @PrimaryColumn('uuid', { name: 'farm_id' })
  farmId: string;

  @Column({ type: 'varchar', length: 20 })
  status: SelectionStatus;

  @Column({ type: 'text' })
  reason: string;

  /** Control de edición simultánea: sube en cada cambio. */
  @Column({ type: 'int', default: 1 })
  version: number;

  @Column({ name: 'updated_by', type: 'uuid', nullable: true })
  updatedBy: string | null;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt: Date;
}
