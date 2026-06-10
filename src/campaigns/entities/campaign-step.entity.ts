import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { Instrument } from 'src/instruments/entities/instrument.entity';
import { Question } from 'src/questions/entities/question.entity';
import { Campaign } from './campaign.entity';

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

  @ManyToOne(() => Question, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'condition_question_id' })
  conditionQuestion?: Question | null;

  @Column({
    name: 'condition_value',
    type: 'varchar',
    length: 50,
    nullable: true,
  })
  conditionValue?: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt: Date;
}
