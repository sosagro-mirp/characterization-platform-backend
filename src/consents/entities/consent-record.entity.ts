import { CampaignSession } from 'src/campaign-sessions/entities/campaign-session.entity';
import { Farmer } from 'src/farmers/entities/farmer.entity';
import { User } from 'src/users/entities/user.entity';
import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ConsentDocument } from './consent-document.entity';

/**
 * Spec 78 — Constancia de aceptación del consentimiento informado.
 *
 * `farmer` es nullable: cuando el encuestado es nuevo, la constancia se
 * registra antes de que exista el Farmer (que se crea al completar S1 vía
 * SurveysService.extractFarmer) y queda anclada solo por `session`. El
 * backfill ocurre en ConsentRecordsService.linkOrphansToFarmer, invocado
 * desde extractFarmer. Ver "Puntos delicados del diseño" en
 * spec/78_consentimiento_informado_tratamiento_datos.md.
 */
@Entity({ name: 'consent_records' })
export class ConsentRecord {
  @PrimaryGeneratedColumn('uuid', { name: 'consent_record_id' })
  consentRecordId: string;

  @ManyToOne(() => ConsentDocument, {
    nullable: false,
    onDelete: 'RESTRICT',
    eager: true,
  })
  @JoinColumn({
    name: 'consent_document_id',
    referencedColumnName: 'consentDocumentId',
  })
  consentDocument: ConsentDocument;

  @ManyToOne(() => Farmer, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'farmer_id', referencedColumnName: 'id' })
  farmer?: Farmer | null;

  @ManyToOne(() => CampaignSession, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'session_id', referencedColumnName: 'sessionId' })
  session?: CampaignSession | null;

  @Column({
    name: 'accepted_data_processing',
    type: 'boolean',
    nullable: false,
  })
  acceptedDataProcessing: boolean;

  @Column({
    name: 'accepted_photo',
    type: 'boolean',
    nullable: false,
    default: false,
  })
  acceptedPhoto: boolean;

  @Column({
    name: 'accepted_audio',
    type: 'boolean',
    nullable: false,
    default: false,
  })
  acceptedAudio: boolean;

  @Column({
    name: 'accepted_video',
    type: 'boolean',
    nullable: false,
    default: false,
  })
  acceptedVideo: boolean;

  @Column({
    name: 'accepted_follow_up_contact',
    type: 'boolean',
    nullable: false,
    default: false,
  })
  acceptedFollowUpContact: boolean;

  @Column({
    name: 'respondent_name',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  respondentName: string | null;

  @Column({
    name: 'respondent_document_id',
    type: 'varchar',
    length: 50,
    nullable: true,
  })
  respondentDocumentId: string | null;

  @Column({
    name: 'on_behalf_of_producer',
    type: 'boolean',
    nullable: false,
    default: false,
  })
  onBehalfOfProducer: boolean;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL', eager: false })
  @JoinColumn({ name: 'recorded_by', referencedColumnName: 'userId' })
  recordedBy?: User | null;

  @Column({ name: 'accepted_at', type: 'timestamp', nullable: false })
  acceptedAt: Date;

  @Column({ name: 'synced_at', type: 'timestamp', nullable: true })
  syncedAt: Date | null;

  @Column({ name: 'revoked_at', type: 'timestamp', nullable: true })
  revokedAt: Date | null;

  @Column({ name: 'revoked_reason', type: 'text', nullable: true })
  revokedReason: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL', eager: false })
  @JoinColumn({ name: 'revoked_by', referencedColumnName: 'userId' })
  revokedBy?: User | null;

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
