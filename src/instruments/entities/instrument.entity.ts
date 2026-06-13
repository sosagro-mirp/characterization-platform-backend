import { ActorType } from 'src/actor-types/entities/actor-type.entity';
import { Section } from 'src/sections/entities/section.entity';
import { Survey } from 'src/surveys/entities/survey.entity';
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

@Entity({ name: 'instruments' })
export class Instrument {
  @PrimaryGeneratedColumn('uuid', {
    name: 'instrument_id',
  })
  instrumentId: string;

  @Column({
    type: 'varchar',
    length: 255,
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

  @Column({
    type: 'varchar',
    length: 10,
    nullable: true,
    unique: true,
  })
  code?: string;

  @OneToMany(() => Section, (section) => section.instrument)
  sections: Section[];

  @ManyToMany(() => Survey, (survey) => survey.instruments)
  surveys: Survey[];

  @ManyToMany(() => ActorType, { eager: false })
  @JoinTable({
    name: 'instruments_actor_types',
    joinColumn: { name: 'instrument_id', referencedColumnName: 'instrumentId' },
    inverseJoinColumn: {
      name: 'actor_type_id',
      referencedColumnName: 'actorTypeId',
    },
  })
  actorTypes: ActorType[];

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL', eager: false })
  @JoinColumn({ name: 'created_by_id', referencedColumnName: 'userId' })
  createdBy?: User;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL', eager: false })
  @JoinColumn({ name: 'updated_by_id', referencedColumnName: 'userId' })
  updatedBy?: User;

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
