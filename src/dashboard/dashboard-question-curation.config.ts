/**
 * Spec 66 (Fases 3–17): registro de decisiones curatoriales pregunta a
 * pregunta, tomadas en conjunto con el usuario categoría por categoría.
 * Mismo patrón de locator que `dashboard-response-filters.config.ts` y
 * `dashboard-privacy.config.ts` (instrumento + texto exacto, estable entre
 * entornos porque no depende del UUID de la pregunta).
 *
 * Una entrada puede:
 * - ocultar la pregunta del dashboard público (`hidden: true`) — la pregunta
 *   sigue existiendo en el instrumento y en las respuestas, solo se decide
 *   que no aporta valor analítico al público (ej. preguntas operativas de
 *   metodología de la encuesta).
 * - declarar una gráfica explícita (`chartHint`) que reemplaza la regla por
 *   defecto según el tipo de pregunta (ver `dashboard.md §3` y
 *   `lib/dashboard/chartHint.ts` en el frontend).
 *
 * No incluir acá preguntas ya bloqueadas por `dashboard-privacy.config.ts`
 * (tipo excluido, `systemField` denylist, `PII_QUESTION_DENYLIST`) — esa es
 * la capa de privacidad, esta es la capa de curaduría editorial.
 */

export interface QuestionCurationEntry {
  instrumentCode: string;
  questionText: string;
  /** true si la pregunta no debe llegar al dashboard público. */
  hidden?: boolean;
  /** Gráfica explícita que reemplaza la regla por defecto del tipo. */
  chartHint?: string;
  /** Por qué se tomó la decisión — trazabilidad de la sesión de curaduría. */
  note: string;
}

export const QUESTION_CURATION: QuestionCurationEntry[] = [
  {
    instrumentCode: 'S1a',
    questionText: '¿El encuestado es el propietario de la unidad productiva?',
    hidden: true,
    note:
      'C1 · Perfil del productor (spec 66, Fase 3, 2026-08-05): pregunta ' +
      'operativa de metodología de la encuesta (control de quién respondió), ' +
      'no de caracterización del productor — decisión del usuario.',
  },
  {
    instrumentCode: 'S1a',
    questionText:
      '¿El encuestado es el productor o encargado principal de la unidad productiva?',
    hidden: true,
    note:
      'C1 · Perfil del productor (spec 66, Fase 3, 2026-08-05): misma razón ' +
      'que "¿El encuestado es el propietario...?" — decisión del usuario.',
  },
  {
    instrumentCode: 'S1a',
    questionText: 'Género del productor(a)',
    chartHint: 'donut',
    note:
      'C1 · Perfil del productor (spec 66, Fase 3, 2026-08-05): el usuario ' +
      'pidió gráfica de torta para esta pregunta puntual (3 opciones: ' +
      'Hombre/Mujer/Prefiere no responder) en vez del default de ' +
      'single_choice (Barras, HorizontalBarChart).',
  },
  {
    instrumentCode: 'S1a',
    questionText: 'Años de experiencia en la actividad productiva',
    hidden: true,
    note:
      'C1 · Perfil del productor (spec 66, Fase 3, 2026-08-10): el usuario ' +
      'decidió no mostrar esta pregunta en el dashboard público — revierte ' +
      'la decisión previa de "Se muestra / Histograma" (D4, 2026-08-05).',
  },
  {
    instrumentCode: 'S1a',
    questionText: 'Departamento',
    chartHint: 'map',
    note:
      'C2 · Ubicación y acceso (spec 66, Fase 4, D6, 2026-08-10): el usuario ' +
      'pidió mapa de Colombia en vez del default de single_choice (Barras, ' +
      'HorizontalBarChart) — ya es filtro global (`departmentId`), igual que ' +
      '"Perfil del productor"/"Género" en C1 se mostraron pese a ser filtro. ' +
      'Requirió un componente nuevo (`DepartmentMap`) porque el mapa ' +
      'existente (`ColombiaMap`, Resumen general) consume ' +
      '`/dashboard/department-counts`, que omite en silencio los ' +
      'departamentos suprimidos — acá se distingue explícitamente ' +
      '"sin datos" de "suprimido por privacidad".',
  },
  {
    instrumentCode: 'S1a',
    questionText:
      '¿Es accesible la vía durante todo el año (incluyendo épocas de lluvia)?',
    hidden: true,
    note:
      'C2 · Ubicación y acceso (spec 66, Fase 4, 2026-08-10): decisión del ' +
      'usuario — no va en el dashboard público.',
  },
  {
    instrumentCode: 'S13',
    questionText: 'Altitud (msnm)',
    hidden: true,
    note:
      'C2 · Ubicación y acceso (spec 66, Fase 4, 2026-08-10): decisión del ' +
      'usuario — no va en el dashboard público.',
  },
  {
    instrumentCode: 'S1b',
    questionText: 'Hectáreas totales del predio (ha)',
    hidden: true,
    note:
      'C1 · Perfil del productor y la finca (spec 66, Fase 3, 2026-08-10): ' +
      'decisión del usuario — no va en el dashboard público.',
  },
  {
    instrumentCode: 'S1b',
    questionText:
      'Hectáreas actualmente cultivadas con las cadenas del proyecto (ha)',
    hidden: true,
    note:
      'C1 · Perfil del productor y la finca (spec 66, Fase 3, 2026-08-10): ' +
      'decisión del usuario — no va en el dashboard público.',
  },
  {
    instrumentCode: 'S1b',
    questionText: '¿Procesa materia prima propia, de terceros o ambas?',
    hidden: true,
    note:
      'C1 · Perfil del productor y la finca (spec 66, Fase 3, 2026-08-10): ' +
      'decisión del usuario — no va en el dashboard público.',
  },
  {
    instrumentCode: 'S1b',
    questionText: '¿Hay vivienda(s) en la unidad productiva?',
    hidden: true,
    note:
      'C1 · Perfil del productor y la finca (spec 66, Fase 3, 2026-08-10): ' +
      'decisión del usuario — no va en el dashboard público.',
  },
  {
    instrumentCode: 'S1b',
    questionText: '¿Cuántas viviendas hay?',
    hidden: true,
    note:
      'C1 · Perfil del productor y la finca (spec 66, Fase 3, 2026-08-10): ' +
      'decisión del usuario — no va en el dashboard público.',
  },
  {
    instrumentCode: 'S1b',
    questionText: '¿Su lugar de vivienda es la unidad productiva o finca?',
    hidden: true,
    note:
      'C1 · Perfil del productor y la finca (spec 66, Fase 3, 2026-08-10): ' +
      'decisión del usuario — no va en el dashboard público.',
  },
  {
    instrumentCode: 'S1b',
    questionText: '¿Su familia vive en la unidad productiva o finca con usted?',
    hidden: true,
    note:
      'C1 · Perfil del productor y la finca (spec 66, Fase 3, 2026-08-10): ' +
      'decisión del usuario — no va en el dashboard público.',
  },
  {
    instrumentCode: 'S1b',
    questionText: 'Tipo de relieve predominante de la finca',
    hidden: true,
    note:
      'C1 · Perfil del productor y la finca (spec 66, Fase 3, 2026-08-10): ' +
      'decisión del usuario — no va en el dashboard público.',
  },
  {
    instrumentCode: 'S1b',
    questionText: '¿Hay más productores en la zona de su cultivo?',
    hidden: true,
    note:
      'C1 · Perfil del productor y la finca (spec 66, Fase 3, 2026-08-10): ' +
      'decisión del usuario — no va en el dashboard público.',
  },
  {
    instrumentCode: 'S1b',
    questionText:
      '¿Existen cultivos vecinos que puedan generar contaminación cruzada?',
    hidden: true,
    note:
      'C1 · Perfil del productor y la finca (spec 66, Fase 3, 2026-08-10): ' +
      'decisión del usuario — no va en el dashboard público.',
  },
  {
    instrumentCode: 'S2',
    questionText: '¿Cultiva actualmente Cacao?',
    hidden: true,
    note:
      'C3 · Cultivos y variedades (spec 66, Fase 5, D10, 2026-08-11): ' +
      'duplicado literal de la misma pregunta en S1b (ya curada, mostrada ' +
      'en C1) — se oculta acá para no repetir la misma información en dos ' +
      'categorías. Decisión del usuario.',
  },
  {
    instrumentCode: 'S2',
    questionText: '¿Cultiva actualmente Café?',
    hidden: true,
    note:
      'C3 · Cultivos y variedades (spec 66, Fase 5, D10, 2026-08-11): ' +
      'misma razón que "¿Cultiva actualmente Cacao?" — duplicado de S1b.',
  },
  {
    instrumentCode: 'S2',
    questionText: '¿Cultiva actualmente Cannabis?',
    hidden: true,
    note:
      'C3 · Cultivos y variedades (spec 66, Fase 5, D10, 2026-08-11): ' +
      'misma razón que "¿Cultiva actualmente Cacao?" — duplicado de S1b.',
  },
  {
    instrumentCode: 'S2',
    questionText: '¿Cultiva actualmente Cáñamo?',
    hidden: true,
    note:
      'C3 · Cultivos y variedades (spec 66, Fase 5, D10, 2026-08-11): ' +
      'misma razón que "¿Cultiva actualmente Cacao?" — duplicado de S1b.',
  },
  {
    instrumentCode: 'S2',
    questionText:
      '¿En qué etapas de la cadena productiva participa? (Marque todas las que apliquen)',
    hidden: true,
    note:
      'C3 · Cultivos y variedades (spec 66, Fase 5, D10, 2026-08-11): ' +
      'duplicado literal de la misma pregunta en S1b (ya curada, mostrada ' +
      'en C1) — se oculta acá para no repetir la misma información en dos ' +
      'categorías. Decisión del usuario.',
  },
  {
    instrumentCode: 'S2',
    questionText: '¿Procesa materia prima propia, de terceros o ambas?',
    hidden: true,
    note:
      'C3 · Cultivos y variedades (spec 66, Fase 5, D10, 2026-08-11): ' +
      'duplicado literal de la misma pregunta en S1b (oculta ahí por ' +
      'decisión del usuario) — se oculta también acá, mismo criterio.',
  },
  {
    instrumentCode: 'S2.4',
    questionText: 'Hectáreas sembradas en cacao (ha)',
    hidden: true,
    note:
      'C3 · Cultivos y variedades, Bloque Cacao (spec 66, Fase 5, ' +
      '2026-08-11): decisión del usuario — no va en el dashboard público.',
  },
  {
    instrumentCode: 'S2.4',
    questionText: '¿La producción de cacao está distribuida en varios lotes?',
    hidden: true,
    note:
      'C3 · Cultivos y variedades, Bloque Cacao (spec 66, Fase 5, ' +
      '2026-08-11): decisión del usuario — no va en el dashboard público.',
  },
  {
    instrumentCode: 'S2.4',
    questionText: '¿Cuántos lotes tiene?',
    hidden: true,
    note:
      'C3 · Cultivos y variedades, Bloque Cacao (spec 66, Fase 5, ' +
      '2026-08-11): decisión del usuario — no va en el dashboard público.',
  },
  {
    instrumentCode: 'S2.4',
    questionText: '¿Tiene otros cultivos asociados / intercalados?',
    hidden: true,
    note:
      'C3 · Cultivos y variedades, Bloque Cacao (spec 66, Fase 5, ' +
      '2026-08-11): decisión del usuario — no va en el dashboard público.',
  },
  {
    instrumentCode: 'S2.4',
    questionText:
      '¿Tiene registros productivos históricos? (cuadernos, apps, etc.)',
    hidden: true,
    note:
      'C3 · Cultivos y variedades, Bloque Cacao (spec 66, Fase 5, ' +
      '2026-08-11): decisión del usuario — no va en el dashboard público.',
  },
  {
    instrumentCode: 'S2.4',
    questionText: 'En caso de no estar asociado ¿está interesado en asociarse?',
    hidden: true,
    note:
      'C3 · Cultivos y variedades, Bloque Cacao (spec 66, Fase 5, ' +
      '2026-08-11): decisión del usuario — no va en el dashboard público.',
  },
  {
    instrumentCode: 'S2.4',
    questionText:
      '¿En qué meses se presenta la cosecha principal de cacao? (Marque todos los que apliquen)',
    chartHint: 'harvest-calendar',
    note:
      'C3 · Cultivos y variedades, Bloque Cacao (spec 66, Fase 5, ' +
      '2026-08-11): pregunta de meses de cosecha — se conectó el ' +
      'componente `HarvestCalendar` (ya existía para Resumen general, spec ' +
      '43 D7) al mecanismo `chartHint`, en vez de dejar el default de ' +
      '`multiple_choice` (BarrasH). De paso se resolvió el `// DEBT:` del ' +
      'componente sobre celdas suprimidas por privacidad.',
  },
  {
    instrumentCode: 'S2.4',
    questionText:
      '¿En qué meses se presenta la cosecha transitoria (secundaria) de cacao? (Marque todos los que apliquen)',
    chartHint: 'harvest-calendar',
    note:
      'C3 · Cultivos y variedades, Bloque Cacao (spec 66, Fase 5, ' +
      '2026-08-11): misma razón que la cosecha principal — pregunta de ' +
      'meses, mismo tratamiento de calendario.',
  },
  {
    instrumentCode: 'S2.5',
    questionText: 'Hectáreas sembradas en café (ha)',
    hidden: true,
    note:
      'C3 · Cultivos y variedades, Bloque Café (spec 66, Fase 5, ' +
      '2026-08-11): decisión del usuario — no va en el dashboard público.',
  },
  {
    instrumentCode: 'S2.6',
    questionText: '¿Cuenta con alguna certificación o está en proceso?',
    hidden: true,
    note:
      'C3 · Cultivos y variedades, Bloque Cannabis (spec 66, Fase 5, ' +
      '2026-08-11): decisión del usuario — no va en el dashboard público.',
  },
  {
    instrumentCode: 'S2.5',
    questionText: '¿Tiene registros productivos históricos?',
    hidden: true,
    note:
      'C3 · Cultivos y variedades, Bloque Café (spec 66, Fase 5, ' +
      '2026-08-11): decisión del usuario — no va en el dashboard público.',
  },
  {
    instrumentCode: 'S2.5',
    questionText:
      '¿En qué meses se presenta la cosecha principal de café? (Marque todos los que apliquen)',
    chartHint: 'harvest-calendar',
    note:
      'C3 · Cultivos y variedades, Bloque Café (spec 66, Fase 5, ' +
      '2026-08-11): mismo tratamiento de calendario que Bloque Cacao.',
  },
  {
    instrumentCode: 'S2.5',
    questionText:
      '¿En qué meses se presenta la cosecha transitoria de café? (Marque todos los que apliquen)',
    chartHint: 'harvest-calendar',
    note:
      'C3 · Cultivos y variedades, Bloque Café (spec 66, Fase 5, ' +
      '2026-08-11): misma razón que la cosecha principal de café.',
  },
];

function findEntry(
  instrumentCode: string | null | undefined,
  questionText: string,
): QuestionCurationEntry | undefined {
  if (!instrumentCode) return undefined;
  return QUESTION_CURATION.find(
    (entry) =>
      entry.instrumentCode === instrumentCode &&
      entry.questionText === questionText,
  );
}

/** true si la pregunta fue curada como oculta del dashboard público. */
export function isQuestionHidden(
  instrumentCode: string | null | undefined,
  questionText: string,
): boolean {
  return findEntry(instrumentCode, questionText)?.hidden === true;
}

/** Gráfica explícita curada para esta pregunta, o `null` si no hay ninguna
 * (el frontend cae al comportamiento por tipo, ver `lib/dashboard/chartHint.ts`). */
export function resolveCuratedChartHint(
  instrumentCode: string | null | undefined,
  questionText: string,
): string | null {
  return findEntry(instrumentCode, questionText)?.chartHint ?? null;
}
