import { Farmer } from 'src/farmers/entities/farmer.entity';
import { Survey } from 'src/surveys/entities/survey.entity';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';

/**
 * Spec 95 — alias `client_farmer_id → productor`. El móvil nombra al productor
 * con un id provisional (`local_farmer_<uuid>`) antes de que su registro llegue
 * al servidor; al resolverse, este alias ancla las encuestas que lo esperaban.
 */
@Entity({ name: 'farmer_client_aliases' })
@Index('IDX_farmer_client_aliases_farmer', ['farmerId'])
export class FarmerClientAlias {
  @PrimaryColumn({
    name: 'client_farmer_id',
    type: 'varchar',
    length: 100,
    primaryKeyConstraintName: 'PK_farmer_client_aliases',
  })
  clientFarmerId: string;

  @Column({ name: 'farmer_id', type: 'uuid' })
  farmerId: string;

  @ManyToOne(() => Farmer, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'farmer_id',
    referencedColumnName: 'id',
    foreignKeyConstraintName: 'FK_farmer_client_aliases_farmer',
  })
  farmer: Farmer;

  @Column({ name: 'survey_id', type: 'uuid', nullable: true })
  surveyId: string | null;

  @ManyToOne(() => Survey, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({
    name: 'survey_id',
    referencedColumnName: 'surveyId',
    foreignKeyConstraintName: 'FK_farmer_client_aliases_survey',
  })
  survey?: Survey | null;

  @CreateDateColumn({
    name: 'created_at',
    type: 'timestamp',
    default: () => 'CURRENT_TIMESTAMP',
  })
  createdAt: Date;
}
