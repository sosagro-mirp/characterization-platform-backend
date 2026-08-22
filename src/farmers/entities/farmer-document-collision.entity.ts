import { Farmer } from './farmer.entity';
import { Survey } from 'src/surveys/entities/survey.entity';
import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

// Spec 68 — registro auditable de cada colisión de `documentId` detectada en
// `SurveysService.extractFarmer()`: dos identificaciones (S1a) que comparten
// el mismo documento pero cuyos nombres no corresponden a la misma persona
// (ver `farmers/name-matching.ts`). Aditiva: no cambia el esquema de
// `farmers` ni de `surveys`.
@Entity({ name: 'farmer_document_collisions' })
export class FarmerDocumentCollision {
  @PrimaryGeneratedColumn('uuid', { name: 'collision_id' })
  collisionId: string;

  @Column({ name: 'document_id', type: 'varchar', length: 50 })
  documentId: string;

  @Column({ name: 'submitted_name', type: 'varchar', length: 255 })
  submittedName: string;

  // Encuesta (S1a) cuya extracción disparó la detección — la pide el spec
  // ("Evaluación MCP" y TC-MCP-068-01) para poder auditar de qué captura
  // vino cada colisión. `SET NULL`, no `RESTRICT`: este registro es un
  // subproducto de auditoría, nunca debería impedir borrar la encuesta que
  // lo originó si ese flujo llega a existir más adelante.
  @ManyToOne(() => Survey, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'survey_id', referencedColumnName: 'surveyId' })
  survey: Survey | null;

  @ManyToOne(() => Farmer, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'existing_farmer_id', referencedColumnName: 'id' })
  existingFarmer: Farmer;

  // Copia del nombre del farmer existente al momento de detectar la
  // colisión — la auditoría no debe cambiar si ese farmer se edita después.
  @Column({ name: 'existing_farmer_name', type: 'varchar', length: 255 })
  existingFarmerName: string;

  // null mientras la colisión está pendiente de resolución (diferida al
  // sincronizar, o el encuestador todavía no decidió).
  @Column({ name: 'resolution', type: 'varchar', length: 20, nullable: true })
  resolution: 'same_person' | 'separate_person' | null;

  @CreateDateColumn({
    name: 'created_at',
    type: 'timestamp',
    default: () => 'CURRENT_TIMESTAMP',
  })
  createdAt: Date;

  @Column({ name: 'resolved_at', type: 'timestamp', nullable: true })
  resolvedAt: Date | null;
}
