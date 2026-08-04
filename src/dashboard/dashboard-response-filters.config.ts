/**
 * Spec 43 (Fase 3): catálogo de filtros globales derivados de respuestas
 * (dashboard.md §1). Cada entrada localiza su pregunta fuente por
 * `systemField` cuando existe (gender, ageRange, educationLevel — D3) o, en
 * su defecto, por texto exacto dentro de un instrumento conocido
 * (connectivity, populationGroup, profile, tenure, chainStage). Verificado
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
  | 'populationGroup'
  | 'profile'
  | 'tenure'
  | 'chainStage';

interface BySystemField {
  locate: 'systemField';
  systemField: string;
}

interface ByInstrumentAndText {
  locate: 'instrumentAndText';
  instrumentCode: string;
  questionText: string;
}

export type ResponseFilterSource = (BySystemField | ByInstrumentAndText) & {
  key: ResponseFilterKey;
  /** 'range' = numérico por bucket; 'option' = un solo valor; 'multiOption' = lista OR. */
  matchType: 'range' | 'option' | 'multiOption';
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
    locate: 'instrumentAndText',
    instrumentCode: 'S8E',
    questionText: '¿Cómo describiría la calidad de la señal móvil en la finca?',
    matchType: 'option',
  },
  {
    key: 'populationGroup',
    locate: 'instrumentAndText',
    instrumentCode: 'S1a',
    questionText:
      '¿Pertenece el productor a alguno de los siguientes grupos o territorios? (Puede marcar más de una opción)',
    matchType: 'multiOption',
  },
  {
    key: 'profile',
    locate: 'instrumentAndText',
    instrumentCode: 'S1a',
    questionText: 'Perfil del productor',
    matchType: 'option',
  },
  {
    key: 'tenure',
    locate: 'instrumentAndText',
    instrumentCode: 'S1b',
    questionText: 'La unidad productiva es:',
    matchType: 'option',
  },
  {
    key: 'chainStage',
    locate: 'instrumentAndText',
    instrumentCode: 'S1b',
    questionText:
      '¿En qué etapas de la cadena productiva participa? (Marque todas las que apliquen)',
    matchType: 'multiOption',
  },
];
