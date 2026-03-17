import { OptionQuestion } from 'src/options-question/entities/option-question.entity';
import { Response } from 'src/responses/entities/response.entity';
import { Section } from 'src/sections/entities/section.entity';
import { TypeOfQuestion } from 'src/types-of-questions/entities/type-of-question.entity';
import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'questions' })
export class Question {
  @PrimaryGeneratedColumn('uuid', {
    name: 'question_id',
  })
  questionId: string;

  @ManyToOne(
    () => Section,
    (section: Section): Question[] => section.questions,
    {
      nullable: false,
      onDelete: 'CASCADE',
    },
  )
  @JoinColumn({
    name: 'section_id',
    referencedColumnName: 'sectionId',
  })
  section: Section;

  @Column({
    type: 'varchar',
    length: 255,
    nullable: false,
  })
  text: string;

  @ManyToOne(() => TypeOfQuestion, {
    nullable: false,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({
    name: 'type_id',
    referencedColumnName: 'typeId',
  })
  type: TypeOfQuestion;

  @Column({
    name: 'is_required',
    type: 'boolean',
    nullable: false,
  })
  isRequired: boolean;

  @Column({
    name: 'order',
    type: 'integer',
    nullable: false,
  })
  order: number;

  @OneToMany(
    () => Response,
    (response: Response): Question => response.question,
  )
  responses: Response[];

  @OneToMany(
    () => OptionQuestion,
    (option: OptionQuestion): Question => option.question,
  )
  options: OptionQuestion[];

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
