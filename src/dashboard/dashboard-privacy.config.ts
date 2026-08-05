/**
 * Spec 66 (Fase 2): política de privacidad centralizada del dashboard
 * público. Absorbe `EXCLUDED_QUESTION_TYPES`, `DENIED_SYSTEM_FIELDS` y
 * `MIN_SAMPLE_THRESHOLD`, antes constantes sueltas dentro de
 * `dashboard.service.ts`, y agrega `MIN_CELL_SIZE` — la pieza que faltaba
 * (confirmada con datos reales de desarrollo, D2 del spec: una categoría con
 * `totalCount` por encima del umbral global puede seguir mostrando una
 * opción con un solo respondiente dentro de un desglose).
 *
 * Auditoría de origen (D2): de las 950 preguntas del inventario
 * (`docs/reports/inventario_preguntas_produccion.md`, spec 66 Fase 1), 15 son
 * identificantes directas. Las 15 ya estaban cubiertas hoy por partida doble
 * — 11 son `open_text` (tipo excluido) y las 4 restantes ya vivían en
 * `DENIED_SYSTEM_FIELDS` — pero no había, hasta ahora, un registro explícito
 * y auditable de *cuáles* son y *por qué*. `PII_QUESTION_DENYLIST` es ese
 * registro: defensa en profundidad, no la única barrera. Si mañana una de
 * estas preguntas pierde su `systemField` o cambia de tipo sin que nadie note
 * la relación con privacidad, esta lista la sigue bloqueando por locator
 * (instrumento + texto exacto, mismo patrón que
 * `dashboard-response-filters.config.ts`).
 */

/** Locator estable de una pregunta sin depender de su UUID (distinto por
 * entorno) — mismo patrón que `ByInstrumentAndText` en
 * `dashboard-response-filters.config.ts`. */
export interface PiiQuestionEntry {
  instrumentCode: string;
  questionText: string;
  /** Por qué se considera identificante — para que la denylist se pueda
   * auditar sin tener que reconstruir el razonamiento desde cero. */
  reason: string;
}

/**
 * Tipos de pregunta que nunca llegan al dashboard público: no son
 * agregables de forma anónima (texto libre) o son adjuntos multimedia que
 * podrían contener al propio encuestado (voz, imagen, documento, video).
 */
export const EXCLUDED_QUESTION_TYPES = [
  'open_text',
  'image',
  'voice_recording',
  'document',
  'video',
];

/**
 * `systemField` identificantes directos, denylist explícita en vez de un
 * patrón `farm.*`/`farmer.*` amplio (D6, spec 43): permite que campos no
 * identificantes del mismo namespace (`farm.area`, `farmer.gender`) sigan
 * siendo agregables.
 */
export const DENIED_SYSTEM_FIELDS = [
  'farm.latitude',
  'farm.longitude',
  'farm.name',
  'farm.vereda',
];

/**
 * Denylist explícita de preguntas identificantes por locator (D2, spec 66).
 * Todas están ya bloqueadas hoy por `EXCLUDED_QUESTION_TYPES` o
 * `DENIED_SYSTEM_FIELDS` — este registro documenta la auditoría, no
 * introduce una restricción nueva sobre el comportamiento actual.
 */
export const PII_QUESTION_DENYLIST: PiiQuestionEntry[] = [
  {
    instrumentCode: 'S1a',
    questionText: 'Nombre completo del encuestado',
    reason: 'Identifica directamente al encuestado. systemField farmer.name.',
  },
  {
    instrumentCode: 'S1a',
    questionText: 'Número de cédula / documento de identidad',
    reason: 'Documento de identidad. systemField farmer.documentId.',
  },
  {
    instrumentCode: 'S1a',
    questionText: 'Correo electrónico del encuestado',
    reason: 'Dato de contacto directo. systemField farmer.email.',
  },
  {
    instrumentCode: 'S1a',
    questionText: 'Número de celular del encuestado',
    reason: 'Dato de contacto directo. systemField farmer.phone.',
  },
  {
    instrumentCode: 'S1a',
    questionText: 'Nombre completo del propietario',
    reason:
      'Identifica directamente al propietario. systemField farmer.producerName.',
  },
  {
    instrumentCode: 'S1a',
    questionText: 'Número de celular del propietario',
    reason: 'Dato de contacto directo. systemField farmer.producerPhone.',
  },
  {
    instrumentCode: 'S1a',
    questionText: 'Correo electrónico del propietario',
    reason: 'Dato de contacto directo. systemField farmer.producerEmail.',
  },
  {
    instrumentCode: 'S1a',
    questionText: 'Nombre completo del productor',
    reason:
      'Identifica directamente al productor. systemField farmer.producerName.',
  },
  {
    instrumentCode: 'S1a',
    questionText:
      'Número de documento del productor o número de documento del encuestado',
    reason: 'Documento de identidad. systemField farmer.producerDocumentId.',
  },
  {
    instrumentCode: 'S1a',
    questionText: 'Número de celular del productor',
    reason: 'Dato de contacto directo. systemField farmer.producerPhone.',
  },
  {
    instrumentCode: 'S1a',
    questionText: 'Correo electrónico del productor',
    reason: 'Dato de contacto directo. systemField farmer.producerEmail.',
  },
  {
    instrumentCode: 'S1a',
    questionText: 'Vereda / Sector',
    reason:
      'Ubicación de grano fino, suficiente para identificar la finca en una vereda pequeña. systemField farm.vereda.',
  },
  {
    instrumentCode: 'S1b',
    questionText: 'Nombre de la finca / unidad productiva',
    reason:
      'Identifica directamente la unidad productiva. systemField farm.name.',
  },
  {
    instrumentCode: 'S13',
    questionText: 'Latitud GPS',
    reason: 'Coordenada exacta de la finca. systemField farm.latitude.',
  },
  {
    instrumentCode: 'S13',
    questionText: 'Longitud GPS',
    reason: 'Coordenada exacta de la finca. systemField farm.longitude.',
  },
];

/** Enunciados que, por su redacción, señalan una pregunta identificante
 * incluso si no está (todavía) en `PII_QUESTION_DENYLIST` — red de
 * seguridad para preguntas nuevas que un instrumento futuro agregue con la
 * misma semántica pero texto ligeramente distinto. Deliberadamente NO
 * incluye "latitud"/"longitud" sueltos: colisionan con mediciones
 * morfológicas reales (S3B: "Longitud de la hoja (cm)") y de residuos (S6A/
 * S6D: "longitud promedio de la fibra") que no son identificantes.
 */
const IDENTIFYING_TEXT_PATTERNS: RegExp[] = [
  /nombre completo/i,
  /c[eé]dula/i,
  /n[uú]mero de documento/i,
  /documento de identidad/i,
  /correo electr[oó]nico/i,
  /n[uú]mero de celular/i,
  /nombre de la finca/i,
  /^vereda/i,
  /vereda\s*\/\s*sector/i,
  /^latitud gps$/i,
  /^longitud gps$/i,
  /^coordenadas? gps$/i,
];

/** true si el enunciado de una pregunta, por su texto, es identificante. */
export function isIdentifyingQuestionText(questionText: string): boolean {
  return IDENTIFYING_TEXT_PATTERNS.some((pattern) =>
    pattern.test(questionText),
  );
}

/**
 * Umbral mínimo de encuestas para no suprimir una respuesta completa
 * (spec 30). Aplica sobre `totalCount`/`answeredCount`.
 */
export const MIN_SAMPLE_THRESHOLD = 5;

/**
 * Umbral mínimo por **celda** dentro de un desglose (spec 66, D2): una
 * opción de selección, un nivel de Likert, un bucket. Igual al umbral
 * global por decisión explícita del usuario (2026-08-05) — mismo criterio
 * de k-anonimato en todo el dashboard. Confirmado con datos reales de
 * desarrollo que sin este umbral una celda de 1 respondiente puede quedar
 * expuesta aunque `totalCount`/`answeredCount` superen `MIN_SAMPLE_THRESHOLD`
 * (ej. `categoryId=C1&cropId=Cacao`: total 5, "Perfil del productor"
 * → [2, 2, 1]).
 */
export const MIN_CELL_SIZE = 5;

export interface SuppressibleCell {
  count: number | null;
  percentage: number | null;
  suppressed: boolean;
}

/**
 * Aplica el umbral de celda a un conteo agregado. Nunca devuelve un `0`
 * disfrazado de dato real: una celda suprimida vuelve `count`/`percentage`
 * `null` y `suppressed: true`, para que el frontend la represente
 * explícitamente en vez de omitirla en silencio (criterio de aceptación 3,
 * spec 66).
 */
export function suppressCell(
  count: number,
  percentage: number,
): SuppressibleCell {
  if (count < MIN_CELL_SIZE) {
    return { count: null, percentage: null, suppressed: true };
  }
  return { count, percentage, suppressed: false };
}
