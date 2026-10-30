// Spec 98 — celdas del Excel: helpers puros, probados sin base de datos.

export interface ResponseRow {
  survey_id: string;
  question_id: string;
  text_value: string | null;
  numeric_value: number | null;
  boolean_value: boolean | null;
  option_text: string | null;
  is_other: boolean | null;
}

/** Spec 42: número y unidad viajan en la misma fila (`numericValue` + `optionId`). */
export const NUMERIC_WITH_UNIT = 'numeric_with_unit';

/** Valor de la celda de una pregunta: números y fechas conservan su tipo. */
export function cellValue(
  q: { typeName: string },
  rows: ResponseRow[],
  attachments: number,
): string | number | Date | null {
  if (attachments > 0) return attachments;
  if (rows.length === 0) return null;
  // El número va en esta celda y la unidad en la columna contigua: si cayera
  // por la rama de opciones de abajo, la fila trae `option_text` (la unidad) y
  // la celda perdería el valor numérico.
  if (q.typeName === NUMERIC_WITH_UNIT) {
    // Respuestas históricas sin parsear conservan su texto (spec 42, D5).
    return rows[0].numeric_value ?? rows[0].text_value;
  }
  if (rows.length > 1 || rows[0].option_text !== null) {
    return rows
      .map((r) => {
        if (r.option_text === null) return r.text_value ?? '';
        return r.is_other && r.text_value
          ? `${r.option_text}: ${r.text_value}`
          : r.option_text;
      })
      .filter((v) => v !== '')
      .join('; ');
  }
  const r = rows[0];
  if (r.numeric_value !== null) return r.numeric_value;
  if (r.boolean_value !== null) return r.boolean_value ? 'Sí' : 'No';
  if (r.text_value !== null && /date/i.test(q.typeName)) {
    const d = new Date(r.text_value);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return r.text_value;
}

/** Unidad de una pregunta `numeric_with_unit`, para la columna contigua. */
export function unitCellValue(rows: ResponseRow[]): string | null {
  return rows.length === 0 ? null : rows[0].option_text;
}

/**
 * Encabezados de las preguntas: `numeric_with_unit` ocupa dos columnas, el
 * valor y su unidad. El orden debe coincidir con el de las celdas que arma
 * `addResponseSheets`.
 */
export function questionHeaders(qs: { text: string; typeName: string }[]) {
  return qs.flatMap((q) =>
    q.typeName === NUMERIC_WITH_UNIT
      ? [q.text, `${q.text} (unidad)`]
      : [q.text],
  );
}

/** Nombres de hoja: ≤31 caracteres, sin `[]:*?/\` y únicos. */
export function uniqueSheetName(base: string, used: Set<string>): string {
  // Un nombre largo conserva inicio y final: los instrumentos de una misma
  // familia comparten el prefijo y se distinguen por el final (spec 99, C10c).
  const safe = base.replace(/[[\]:*?/\\]/g, '-').trim();
  const clean =
    (safe.length > 28 ? `${safe.slice(0, 12)}…${safe.slice(-15)}` : safe) ||
    'Instrumento';
  let name = clean;
  for (let n = 2; used.has(name); n++) name = `${clean.slice(0, 26)}-${n}`;
  used.add(name);
  return name;
}

export function uniqueHeaders(headers: string[]): string[] {
  const seen = new Map<string, number>();
  return headers.map((h) => {
    const n = (seen.get(h) ?? 0) + 1;
    seen.set(h, n);
    return n === 1 ? h : `${h} (${n})`;
  });
}
