/**
 * Spec 97 (D-H4-11) — `farmers.document_type`: lista cerrada de códigos. El
 * instrumento guarda el texto de la opción elegida («Cédula de ciudadanía»);
 * aquí se resuelve al código que va a la columna.
 */
export const DOCUMENT_TYPES = [
  'CC',
  'TI',
  'CE',
  'PPT',
  'PEP',
  'NIT',
  'OTRO',
] as const;

export type DocumentType = (typeof DOCUMENT_TYPES)[number];

const TEXT_TO_CODE: [RegExp, DocumentType][] = [
  [/tarjeta de identidad/, 'TI'],
  [/cedula de extranjeria/, 'CE'],
  [/cedula de ciudadania|cedula/, 'CC'],
  [/proteccion temporal/, 'PPT'],
  [/permanencia/, 'PEP'],
  [/\bnit\b|tributaria/, 'NIT'],
  [/\botro\b/, 'OTRO'],
];

/** Código del tipo de documento a partir del código mismo o del texto de la opción; `null` si no se reconoce. */
export function resolveDocumentType(value: unknown): DocumentType | null {
  if (typeof value !== 'string') return null;
  const text = value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  if (!text) return null;
  const code = text.toUpperCase();
  if ((DOCUMENT_TYPES as readonly string[]).includes(code)) {
    return code as DocumentType;
  }
  return TEXT_TO_CODE.find(([pattern]) => pattern.test(text))?.[1] ?? null;
}
