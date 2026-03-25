import { Farmer } from 'src/farmers/entities/farmer.entity';
import { Instrument } from 'src/instruments/entities/instrument.entity';
import { Response } from 'src/responses/entities/response.entity';
import { User } from 'src/users/entities/user.entity';
import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  JoinTable,
  ManyToMany,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'surveys' })
export class Survey {
  @PrimaryGeneratedColumn('uuid', {
    name: 'survey_id',
  })
  surveyId: string;

  @ManyToOne(() => Farmer, {
    nullable: true,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({
    name: 'farmer_id',
    referencedColumnName: 'id',
  })
  farmer?: Farmer;

  @ManyToOne(() => User, {
    nullable: true,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({
    name: 'user_id',
    referencedColumnName: 'userId',
  })
  user?: User;

  @ManyToMany(() => Instrument, (instrument) => instrument.surveys)
  @JoinTable({
    name: 'surveys_instruments',
    joinColumn: {
      name: 'survey_id',
      referencedColumnName: 'surveyId',
    },
    inverseJoinColumn: {
      name: 'instrument_id',
      referencedColumnName: 'instrumentId',
    },
  })
  instruments: Instrument[];

  @OneToMany(() => Response, (response) => response.survey)
  responses: Response[];

  @Column({
    name: 'sincronized',
    type: 'boolean',
    nullable: false,
    default: false,
  })
  sincronized: boolean;

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
