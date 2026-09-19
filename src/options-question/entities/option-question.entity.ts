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

/**
 * Spec 86 — origen de la opción. 'field' = creada desde campo (cliente viejo
 * que todavía llama a POST /questions/:id/options, o migrada por el script de
 * datos legados). Nace archivada y sus respuestas se normalizan a "Otros".
 */
export const OPTION_ORIGINS = {
  INSTRUMENT: 'instrument',
  FIELD: 'field',
} as const;

export type OptionOrigin = (typeof OPTION_ORIGINS)[keyof typeof OPTION_ORIGINS];

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

  @Column({
    name: 'is_other',
    type: 'boolean',
    default: false,
  })
  isOther: boolean;

  @Column({
    name: 'metadata_id',
    type: 'varchar',
    length: 36,
    nullable: true,
    default: null,
  })
  metadataId: string | null;

  // Spec 84 — mismo mecanismo de archivado que Question.archivedAt.
  @Column({
    name: 'archived_at',
    type: 'timestamp',
    nullable: true,
  })
  archivedAt?: Date | null;

  // Spec 86 — ver OPTION_ORIGINS.
  @Column({
    type: 'varchar',
    length: 16,
    default: OPTION_ORIGINS.INSTRUMENT,
  })
  origin: OptionOrigin;

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
