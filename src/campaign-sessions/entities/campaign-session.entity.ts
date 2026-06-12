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
import { ActorType } from 'src/actor-types/entities/actor-type.entity';
import { Department } from 'src/departments/entities/department.entity';
import { Farmer } from 'src/farmers/entities/farmer.entity';
import { Town } from 'src/towns/entities/town.entity';
import { TypeOfCrop } from 'src/types-of-crops/entities/type-of-crop.entity';
import { User } from 'src/users/entities/user.entity';
import { Campaign } from 'src/campaigns/entities/campaign.entity';
import { Survey } from 'src/surveys/entities/survey.entity';

@Entity({ name: 'campaign_sessions' })
export class CampaignSession {
  @PrimaryGeneratedColumn('uuid', { name: 'session_id' })
  sessionId: string;

  @ManyToOne(() => Campaign, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'campaign_id', referencedColumnName: 'campaignId' })
  campaign: Campaign;

  @ManyToOne(() => Farmer, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'farmer_id', referencedColumnName: 'id' })
  farmer?: Farmer;

  @ManyToOne(() => User, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'user_id', referencedColumnName: 'userId' })
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

  @ManyToMany(() => TypeOfCrop)
  @JoinTable({ name: 'campaign_sessions_crops' })
  crops: TypeOfCrop[];

  @OneToMany(() => Survey, (survey) => survey.campaignSession)
  surveys: Survey[];

  @Column({
    name: 'sincronized',
    type: 'boolean',
    nullable: false,
    default: false,
  })
  sincronized: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt: Date;
}
