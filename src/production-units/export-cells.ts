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

/** Valor de la celda de una pregunta: números y fechas conservan su tipo. */
export function cellValue(
  q: { typeName: string },
  rows: ResponseRow[],
  attachments: number,
): string | number | Date | null {
  if (attachments > 0) return attachments;
  if (rows.length === 0) return null;
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

/** Nombres de hoja: ≤31 caracteres, sin `[]:*?/\` y únicos. */
export function uniqueSheetName(base: string, used: Set<string>): string {
  const clean =
    base
      .replace(/[[\]:*?/\\]/g, '-')
      .slice(0, 28)
      .trim() || 'Instrumento';
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
