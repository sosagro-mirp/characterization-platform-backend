import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { DashboardCategory } from './dashboard-category.entity';
import { DashboardChartSource } from './dashboard-chart-source.entity';

export type DashboardChartSourceKind = 'questions' | 'entity_metric';
export type DashboardCombineMode = 'merge' | 'compare';
export type DashboardAudience = 'public' | 'private';
export type DashboardChartStatus = 'draft' | 'published';
export type DashboardChartLayout = 'normal' | 'wide';

/** Spec 108 (P1, P6, P7, P9, P23) — gráfico armado por un admin. */
@Entity({ name: 'dashboard_charts' })
@Check(
  'CHK_dashboard_charts_source_kind',
  `"source_kind" IN ('questions','entity_metric')`,
)
@Check(
  'CHK_dashboard_charts_combine_mode',
  `"combine_mode" IN ('merge','compare')`,
)
@Check('CHK_dashboard_charts_audience', `"audience" IN ('public','private')`)
@Check('CHK_dashboard_charts_status', `"status" IN ('draft','published')`)
@Check('CHK_dashboard_charts_layout', `"layout" IN ('normal','wide')`)
@Index('IDX_dashboard_charts_listing', [
  'categoryId',
  'status',
  'audience',
  'position',
])
export class DashboardChart {
  @PrimaryGeneratedColumn('uuid', { name: 'chart_id' })
  chartId: string;

  @Column({ name: 'category_id', type: 'uuid' })
  categoryId: string;

  @ManyToOne(() => DashboardCategory, (c) => c.charts, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'category_id' })
  category: DashboardCategory;

  @Column({ type: 'varchar', length: 255 })
  title: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  subtitle: string | null;

  @Column({ name: 'source_kind', type: 'varchar', length: 20 })
  sourceKind: DashboardChartSourceKind;

  @Column({
    name: 'question_type',
    type: 'varchar',
    length: 50,
    nullable: true,
  })
  questionType: string | null;

  @Column({ name: 'chart_kind', type: 'varchar', length: 50 })
  chartKind: string;

  @Column({
    name: 'combine_mode',
    type: 'varchar',
    length: 10,
    default: 'merge',
  })
  combineMode: DashboardCombineMode;

  @Column({ type: 'jsonb', default: () => `'{}'` })
  settings: Record<string, unknown>;

  @Column({
    name: 'entity_metric_key',
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  entityMetricKey: string | null;

  @Column({ type: 'varchar', length: 10, default: 'public' })
  audience: DashboardAudience;

  @Column({ type: 'varchar', length: 10, default: 'draft' })
  status: DashboardChartStatus;

  @Column({ type: 'varchar', length: 10, default: 'normal' })
  layout: DashboardChartLayout;

  @Column({ type: 'integer', default: 0 })
  position: number;

  @Column({ name: 'archived_at', type: 'timestamptz', nullable: true })
  archivedAt: Date | null;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy: string | null;

  @Column({ name: 'updated_by', type: 'uuid', nullable: true })
  updatedBy: string | null;

  @Column({ name: 'published_by', type: 'uuid', nullable: true })
  publishedBy: string | null;

  @Column({ name: 'published_at', type: 'timestamptz', nullable: true })
  publishedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @OneToMany(() => DashboardChartSource, (s) => s.chart)
  sources: DashboardChartSource[];
}
