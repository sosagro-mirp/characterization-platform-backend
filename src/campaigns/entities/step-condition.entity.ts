import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Question } from 'src/questions/entities/question.entity';
import { TypeOfCrop } from 'src/types-of-crops/entities/type-of-crop.entity';
import { CampaignStep } from './campaign-step.entity';

export type ConditionType = 'question' | 'crop';
export type LogicalOperator = 'AND' | 'OR';

@Entity({ name: 'step_conditions' })
export class StepCondition {
  @PrimaryGeneratedColumn('uuid', { name: 'condition_id' })
  conditionId: string;

  @ManyToOne(() => CampaignStep, (step) => step.conditions, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'step_id', referencedColumnName: 'stepId' })
  step: CampaignStep;

  @Column({ name: 'order', type: 'integer', nullable: false })
  order: number;

  @Column({
    name: 'logical_operator',
    type: 'varchar',
    length: 3,
    nullable: true,
  })
  logicalOperator: LogicalOperator | null;

  @Column({ name: 'condition_type', type: 'varchar', length: 10, nullable: false })
  conditionType: ConditionType;

  @ManyToOne(() => Question, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'condition_question_id' })
  conditionQuestion?: Question;

  @Column({
    name: 'condition_value',
    type: 'varchar',
    length: 50,
    nullable: true,
  })
  conditionValue?: string;

  @ManyToOne(() => TypeOfCrop, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'condition_crop_id' })
  conditionCrop?: TypeOfCrop;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt: Date;
}
