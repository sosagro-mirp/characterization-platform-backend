/**
 * Spec 84, Fase 3 — tipos del manifiesto de instrumentos y del plan de
 * promoción entre entornos. Ver `backend/docs/instrument-sync.md`.
 *
 * Los catálogos (departamento, municipio, cultivo, tipo de actor) se
 * refieren por clave natural (`ManifestMetadata.key` = nombre), nunca por
 * UUID: no hay garantía de que los UUID de esos catálogos coincidan entre
 * desarrollo y producción (verificado en la Fase 0 del spec 84).
 */

export type ManifestMetadataKind = 'department' | 'town' | 'crop' | 'actorType';

export interface ManifestMetadata {
  kind: ManifestMetadataKind;
  /** Nombre de la fila del catálogo en el entorno de origen. */
  key: string;
}

export interface ManifestOption {
  optionId: string;
  text: string;
  value: number | null;
  isOther: boolean;
  metadata: ManifestMetadata | null;
  archivedAt: string | null;
  /** Respuestas que usan esta opción al momento de exportar. */
  responseCount: number;
  hash: string;
}

export interface ManifestQuestion {
  questionId: string;
  text: string;
  /** Nombre del tipo de pregunta (`types_of_questions.name`), no su UUID. */
  type: string;
  isRequired: boolean;
  isSelectionCriteria: boolean;
  isKeyQuestion: boolean;
  order: number;
  systemField: string | null;
  conditionQuestionId: string | null;
  conditionValue: string | null;
  archivedAt: string | null;
  /** Respuestas que tiene esta pregunta al momento de exportar. */
  responseCount: number;
  hash: string;
  options: ManifestOption[];
}

export interface ManifestSection {
  sectionId: string;
  name: string;
  order: number;
  questions: ManifestQuestion[];
}

export interface ManifestInstrument {
  instrumentId: string;
  name: string;
  version: number;
  publishDate: string;
  isActive: boolean;
  isPublic: boolean;
  code: string | null;
  /** Nombres de `actor_type` (no UUID). */
  actorTypes: string[];
  hash: string;
  sections: ManifestSection[];
}

export interface InstrumentManifest {
  formatVersion: 1;
  exportedAt: string;
  instruments: ManifestInstrument[];
  /**
   * Solo en respaldos de `apply`: instrumentos que ese `apply` creó. El
   * respaldo no los contiene (no existían), así que sin esta lista `restore`
   * no sabría que tiene que quitarlos (spec 84, TC-084-014).
   */
  createdInstrumentIds?: string[];
}

export type PlanEntityKind = 'instrument' | 'section' | 'question' | 'option';
export type PlanOperationKind =
  | 'create'
  | 'update'
  | 'delete'
  | 'archive'
  | 'unarchive';

export interface PlanOperation {
  kind: PlanOperationKind;
  entity: PlanEntityKind;
  id: string;
  /** UUID del instrumento al que pertenece, para poder agrupar/reportar. */
  instrumentId: string;
}

export type PlanConflictKind =
  | 'delete_with_responses'
  | 'type_change_with_responses'
  | 'changed_in_target'
  | 'unresolved_metadata';

export interface PlanConflict {
  type: PlanConflictKind;
  entity: PlanEntityKind;
  id: string;
  instrumentId: string;
  message: string;
}

export interface Plan {
  operations: PlanOperation[];
  conflicts: PlanConflict[];
  /**
   * Copia del manifiesto `current` con el que se calculó este plan.
   * `applyPlan` vuelve a exportar el destino justo antes de escribir y la
   * compara contra esto: si algo cambió desde que se generó el plan,
   * aborta sin escribir nada (criterio 14).
   */
  baseline: InstrumentManifest;
  /** Manifiesto deseado (desarrollo depurado) — `applyPlan` toma de aquí los valores a escribir. */
  desired: InstrumentManifest;
}

export interface ApplyResult {
  /** Manifiesto del destino tomado justo antes de aplicar — permite restaurar. */
  backup: InstrumentManifest;
  applied: PlanOperation[];
  /** Solo en `restore`: instrumentos creados por la promoción que se quitaron. */
  removedInstrumentIds?: string[];
}
