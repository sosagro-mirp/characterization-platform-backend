/**
 * Spec 108 (P10, P12) — matriz de compatibilidad tipo de pregunta → gráfico y
 * compatibilidad de fusiones. Módulo puro, sin dependencias de Nest ni de la BD.
 */
export type ChartKind =
  | 'donut'
  | 'bars'
  | 'horizontal-bars'
  | 'diverging'
  | 'histogram'
  | 'histogram-by-unit'
  | 'harvest-calendar'
  | 'map'
  | 'yes-percent-bars'
  | 'histogram-normalized';

export type CombineMode = 'merge' | 'compare';

/** El primer gráfico de cada tipo es el default. */
const CHART_MATRIX: Record<string, ChartKind[]> = {
  yes_no: ['donut', 'yes-percent-bars'],
  single_choice: ['bars', 'horizontal-bars', 'donut', 'map'],
  multiple_choice: ['horizontal-bars', 'harvest-calendar'],
  compliance: ['bars'],
  likert: ['diverging'],
  numeric: ['histogram'],
  numeric_with_unit: ['histogram-by-unit', 'histogram-normalized'],
};

/** Gráficos admitidos en modo comparación, por tipo. */
const COMPARE_CHARTS: Record<string, ChartKind[]> = {
  yes_no: ['yes-percent-bars'],
  likert: ['diverging'],
};

/** Tipos cuyas opciones deben coincidir (por texto exacto) al fusionar. */
const OPTION_MATCH_TYPES = new Set([
  'single_choice',
  'multiple_choice',
  'compliance',
  'numeric_with_unit',
]);

const MAX_DONUT_OPTIONS = 6;

const MONTHS = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];

const DEPARTMENTS = [
  'amazonas',
  'antioquia',
  'arauca',
  'atlantico',
  'bogota',
  'bogota d.c.',
  'bolivar',
  'boyaca',
  'caldas',
  'caqueta',
  'casanare',
  'cauca',
  'cesar',
  'choco',
  'cordoba',
  'cundinamarca',
  'guainia',
  'guaviare',
  'huila',
  'la guajira',
  'magdalena',
  'meta',
  'narino',
  'norte de santander',
  'putumayo',
  'quindio',
  'risaralda',
  'san andres y providencia',
  'santander',
  'sucre',
  'tolima',
  'valle del cauca',
  'vaupes',
  'vichada',
];

const normalize = (t: string): string =>
  t.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();

export function getAllowedCharts(questionType: string): ChartKind[] {
  return [...(CHART_MATRIX[questionType] ?? [])];
}

export function isSelectableQuestionType(questionType: string): boolean {
  return getAllowedCharts(questionType).length > 0;
}

/** Tipos con matriz, en el orden de la matriz. */
export function getMatrix(): {
  questionType: string;
  charts: ChartKind[];
  combineModes: CombineMode[];
}[] {
  return Object.keys(CHART_MATRIX).map((questionType) => ({
    questionType,
    charts: getAllowedCharts(questionType),
    combineModes: COMPARE_CHARTS[questionType]
      ? ['merge', 'compare']
      : ['merge'],
  }));
}

export function validateChartKind(input: {
  questionType: string;
  chartKind: string;
  combineMode: CombineMode;
  optionTexts: string[];
}): { ok: boolean; reason?: string } {
  const { questionType, chartKind, combineMode, optionTexts } = input;
  const allowed = getAllowedCharts(questionType);
  if (allowed.length === 0) {
    return {
      ok: false,
      reason: `El tipo de pregunta "${questionType}" no es seleccionable en el constructor.`,
    };
  }
  if (!allowed.includes(chartKind as ChartKind)) {
    return {
      ok: false,
      reason: `El gráfico "${chartKind}" no está permitido para "${questionType}" (permitidos: ${allowed.join(', ')}).`,
    };
  }
  if (combineMode === 'compare') {
    const cmp = COMPARE_CHARTS[questionType];
    if (!cmp) {
      return {
        ok: false,
        reason: `"${questionType}" no admite comparación entre series.`,
      };
    }
    if (!cmp.includes(chartKind as ChartKind)) {
      return {
        ok: false,
        reason: `En comparación, "${questionType}" solo admite: ${cmp.join(', ')}.`,
      };
    }
  }
  if (chartKind === 'donut' && questionType === 'single_choice') {
    if (optionTexts.length > MAX_DONUT_OPTIONS) {
      return {
        ok: false,
        reason: `La dona admite como máximo ${MAX_DONUT_OPTIONS} opciones (hay ${optionTexts.length}).`,
      };
    }
  }
  if (chartKind === 'map') {
    // «Otros» es la opción de escape de las preguntas de departamento: no
    // cuenta contra la condición (el 66 ya mostraba el mapa con ella).
    const named = optionTexts.filter((t) => !/^otros?$/i.test(t.trim()));
    const allDepartments =
      named.length > 0 &&
      named.every((t) => DEPARTMENTS.includes(normalize(t)));
    if (!allDepartments) {
      return {
        ok: false,
        reason: 'El mapa solo aplica si todas las opciones son departamentos.',
      };
    }
  }
  if (chartKind === 'harvest-calendar') {
    const set = new Set(optionTexts.map(normalize));
    const isMonths =
      optionTexts.length === 12 && MONTHS.every((m) => set.has(m));
    if (!isMonths) {
      return {
        ok: false,
        reason:
          'El calendario de cosecha solo aplica si las opciones son los 12 meses.',
      };
    }
  }
  return { ok: true };
}

export interface MergeSource {
  questionId: string;
  questionType: string;
  optionTexts: string[];
}

export interface MergeCheck {
  ok: boolean;
  requiresAck: boolean;
  reason?: string;
  optionDiff?: { questionId: string; missing: string[]; extra: string[] }[];
}

export function checkMergeCompatibility(
  sources: MergeSource[],
  opts: { optionsMismatchAck?: boolean } = {},
): MergeCheck {
  if (sources.length === 0) {
    return { ok: false, requiresAck: false, reason: 'Sin fuentes.' };
  }
  const type = sources[0].questionType;
  if (!isSelectableQuestionType(type)) {
    return {
      ok: false,
      requiresAck: false,
      reason: `El tipo "${type}" no es seleccionable en el constructor.`,
    };
  }
  if (sources.some((s) => s.questionType !== type)) {
    return {
      ok: false,
      requiresAck: false,
      reason: 'Solo se pueden fusionar preguntas del mismo tipo.',
    };
  }
  if (type === 'likert') {
    const levels = sources[0].optionTexts.length;
    if (sources.some((s) => s.optionTexts.length !== levels)) {
      return {
        ok: false,
        requiresAck: false,
        reason: 'Las preguntas Likert deben tener el mismo número de niveles.',
      };
    }
    return { ok: true, requiresAck: false };
  }
  if (!OPTION_MATCH_TYPES.has(type)) return { ok: true, requiresAck: false };

  const base = new Set(sources[0].optionTexts);
  const optionDiff: NonNullable<MergeCheck['optionDiff']> = [];
  for (const s of sources.slice(1)) {
    const own = new Set(s.optionTexts);
    const missing = [...base].filter((t) => !own.has(t));
    const extra = [...own].filter((t) => !base.has(t));
    if (missing.length > 0 || extra.length > 0) {
      optionDiff.push({ questionId: s.questionId, missing, extra });
    }
  }
  if (optionDiff.length === 0) return { ok: true, requiresAck: false };
  if (opts.optionsMismatchAck) {
    return { ok: true, requiresAck: true, optionDiff };
  }
  return {
    ok: false,
    requiresAck: true,
    reason:
      'Las opciones de las preguntas difieren; se requiere confirmación (optionsMismatchAck).',
    optionDiff,
  };
}
