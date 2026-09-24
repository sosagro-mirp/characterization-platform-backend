import { selectFarmerByDocument } from '../farmers/document-id';

/**
 * Spec 93 — vista previa de lo que hará `process-public`, construida a partir
 * de datos ya leídos. Pura: sin base de datos ni efectos, para que la vista
 * previa (solo lectura) y la CLI del spec compartan la misma decisión.
 */

export type PreviewWarningCode =
  | 'respondent_not_producer'
  | 'missing_town'
  | 'area_converted'
  | 'area_unit_unknown'
  | 'multi_value_truncated'
  | 'different_farm_name_existing_farmer'
  | 'duplicate_document_in_pending';

export type DocumentStatus = 'new' | 'same_person_match' | 'collision';
export type FarmAction = 'create' | 'link' | 'complete' | 'none';

/** Columnas del productor que se completan si están vacías (D-H2-3). */
export const FARMER_COMPLETABLE_FIELDS = [
  'phone',
  'email',
  'gender',
  'age',
  'experienceYears',
  'isMainIncome',
  'educationLevel',
] as const;

/** Columnas de la finca que se completan si están vacías; `townId` es el municipio. */
export const FARM_COMPLETABLE_FIELDS = [
  'vereda',
  'corregimiento',
  'latitude',
  'longitude',
  'altitude',
  'area',
  'waterAccess',
  'internetAccess',
  'hasElectricityAccess',
  'mainAccessType',
  'electricitySourceType',
  'waterSourceType',
  'plotCount',
  'townId',
] as const;

/** Tipos de actor que sí son productor; cualquier otro dispara la advertencia. */
const PRODUCER_ACTOR_TYPES = new Set(['productor', 'propietario']);

export interface PlanFarmRecord {
  farmId: string;
  name: string;
  /** Valor actual de cada columna de `FARM_COMPLETABLE_FIELDS` (null si vacía). */
  values: Record<string, unknown>;
}

export interface PlanFarmerRecord {
  farmerId: string;
  name: string;
  /** Valor actual de cada columna de `FARMER_COMPLETABLE_FIELDS`. */
  values: Record<string, unknown>;
  farm: PlanFarmRecord | null;
}

export interface FarmCandidateSource {
  name: string;
  vereda: string | null;
  townId: string | null;
}

export interface ExistingFarmCandidate extends FarmCandidateSource {
  farmId: string;
}

export interface PendingSubmissionPeer extends FarmCandidateSource {
  surveyId: string;
  /** Documento normalizado del otro envío, si lo trae. */
  documentId: string | null;
}

export interface FieldToComplete {
  entity: 'farmer' | 'farm';
  field: string;
  value: unknown;
}

export interface PublicSubmissionPlanInput {
  surveyId: string;
  identity: {
    name: string | null;
    /** Documento ya normalizado. */
    documentId: string | null;
    phone: string | null;
  };
  /** Productores con ese documento, ordenados por `created_at ASC`. */
  documentCandidates: PlanFarmerRecord[];
  /** Productor hallado por nombre + teléfono (solo si no hay coincidencia por documento). */
  phoneMatch: PlanFarmerRecord | null;
  /** Productor al que el envío ya quedó vinculado antes. */
  linkedFarmer: PlanFarmerRecord | null;
  submission: {
    farmerValues: Record<string, unknown>;
    farm: {
      name: string | null;
      vereda: string | null;
      /** Municipio del envío o el indicado por el administrador. */
      townId: string | null;
      values: Record<string, unknown>;
    };
  };
  crops: {
    resolved: { cropId: string; name: string }[];
    unmapped: string[];
  };
  respondentProfiles: { optionText: string; actorType: string }[];
  /** Advertencias de normalización (`area_*`, `multi_value_truncated`). */
  fieldWarnings: { code: PreviewWarningCode; message?: string }[];
  existingFarmCandidates: ExistingFarmCandidate[];
  pendingPeers: PendingSubmissionPeer[];
}

export interface ProcessPreview {
  surveyId: string;
  identity: PublicSubmissionPlanInput['identity'];
  document: {
    status: DocumentStatus;
    farmerId: string | null;
    candidates: { farmerId: string; name: string }[];
  };
  farm: {
    action: FarmAction;
    farmId: string | null;
    sharedCandidates: {
      source: 'farm' | 'pending_submission';
      farmId: string | null;
      surveyId: string | null;
      name: string;
      vereda: string | null;
    }[];
  };
  crops: PublicSubmissionPlanInput['crops'];
  fieldsToComplete: FieldToComplete[];
  warnings: { code: PreviewWarningCode; message?: string }[];
}

/** Nombre o vereda comparables: sin tildes, mayúsculas ni signos, espacios colapsados. */
export function normalizeFarmKey(value: string | null | undefined): string {
  if (!value) return '';
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Campos vacíos del registro actual que el envío puede llenar (nunca pisa un valor no nulo). */
export function completeFields(
  entity: 'farmer' | 'farm',
  current: Record<string, unknown>,
  submitted: Record<string, unknown>,
): FieldToComplete[] {
  const fields =
    entity === 'farmer' ? FARMER_COMPLETABLE_FIELDS : FARM_COMPLETABLE_FIELDS;
  const result: FieldToComplete[] = [];
  for (const field of fields) {
    const value = submitted[field];
    if (value === undefined || value === null) continue;
    if (current[field] !== undefined && current[field] !== null) continue;
    result.push({ entity, field, value });
  }
  return result;
}

/** Mismo nombre normalizado y misma vereda; municipio solo cuando ambos lo traen. */
function isSharedFarmCandidate(
  submitted: FarmCandidateSource,
  other: FarmCandidateSource,
): boolean {
  const name = normalizeFarmKey(submitted.name);
  const vereda = normalizeFarmKey(submitted.vereda);
  if (!name || !vereda) return false;
  if (normalizeFarmKey(other.name) !== name) return false;
  if (normalizeFarmKey(other.vereda) !== vereda) return false;
  if (submitted.townId && other.townId && submitted.townId !== other.townId) {
    return false;
  }
  return true;
}

export function buildPublicSubmissionPlan(
  input: PublicSubmissionPlanInput,
): ProcessPreview {
  const { identity, submission } = input;
  const warnings: ProcessPreview['warnings'] = [];

  let matched: PlanFarmerRecord | null = input.linkedFarmer;
  let status: DocumentStatus = 'new';
  if (matched) {
    status = 'same_person_match';
  } else if (input.documentCandidates.length > 0 && identity.name) {
    const selection = selectFarmerByDocument(
      input.documentCandidates,
      identity.name,
    );
    if (selection.match) {
      matched = selection.match;
      status = 'same_person_match';
    } else {
      status = 'collision';
    }
  } else if (input.documentCandidates.length === 0 && input.phoneMatch) {
    matched = input.phoneMatch;
    status = 'same_person_match';
  }

  const submittedFarmName = submission.farm.name;
  let action: FarmAction;
  let farmId: string | null = null;
  // D-H2-3: si el envío trae otra finca con otro nombre, no se crea una segunda
  // *ni se tocan* los campos de la finca existente — el envío queda como
  // respuesta, solo con la advertencia. `farmNameDiffers` gatea también
  // `fieldsToComplete` más abajo, para que la vista previa y `process-public`
  // coincidan en no completar esa finca.
  let farmNameDiffers = false;
  if (matched?.farm) {
    action = 'complete';
    farmId = matched.farm.farmId;
    farmNameDiffers = Boolean(
      submittedFarmName &&
      normalizeFarmKey(submittedFarmName) !==
        normalizeFarmKey(matched.farm.name),
    );
    if (farmNameDiffers) {
      warnings.push({
        code: 'different_farm_name_existing_farmer',
        message: `El productor ya tiene la finca «${matched.farm.name}»; el envío trae «${submittedFarmName}» y no se crea una segunda.`,
      });
    }
  } else {
    action = submittedFarmName ? 'create' : 'none';
  }

  const sharedCandidates: ProcessPreview['farm']['sharedCandidates'] = [];
  if (action === 'create') {
    const farmSource: FarmCandidateSource = {
      name: submittedFarmName ?? '',
      vereda: submission.farm.vereda,
      townId: submission.farm.townId,
    };
    for (const farm of input.existingFarmCandidates) {
      if (!isSharedFarmCandidate(farmSource, farm)) continue;
      sharedCandidates.push({
        source: 'farm',
        farmId: farm.farmId,
        surveyId: null,
        name: farm.name,
        vereda: farm.vereda,
      });
    }
    for (const peer of input.pendingPeers) {
      // El mismo documento es un envío repetido de la misma persona, no una finca compartida.
      if (identity.documentId && peer.documentId === identity.documentId)
        continue;
      if (!isSharedFarmCandidate(farmSource, peer)) continue;
      sharedCandidates.push({
        source: 'pending_submission',
        farmId: null,
        surveyId: peer.surveyId,
        name: peer.name,
        vereda: peer.vereda,
      });
    }
  }

  const fieldsToComplete: FieldToComplete[] = matched
    ? [
        ...completeFields('farmer', matched.values, submission.farmerValues),
        ...(matched.farm && !farmNameDiffers
          ? completeFields('farm', matched.farm.values, submission.farm.values)
          : []),
      ]
    : [];

  const nonProducer = input.respondentProfiles.filter(
    (p) => !PRODUCER_ACTOR_TYPES.has(p.actorType.toLowerCase()),
  );
  if (nonProducer.length > 0) {
    warnings.push({
      code: 'respondent_not_producer',
      message: `El perfil declarado no es de productor: ${nonProducer
        .map((p) => p.optionText)
        .join(', ')}.`,
    });
  }
  if (!submission.farm.townId) {
    warnings.push({
      code: 'missing_town',
      message:
        'El envío no trae municipio: indique uno o la finca queda sin municipio.',
    });
  }
  warnings.push(...input.fieldWarnings);
  if (
    identity.documentId &&
    input.pendingPeers.some((p) => p.documentId === identity.documentId)
  ) {
    warnings.push({
      code: 'duplicate_document_in_pending',
      message: 'Otro envío pendiente trae el mismo documento.',
    });
  }

  return {
    surveyId: input.surveyId,
    identity,
    document: {
      status,
      farmerId: matched?.farmerId ?? null,
      candidates: input.documentCandidates.map((c) => ({
        farmerId: c.farmerId,
        name: c.name,
      })),
    },
    farm: { action, farmId, sharedCandidates },
    crops: input.crops,
    fieldsToComplete,
    warnings,
  };
}
