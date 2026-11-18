import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { DashboardChart } from './dashboard-chart.entity';

export type DashboardChartEventType =
  | 'created'
  | 'updated'
  | 'published'
  | 'unpublished'
  | 'archived'
  | 'restored';

/** Spec 108 (P7) — bitácora append-only de cada escritura sobre un gráfico. */
@Entity({ name: 'dashboard_chart_events' })
@Index('IDX_dashboard_chart_events_chart', ['chartId', 'createdAt'])
export class DashboardChartEvent {
  @PrimaryGeneratedColumn('uuid', { name: 'event_id' })
  eventId: string;

  @Column({ name: 'chart_id', type: 'uuid' })
  chartId: string;

  @ManyToOne(() => DashboardChart, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'chart_id' })
  chart: DashboardChart;

  @Column({ name: 'event_type', type: 'varchar', length: 20 })
  eventType: DashboardChartEventType;

  @Column({ name: 'user_id', type: 'uuid', nullable: true })
  userId: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @Column({ type: 'jsonb', default: () => `'{}'` })
  summary: Record<string, unknown>;
}
