import {
  CollisionRowSnapshot,
  FieldChange,
  SubmissionDecision,
  SubmissionLog,
  SubmissionPreviousState,
} from './types';
import { isUuid } from './decisions';

/**
 * Spec 93, Fase 3 — piezas puras del log por envío: qué cambió `apply` (a
 * partir de dos fotografías del estado, antes y después de llamar al mismo
 * `processPublicSubmission` de la API) y cómo se lee el log en `revert`.
 */

export interface StateSnapshot {
  survey: SubmissionPreviousState;
  /** Productor y la finca que tiene asignada (`farmId`, null si no tiene). */
  farmer: {
    farmerId: string;
    farmId: string | null;
    values: Record<string, unknown>;
  } | null;
  farm: {
    farmId: string;
    values: Record<string, unknown>;
    cropIds: string[];
  } | null;
  consent: { consentRecordId: string; farmerId: string | null }[];
  collisions: CollisionRowSnapshot[];
}

type ProcessLogParts = Pick<
  SubmissionLog,
  | 'farmer'
  | 'farm'
  | 'cropsAdded'
  | 'fieldsCompleted'
  | 'anomalies'
  | 'consentRecordsRelinked'
  | 'collision'
>;

function isEmpty(value: unknown): boolean {
  return value === null || value === undefined;
}

export function sameValue(a: unknown, b: unknown): boolean {
  if (isEmpty(a) || isEmpty(b)) return isEmpty(a) && isEmpty(b);
  return String(a) === String(b);
}

function compareValues(
  entity: 'farmer' | 'farm',
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  completed: FieldChange[],
  anomalies: string[],
): void {
  for (const field of Object.keys(after)) {
    const was = before[field];
    const now = after[field];
    if (sameValue(was, now)) continue;
    if (isEmpty(was)) {
      completed.push({ entity, field, before: null, after: now });
    } else {
      anomalies.push(
        `${entity}.${field} cambió de un valor no nulo (${String(was)} -> ${String(now)})`,
      );
    }
  }
}

export function diffSnapshots(
  before: StateSnapshot,
  after: StateSnapshot,
  context: {
    decision: SubmissionDecision;
    farmerExisted: boolean;
    cropNames: Map<string, string>;
  },
): ProcessLogParts {
  const fieldsCompleted: FieldChange[] = [];
  const anomalies: string[] = [];

  if (
    before.farmer &&
    after.farmer &&
    before.farmer.farmerId === after.farmer.farmerId
  ) {
    compareValues(
      'farmer',
      before.farmer.values,
      after.farmer.values,
      fieldsCompleted,
      anomalies,
    );
  }

  let farm: ProcessLogParts['farm'] = null;
  let cropsAdded: ProcessLogParts['cropsAdded'] = [];
  if (after.farm) {
    const assignedToFarmer = before.farmer?.farmId == null;
    const previous =
      before.farm && before.farm.farmId === after.farm.farmId
        ? before.farm
        : null;
    farm = {
      farmId: after.farm.farmId,
      mode: !assignedToFarmer
        ? 'existing'
        : context.decision.farm?.mode === 'link'
          ? 'linked'
          : 'created',
      assignedToFarmer,
    };
    if (previous) {
      compareValues(
        'farm',
        previous.values,
        after.farm.values,
        fieldsCompleted,
        anomalies,
      );
    }
    const known = new Set(previous?.cropIds ?? []);
    cropsAdded = after.farm.cropIds
      .filter((id) => !known.has(id))
      .map((cropId) => ({ cropId, name: context.cropNames.get(cropId) ?? '' }));
  }

  const beforeConsent = new Map(
    before.consent.map((c) => [c.consentRecordId, c.farmerId]),
  );
  const consentRecordsRelinked = after.consent
    .filter(
      (c) =>
        beforeConsent.get(c.consentRecordId) === null &&
        c.farmerId === after.farmer?.farmerId,
    )
    .map((c) => c.consentRecordId);

  const beforeCollisions = new Map(
    before.collisions.map((c) => [c.collisionId, c]),
  );
  let collision: ProcessLogParts['collision'] = null;
  for (const row of after.collisions) {
    const previous = beforeCollisions.get(row.collisionId) ?? null;
    const changed =
      !previous ||
      previous.resolution !== row.resolution ||
      previous.surveyId !== row.surveyId;
    if (changed) {
      collision = { before: previous, after: row };
      break;
    }
  }

  return {
    farmer: after.farmer
      ? { farmerId: after.farmer.farmerId, created: !context.farmerExisted }
      : null,
    farm,
    cropsAdded,
    fieldsCompleted,
    anomalies,
    consentRecordsRelinked,
    collision,
  };
}

/**
 * Deshacer un campo completado solo si sigue valiendo lo que escribió `apply`:
 * si alguien lo editó después, se respeta esa edición y se informa.
 */
export function planFieldReverts(
  fields: FieldChange[],
  current: { farmer: Record<string, unknown>; farm: Record<string, unknown> },
): {
  revert: FieldChange[];
  skipped: { change: FieldChange; currentValue: unknown }[];
} {
  const revert: FieldChange[] = [];
  const skipped: { change: FieldChange; currentValue: unknown }[] = [];
  for (const change of fields) {
    const currentValue = current[change.entity][change.field];
    if (sameValue(currentValue, change.after)) revert.push(change);
    else skipped.push({ change, currentValue });
  }
  return { revert, skipped };
}

/** Lee y valida un log escrito por `apply`; lanza con todos los problemas. */
export function parseSubmissionLog(raw: unknown): SubmissionLog {
  const errors: string[] = [];
  const log = raw as Partial<SubmissionLog> | null;
  if (typeof log !== 'object' || log === null) {
    throw new Error('El log no es un objeto JSON.');
  }
  if (log.formatVersion !== 1) errors.push('formatVersion debe ser 1.');
  if (!isUuid(log.surveyId)) errors.push('surveyId inválido.');
  if (log.action !== 'process' && log.action !== 'discard') {
    errors.push('action debe ser process o discard.');
  }
  if (!log.previousState) errors.push('falta previousState.');
  if (log.action === 'process') {
    if (!log.farmer || !isUuid(log.farmer.farmerId)) {
      errors.push('un log de process exige farmer.farmerId.');
    }
    for (const key of [
      'cropsAdded',
      'fieldsCompleted',
      'consentRecordsRelinked',
    ] as const) {
      if (!Array.isArray(log[key])) errors.push(`${key} debe ser un arreglo.`);
    }
  }
  if (errors.length > 0) {
    throw new Error(`Log inválido: ${errors.join(' ')}`);
  }
  return log as SubmissionLog;
}
