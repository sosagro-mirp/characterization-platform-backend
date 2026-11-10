import { Farm } from 'src/farms/entities/farm.entity';
import { Farmer } from 'src/farmers/entities/farmer.entity';
import { Response } from 'src/responses/entities/response.entity';
import { Survey } from 'src/surveys/entities/survey.entity';
import { User } from 'src/users/entities/user.entity';
import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

export const DISCREPANCY_ENTITY_TYPES = [
  'farmer',
  'farm',
  'farmer_farm',
] as const;
export type DiscrepancyEntityType = (typeof DISCREPANCY_ENTITY_TYPES)[number];

export const DISCREPANCY_STATUSES = ['open', 'applied', 'dismissed'] as const;
export type DiscrepancyStatus = (typeof DISCREPANCY_STATUSES)[number];

/**
 * Spec 95 (D-H3-B) — la extracción nunca pisa un valor existente: cuando el
 * valor enviado difiere del actual, se registra aquí. Único por
 * `(entity_type, COALESCE(farmer_id, farm_id), field, survey_id)` — ese índice
 * de expresión vive en la migración (TypeORM no lo expresa en la entidad).
 */
@Entity({ name: 'entity_field_discrepancies' })
@Index('IDX_discrepancies_farmer', ['farmerId'])
@Index('IDX_discrepancies_farm', ['farmId'])
@Index('IDX_discrepancies_survey', ['surveyId'])
@Index('IDX_discrepancies_status', ['status'])
@Check(
  'CHK_discrepancies_entity_type',
  `"entity_type" IN ('farmer', 'farm', 'farmer_farm')`,
)
@Check(
  'CHK_discrepancies_status',
  `"status" IN ('open', 'applied', 'dismissed')`,
)
@Check(
  'CHK_discrepancies_target',
  '"farmer_id" IS NOT NULL OR "farm_id" IS NOT NULL',
)
export class EntityFieldDiscrepancy {
  @PrimaryGeneratedColumn('uuid', {
    name: 'discrepancy_id',
    primaryKeyConstraintName: 'PK_entity_field_discrepancies',
  })
  discrepancyId: string;

  @Column({ name: 'entity_type', type: 'varchar', length: 20 })
  entityType: DiscrepancyEntityType;

  @Column({ name: 'farmer_id', type: 'uuid', nullable: true })
  farmerId: string | null;

  @ManyToOne(() => Farmer, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'farmer_id',
    referencedColumnName: 'id',
    foreignKeyConstraintName: 'FK_discrepancies_farmer',
  })
  farmer?: Farmer | null;

  @Column({ name: 'farm_id', type: 'uuid', nullable: true })
  farmId: string | null;

  @ManyToOne(() => Farm, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'farm_id',
    referencedColumnName: 'farmId',
    foreignKeyConstraintName: 'FK_discrepancies_farm',
  })
  farm?: Farm | null;

  /** Nombre de la propiedad (`phone`, `vereda`, `townId`…). */
  @Column({ name: 'field', type: 'varchar', length: 100 })
  field: string;

  /** `farmer.phone`, `farm.vereda`… cuando el campo viene de una pregunta mapeada. */
  @Column({
    name: 'system_field',
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  systemField: string | null;

  @Column({ name: 'current_value', type: 'jsonb', nullable: true })
  currentValue: unknown;

  @Column({ name: 'submitted_value', type: 'jsonb', nullable: true })
  submittedValue: unknown;

  @Column({ name: 'survey_id', type: 'uuid' })
  surveyId: string;

  @ManyToOne(() => Survey, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'survey_id',
    referencedColumnName: 'surveyId',
    foreignKeyConstraintName: 'FK_discrepancies_survey',
  })
  survey?: Survey;

  @Column({ name: 'response_id', type: 'uuid', nullable: true })
  responseId: string | null;

  @ManyToOne(() => Response, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({
    name: 'response_id',
    referencedColumnName: 'responseId',
    foreignKeyConstraintName: 'FK_discrepancies_response',
  })
  response?: Response | null;

  @Column({ name: 'status', type: 'varchar', length: 20, default: 'open' })
  status: DiscrepancyStatus;

  @Column({ name: 'resolved_by', type: 'uuid', nullable: true })
  resolvedBy: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({
    name: 'resolved_by',
    referencedColumnName: 'userId',
    foreignKeyConstraintName: 'FK_discrepancies_resolved_by',
  })
  resolver?: User | null;

  @Column({ name: 'resolved_at', type: 'timestamp', nullable: true })
  resolvedAt: Date | null;

  @CreateDateColumn({
    name: 'created_at',
    type: 'timestamp',
    default: () => 'CURRENT_TIMESTAMP',
  })
  createdAt: Date;
}
