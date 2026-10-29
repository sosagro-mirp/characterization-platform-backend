import type { MetadataCatalogKind } from '../../options-question/metadata-catalogs';

/**
 * Spec 97 (H4 del spec 83) — registro de destinos `pregunta → entidad`.
 *
 * Fuente única de las claves `entidad.campo` que `Question.systemField` puede
 * tomar: la validan la API de preguntas, la extracción, el dashboard, el
 * editor web y el MCP. Las claves renombradas siguen aceptándose como `aliases`
 * (lectura y escritura) hasta H8; al guardar se normaliza a la canónica.
 */

export type SystemFieldEntity = 'farmer' | 'farm' | 'farmCrop';

export type SystemFieldDataType =
  | 'text'
  | 'number'
  | 'boolean'
  | 'option'
  | 'optionList';

/**
 * - `active`: tiene fuente en los instrumentos vigentes y se puede asignar.
 * - `noSource`: la columna existe pero ningún instrumento vigente la llena;
 *   se puede asignar.
 * - `legacy`: clave en desuso; se lee, pero no se asigna a preguntas nuevas.
 */
export type SystemFieldStatus = 'active' | 'noSource' | 'legacy';

export interface SystemFieldDef {
  /** Clave canónica, `entidad.campo`. */
  key: string;
  entity: SystemFieldEntity;
  /** Propiedad de la entidad que alimenta (`null` en los marcadores de cultivo). */
  field: string | null;
  dataType: SystemFieldDataType;
  /** Nombres de `types_of_questions` compatibles. */
  questionTypes: string[];
  metadataCatalog: MetadataCatalogKind | null;
  label: string;
  status: SystemFieldStatus;
  /** Claves viejas que resuelven a esta. */
  aliases: string[];
  /** La columna admite varias opciones (se concatenan): el destino puede repetirse en un instrumento. */
  multiValue?: boolean;
  /** La pregunta lleva unidad (`numeric_with_unit`) y el valor se normaliza. */
  unit?: 'area';
}

const TEXT_TYPES = ['open_text'];
const TEXT_OR_NUMBER_TYPES = ['open_text', 'numeric'];
const NUMBER_TYPES = ['numeric'];
const BOOLEAN_TYPES = ['yes_no'];
const OPTION_TYPES = ['single_choice', 'open_text'];
const OPTION_LIST_TYPES = ['single_choice', 'multiple_choice'];

type Draft = Omit<SystemFieldDef, 'entity' | 'field' | 'aliases'> & {
  aliases?: string[];
};

function entry(
  entity: SystemFieldEntity,
  field: string | null,
  draft: Omit<Draft, 'key'> & { key?: string },
): SystemFieldDef {
  return {
    ...draft,
    key: draft.key ?? `${entity}.${field}`,
    entity,
    field,
    aliases: draft.aliases ?? [],
  };
}

const CROP_FLAGS: { flag: string; label: string }[] = [
  { flag: 'cacao', label: 'Cultiva cacao' },
  { flag: 'cafe', label: 'Cultiva café' },
  { flag: 'cannabis', label: 'Cultiva cannabis' },
  { flag: 'canamo', label: 'Cultiva cáñamo' },
];

export const SYSTEM_FIELDS: readonly SystemFieldDef[] = [
  // ── Productor ──────────────────────────────────────────────────────────
  entry('farmer', 'name', {
    dataType: 'text',
    questionTypes: TEXT_TYPES,
    metadataCatalog: null,
    label: 'Productor · Nombre',
    status: 'active',
  }),
  entry('farmer', 'documentId', {
    dataType: 'text',
    questionTypes: TEXT_OR_NUMBER_TYPES,
    metadataCatalog: null,
    label: 'Productor · Número de documento',
    status: 'active',
  }),
  entry('farmer', 'documentType', {
    dataType: 'option',
    questionTypes: OPTION_TYPES,
    metadataCatalog: null,
    label: 'Productor · Tipo de documento',
    status: 'active',
  }),
  entry('farmer', 'phone', {
    dataType: 'text',
    questionTypes: TEXT_OR_NUMBER_TYPES,
    metadataCatalog: null,
    label: 'Productor · Teléfono',
    status: 'active',
  }),
  entry('farmer', 'age', {
    dataType: 'number',
    questionTypes: NUMBER_TYPES,
    metadataCatalog: null,
    label: 'Productor · Edad',
    status: 'active',
  }),
  entry('farmer', 'gender', {
    dataType: 'option',
    questionTypes: OPTION_TYPES,
    metadataCatalog: null,
    label: 'Productor · Género',
    status: 'active',
  }),
  entry('farmer', 'educationLevel', {
    dataType: 'option',
    questionTypes: OPTION_TYPES,
    metadataCatalog: null,
    label: 'Productor · Nivel educativo',
    status: 'active',
  }),
  entry('farmer', 'email', {
    dataType: 'text',
    questionTypes: TEXT_TYPES,
    metadataCatalog: null,
    label: 'Productor · Correo electrónico',
    status: 'noSource',
  }),
  entry('farmer', 'experienceYears', {
    dataType: 'number',
    questionTypes: NUMBER_TYPES,
    metadataCatalog: null,
    label: 'Productor · Años de experiencia',
    status: 'noSource',
  }),
  entry('farmer', 'familySize', {
    dataType: 'number',
    questionTypes: NUMBER_TYPES,
    metadataCatalog: null,
    label: 'Productor · Tamaño del núcleo familiar',
    status: 'noSource',
  }),
  entry('farmer', 'isMainIncome', {
    dataType: 'boolean',
    questionTypes: BOOLEAN_TYPES,
    metadataCatalog: null,
    label: 'Productor · La finca es su ingreso principal',
    status: 'noSource',
  }),
  entry('farmer', 'participationInTraining', {
    dataType: 'boolean',
    questionTypes: BOOLEAN_TYPES,
    metadataCatalog: null,
    label: 'Productor · Participa en capacitaciones',
    status: 'noSource',
  }),
  // Claves de rol en desuso (D-H4-8): se leen, no se asignan.
  entry('farmer', 'isRespondent', {
    dataType: 'boolean',
    questionTypes: BOOLEAN_TYPES,
    metadataCatalog: null,
    label: 'Productor · Es quien responde (en desuso)',
    status: 'legacy',
  }),
  entry('farmer', 'producerName', {
    dataType: 'text',
    questionTypes: TEXT_TYPES,
    metadataCatalog: null,
    label: 'Productor · Nombre del productor (en desuso)',
    status: 'legacy',
  }),
  entry('farmer', 'producerEmail', {
    dataType: 'text',
    questionTypes: TEXT_TYPES,
    metadataCatalog: null,
    label: 'Productor · Correo del productor (en desuso)',
    status: 'legacy',
  }),
  entry('farmer', 'producerPhone', {
    dataType: 'text',
    questionTypes: TEXT_OR_NUMBER_TYPES,
    metadataCatalog: null,
    label: 'Productor · Teléfono del productor (en desuso)',
    status: 'legacy',
  }),
  entry('farmer', 'producerDocumentId', {
    dataType: 'text',
    questionTypes: TEXT_OR_NUMBER_TYPES,
    metadataCatalog: null,
    label: 'Productor · Documento del productor (en desuso)',
    status: 'legacy',
  }),

  // ── Finca ──────────────────────────────────────────────────────────────
  entry('farm', 'name', {
    dataType: 'text',
    questionTypes: TEXT_TYPES,
    metadataCatalog: null,
    label: 'Finca · Nombre',
    status: 'active',
  }),
  entry('farm', 'vereda', {
    dataType: 'text',
    questionTypes: TEXT_TYPES,
    metadataCatalog: null,
    label: 'Finca · Vereda',
    status: 'active',
  }),
  entry('farm', 'corregimiento', {
    dataType: 'text',
    questionTypes: TEXT_TYPES,
    metadataCatalog: null,
    label: 'Finca · Corregimiento',
    status: 'active',
  }),
  // `farm.department` y `farm.town` se resuelven por el `metadataId` de la
  // opción, no por su texto.
  entry('farm', 'department', {
    dataType: 'option',
    questionTypes: ['single_choice'],
    metadataCatalog: 'department',
    label: 'Finca · Departamento',
    status: 'active',
  }),
  entry('farm', 'town', {
    dataType: 'option',
    questionTypes: ['single_choice'],
    metadataCatalog: 'town',
    label: 'Finca · Municipio',
    status: 'active',
  }),
  entry('farm', 'area', {
    dataType: 'number',
    questionTypes: ['numeric_with_unit', 'numeric'],
    metadataCatalog: null,
    label: 'Finca · Área',
    status: 'active',
    unit: 'area',
  }),
  entry('farm', 'altitude', {
    dataType: 'number',
    questionTypes: NUMBER_TYPES,
    metadataCatalog: null,
    label: 'Finca · Altitud (m s. n. m.)',
    status: 'active',
  }),
  entry('farm', 'latitude', {
    dataType: 'number',
    questionTypes: NUMBER_TYPES,
    metadataCatalog: null,
    label: 'Finca · Latitud',
    status: 'active',
  }),
  entry('farm', 'longitude', {
    dataType: 'number',
    questionTypes: NUMBER_TYPES,
    metadataCatalog: null,
    label: 'Finca · Longitud',
    status: 'active',
  }),
  entry('farm', 'mainAccessType', {
    dataType: 'optionList',
    questionTypes: OPTION_LIST_TYPES,
    metadataCatalog: null,
    label: 'Finca · Tipo de acceso',
    status: 'active',
    multiValue: true,
  }),
  entry('farm', 'electricitySourceType', {
    dataType: 'option',
    questionTypes: OPTION_TYPES,
    metadataCatalog: null,
    label: 'Finca · Fuente de electricidad',
    status: 'active',
  }),
  entry('farm', 'hasElectricityAccess', {
    dataType: 'boolean',
    questionTypes: BOOLEAN_TYPES,
    metadataCatalog: null,
    label: 'Finca · Tiene electricidad',
    status: 'active',
  }),
  entry('farm', 'internetAccess', {
    dataType: 'boolean',
    questionTypes: BOOLEAN_TYPES,
    metadataCatalog: null,
    label: 'Finca · Tiene internet',
    status: 'active',
  }),
  entry('farm', 'waterAccess', {
    dataType: 'boolean',
    questionTypes: BOOLEAN_TYPES,
    metadataCatalog: null,
    label: 'Finca · Tiene acceso a agua',
    status: 'active',
  }),
  entry('farm', 'waterSourceType', {
    dataType: 'optionList',
    questionTypes: OPTION_LIST_TYPES,
    metadataCatalog: null,
    label: 'Finca · Fuente de agua',
    status: 'active',
    multiValue: true,
  }),
  entry('farm', 'plotCount', {
    dataType: 'number',
    questionTypes: NUMBER_TYPES,
    metadataCatalog: null,
    label: 'Finca · Número de lotes',
    status: 'active',
  }),
  entry('farm', 'technicalAssistanceAccess', {
    dataType: 'boolean',
    questionTypes: BOOLEAN_TYPES,
    metadataCatalog: null,
    label: 'Finca · Recibe asistencia técnica',
    status: 'active',
  }),
  entry('farm', 'crops', {
    dataType: 'optionList',
    questionTypes: OPTION_LIST_TYPES,
    metadataCatalog: 'crop',
    label: 'Finca · Cultivos',
    status: 'active',
    aliases: ['farm.mainCrop'],
  }),
  entry('farm', 'location', {
    dataType: 'text',
    questionTypes: TEXT_TYPES,
    metadataCatalog: null,
    label: 'Finca · Ubicación (texto)',
    status: 'noSource',
  }),

  // ── Cultivo de finca (marcadores sí/no) ────────────────────────────────
  ...CROP_FLAGS.map(({ flag, label }) =>
    entry('farmCrop', null, {
      key: `farm.hasCrop.${flag}`,
      dataType: 'boolean',
      questionTypes: BOOLEAN_TYPES,
      metadataCatalog: 'crop',
      label: `Finca · ${label}`,
      status: 'active',
      aliases: [`crop.${flag}`],
    }),
  ),
];

const BY_KEY = new Map<string, SystemFieldDef>();
const BY_ALIAS = new Map<string, SystemFieldDef>();
for (const def of SYSTEM_FIELDS) {
  BY_KEY.set(def.key, def);
  for (const alias of def.aliases) BY_ALIAS.set(alias, def);
}

/** Definición de una clave canónica o de un alias; `null` si no está en el catálogo. */
export function resolveSystemField(raw?: string | null): SystemFieldDef | null {
  const key = raw?.trim();
  if (!key) return null;
  return BY_KEY.get(key) ?? BY_ALIAS.get(key) ?? null;
}

/** Clave canónica de una clave o alias; `null` si no está en el catálogo. */
export function canonicalKey(raw?: string | null): string | null {
  return resolveSystemField(raw)?.key ?? null;
}

/** La clave canónica más todos sus alias: lo que hay que buscar para agregar un destino. */
export function keysFor(raw?: string | null): string[] {
  const def = resolveSystemField(raw);
  return def ? [def.key, ...def.aliases] : [];
}

/** `legacy` se lee, pero no se asigna a preguntas nuevas. */
export function isSelectable(def: SystemFieldDef): boolean {
  return def.status !== 'legacy';
}
