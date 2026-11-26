// Spec 112 — hojas `Cobertura` (con relleno y avance) y `Avance` del Excel.
import * as ExcelJS from 'exceljs';
import type { CoverageCell } from '../coverage/coverage-calculator';
import {
  cellCounts,
  summarizeProgress,
  toProgress,
  type ProgressSummary,
} from '../coverage/coverage-progress';
import { coverageFill, fixedAutoFilterSheets } from './export-cells';

export const STATUS_LABEL: Record<string, string> = {
  aplicado: 'Aplicado',
  parcial: 'Parcial',
  falta: 'Falta',
  no_aplica: 'No aplica',
};

export interface CoverageSheetsInput {
  columns: { instrumentId: string; label: string; scopeLevel: string }[];
  rows: {
    farmId: string;
    name: string;
    coverage: Record<string, CoverageCell>;
  }[];
  /** Cultivos filtrados en la vista: recortan el conteo de `farm_crop`. */
  cropIds?: string[];
}

/** Texto de una celda de cobertura (estado, detalle y marcas del spec 98). */
export function coverageLabel(cell: CoverageCell): string {
  const farmers =
    cell.totalFarmers && cell.totalFarmers > 1
      ? ` (${cell.coveredFarmers} de ${cell.totalFarmers})`
      : '';
  const crops =
    cell.status === 'parcial' && cell.cropUnits
      ? ` (${cell.done} de ${cell.possible})`
      : '';
  const marks =
    cell.outOfScope || cell.inferredCrop || cell.inferredFarm ? '*' : '';
  const repeated =
    cell.surveyCount && cell.surveyCount > 1
      ? ` [${cell.surveyCount} encuestas]`
      : '';
  return `${STATUS_LABEL[cell.status]}${farmers}${crops}${marks}${repeated}`;
}

function sheetWithHeader(wb: ExcelJS.Workbook, name: string, header: string[]) {
  const ws = wb.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 1 }] });
  ws.addRow(header).font = { bold: true };
  ws.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: header.length },
  };
  ws.columns.forEach((c) => (c.width = 22));
  return ws;
}

function fill(argb: string): ExcelJS.Fill {
  return { type: 'pattern', pattern: 'solid', fgColor: { argb } };
}

/** Agrega `Cobertura` y `Avance`; devuelve el avance para `Metadatos`. */
export function addCoverageSheets(
  wb: ExcelJS.Workbook,
  input: CoverageSheetsInput,
): ProgressSummary {
  const ids = input.columns.map((c) => c.instrumentId);
  const summary = summarizeProgress(input.rows, ids, {
    cropIds: input.cropIds,
  });

  const cobertura = sheetWithHeader(wb, 'Cobertura', [
    'Finca',
    ...input.columns.map((c) => c.label),
    'Realizadas',
    'Posibles',
    '% avance',
  ]);
  for (const row of input.rows) {
    const r = cobertura.addRow([
      row.name,
      ...input.columns.map((c) => coverageLabel(row.coverage[c.instrumentId])),
    ]);
    input.columns.forEach((c, i) => {
      r.getCell(i + 2).fill = fill(coverageFill(row.coverage[c.instrumentId]));
    });
    const p = summary.byRow[row.farmId];
    const base = input.columns.length + 2;
    r.getCell(base).value = p.done;
    r.getCell(base + 1).value = p.possible;
    const pct = r.getCell(base + 2);
    pct.value = p.percent;
    pct.numFmt = '0%';
  }

  const avance = sheetWithHeader(wb, 'Avance', [
    'Instrumento',
    'Nivel',
    'Realizadas',
    'Posibles',
    '% avance',
  ]);
  for (const c of input.columns) {
    const p = summary.byColumn[c.instrumentId];
    const r = avance.addRow([
      c.label,
      c.scopeLevel,
      p.done,
      p.possible,
      p.percent,
    ]);
    r.getCell(5).numFmt = '0%';
  }
  // Autofiltro definitivo: la fila Total queda fuera y no se ordena con los datos.
  avance.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: input.columns.length + 1, column: 5 },
  };
  fixedAutoFilterSheets.add(avance);
  const g = summary.global;
  const total = avance.addRow(['Total', null, g.done, g.possible, g.percent]);
  total.font = { bold: true };
  total.getCell(5).numFmt = '0%';
  return summary;
}

export { cellCounts, toProgress };
