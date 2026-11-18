/**
 * Spec 109 — Constructor en el panel y dashboards sobre gráficos.
 * `spec/109_constructor_dashboard_panel_y_servicio.md` (raíz del ecosistema).
 *
 * ESTAS PRUEBAS NACEN EN ROJO (enfoque test-first). Hoy:
 *   - no existen las tablas ni la API del constructor (spec 108), así que el
 *     `beforeAll` falla al crear la primera categoría por API: TODO el archivo
 *     queda en rojo por esa razón hasta que el 108 esté mergeado;
 *   - con el 108 disponible, el rojo pasa a venir de las rutas de servicio de
 *     este spec (`/dashboard/charts`, `/dashboard/private/*`), que no existen,
 *     y de la ruta por categoría opt-out (`/dashboard/analytics?categoryId=`),
 *     que sigue sirviendo «todas las elegibles».
 *
 * Criterios cubiertos: 1–8 (backend). Los criterios 9–11 viven en
 * `frontend/lib/dashboard/e2e-109-constructorDashboardPanelYServicio.test.ts`
 * y los 12–14 en `docs/testing/test-109-constructor-dashboard-panel-y-servicio.md`.
 * La parte del criterio 6 sobre métricas de entidad usa el catálogo de P13
 * (spec 108): el gráfico servido de una métrica lleva `metricKey` e
 * `ignoredFilters` (filtros recibidos que la métrica no acepta).
 *
 * ── Contrato supuesto ──────────────────────────────────────────────────────
 * Ni el 108 ni el 109 fijan las rutas exactas. Las del constructor siguen el
 * contrato que fija `test/e2e-108-constructor-dashboard-modelo-y-api.e2e-spec.ts`
 * (base `/api/dashboard/builder`); las de servicio las asume este archivo. Todo
 * se concentra en constantes y helpers: si la implementación elige otras, se
 * ajustan AQUÍ (con aprobación, como cualquier cambio de pruebas) sin tocar
 * los casos.
 *
 *   Constructor (spec 108, `@Roles(ADMIN)`, base /api/dashboard/builder):
 *     POST  /categories            { code, name } → { categoryId }
 *     PATCH /categories/:id        { isActive: false }
 *     POST  /charts                { …, series: [{ seriesKey, label, questionIds }] } → { chartId, status: 'draft' }
 *     PATCH /charts/reorder        { categoryId, chartIds }
 *     POST  /charts/:id/publish
 *     POST  /charts/:id/archive
 *     GET   /charts/:id            → { health: 'ok' | 'needs_review' }
 *
 *   Servicio (este spec):
 *     GET /api/dashboard/categories                      público, lista [{ code, name }]
 *     GET /api/dashboard/charts?categoryId=<code>&…      público, `public, max-age=300`
 *     GET /api/dashboard/private/categories              ADMIN/RESEARCHER, `private, no-store`
 *     GET /api/dashboard/private/charts?categoryId=<code>&…   ídem
 *   Cuerpo de `charts`: `{ suppressed, charts: ServedChart[] }`, con
 *   `ServedChart = { chartId, title, chartKind, combineMode, layout, suppressed,
 *   answeredCount, … }` (agregación o series, según el 108).
 *
 * ENTORNO: SOLO contra la base de desarrollo (`DATABASE_URL` activa del `.env`,
 * Neon `sosagro-dev`), NUNCA contra producción. Identidades con prefijo
 * `Spec109` / `e2e-109`. Todo se elimina en `afterAll`.
 */

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getOptionsToken } from '@nestjs/throttler';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { AppModule } from '../src/app.module';

jest.setTimeout(180_000);

const TEST_PASSWORD = 'E2eTest1234!';
const PREFIX = 'e2e-109';
const RUN = Date.now().toString().slice(-6);
// Códigos de categoría propios: `C9` + 3 dígitos + sufijo. Encajan en un
// patrón `C<n>` y no chocan con C1–C14 ni entre corridas.
const CODE_BASE = `C9${String(100 + (Number(RUN) % 800))}`;
const UNKNOWN_CATEGORY_CODE = 'C99999';

const BUILDER = '/api/dashboard/builder';
const PUBLIC_CATEGORIES = '/api/dashboard/categories';
const PUBLIC_CHARTS = '/api/dashboard/charts';
const PRIVATE_CATEGORIES = '/api/dashboard/private/categories';
const PRIVATE_CHARTS = '/api/dashboard/private/charts';
const HEALTH_NEEDS_REVIEW = 'needs_review';
// systemField identificante (denylist del 107): basta para bloquear una fuente.
const BLOCKING_SYSTEM_FIELD = 'farmer.documentId';

const SURVEYS = 8;

interface LoginResponse {
  accessToken: string;
}

interface ServedChart {
  chartId: string;
  title: string;
  chartKind: string;
  combineMode: 'merge' | 'compare';
  layout: string;
  suppressed: boolean;
  answeredCount?: number;
}

/** Gráfico servido de una métrica de entidad (P13 del 108). */
interface MetricServedChart extends ServedChart {
  metricKey: string;
  ignoredFilters: string[];
}

interface ServedChartsBody {
  suppressed?: boolean;
  charts: ServedChart[];
}

interface ServedCategory {
  code?: string;
  id?: string;
  name: string;
}

type Audience = 'public' | 'private';

describe('Spec 109 — dashboards sobre gráficos (e2e)', () => {
  let app: INestApplication<App>;
  let ds: DataSource;
  let adminToken: string;
  let researcherToken: string;
  let pollsterToken: string;

  let instrumentId: string;
  const surveyIds: string[] = [];
  const categoryIds: string[] = [];

  // Preguntas (todas yes_no, del mismo instrumento activo).
  const q: Record<string, string> = {};
  const UNUSED_TEXT = `Spec109 pregunta sin gráfico ${RUN}`;

  // Categorías (código → id).
  const cat = {
    a: { code: `${CODE_BASE}1`, id: '' }, // mezcla de estados y audiencias
    b: { code: `${CODE_BASE}2`, id: '' }, // solo un gráfico privado publicado
    c: { code: `${CODE_BASE}3`, id: '' }, // con gráfico público, luego desactivada
    d: { code: `${CODE_BASE}4`, id: '' }, // orden
  };

  // Gráficos.
  const ch: Record<string, string> = {};

  // Municipios homónimos en dos departamentos (auditoría 95 del 66).
  const HOMONYM = `Spec109 Pueblo ${RUN}`;
  const townIds: string[] = [];
  const homonymDepartments: string[] = [];

  const http = () => request(app.getHttpServer());
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  // ── Helpers de datos ────────────────────────────────────────────────────

  async function ensureUser(role: string): Promise<string> {
    const email = `${PREFIX}-${role}@test.local`;
    const rows = await ds.query<{ user_id: string }[]>(
      `SELECT user_id FROM users WHERE email = $1`,
      [email],
    );
    if (!rows.length) {
      const roles = await ds.query<{ role_id: string }[]>(
        `SELECT role_id FROM roles WHERE name = $1`,
        [role],
      );
      const hash = await bcrypt.hash(TEST_PASSWORD, 10);
      await ds.query(
        `INSERT INTO users (user_id, name, last_name, email, password, role_id, must_change_password)
         VALUES (gen_random_uuid(), 'E2E', 'Spec109', $1, $2, $3, false)`,
        [email, hash, roles[0].role_id],
      );
    }
    const login = await http()
      .post('/api/auth/login')
      .send({ email, password: TEST_PASSWORD })
      .expect(200);
    return (login.body as LoginResponse).accessToken;
  }

  async function insertYesNo(
    sectionId: string,
    text: string,
    order: number,
  ): Promise<string> {
    const [type] = await ds.query<{ type_id: string }[]>(
      `SELECT type_id FROM types_of_questions WHERE name = 'yes_no'`,
    );
    const [row] = await ds.query<{ question_id: string }[]>(
      `INSERT INTO questions (question_id, section_id, text, type_id, is_required, "order")
       VALUES (gen_random_uuid(), $1, $2, $3, false, $4)
       RETURNING question_id`,
      [sectionId, text, type.type_id, order],
    );
    return row.question_id;
  }

  /** Responde `questionId` en las encuestas indicadas: `true` en `yes`, `false` en el resto. */
  async function answer(
    questionId: string,
    surveyIndexes: number[],
    yes: (i: number) => boolean = () => true,
  ) {
    for (const i of surveyIndexes) {
      await ds.query(
        `INSERT INTO responses (response_id, survey_id, question_id, boolean_value)
         VALUES (gen_random_uuid(), $1, $2, $3)`,
        [surveyIds[i], questionId, yes(i)],
      );
    }
  }

  const range = (from: number, to: number) =>
    Array.from({ length: to - from + 1 }, (_, k) => from + k);

  // ── Helpers del constructor (API del spec 108) ──────────────────────────

  function builderUnavailable(what: string, res: request.Response): Error {
    return new Error(
      `API del constructor (spec 108) no disponible o con otro contrato: ${what} → ${res.status} ${JSON.stringify(res.body)}`,
    );
  }

  async function createCategory(code: string, name: string): Promise<string> {
    const res = await http()
      .post(`${BUILDER}/categories`)
      .set(auth(adminToken))
      .send({ code, name });
    if (res.status !== 201) throw builderUnavailable('POST categories', res);
    const id = (res.body as { categoryId: string }).categoryId;
    categoryIds.push(id);
    return id;
  }

  async function deactivateCategory(categoryId: string) {
    const res = await http()
      .patch(`${BUILDER}/categories/${categoryId}`)
      .set(auth(adminToken))
      .send({ isActive: false });
    if (res.status !== 200) throw builderUnavailable('PATCH category', res);
  }

  async function createChart(opts: {
    categoryId: string;
    title: string;
    audience: Audience;
    questionIds: string[];
  }): Promise<string> {
    const res = await http()
      .post(`${BUILDER}/charts`)
      .set(auth(adminToken))
      .send({
        categoryId: opts.categoryId,
        title: opts.title,
        sourceKind: 'questions',
        combineMode: 'merge',
        chartKind: 'donut',
        audience: opts.audience,
        layout: 'normal',
        series: [
          {
            seriesKey: 's1',
            label: opts.title,
            questionIds: opts.questionIds,
          },
        ],
      });
    if (res.status !== 201) throw builderUnavailable('POST charts', res);
    return (res.body as { chartId: string }).chartId;
  }

  async function chartAction(chartId: string, action: 'publish' | 'archive') {
    const res = await http()
      .post(`${BUILDER}/charts/${chartId}/${action}`)
      .set(auth(adminToken));
    if (res.status !== 200 && res.status !== 201) {
      throw builderUnavailable(`POST charts/:id/${action}`, res);
    }
  }

  async function publishedChart(
    categoryId: string,
    title: string,
    audience: Audience,
    questionIds: string[],
  ): Promise<string> {
    const id = await createChart({ categoryId, title, audience, questionIds });
    await chartAction(id, 'publish');
    return id;
  }

  // ── Helpers de servicio ─────────────────────────────────────────────────

  function getCharts(
    audience: Audience,
    categoryCode: string,
    token?: string,
    extra: Record<string, string> = {},
  ) {
    const req = http()
      .get(audience === 'public' ? PUBLIC_CHARTS : PRIVATE_CHARTS)
      .query({ categoryId: categoryCode, ...extra });
    return token ? req.set(auth(token)) : req;
  }

  async function servedCharts(
    audience: Audience,
    categoryCode: string,
    token?: string,
    extra: Record<string, string> = {},
  ): Promise<ServedChartsBody> {
    const res = await getCharts(audience, categoryCode, token, extra).expect(
      200,
    );
    return res.body as ServedChartsBody;
  }

  const idsOf = (body: ServedChartsBody) => body.charts.map((c) => c.chartId);
  const find = (body: ServedChartsBody, chartId: string) =>
    body.charts.find((c) => c.chartId === chartId);
  const codeOf = (c: ServedCategory) => c.code ?? c.id;

  /** Recorre un JSON y devuelve los valores numéricos de claves que terminan en «count». */
  function countValues(node: unknown, out: number[] = []): number[] {
    if (Array.isArray(node)) {
      node.forEach((n) => countValues(n, out));
    } else if (node && typeof node === 'object') {
      for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
        if (/count$/i.test(k) && k !== 'answeredCount' && typeof v === 'number')
          out.push(v);
        countValues(v, out);
      }
    }
    return out;
  }

  /** true si algún objeto anidado (no la raíz) declara `suppressed: true`. */
  function hasNestedSuppressed(node: unknown, depth = 0): boolean {
    if (Array.isArray(node))
      return node.some((n) => hasNestedSuppressed(n, depth + 1));
    if (node && typeof node === 'object') {
      const obj = node as Record<string, unknown>;
      if (depth > 0 && obj.suppressed === true) return true;
      return Object.values(obj).some((v) => hasNestedSuppressed(v, depth + 1));
    }
    return false;
  }

  // ── Siembra ─────────────────────────────────────────────────────────────

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

    adminToken = await ensureUser('admin');
    researcherToken = await ensureUser('researcher');
    pollsterToken = await ensureUser('pollster');

    const [instrument] = await ds.query<{ instrument_id: string }[]>(
      `INSERT INTO instruments (instrument_id, name, version, publish_date, is_active)
       VALUES (gen_random_uuid(), $1, 1, CURRENT_DATE, true)
       RETURNING instrument_id`,
      [`Spec109 Instrumento ${RUN}`],
    );
    instrumentId = instrument.instrument_id;
    const [section] = await ds.query<{ section_id: string }[]>(
      `INSERT INTO sections (section_id, name, "order", instrument_id)
       VALUES (gen_random_uuid(), 'Spec109 sección', 1, $1)
       RETURNING section_id`,
      [instrumentId],
    );

    const names = [
      'pub',
      'priv',
      'draft',
      'arch',
      'mergeA',
      'mergeB',
      'solo',
      'small',
      'cell',
      'privOnly',
      'catC',
    ];
    for (const [i, name] of names.entries()) {
      q[name] = await insertYesNo(
        section.section_id,
        `Spec109 ${name} ${RUN}`,
        i + 1,
      );
    }
    q.unused = await insertYesNo(
      section.section_id,
      UNUSED_TEXT,
      names.length + 1,
    );

    for (let i = 0; i < SURVEYS; i++) {
      const [row] = await ds.query<{ survey_id: string }[]>(
        `INSERT INTO surveys (survey_id, sincronized) VALUES (gen_random_uuid(), true)
         RETURNING survey_id`,
      );
      surveyIds.push(row.survey_id);
      await ds.query(
        `INSERT INTO surveys_instruments (survey_id, instrument_id) VALUES ($1, $2)`,
        [row.survey_id, instrumentId],
      );
    }

    const all = range(0, SURVEYS - 1);
    for (const name of [
      'pub',
      'priv',
      'draft',
      'arch',
      'solo',
      'privOnly',
      'catC',
      'unused',
    ]) {
      await answer(q[name], all);
    }
    // Fusión: A en 6 encuestas, B en las otras 2 → 8 con B, 6 sin B.
    await answer(q.mergeA, range(0, 5));
    await answer(q.mergeB, range(6, 7));
    // Muestra por debajo de MIN_SAMPLE_THRESHOLD (5).
    await answer(q.small, range(0, 2));
    // Celda «No» con 2 respuestas (< MIN_CELL_SIZE = 5), «Sí» con 6.
    await answer(q.cell, all, (i) => i < 6);

    // Categorías y gráficos vía la API del constructor (spec 108).
    cat.a.id = await createCategory(cat.a.code, `Spec109 A ${RUN}`);
    cat.b.id = await createCategory(cat.b.code, `Spec109 B ${RUN}`);
    cat.c.id = await createCategory(cat.c.code, `Spec109 C ${RUN}`);
    cat.d.id = await createCategory(cat.d.code, `Spec109 D ${RUN}`);

    ch.pub = await publishedChart(cat.a.id, 'Spec109 público', 'public', [
      q.pub,
    ]);
    ch.priv = await publishedChart(cat.a.id, 'Spec109 privado', 'private', [
      q.priv,
    ]);
    ch.draft = await createChart({
      categoryId: cat.a.id,
      title: 'Spec109 borrador',
      audience: 'public',
      questionIds: [q.draft],
    });
    ch.arch = await publishedChart(cat.a.id, 'Spec109 archivado', 'public', [
      q.arch,
    ]);
    await chartAction(ch.arch, 'archive');
    ch.merge = await publishedChart(cat.a.id, 'Spec109 fusión', 'public', [
      q.mergeA,
      q.mergeB,
    ]);
    ch.solo = await publishedChart(cat.a.id, 'Spec109 solo', 'public', [
      q.solo,
    ]);
    ch.small = await publishedChart(cat.a.id, 'Spec109 muestra', 'public', [
      q.small,
    ]);
    ch.cell = await publishedChart(cat.a.id, 'Spec109 celda', 'public', [
      q.cell,
    ]);

    ch.privOnly = await publishedChart(
      cat.b.id,
      'Spec109 solo privado',
      'private',
      [q.privOnly],
    );

    ch.catC = await publishedChart(cat.c.id, 'Spec109 C', 'public', [q.catC]);
    await deactivateCategory(cat.c.id);

    ch.d1 = await publishedChart(cat.d.id, 'Spec109 orden 1', 'public', [
      q.pub,
    ]);
    ch.d2 = await publishedChart(cat.d.id, 'Spec109 orden 2', 'public', [
      q.pub,
    ]);
    ch.d3 = await publishedChart(cat.d.id, 'Spec109 orden 3', 'public', [
      q.pub,
    ]);
    const reorder = await http()
      .patch(`${BUILDER}/charts/reorder`)
      .set(auth(adminToken))
      .send({ categoryId: cat.d.id, chartIds: [ch.d3, ch.d1, ch.d2] });
    if (reorder.status !== 200) {
      throw builderUnavailable('PATCH charts/reorder', reorder);
    }

    // Homónimos: dos preguntas «Municipio» fusionadas cuyas opciones con el
    // mismo texto apuntan (metadata_id) a municipios de departamentos distintos.
    const departments = await ds.query<
      { department_id: string; name: string }[]
    >(`SELECT department_id, name FROM departments ORDER BY name LIMIT 2`);
    for (const dept of departments) {
      const [town] = await ds.query<{ town_id: string }[]>(
        `INSERT INTO towns (town_id, name, department_id)
         VALUES (gen_random_uuid(), $1, $2) RETURNING town_id`,
        [HOMONYM, dept.department_id],
      );
      townIds.push(town.town_id);
      homonymDepartments.push(dept.name);
    }
    const [singleType] = await ds.query<{ type_id: string }[]>(
      `SELECT type_id FROM types_of_questions WHERE name = 'single_choice'`,
    );
    const townOptionIds: string[][] = [];
    for (const [qi, name] of ['townA', 'townB'].entries()) {
      const [row] = await ds.query<{ question_id: string }[]>(
        `INSERT INTO questions (question_id, section_id, text, type_id, is_required, "order")
         VALUES (gen_random_uuid(), $1, $2, $3, false, $4) RETURNING question_id`,
        [
          section.section_id,
          `Spec109 ${name} ${RUN}`,
          singleType.type_id,
          100 + qi,
        ],
      );
      q[name] = row.question_id;
      const ids: string[] = [];
      for (const townId of townIds) {
        const [opt] = await ds.query<{ option_id: string }[]>(
          `INSERT INTO options_question (option_id, question_id, text, metadata_id)
           VALUES (gen_random_uuid(), $1, $2, $3) RETURNING option_id`,
          [row.question_id, HOMONYM, townId],
        );
        ids.push(opt.option_id);
      }
      townOptionIds.push(ids);
    }
    // townA: 6 encuestas en el municipio del primer departamento;
    // townB: 2 encuestas en el del segundo.
    for (const i of range(0, 5)) {
      await ds.query(
        `INSERT INTO responses (response_id, survey_id, question_id, option_id)
         VALUES (gen_random_uuid(), $1, $2, $3)`,
        [surveyIds[i], q.townA, townOptionIds[0][0]],
      );
    }
    for (const i of range(6, 7)) {
      await ds.query(
        `INSERT INTO responses (response_id, survey_id, question_id, option_id)
         VALUES (gen_random_uuid(), $1, $2, $3)`,
        [surveyIds[i], q.townB, townOptionIds[1][1]],
      );
    }
    {
      const res = await http()
        .post(`${BUILDER}/charts`)
        .set(auth(adminToken))
        .send({
          categoryId: cat.a.id,
          title: 'Spec109 municipio',
          sourceKind: 'questions',
          combineMode: 'merge',
          chartKind: 'bars',
          audience: 'public',
          layout: 'normal',
          series: [
            {
              seriesKey: 's1',
              label: 'Municipio',
              questionIds: [q.townA, q.townB],
            },
          ],
        });
      if (res.status !== 201)
        throw builderUnavailable('POST charts (municipio)', res);
      ch.homonym = (res.body as { chartId: string }).chartId;
      await chartAction(ch.homonym, 'publish');
    }

    // Criterio 4: tras publicar, dos fuentes pasan a estar bloqueadas.
    await ds.query(
      `UPDATE questions SET system_field = $1 WHERE question_id = ANY($2::uuid[])`,
      [BLOCKING_SYSTEM_FIELD, [q.mergeB, q.solo]],
    );
  });

  afterAll(async () => {
    const safe = async (sql: string, params: unknown[] = []) => {
      try {
        await ds.query(sql, params);
      } catch {
        /* limpieza tolerante: las tablas del 108 pueden no existir aún */
      }
    };
    const questionIds = Object.values(q);
    // Gráficos (fuentes y eventos caen en cascada), luego categorías.
    await safe(
      `DELETE FROM dashboard_charts WHERE category_id = ANY($1::uuid[])`,
      [categoryIds],
    );
    await safe(
      `DELETE FROM dashboard_categories WHERE category_id = ANY($1::uuid[])`,
      [categoryIds],
    );
    await safe(`DELETE FROM responses WHERE survey_id = ANY($1::uuid[])`, [
      surveyIds,
    ]);
    await safe(
      `DELETE FROM surveys_instruments WHERE survey_id = ANY($1::uuid[])`,
      [surveyIds],
    );
    await safe(`DELETE FROM surveys WHERE survey_id = ANY($1::uuid[])`, [
      surveyIds,
    ]);
    await safe(`DELETE FROM questions WHERE question_id = ANY($1::uuid[])`, [
      questionIds,
    ]);
    await safe(`DELETE FROM sections WHERE instrument_id = $1`, [instrumentId]);
    await safe(`DELETE FROM towns WHERE town_id = ANY($1::uuid[])`, [townIds]);
    await safe(`DELETE FROM instruments WHERE instrument_id = $1`, [
      instrumentId,
    ]);
    await safe(`DELETE FROM users WHERE email LIKE $1`, [`${PREFIX}-%`]);
    await app.close();
  });

  // ── Criterio 1 ──────────────────────────────────────────────────────────

  describe('criterio 1 — el público solo sirve gráficos publicados, activos y públicos', () => {
    it('sirve el gráfico público publicado y excluye privado, borrador y archivado', async () => {
      const res = await getCharts('public', cat.a.code).expect(200);
      const ids = idsOf(res.body as ServedChartsBody);
      expect(ids).toContain(ch.pub);
      expect(ids).not.toContain(ch.priv);
      expect(ids).not.toContain(ch.draft);
      expect(ids).not.toContain(ch.arch);

      // Cada gráfico servido declara su modo de combinación (el frontend lo
      // usa para resolver la comparación, p. ej. `diverging-matrix`).
      const charts = (res.body as ServedChartsBody).charts;
      expect(charts.length).toBeGreaterThan(0);
      for (const chart of charts) {
        expect(['merge', 'compare']).toContain(chart.combineMode);
      }
    });

    it('una pregunta elegible que ningún gráfico usa no aparece en ningún endpoint público', async () => {
      const responses = await Promise.all([
        http().get(PUBLIC_CATEGORIES),
        getCharts('public', cat.a.code),
        getCharts('public', cat.d.code),
        http().get('/api/dashboard/analytics').query({ categoryId: 'C1' }),
        http().get('/api/dashboard/summary'),
        http().get('/api/dashboard/overview'),
      ]);
      // La ruta de gráficos tiene que existir para que la ausencia signifique algo.
      expect(responses[1].status).toBe(200);
      for (const res of responses) {
        const raw = JSON.stringify(res.body);
        expect(raw).not.toContain(q.unused);
        expect(raw).not.toContain(UNUSED_TEXT);
      }
    });
  });

  // ── Criterio 2 ──────────────────────────────────────────────────────────

  describe('criterio 2 — dashboard privado', () => {
    it('sin token responde 401', async () => {
      await getCharts('private', cat.a.code).expect(401);
      await http().get(PRIVATE_CATEGORIES).expect(401);
    });

    it('POLLSTER recibe 403', async () => {
      await getCharts('private', cat.a.code, pollsterToken).expect(403);
      await http().get(PRIVATE_CATEGORIES).set(auth(pollsterToken)).expect(403);
    });

    it.each([
      ['ADMIN', () => adminToken],
      ['RESEARCHER', () => researcherToken],
    ])(
      '%s recibe públicos y privados publicados, sin borradores ni archivados',
      async (_role, token) => {
        const res = await getCharts('private', cat.a.code, token()).expect(200);
        const ids = idsOf(res.body as ServedChartsBody);
        expect(ids).toEqual(expect.arrayContaining([ch.pub, ch.priv]));
        expect(ids).not.toContain(ch.draft);
        expect(ids).not.toContain(ch.arch);
      },
    );

    it('responde con Cache-Control: private, no-store', async () => {
      const res = await getCharts('private', cat.a.code, adminToken).expect(
        200,
      );
      expect(res.headers['cache-control']).toBe('private, no-store');
      const cats = await http()
        .get(PRIVATE_CATEGORIES)
        .set(auth(researcherToken))
        .expect(200);
      expect(cats.headers['cache-control']).toBe('private, no-store');
    });
  });

  // ── Criterio 3 ──────────────────────────────────────────────────────────

  describe('criterio 3 — ninguna ruta pública agrega «todas las elegibles»', () => {
    it('la consulta pública por categoría opt-out ya no devuelve preguntas', async () => {
      const res = await http()
        .get('/api/dashboard/analytics')
        .query({ categoryId: 'C1' });
      const questions = (res.body as { questions?: unknown[] }).questions ?? [];
      expect({
        status: res.status,
        questions: res.status === 200 ? questions.length : 0,
      }).toEqual({ status: res.status, questions: 0 });
    });

    it('la consulta por instrumento sigue cerrada al público (401)', async () => {
      await http()
        .get('/api/dashboard/analytics')
        .query({ instrumentId })
        .expect(401);
    });
  });

  // ── Criterio 4 ──────────────────────────────────────────────────────────

  describe('criterio 4 — fuentes bloqueadas al servir', () => {
    it('una fuente bloqueada se excluye de un gráfico fusionado', async () => {
      const body = await servedCharts('public', cat.a.code);
      const merged = find(body, ch.merge);
      expect(merged).toBeDefined();
      // Sin la fuente bloqueada quedan las 6 encuestas de la fuente A.
      expect(merged?.answeredCount).toBe(6);
      expect(JSON.stringify(merged)).not.toContain(q.mergeB);
    });

    it('un gráfico sin fuentes válidas no se sirve en ninguna audiencia', async () => {
      expect(idsOf(await servedCharts('public', cat.a.code))).not.toContain(
        ch.solo,
      );
      expect(
        idsOf(await servedCharts('private', cat.a.code, adminToken)),
      ).not.toContain(ch.solo);
    });

    it('el constructor muestra ese gráfico como «requiere revisión»', async () => {
      const res = await http()
        .get(`${BUILDER}/charts/${ch.solo}`)
        .set(auth(adminToken))
        .expect(200);
      expect((res.body as { health: string }).health).toBe(HEALTH_NEEDS_REVIEW);
    });
  });

  // ── Criterio 5 ──────────────────────────────────────────────────────────

  describe('criterio 5 — supresión con las reglas del 107, en ambas audiencias', () => {
    it.each<[Audience, () => string | undefined]>([
      ['public', () => undefined],
      ['private', () => adminToken],
    ])(
      '%s: un gráfico por debajo de MIN_SAMPLE_THRESHOLD se sirve suprimido',
      async (audience, token) => {
        const body = await servedCharts(audience, cat.a.code, token());
        const small = find(body, ch.small);
        expect(small).toBeDefined();
        expect(small?.suppressed).toBe(true);
        // Revisión 105: el conteo bajo el umbral (3) no se publica.
        expect(small?.answeredCount ?? null).toBeNull();
        expect(JSON.stringify(small)).not.toMatch(/"answeredCount":3\b/);
      },
    );

    it.each<[Audience, () => string | undefined]>([
      ['public', () => undefined],
      ['private', () => adminToken],
    ])(
      '%s: una celda por debajo de MIN_CELL_SIZE se sirve suprimida',
      async (audience, token) => {
        const body = await servedCharts(audience, cat.a.code, token());
        const cell = find(body, ch.cell);
        expect(cell).toBeDefined();
        expect(cell?.suppressed).toBe(false);
        // La celda «No» (2 respuestas) no expone su conteo…
        expect(countValues(cell)).not.toContain(2);
        // …y queda marcada como suprimida.
        expect(hasNestedSuppressed(cell)).toBe(true);
      },
    );
  });

  // ── Criterio 6 ──────────────────────────────────────────────────────────

  describe('criterio 6 — filtros globales', () => {
    it('los filtros globales aplican a los gráficos de preguntas', async () => {
      const unfiltered = await servedCharts('public', cat.a.code);
      expect(find(unfiltered, ch.pub)?.suppressed).toBe(false);

      // Ninguna encuesta es posterior a 2099: la muestra filtrada queda en 0.
      const filtered = await servedCharts('public', cat.a.code, undefined, {
        dateFrom: '2099-01-01',
      });
      const pub = find(filtered, ch.pub);
      expect(filtered.suppressed === true || pub?.suppressed === true).toBe(
        true,
      );
    });

    // P13 (spec 108): una métrica acepta `departmentId`, `townId` y `cropId`;
    // los filtros derivados de respuestas no le aplican y se declaran en
    // `ignoredFilters` del gráfico servido.
    it('una métrica de entidad se sirve sin los filtros que no le aplican y los declara en ignoredFilters', async () => {
      const metricCat = await createCategory(
        `${CODE_BASE}5`,
        `Spec109 métricas ${RUN}`,
      );
      const created = await http()
        .post(`${BUILDER}/charts`)
        .set(auth(adminToken))
        .send({
          categoryId: metricCat,
          title: 'Spec109 métrica',
          sourceKind: 'entity_metric',
          metricKey: 'farms_by_department',
          chartKind: 'bars',
          audience: 'public',
          layout: 'normal',
        });
      if (created.status !== 201) {
        throw builderUnavailable('POST charts (métrica)', created);
      }
      const metricChartId = (created.body as { chartId: string }).chartId;
      await chartAction(metricChartId, 'publish');

      const unfiltered = find(
        await servedCharts('public', `${CODE_BASE}5`),
        metricChartId,
      ) as MetricServedChart | undefined;
      expect(unfiltered).toBeDefined();
      expect(unfiltered?.metricKey).toBe('farms_by_department');
      expect(unfiltered?.ignoredFilters).toEqual([]);

      // dateFrom y gender son de respuestas: la métrica no cambia y los declara.
      const filtered = find(
        await servedCharts('public', `${CODE_BASE}5`, undefined, {
          dateFrom: '2099-01-01',
          gender: 'Mujer',
        }),
        metricChartId,
      ) as MetricServedChart | undefined;
      expect(filtered).toBeDefined();
      expect([...(filtered?.ignoredFilters ?? [])].sort()).toEqual([
        'dateFrom',
        'gender',
      ]);
      expect(filtered?.suppressed).toBe(unfiltered?.suppressed);
      expect(filtered?.answeredCount).toBe(unfiltered?.answeredCount);

      // departmentId sí le aplica: no se declara como ignorado.
      const [department] = await ds.query<{ department_id: string }[]>(
        `SELECT department_id FROM departments LIMIT 1`,
      );
      const byDepartment = find(
        await servedCharts('public', `${CODE_BASE}5`, undefined, {
          departmentId: department.department_id,
        }),
        metricChartId,
      ) as MetricServedChart | undefined;
      expect(byDepartment).toBeDefined();
      expect(byDepartment?.ignoredFilters).toEqual([]);
    });
  });

  // ── Criterio 7 ──────────────────────────────────────────────────────────

  describe('criterio 7 — categorías', () => {
    it('la lista pública solo incluye categorías activas con al menos un gráfico público publicado', async () => {
      const res = await http().get(PUBLIC_CATEGORIES).expect(200);
      const codes = (res.body as ServedCategory[]).map(codeOf);
      expect(codes).toEqual(expect.arrayContaining([cat.a.code, cat.d.code]));
      expect(codes).not.toContain(cat.b.code); // solo privado
      expect(codes).not.toContain(cat.c.code); // inactiva
    });

    it('la lista privada incluye la categoría que solo tiene gráficos privados', async () => {
      const res = await http()
        .get(PRIVATE_CATEGORIES)
        .set(auth(adminToken))
        .expect(200);
      const codes = (res.body as ServedCategory[]).map(codeOf);
      expect(codes).toEqual(expect.arrayContaining([cat.a.code, cat.b.code]));
      expect(codes).not.toContain(cat.c.code);
    });

    it('un código de categoría inexistente responde 404', async () => {
      await getCharts('public', UNKNOWN_CATEGORY_CODE).expect(404);
    });

    it('un código de categoría inactiva responde 404', async () => {
      await getCharts('public', cat.c.code).expect(404);
    });
  });

  // ── Criterio 8 ──────────────────────────────────────────────────────────

  describe('criterio 8 — orden configurado', () => {
    it.each<[Audience, () => string | undefined]>([
      ['public', () => undefined],
      ['private', () => adminToken],
    ])('%s: los gráficos salen en el orden configurado', async (aud, token) => {
      const body = await servedCharts(aud, cat.d.code, token());
      const mine = idsOf(body).filter((id) =>
        [ch.d1, ch.d2, ch.d3].includes(id),
      );
      expect(mine).toEqual([ch.d3, ch.d1, ch.d2]);
    });
  });

  // ── Auditoría 95 del 66 — municipios homónimos ──────────────────────────

  it('una fusión no junta municipios homónimos de distintos departamentos', async () => {
    const body = await servedCharts('public', cat.a.code);
    const chart = find(body, ch.homonym) as
      | (ServedChart & {
          series: { aggregation: { options: { text: string }[] } | null }[];
        })
      | undefined;
    expect(chart).toBeDefined();
    const texts = (chart?.series[0]?.aggregation?.options ?? []).map(
      (o) => o.text,
    );
    expect(texts).toHaveLength(2);
    expect(texts).toEqual(
      expect.arrayContaining(
        homonymDepartments.map((dept) => `${HOMONYM} (${dept})`),
      ),
    );
  });

  // ── C14 con bloque fijo ─────────────────────────────────────────────────

  it('«Demanda digital» (C14) se lista mientras esté activa, aunque no tenga gráficos', async () => {
    const [c14] = await ds.query<{ is_active: boolean }[]>(
      `SELECT is_active FROM dashboard_categories WHERE code = 'C14'`,
    );
    const res = await http().get(PUBLIC_CATEGORIES).expect(200);
    const codes = (res.body as ServedCategory[]).map(codeOf);
    if (c14?.is_active) expect(codes).toContain('C14');
    else expect(codes).not.toContain('C14');
  });

  // ── Historial con nombre de usuario ─────────────────────────────────────

  it('el historial de un gráfico trae el nombre de quien hizo cada cambio', async () => {
    const res = await http()
      .get(`${BUILDER}/charts/${ch.d1}/events`)
      .set(auth(adminToken))
      .expect(200);
    const events = res.body as {
      eventType: string;
      userId: string | null;
      userName?: string | null;
    }[];
    expect(events.length).toBeGreaterThan(0);
    for (const e of events.filter((ev) => ev.userId)) {
      expect(typeof e.userName).toBe('string');
      expect((e.userName ?? '').length).toBeGreaterThan(0);
    }
  });

  // ── Caché pública (P22) ─────────────────────────────────────────────────

  it('P22 — la ruta pública de gráficos conserva public, max-age=300', async () => {
    const res = await getCharts('public', cat.a.code).expect(200);
    expect(res.headers['cache-control']).toBe('public, max-age=300');
  });
});
