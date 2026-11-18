import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { Question } from 'src/questions/entities/question.entity';
import { DashboardChart } from './dashboard-chart.entity';

/** Spec 108 (P4, P5, P9) — pregunta de una serie, con huella de instrumento y texto. */
@Entity({ name: 'dashboard_chart_sources' })
@Unique('UQ_dashboard_chart_sources_chart_question', ['chartId', 'questionId'])
export class DashboardChartSource {
  @PrimaryGeneratedColumn('uuid', { name: 'source_id' })
  sourceId: string;

  @Column({ name: 'chart_id', type: 'uuid' })
  chartId: string;

  @ManyToOne(() => DashboardChart, (c) => c.sources, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'chart_id' })
  chart: DashboardChart;

  @Column({ name: 'question_id', type: 'uuid' })
  questionId: string;

  @ManyToOne(() => Question, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'question_id' })
  question: Question;

  @Column({ name: 'series_key', type: 'varchar', length: 100 })
  seriesKey: string;

  @Column({ name: 'series_label', type: 'varchar', length: 255 })
  seriesLabel: string;

  @Column({ name: 'series_position', type: 'integer', default: 0 })
  seriesPosition: number;

  @Column({ name: 'is_representative', type: 'boolean', default: false })
  isRepresentative: boolean;

  @Column({
    name: 'instrument_code_snapshot',
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  instrumentCodeSnapshot: string | null;

  @Column({ name: 'question_text_snapshot', type: 'text' })
  questionTextSnapshot: string;
}
