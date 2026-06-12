import {
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
  Column,
} from 'typeorm';
import { Instrument } from 'src/instruments/entities/instrument.entity';
import { Campaign } from './campaign.entity';
import { StepCondition } from './step-condition.entity';

@Entity({ name: 'campaign_steps' })
@Unique('uq_campaign_step_order', ['campaign', 'order'])
export class CampaignStep {
  @PrimaryGeneratedColumn('uuid', { name: 'step_id' })
  stepId: string;

  @ManyToOne(() => Campaign, (campaign) => campaign.steps, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'campaign_id', referencedColumnName: 'campaignId' })
  campaign: Campaign;

  @ManyToOne(() => Instrument, {
    nullable: false,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'instrument_id', referencedColumnName: 'instrumentId' })
  instrument: Instrument;

  @Column({ name: 'order', type: 'integer', nullable: false })
  order: number;

  @OneToMany(() => StepCondition, (condition) => condition.step, {
    eager: false,
  })
  conditions: StepCondition[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt: Date;
}
