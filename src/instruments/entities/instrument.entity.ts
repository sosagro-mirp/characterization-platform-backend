import { Section } from 'src/sections/entities/section.entity';
import { Survey } from 'src/surveys/entities/survey.entity';
import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToMany,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'instruments' })
export class Instrument {
  @PrimaryGeneratedColumn('uuid', {
    name: 'instrument_id',
  })
  instrumentId: string;

  @Column({
    type: 'varchar',
    length: 50,
    nullable: false,
  })
  name: string;

  @Column({
    type: 'integer',
    nullable: false,
  })
  version: number;

  @Column({
    name: 'publish_date',
    type: 'date',
    nullable: false,
  })
  publishDate: string;

  @Column({
    name: 'is_active',
    type: 'boolean',
    nullable: false,
  })
  isActive: boolean;

  @OneToMany(() => Section, (section) => section.instrument)
  sections: Section[];

  @ManyToMany(() => Survey, (survey) => survey.instruments)
  surveys: Survey[];

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
