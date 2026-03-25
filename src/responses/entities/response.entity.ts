import { OptionQuestion } from 'src/options-question/entities/option-question.entity';
import { Question } from 'src/questions/entities/question.entity';
import { Survey } from 'src/surveys/entities/survey.entity';
import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'responses' })
export class Response {
  @PrimaryGeneratedColumn('uuid', {
    name: 'response_id',
  })
  responseId: string;

  @ManyToOne(() => Survey, (survey: Survey) => survey.responses, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({
    name: 'survey_id',
    referencedColumnName: 'surveyId',
  })
  survey: Survey;

  @ManyToOne(() => Question, (question: Question) => question.responses, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({
    name: 'question_id',
    referencedColumnName: 'questionId',
  })
  question: Question;

  @ManyToOne(() => OptionQuestion, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({
    name: 'option_id',
    referencedColumnName: 'optionId',
  })
  option?: OptionQuestion;

  @Column({
    name: 'text_value',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  textValue?: string;

  @Column({
    name: 'numeric_value',
    type: 'float',
    nullable: true,
  })
  numericValue?: number;

  @Column({
    name: 'boolean_value',
    type: 'boolean',
    nullable: true,
  })
  booleanValue?: boolean;

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
