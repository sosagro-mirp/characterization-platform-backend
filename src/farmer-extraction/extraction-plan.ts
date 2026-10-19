import {
  FARM_COMPLETABLE_FIELDS,
  FARMER_COMPLETABLE_FIELDS,
  FieldToComplete,
  normalizeFarmKey,
} from '../surveys/public-submission-plan';
import type { FarmerFarmRole } from '../farmer-farms/entities/farmer-farm.entity';

/**
 * Spec 95 — decisiones puras de la extracción unificada. Sin base de datos ni
 * efectos: la vista previa del procesado público, el reprocesado histórico y
 * `FarmerExtractionService` comparten estas reglas.
 */

export type ExtractionEntity = 'farmer' | 'farm';

export interface FieldDiscrepancyCandidate {
  entity: ExtractionEntity;
  /** Nombre de la propiedad (`phone`, `vereda`, `townId`…). */
  field: string;
  /** `farmer.phone`, `farm.vereda`…; `null` si el campo no viene de una pregunta mapeada. */
  systemField: string | null;
  currentValue: unknown;
  submittedValue: unknown;
}

export interface FieldChangePlan {
  /** Campos vacíos que se llenan. */
  complete: FieldToComplete[];
  /** Campos con valor distinto al enviado: se registran, no se pisan. */
  discrepancies: FieldDiscrepancyCandidate[];
}

/** Propiedad → `systemField` que la alimenta. */
const SYSTEM_FIELD_OF: Record<ExtractionEntity, Record<string, string>> = {
  farmer: {
    name: 'farmer.name',
    phone: 'farmer.phone',
    email: 'farmer.email',
    gender: 'farmer.gender',
    age: 'farmer.age',
    experienceYears: 'farmer.experienceYears',
    isMainIncome: 'farmer.isMainIncome',
    educationLevel: 'farmer.educationLevel',
  },
  farm: {
    name: 'farm.name',
    vereda: 'farm.vereda',
    corregimiento: 'farm.corregimiento',
    latitude: 'farm.latitude',
    longitude: 'farm.longitude',
    altitude: 'farm.altitude',
    area: 'farm.area',
    waterAccess: 'farm.waterAccess',
    internetAccess: 'farm.internetAccess',
    hasElectricityAccess: 'farm.hasElectricityAccess',
    mainAccessType: 'farm.mainAccessType',
    electricitySourceType: 'farm.electricitySourceType',
    waterSourceType: 'farm.waterSourceType',
    plotCount: 'farm.plotCount',
    townId: 'farm.town',
  },
};

export function systemFieldOf(
  entity: ExtractionEntity,
  field: string,
): string | null {
  return SYSTEM_FIELD_OF[entity][field] ?? null;
}

/** Propiedades que `PATCH /discrepancies/:id {apply}` puede sobrescribir. */
export function isApplicableField(
  entity: ExtractionEntity,
  field: string,
): boolean {
  return field in SYSTEM_FIELD_OF[entity];
}

/** Tolerancia al comparar coordenadas (≈ 11 m para grados). */
const COORDINATE_TOLERANCE: Record<string, number> = {
  latitude: 0.0001,
  longitude: 0.0001,
  altitude: 1,
  area: 0.0001,
};

function comparableText(value: unknown): string {
  return String(value)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/**
 * ¿El valor enviado difiere del actual? Texto recortado y sin tildes ni
 * mayúsculas; coordenadas con tolerancia; booleanos y números exactos.
 */
export function valuesDiffer(
  field: string,
  current: unknown,
  submitted: unknown,
): boolean {
  if (typeof current === 'boolean' || typeof submitted === 'boolean') {
    return current !== submitted;
  }
  const a = asNumber(current);
  const b = asNumber(submitted);
  if (a !== null && b !== null) {
    const tolerance = COORDINATE_TOLERANCE[field] ?? 0;
    return Math.abs(a - b) > tolerance;
  }
  return comparableText(current) !== comparableText(submitted);
}

const COMPLETABLE: Record<ExtractionEntity, readonly string[]> = {
  farmer: FARMER_COMPLETABLE_FIELDS,
  farm: FARM_COMPLETABLE_FIELDS,
};

/**
 * D-H3-B — "solo completar vacíos": un campo vacío del registro se llena con
 * el valor enviado; uno con valor distinto se informa como discrepancia; uno
 * con el mismo valor no hace nada. Nunca se pisa un valor no nulo.
 */
export function planFieldChanges(
  entity: ExtractionEntity,
  current: Record<string, unknown>,
  submitted: Record<string, unknown>,
): FieldChangePlan {
  const complete: FieldToComplete[] = [];
  const discrepancies: FieldDiscrepancyCandidate[] = [];
  for (const field of COMPLETABLE[entity]) {
    const value = submitted[field];
    if (value === undefined || value === null) continue;
    const existing = current[field];
    if (existing === undefined || existing === null) {
      complete.push({ entity, field, value });
    } else if (valuesDiffer(field, existing, value)) {
      discrepancies.push({
        entity,
        field,
        systemField: systemFieldOf(entity, field),
        currentValue: existing,
        submittedValue: value,
      });
    }
  }
  return { complete, discrepancies };
}

export interface FarmChoiceFarm {
  farmId: string;
  name: string;
  isPrimary: boolean;
}

export type FarmChoiceAction =
  /** La encuesta ya estaba anclada a una finca. */
  | 'anchored'
  /** Finca del productor cuyo nombre coincide con el enviado. */
  | 'match'
  /** Sin nombre o con otro nombre: la principal (D-H3-2). */
  | 'principal'
  /** Vincular una finca existente elegida por el administrador (canal público). */
  | 'link'
  /** Crear la finca del envío. */
  | 'create'
  | 'none';

export interface FarmChoiceInput {
  anchoredFarmId: string | null;
  /** Fincas del productor, la principal primero. */
  farms: FarmChoiceFarm[];
  submittedName: string | null;
  origin: 'field' | 'public';
  /** Decisión del administrador al procesar un envío público. */
  decision?: { mode: 'create' | 'link'; farmId?: string } | null;
}

export interface FarmChoice {
  action: FarmChoiceAction;
  farmId: string | null;
  /**
   * El envío trae otro nombre de finca que el de la elegida: no se crea otra
   * finca ni se completan sus campos; solo se registra la discrepancia `name`.
   */
  nameDiffers: boolean;
}

export function chooseFarm(input: FarmChoiceInput): FarmChoice {
  const submittedKey = normalizeFarmKey(input.submittedName);
  const differs = (name: string): boolean =>
    submittedKey !== '' && normalizeFarmKey(name) !== submittedKey;

  if (input.anchoredFarmId) {
    const anchored = input.farms.find((f) => f.farmId === input.anchoredFarmId);
    return {
      action: 'anchored',
      farmId: input.anchoredFarmId,
      nameDiffers: anchored ? differs(anchored.name) : false,
    };
  }

  if (submittedKey) {
    const match = input.farms.find(
      (f) => normalizeFarmKey(f.name) === submittedKey,
    );
    if (match) {
      return { action: 'match', farmId: match.farmId, nameDiffers: false };
    }
  }

  if (input.farms.length > 0) {
    const principal = input.farms.find((f) => f.isPrimary) ?? input.farms[0];
    return {
      action: 'principal',
      farmId: principal.farmId,
      nameDiffers: differs(principal.name),
    };
  }

  // Sin fincas. En campo nunca se vincula sola a una candidata (D-H2-2).
  if (input.origin === 'public' && input.decision?.mode === 'link') {
    return {
      action: 'link',
      farmId: input.decision.farmId ?? null,
      nameDiffers: false,
    };
  }
  if (submittedKey) {
    return { action: 'create', farmId: null, nameDiffers: false };
  }
  return { action: 'none', farmId: null, nameDiffers: false };
}

/** Perfil declarado (`actor_types.name`) → rol del productor en la finca (D-H3-3). */
const ROLE_BY_ACTOR_TYPE: Record<string, FarmerFarmRole> = {
  productor: 'producer',
  propietario: 'owner',
  extensionista: 'other',
};

export function roleFromActorType(
  actorTypeName: string | null | undefined,
): FarmerFarmRole {
  if (!actorTypeName) return 'producer';
  return ROLE_BY_ACTOR_TYPE[actorTypeName.trim().toLowerCase()] ?? 'producer';
}

/** Primer perfil declarado por las respuestas que mapea a un tipo de actor. */
export function roleFromProfiles(
  profiles: { actorType: string }[],
): FarmerFarmRole {
  const first = profiles[0];
  return roleFromActorType(first?.actorType);
}

/**
 * ¿La encuesta trae algo que extraer? Cualquier `systemField` `farmer.*`,
 * `farm.*`, `crop.*` (incluye `farm.mainCrop`).
 */
export function isExtractable(
  responses: { question?: { systemField?: string | null } | null }[],
): boolean {
  return responses.some((r) => {
    const sf = r.question?.systemField;
    return (
      !!sf &&
      (sf.startsWith('farmer.') ||
        sf.startsWith('farm.') ||
        sf.startsWith('crop.'))
    );
  });
}
