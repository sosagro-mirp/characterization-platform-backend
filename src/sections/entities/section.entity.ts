import { Instrument } from 'src/instruments/entities/instrument.entity';
import { Question } from 'src/questions/entities/question.entity';
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

@Entity({ name: 'sections' })
export class Section {
  @PrimaryGeneratedColumn('uuid', {
    name: 'section_id',
  })
  sectionId: string;

  @Column({
    type: 'varchar',
    length: 100,
    nullable: false,
  })
  name: string;

  @Column({
    name: 'order',
    type: 'integer',
    nullable: false,
  })
  order: number;

  @ManyToOne(() => Instrument, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({
    name: 'instrument_id',
    referencedColumnName: 'instrumentId',
  })
  instrument: Instrument;

  @OneToMany(() => Question, (question: Question) => question.section)
  questions: Question[];

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
