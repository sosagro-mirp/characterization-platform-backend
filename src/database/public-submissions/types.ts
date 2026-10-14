import { ProcessPreview } from 'src/surveys/public-submission-plan';

/**
 * Spec 93, Fase 3 — tipos compartidos de la CLI `public-submissions`.
 * Ver `backend/docs/public-submissions-ops.md`.
 */

export type DecisionAction = 'process' | 'discard' | 'leave_pending';
export type CollisionResolution = 'same_person' | 'separate_person';

export interface SubmissionDecision {
  surveyId: string;
  action: DecisionAction;
  resolution?: CollisionResolution;
  farm?: { mode: 'create' | 'link'; farmId?: string };
  townId?: string;
  /** Texto libre del revisor; la CLI no lo interpreta. */
  note?: string;
}

export interface DecisionsFile {
  decisions: SubmissionDecision[];
}

export type SubmissionClass =
  | 'clean'
  | 'existing_same_person'
  | 'collision'
  | 'shared_farm_candidate'
  | 'non_producer'
  | 'missing_town'
  | 'duplicate_document_in_pending'
  | 'repeated_submission_same_person'
  | 'farm_name_too_long';

export interface RepeatInfo {
  groupKey: string;
  memberSurveyIds: string[];
  /** D-H2-11: el más completo (más respuestas) o, a igualdad, el más reciente. */
  suggestedSurveyId: string;
}

export interface PlanEntry {
  surveyId: string;
  createdAt: string;
  responseCount: number;
  farmName: string | null;
  vereda: string | null;
  preview: ProcessPreview | null;
  previewError: string | null;
  classes: SubmissionClass[];
  repeat: RepeatInfo | null;
}

export interface PlanReport {
  generatedAt: string;
  target: string;
  instrumentIds: string[];
  summary: Record<string, number>;
  entries: PlanEntry[];
}

export interface FieldChange {
  entity: 'farmer' | 'farm';
  field: string;
  before: unknown;
  after: unknown;
}

export interface CollisionRowSnapshot {
  collisionId: string;
  documentId: string;
  submittedName: string;
  surveyId: string | null;
  existingFarmerId: string;
  resolution: string | null;
  resolvedAt: string | null;
}

export interface RespondentSnapshot {
  name: string | null;
  phone: string | null;
  documentId: string | null;
  email: string | null;
}

export interface SubmissionPreviousState {
  reviewStatus: string | null;
  farmerId: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  respondent: RespondentSnapshot;
}

/**
 * Spec 94 (D-H3-11) — versión del modelo de datos con el que `apply` escribió
 * el log. Los logs anteriores (sin `modelVersion`) se escribieron cuando el
 * productor tenía una sola finca (`farmers.farm_id`) y no existía el vínculo
 * `farmer_farms` ni el anclaje de la encuesta: revertirlos con la lógica actual
 * dejaría vínculos y anclajes huérfanos, así que `revert` los rechaza.
 */
export const SUBMISSION_LOG_MODEL_VERSION = 94;

export interface SubmissionLog {
  formatVersion: 1;
  /** Ausente en los logs anteriores al spec 94. */
  modelVersion?: number;
  surveyId: string;
  action: 'process' | 'discard';
  appliedAt: string;
  reviewedBy: string;
  decision: SubmissionDecision;
  previousState: SubmissionPreviousState;
  farmer: { farmerId: string; created: boolean } | null;
  farm: {
    farmId: string;
    mode: 'created' | 'linked' | 'existing';
    /** El productor no tenía finca antes y este envío se la asignó. */
    assignedToFarmer: boolean;
  } | null;
  cropsAdded: { cropId: string; name: string }[];
  fieldsCompleted: FieldChange[];
  /** Cambios sobre un valor no nulo: no deberían existir; se registran por si acaso. */
  anomalies: string[];
  consentRecordsRelinked: string[];
  collision: {
    before: CollisionRowSnapshot | null;
    after: CollisionRowSnapshot;
  } | null;
}
