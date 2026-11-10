import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

/** Spec 98 — registro inmutable de cada exportación; el archivo no se guarda. */
@Entity({ name: 'data_export_logs' })
export class DataExportLog {
  @PrimaryGeneratedColumn('uuid', { name: 'export_id' })
  exportId: string;

  @Column({ name: 'user_id', type: 'uuid', nullable: true })
  userId: string | null;

  @Column({ name: 'user_email', type: 'varchar', length: 255 })
  userEmail: string;

  @Column({ name: 'export_type', type: 'varchar', length: 50 })
  exportType: string;

  @Column({ type: 'jsonb', default: () => `'{}'` })
  filters: Record<string, unknown>;

  @Column({
    name: 'farm_ids',
    type: 'uuid',
    array: true,
    default: () => `'{}'`,
  })
  farmIds: string[];

  @Column({ name: 'row_count', type: 'int' })
  rowCount: number;

  @Column({ name: 'file_sha256', type: 'varchar', length: 64 })
  fileSha256: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;
}
