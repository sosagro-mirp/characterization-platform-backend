/**
 * Spec 112 — agregación pura del avance de cobertura. Suma contadores
 * (`done`/`possible`), nunca promedia porcentajes. Gemela de
 * `frontend/lib/production-units/progress.ts`: ambas se prueban con la misma
 * tabla de casos.
 */
import type { CoverageCell } from './coverage-calculator';

export interface Progress {
  done: number;
  possible: number;
  /** 0–1; `null` si no hay posibles. */
  percent: number | null;
}

export interface ProgressRow {
  farmId: string;
  coverage: Record<string, CoverageCell>;
}

export interface ProgressSummary {
  global: Progress;
  byColumn: Record<string, Progress>;
  byRow: Record<string, Progress>;
}

export function toProgress(done: number, possible: number): Progress {
  return { done, possible, percent: possible > 0 ? done / possible : null };
}

/** Contadores de una celda; con `cropIds`, `farm_crop` cuenta solo esos cultivos. */
export function cellCounts(
  cell: CoverageCell | undefined,
  cropIds?: string[],
): { done: number; possible: number } {
  if (!cell || cell.status === 'no_aplica') return { done: 0, possible: 0 };
  if (cropIds?.length && cell.cropUnits) {
    const units = cell.cropUnits.filter((u) => cropIds.includes(u.cropId));
    return {
      possible: units.length,
      done: units.filter((u) => u.covered).length,
    };
  }
  return { done: cell.done ?? 0, possible: cell.possible ?? 0 };
}

export function summarizeProgress(
  rows: ProgressRow[],
  columnIds: string[],
  options: { cropIds?: string[] } = {},
): ProgressSummary {
  const col: Record<string, { done: number; possible: number }> = {};
  for (const id of columnIds) col[id] = { done: 0, possible: 0 };
  const byRow: Record<string, Progress> = {};
  let gd = 0;
  let gp = 0;
  for (const row of rows) {
    let rd = 0;
    let rp = 0;
    for (const id of columnIds) {
      const c = cellCounts(row.coverage[id], options.cropIds);
      col[id].done += c.done;
      col[id].possible += c.possible;
      rd += c.done;
      rp += c.possible;
    }
    byRow[row.farmId] = toProgress(rd, rp);
    gd += rd;
    gp += rp;
  }
  const byColumn: Record<string, Progress> = {};
  for (const id of columnIds)
    byColumn[id] = toProgress(col[id].done, col[id].possible);
  return { global: toProgress(gd, gp), byColumn, byRow };
}
