/**
 * Spec 100 — cobertura de instrumentos por productor: función pura.
 * `spec/100_cobertura_por_productor.md`, "Reglas de `computeFarmerCoverage`" y
 * criterios de aceptación C1–C10.
 *
 * ESTAS PRUEBAS NACEN EN ROJO (enfoque test-first): `farmer-coverage-calculator`
 * no existe todavía. Se carga con `require` dinámico para que el archivo compile
 * y cada caso falle en runtime nombrando el módulo esperado.
 *
 * Contrato que asume esta prueba (la implementación debe respetarlo o ajustar
 * este archivo, con aprobación, si cambia):
 *
 *   // src/coverage/farmer-coverage-calculator.ts
 *   export function computeFarmerCoverage(
 *     input: FarmerCoverageInput,
 *   ): FarmerCoverageResult;
 *
 * - La entrada reutiliza los tipos reales del 98: `FarmInput`, `SurveyInput` y
 *   `ScopedInstrument` de `coverage-calculator.ts`, y `CoverageColumn` de
 *   `production-units.service.ts`. Es lo que el cargador compartido
 *   (`coverage-data.loader.ts`) ya tiene en `LoadedData`: `columns`, `scoped`,
 *   `surveys` (una entrada por encuesta × instrumento), `farmerFarmCounts` y
 *   `withoutScope`.
 * - `farms[].farm.farmerIds` lleva TODOS los productores de la finca (no solo
 *   este), para que las encuestas de otro productor sobre una finca compartida
 *   cubran los instrumentos `farm` / `farm_crop` (DP1).
 * - Las columnas (`columns`) ya vienen derivadas por el cargador: un instrumento
 *   inactivo de un grupo no tiene columna pero está en `scoped`; los
 *   instrumentos sin alcance solo llegan como el conteo `withoutScope`.
 * - `summary` cuenta instrumentos (columnas), no unidades; se asume
 *   `applicable = applied + partial + pending`.
 * - `computedAt` es opcional en la entrada (para pruebas deterministas); si
 *   falta, la función usa la fecha actual.
 */

import type {
  CoverageStatus,
  FarmInput,
  ScopedInstrument,
  SurveyInput,
} from './coverage-calculator';
import type { CoverageColumn } from '../production-units/production-units.service';

interface FarmerFarmInput {
  /** Entrada del 98: `farmerIds` incluye a todos los productores de la finca. */
  farm: FarmInput;
  name: string;
  role: string | null;
  isPrimary: boolean;
  town: { townId: string; name: string } | null;
  crops: { farmCropId: string; cropId: string; name: string }[];
}

interface FarmerCoverageInput {
  farmerId: string;
  name: string;
  /** Fincas vinculadas en `farmer_farms`, todos los roles (DP2). */
  farms: FarmerFarmInput[];
  columns: CoverageColumn[];
  /** Todos los instrumentos con alcance, activos o no (para grupos). */
  scoped: ScopedInstrument[];
  surveys: SurveyInput[];
  farmerFarmCounts: Record<string, number>;
  /** Instrumentos activos sin `scope_level`. */
  withoutScope: number;
  computedAt?: string;
}

interface CoverageUnit {
  unitType: 'farmer' | 'farm' | 'farm_crop';
  farmId?: string;
  farmCropId?: string;
  label: string;
  status: CoverageStatus;
  surveyId: string | null;
  surveyCount: number;
  inferredFarm?: boolean;
  inferredCrop?: boolean;
  outOfScope?: boolean;
  coveredByOtherFarmer?: boolean;
}

interface FarmerInstrumentCoverage {
  instrumentId: string;
  name: string;
  code: string | null;
  scopeLevel: ScopedInstrument['scopeLevel'];
  coverageGroup: string | null;
  memberIds: string[];
  status: CoverageStatus;
  surveyCount: number;
  latestSurvey: {
    surveyId: string;
    instrumentId: string;
    createdAt: string;
    origin: 'field' | 'public';
    farmId: string | null;
    farmCropId: string | null;
    farmerId: string | null;
  } | null;
  units: CoverageUnit[];
}

interface FarmerCoverageResult {
  farmerId: string;
  name: string;
  computedAt: string;
  summary: {
    applicable: number;
    applied: number;
    partial: number;
    pending: number;
    notApplicable: number;
    instrumentsWithoutScope: number;
  };
  farms: {
    farmId: string;
    name: string;
    role: string | null;
    isPrimary: boolean;
    town: { townId: string; name: string } | null;
    crops: { farmCropId: string; cropId: string; name: string }[];
  }[];
  instruments: FarmerInstrumentCoverage[];
  warnings: ('sin_finca' | 'sin_cultivo' | 'encuestas_sin_ubicar')[];
  unlocatedSurveys: { surveyId: string; reason: string }[];
  unsyncedWithResponses: number;
}

interface FarmerCoverageCalculatorModule {
  computeFarmerCoverage(input: FarmerCoverageInput): FarmerCoverageResult;
}

function loadCalculator(): FarmerCoverageCalculatorModule {
  const modulePath = './farmer-coverage-calculator';
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require(modulePath) as FarmerCoverageCalculatorModule;
}

const ME = 'farmer-1';
const OTHER = 'farmer-2';
const CAFE = 'crop-cafe';
const CACAO = 'crop-cacao';

function scoped(over: Partial<ScopedInstrument> = {}): ScopedInstrument {
  return {
    instrumentId: 'i-1',
    scopeLevel: 'farm',
    cropIds: [],
    coverageGroup: null,
    isActive: true,
    ...over,
  };
}

/** Columna del cargador para un instrumento con alcance. */
function column(i: ScopedInstrument, memberIds?: string[]): CoverageColumn {
  return {
    instrumentId: i.instrumentId,
    name: `Instrumento ${i.instrumentId}`,
    code: null,
    scopeLevel: i.scopeLevel,
    cropIds: i.cropIds,
    coverageGroup: i.coverageGroup ?? null,
    memberIds: memberIds ?? [i.instrumentId],
  };
}

function link(
  farmId: string,
  over: Partial<FarmInput> = {},
  extra: Partial<Omit<FarmerFarmInput, 'farm'>> = {},
): FarmerFarmInput {
  const farmCrops = over.farmCrops ?? [
    { farmCropId: `${farmId}-cafe`, cropId: CAFE },
  ];
  return {
    farm: { farmId, farmerIds: [ME], ...over, farmCrops },
    name: `Finca ${farmId}`,
    role: 'owner',
    isPrimary: true,
    town: null,
    crops: farmCrops.map((fc) => ({ ...fc, name: fc.cropId })),
    ...extra,
  };
}

function survey(over: Partial<SurveyInput> = {}): SurveyInput {
  return {
    surveyId: 's-1',
    instrumentId: 'i-1',
    farmerId: ME,
    farmId: 'farm-1',
    farmCropId: null,
    sincronized: true,
    origin: 'field',
    reviewStatus: null,
    responseCount: 3,
    createdAt: '2026-10-01T00:00:00Z',
    ...over,
  };
}

interface Scenario {
  farms?: FarmerFarmInput[];
  instruments?: ScopedInstrument[];
  columns?: CoverageColumn[];
  surveys?: SurveyInput[];
  counts?: Record<string, number>;
  withoutScope?: number;
}

function compute(s: Scenario = {}): FarmerCoverageResult {
  const farms = s.farms ?? [link('farm-1')];
  const instruments = s.instruments ?? [scoped()];
  const counts: Record<string, number> = s.counts ?? {};
  if (!s.counts) {
    for (const f of farms) {
      for (const id of f.farm.farmerIds) counts[id] = (counts[id] ?? 0) + 1;
    }
  }
  return loadCalculator().computeFarmerCoverage({
    farmerId: ME,
    name: 'Productor de prueba',
    farms,
    columns: s.columns ?? instruments.map((i) => column(i)),
    scoped: instruments,
    surveys: s.surveys ?? [],
    farmerFarmCounts: counts,
    withoutScope: s.withoutScope ?? 0,
    computedAt: '2026-11-06T00:00:00Z',
  });
}

function instrumentOf(
  result: FarmerCoverageResult,
  instrumentId = 'i-1',
): FarmerInstrumentCoverage {
  const found = result.instruments.find((i) => i.instrumentId === instrumentId);
  if (!found) throw new Error(`Sin columna para ${instrumentId}`);
  return found;
}

describe('Spec 100 — farmer-coverage-calculator', () => {
  describe('C1 — instrumento farmer: aplicado con encuesta propia, falta sin ella', () => {
    const farmerScope = scoped({ scopeLevel: 'farmer' });

    it('aplicado con una encuesta contable del grupo con su farmerId', () => {
      const result = compute({
        instruments: [farmerScope],
        surveys: [survey({ farmId: null })],
      });
      const cov = instrumentOf(result);
      expect(cov.status).toBe('aplicado');
      expect(cov.units).toHaveLength(1);
      expect(cov.units[0]).toMatchObject({
        unitType: 'farmer',
        status: 'aplicado',
        surveyId: 's-1',
      });
    });

    it('falta sin encuestas', () => {
      const cov = instrumentOf(compute({ instruments: [farmerScope] }));
      expect(cov.status).toBe('falta');
      expect(cov.surveyCount).toBe(0);
      expect(cov.latestSurvey).toBeNull();
    });
  });

  describe('C2 — instrumento farmer en finca compartida', () => {
    it('la encuesta de otro productor de la misma finca no cubre a este', () => {
      const result = compute({
        farms: [link('farm-1', { farmerIds: [ME, OTHER] })],
        instruments: [scoped({ scopeLevel: 'farmer' })],
        surveys: [survey({ farmerId: OTHER })],
      });
      expect(instrumentOf(result).status).toBe('falta');
    });
  });

  describe('C3 — instrumento farm con dos fincas, una cubierta', () => {
    it('sale parcial con las dos unidades detalladas', () => {
      const result = compute({
        farms: [link('farm-1'), link('farm-2', {}, { isPrimary: false })],
        surveys: [survey({ farmId: 'farm-1' })],
      });
      const cov = instrumentOf(result);
      expect(cov.status).toBe('parcial');
      expect(cov.units).toHaveLength(2);
      const byFarm: Record<string, CoverageStatus> = {};
      for (const u of cov.units) byFarm[u.farmId ?? ''] = u.status;
      expect(byFarm).toEqual({ 'farm-1': 'aplicado', 'farm-2': 'falta' });
      expect(cov.units.every((u) => u.unitType === 'farm')).toBe(true);
    });

    it('todas cubiertas: aplicado; ninguna: falta', () => {
      const farms = [link('farm-1'), link('farm-2')];
      const all = compute({
        farms,
        surveys: [
          survey({ farmId: 'farm-1' }),
          survey({ surveyId: 's-2', farmId: 'farm-2' }),
        ],
      });
      expect(instrumentOf(all).status).toBe('aplicado');
      expect(instrumentOf(compute({ farms })).status).toBe('falta');
    });

    it('summary cuenta instrumentos, no unidades', () => {
      const a = scoped({ instrumentId: 'a' });
      const b = scoped({ instrumentId: 'b' });
      const c = scoped({ instrumentId: 'c', scopeLevel: 'farmer' });
      const d = scoped({
        instrumentId: 'd',
        scopeLevel: 'farm_crop',
        cropIds: [CACAO],
      });
      const result = compute({
        farms: [link('farm-1'), link('farm-2')],
        instruments: [a, b, c, d],
        surveys: [
          survey({ instrumentId: 'a', farmId: 'farm-1' }),
          survey({ surveyId: 's-2', instrumentId: 'a', farmId: 'farm-2' }),
          survey({ surveyId: 's-3', instrumentId: 'b', farmId: 'farm-1' }),
        ],
        withoutScope: 2,
      });
      expect(result.summary).toEqual({
        applicable: 3,
        applied: 1,
        partial: 1,
        pending: 1,
        notApplicable: 1,
        instrumentsWithoutScope: 2,
      });
    });
  });

  describe('C4 — instrumento farm cubierto por otro productor de la finca', () => {
    it('la cubre y marca coveredByOtherFarmer', () => {
      const result = compute({
        farms: [link('farm-1', { farmerIds: [ME, OTHER] })],
        surveys: [survey({ farmerId: OTHER })],
      });
      const cov = instrumentOf(result);
      expect(cov.status).toBe('aplicado');
      expect(cov.units[0]).toMatchObject({
        farmId: 'farm-1',
        status: 'aplicado',
        coveredByOtherFarmer: true,
      });
    });

    it('con encuesta propia no marca coveredByOtherFarmer', () => {
      const result = compute({
        farms: [link('farm-1', { farmerIds: [ME, OTHER] })],
        surveys: [survey()],
      });
      expect(instrumentOf(result).units[0].coveredByOtherFarmer).toBeFalsy();
    });
  });

  describe('C5 — instrumento farm_crop agregado sobre todas las fincas', () => {
    const allCrops = scoped({ scopeLevel: 'farm_crop' });
    const twoFarms = () => [
      link('farm-1', {
        farmCrops: [{ farmCropId: 'fc-1-cafe', cropId: CAFE }],
      }),
      link('farm-2', {
        farmCrops: [
          { farmCropId: 'fc-2-cafe', cropId: CAFE },
          { farmCropId: 'fc-2-cacao', cropId: CACAO },
        ],
      }),
    ];

    it('aplicado solo si todos los cultivos aplicables de todas las fincas están cubiertos', () => {
      const result = compute({
        farms: twoFarms(),
        instruments: [allCrops],
        surveys: [
          survey({ farmId: 'farm-1', farmCropId: 'fc-1-cafe' }),
          survey({
            surveyId: 's-2',
            farmId: 'farm-2',
            farmCropId: 'fc-2-cafe',
          }),
          survey({
            surveyId: 's-3',
            farmId: 'farm-2',
            farmCropId: 'fc-2-cacao',
          }),
        ],
      });
      const cov = instrumentOf(result);
      expect(cov.status).toBe('aplicado');
      expect(cov.units).toHaveLength(3);
      expect(cov.units.every((u) => u.unitType === 'farm_crop')).toBe(true);
    });

    it('parcial si alguno está cubierto', () => {
      const result = compute({
        farms: twoFarms(),
        instruments: [allCrops],
        surveys: [survey({ farmId: 'farm-1', farmCropId: 'fc-1-cafe' })],
      });
      const cov = instrumentOf(result);
      expect(cov.status).toBe('parcial');
      const fc1 = cov.units.find((u) => u.farmCropId === 'fc-1-cafe');
      const fc2 = cov.units.find((u) => u.farmCropId === 'fc-2-cacao');
      expect(fc1?.status).toBe('aplicado');
      expect(fc2?.status).toBe('falta');
    });

    it('falta si ninguno está cubierto', () => {
      const result = compute({ farms: twoFarms(), instruments: [allCrops] });
      expect(instrumentOf(result).status).toBe('falta');
    });

    it('una finca sin cultivos aplicables no impide el aplicado de la otra', () => {
      const cacaoOnly = scoped({ scopeLevel: 'farm_crop', cropIds: [CACAO] });
      const result = compute({
        farms: twoFarms(),
        instruments: [cacaoOnly],
        surveys: [survey({ farmId: 'farm-2', farmCropId: 'fc-2-cacao' })],
      });
      expect(instrumentOf(result).status).toBe('aplicado');
    });

    it('no aplica si ninguna finca tiene cultivos aplicables', () => {
      const cannabis = scoped({
        scopeLevel: 'farm_crop',
        cropIds: ['crop-cannabis'],
      });
      const result = compute({ farms: twoFarms(), instruments: [cannabis] });
      expect(instrumentOf(result).status).toBe('no_aplica');
    });
  });

  describe('C6 — productor sin fincas', () => {
    it('farm y farm_crop salen no aplica, con aviso sin_finca', () => {
      const farm = scoped({ instrumentId: 'f' });
      const crop = scoped({ instrumentId: 'fc', scopeLevel: 'farm_crop' });
      const result = compute({
        farms: [],
        instruments: [farm, crop],
        counts: {},
      });
      expect(instrumentOf(result, 'f').status).toBe('no_aplica');
      expect(instrumentOf(result, 'fc').status).toBe('no_aplica');
      expect(result.warnings).toContain('sin_finca');
      expect(result.farms).toEqual([]);
    });

    it('los instrumentos farmer siguen evaluándose', () => {
      const result = compute({
        farms: [],
        instruments: [scoped({ scopeLevel: 'farmer' })],
        surveys: [survey({ farmId: null })],
        counts: {},
      });
      expect(instrumentOf(result).status).toBe('aplicado');
    });
  });

  describe('C7 — encuestas que no cuentan como aplicado', () => {
    it.each([
      ['no sincronizada', { sincronized: false }],
      ['sin respuestas', { responseCount: 0 }],
      ['pública pendiente', { origin: 'public', reviewStatus: 'pending' }],
      ['pública descartada', { origin: 'public', reviewStatus: 'discarded' }],
    ])('%s', (_name, over) => {
      const s = survey(over as Partial<SurveyInput>);
      for (const scopeLevel of ['farmer', 'farm'] as const) {
        const result = compute({
          instruments: [scoped({ scopeLevel })],
          surveys: [s],
        });
        expect(instrumentOf(result).status).toBe('falta');
        expect(instrumentOf(result).surveyCount).toBe(0);
      }
    });

    it('pública procesada sí cuenta', () => {
      const result = compute({
        surveys: [survey({ origin: 'public', reviewStatus: 'processed' })],
      });
      expect(instrumentOf(result).status).toBe('aplicado');
    });

    it('una no sincronizada con respuestas se informa en unsyncedWithResponses', () => {
      const result = compute({
        surveys: [survey({ sincronized: false, responseCount: 2 })],
      });
      expect(result.unsyncedWithResponses).toBe(1);
    });
  });

  describe('C8 — varias encuestas', () => {
    it('latestSurvey es la más reciente y surveyCount las cuenta todas', () => {
      const result = compute({
        surveys: [
          survey({ surveyId: 'vieja', createdAt: '2026-01-01T00:00:00Z' }),
          survey({ surveyId: 'nueva', createdAt: '2026-09-01T00:00:00Z' }),
          survey({ surveyId: 'media', createdAt: '2026-05-01T00:00:00Z' }),
        ],
      });
      const cov = instrumentOf(result);
      expect(cov.surveyCount).toBe(3);
      expect(cov.latestSurvey).toMatchObject({
        surveyId: 'nueva',
        instrumentId: 'i-1',
        createdAt: '2026-09-01T00:00:00Z',
        origin: 'field',
        farmId: 'farm-1',
        farmerId: ME,
      });
    });

    it('en farm con dos fincas, latestSurvey es la más reciente de todas', () => {
      const result = compute({
        farms: [link('farm-1'), link('farm-2')],
        surveys: [
          survey({
            surveyId: 'f1',
            farmId: 'farm-1',
            createdAt: '2026-03-01T00:00:00Z',
          }),
          survey({
            surveyId: 'f2',
            farmId: 'farm-2',
            createdAt: '2026-08-01T00:00:00Z',
          }),
        ],
      });
      const cov = instrumentOf(result);
      expect(cov.surveyCount).toBe(2);
      expect(cov.latestSurvey?.surveyId).toBe('f2');
    });
  });

  describe('C9 — grupos, inactivos e instrumentos sin alcance', () => {
    it('un inactivo del grupo cuenta para su grupo pero no genera columna', () => {
      const a = scoped({ instrumentId: 'a', coverageGroup: 'TALLER' });
      const b = scoped({
        instrumentId: 'b',
        coverageGroup: 'TALLER',
        isActive: false,
      });
      const result = compute({
        instruments: [a, b],
        columns: [column(a, ['a', 'b'])],
        surveys: [survey({ instrumentId: 'b' })],
      });
      expect(result.instruments.map((i) => i.instrumentId)).toEqual(['a']);
      const cov = instrumentOf(result, 'a');
      expect(cov.status).toBe('aplicado');
      expect(cov.memberIds).toEqual(['a', 'b']);
      expect(cov.coverageGroup).toBe('TALLER');
    });

    it('los instrumentos sin alcance no salen y se informan en instrumentsWithoutScope', () => {
      const result = compute({ withoutScope: 4 });
      expect(result.instruments.map((i) => i.instrumentId)).toEqual(['i-1']);
      expect(result.summary.instrumentsWithoutScope).toBe(4);
    });
  });

  describe('C10 — encuesta sin finca', () => {
    it('productor con una sola finca: la cubre y marca inferredFarm', () => {
      const result = compute({ surveys: [survey({ farmId: null })] });
      const cov = instrumentOf(result);
      expect(cov.status).toBe('aplicado');
      expect(cov.units[0]).toMatchObject({
        farmId: 'farm-1',
        status: 'aplicado',
        inferredFarm: true,
      });
      expect(result.unlocatedSurveys).toEqual([]);
    });

    it('productor con varias fincas: va a unlocatedSurveys con productor_varias_fincas', () => {
      const result = compute({
        farms: [link('farm-1'), link('farm-2')],
        surveys: [survey({ surveyId: 'suelta', farmId: null })],
      });
      expect(instrumentOf(result).status).toBe('falta');
      expect(result.unlocatedSurveys).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            surveyId: 'suelta',
            reason: 'productor_varias_fincas',
          }),
        ]),
      );
      expect(result.warnings).toContain('encuestas_sin_ubicar');
    });

    it('sin cultivo en una finca con varios cultivos aplicables: cultivo_ambiguo', () => {
      const result = compute({
        farms: [
          link('farm-1', {
            farmCrops: [
              { farmCropId: 'fc-cafe', cropId: CAFE },
              { farmCropId: 'fc-cacao', cropId: CACAO },
            ],
          }),
        ],
        instruments: [scoped({ scopeLevel: 'farm_crop' })],
        surveys: [survey({ surveyId: 'ambigua', farmCropId: null })],
      });
      expect(instrumentOf(result).status).toBe('falta');
      expect(result.unlocatedSurveys).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            surveyId: 'ambigua',
            reason: 'cultivo_ambiguo',
          }),
        ]),
      );
    });
  });
});
