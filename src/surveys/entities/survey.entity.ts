import { ActorType } from 'src/actor-types/entities/actor-type.entity';
import { CampaignSession } from 'src/campaign-sessions/entities/campaign-session.entity';
import { Department } from 'src/departments/entities/department.entity';
import { Farmer } from 'src/farmers/entities/farmer.entity';
import { Instrument } from 'src/instruments/entities/instrument.entity';
import { Response } from 'src/responses/entities/response.entity';
import { Town } from 'src/towns/entities/town.entity';
import { TypeOfCrop } from 'src/types-of-crops/entities/type-of-crop.entity';
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

  @ManyToOne(() => ActorType, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'actor_type_id' })
  actorType?: ActorType;

  @ManyToOne(() => Department, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'department_id' })
  department?: Department;

  @ManyToOne(() => Town, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'town_id' })
  town?: Town;

  @Column({ name: 'vereda', type: 'varchar', length: 100, nullable: true })
  vereda?: string;

  @ManyToOne(() => TypeOfCrop, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'crop_id' })
  crop?: TypeOfCrop;

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

  @ManyToOne(() => CampaignSession, (session) => session.surveys, {
    nullable: true,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'campaign_session_id', referencedColumnName: 'sessionId' })
  campaignSession?: CampaignSession;

  @Column({ name: 'step_order', type: 'integer', nullable: true })
  stepOrder?: number;

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
