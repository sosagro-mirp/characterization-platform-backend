import { DataSource } from 'typeorm';

/**
 * Spec 98, Anexo A — matriz de alcance por instrumento (aprobada 2026-10-30).
 *
 * Escribe SOLO donde `scope_level IS NULL`: correrla dos veces no cambia nada y
 * nunca pisa una edición hecha desde el panel. No toca preguntas ni respuestas.
 *
 * Instrumentos sin `code` (talleres) se identifican por nombre.
 */

type Level = 'farmer' | 'farm' | 'farm_crop';

interface MatrixEntry {
  /** `code` del instrumento, o `name` si no tiene. */
  key: { code: string } | { name: string };
  level: Level;
  /** Nombres de `types_of_crops`. Vacío o ausente = todos. */
  crops?: string[];
  group?: string;
}

const code = (c: string) => ({ code: c });

export const INSTRUMENT_SCOPE_MATRIX: MatrixEntry[] = [
  {
    key: { name: 'Talleres de co-creación — SosAgro 4.C' },
    level: 'farmer',
    group: 'TALLER',
  },
  {
    key: { name: 'Talleres de co-creación — SosAgro 4.C - Tablets' },
    level: 'farmer',
    group: 'TALLER',
  },
  { key: code('S_REG'), level: 'farmer', group: 'REGISTRO' },
  { key: code('S1a'), level: 'farmer', group: 'REGISTRO' },
  { key: code('S1b'), level: 'farmer', group: 'REGISTRO' },
  { key: code('S_AGRI'), level: 'farmer' },
  { key: code('S_FINCA'), level: 'farm' },
  { key: code('S6-GEN'), level: 'farm' },
  { key: code('S7-GEN'), level: 'farm' },
  { key: code('S_CULT'), level: 'farm_crop' },
  { key: code('S5'), level: 'farm_crop' },
  ...['S2.4', 'S3B', 'S4.1', 'S6A', 'S7A', 'S8A'].map(
    (c): MatrixEntry => ({
      key: code(c),
      level: 'farm_crop',
      crops: ['Cacao'],
    }),
  ),
  ...['S2.5', 'S4.2', 'S6B', 'S7B', 'S8B'].map(
    (c): MatrixEntry => ({ key: code(c), level: 'farm_crop', crops: ['Café'] }),
  ),
  ...['S2.6', 'S4.3', 'S6C', 'S8C'].map(
    (c): MatrixEntry => ({
      key: code(c),
      level: 'farm_crop',
      crops: ['Cannabis'],
    }),
  ),
  ...['S2.7', 'S4.4', 'S6D', 'S8D'].map(
    (c): MatrixEntry => ({
      key: code(c),
      level: 'farm_crop',
      crops: ['Cáñamo'],
    }),
  ),
  {
    key: code('S7C'),
    level: 'farm_crop',
    crops: ['Cannabis', 'Cáñamo'],
  },
];

export interface ApplyMatrixResult {
  /** Instrumentos a los que se les escribió alcance en esta corrida. */
  updated: number;
  /** Entradas de la matriz sin instrumento en esta base. */
  missing: string[];
}

export async function applyInstrumentScopeMatrix(
  ds: DataSource,
): Promise<ApplyMatrixResult> {
  const result: ApplyMatrixResult = { updated: 0, missing: [] };

  await ds.transaction(async (manager) => {
    for (const entry of INSTRUMENT_SCOPE_MATRIX) {
      const byCode = 'code' in entry.key;
      const value = 'code' in entry.key ? entry.key.code : entry.key.name;
      const rows: { instrument_id: string; scope_level: string | null }[] =
        await manager.query(
          `SELECT instrument_id, scope_level FROM instruments WHERE ${
            byCode ? 'code' : 'name'
          } = $1`,
          [value],
        );

      if (rows.length === 0) {
        result.missing.push(value);
        continue;
      }

      for (const row of rows) {
        if (row.scope_level !== null) continue;

        await manager.query(
          `UPDATE instruments SET scope_level = $2, coverage_group = $3
            WHERE instrument_id = $1 AND scope_level IS NULL`,
          [row.instrument_id, entry.level, entry.group ?? null],
        );
        if (entry.crops?.length) {
          const inserted: unknown[] = await manager.query(
            `INSERT INTO instruments_crops (instrument_id, crop_id)
             SELECT $1, crop_id FROM types_of_crops WHERE name = ANY($2::text[])
             ON CONFLICT DO NOTHING RETURNING crop_id`,
            [row.instrument_id, entry.crops],
          );
          // Un nombre de cultivo que no coincide dejaría el instrumento
          // aplicando a "todos los cultivos" sin avisar: se aborta todo.
          if (inserted.length !== entry.crops.length) {
            throw new Error(
              `${value}: se esperaban ${entry.crops.length} cultivos (${entry.crops.join(', ')}) y se vincularon ${inserted.length}`,
            );
          }
        }
        result.updated += 1;
      }
    }
  });

  return result;
}
