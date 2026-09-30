import { ProcessPreview } from 'src/surveys/public-submission-plan';
import { DecisionAction, DecisionsFile, SubmissionDecision } from './types';

/**
 * Spec 93, Fase 3 — validación del archivo de decisiones. Todo es puro: la
 * CLI lo corre entero antes de escribir nada y acumula TODOS los errores,
 * para que quien lo edita los corrija de una vez.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ACTIONS: readonly DecisionAction[] = [
  'process',
  'discard',
  'leave_pending',
];
const RESOLUTIONS = ['same_person', 'separate_person'];
const KNOWN_KEYS = new Set([
  'surveyId',
  'action',
  'resolution',
  'farm',
  'townId',
  'note',
]);

/** Límite de `Farm.name` (varchar(50)); ver `spec/backlog.md`. */
export const FARM_NAME_MAX_LENGTH = 50;

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function validateDecisionsFile(raw: unknown): {
  file: DecisionsFile | null;
  errors: string[];
} {
  if (!isRecord(raw) || !Array.isArray(raw.decisions)) {
    return {
      file: null,
      errors: ['El archivo debe ser un objeto con un arreglo "decisions".'],
    };
  }
  if (raw.decisions.length === 0) {
    return { file: null, errors: ['"decisions" está vacío.'] };
  }

  const errors: string[] = [];
  const decisions: SubmissionDecision[] = [];
  const seen = new Set<string>();

  raw.decisions.forEach((item: unknown, index: number) => {
    const at = `decisions[${index}]`;
    if (!isRecord(item)) {
      errors.push(`${at}: debe ser un objeto.`);
      return;
    }
    for (const key of Object.keys(item)) {
      if (!KNOWN_KEYS.has(key))
        errors.push(`${at}: campo desconocido "${key}".`);
    }

    const { surveyId, action, resolution, farm, townId, note } = item;
    if (!isUuid(surveyId)) {
      errors.push(`${at}: "surveyId" debe ser un UUID.`);
      return;
    }
    const label = `${at} (${surveyId})`;
    if (seen.has(surveyId.toLowerCase())) {
      errors.push(`${label}: envío repetido en el archivo.`);
    }
    seen.add(surveyId.toLowerCase());

    if (!ACTIONS.includes(action as DecisionAction)) {
      errors.push(
        `${label}: "action" debe ser process, discard o leave_pending.`,
      );
      return;
    }
    if (
      resolution !== undefined &&
      !RESOLUTIONS.includes(resolution as string)
    ) {
      errors.push(
        `${label}: "resolution" debe ser same_person o separate_person.`,
      );
    }
    if (townId !== undefined && !isUuid(townId)) {
      errors.push(`${label}: "townId" debe ser un UUID.`);
    }
    if (note !== undefined && typeof note !== 'string') {
      errors.push(`${label}: "note" debe ser texto.`);
    }

    let farmDecision: SubmissionDecision['farm'];
    if (farm !== undefined) {
      if (
        !isRecord(farm) ||
        !['create', 'link'].includes(farm.mode as string)
      ) {
        errors.push(`${label}: "farm.mode" debe ser create o link.`);
      } else if (farm.mode === 'link' && !isUuid(farm.farmId)) {
        errors.push(`${label}: farm.mode = link exige "farm.farmId" (UUID).`);
      } else if (farm.mode === 'create' && farm.farmId !== undefined) {
        errors.push(`${label}: farm.mode = create no admite "farm.farmId".`);
      } else {
        farmDecision = {
          mode: farm.mode as 'create' | 'link',
          ...(farm.farmId !== undefined
            ? { farmId: farm.farmId as string }
            : {}),
        };
      }
    }

    if (
      action !== 'process' &&
      (resolution !== undefined || farm !== undefined || townId !== undefined)
    ) {
      errors.push(
        `${label}: "resolution", "farm" y "townId" solo aplican a action = process.`,
      );
    }

    decisions.push({
      surveyId,
      action: action as DecisionAction,
      ...(resolution !== undefined
        ? { resolution: resolution as SubmissionDecision['resolution'] }
        : {}),
      ...(farmDecision ? { farm: farmDecision } : {}),
      ...(townId !== undefined ? { townId: townId as string } : {}),
      ...(typeof note === 'string' ? { note } : {}),
    });
  });

  return errors.length > 0
    ? { file: null, errors }
    : { file: { decisions }, errors: [] };
}

export interface SurveyState {
  origin: string;
  reviewStatus: string | null;
}

export interface DecisionsCrossCheck {
  toProcess: SubmissionDecision[];
  toDiscard: SubmissionDecision[];
  /** Ya estaban en el estado que pide la decisión: no se tocan (idempotencia). */
  alreadyApplied: SubmissionDecision[];
  leavePending: SubmissionDecision[];
  errors: string[];
}

/**
 * Contrasta las decisiones con lo que hay en la base: envíos y referencias
 * existentes, y estados compatibles. Un envío ya `processed` con decisión
 * `process` (o `discarded` con `discard`) se salta; cualquier otra decisión
 * sobre un envío no pendiente es un error.
 */
export function crossCheckDecisions(
  decisions: SubmissionDecision[],
  surveys: Map<string, SurveyState>,
  refs: { farmIds: Set<string>; townIds: Set<string> },
): DecisionsCrossCheck {
  const result: DecisionsCrossCheck = {
    toProcess: [],
    toDiscard: [],
    alreadyApplied: [],
    leavePending: [],
    errors: [],
  };

  for (const decision of decisions) {
    const label = `Envío ${decision.surveyId}`;
    const state = surveys.get(decision.surveyId);
    if (!state) {
      result.errors.push(`${label}: no existe.`);
      continue;
    }
    if (state.origin !== 'public') {
      result.errors.push(`${label}: no es un envío del canal público.`);
      continue;
    }
    if (decision.farm?.mode === 'link' && decision.farm.farmId) {
      if (!refs.farmIds.has(decision.farm.farmId)) {
        result.errors.push(
          `${label}: la finca ${decision.farm.farmId} no existe.`,
        );
      }
    }
    if (decision.townId && !refs.townIds.has(decision.townId)) {
      result.errors.push(
        `${label}: el municipio ${decision.townId} no existe.`,
      );
    }

    const status = state.reviewStatus ?? 'pending';
    if (status === 'pending') {
      if (decision.action === 'process') result.toProcess.push(decision);
      else if (decision.action === 'discard') result.toDiscard.push(decision);
      else result.leavePending.push(decision);
    } else if (
      (decision.action === 'process' && status === 'processed') ||
      (decision.action === 'discard' && status === 'discarded')
    ) {
      result.alreadyApplied.push(decision);
    } else {
      result.errors.push(
        `${label}: tiene decisión "${decision.action}" pero su estado es "${status}", no pendiente.`,
      );
    }
  }
  return result;
}

/**
 * Contrasta una decisión de procesar con la vista previa que la API daría hoy.
 * Los errores detienen la operación; las advertencias solo se informan.
 */
export function checkDecisionAgainstPreview(
  decision: SubmissionDecision,
  preview: ProcessPreview,
  farmName: string | null,
): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (preview.document.status === 'collision' && !decision.resolution) {
    errors.push(
      'el documento colisiona con otra persona y la decisión no trae "resolution".',
    );
  }
  if (
    decision.resolution === 'same_person' &&
    preview.document.status !== 'collision'
  ) {
    warnings.push('"same_person" sin colisión de documento: no tiene efecto.');
  }
  if (
    farmName &&
    farmName.length > FARM_NAME_MAX_LENGTH &&
    preview.farm.action === 'create' &&
    decision.farm?.mode !== 'link'
  ) {
    errors.push(
      `el nombre de la finca tiene ${farmName.length} caracteres y el máximo es ${FARM_NAME_MAX_LENGTH}; use farm.mode = link o corrija el envío antes.`,
    );
  }
  if (decision.farm?.mode === 'link' && preview.farm.action === 'complete') {
    warnings.push(
      'el productor ya tiene finca: "farm.mode = link" se ignora y se completa la existente.',
    );
  }
  if (preview.warnings.some((w) => w.code === 'respondent_not_producer')) {
    warnings.push('el perfil declarado no es de productor.');
  }
  if (
    preview.warnings.some((w) => w.code === 'missing_town') &&
    !decision.townId
  ) {
    warnings.push('sin municipio: la finca quedará sin municipio.');
  }
  return { errors, warnings };
}
