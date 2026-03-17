import { Question } from 'src/questions/entities/question.entity';
import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'options_question' })
export class OptionQuestion {
  @PrimaryGeneratedColumn('uuid', {
    name: 'option_id',
  })
  optionId: string;

  @ManyToOne(
    () => Question,
    (question: Question): OptionQuestion[] => question.options,
    {
      nullable: false,
      onDelete: 'CASCADE',
    },
  )
  @JoinColumn({
    name: 'question_id',
    referencedColumnName: 'questionId',
  })
  question: Question;

  @Column({
    type: 'varchar',
    length: 255,
    nullable: false,
  })
  text: string;

  @Column({
    type: 'float',
    nullable: true,
  })
  value?: number;

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
