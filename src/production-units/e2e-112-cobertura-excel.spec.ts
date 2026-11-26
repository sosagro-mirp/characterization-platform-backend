/**
 * Spec 112 — hojas `Cobertura` y `Avance` del Excel de unidades productivas.
 * `spec/112_avance_cobertura_unidades_productivas.md`, sección "Excel".
 *
 * Lección del spec 98: se afirma sobre el ARTEFACTO, no sobre los helpers. Cada
 * caso arma el libro, lo escribe a un buffer y lo vuelve a abrir con ExcelJS
 * antes de afirmar rellenos, tipos, columnas y rango del autofiltro.
 *
 * ESTAS PRUEBAS NACEN EN ROJO: `coverage-sheets` y `coverageFill` no existen.
 * Contrato propuesto (la implementación lo respeta o ajusta este archivo con
 * aprobación):
 *   - `export-cells.ts` exporta `coverageFill(cell)` → ARGB del relleno.
 *   - `coverage-sheets.ts` exporta `addCoverageSheets(wb, input)`, que
 *     `ProductionUnitsExportService` usa para las hojas `Cobertura` y `Avance`.
 * Que el export real use estas hojas lo cubre
 * `test/e2e-112-avance-cobertura.e2e-spec.ts`.
 *
 * Criterios cubiertos: C12–C15.
 */
import * as ExcelJS from 'exceljs';
import { extendAutoFilters } from './production-units-export.service';

type CoverageStatus = 'aplicado' | 'parcial' | 'falta' | 'no_aplica';

interface Cell {
  status: CoverageStatus;
  possible: number;
  done: number;
  outOfScope?: boolean;
  coveredFarmers?: number;
  totalFarmers?: number;
  cropUnits?: { farmCropId: string; cropId: string; covered: boolean }[];
}

interface CoverageSheetsInput {
  columns: { instrumentId: string; label: string; scopeLevel: string }[];
  rows: { farmId: string; name: string; coverage: Record<string, Cell> }[];
  cropIds?: string[];
}

interface SheetsModule {
  addCoverageSheets(wb: ExcelJS.Workbook, input: CoverageSheetsInput): void;
}
interface CellsModule {
  coverageFill(cell: Cell): string | null;
}

function load<T>(path: string): T {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require(path) as T;
}

const GREEN = 'FFC6EFCE';
const RED = 'FFFFC7CE';
const YELLOW = 'FFFFEB9C';
const GREY = 'FFEDEDED';

const INPUT: CoverageSheetsInput = {
  columns: [
    { instrumentId: 'reg', label: 'REGISTRO', scopeLevel: 'farmer' },
    { instrumentId: 'finca', label: 'S_FINCA', scopeLevel: 'farm' },
    { instrumentId: 'cult', label: 'S_CULT', scopeLevel: 'farm_crop' },
    { instrumentId: 'cacao', label: 'S2.4', scopeLevel: 'farm_crop' },
  ],
  rows: [
    {
      farmId: 'a',
      name: 'Finca A',
      coverage: {
        reg: { status: 'aplicado', possible: 1, done: 1 },
        finca: { status: 'falta', possible: 1, done: 0 },
        cult: {
          status: 'parcial',
          possible: 2,
          done: 1,
          cropUnits: [
            { farmCropId: 'a1', cropId: 'cafe', covered: true },
            { farmCropId: 'a2', cropId: 'cacao', covered: false },
          ],
        },
        cacao: {
          status: 'aplicado',
          outOfScope: true,
          possible: 1,
          done: 0,
          cropUnits: [{ farmCropId: 'a2', cropId: 'cacao', covered: false }],
        },
      },
    },
    {
      farmId: 'b',
      name: 'Finca B',
      coverage: {
        reg: { status: 'aplicado', possible: 1, done: 1 },
        finca: { status: 'aplicado', possible: 1, done: 1 },
        cult: {
          status: 'aplicado',
          possible: 1,
          done: 1,
          cropUnits: [{ farmCropId: 'b1', cropId: 'cafe', covered: true }],
        },
        cacao: { status: 'no_aplica', possible: 0, done: 0, cropUnits: [] },
      },
    },
  ],
};

async function roundTrip(
  input: CoverageSheetsInput,
): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  load<SheetsModule>('./coverage-sheets').addCoverageSheets(wb, input);
  extendAutoFilters(wb);
  const buffer = await wb.xlsx.writeBuffer();
  const reopened = new ExcelJS.Workbook();
  await reopened.xlsx.load(buffer as ArrayBuffer);
  return reopened;
}

function headerIndex(ws: ExcelJS.Worksheet): Map<string, number> {
  const map = new Map<string, number>();
  ws.getRow(1).eachCell((cell, col) => map.set(cell.text, col));
  return map;
}

function fillOf(cell: ExcelJS.Cell): string | undefined {
  const fill = cell.fill as ExcelJS.FillPattern | undefined;
  return fill?.fgColor?.argb;
}

describe('Spec 112 — coverageFill', () => {
  it.each([
    [{ status: 'aplicado', possible: 1, done: 1 } as Cell, GREEN],
    [{ status: 'falta', possible: 1, done: 0 } as Cell, RED],
    [{ status: 'parcial', possible: 2, done: 1 } as Cell, YELLOW],
    [{ status: 'no_aplica', possible: 0, done: 0 } as Cell, GREY],
    [
      { status: 'aplicado', outOfScope: true, possible: 1, done: 0 } as Cell,
      YELLOW,
    ],
  ])('%o → %s', (cell, argb) => {
    expect(load<CellsModule>('./export-cells').coverageFill(cell)).toBe(argb);
  });
});

describe('Spec 112 — libro generado', () => {
  it('C12 — cada celda de instrumento de Cobertura lleva el relleno de su estado', async () => {
    const ws = (await roundTrip(INPUT)).getWorksheet('Cobertura')!;
    const h = headerIndex(ws);
    const a = ws.getRow(2);
    const b = ws.getRow(3);
    expect(fillOf(a.getCell(h.get('REGISTRO')!))).toBe(GREEN);
    expect(fillOf(a.getCell(h.get('S_FINCA')!))).toBe(RED);
    expect(fillOf(a.getCell(h.get('S_CULT')!))).toBe(YELLOW);
    expect(fillOf(a.getCell(h.get('S2.4')!))).toBe(YELLOW); // fuera de alcance, 0 de 1
    expect(fillOf(b.getCell(h.get('S2.4')!))).toBe(GREY);
    expect(a.getCell(h.get('S_CULT')!).text).toContain('1 de 2');
  });

  it('C13 — Realizadas, Posibles y % avance son números al final de Cobertura', async () => {
    const ws = (await roundTrip(INPUT)).getWorksheet('Cobertura')!;
    const header = (ws.getRow(1).values as unknown[]).slice(1).map(String);
    expect(header.slice(-3)).toEqual(['Realizadas', 'Posibles', '% avance']);
    const h = headerIndex(ws);
    const a = ws.getRow(2);
    // Finca A: 1 + 0 + 1 + 0 = 2 de 1 + 1 + 2 + 1 = 5.
    expect(a.getCell(h.get('Realizadas')!).value).toBe(2);
    expect(a.getCell(h.get('Posibles')!).value).toBe(5);
    expect(a.getCell(h.get('% avance')!).value).toBeCloseTo(0.4);
    expect(a.getCell(h.get('% avance')!).numFmt).toBe('0%');
    expect(typeof a.getCell(h.get('Realizadas')!).value).toBe('number');
  });

  it('C14 — hoja Avance: una fila por columna y Total fuera del autofiltro', async () => {
    const ws = (await roundTrip(INPUT)).getWorksheet('Avance')!;
    expect(ws).toBeDefined();
    const labels: string[] = [];
    ws.eachRow((row, i) => {
      if (i > 1) labels.push(row.getCell(1).text);
    });
    expect(labels).toEqual(['REGISTRO', 'S_FINCA', 'S_CULT', 'S2.4', 'Total']);
    const h = headerIndex(ws);
    const total = ws.getRow(ws.rowCount);
    // REGISTRO 2/2 + S_FINCA 1/2 + S_CULT 2/3 + S2.4 0/1 = 5 de 8.
    expect(total.getCell(h.get('Realizadas')!).value).toBe(5);
    expect(total.getCell(h.get('Posibles')!).value).toBe(8);
    const filter = ws.autoFilter as
      | { to: { row: number } }
      | string
      | undefined;
    if (filter && typeof filter !== 'string') {
      expect(filter.to.row).toBeLessThan(ws.rowCount);
    }
    // S2.4: solo cuenta la finca A (la B no aplica), 0 de 1.
    const s24 = ws.getRow(5);
    expect(s24.getCell(h.get('Posibles')!).value).toBe(1);
  });

  it('C11 — sin posibles el % queda vacío', async () => {
    const onlyNa: CoverageSheetsInput = {
      columns: [
        { instrumentId: 'cacao', label: 'S2.4', scopeLevel: 'farm_crop' },
      ],
      rows: [INPUT.rows[1]],
    };
    const ws = (await roundTrip(onlyNa)).getWorksheet('Cobertura')!;
    const h = headerIndex(ws);
    expect(ws.getRow(2).getCell(h.get('% avance')!).value).toBeNull();
  });

  it('C10 — con cropIds, farm_crop cuenta solo los cultivos filtrados', async () => {
    const ws = (await roundTrip({ ...INPUT, cropIds: ['cafe'] })).getWorksheet(
      'Cobertura',
    )!;
    const h = headerIndex(ws);
    // Finca A con solo café: reg 1/1, finca 0/1, cult 1/1, S2.4 0/0 → 2 de 3.
    expect(ws.getRow(2).getCell(h.get('Posibles')!).value).toBe(3);
    expect(ws.getRow(2).getCell(h.get('Realizadas')!).value).toBe(2);
  });

  it('C15 — el autofiltro de Cobertura llega hasta su última fila', async () => {
    const ws = (await roundTrip(INPUT)).getWorksheet('Cobertura')!;
    const filter = ws.autoFilter as { to: { row: number; column: number } };
    expect(filter.to.row).toBe(ws.rowCount);
    expect(filter.to.column).toBe(ws.getRow(1).cellCount);
  });
});
