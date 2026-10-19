import { ActorType } from 'src/actor-types/entities/actor-type.entity';
import { CampaignSession } from 'src/campaign-sessions/entities/campaign-session.entity';
import { Department } from 'src/departments/entities/department.entity';
import { Farmer } from 'src/farmers/entities/farmer.entity';
import { Farm } from 'src/farms/entities/farm.entity';
import { FarmCrop } from 'src/farms/entities/farm-crop.entity';
import { Instrument } from 'src/instruments/entities/instrument.entity';
import { Response } from 'src/responses/entities/response.entity';
import { Town } from 'src/towns/entities/town.entity';
import { TypeOfCrop } from 'src/types-of-crops/entities/type-of-crop.entity';
import { User } from 'src/users/entities/user.entity';
import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  JoinTable,
  ManyToMany,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export const EXTRACTION_STATUSES = [
  'done',
  'collision',
  'no_identity',
  'pending_alias',
  'not_applicable',
  'awaiting_review',
  'error',
  'backfilled',
] as const;
export type ExtractionStatus = (typeof EXTRACTION_STATUSES)[number];

@Entity({ name: 'surveys' })
@Index('IDX_surveys_farmer', ['farmer'])
@Index('IDX_surveys_farm', ['farmId'])
@Index('IDX_surveys_farm_crop', ['farmCropId'])
@Index('IDX_surveys_client_farmer_pending', ['clientFarmerId'], {
  where: '"client_farmer_id" IS NOT NULL AND "farmer_id" IS NULL',
})
@Check(
  'CHK_surveys_farm_crop_requires_farm',
  '"farm_crop_id" IS NULL OR "farm_id" IS NOT NULL',
)
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

  // Spec 94 — finca y cultivo de finca a los que apunta la encuesta. Se
  // escriben SOLO con `anchorSurvey` (SQL directo): `farm_id` es columna
  // compartida por la FK simple a `farms` y por la FK compuesta
  // `(farm_crop_id, farm_id) → farms_crops`, que obliga a que el cultivo
  // pertenezca a la finca de la encuesta. No persistir estas relaciones con
  // `save()`.
  @Column({ name: 'farm_id', type: 'uuid', nullable: true })
  farmId?: string | null;

  @Column({ name: 'farm_crop_id', type: 'uuid', nullable: true })
  farmCropId?: string | null;

  @ManyToOne(() => Farm, {
    nullable: true,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({
    name: 'farm_id',
    referencedColumnName: 'farmId',
    foreignKeyConstraintName: 'FK_surveys_farm',
  })
  farm?: Farm | null;

  @ManyToOne(() => FarmCrop, {
    nullable: true,
    onDelete: 'RESTRICT',
  })
  @JoinColumn([
    {
      name: 'farm_crop_id',
      referencedColumnName: 'farmCropId',
      foreignKeyConstraintName: 'FK_surveys_farm_crop',
    },
    { name: 'farm_id', referencedColumnName: 'farmId' },
  ])
  farmCrop?: FarmCrop | null;

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
  @JoinColumn({
    name: 'campaign_session_id',
    referencedColumnName: 'sessionId',
  })
  campaignSession?: CampaignSession;

  @Column({ name: 'step_order', type: 'integer', nullable: true })
  stepOrder?: number;

  // Spec 70, Fase 9 — clave de idempotencia: id local que el cliente móvil
  // genera al crear el borrador (`local_survey_<uuid>`) y reenvía en cada
  // reintento de POST /api/surveys. NULL en todo lo creado desde la web y en
  // todo lo existente antes de esta fase. El índice único parcial vive en la
  // migración (solo aplica cuando no es NULL).
  @Column({
    name: 'client_survey_id',
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  clientSurveyId?: string;

  // Spec 95 — identidad provisional del productor (`local_farmer_<uuid>`) que el
  // móvil usa antes de que su registro llegue al servidor; ver `farmer_client_aliases`.
  @Column({
    name: 'client_farmer_id',
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  clientFarmerId?: string | null;

  // Spec 95 — resultado de la extracción unificada del productor, la finca y los
  // cultivos (`FarmerExtractionService`). NULL = aún no se ha extraído.
  @Column({
    name: 'extraction_status',
    type: 'varchar',
    length: 20,
    nullable: true,
  })
  extractionStatus?: ExtractionStatus | null;

  @Column({ name: 'extraction_error', type: 'text', nullable: true })
  extractionError?: string | null;

  @Column({ name: 'extracted_at', type: 'timestamp', nullable: true })
  extractedAt?: Date | null;

  @Column({ name: 'respondent_name', type: 'text', nullable: true })
  respondentName?: string;

  @Column({ name: 'respondent_phone', type: 'text', nullable: true })
  respondentPhone?: string;

  @Column({ name: 'respondent_document_id', type: 'text', nullable: true })
  respondentDocumentId?: string;

  @Column({ name: 'respondent_email', type: 'text', nullable: true })
  respondentEmail?: string;

  @Column({
    name: 'sincronized',
    type: 'boolean',
    nullable: false,
    default: false,
  })
  sincronized: boolean;

  // Spec 79 — 'field' es toda encuesta del flujo con encuestador (web o
  // móvil), existente o futura, por el DEFAULT. 'public' es exclusiva del
  // canal público (/api/public/surveys) y siempre nace con
  // reviewStatus='pending'.
  @Column({
    name: 'origin',
    type: 'varchar',
    length: 20,
    nullable: false,
    default: 'field',
  })
  origin: 'field' | 'public';

  // Solo aplica a origin='public'. NULL en toda encuesta de campo — la
  // bandeja filtra por origin, no por este campo, para que un bug de
  // backfill no arrastre encuestas de campo a la bandeja.
  @Column({
    name: 'review_status',
    type: 'varchar',
    length: 20,
    nullable: true,
  })
  reviewStatus?: 'pending' | 'processed' | 'discarded' | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL', eager: false })
  @JoinColumn({ name: 'reviewed_by', referencedColumnName: 'userId' })
  reviewedBy?: User | null;

  @Column({ name: 'reviewed_at', type: 'timestamp', nullable: true })
  reviewedAt?: Date | null;

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
