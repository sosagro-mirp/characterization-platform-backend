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

export type ConsentDocumentStatus = 'draft' | 'published' | 'archived';

/**
 * Spec 78 — Versión del texto de consentimiento informado y autorización de
 * tratamiento de datos personales. Solo puede existir un documento con
 * status = 'published' a la vez: publicar uno archiva el anterior en la
 * misma transacción (ver ConsentDocumentsService.publish).
 */
@Entity({ name: 'consent_documents' })
export class ConsentDocument {
  @PrimaryGeneratedColumn('uuid', { name: 'consent_document_id' })
  consentDocumentId: string;

  @Column({ type: 'varchar', length: 20, unique: true, nullable: false })
  version: string;

  @Column({ type: 'varchar', length: 255, nullable: false })
  title: string;

  @Column({ type: 'text', nullable: false })
  body: string;

  @Column({ name: 'data_processing_clause', type: 'text', nullable: false })
  dataProcessingClause: string;

  @Column({ name: 'multimedia_clause', type: 'text', nullable: false })
  multimediaClause: string;

  @Column({ name: 'rights_clause', type: 'text', nullable: false })
  rightsClause: string;

  @Column({
    name: 'responsible_entity',
    type: 'varchar',
    length: 255,
    nullable: false,
  })
  responsibleEntity: string;

  @Column({
    name: 'contact_email',
    type: 'varchar',
    length: 255,
    nullable: false,
  })
  contactEmail: string;

  @Column({
    type: 'varchar',
    length: 20,
    nullable: false,
    default: 'draft',
  })
  status: ConsentDocumentStatus;

  @Column({ name: 'published_at', type: 'timestamp', nullable: true })
  publishedAt: Date | null;

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
