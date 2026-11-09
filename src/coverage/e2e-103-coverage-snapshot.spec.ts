/**
 * Spec 103 — Flujo del encuestador por productor en el móvil (H6): mapper puro
 * de la foto de cobertura. `spec/103_encuestador_movil_por_productor.md`
 * (raíz del ecosistema), criterio C12 y "Impacto en el sistema → Backend".
 *
 * ESTAS PRUEBAS NACEN EN ROJO (enfoque test-first): `coverage-snapshot.mapper`
 * no existe todavía. Se carga con `require` dinámico (como en `e2e-100-*`) para
 * que el archivo compile y cada caso falle en runtime nombrando el módulo
 * esperado.
 *
 * Contrato que asume esta prueba (la implementación debe respetarlo o ajustar
 * este archivo, con aprobación, si cambia):
 *
 *   // src/coverage/coverage-snapshot.mapper.ts
 *   export function toCoverageSnapshot(input: {
 *     computedAt: string;              // un solo instante para toda la foto
 *     columns: CoverageColumn[];       // `LoadedData.columns` del cargador
 *     farmers: SnapshotFarmerSource[]; // uno por productor, en el orden dado
 *     maskPersonal: boolean;           // true con API key → documentId: null
 *   }): CoverageSnapshot;
 *
 *   interface SnapshotFarmerSource {
 *     result: FarmerCoverageResult;    // salida completa de computeFarmerCoverage
 *     documentId: string | null;       // de `farmers.document_id`
 *     department: { departmentId: string; name: string } | null; // finca principal
 *     hasPendingConsent: boolean;      // de getPendingConsentMap (spec 102)
 *   }
 *
 * Reglas que se verifican:
 * - Compactación: `instruments` (columnas con `memberIds`) y `computedAt` van
 *   UNA vez en la raíz. Por productor no se repite `computedAt` ni los
 *   metadatos de la columna (name, code, scopeLevel, cropIds, coverageGroup,
 *   memberIds); cada instrumento lleva solo `instrumentId`, `status`,
 *   `surveyCount`, `latestSurvey` y `units`.
 * - Se quitan los instrumentos con `status: 'no_aplica'`.
 * - `latestSurvey` se reduce a `surveyId`, `createdAt`, `farmId`,
 *   `farmCropId` y `farmerId` (o `null`).
 * - Las unidades se conservan tal cual (incluido `coveredByOtherFarmer`).
 * - Fincas con rol, principal, municipio y cultivos con `farmCropId`.
 * - Datos básicos: `farmerId`, `name`, `documentId`, `departmentId` y `townId`
 *   (de la finca principal), `farmsCount`, `cropIds` (únicos),
 *   `hasPendingConsent`, `summary` y `warnings`.
 * - Lista blanca: nunca teléfono, correo ni coordenadas, aunque la fuente los
 *   traiga por error. Función pura: no muta la entrada.
 *
 * La parte HTTP de C12 (roles, 401, API key, coherencia con
 * `GET /api/farmers/:id/coverage` y tope de tamaño/tiempo) vive en
 * `test/e2e-103-encuestador-movil.e2e-spec.ts`.
 */

import type { CoverageStatus } from './coverage-calculator';
import type { CoverageColumn } from './coverage-data.loader';
import type {
  CoverageUnit,
  FarmerCoverageResult,
  FarmerCoverageSummary,
  FarmerCoverageWarning,
  FarmerInstrumentCoverage,
} from './farmer-coverage-calculator';

// ── Contrato esperado del mapper (ver cabecera) ──────────────────────────────

interface SnapshotFarmerSource {
  result: FarmerCoverageResult;
  documentId: string | null;
  department: { departmentId: string; name: string } | null;
  hasPendingConsent: boolean;
}

interface CoverageSnapshotInput {
  computedAt: string;
  columns: CoverageColumn[];
  farmers: SnapshotFarmerSource[];
  maskPersonal: boolean;
}

interface SnapshotInstrument {
  instrumentId: string;
  status: Exclude<CoverageStatus, 'no_aplica'>;
  surveyCount: number;
  latestSurvey: {
    surveyId: string;
    createdAt: string;
    farmId: string | null;
    farmCropId: string | null;
    farmerId: string | null;
  } | null;
  units: CoverageUnit[];
}

interface SnapshotFarmer {
  farmerId: string;
  name: string;
  documentId: string | null;
  departmentId: string | null;
  townId: string | null;
  farmsCount: number;
  cropIds: string[];
  hasPendingConsent: boolean;
  summary: FarmerCoverageSummary;
  warnings: FarmerCoverageWarning[];
  farms: {
    farmId: string;
    name: string;
    role: string | null;
    isPrimary: boolean;
    town: { townId: string; name: string } | null;
    crops: { farmCropId: string; cropId: string; name: string }[];
  }[];
  instruments: SnapshotInstrument[];
}

interface CoverageSnapshot {
  computedAt: string;
  instruments: CoverageColumn[];
  farmers: SnapshotFarmer[];
}

interface CoverageSnapshotMapperModule {
  toCoverageSnapshot(input: CoverageSnapshotInput): CoverageSnapshot;
}

function loadMapper(): CoverageSnapshotMapperModule {
  const modulePath = './coverage-snapshot.mapper';
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require(modulePath) as CoverageSnapshotMapperModule;
}

// ── Datos de prueba ──────────────────────────────────────────────────────────

const COMPUTED_AT = '2026-11-08T15:00:00.000Z';
const FARMER_A = 'farmer-a';
const FARMER_B = 'farmer-b';
const FARMER_OTHER = 'farmer-other';
const FARM_1 = 'farm-1';
const FARM_2 = 'farm-2';
const FC_1 = 'farm-crop-1';
const FC_2 = 'farm-crop-2';
const CAFE = 'crop-cafe';
const CACAO = 'crop-cacao';
const DOCUMENT_A = '1037000111';
const DOCUMENT_B = '1037000222';
const PHONE = '3001234567';
const EMAIL = 'productor.a@example.com';
const LATITUDE = 6.2442031;
const LONGITUDE = -75.5812119;

const PERSONAL_KEYS = ['phone', 'email', 'latitude', 'longitude'];
const COLUMN_ONLY_KEYS = [
  'name',
  'code',
  'scopeLevel',
  'cropIds',
  'coverageGroup',
  'memberIds',
];

const columns: CoverageColumn[] = [
  {
    instrumentId: 'i-farmer',
    name: 'S1 Productor',
    code: 'S1',
    scopeLevel: 'farmer',
    cropIds: [],
    coverageGroup: null,
    memberIds: ['i-farmer'],
  },
  {
    instrumentId: 'i-farm',
    name: 'S2 Finca',
    code: 'S2',
    scopeLevel: 'farm',
    cropIds: [],
    coverageGroup: 'grupo-finca',
    memberIds: ['i-farm', 'i-farm-v0'],
  },
  {
    instrumentId: 'i-crop',
    name: 'S3 Cultivo',
    code: 'S3',
    scopeLevel: 'farm_crop',
    cropIds: [],
    coverageGroup: null,
    memberIds: ['i-crop'],
  },
  {
    instrumentId: 'i-cannabis',
    name: 'S9 Cannabis',
    code: 'S9',
    scopeLevel: 'farm_crop',
    cropIds: ['crop-cannabis'],
    coverageGroup: null,
    memberIds: ['i-cannabis'],
  },
];

function instrument(
  column: CoverageColumn,
  rest: Omit<FarmerInstrumentCoverage, keyof CoverageColumn>,
): FarmerInstrumentCoverage {
  return { ...column, ...rest };
}

/**
 * Productor A: dos fincas (F1 propia y principal, F2 compartida en arriendo).
 * - S1 (productor) aplicado.
 * - S2 (finca) parcial: F1 falta; F2 aplicada por otro productor.
 * - S3 (cultivo) falta en los dos cultivos.
 * - S9 (cannabis) no aplica.
 */
function resultA(): FarmerCoverageResult {
  return {
    farmerId: FARMER_A,
    name: 'Productor A',
    computedAt: COMPUTED_AT,
    summary: {
      applicable: 3,
      applied: 1,
      partial: 1,
      pending: 1,
      notApplicable: 1,
      instrumentsWithoutScope: 2,
    },
    farms: [
      {
        farmId: FARM_1,
        name: 'La Esperanza',
        role: 'owner',
        isPrimary: true,
        town: { townId: 'town-1', name: 'Jardín' },
        crops: [{ farmCropId: FC_1, cropId: CAFE, name: 'Café' }],
      },
      {
        farmId: FARM_2,
        name: 'El Retiro',
        role: 'tenant',
        isPrimary: false,
        town: { townId: 'town-2', name: 'Andes' },
        crops: [{ farmCropId: FC_2, cropId: CACAO, name: 'Cacao' }],
      },
    ],
    instruments: [
      instrument(columns[0], {
        status: 'aplicado',
        surveyCount: 1,
        latestSurvey: {
          surveyId: 's-farmer',
          instrumentId: 'i-farmer',
          createdAt: '2026-10-20T13:45:00.000Z',
          origin: 'field',
          farmId: null,
          farmCropId: null,
          farmerId: FARMER_A,
        },
        units: [
          {
            unitType: 'farmer',
            label: 'Productor A',
            status: 'aplicado',
            surveyId: 's-farmer',
            surveyCount: 1,
          },
        ],
      }),
      instrument(columns[1], {
        status: 'parcial',
        surveyCount: 1,
        latestSurvey: {
          surveyId: 's-farm-other',
          instrumentId: 'i-farm-v0',
          createdAt: '2026-10-25T09:00:00.000Z',
          origin: 'public',
          farmId: FARM_2,
          farmCropId: null,
          farmerId: FARMER_OTHER,
        },
        units: [
          {
            unitType: 'farm',
            farmId: FARM_1,
            label: 'La Esperanza',
            status: 'falta',
            surveyId: null,
            surveyCount: 0,
          },
          {
            unitType: 'farm',
            farmId: FARM_2,
            label: 'El Retiro',
            status: 'aplicado',
            surveyId: 's-farm-other',
            surveyCount: 1,
            coveredByOtherFarmer: true,
          },
        ],
      }),
      instrument(columns[2], {
        status: 'falta',
        surveyCount: 0,
        latestSurvey: null,
        units: [
          {
            unitType: 'farm_crop',
            farmId: FARM_1,
            farmCropId: FC_1,
            label: 'La Esperanza · Café',
            status: 'falta',
            surveyId: null,
            surveyCount: 0,
          },
          {
            unitType: 'farm_crop',
            farmId: FARM_2,
            farmCropId: FC_2,
            label: 'El Retiro · Cacao',
            status: 'falta',
            surveyId: null,
            surveyCount: 0,
          },
        ],
      }),
      instrument(columns[3], {
        status: 'no_aplica',
        surveyCount: 0,
        latestSurvey: null,
        units: [],
      }),
    ],
    warnings: [],
    unlocatedSurveys: [],
    unsyncedWithResponses: 0,
  };
}

/** Productor B: sin fincas. Solo S1 aplica (falta). */
function resultB(): FarmerCoverageResult {
  return {
    farmerId: FARMER_B,
    name: 'Productor B',
    computedAt: COMPUTED_AT,
    summary: {
      applicable: 1,
      applied: 0,
      partial: 0,
      pending: 1,
      notApplicable: 3,
      instrumentsWithoutScope: 2,
    },
    farms: [],
    instruments: [
      instrument(columns[0], {
        status: 'falta',
        surveyCount: 0,
        latestSurvey: null,
        units: [
          {
            unitType: 'farmer',
            label: 'Productor B',
            status: 'falta',
            surveyId: null,
            surveyCount: 0,
          },
        ],
      }),
      ...columns.slice(1).map((c) =>
        instrument(c, {
          status: 'no_aplica',
          surveyCount: 0,
          latestSurvey: null,
          units: [],
        }),
      ),
    ],
    warnings: ['sin_finca'],
    unlocatedSurveys: [],
    unsyncedWithResponses: 0,
  };
}

/**
 * Fuente "contaminada": simula que el servicio, por error, pasa al mapper
 * filas con teléfono, correo y coordenadas. El mapper debe usar lista blanca.
 */
function leakySource(result: FarmerCoverageResult): FarmerCoverageResult {
  return {
    ...result,
    phone: PHONE,
    email: EMAIL,
    farms: result.farms.map((f) => ({
      ...f,
      latitude: LATITUDE,
      longitude: LONGITUDE,
    })),
  } as FarmerCoverageResult;
}

function input(
  overrides: Partial<CoverageSnapshotInput> = {},
): CoverageSnapshotInput {
  return {
    computedAt: COMPUTED_AT,
    columns,
    maskPersonal: false,
    farmers: [
      {
        result: leakySource(resultA()),
        documentId: DOCUMENT_A,
        department: { departmentId: 'dep-antioquia', name: 'Antioquia' },
        hasPendingConsent: false,
      },
      {
        result: resultB(),
        documentId: DOCUMENT_B,
        department: null,
        hasPendingConsent: true,
      },
    ],
    ...overrides,
  };
}

function snapshot(overrides: Partial<CoverageSnapshotInput> = {}) {
  return loadMapper().toCoverageSnapshot(input(overrides));
}

function farmerOf(s: CoverageSnapshot, farmerId: string): SnapshotFarmer {
  const found = s.farmers.find((f) => f.farmerId === farmerId);
  if (!found) throw new Error(`productor ${farmerId} ausente en la foto`);
  return found;
}

/** Todas las claves de un valor JSON, a cualquier profundidad. */
function allKeys(value: unknown, acc = new Set<string>()): Set<string> {
  if (Array.isArray(value)) {
    for (const v of value) allKeys(v, acc);
  } else if (value !== null && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      acc.add(k);
      allKeys(v, acc);
    }
  }
  return acc;
}

// ── Casos ────────────────────────────────────────────────────────────────────

describe('Spec 103 — toCoverageSnapshot (C12, mapper puro)', () => {
  describe('compactación', () => {
    it('lleva las columnas una sola vez en la raíz, con memberIds', () => {
      const s = snapshot();
      expect(s.instruments).toEqual(columns);
      expect(s.instruments.map((c) => c.memberIds)).toEqual(
        columns.map((c) => c.memberIds),
      );
    });

    it('usa un computedAt global y no lo repite por productor', () => {
      const s = snapshot();
      expect(s.computedAt).toBe(COMPUTED_AT);
      for (const f of s.farmers) {
        expect(f).not.toHaveProperty('computedAt');
      }
    });

    it('una entrada por productor, en el orden de la fuente', () => {
      const s = snapshot();
      expect(s.farmers.map((f) => f.farmerId)).toEqual([FARMER_A, FARMER_B]);
    });

    it('los instrumentos del productor no repiten los metadatos de la columna', () => {
      const s = snapshot();
      for (const f of s.farmers) {
        for (const i of f.instruments) {
          for (const key of COLUMN_ONLY_KEYS) {
            expect(i).not.toHaveProperty(key);
          }
          expect(Object.keys(i).sort()).toEqual(
            [
              'instrumentId',
              'latestSurvey',
              'status',
              'surveyCount',
              'units',
            ].sort(),
          );
        }
      }
    });

    it('quita los instrumentos no_aplica', () => {
      const s = snapshot();
      const a = farmerOf(s, FARMER_A);
      expect(a.instruments.map((i) => i.instrumentId)).toEqual([
        'i-farmer',
        'i-farm',
        'i-crop',
      ]);
      const b = farmerOf(s, FARMER_B);
      expect(b.instruments.map((i) => i.instrumentId)).toEqual(['i-farmer']);
      for (const f of s.farmers) {
        expect(
          f.instruments.some((i) => (i.status as string) === 'no_aplica'),
        ).toBe(false);
      }
    });

    it('no incluye unlocatedSurveys ni unsyncedWithResponses', () => {
      const s = snapshot();
      for (const f of s.farmers) {
        expect(f).not.toHaveProperty('unlocatedSurveys');
        expect(f).not.toHaveProperty('unsyncedWithResponses');
      }
    });

    it('sin productores: lista vacía y las columnas igual presentes', () => {
      const s = snapshot({ farmers: [] });
      expect(s.farmers).toEqual([]);
      expect(s.instruments).toEqual(columns);
      expect(s.computedAt).toBe(COMPUTED_AT);
    });
  });

  describe('datos personales (DM16)', () => {
    it('nunca incluye teléfono, correo ni coordenadas, aunque la fuente los traiga', () => {
      const s = snapshot();
      const keys = allKeys(s);
      for (const key of PERSONAL_KEYS) expect(keys.has(key)).toBe(false);
      const raw = JSON.stringify(s);
      expect(raw).not.toContain(PHONE);
      expect(raw).not.toContain(EMAIL);
      expect(raw).not.toContain(String(LATITUDE));
      expect(raw).not.toContain(String(LONGITUDE));
    });

    it('con JWT (maskPersonal: false) conserva el documentId', () => {
      const s = snapshot({ maskPersonal: false });
      expect(farmerOf(s, FARMER_A).documentId).toBe(DOCUMENT_A);
      expect(farmerOf(s, FARMER_B).documentId).toBe(DOCUMENT_B);
    });

    it('con API key (maskPersonal: true) documentId llega en null', () => {
      const s = snapshot({ maskPersonal: true });
      for (const f of s.farmers) expect(f.documentId).toBeNull();
      const raw = JSON.stringify(s);
      expect(raw).not.toContain(DOCUMENT_A);
      expect(raw).not.toContain(DOCUMENT_B);
    });

    it('un productor sin documento queda con documentId null', () => {
      const base = input();
      const s = loadMapper().toCoverageSnapshot({
        ...base,
        farmers: [{ ...base.farmers[0], documentId: null }],
      });
      expect(s.farmers[0].documentId).toBeNull();
    });
  });

  describe('datos básicos y fincas', () => {
    it('conserva las fincas con rol, principal, municipio y cultivos con farmCropId', () => {
      const a = farmerOf(snapshot(), FARMER_A);
      expect(a.farms).toEqual([
        {
          farmId: FARM_1,
          name: 'La Esperanza',
          role: 'owner',
          isPrimary: true,
          town: { townId: 'town-1', name: 'Jardín' },
          crops: [{ farmCropId: FC_1, cropId: CAFE, name: 'Café' }],
        },
        {
          farmId: FARM_2,
          name: 'El Retiro',
          role: 'tenant',
          isPrimary: false,
          town: { townId: 'town-2', name: 'Andes' },
          crops: [{ farmCropId: FC_2, cropId: CACAO, name: 'Cacao' }],
        },
      ]);
    });

    it('nombre, departamento y municipio de la finca principal, fincas y cultivos únicos', () => {
      const a = farmerOf(snapshot(), FARMER_A);
      expect(a.name).toBe('Productor A');
      expect(a.departmentId).toBe('dep-antioquia');
      expect(a.townId).toBe('town-1');
      expect(a.farmsCount).toBe(2);
      expect([...a.cropIds].sort()).toEqual([CACAO, CAFE].sort());
      expect(new Set(a.cropIds).size).toBe(a.cropIds.length);
    });

    it('productor sin fincas: sin departamento ni municipio, farmsCount 0 y aviso sin_finca', () => {
      const b = farmerOf(snapshot(), FARMER_B);
      expect(b.farms).toEqual([]);
      expect(b.farmsCount).toBe(0);
      expect(b.cropIds).toEqual([]);
      expect(b.departmentId).toBeNull();
      expect(b.townId).toBeNull();
      expect(b.warnings).toEqual(['sin_finca']);
    });

    it('pasa hasPendingConsent tal cual', () => {
      const s = snapshot();
      expect(farmerOf(s, FARMER_A).hasPendingConsent).toBe(false);
      expect(farmerOf(s, FARMER_B).hasPendingConsent).toBe(true);
    });
  });

  describe('instrumentos y unidades', () => {
    it('conserva las unidades, incluido coveredByOtherFarmer', () => {
      const a = farmerOf(snapshot(), FARMER_A);
      const farm = a.instruments.find((i) => i.instrumentId === 'i-farm')!;
      expect(farm.units).toEqual(resultA().instruments[1].units);
      const shared = farm.units.find((u) => u.farmId === FARM_2)!;
      expect(shared.coveredByOtherFarmer).toBe(true);
    });

    it('las unidades de cultivo llevan farmId y farmCropId', () => {
      const a = farmerOf(snapshot(), FARMER_A);
      const crop = a.instruments.find((i) => i.instrumentId === 'i-crop')!;
      expect(
        crop.units.map((u) => [u.unitType, u.farmId, u.farmCropId, u.status]),
      ).toEqual([
        ['farm_crop', FARM_1, FC_1, 'falta'],
        ['farm_crop', FARM_2, FC_2, 'falta'],
      ]);
    });

    it('latestSurvey conserva createdAt y las anclas, sin origin ni instrumentId', () => {
      const a = farmerOf(snapshot(), FARMER_A);
      const farmer = a.instruments.find((i) => i.instrumentId === 'i-farmer')!;
      expect(farmer.latestSurvey).toEqual({
        surveyId: 's-farmer',
        createdAt: '2026-10-20T13:45:00.000Z',
        farmId: null,
        farmCropId: null,
        farmerId: FARMER_A,
      });
      const farm = a.instruments.find((i) => i.instrumentId === 'i-farm')!;
      expect(farm.latestSurvey).toEqual({
        surveyId: 's-farm-other',
        createdAt: '2026-10-25T09:00:00.000Z',
        farmId: FARM_2,
        farmCropId: null,
        farmerId: FARMER_OTHER,
      });
    });

    it('latestSurvey null cuando no hay encuestas', () => {
      const a = farmerOf(snapshot(), FARMER_A);
      const crop = a.instruments.find((i) => i.instrumentId === 'i-crop')!;
      expect(crop.latestSurvey).toBeNull();
      expect(crop.surveyCount).toBe(0);
    });
  });

  describe('coherencia con el FarmerCoverageResult de entrada', () => {
    it.each([
      [FARMER_A, resultA],
      [FARMER_B, resultB],
    ])(
      '%s: resumen, avisos, estados, conteos y unidades coinciden',
      (id, make) => {
        const source = make();
        const f = farmerOf(snapshot(), id);
        expect(f.summary).toEqual(source.summary);
        expect(f.warnings).toEqual(source.warnings);

        const applicable = source.instruments.filter(
          (i) => i.status !== 'no_aplica',
        );
        expect(f.instruments).toHaveLength(applicable.length);
        expect(f.instruments).toHaveLength(
          source.summary.applied +
            source.summary.partial +
            source.summary.pending,
        );
        for (const original of applicable) {
          const compact = f.instruments.find(
            (i) => i.instrumentId === original.instrumentId,
          )!;
          expect(compact.status).toBe(original.status);
          expect(compact.surveyCount).toBe(original.surveyCount);
          expect(compact.units).toEqual(original.units);
          expect(compact.latestSurvey?.surveyId ?? null).toBe(
            original.latestSurvey?.surveyId ?? null,
          );
        }
        expect(f.farms.map((x) => x.farmId)).toEqual(
          source.farms.map((x) => x.farmId),
        );
      },
    );

    it('todo instrumento del productor es una columna de la raíz', () => {
      const s = snapshot();
      const columnIds = new Set(s.instruments.map((c) => c.instrumentId));
      for (const f of s.farmers) {
        for (const i of f.instruments) {
          expect(columnIds.has(i.instrumentId)).toBe(true);
        }
      }
    });
  });

  describe('pureza', () => {
    it('no muta la entrada y es determinista', () => {
      const data = input();
      const before = JSON.stringify(data);
      const first = loadMapper().toCoverageSnapshot(data);
      const second = loadMapper().toCoverageSnapshot(data);
      expect(JSON.stringify(data)).toBe(before);
      expect(second).toEqual(first);
    });
  });
});
