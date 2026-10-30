/**
 * Spec 98 — cálculo de cobertura por finca e instrumento: función pura.
 * `spec/98_exploracion_unidades_productivas.md`, "Reglas de negocio".
 *
 * ESTAS PRUEBAS NACEN EN ROJO (enfoque test-first): `coverage-calculator` no
 * existe todavía. Se carga con `require` dinámico para que el archivo compile y
 * cada caso falle en runtime nombrando el módulo esperado.
 *
 * Contrato: la implementación debe respetar estos nombres o ajustar este
 * archivo, con aprobación, si cambian.
 */

type ScopeLevel = 'farmer' | 'farm' | 'farm_crop';

interface ScopedInstrument {
  instrumentId: string;
  scopeLevel: ScopeLevel;
  /** Vacío = todos los cultivos. */
  cropIds: string[];
  coverageGroup?: string | null;
  isActive: boolean;
}

interface FarmInput {
  farmId: string;
  farmerIds: string[];
  /** Cultivos activos de la finca. */
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

interface CoverageCell {
  status: 'aplicado' | 'parcial' | 'falta' | 'no_aplica';
  surveyId?: string | null;
  surveyCount?: number;
  coveredFarmers?: number;
  totalFarmers?: number;
  outOfScope?: boolean;
  inferredFarm?: boolean;
  inferredCrop?: boolean;
  noRegisteredCrop?: boolean;
}

interface CoverageCalculatorModule {
  computeFarmCoverage(
    farm: FarmInput,
    instrument: ScopedInstrument,
    surveys: SurveyInput[],
    allInstruments: ScopedInstrument[],
    farmerFarmCounts: Record<string, number>,
  ): CoverageCell;
  isCountableSurvey(survey: SurveyInput): boolean;
}

function loadCalculator(): CoverageCalculatorModule {
  const modulePath = './coverage-calculator';
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require(modulePath) as CoverageCalculatorModule;
}

const CAFE = 'crop-cafe';
const CACAO = 'crop-cacao';

function instrument(over: Partial<ScopedInstrument> = {}): ScopedInstrument {
  return {
    instrumentId: 'i-1',
    scopeLevel: 'farm',
    cropIds: [],
    coverageGroup: null,
    isActive: true,
    ...over,
  };
}

function farm(over: Partial<FarmInput> = {}): FarmInput {
  return {
    farmId: 'farm-1',
    farmerIds: ['farmer-1'],
    farmCrops: [{ farmCropId: 'fc-cafe', cropId: CAFE }],
    ...over,
  };
}

function survey(over: Partial<SurveyInput> = {}): SurveyInput {
  return {
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
  };
}

function compute(
  f: FarmInput,
  i: ScopedInstrument,
  surveys: SurveyInput[],
  all: ScopedInstrument[] = [i],
  counts: Record<string, number> = { 'farmer-1': 1, 'farmer-2': 1 },
): CoverageCell {
  return loadCalculator().computeFarmCoverage(f, i, surveys, all, counts);
}

describe('Spec 98 — coverage-calculator', () => {
  describe('C03 — falta y no aplica por cultivo', () => {
    const cacao = instrument({ scopeLevel: 'farm_crop', cropIds: [CACAO] });
    const cafe = instrument({ scopeLevel: 'farm_crop', cropIds: [CAFE] });

    it('finca solo de café: no aplica un instrumento de cacao', () => {
      expect(compute(farm(), cacao, []).status).toBe('no_aplica');
    });

    it('finca solo de café: falta un instrumento de café sin encuesta', () => {
      expect(compute(farm(), cafe, []).status).toBe('falta');
    });

    it('finca sin cultivo: no aplica, con aviso', () => {
      const cell = compute(farm({ farmCrops: [] }), cafe, []);
      expect(cell.status).toBe('no_aplica');
      expect(cell.noRegisteredCrop).toBe(true);
    });
  });

  describe('C04 — parcial solo en cultivos', () => {
    const twoCrops = farm({
      farmCrops: [
        { farmCropId: 'fc-cafe', cropId: CAFE },
        { farmCropId: 'fc-cacao', cropId: CACAO },
      ],
    });
    const allCrops = instrument({ scopeLevel: 'farm_crop' });

    it('un cultivo cubierto de dos: parcial', () => {
      expect(compute(twoCrops, allCrops, [survey()]).status).toBe('parcial');
    });

    it('los dos cubiertos: aplicado', () => {
      const surveys = [
        survey(),
        survey({ surveyId: 's-2', farmCropId: 'fc-cacao' }),
      ];
      expect(compute(twoCrops, allCrops, surveys).status).toBe('aplicado');
    });
  });

  describe('niveles productor y finca', () => {
    it('productor: cuenta la encuesta de cualquiera, sin ser parcial', () => {
      const cell = compute(
        farm({ farmerIds: ['farmer-1', 'farmer-2'] }),
        instrument({ scopeLevel: 'farmer' }),
        [survey({ farmId: null, farmCropId: null })],
      );
      expect(cell.status).toBe('aplicado');
      expect(cell.coveredFarmers).toBe(1);
      expect(cell.totalFarmers).toBe(2);
    });

    it('finca: falta si la encuesta es de otra finca', () => {
      const cell = compute(farm(), instrument(), [
        survey({ farmId: 'farm-2', farmerId: 'farmer-9' }),
      ]);
      expect(cell.status).toBe('falta');
    });
  });

  describe('C05 — grupo de cobertura', () => {
    it('basta una encuesta de otro instrumento del grupo, aunque esté inactivo', () => {
      const a = instrument({ instrumentId: 'a', coverageGroup: 'TALLER' });
      const b = instrument({
        instrumentId: 'b',
        coverageGroup: 'TALLER',
        isActive: false,
      });
      const cell = compute(farm(), a, [survey({ instrumentId: 'b' })], [a, b]);
      expect(cell.status).toBe('aplicado');
    });
  });

  describe('C07 — encuestas que no cuentan', () => {
    it.each([
      ['vacía', { responseCount: 0 }],
      ['no sincronizada', { sincronized: false }],
      ['pública pendiente', { origin: 'public', reviewStatus: 'pending' }],
      ['pública descartada', { origin: 'public', reviewStatus: 'discarded' }],
    ])('%s', (_name, over) => {
      const s = survey(over as Partial<SurveyInput>);
      expect(loadCalculator().isCountableSurvey(s)).toBe(false);
      expect(compute(farm(), instrument(), [s]).status).toBe('falta');
    });

    it('pública procesada sí cuenta', () => {
      const s = survey({ origin: 'public', reviewStatus: 'processed' });
      expect(loadCalculator().isCountableSurvey(s)).toBe(true);
    });
  });

  describe('C08 — repetidas', () => {
    it('usa la más reciente e informa el conteo', () => {
      const cell = compute(farm(), instrument(), [
        survey({ surveyId: 'vieja', createdAt: '2026-01-01T00:00:00Z' }),
        survey({ surveyId: 'nueva', createdAt: '2026-09-01T00:00:00Z' }),
      ]);
      expect(cell.surveyId).toBe('nueva');
      expect(cell.surveyCount).toBe(2);
    });
  });

  describe('atribuciones sin escribir en la base', () => {
    const cafe = instrument({ scopeLevel: 'farm_crop', cropIds: [CAFE] });

    it('fuera de alcance: gana aplicado, con marca', () => {
      const cacao = instrument({ scopeLevel: 'farm_crop', cropIds: [CACAO] });
      const cell = compute(farm(), cacao, [survey()]);
      expect(cell.status).toBe('aplicado');
      expect(cell.outOfScope).toBe(true);
    });

    it('sin cultivo de finca y un solo cultivo aplicable: se infiere', () => {
      const cell = compute(farm(), cafe, [survey({ farmCropId: null })]);
      expect(cell.status).toBe('aplicado');
      expect(cell.inferredCrop).toBe(true);
    });

    it('sin cultivo de finca y varios aplicables: no cubre ninguno', () => {
      const cell = compute(
        farm({
          farmCrops: [
            { farmCropId: 'fc-cafe', cropId: CAFE },
            { farmCropId: 'fc-cacao', cropId: CACAO },
          ],
        }),
        instrument({ scopeLevel: 'farm_crop' }),
        [survey({ farmCropId: null })],
      );
      expect(cell.status).toBe('falta');
    });

    it('sin finca y productor de una sola finca: se infiere', () => {
      const cell = compute(farm(), instrument(), [
        survey({ farmId: null, farmCropId: null }),
      ]);
      expect(cell.status).toBe('aplicado');
      expect(cell.inferredFarm).toBe(true);
    });

    it('sin finca y productor de varias fincas: no se atribuye', () => {
      const cell = compute(
        farm(),
        instrument(),
        [survey({ farmId: null, farmCropId: null })],
        undefined,
        { 'farmer-1': 2 },
      );
      expect(cell.status).toBe('falta');
    });
  });
});
