/**
 * Spec 111 — Mapa de unidades productivas por departamento en el Resumen general.
 * `spec/111_mapa_unidades_productivas_por_departamento.md` (raíz del ecosistema).
 *
 * ESTAS PRUEBAS NACEN EN ROJO (enfoque test-first): la métrica
 * `production_units_by_department` todavía no existe en el catálogo
 * (`ENTITY_METRICS`) ni en la agregación (`entityMetricAggregation`), así que
 * el catálogo no la lista y crear un gráfico con ella responde 400. Los casos
 * de C13 (`/dashboard/overview` y `/dashboard/department-counts` mantienen su
 * contrato) pasan ya: protegen que el spec no rompa a sus consumidores.
 *
 * Criterios cubiertos (backend): C1–C6 y C12/C13. Los C7–C11 viven en
 * `frontend/lib/dashboard/e2e-111-mapaUnidadesProductivas.test.ts` y en
 * `docs/testing/test-111-mapa-unidades-productivas-por-departamento.md`.
 *
 * ── Contrato que asume este archivo (el del 108/109, ya implementado) ─────
 *   GET  /api/dashboard/builder/entity-metrics?entity=
 *        → [{ metricKey, label, entity, charts, filters }]
 *   POST /api/dashboard/builder/categories      { code, name } → { categoryId }
 *   POST /api/dashboard/builder/charts          { categoryId, title,
 *        sourceKind: 'entity_metric', metricKey, chartKind, audience, layout }
 *        → 201 borrador | 400 { code: 'DASHBOARD_CHART_INCOMPATIBLE' }
 *   GET  /api/dashboard/builder/charts/:id/preview?audience=&<filtros>
 *        → { metricKey, ignoredFilters, series: [{ answeredCount, suppressed,
 *            aggregation: { buckets: [{ id, name, count, percentage,
 *            suppressed }] } | null }] }
 *   POST /api/dashboard/builder/charts/:id/publish
 *   GET  /api/dashboard/charts?categoryId=<code>&<filtros>   (público)
 *        → { charts: [{ chartId, sourceKind, metricKey, chartKind,
 *            ignoredFilters, suppressed, answeredCount, series }] }
 *
 * Semántica de la métrica (D1, A5): filas activas de `farms_crops`
 * (`archived_at IS NULL`) ubicadas por `farms.town_id → towns.department_id`
 * (JOIN, no LEFT JOIN: una unidad sin municipio no se ubica ni entra en el
 * total). El filtro `cropId` restringe la propia fila: `fc.crop_id = cropId`.
 *
 * ── Datos propios (prefijo `E2E111` + corrida) ─────────────────────────────
 * Departamentos, municipios y cultivos nuevos: con `cropId` de un cultivo
 * propio o `departmentId` de un departamento propio, el resultado solo depende
 * de lo sembrado aquí, aunque la base de desarrollo tenga otras unidades.
 *
 *   depA (municipios tA y tA2):
 *     A1 (tA)  X activo, Y activo, Z archivado      → 2 unidades
 *     A2–A4 (tA)  X activo                          → 3 unidades
 *     A5 (tA2) X activo                             → 1 unidad
 *     A6 (tA)  X archivado                          → 0 unidades
 *     total depA = 6 (tA = 5, tA2 = 1); X = 5, Y = 1
 *   depB (municipio tB):  B1–B7 X activo            → 7 unidades
 *   depS (municipio tS):  S1–S2 X activo            → 2 unidades (< MIN_CELL)
 *   N1 sin municipio:     X activo, Y activo        → no se ubica
 *
 *   Con cropId = X: depB 7, depA 5, depS 2 → total ubicado 14 (no 15 con N1
 *   ni 16 con los archivados). P18-e: depS (< 5) y la siguiente más pequeña
 *   (depA) quedan suprimidas; solo depB visible, con 50 %.
 *
 * ENTORNO: SOLO contra la base de desarrollo (`DATABASE_URL` activa del
 * `.env`, Neon `sosagro-dev`), NUNCA contra producción. Todo se elimina en
 * `afterAll`, en orden inverso a la siembra.
 */
import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getOptionsToken } from '@nestjs/throttler';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';

jest.setTimeout(180_000);

// ─── constantes ─────────────────────────────────────────────────────────────

const BUILDER = '/api/dashboard/builder';
const PUBLIC_CHARTS = '/api/dashboard/charts';
const TEST_PASSWORD = 'E2eTest1234!';
const EMAIL_PREFIX = 'e2e-111-';
const RUN = Date.now().toString().slice(-6);
const GEO_PREFIX = `E2E111 ${RUN}`;
const CATEGORY_CODE_PREFIX = 'E2E111';
const CATEGORY_CODE = `${CATEGORY_CODE_PREFIX}-${RUN}`;
const TITLE_PREFIX = 'E2E 111';

const METRIC = 'production_units_by_department';
const METRIC_LABEL = 'Unidades productivas por departamento';
const CHART_INCOMPATIBLE = 'DASHBOARD_CHART_INCOMPATIBLE';

// MIN_SAMPLE_THRESHOLD y MIN_CELL_SIZE (`dashboard-privacy.config.ts`, ambos 5).
const MIN_SAMPLE = 5;
const MIN_CELL = 5;

const GEO_FILTERS = ['departmentId', 'townId', 'cropId'];

// ─── tipos del contrato ─────────────────────────────────────────────────────

interface MetricCatalogItem {
  metricKey: string;
  label: string;
  entity: string;
  charts: string[];
  filters: string[];
}

interface MetricBucket {
  id: string;
  name: string;
  count: number | null;
  percentage: number | null;
  suppressed: boolean;
}

interface MetricSeries {
  seriesKey: string;
  label: string;
  answeredCount: number | null;
  suppressed: boolean;
  aggregation: { buckets: MetricBucket[] } | null;
}

interface MetricPreview {
  health: 'ok' | 'needs_review';
  metricKey: string;
  ignoredFilters: string[];
  excludedSources: unknown[];
  series: MetricSeries[];
}

interface MetricChart {
  chartId: string;
  status: string;
  sourceKind: string;
  metricKey: string | null;
  chartKind: string;
}

interface ServedMetricChart {
  chartId: string;
  sourceKind: string;
  metricKey: string;
  chartKind: string;
  ignoredFilters: string[];
  suppressed: boolean;
  answeredCount: number | null;
  series: MetricSeries[];
}

interface ServedChartsBody {
  charts: ServedMetricChart[];
}

interface BuilderError {
  code?: string;
  message?: unknown;
}

type Audience = 'public' | 'private';
const AUDIENCES: Audience[] = ['public', 'private'];

// ─── helpers puros ──────────────────────────────────────────────────────────

const listOf = <T>(body: unknown): T[] =>
  Array.isArray(body) ? (body as T[]) : ((body as { items: T[] }).items ?? []);

const bucketsOf = (series: MetricSeries | undefined): MetricBucket[] => {
  const aggregation = series?.aggregation;
  if (!aggregation || !('buckets' in aggregation)) {
    throw new Error('La métrica no devolvió `buckets`');
  }
  return aggregation.buckets;
};

const bucketOf = (series: MetricSeries | undefined, id: string) => {
  const found = bucketsOf(series).find((b) => b.id === id);
  if (!found) throw new Error(`Departamento ${id} ausente en la métrica`);
  return found;
};

/** Invariantes de privacidad de cualquier respuesta de la métrica (C4, C5). */
const expectPrivacyInvariants = (series: MetricSeries) => {
  const buckets = bucketsOf(series);
  for (const b of buckets) {
    if (b.suppressed) {
      expect(b.count).toBeNull();
      expect(b.percentage).toBeNull();
    } else {
      expect(b.count).toBeGreaterThanOrEqual(MIN_CELL);
    }
  }
  // P18-e: los departamentos particionan el total; nunca una única suprimida.
  expect(buckets.filter((b) => b.suppressed)).not.toHaveLength(1);
};

// ─── suite ──────────────────────────────────────────────────────────────────

describe('Spec 111 — mapa de unidades productivas por departamento (e2e)', () => {
  let app: INestApplication<App>;
  let ds: DataSource;
  let adminToken: string;
  let categoryId = '';

  const geo = { depA: '', depB: '', depS: '', tA: '', tA2: '', tB: '', tS: '' };
  const crop = { x: '', y: '', z: '' };
  const farmIds: string[] = [];
  const farmCropIds: string[] = [];

  const http = () => request(app.getHttpServer());
  const auth = () => ({ Authorization: `Bearer ${adminToken}` });

  const metricBody = (
    chartKind: string,
    overrides: Record<string, unknown> = {},
  ): Record<string, unknown> => ({
    categoryId,
    title: `${TITLE_PREFIX} ${randomUUID().slice(0, 8)}`,
    sourceKind: 'entity_metric',
    metricKey: METRIC,
    chartKind,
    audience: 'public',
    layout: 'normal',
    ...overrides,
  });

  const createMetricChart = async (
    chartKind = 'map',
    overrides: Record<string, unknown> = {},
  ): Promise<MetricChart> => {
    const res = await http()
      .post(`${BUILDER}/charts`)
      .set(auth())
      .send(metricBody(chartKind, overrides));
    expect(res.status).toBe(201);
    return res.body as MetricChart;
  };

  const preview = async (
    chartId: string,
    audience: Audience,
    filters: Record<string, string> = {},
  ): Promise<MetricPreview> => {
    const res = await http()
      .get(`${BUILDER}/charts/${chartId}/preview`)
      .query({ audience, ...filters })
      .set(auth())
      .expect(200);
    return res.body as MetricPreview;
  };

  /** Gráfico de mapa compartido por los casos de lectura (se crea una vez). */
  let sharedChartId = '';
  const sharedChart = async (): Promise<string> => {
    if (!sharedChartId) sharedChartId = (await createMetricChart()).chartId;
    return sharedChartId;
  };

  /** Borra por SQL ignorando que la tabla no exista. */
  async function safeQuery(sql: string, params: unknown[] = []) {
    try {
      await ds.query(sql, params);
    } catch (err) {
      if ((err as { code?: string }).code !== '42P01') throw err;
    }
  }

  // ── montaje ───────────────────────────────────────────────────────────────

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(getOptionsToken())
      .useValue([{ ttl: 60_000, limit: 100_000 }])
      .compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
    ds = moduleFixture.get(DataSource);

    // ── usuario admin ────────────────────────────────────────────────────
    const [adminRole] = await ds.query<{ role_id: string }[]>(
      `SELECT role_id FROM roles WHERE name = 'admin'`,
    );
    const email = `${EMAIL_PREFIX}admin@test.local`;
    const existing = await ds.query<{ user_id: string }[]>(
      `SELECT user_id FROM users WHERE email = $1`,
      [email],
    );
    if (!existing.length) {
      await ds.query(
        `INSERT INTO users (user_id, name, last_name, email, password, role_id, must_change_password)
         VALUES (gen_random_uuid(), 'E2E 111 admin', 'E2E', $1, $2, $3, false)`,
        [email, await bcrypt.hash(TEST_PASSWORD, 10), adminRole.role_id],
      );
    }
    const login = await http()
      .post('/api/auth/login')
      .send({ email, password: TEST_PASSWORD })
      .expect(200);
    adminToken = (login.body as { accessToken: string }).accessToken;

    // ── geografía, cultivos, fincas y unidades ───────────────────────────
    const one = async <T>(sql: string, params: unknown[]): Promise<T> =>
      (await ds.query<T[]>(sql, params))[0];

    const department = async (name: string) =>
      (
        await one<{ department_id: string }>(
          `INSERT INTO departments (department_id, name) VALUES (gen_random_uuid(), $1)
           RETURNING department_id`,
          [`${GEO_PREFIX} ${name}`],
        )
      ).department_id;
    const town = async (name: string, departmentId: string) =>
      (
        await one<{ town_id: string }>(
          `INSERT INTO towns (town_id, name, department_id) VALUES (gen_random_uuid(), $1, $2)
           RETURNING town_id`,
          [`${GEO_PREFIX} ${name}`, departmentId],
        )
      ).town_id;
    const cropType = async (name: string) =>
      (
        await one<{ crop_id: string }>(
          `INSERT INTO types_of_crops (crop_id, name) VALUES (gen_random_uuid(), $1)
           RETURNING crop_id`,
          [`${GEO_PREFIX} ${name}`],
        )
      ).crop_id;
    const farm = async (name: string, townId: string | null) => {
      const { farm_id } = await one<{ farm_id: string }>(
        `INSERT INTO farms (farm_id, name, town_id, area) VALUES (gen_random_uuid(), $1, $2, 1)
         RETURNING farm_id`,
        [`${GEO_PREFIX} ${name}`, townId],
      );
      farmIds.push(farm_id);
      return farm_id;
    };
    const plant = async (farmId: string, cropId: string, archived = false) => {
      const { farm_crop_id } = await one<{ farm_crop_id: string }>(
        `INSERT INTO farms_crops (farm_crop_id, farm_id, crop_id, archived_at)
         VALUES (gen_random_uuid(), $1, $2, $3)
         RETURNING farm_crop_id`,
        [farmId, cropId, archived ? new Date() : null],
      );
      farmCropIds.push(farm_crop_id);
    };

    geo.depA = await department('Dep A');
    geo.depB = await department('Dep B');
    geo.depS = await department('Dep pequeño');
    geo.tA = await town('Mun A', geo.depA);
    geo.tA2 = await town('Mun A2', geo.depA);
    geo.tB = await town('Mun B', geo.depB);
    geo.tS = await town('Mun pequeño', geo.depS);
    crop.x = await cropType('Cultivo X');
    crop.y = await cropType('Cultivo Y');
    crop.z = await cropType('Cultivo Z');

    // depA: A1 con dos cultivos activos (y uno archivado), A2–A4 y A5 con X,
    // A6 solo con X archivado.
    const a1 = await farm('Finca A1', geo.tA);
    await plant(a1, crop.x);
    await plant(a1, crop.y);
    await plant(a1, crop.z, true);
    for (const n of [2, 3, 4]) {
      await plant(await farm(`Finca A${n}`, geo.tA), crop.x);
    }
    await plant(await farm('Finca A5', geo.tA2), crop.x);
    await plant(await farm('Finca A6', geo.tA), crop.x, true);

    // depB: 7 fincas con X.
    for (let n = 1; n <= 7; n++) {
      await plant(await farm(`Finca B${n}`, geo.tB), crop.x);
    }

    // depS: 2 fincas con X (< MIN_CELL).
    for (const n of [1, 2]) {
      await plant(await farm(`Finca S${n}`, geo.tS), crop.x);
    }

    // Finca sin municipio con dos cultivos activos: no se ubica.
    const n1 = await farm('Finca N1 sin municipio', null);
    await plant(n1, crop.x);
    await plant(n1, crop.y);

    // ── categoría de prueba ──────────────────────────────────────────────
    const catRes = await http()
      .post(`${BUILDER}/categories`)
      .set(auth())
      .send({ code: CATEGORY_CODE, name: `E2E 111 categoría ${RUN}` });
    expect(catRes.status).toBe(201);
    categoryId = (catRes.body as { categoryId: string }).categoryId;
  }, 180_000);

  afterAll(async () => {
    // Orden inverso a la siembra: gráficos y categoría, unidades, fincas,
    // cultivos, municipios, departamentos y usuario.
    const chartScope = `
      SELECT chart_id FROM dashboard_charts
      WHERE category_id IN (SELECT category_id FROM dashboard_categories WHERE code LIKE '${CATEGORY_CODE_PREFIX}%')
         OR title LIKE '${TITLE_PREFIX}%'`;
    await safeQuery(
      `DELETE FROM dashboard_chart_events WHERE chart_id IN (${chartScope})`,
    );
    await safeQuery(
      `DELETE FROM dashboard_chart_sources WHERE chart_id IN (${chartScope})`,
    );
    await safeQuery(
      `DELETE FROM dashboard_charts WHERE chart_id IN (${chartScope})`,
    );
    await safeQuery(
      `DELETE FROM dashboard_categories WHERE code LIKE '${CATEGORY_CODE_PREFIX}%'`,
    );

    if (farmCropIds.length) {
      await ds.query(
        `DELETE FROM farms_crops WHERE farm_crop_id = ANY($1::uuid[])`,
        [farmCropIds],
      );
    }
    if (farmIds.length) {
      await ds.query(`DELETE FROM farms WHERE farm_id = ANY($1::uuid[])`, [
        farmIds,
      ]);
    }
    const cropIds = Object.values(crop).filter(Boolean);
    if (cropIds.length) {
      await ds.query(
        `DELETE FROM types_of_crops WHERE crop_id = ANY($1::uuid[])`,
        [cropIds],
      );
    }
    const townIds = [geo.tA, geo.tA2, geo.tB, geo.tS].filter(Boolean);
    if (townIds.length) {
      await ds.query(`DELETE FROM towns WHERE town_id = ANY($1::uuid[])`, [
        townIds,
      ]);
    }
    const departmentIds = [geo.depA, geo.depB, geo.depS].filter(Boolean);
    if (departmentIds.length) {
      await ds.query(
        `DELETE FROM departments WHERE department_id = ANY($1::uuid[])`,
        [departmentIds],
      );
    }
    await ds.query(
      `DELETE FROM api_keys WHERE user_id IN (
         SELECT user_id FROM users WHERE email LIKE '${EMAIL_PREFIX}%@test.local')`,
    );
    await ds.query(
      `DELETE FROM users WHERE email LIKE '${EMAIL_PREFIX}%@test.local'`,
    );
    await app.close();
  }, 60_000);

  // ── C1 ────────────────────────────────────────────────────────────────────

  describe('C1 — catálogo con la nueva métrica', () => {
    it('GET /entity-metrics incluye production_units_by_department con label, entity, gráficos en orden y filtros', async () => {
      const res = await http()
        .get(`${BUILDER}/entity-metrics`)
        .set(auth())
        .expect(200);
      const item = listOf<MetricCatalogItem>(res.body).find(
        (m) => m.metricKey === METRIC,
      );
      expect(item).toBeDefined();
      expect(item!.label).toBe(METRIC_LABEL);
      expect(item!.entity).toBe('production_unit');
      // Orden incluido: el primero (map) es el gráfico por defecto.
      expect(item!.charts).toEqual(['map', 'bars', 'horizontal-bars']);
      expect([...item!.filters].sort()).toEqual([...GEO_FILTERS].sort());
    });

    it('?entity=production_unit la lista junto a production_units_by_crop', async () => {
      const res = await http()
        .get(`${BUILDER}/entity-metrics`)
        .query({ entity: 'production_unit' })
        .set(auth())
        .expect(200);
      expect(
        listOf<MetricCatalogItem>(res.body)
          .map((m) => m.metricKey)
          .sort(),
      ).toEqual(['production_units_by_crop', METRIC].sort());
    });
  });

  // ── C2 ────────────────────────────────────────────────────────────────────

  describe('C2 — gráficos admitidos y rechazados', () => {
    it.each(['map', 'bars', 'horizontal-bars'])(
      'crear un gráfico %s con la métrica responde 201 en borrador',
      async (chartKind) => {
        const chart = await createMetricChart(chartKind);
        expect(chart.status).toBe('draft');
        expect(chart.sourceKind).toBe('entity_metric');
        expect(chart.metricKey).toBe(METRIC);
        expect(chart.chartKind).toBe(chartKind);
      },
    );

    it.each(['donut', 'histogram'])(
      'crear un gráfico %s con la métrica responde 400 DASHBOARD_CHART_INCOMPATIBLE',
      async (chartKind) => {
        const res = await http()
          .post(`${BUILDER}/charts`)
          .set(auth())
          .send(metricBody(chartKind));
        expect(res.status).toBe(400);
        expect((res.body as BuilderError).code).toBe(CHART_INCOMPATIBLE);
      },
    );
  });

  // ── C3 ────────────────────────────────────────────────────────────────────

  describe('C3 — cuenta filas activas de farms_crops por el departamento de la finca', () => {
    it('una finca con dos cultivos activos suma 2; las unidades archivadas no suman', async () => {
      const chartId = await sharedChart();
      // depA: A1 (X, Y) + A2–A4 + A5 = 6; ni Z archivado de A1 ni X archivado de A6.
      const body = await preview(chartId, 'public', {
        departmentId: geo.depA,
      });
      expect(body.metricKey).toBe(METRIC);
      expect(body.series).toHaveLength(1);
      const series = body.series[0];
      expect(series.suppressed).toBe(false);
      expect(series.answeredCount).toBe(6);
      expect(bucketsOf(series).map((b) => b.id)).toEqual([geo.depA]);
      expect(bucketOf(series, geo.depA)).toEqual(
        expect.objectContaining({ count: 6, suppressed: false }),
      );
    });

    it('una finca sin municipio no suma en ningún departamento ni entra en el total', async () => {
      const chartId = await sharedChart();
      // cropId = X: 5 (depA) + 7 (depB) + 2 (depS) = 14 ubicadas; N1 queda fuera.
      const body = await preview(chartId, 'private', { cropId: crop.x });
      const series = body.series[0];
      expect(series.answeredCount).toBe(14);
      expect(
        bucketsOf(series)
          .map((b) => b.id)
          .sort(),
      ).toEqual([geo.depA, geo.depB, geo.depS].sort());
    });
  });

  // ── C4 ────────────────────────────────────────────────────────────────────

  describe('C4 — los buckets particionan el total ubicado', () => {
    it('con datos propios: visibles + suprimidos = answeredCount, y cada visible ≥ MIN_CELL', async () => {
      const chartId = await sharedChart();
      for (const audience of AUDIENCES) {
        const body = await preview(chartId, audience, { cropId: crop.x });
        const series = body.series[0];
        expect(series.suppressed).toBe(false);
        expectPrivacyInvariants(series);

        // Conteos reales sembrados por departamento (los suprimidos llegan sin número).
        const seeded: Record<string, number> = {
          [geo.depA]: 5,
          [geo.depB]: 7,
          [geo.depS]: 2,
        };
        const buckets = bucketsOf(series);
        const total = buckets.reduce((sum, b) => sum + seeded[b.id], 0);
        expect(total).toBe(series.answeredCount);
        for (const b of buckets) {
          if (!b.suppressed) expect(b.count).toBe(seeded[b.id]);
        }
        // depB es la única visible: 7 de 14.
        expect(bucketOf(series, geo.depB)).toEqual(
          expect.objectContaining({
            count: 7,
            percentage: 50,
            suppressed: false,
          }),
        );
      }
    });

    it('sin filtros (base completa de desarrollo): ningún visible supera el total y cada visible ≥ MIN_CELL', async () => {
      const chartId = await sharedChart();
      for (const audience of AUDIENCES) {
        const body = await preview(chartId, audience);
        const series = body.series[0];
        expect(series.suppressed).toBe(false);
        expectPrivacyInvariants(series);
        const buckets = bucketsOf(series);
        const visibleSum = buckets
          .filter((b) => !b.suppressed)
          .reduce((sum, b) => sum + (b.count ?? 0), 0);
        if (buckets.some((b) => b.suppressed)) {
          expect(visibleSum).toBeLessThan(series.answeredCount ?? 0);
        } else {
          expect(visibleSum).toBe(series.answeredCount);
        }
      }
    });
  });

  // ── C5 ────────────────────────────────────────────────────────────────────

  describe('C5 — privacidad: celda mínima, supresión complementaria y umbral global', () => {
    it.each(AUDIENCES)(
      '(%s) un departamento con 1–4 unidades llega suprimido, nunca 0 ni omitido, y no queda una única celda suprimida',
      async (audience) => {
        const chartId = await sharedChart();
        const filterSets: Record<string, string>[] = [{}, { cropId: crop.x }];
        for (const filters of filterSets) {
          const body = await preview(chartId, audience, filters);
          const series = body.series[0];
          expect(bucketOf(series, geo.depS)).toEqual(
            expect.objectContaining({
              count: null,
              percentage: null,
              suppressed: true,
            }),
          );
          expectPrivacyInvariants(series);
        }
        // Con cropId = X la complementaria oculta también depA (la siguiente más pequeña).
        const byCrop = await preview(chartId, audience, { cropId: crop.x });
        expect(bucketOf(byCrop.series[0], geo.depA)).toEqual(
          expect.objectContaining({ count: null, suppressed: true }),
        );
      },
    );

    it.each(AUDIENCES)(
      '(%s) con menos de MIN_SAMPLE_THRESHOLD unidades ubicadas la serie entera se suprime',
      async (audience) => {
        const chartId = await sharedChart();
        const body = await preview(chartId, audience, {
          departmentId: geo.depS,
        });
        const series = body.series[0];
        expect(series.answeredCount ?? 0).toBeLessThan(MIN_SAMPLE);
        expect(series.suppressed).toBe(true);
        expect(series.aggregation).toBeNull();
      },
    );
  });

  // ── C6 ────────────────────────────────────────────────────────────────────

  describe('C6 — filtros', () => {
    it('departmentId restringe las unidades al departamento', async () => {
      const chartId = await sharedChart();
      const body = await preview(chartId, 'public', { departmentId: geo.depB });
      const series = body.series[0];
      expect(series.answeredCount).toBe(7);
      expect(bucketsOf(series).map((b) => b.id)).toEqual([geo.depB]);
      expect(bucketOf(series, geo.depB).count).toBe(7);
    });

    it('townId restringe las unidades al municipio', async () => {
      const chartId = await sharedChart();
      // tA: A1 (X, Y) + A2–A4 = 5; A5 está en tA2.
      const body = await preview(chartId, 'public', { townId: geo.tA });
      const series = body.series[0];
      expect(series.answeredCount).toBe(5);
      expect(bucketsOf(series).map((b) => b.id)).toEqual([geo.depA]);
      expect(bucketOf(series, geo.depA).count).toBe(5);
    });

    it('cropId restringe la propia fila de farms_crops (A5), no «fincas que tienen ese cultivo»', async () => {
      const chartId = await sharedChart();
      // depA con cropId = X: 5 (A1–A5). Con EXISTS contaría también Y de A1 (6).
      const x = await preview(chartId, 'public', {
        departmentId: geo.depA,
        cropId: crop.x,
      });
      expect(x.series[0].answeredCount).toBe(5);
      expect(bucketOf(x.series[0], geo.depA).count).toBe(5);

      // depA con cropId = Y: 1 unidad (A1). Con EXISTS serían 2 (X e Y de A1).
      // Por debajo del umbral: serie suprimida, pero el total es el de Y.
      const y = await preview(chartId, 'private', {
        departmentId: geo.depA,
        cropId: crop.y,
      });
      expect(y.series[0].suppressed).toBe(true);
      expect(y.series[0].answeredCount).toBe(1);
    });

    it('los filtros derivados de respuestas no cambian el resultado y se informan en ignoredFilters', async () => {
      const chartId = await sharedChart();
      const body = await preview(chartId, 'public', {
        departmentId: geo.depA,
        gender: 'Mujer',
        dateFrom: '2099-01-01',
      });
      expect(body.series[0].answeredCount).toBe(6);
      expect(bucketOf(body.series[0], geo.depA).count).toBe(6);
      expect([...body.ignoredFilters].sort()).toEqual(['dateFrom', 'gender']);

      const plain = await preview(chartId, 'public', {
        departmentId: geo.depA,
      });
      expect(plain.ignoredFilters).toEqual([]);
    });
  });

  // ── C12 / C13 (backend) ───────────────────────────────────────────────────

  describe('C12/C13 — servicio público y endpoints heredados', () => {
    it('un gráfico de mapa publicado con la métrica se sirve por el endpoint público', async () => {
      const chart = await createMetricChart('map', { layout: 'wide' });
      const pub = await http()
        .post(`${BUILDER}/charts/${chart.chartId}/publish`)
        .set(auth());
      expect([200, 201]).toContain(pub.status);

      const res = await http()
        .get(PUBLIC_CHARTS)
        .query({ categoryId: CATEGORY_CODE, cropId: crop.x })
        .expect(200);
      const served = (res.body as ServedChartsBody).charts.find(
        (c) => c.chartId === chart.chartId,
      );
      expect(served).toBeDefined();
      expect(served!.sourceKind).toBe('entity_metric');
      expect(served!.metricKey).toBe(METRIC);
      expect(served!.chartKind).toBe('map');
      expect(served!.ignoredFilters).toEqual([]);
      expect(served!.suppressed).toBe(false);
      expect(served!.answeredCount).toBe(14);

      const series = served!.series[0];
      expectPrivacyInvariants(series);
      expect(bucketOf(series, geo.depB)).toEqual(
        expect.objectContaining({ count: 7, suppressed: false }),
      );
      expect(bucketOf(series, geo.depS)).toEqual(
        expect.objectContaining({ count: null, suppressed: true }),
      );
    });

    it('GET /dashboard/overview responde 200 con su contrato actual', async () => {
      const res = await http().get('/api/dashboard/overview').expect(200);
      const body = res.body as Record<string, unknown>;
      expect(body).toEqual(
        expect.objectContaining({
          totalCount: expect.any(Number) as number,
          suppressed: expect.any(Boolean) as boolean,
        }),
      );
      for (const key of ['byActorType', 'byCrop', 'byDepartment']) {
        expect(Array.isArray(body[key])).toBe(true);
      }
      expect(body).toHaveProperty('age');
      expect(body).toHaveProperty('experienceYears');
    });

    it('GET /dashboard/department-counts responde 200 con su contrato actual', async () => {
      const res = await http()
        .get('/api/dashboard/department-counts')
        .expect(200);
      expect(Array.isArray(res.body)).toBe(true);
      for (const row of res.body as Record<string, unknown>[]) {
        expect(typeof row.departmentId).toBe('string');
        expect(typeof row.departmentName).toBe('string');
        expect(typeof row.count).toBe('number');
      }
    });
  });
});
