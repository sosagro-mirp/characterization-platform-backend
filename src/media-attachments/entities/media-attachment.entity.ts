import { Question } from 'src/questions/entities/question.entity';
import { Response } from 'src/responses/entities/response.entity';
import { Survey } from 'src/surveys/entities/survey.entity';
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

export enum MediaAttachmentStatus {
  PENDING = 'pending',
  UPLOADED = 'uploaded',
  FAILED = 'failed',
}

@Entity({ name: 'media_attachments' })
export class MediaAttachment {
  @PrimaryGeneratedColumn('uuid', { name: 'attachment_id' })
  attachmentId: string;

  @ManyToOne(() => Survey, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'survey_id', referencedColumnName: 'surveyId' })
  survey: Survey;

  @ManyToOne(() => Question, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'question_id', referencedColumnName: 'questionId' })
  question: Question;

  @ManyToOne(() => Response, (response) => response.attachments, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'response_id', referencedColumnName: 'responseId' })
  response?: Response;

  @Column({ name: 'storage_key', type: 'varchar', length: 500, nullable: false })
  storageKey: string;

  @Column({ name: 'public_url', type: 'varchar', length: 1000, nullable: true })
  publicUrl?: string;

  @Column({ name: 'original_filename', type: 'varchar', length: 255, nullable: true })
  originalFilename?: string;

  @Column({ name: 'mime_type', type: 'varchar', length: 100, nullable: false })
  mimeType: string;

  @Column({ name: 'file_size_bytes', type: 'bigint', nullable: true })
  fileSizeBytes?: number;

  @Column({
    name: 'status',
    type: 'varchar',
    length: 20,
    nullable: false,
    default: MediaAttachmentStatus.PENDING,
  })
  status: MediaAttachmentStatus;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'created_by_id', referencedColumnName: 'userId' })
  createdBy?: User;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  updatedAt: Date;
}
