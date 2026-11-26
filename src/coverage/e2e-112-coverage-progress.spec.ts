/**
 * Spec 112 — avance de cobertura: contadores por celda y agregación pura.
 * `spec/112_avance_cobertura_unidades_productivas.md`, "Reglas de negocio".
 *
 * ESTAS PRUEBAS NACEN EN ROJO (enfoque test-first): `CoverageCell` aún no trae
 * `possible`, `done` ni `cropUnits`, y `coverage-progress` no existe. Los módulos
 * se cargan con `require` dinámico para que el archivo compile y cada caso falle
 * en runtime nombrando lo que falta.
 *
 * Criterios cubiertos: C01–C08, C10 y C11. La tabla `AGGREGATION_CASES` es la
 * misma que usa `frontend/lib/production-units/e2e-112-progress.test.ts`: las dos
 * copias de la agregación deben dar los mismos números. Si se cambia aquí, se
 * cambia allá.
 */

type ScopeLevel = 'farmer' | 'farm' | 'farm_crop';
type CoverageStatus = 'aplicado' | 'parcial' | 'falta' | 'no_aplica';

interface ScopedInstrument {
  instrumentId: string;
  scopeLevel: ScopeLevel;
  cropIds: string[];
  coverageGroup?: string | null;
  isActive: boolean;
}

interface FarmInput {
  farmId: string;
  farmerIds: string[];
  farmCrops: { farmCropId: string; cropId: string }[];
}

interface SurveyInput {
  surveyId: string;
  instrumentId: string;
  farmerId: string | null;
  farmId: string | null;
  farmCropId: string | null;
  sincronized: boolean;
  origin: 'field' | 'public';
  reviewStatus: string | null;
  responseCount: number;
  createdAt: string;
}

interface CropUnit {
  farmCropId: string;
  cropId: string;
  covered: boolean;
}

interface CoverageCell {
  status: CoverageStatus;
  possible?: number;
  done?: number;
  cropUnits?: CropUnit[];
  coveredFarmers?: number;
  totalFarmers?: number;
  outOfScope?: boolean;
  inferredFarm?: boolean;
  inferredCrop?: boolean;
}

interface Progress {
  done: number;
  possible: number;
  /** 0–1; `null` si `possible = 0`. */
  percent: number | null;
}

interface ProgressRow {
  farmId: string;
  coverage: Record<string, CoverageCell>;
}

interface ProgressSummary {
  global: Progress;
  byColumn: Record<string, Progress>;
  byRow: Record<string, Progress>;
}

interface CalculatorModule {
  computeFarmCoverage(
    farm: FarmInput,
    instrument: ScopedInstrument,
    surveys: SurveyInput[],
    allInstruments: ScopedInstrument[],
    farmerFarmCounts: Record<string, number>,
  ): CoverageCell;
}

interface ProgressModule {
  summarizeProgress(
    rows: ProgressRow[],
    columnIds: string[],
    options?: { cropIds?: string[] },
  ): ProgressSummary;
}

function load<T>(path: string): T {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require(path) as T;
}
const calculator = () => load<CalculatorModule>('./coverage-calculator');
const progress = () => load<ProgressModule>('./coverage-progress');

const CAFE = 'crop-cafe';
const CACAO = 'crop-cacao';

const instrument = (
  over: Partial<ScopedInstrument> = {},
): ScopedInstrument => ({
  instrumentId: 'i-1',
  scopeLevel: 'farm',
  cropIds: [],
  coverageGroup: null,
  isActive: true,
  ...over,
});

const farm = (over: Partial<FarmInput> = {}): FarmInput => ({
  farmId: 'farm-1',
  farmerIds: ['farmer-1'],
  farmCrops: [{ farmCropId: 'fc-cafe', cropId: CAFE }],
  ...over,
});

const MIXED = farm({
  farmCrops: [
    { farmCropId: 'fc-cafe', cropId: CAFE },
    { farmCropId: 'fc-cacao', cropId: CACAO },
  ],
});

const survey = (over: Partial<SurveyInput> = {}): SurveyInput => ({
  surveyId: 's-1',
  instrumentId: 'i-1',
  farmerId: 'farmer-1',
  farmId: 'farm-1',
  farmCropId: 'fc-cafe',
  sincronized: true,
  origin: 'field',
  reviewStatus: null,
  responseCount: 3,
  createdAt: '2026-10-01T00:00:00Z',
  ...over,
});

const COUNTS = { 'farmer-1': 1, 'farmer-2': 1 };

function compute(
  f: FarmInput,
  i: ScopedInstrument,
  surveys: SurveyInput[],
  all: ScopedInstrument[] = [i],
): CoverageCell {
  return calculator().computeFarmCoverage(f, i, surveys, all, COUNTS);
}

function expectCounts(cell: CoverageCell, done: number, possible: number) {
  expect(cell.possible).toBe(possible);
  expect(cell.done).toBe(done);
  expect(cell.done!).toBeLessThanOrEqual(cell.possible!);
}

/** Tabla compartida con el frontend (ver encabezado). */
export const AGGREGATION_CASES: {
  name: string;
  rows: ProgressRow[];
  columns: string[];
  cropIds?: string[];
  expected: ProgressSummary;
}[] = [
  {
    name: 'suma contadores, no promedia porcentajes; no_aplica se omite',
    columns: ['reg', 'cult'],
    rows: [
      {
        farmId: 'a',
        coverage: {
          reg: { status: 'aplicado', possible: 1, done: 1 },
          cult: {
            status: 'parcial',
            possible: 2,
            done: 1,
            cropUnits: [
              { farmCropId: 'a-cafe', cropId: CAFE, covered: true },
              { farmCropId: 'a-cacao', cropId: CACAO, covered: false },
            ],
          },
        },
      },
      {
        farmId: 'b',
        coverage: {
          reg: { status: 'falta', possible: 2, done: 0 },
          cult: { status: 'no_aplica', possible: 0, done: 0, cropUnits: [] },
        },
      },
    ],
    expected: {
      global: { done: 2, possible: 5, percent: 0.4 },
      byColumn: {
        reg: { done: 1, possible: 3, percent: 1 / 3 },
        cult: { done: 1, possible: 2, percent: 0.5 },
      },
      byRow: {
        a: { done: 2, possible: 3, percent: 2 / 3 },
        b: { done: 0, possible: 2, percent: 0 },
      },
    },
  },
  {
    name: 'filtro de cultivo: farm_crop cuenta solo los cultivos filtrados',
    columns: ['reg', 'cult'],
    cropIds: [CACAO],
    rows: [
      {
        farmId: 'a',
        coverage: {
          reg: { status: 'aplicado', possible: 1, done: 1 },
          cult: {
            status: 'parcial',
            possible: 2,
            done: 1,
            cropUnits: [
              { farmCropId: 'a-cafe', cropId: CAFE, covered: true },
              { farmCropId: 'a-cacao', cropId: CACAO, covered: false },
            ],
          },
        },
      },
    ],
    expected: {
      global: { done: 1, possible: 2, percent: 0.5 },
      byColumn: {
        reg: { done: 1, possible: 1, percent: 1 },
        cult: { done: 0, possible: 1, percent: 0 },
      },
      byRow: { a: { done: 1, possible: 2, percent: 0.5 } },
    },
  },
  {
    name: 'sin posibles: percent null, nunca 0 ni 1',
    columns: ['cult'],
    rows: [
      {
        farmId: 'a',
        coverage: {
          cult: { status: 'no_aplica', possible: 0, done: 0, cropUnits: [] },
        },
      },
    ],
    expected: {
      global: { done: 0, possible: 0, percent: null },
      byColumn: { cult: { done: 0, possible: 0, percent: null } },
      byRow: { a: { done: 0, possible: 0, percent: null } },
    },
  },
];

describe('Spec 112 — contadores en CoverageCell', () => {
  it('C01 — no_aplica trae 0 de 0', () => {
    const cacao = instrument({ scopeLevel: 'farm_crop', cropIds: [CACAO] });
    expectCounts(compute(farm(), cacao, []), 0, 0);
  });

  it('C02 — café + cacao con instrumento de todos los cultivos aplicado solo en café: 1 de 2', () => {
    const cult = instrument({ scopeLevel: 'farm_crop', cropIds: [] });
    const cell = compute(MIXED, cult, [survey({ farmCropId: 'fc-cafe' })]);
    expect(cell.status).toBe('parcial');
    expectCounts(cell, 1, 2);
    expect(cell.cropUnits).toEqual(
      expect.arrayContaining([
        { farmCropId: 'fc-cafe', cropId: CAFE, covered: true },
        { farmCropId: 'fc-cacao', cropId: CACAO, covered: false },
      ]),
    );
  });

  it('C03 — dos productores y encuesta de uno solo: 1 de 2', () => {
    const reg = instrument({ scopeLevel: 'farmer' });
    const f = farm({ farmerIds: ['farmer-1', 'farmer-2'] });
    expectCounts(compute(f, reg, [survey({ farmerId: 'farmer-1' })]), 1, 2);
  });

  it('C03 — finca sin productor: 0 de 1', () => {
    const reg = instrument({ scopeLevel: 'farmer' });
    expectCounts(compute(farm({ farmerIds: [] }), reg, []), 0, 1);
  });

  it('C04 — instrumento farm: 1 posible por finca', () => {
    const f = instrument({ scopeLevel: 'farm' });
    expectCounts(compute(farm(), f, []), 0, 1);
    expectCounts(compute(farm(), f, [survey()]), 1, 1);
  });

  it('C05 — grupo de cobertura: dos miembros para la misma unidad cuentan 1', () => {
    const a = instrument({
      instrumentId: 'taller-a',
      scopeLevel: 'farmer',
      coverageGroup: 'TALLER',
    });
    const b = instrument({
      instrumentId: 'taller-b',
      scopeLevel: 'farmer',
      coverageGroup: 'TALLER',
    });
    const cell = compute(
      farm(),
      a,
      [
        survey({ surveyId: 's-a', instrumentId: 'taller-a' }),
        survey({ surveyId: 's-b', instrumentId: 'taller-b' }),
      ],
      [a, b],
    );
    expectCounts(cell, 1, 1);
  });

  it('C06 — encuesta fuera de alcance no suma: Aplicado* con done = 0', () => {
    const cacaoOnly = farm({
      farmCrops: [{ farmCropId: 'fc-cacao', cropId: CACAO }],
    });
    const forCacao = instrument({ scopeLevel: 'farm_crop', cropIds: [CACAO] });
    // Encuesta anclada a un cultivo de finca que no es aplicable.
    const cell = compute(cacaoOnly, forCacao, [
      survey({ farmCropId: 'fc-ajeno' }),
    ]);
    expect(cell.status).toBe('aplicado');
    expect(cell.outOfScope).toBe(true);
    expectCounts(cell, 0, 1);
  });

  it('C07 — cultivo inferido cuenta como realizado', () => {
    const cafe = instrument({ scopeLevel: 'farm_crop', cropIds: [CAFE] });
    const cell = compute(farm(), cafe, [survey({ farmCropId: null })]);
    expect(cell.inferredCrop).toBe(true);
    expectCounts(cell, 1, 1);
  });

  it('C07 — finca inferida cuenta como realizada', () => {
    const f = instrument({ scopeLevel: 'farm' });
    const cell = compute(farm(), f, [
      survey({ farmId: null, farmCropId: null }),
    ]);
    expect(cell.inferredFarm).toBe(true);
    expectCounts(cell, 1, 1);
  });

  it.each([
    ['no sincronizada', { sincronized: false }],
    ['vacía', { responseCount: 0 }],
    [
      'pública sin procesar',
      { origin: 'public' as const, reviewStatus: 'pending' },
    ],
  ])('C08 — encuesta %s no suma', (_label, over) => {
    const f = instrument({ scopeLevel: 'farm' });
    expectCounts(compute(farm(), f, [survey(over)]), 0, 1);
  });
});

describe('Spec 112 — summarizeProgress (C10, C11)', () => {
  it.each(AGGREGATION_CASES.map((c) => [c.name, c] as const))(
    '%s',
    (_name, c) => {
      const result = progress().summarizeProgress(c.rows, c.columns, {
        cropIds: c.cropIds,
      });
      expect(result.global.done).toBe(c.expected.global.done);
      expect(result.global.possible).toBe(c.expected.global.possible);
      const near = (a: number | null, b: number | null) =>
        a === null || b === null ? expect(a).toBe(b) : expect(a).toBeCloseTo(b);
      near(result.global.percent, c.expected.global.percent);
      for (const [id, p] of Object.entries(c.expected.byColumn)) {
        expect(result.byColumn[id].done).toBe(p.done);
        expect(result.byColumn[id].possible).toBe(p.possible);
        near(result.byColumn[id].percent, p.percent);
      }
      for (const [id, p] of Object.entries(c.expected.byRow)) {
        expect(result.byRow[id].done).toBe(p.done);
        expect(result.byRow[id].possible).toBe(p.possible);
        near(result.byRow[id].percent, p.percent);
      }
    },
  );
});
