/**
 * Spec 43 (Fase 3): catálogo de filtros globales derivados de respuestas
 * (dashboard.md §1). Cada entrada localiza su pregunta fuente por
 * `systemField` cuando existe (gender, ageRange, educationLevel — D3) o, en
 * su defecto, por texto exacto dentro de un instrumento conocido
 * (connectivity, profile, tenure, chainStage). Verificado
 * contra las semillas (`src/database/seeds/instrumento-*.seed.ts`) que cada
 * combinación instrumentCode+questionText identifica una única pregunta —
 * son fuentes deterministas, aunque no tengan systemField dedicado.
 */

export const AGE_RANGE_BUCKETS = ['<30', '30-45', '46-60', '>60'] as const;
export type AgeRangeBucket = (typeof AGE_RANGE_BUCKETS)[number];

/** Límites [min, max) sobre `response.numericValue`; `undefined` = sin límite. */
export const AGE_RANGE_BOUNDS: Record<
  AgeRangeBucket,
  { min?: number; max?: number }
> = {
  '<30': { max: 30 },
  '30-45': { min: 30, max: 46 },
  '46-60': { min: 46, max: 61 },
  '>60': { min: 61 },
};

export type ResponseFilterKey =
  | 'gender'
  | 'ageRange'
  | 'educationLevel'
  | 'connectivity'
  | 'profile'
  | 'tenure'
  | 'chainStage';

/** Compartido con `dashboard-kpis.config.ts` (Fase 4): dos formas de ubicar una
 * pregunta fuente sin depender de su UUID (distinto por entorno). */
export interface BySystemField {
  locate: 'systemField';
  systemField: string;
}

export interface ByInstrumentAndText {
  locate: 'instrumentAndText';
  instrumentCode: string;
  questionText: string;
}

/**
 * Spec 66 (D13): la misma pregunta vive en varias fuentes tras el spec 84 (la
 * vigente en `S_FINCA`/`S_AGRI`/talleres y la archivada en el instrumento
 * histórico). Se suman todas; la primera que resuelva aporta tipo y opciones,
 * así que la fuente vigente va primero. Las opciones se agrupan por texto,
 * como en los destinos con varias preguntas del spec 97.
 */
export interface ByAnyOf {
  locate: 'anyOf';
  sources: ByInstrumentAndText[];
}

export type QuestionLocator = BySystemField | ByInstrumentAndText | ByAnyOf;

export type ResponseFilterSource = QuestionLocator & {
  key: ResponseFilterKey;
  /** 'range' = numérico por bucket; 'option' = un solo valor; 'multiOption' = lista OR. */
  matchType: 'range' | 'option' | 'multiOption';
};

const SIGNAL_TEXT =
  '¿Cómo describiría la calidad de la señal móvil en la finca?';
const CHAIN_STAGE_TEXT =
  '¿En qué etapas de la cadena productiva participa? (Marque todas las que apliquen)';
const CHAIN_STAGE_TALLER_TEXT =
  '¿En qué etapas de la cadena productiva participa? (puede marcar más de una opción)';

/** Calidad de la señal móvil: vigente en `S_FINCA` y talleres, histórica en `S8E`.
 * Compartida con los cortes de la vista de demanda digital (`dashboard-kpis.config.ts`). */
export const CONNECTIVITY_SOURCE: ByAnyOf = {
  locate: 'anyOf',
  sources: [
    {
      locate: 'instrumentAndText',
      instrumentCode: 'S_FINCA',
      questionText: SIGNAL_TEXT,
    },
    {
      locate: 'instrumentAndText',
      instrumentCode: 'TALLER',
      questionText: SIGNAL_TEXT,
    },
    {
      locate: 'instrumentAndText',
      instrumentCode: 'TALLER-TAB',
      questionText: SIGNAL_TEXT,
    },
    {
      locate: 'instrumentAndText',
      instrumentCode: 'S8E',
      questionText: SIGNAL_TEXT,
    },
  ],
};

export const RESPONSE_FILTER_SOURCES: ResponseFilterSource[] = [
  {
    key: 'gender',
    locate: 'systemField',
    systemField: 'farmer.gender',
    matchType: 'option',
  },
  {
    key: 'ageRange',
    locate: 'systemField',
    systemField: 'farmer.age',
    matchType: 'range',
  },
  {
    key: 'educationLevel',
    locate: 'systemField',
    systemField: 'farmer.educationLevel',
    matchType: 'option',
  },
  {
    key: 'connectivity',
    ...CONNECTIVITY_SOURCE,
    matchType: 'option',
  },
  {
    // Spec 66 (D13): `S_REG · Perfil` es la vigente. La de talleres («Perfil
    // del productor (puede marcar más de una opción)») y la archivada de S1a
    // usan otro vocabulario de opciones y no se suman.
    // DEBT: spec 66 — decidir en la Fase 3 (C1) si se homologan las opciones.
    key: 'profile',
    locate: 'instrumentAndText',
    instrumentCode: 'S_REG',
    questionText: 'Perfil',
    matchType: 'option',
  },
  {
    key: 'tenure',
    locate: 'anyOf',
    sources: [
      {
        locate: 'instrumentAndText',
        instrumentCode: 'S_FINCA',
        questionText: 'La unidad productiva es:',
      },
      {
        locate: 'instrumentAndText',
        instrumentCode: 'S1b',
        questionText: 'La unidad productiva es:',
      },
    ],
    matchType: 'option',
  },
  {
    key: 'chainStage',
    locate: 'anyOf',
    sources: [
      {
        locate: 'instrumentAndText',
        instrumentCode: 'S_AGRI',
        questionText: CHAIN_STAGE_TEXT,
      },
      {
        locate: 'instrumentAndText',
        instrumentCode: 'TALLER',
        questionText: CHAIN_STAGE_TALLER_TEXT,
      },
      {
        locate: 'instrumentAndText',
        instrumentCode: 'TALLER-TAB',
        questionText: CHAIN_STAGE_TALLER_TEXT,
      },
      {
        locate: 'instrumentAndText',
        instrumentCode: 'S1b',
        questionText: CHAIN_STAGE_TEXT,
      },
    ],
    matchType: 'multiOption',
  },
];
