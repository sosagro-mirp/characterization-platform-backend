import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Farm } from 'src/farms/entities/farm.entity';

@Entity({ name: 'farm_plots' })
export class FarmPlot {
  @PrimaryGeneratedColumn('uuid', { name: 'farm_plot_id' })
  farmPlotId: string;

  @Column({ type: 'varchar', length: 100, nullable: false })
  name: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  description: string | null;

  @Column({ type: 'jsonb', nullable: true })
  polygon: object | null;

  @Column({ type: 'float', nullable: true })
  area: number | null;

  @Column({ name: 'captured_offline', type: 'boolean', default: false })
  capturedOffline: boolean;

  @ManyToOne(() => Farm, (farm) => farm.plots, {
    onDelete: 'CASCADE',
    nullable: false,
  })
  @JoinColumn({ name: 'farm_id', referencedColumnName: 'farmId' })
  farm: Farm;

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
