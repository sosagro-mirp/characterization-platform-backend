/**
 * Spec 108 — Constructor de dashboard: modelo de datos y API.
 *
 * Escrito ANTES de la implementación (test-first). Arranca en rojo: las rutas
 * `/api/dashboard/builder/*`, las tablas `dashboard_*` y la semilla todavía no
 * existen. Cubre los criterios de aceptación 1–19 (el 20 se verifica a mano en
 * la Fase 1) y los criterios 21–24 de las métricas de entidad (P13, aprobada
 * el 2026-11-17), que siembran sus propios departamentos, municipios, cultivos,
 * fincas y productores (prefijo `E2E108`) y los borran en su `afterAll`.
 *
 * Siembra y limpia sus propios datos por SQL (instrumentos, preguntas,
 * encuestas, respuestas, usuarios). Los gráficos y categorías se crean por la
 * API futura y se borran por SQL en `afterAll`, tolerando que las tablas no
 * existan todavía.
 *
 * ── Contrato de la API que fija este archivo ───────────────────────────────
 * El spec no nombra las rutas; estas son las que asume el test (si la Fase 3
 * elige otras, se ajusta este archivo con aprobación). Base:
 * `/api/dashboard/builder`, todo `@Roles(ADMIN)`.
 *
 *   GET    /categories                       listado (incluye OVERVIEW)
 *   POST   /categories                       @JwtOnly  { code, name, description? }
 *   PATCH  /categories/:id                   @JwtOnly  { name?, code?, description?, isActive? }
 *   PATCH  /categories/reorder               @JwtOnly  { categoryIds }
 *   DELETE /categories/:id                   @JwtOnly  409 si tiene gráficos
 *   GET    /charts?categoryId=&archived=&status=&audience=
 *                                            activos por defecto; archived=true → archivados;
 *                                            status=draft|published, audience=public|private
 *   POST   /charts                           crea borrador (API key `write` permitida)
 *   GET    /charts/:id
 *   PATCH  /charts/:id
 *   POST   /charts/:id/duplicate
 *   PATCH  /charts/reorder                   { categoryId, chartIds }
 *   POST   /charts/:id/publish|unpublish|archive|restore   @JwtOnly
 *   GET    /charts/:id/events
 *   GET    /charts/:id/preview?audience=public|private
 *   POST   /preview                          configuración sin guardar + audience
 *   GET    /questions?instrumentId=&search=&questionTypeId=   (questionTypeId = UUID del tipo)
 *                                            catálogo con `selectable`, `blockedReason`
 *                                            y `compatibleCharts` ([] si no es seleccionable)
 *   GET    /compat-matrix                    matriz P10: [{ questionType, charts, combineModes }]
 *   GET    /entity-metrics?entity=           catálogo P13: [{ metricKey, label, entity,
 *                                            charts, filters }] (cinco métricas)
 *   POST   /charts (métrica)                 { categoryId, title, sourceKind: 'entity_metric',
 *                                            metricKey, chartKind, audience, layout? } sin series
 *   GET    /charts/:id/preview?audience=&<filtros globales>
 *                                            métrica: { health, metricKey, ignoredFilters,
 *                                            excludedSources: [], series: [{ seriesKey,
 *                                            label, answeredCount, suppressed, aggregation }] },
 *                                            aggregation = { buckets } o intervalos del 107
 *
 * Cuerpo de un gráfico (P9, P11, P12, P23):
 *   { categoryId, title, subtitle?, sourceKind: 'questions', chartKind,
 *     combineMode: 'merge'|'compare', audience: 'public'|'private',
 *     layout?: 'normal'|'wide',
 *     settings?: { optionsMismatchAck?: boolean,
 *                  numericWithUnit?: { strategy: 'by_unit'|'normalize',
 *                                      targetUnit?: string,
 *                                      factors?: Record<string, number> } },
 *     series: [{ seriesKey?, label, questionIds: string[] }] }
 *   `seriesKey` es opcional: si falta, el backend asigna uno único por serie.
 *
 * Respuesta de un gráfico: los campos anteriores más `chartId`, `status`
 * ('draft'|'published'), `questionType`, `position`, `archivedAt`, `health`
 * ('ok'|'needs_review'), auditoría (`createdBy`, `updatedBy`, `publishedBy`
 * como id o `{ userId }`, `createdAt`, `updatedAt`, `publishedAt`) y
 * `series[].sources[]` con `questionId`, `instrumentCodeSnapshot`,
 * `questionTextSnapshot`.
 *
 * Vista previa: `{ health, series: [{ seriesKey, label, answeredCount,
 * suppressed, aggregation }], excludedSources: [{ questionId, reason }],
 * normalization?: { targetUnit, excludedCount } }`, con `aggregation` en el
 * formato de `DashboardQuestionDto` (opciones con `count`/`suppressed`).
 *
 * Errores de validación: el 400 de una fuente bloqueada lleva
 * `code: 'DASHBOARD_SOURCE_BLOCKED'`; el de un gráfico que la matriz no
 * permite, `code: 'DASHBOARD_CHART_INCOMPATIBLE'` (los consume el spec 110).
 *
 * Eventos (P7): `{ eventId, eventType: 'created'|'updated'|'published'|
 * 'unpublished'|'archived'|'restored', userId, createdAt, summary }`.
 */
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import * as path from 'node:path';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getOptionsToken } from '@nestjs/throttler';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';

// ─── constantes ─────────────────────────────────────────────────────────────

const BASE = '/api/dashboard/builder';
const EMAIL_PREFIX = 'e2e-108-';
const TEST_PASSWORD = 'E2eTest1234!';
const CATEGORY_CODE_PREFIX = 'E2E108';
const TITLE_PREFIX = 'E2E 108';
const INSTRUMENT_CODE_A = 'E2E108A';
const INSTRUMENT_CODE_B = 'E2E108B';

// ─── tipos del contrato ─────────────────────────────────────────────────────

type UserRef = string | { userId: string } | null | undefined;

interface ChartSource {
  questionId: string;
  instrumentCodeSnapshot: string | null;
  questionTextSnapshot: string;
}

interface ChartSeries {
  seriesKey: string;
  label: string;
  sources: ChartSource[];
}

interface ChartBody {
  chartId: string;
  categoryId: string;
  title: string;
  status: 'draft' | 'published';
  audience: 'public' | 'private';
  chartKind: string;
  combineMode: 'merge' | 'compare';
  questionType: string | null;
  layout: 'normal' | 'wide';
  position: number;
  archivedAt: string | null;
  health: 'ok' | 'needs_review';
  settings: {
    optionsMismatchAck?: boolean;
    numericWithUnit?: { strategy: 'by_unit' | 'normalize' };
  } | null;
  createdBy: UserRef;
  updatedBy: UserRef;
  publishedBy: UserRef;
  publishedAt: string | null;
  series: ChartSeries[];
}

interface CategoryBody {
  categoryId: string;
  code: string;
  name: string;
  isActive: boolean;
  isReserved: boolean;
}

interface CatalogItem {
  questionId: string;
  selectable: boolean;
  blockedReason: string | null;
  /** Gráficos permitidos por la matriz y las condiciones «solo si» para esta
   * pregunta; vacío si no es seleccionable. */
  compatibleCharts: string[];
}

/** Cuerpo de un 400 de validación del constructor. */
interface BuilderError {
  code?: string;
  message?: unknown;
}

const SOURCE_BLOCKED = 'DASHBOARD_SOURCE_BLOCKED';
const CHART_INCOMPATIBLE = 'DASHBOARD_CHART_INCOMPATIBLE';

interface AggregationOption {
  text: string;
  count: number | null;
  suppressed: boolean;
}

interface PreviewSeries {
  seriesKey: string;
  label: string;
  answeredCount: number;
  suppressed: boolean;
  aggregation: { options?: AggregationOption[] } | null;
}

interface PreviewBody {
  health: 'ok' | 'needs_review';
  series: PreviewSeries[];
  excludedSources: { questionId: string; reason: string }[];
  normalization?: { targetUnit: string; excludedCount: number };
}

interface ChartEvent {
  eventId: string;
  eventType: string;
  userId: string;
  createdAt: string;
}

interface SeriesInput {
  seriesKey?: string;
  label: string;
  questionIds: string[];
}

// ─── helpers puros ──────────────────────────────────────────────────────────

const userIdOf = (ref: UserRef): string | null =>
  ref == null ? null : typeof ref === 'string' ? ref : ref.userId;

const listOf = <T>(body: unknown): T[] =>
  Array.isArray(body) ? (body as T[]) : ((body as { items: T[] }).items ?? []);

/** Acciones (publicar, archivar, duplicar…): el spec no fija 200 ni 201. */
const okStatus = (res: { status: number }) => {
  if (![200, 201].includes(res.status)) {
    throw new Error(`Se esperaba 200 o 201 y llegó ${res.status}`);
  }
};

const sourceIdsOf = (chart: ChartBody): string[] =>
  chart.series.flatMap((s) => s.sources.map((src) => src.questionId));

const optionOf = (series: PreviewSeries, text: string): AggregationOption => {
  const option = series.aggregation?.options?.find((o) => o.text === text);
  if (!option) throw new Error(`Opción «${text}» ausente en la vista previa`);
  return option;
};

// ─── suite ──────────────────────────────────────────────────────────────────

describe('Spec 108 — constructor de dashboard: modelo y API (e2e)', () => {
  let app: INestApplication<App>;
  let ds: DataSource;

  let adminToken: string;
  let researcherToken: string;
  let pollsterToken: string;
  let adminUserId: string;
  let apiKeyUserId: string;
  let apiKey: string;

  let instrumentAId: string;
  let instrumentBId: string;
  const surveyIds: string[] = [];
  const typeIds: Record<string, string> = {};

  // Preguntas sembradas
  const q: Record<string, string> = {};
  // Opciones por pregunta: texto → option_id
  const opt: Record<string, Record<string, string>> = {};

  let categoryId: string; // categoría de prueba donde viven los gráficos

  // ── helpers de API ────────────────────────────────────────────────────────

  const http = () => request(app.getHttpServer());

  const chartBody = (
    series: SeriesInput[],
    overrides: Record<string, unknown> = {},
  ): Record<string, unknown> => ({
    categoryId,
    title: `${TITLE_PREFIX} ${randomUUID().slice(0, 8)}`,
    sourceKind: 'questions',
    chartKind: 'bars',
    combineMode: 'merge',
    audience: 'public',
    layout: 'normal',
    series,
    ...overrides,
  });

  const single = (questionIds: string[], label = 'Serie única') => [
    { seriesKey: 's1', label, questionIds },
  ];

  const createChart = async (
    body: Record<string, unknown>,
  ): Promise<ChartBody> => {
    const res = await http()
      .post(`${BASE}/charts`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send(body);
    expect(res.status).toBe(201);
    return res.body as ChartBody;
  };

  const getChart = async (chartId: string): Promise<ChartBody> => {
    const res = await http()
      .get(`${BASE}/charts/${chartId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    return res.body as ChartBody;
  };

  const preview = async (
    chartId: string,
    audience: 'public' | 'private' = 'public',
  ): Promise<PreviewBody> => {
    const res = await http()
      .get(`${BASE}/charts/${chartId}/preview`)
      .query({ audience })
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    return res.body as PreviewBody;
  };

  const listCharts = async (
    query: Record<string, string>,
  ): Promise<ChartBody[]> => {
    const res = await http()
      .get(`${BASE}/charts`)
      .query(query)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    return listOf<ChartBody>(res.body);
  };

  const action = (chartId: string, verb: string, token = adminToken) =>
    http()
      .post(`${BASE}/charts/${chartId}/${verb}`)
      .set('Authorization', `Bearer ${token}`);

  /** Bloquea una pregunta (systemField identificante) mientras corre `fn`. */
  const withBlocked = async (questionId: string, fn: () => Promise<void>) => {
    await ds.query(
      `UPDATE questions SET system_field = 'farmer.phone' WHERE question_id = $1`,
      [questionId],
    );
    try {
      await fn();
    } finally {
      await ds.query(
        `UPDATE questions SET system_field = NULL WHERE question_id = $1`,
        [questionId],
      );
    }
  };

  // ── helpers de siembra ────────────────────────────────────────────────────

  async function insertInstrument(code: string, name: string) {
    const rows = await ds.query<{ instrument_id: string }[]>(
      `INSERT INTO instruments (instrument_id, name, version, publish_date, is_active, code)
       VALUES (gen_random_uuid(), $1, 1, CURRENT_DATE, true, $2)
       RETURNING instrument_id`,
      [name, code],
    );
    const instrumentId = rows[0].instrument_id;
    const sections = await ds.query<{ section_id: string }[]>(
      `INSERT INTO sections (section_id, name, "order", instrument_id)
       VALUES (gen_random_uuid(), 'E2E 108 sección', 1, $1)
       RETURNING section_id`,
      [instrumentId],
    );
    return { instrumentId, sectionId: sections[0].section_id };
  }

  let questionOrder = 0;
  async function insertQuestion(
    key: string,
    sectionId: string,
    typeName: string,
    text: string,
    options: { text: string; value?: number }[] = [],
    systemField: string | null = null,
  ) {
    const rows = await ds.query<{ question_id: string }[]>(
      `INSERT INTO questions (question_id, section_id, text, type_id, is_required, "order", system_field)
       VALUES (gen_random_uuid(), $1, $2, $3, false, $4, $5)
       RETURNING question_id`,
      [sectionId, text, typeIds[typeName], ++questionOrder, systemField],
    );
    q[key] = rows[0].question_id;
    opt[key] = {};
    for (const o of options) {
      const optionRows = await ds.query<{ option_id: string }[]>(
        `INSERT INTO options_question (option_id, question_id, text, value)
         VALUES (gen_random_uuid(), $1, $2, $3)
         RETURNING option_id`,
        [q[key], o.text, o.value ?? null],
      );
      opt[key][o.text] = optionRows[0].option_id;
    }
  }

  async function answer(
    surveyIndex: number,
    key: string,
    value: { option?: string; numeric?: number; bool?: boolean },
  ) {
    await ds.query(
      `INSERT INTO responses (response_id, survey_id, question_id, option_id, numeric_value, boolean_value)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5)`,
      [
        surveyIds[surveyIndex],
        q[key],
        value.option ? opt[key][value.option] : null,
        value.numeric ?? null,
        value.bool ?? null,
      ],
    );
  }

  /** Borra por SQL ignorando que la tabla todavía no exista (rojo limpio). */
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
      // La suite hace bastante más de 60 peticiones por minuto desde la misma IP.
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

    // ── usuarios ─────────────────────────────────────────────────────────
    const roles = await ds.query<{ role_id: string; name: string }[]>(
      `SELECT role_id, name FROM roles WHERE name IN ('admin','researcher','pollster')`,
    );
    const roleId = (name: string) =>
      roles.find((r) => r.name === name)!.role_id;
    const hash = await bcrypt.hash(TEST_PASSWORD, 10);

    const insertUser = async (suffix: string, role: string) => {
      const email = `${EMAIL_PREFIX}${suffix}@test.local`;
      const existing = await ds.query<{ user_id: string }[]>(
        `SELECT user_id FROM users WHERE email = $1`,
        [email],
      );
      if (existing.length) return { email, userId: existing[0].user_id };
      const rows = await ds.query<{ user_id: string }[]>(
        `INSERT INTO users (user_id, name, last_name, email, password, role_id, must_change_password)
         VALUES (gen_random_uuid(), $1, 'E2E', $2, $3, $4, false)
         RETURNING user_id`,
        [`E2E 108 ${suffix}`, email, hash, roleId(role)],
      );
      return { email, userId: rows[0].user_id };
    };
    const login = async (email: string) => {
      const res = await http()
        .post('/api/auth/login')
        .send({ email, password: TEST_PASSWORD })
        .expect(200);
      return (res.body as { accessToken: string }).accessToken;
    };

    const admin = await insertUser('admin', 'admin');
    const researcher = await insertUser('researcher', 'researcher');
    const pollster = await insertUser('pollster', 'pollster');
    const service = await insertUser('service', 'admin');
    adminUserId = admin.userId;
    apiKeyUserId = service.userId;
    adminToken = await login(admin.email);
    researcherToken = await login(researcher.email);
    pollsterToken = await login(pollster.email);

    const keyRes = await http()
      .post('/api/api-keys')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'E2E 108 MCP',
        scopes: ['read', 'write'],
        userId: apiKeyUserId,
      })
      .expect(201);
    apiKey = (keyRes.body as { key: string }).key;

    // ── instrumentos, preguntas y opciones ───────────────────────────────
    const types = await ds.query<{ type_id: string; name: string }[]>(
      `SELECT type_id, name FROM types_of_questions`,
    );
    for (const t of types) typeIds[t.name] = t.type_id;

    const A = await insertInstrument(INSTRUMENT_CODE_A, 'E2E 108 taller A');
    const B = await insertInstrument(INSTRUMENT_CODE_B, 'E2E 108 taller B');
    instrumentAId = A.instrumentId;
    instrumentBId = B.instrumentId;

    const crops = [{ text: 'Café' }, { text: 'Cacao' }];
    const likert = (n: number) =>
      Array.from({ length: n }, (_, i) => ({
        text: `Nivel ${i + 1}`,
        value: i + 1,
      }));

    // Instrumento A
    await insertQuestion(
      'scA',
      A.sectionId,
      'single_choice',
      'Cultivo principal (e2e 108 A)',
      crops,
    );
    await insertQuestion(
      'ynA',
      A.sectionId,
      'yes_no',
      '¿Usa internet? (e2e 108 A)',
    );
    await insertQuestion(
      'mcA',
      A.sectionId,
      'multiple_choice',
      'Herramientas (e2e 108 A)',
      [{ text: 'Opción 1' }, { text: 'Opción 2' }, { text: 'Opción 3' }],
    );
    await insertQuestion(
      'likA5',
      A.sectionId,
      'likert',
      'Satisfacción (e2e 108 A)',
      likert(5),
    );
    await insertQuestion(
      'nwuA',
      A.sectionId,
      'numeric_with_unit',
      'Área de la finca (e2e 108 A)',
      [{ text: 'ha' }, { text: 'm2' }, { text: 'cuadras' }],
    );
    await insertQuestion(
      'phoneA',
      A.sectionId,
      'numeric',
      'Teléfono (e2e 108 A)',
      [],
      'farmer.phone',
    );
    await insertQuestion(
      'identA',
      A.sectionId,
      'numeric',
      'Número de celular del productor (e2e 108 A)',
    );
    await insertQuestion(
      'openA',
      A.sectionId,
      'open_text',
      'Comentarios (e2e 108 A)',
    );
    await insertQuestion(
      'smallA',
      A.sectionId,
      'single_choice',
      'Nivel de riesgo (e2e 108 A)',
      [{ text: 'Alto' }, { text: 'Bajo' }],
    );
    await insertQuestion(
      'archA',
      A.sectionId,
      'single_choice',
      'Cultivo secundario (e2e 108 A)',
      crops,
    );
    await insertQuestion(
      'delA',
      A.sectionId,
      'single_choice',
      'Cultivo anterior (e2e 108 A)',
      crops,
    );
    await insertQuestion(
      'blkA',
      A.sectionId,
      'single_choice',
      'Cultivo asociado (e2e 108 A)',
      crops,
    );

    // Instrumento B
    await insertQuestion(
      'scB',
      B.sectionId,
      'single_choice',
      'Cultivo principal (e2e 108 B)',
      crops,
    );
    await insertQuestion(
      'sc3B',
      B.sectionId,
      'single_choice',
      'Cultivo de interés (e2e 108 B)',
      [...crops, { text: 'Cannabis' }],
    );
    await insertQuestion(
      'ynB',
      B.sectionId,
      'yes_no',
      '¿Usa internet? (e2e 108 B)',
    );
    await insertQuestion(
      'lik3B',
      B.sectionId,
      'likert',
      'Satisfacción (e2e 108 B)',
      likert(3),
    );

    // ── encuestas ────────────────────────────────────────────────────────
    // S0..S5 responden A; S0..S2, S6 y S7 responden B (S0..S2 responden ambos).
    for (let i = 0; i < 8; i++) {
      const rows = await ds.query<{ survey_id: string }[]>(
        `INSERT INTO surveys (survey_id, sincronized) VALUES (gen_random_uuid(), true)
         RETURNING survey_id`,
      );
      surveyIds.push(rows[0].survey_id);
    }
    const inA = [0, 1, 2, 3, 4, 5];
    const inB = [0, 1, 2, 6, 7];
    for (const i of inA) {
      await ds.query(
        `INSERT INTO surveys_instruments (survey_id, instrument_id) VALUES ($1, $2)`,
        [surveyIds[i], instrumentAId],
      );
    }
    for (const i of inB) {
      await ds.query(
        `INSERT INTO surveys_instruments (survey_id, instrument_id) VALUES ($1, $2)`,
        [surveyIds[i], instrumentBId],
      );
    }

    // scA: Café ×5, Cacao ×1. scB: Café ×5. Fusión: 8 encuestas, Café 7, Cacao 1.
    for (const i of inA)
      await answer(i, 'scA', { option: i === 5 ? 'Cacao' : 'Café' });
    for (const i of inB) await answer(i, 'scB', { option: 'Café' });
    for (const i of inB) await answer(i, 'sc3B', { option: 'Café' });
    // Sí/No: A 6 respuestas, B 5 respuestas.
    for (const i of inA) await answer(i, 'ynA', { bool: true });
    for (const i of inB) await answer(i, 'ynB', { bool: i !== 6 });
    // numeric_with_unit: 3 en ha, 2 en m2, 1 en cuadras (sin factor → excluida).
    await answer(0, 'nwuA', { option: 'ha', numeric: 1 });
    await answer(1, 'nwuA', { option: 'ha', numeric: 2 });
    await answer(2, 'nwuA', { option: 'ha', numeric: 3 });
    await answer(3, 'nwuA', { option: 'm2', numeric: 10000 });
    await answer(4, 'nwuA', { option: 'm2', numeric: 20000 });
    await answer(5, 'nwuA', { option: 'cuadras', numeric: 1 });
    // Identificantes (no deben ser seleccionables).
    for (const i of inA) await answer(i, 'phoneA', { numeric: 3009990000 + i });
    for (const i of inA) await answer(i, 'identA', { numeric: 3109990000 + i });
    // Muestra insuficiente: solo 3 respuestas.
    for (const i of [0, 1, 2]) await answer(i, 'smallA', { option: 'Alto' });
    // Ciclo de vida y bloqueo.
    for (const i of inA) await answer(i, 'archA', { option: 'Café' });
    for (const i of inA) await answer(i, 'delA', { option: 'Café' });
    for (const i of inA) await answer(i, 'blkA', { option: 'Café' });

    // ── categoría de prueba (vía API futura) ─────────────────────────────
    const catRes = await http()
      .post(`${BASE}/categories`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ code: CATEGORY_CODE_PREFIX, name: 'E2E 108 categoría' });
    if (catRes.status === 201) {
      categoryId = (catRes.body as CategoryBody).categoryId;
    }
  }, 120_000);

  afterAll(async () => {
    const questionIds = Object.values(q);
    // Gráficos (y sus fuentes y eventos) de la categoría de prueba o con
    // fuentes en las preguntas sembradas, o creados por los usuarios de prueba.
    const chartScope = `
      SELECT chart_id FROM dashboard_charts
      WHERE category_id IN (SELECT category_id FROM dashboard_categories WHERE code LIKE '${CATEGORY_CODE_PREFIX}%')
         OR title LIKE '${TITLE_PREFIX}%'
         OR chart_id IN (SELECT chart_id FROM dashboard_chart_sources WHERE question_id = ANY($1::uuid[]))`;
    await safeQuery(
      `DELETE FROM dashboard_chart_events WHERE chart_id IN (${chartScope})`,
      [questionIds],
    );
    await safeQuery(
      `DELETE FROM dashboard_chart_sources WHERE chart_id IN (${chartScope})`,
      [questionIds],
    );
    await safeQuery(
      `DELETE FROM dashboard_charts WHERE chart_id IN (${chartScope})`,
      [questionIds],
    );
    await safeQuery(
      `DELETE FROM dashboard_categories WHERE code LIKE '${CATEGORY_CODE_PREFIX}%'`,
    );

    if (surveyIds.length) {
      await ds.query(
        `DELETE FROM responses WHERE survey_id = ANY($1::uuid[])`,
        [surveyIds],
      );
      await ds.query(
        `DELETE FROM surveys_instruments WHERE survey_id = ANY($1::uuid[])`,
        [surveyIds],
      );
      await ds.query(`DELETE FROM surveys WHERE survey_id = ANY($1::uuid[])`, [
        surveyIds,
      ]);
    }
    for (const instrumentId of [instrumentAId, instrumentBId].filter(Boolean)) {
      await ds.query(
        `DELETE FROM options_question WHERE question_id IN (
           SELECT q.question_id FROM questions q
           JOIN sections s ON s.section_id = q.section_id
           WHERE s.instrument_id = $1)`,
        [instrumentId],
      );
      await ds.query(
        `DELETE FROM questions WHERE section_id IN (
           SELECT section_id FROM sections WHERE instrument_id = $1)`,
        [instrumentId],
      );
      await ds.query(`DELETE FROM sections WHERE instrument_id = $1`, [
        instrumentId,
      ]);
      await ds.query(`DELETE FROM instruments WHERE instrument_id = $1`, [
        instrumentId,
      ]);
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

  // ── Criterio 1 ────────────────────────────────────────────────────────────

  describe('C1 — crear un gráfico deja un borrador', () => {
    it('criterio 1: un ADMIN crea un gráfico de varias preguntas y queda en borrador', async () => {
      const chart = await createChart(
        chartBody(single([q.scA, q.scB], 'Cultivo principal'), {
          title: `${TITLE_PREFIX} cultivo principal`,
          chartKind: 'horizontal-bars',
          audience: 'private',
          layout: 'wide',
        }),
      );

      expect(chart.chartId).toEqual(expect.any(String));
      expect(chart.status).toBe('draft');
      expect(chart.title).toBe(`${TITLE_PREFIX} cultivo principal`);
      expect(chart.categoryId).toBe(categoryId);
      expect(chart.audience).toBe('private');
      expect(chart.chartKind).toBe('horizontal-bars');
      expect(chart.layout).toBe('wide');
      expect(chart.questionType).toBe('single_choice');
      expect(chart.publishedAt).toBeNull();
      expect(sourceIdsOf(chart).sort()).toEqual([q.scA, q.scB].sort());

      // P4 — huella: código de instrumento y texto copiados al guardar.
      const srcA = chart.series[0].sources.find((s) => s.questionId === q.scA)!;
      expect(srcA.instrumentCodeSnapshot).toBe(INSTRUMENT_CODE_A);
      expect(srcA.questionTextSnapshot).toBe('Cultivo principal (e2e 108 A)');
    });

    it('criterio 1 (P9): una serie sin seriesKey recibe uno asignado por el backend', async () => {
      const chart = await createChart(
        chartBody(
          [
            { label: 'Sin clave A', questionIds: [q.ynA] },
            { label: 'Sin clave B', questionIds: [q.ynB] },
          ],
          { chartKind: 'yes-percent-bars', combineMode: 'compare' },
        ),
      );
      const keys = chart.series.map((s) => s.seriesKey);
      expect(keys).toHaveLength(2);
      for (const key of keys) {
        expect(typeof key).toBe('string');
        expect(key.length).toBeGreaterThan(0);
      }
      expect(new Set(keys).size).toBe(2);
      expect(chart.series.map((s) => s.label)).toEqual([
        'Sin clave A',
        'Sin clave B',
      ]);
    });

    it('P6: duplicar un gráfico crea otro borrador con las mismas fuentes', async () => {
      const original = await createChart(chartBody(single([q.scA])));
      const res = await http()
        .post(`${BASE}/charts/${original.chartId}/duplicate`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(okStatus);
      const copy = res.body as ChartBody;
      expect(copy.chartId).not.toBe(original.chartId);
      expect(copy.status).toBe('draft');
      expect(sourceIdsOf(copy)).toEqual([q.scA]);
    });
  });

  // ── Criterio 2 ────────────────────────────────────────────────────────────

  describe('C2 — el constructor es solo ADMIN', () => {
    const fakeId = randomUUID();
    const endpoints: [string, string][] = [
      ['get', `${BASE}/categories`],
      ['post', `${BASE}/categories`],
      ['patch', `${BASE}/categories/reorder`],
      ['patch', `${BASE}/categories/${fakeId}`],
      ['delete', `${BASE}/categories/${fakeId}`],
      ['get', `${BASE}/charts`],
      ['post', `${BASE}/charts`],
      ['patch', `${BASE}/charts/reorder`],
      ['get', `${BASE}/charts/${fakeId}`],
      ['patch', `${BASE}/charts/${fakeId}`],
      ['post', `${BASE}/charts/${fakeId}/duplicate`],
      ['post', `${BASE}/charts/${fakeId}/publish`],
      ['post', `${BASE}/charts/${fakeId}/unpublish`],
      ['post', `${BASE}/charts/${fakeId}/archive`],
      ['post', `${BASE}/charts/${fakeId}/restore`],
      ['get', `${BASE}/charts/${fakeId}/events`],
      ['get', `${BASE}/charts/${fakeId}/preview`],
      ['post', `${BASE}/preview`],
      ['get', `${BASE}/questions`],
      ['get', `${BASE}/compat-matrix`],
      ['get', `${BASE}/entity-metrics`],
    ];

    const call = (method: string, url: string) =>
      (http() as unknown as Record<string, (u: string) => request.Test>)[
        method
      ](url);

    it('criterio 2: RESEARCHER recibe 403 en todos los endpoints del constructor', async () => {
      for (const [method, url] of endpoints) {
        const res = await call(method, url)
          .set('Authorization', `Bearer ${researcherToken}`)
          .send({});
        expect({ method, url, status: res.status }).toEqual({
          method,
          url,
          status: 403,
        });
      }
    });

    it('criterio 2: POLLSTER recibe 403 en todos los endpoints del constructor', async () => {
      for (const [method, url] of endpoints) {
        const res = await call(method, url)
          .set('Authorization', `Bearer ${pollsterToken}`)
          .send({});
        expect({ method, url, status: res.status }).toEqual({
          method,
          url,
          status: 403,
        });
      }
    });

    it('criterio 2: sin token, 401 en todos los endpoints del constructor', async () => {
      for (const [method, url] of endpoints) {
        const res = await call(method, url).send({});
        expect({ method, url, status: res.status }).toEqual({
          method,
          url,
          status: 401,
        });
      }
    });
  });

  // ── Criterio 3 ────────────────────────────────────────────────────────────

  describe('C3 — una API key nunca publica ni escribe categorías', () => {
    let keyChartId: string;

    it('control (spec 110): una API key con scope write sí crea y lee borradores', async () => {
      const res = await http()
        .post(`${BASE}/charts`)
        .set('X-API-Key', apiKey)
        .send(chartBody(single([q.scA])))
        .expect(201);
      const chart = res.body as ChartBody;
      keyChartId = chart.chartId;
      expect(chart.status).toBe('draft');
      expect(userIdOf(chart.createdBy)).toBe(apiKeyUserId);

      await http()
        .get(`${BASE}/charts/${keyChartId}`)
        .set('X-API-Key', apiKey)
        .expect(200);
    });

    it.each(['publish', 'unpublish', 'archive', 'restore'])(
      'criterio 3: %s con API key responde 403',
      async (verb) => {
        await http()
          .post(`${BASE}/charts/${keyChartId}/${verb}`)
          .set('X-API-Key', apiKey)
          .expect(403);
      },
    );

    it('criterio 3: crear, editar, reordenar y borrar categorías con API key responde 403', async () => {
      await http()
        .post(`${BASE}/categories`)
        .set('X-API-Key', apiKey)
        .send({ code: `${CATEGORY_CODE_PREFIX}K`, name: 'E2E 108 key' })
        .expect(403);
      await http()
        .patch(`${BASE}/categories/${categoryId}`)
        .set('X-API-Key', apiKey)
        .send({ name: 'E2E 108 renombrada por key' })
        .expect(403);
      await http()
        .patch(`${BASE}/categories/reorder`)
        .set('X-API-Key', apiKey)
        .send({ categoryIds: [categoryId] })
        .expect(403);
      await http()
        .delete(`${BASE}/categories/${categoryId}`)
        .set('X-API-Key', apiKey)
        .expect(403);

      // Nada cambió: el gráfico sigue en borrador.
      expect((await getChart(keyChartId)).status).toBe('draft');
    });
  });

  // ── Criterio 4 ────────────────────────────────────────────────────────────

  describe('C4 — catálogo de preguntas con motivo de bloqueo', () => {
    let items: CatalogItem[];

    beforeAll(async () => {
      const res = await http()
        .get(`${BASE}/questions`)
        .query({ instrumentId: instrumentAId })
        .set('Authorization', `Bearer ${adminToken}`);
      items = res.status === 200 ? listOf<CatalogItem>(res.body) : [];
    });

    const item = (key: string) => {
      const found = items.find((i) => i.questionId === q[key]);
      if (!found) throw new Error(`La pregunta ${key} no está en el catálogo`);
      return found;
    };

    it.each([
      ['phoneA', 'systemField identificante (farmer.phone)'],
      ['identA', 'texto identificante sin systemField (107)'],
      ['openA', 'tipo excluido (open_text)'],
    ])(
      'criterio 4: %s se lista como no seleccionable con su motivo — %s',
      (key) => {
        const found = item(key);
        expect(found.selectable).toBe(false);
        expect(found.blockedReason).toEqual(expect.any(String));
        expect(found.blockedReason!.length).toBeGreaterThan(0);
        expect(found.compatibleCharts).toEqual([]);
      },
    );

    it('criterio 4: una pregunta elegible es seleccionable y sin motivo', () => {
      const found = item('scA');
      expect(found.selectable).toBe(true);
      expect(found.blockedReason).toBeNull();
      // single_choice con pocas opciones que no son departamentos: sin mapa.
      expect(found.compatibleCharts).toEqual([
        'bars',
        'horizontal-bars',
        'donut',
      ]);
    });
  });

  // ── Criterio 5 ────────────────────────────────────────────────────────────

  describe('C5 — una fuente bloqueada nunca se guarda ni se publica', () => {
    it('criterio 5: crear con una fuente bloqueada responde 400 y no guarda nada', async () => {
      const title = `${TITLE_PREFIX} bloqueado al crear`;
      const res = await http()
        .post(`${BASE}/charts`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send(
          chartBody(single([q.phoneA]), {
            title,
            chartKind: 'histogram',
          }),
        )
        .expect(400);
      expect((res.body as BuilderError).code).toBe(SOURCE_BLOCKED);

      const charts = await listCharts({ categoryId });
      expect(charts.find((c) => c.title === title)).toBeUndefined();
    });

    it('criterio 5: editar agregando una fuente bloqueada responde 400 y no cambia el gráfico', async () => {
      // blkA es del mismo tipo y opciones que scA: el único motivo del 400 es
      // el bloqueo, no la compatibilidad.
      const chart = await createChart(chartBody(single([q.scA])));
      await withBlocked(q.blkA, async () => {
        const res = await http()
          .patch(`${BASE}/charts/${chart.chartId}`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ series: single([q.scA, q.blkA]) })
          .expect(400);
        expect((res.body as BuilderError).code).toBe(SOURCE_BLOCKED);
      });

      expect(sourceIdsOf(await getChart(chart.chartId))).toEqual([q.scA]);
    });

    it('criterio 5: publicar con una fuente que pasó a estar bloqueada responde 400', async () => {
      const chart = await createChart(chartBody(single([q.blkA])));
      await withBlocked(q.blkA, async () => {
        const res = await action(chart.chartId, 'publish').expect(400);
        expect((res.body as BuilderError).code).toBe(SOURCE_BLOCKED);
        const after = await getChart(chart.chartId);
        expect(after.status).toBe('draft');
        expect(after.publishedAt).toBeNull();
      });
    });
  });

  // ── Criterio 6 ────────────────────────────────────────────────────────────

  describe('C6 — la matriz de compatibilidad manda', () => {
    it('criterio 6: dona para multiple_choice responde 400', async () => {
      const res = await http()
        .post(`${BASE}/charts`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send(chartBody(single([q.mcA]), { chartKind: 'donut' }))
        .expect(400);
      expect((res.body as BuilderError).code).toBe(CHART_INCOMPATIBLE);
    });

    it('criterio 6: mapa con opciones que no son departamentos responde 400', async () => {
      const res = await http()
        .post(`${BASE}/charts`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send(chartBody(single([q.scA]), { chartKind: 'map' }))
        .expect(400);
      expect((res.body as BuilderError).code).toBe(CHART_INCOMPATIBLE);
    });

    it('P10: la matriz se expone por endpoint y no ofrece dona para multiple_choice', async () => {
      const res = await http()
        .get(`${BASE}/compat-matrix`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      const raw = JSON.stringify(res.body);
      expect(raw).toContain('multiple_choice');
      const entries = listOf<{
        questionType: string;
        charts: string[];
        combineModes: string[];
      }>(res.body);
      const mc = entries.find((e) => e.questionType === 'multiple_choice');
      expect(mc).toBeDefined();
      expect(mc!.charts).not.toContain('donut');

      // Cada entrada declara sus modos de combinación (los usa el 109):
      // comparación solo en yes_no y likert.
      const modes = Object.fromEntries(
        entries.map((e) => [e.questionType, [...e.combineModes].sort()]),
      );
      expect(modes).toEqual(
        expect.objectContaining({
          yes_no: ['compare', 'merge'],
          likert: ['compare', 'merge'],
          single_choice: ['merge'],
          multiple_choice: ['merge'],
          compliance: ['merge'],
          numeric: ['merge'],
          numeric_with_unit: ['merge'],
        }),
      );
    });
  });

  // ── Criterio 7 ────────────────────────────────────────────────────────────

  describe('C7 — fusiones de tipos incompatibles', () => {
    it('criterio 7: fusionar tipos distintos responde 400', async () => {
      await http()
        .post(`${BASE}/charts`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send(chartBody(single([q.scA, q.ynA])))
        .expect(400);
    });

    it('criterio 7: fusionar Likert con distinto número de niveles responde 400', async () => {
      await http()
        .post(`${BASE}/charts`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send(
          chartBody(single([q.likA5, q.lik3B]), {
            chartKind: 'diverging',
            settings: { optionsMismatchAck: true },
          }),
        )
        .expect(400);
    });
  });

  // ── Criterio 8 ────────────────────────────────────────────────────────────

  describe('C8 — opciones distintas exigen confirmación', () => {
    it('criterio 8: sin confirmación responde 400 con la diferencia', async () => {
      const res = await http()
        .post(`${BASE}/charts`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send(chartBody(single([q.scA, q.sc3B])))
        .expect(400);
      expect(JSON.stringify(res.body)).toContain('Cannabis');
    });

    it('criterio 8: con confirmación se guarda y la confirmación queda registrada', async () => {
      const chart = await createChart(
        chartBody(single([q.scA, q.sc3B]), {
          settings: { optionsMismatchAck: true },
        }),
      );
      expect(sourceIdsOf(chart).sort()).toEqual([q.scA, q.sc3B].sort());
      expect((await getChart(chart.chartId)).settings?.optionsMismatchAck).toBe(
        true,
      );
    });
  });

  // ── Criterio 9 ────────────────────────────────────────────────────────────

  describe('C9 — numeric_with_unit guarda su estrategia', () => {
    it('criterio 9: by_unit se guarda', async () => {
      const chart = await createChart(
        chartBody(single([q.nwuA]), {
          chartKind: 'histogram-by-unit',
          settings: { numericWithUnit: { strategy: 'by_unit' } },
        }),
      );
      expect(
        (await getChart(chart.chartId)).settings?.numericWithUnit?.strategy,
      ).toBe('by_unit');
    });

    it('criterio 9: normalize se guarda y la vista previa informa las respuestas excluidas', async () => {
      const chart = await createChart(
        chartBody(single([q.nwuA]), {
          chartKind: 'histogram-normalized',
          settings: {
            numericWithUnit: {
              strategy: 'normalize',
              targetUnit: 'ha',
              factors: { ha: 1, m2: 0.0001 },
            },
          },
        }),
      );
      expect(
        (await getChart(chart.chartId)).settings?.numericWithUnit?.strategy,
      ).toBe('normalize');

      const body = await preview(chart.chartId, 'private');
      // «cuadras» no tiene factor: 1 respuesta excluida.
      expect(body.normalization).toEqual(
        expect.objectContaining({ targetUnit: 'ha', excludedCount: 1 }),
      );
    });
  });

  // ── Criterio 10 ───────────────────────────────────────────────────────────

  describe('C10 — orden dentro de la categoría', () => {
    it('criterio 10: los gráficos se reordenan dentro de su categoría', async () => {
      const c1 = await createChart(chartBody(single([q.scA])));
      const c2 = await createChart(chartBody(single([q.scB])));
      const c3 = await createChart(
        chartBody(single([q.ynA]), { chartKind: 'donut' }),
      );

      const wanted = [c3.chartId, c1.chartId, c2.chartId];
      const current = (await listCharts({ categoryId }))
        .sort((a, b) => a.position - b.position)
        .map((c) => c.chartId)
        .filter((id) => !wanted.includes(id));
      const order = [...wanted, ...current];

      await http()
        .patch(`${BASE}/charts/reorder`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ categoryId, chartIds: order })
        .expect(200);

      const after = (await listCharts({ categoryId }))
        .sort((a, b) => a.position - b.position)
        .map((c) => c.chartId)
        .filter((id) => wanted.includes(id));
      expect(after).toEqual(wanted);
    });
  });

  // ── Criterio 11 ───────────────────────────────────────────────────────────

  describe('C11 — archivar y restaurar', () => {
    it('criterio 11: archivar saca el gráfico de los listados activos y restaurar lo devuelve', async () => {
      const chart = await createChart(chartBody(single([q.scA])));

      await action(chart.chartId, 'archive').expect(okStatus);
      const active = await listCharts({ categoryId });
      expect(active.map((c) => c.chartId)).not.toContain(chart.chartId);
      const archived = await listCharts({ categoryId, archived: 'true' });
      expect(archived.map((c) => c.chartId)).toContain(chart.chartId);
      expect((await getChart(chart.chartId)).archivedAt).not.toBeNull();

      await action(chart.chartId, 'restore').expect(okStatus);
      const restored = await listCharts({ categoryId });
      expect(restored.map((c) => c.chartId)).toContain(chart.chartId);
      expect((await getChart(chart.chartId)).archivedAt).toBeNull();
    });
  });

  describe('filtros del listado de gráficos y del catálogo (servidor)', () => {
    it('GET /charts filtra por status y por audience', async () => {
      const draftPublic = await createChart(
        chartBody(single([q.scA]), { audience: 'public' }),
      );
      const draftPrivate = await createChart(
        chartBody(single([q.scA]), { audience: 'private' }),
      );
      const published = await createChart(
        chartBody(single([q.scA]), { audience: 'public' }),
      );
      await action(published.chartId, 'publish').expect(okStatus);

      const onlyPublished = await listCharts({
        categoryId,
        status: 'published',
      });
      expect(onlyPublished.map((c) => c.chartId)).toContain(published.chartId);
      expect(onlyPublished.map((c) => c.chartId)).not.toContain(
        draftPublic.chartId,
      );
      expect(onlyPublished.every((c) => c.status === 'published')).toBe(true);

      const onlyPrivate = await listCharts({ categoryId, audience: 'private' });
      expect(onlyPrivate.map((c) => c.chartId)).toContain(draftPrivate.chartId);
      expect(onlyPrivate.map((c) => c.chartId)).not.toContain(
        draftPublic.chartId,
      );
      expect(onlyPrivate.every((c) => c.audience === 'private')).toBe(true);
    });

    it('GET /questions filtra por questionTypeId (UUID del tipo)', async () => {
      const res = await http()
        .get(`${BASE}/questions`)
        .query({ instrumentId: instrumentAId, questionTypeId: typeIds.yes_no })
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      const ids = listOf<CatalogItem>(res.body).map((i) => i.questionId);
      expect(ids).toContain(q.ynA);
      expect(ids).not.toContain(q.scA);
      expect(ids).not.toContain(q.phoneA);
    });
  });

  // ── Criterio 12 ───────────────────────────────────────────────────────────

  describe('C12 — auditoría', () => {
    it('criterio 12: cada escritura deja un evento y el gráfico registra quién lo creó, editó y publicó', async () => {
      const chart = await createChart(chartBody(single([q.scA])));
      expect(userIdOf(chart.createdBy)).toBe(adminUserId);

      await http()
        .patch(`${BASE}/charts/${chart.chartId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ title: `${TITLE_PREFIX} auditado` })
        .expect(200);
      await action(chart.chartId, 'publish').expect(okStatus);
      await action(chart.chartId, 'unpublish').expect(okStatus);
      await action(chart.chartId, 'archive').expect(okStatus);
      await action(chart.chartId, 'restore').expect(okStatus);

      const after = await getChart(chart.chartId);
      expect(userIdOf(after.createdBy)).toBe(adminUserId);
      expect(userIdOf(after.updatedBy)).toBe(adminUserId);
      expect(userIdOf(after.publishedBy)).toBe(adminUserId);

      const res = await http()
        .get(`${BASE}/charts/${chart.chartId}/events`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      const events = listOf<ChartEvent>(res.body);
      const types = events.map((e) => e.eventType);
      for (const t of [
        'created',
        'updated',
        'published',
        'unpublished',
        'archived',
        'restored',
      ]) {
        expect(types).toContain(t);
      }
      for (const e of events) {
        expect(e.userId).toBe(adminUserId);
        expect(Number.isNaN(Date.parse(e.createdAt))).toBe(false);
      }
    });

    it('criterio 12 (P6): publicar deja el gráfico publicado con fecha', async () => {
      const chart = await createChart(chartBody(single([q.scB])));
      await action(chart.chartId, 'publish').expect(okStatus);
      const after = await getChart(chart.chartId);
      expect(after.status).toBe('published');
      expect(after.publishedAt).not.toBeNull();
    });
  });

  // ── Criterio 13 ───────────────────────────────────────────────────────────

  describe('C13 — categorías: desactivar en vez de borrar; OVERVIEW reservada', () => {
    const categories = async (): Promise<CategoryBody[]> => {
      const res = await http()
        .get(`${BASE}/categories`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      return listOf<CategoryBody>(res.body);
    };

    it('las categorías sembradas incluyen C1–C14 y OVERVIEW reservada', async () => {
      const all = await categories();
      const codes = all.map((c) => c.code);
      for (let i = 1; i <= 14; i++) expect(codes).toContain(`C${i}`);
      const overview = all.find((c) => c.code === 'OVERVIEW');
      expect(overview?.isReserved).toBe(true);
    });

    it('criterio 13: una categoría con gráficos no se borra, se desactiva', async () => {
      await createChart(chartBody(single([q.scA])));
      const del = await http()
        .delete(`${BASE}/categories/${categoryId}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect([400, 409]).toContain(del.status);
      expect((await categories()).map((c) => c.categoryId)).toContain(
        categoryId,
      );

      const off = await http()
        .patch(`${BASE}/categories/${categoryId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ isActive: false })
        .expect(200);
      expect((off.body as CategoryBody).isActive).toBe(false);

      await http()
        .patch(`${BASE}/categories/${categoryId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ isActive: true })
        .expect(200);
    });

    it('una categoría sin gráficos sí se puede borrar', async () => {
      const created = await http()
        .post(`${BASE}/categories`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ code: `${CATEGORY_CODE_PREFIX}X`, name: 'E2E 108 vacía' })
        .expect(201);
      const id = (created.body as CategoryBody).categoryId;
      const del = await http()
        .delete(`${BASE}/categories/${id}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect([200, 204]).toContain(del.status);
      expect((await categories()).map((c) => c.categoryId)).not.toContain(id);
    });

    it('criterio 13: OVERVIEW no se borra ni cambia de código', async () => {
      const overview = (await categories()).find((c) => c.code === 'OVERVIEW');
      expect(overview).toBeDefined();

      const del = await http()
        .delete(`${BASE}/categories/${overview!.categoryId}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect([400, 403, 409]).toContain(del.status);

      const rename = await http()
        .patch(`${BASE}/categories/${overview!.categoryId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ code: `${CATEGORY_CODE_PREFIX}O` });
      expect([400, 403, 409]).toContain(rename.status);

      const after = (await categories()).find(
        (c) => c.categoryId === overview!.categoryId,
      );
      expect(after?.code).toBe('OVERVIEW');
    });
  });

  // ── Criterio 14 ───────────────────────────────────────────────────────────

  describe('C14 — vista previa con datos reales y las barreras del 107', () => {
    it('criterio 14: misma supresión de celda en ambas audiencias', async () => {
      const chart = await createChart(chartBody(single([q.scA])));
      for (const audience of ['public', 'private'] as const) {
        const body = await preview(chart.chartId, audience);
        const series = body.series[0];
        expect(series.answeredCount).toBe(6);
        expect(series.suppressed).toBe(false);
        expect(optionOf(series, 'Café')).toEqual(
          expect.objectContaining({ count: 5, suppressed: false }),
        );
        // Cacao tiene 1 respuesta (< MIN_CELL_SIZE): suprimida, nunca 0 ni omitida.
        expect(optionOf(series, 'Cacao')).toEqual(
          expect.objectContaining({ count: null, suppressed: true }),
        );
      }
    });

    it('criterio 14: muestra insuficiente se suprime en ambas audiencias', async () => {
      const chart = await createChart(chartBody(single([q.smallA])));
      for (const audience of ['public', 'private'] as const) {
        const series = (await preview(chart.chartId, audience)).series[0];
        expect(series.suppressed).toBe(true);
        expect(series.aggregation).toBeNull();
      }
    });

    it('criterio 14: la vista previa de una configuración sin guardar da lo mismo que la guardada', async () => {
      const body = chartBody(single([q.scA]));
      const saved = await createChart(body);
      const unsaved = await http()
        .post(`${BASE}/preview`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ ...body, audience: 'public' })
        .expect(okStatus);
      expect((unsaved.body as PreviewBody).series).toEqual(
        (await preview(saved.chartId, 'public')).series,
      );
    });
  });

  // ── Criterio 15 ───────────────────────────────────────────────────────────

  describe('C15 — fusión por encuesta distinta', () => {
    it('criterio 15: un gráfico fusionado cuenta cada encuesta una sola vez', async () => {
      // scA (S0..S5) + scB (S0..S2, S6, S7): 8 encuestas distintas, no 11.
      const chart = await createChart(chartBody(single([q.scA, q.scB])));
      const series = (await preview(chart.chartId, 'public')).series;
      expect(series).toHaveLength(1);
      expect(series[0].answeredCount).toBe(8);
      expect(optionOf(series[0], 'Café').count).toBe(7);
      expect(optionOf(series[0], 'Cacao').suppressed).toBe(true);
    });
  });

  // ── Criterio 16 ───────────────────────────────────────────────────────────

  describe('C16 — comparación por series', () => {
    it('criterio 16: cada serie se agrega por separado y vuelve con su etiqueta', async () => {
      const chart = await createChart(
        chartBody(
          [
            { seriesKey: 'a', label: 'Taller A', questionIds: [q.ynA] },
            { seriesKey: 'b', label: 'Taller B', questionIds: [q.ynB] },
          ],
          { chartKind: 'yes-percent-bars', combineMode: 'compare' },
        ),
      );
      expect(chart.combineMode).toBe('compare');

      const series = (await preview(chart.chartId, 'public')).series;
      expect(series).toHaveLength(2);
      const a = series.find((s) => s.seriesKey === 'a')!;
      const b = series.find((s) => s.seriesKey === 'b')!;
      expect(a.label).toBe('Taller A');
      expect(b.label).toBe('Taller B');
      expect(a.answeredCount).toBe(6);
      expect(b.answeredCount).toBe(5);
    });
  });

  // ── Criterio 17 ───────────────────────────────────────────────────────────

  describe('C17 — ciclo de vida de una fuente', () => {
    it('criterio 17: una pregunta archivada sigue agregando; una borrada se pierde como fuente', async () => {
      const chart = await createChart(chartBody(single([q.archA, q.delA])));

      // Archivar archA (spec 84) y borrar delA (sin respuestas, como exige el 84).
      await ds.query(
        `UPDATE questions SET archived_at = NOW() WHERE question_id = $1`,
        [q.archA],
      );
      await ds.query(`DELETE FROM responses WHERE question_id = $1`, [q.delA]);
      await ds.query(`DELETE FROM options_question WHERE question_id = $1`, [
        q.delA,
      ]);
      await ds.query(`DELETE FROM questions WHERE question_id = $1`, [q.delA]);

      const after = await getChart(chart.chartId);
      expect(sourceIdsOf(after)).toEqual([q.archA]);

      // Solo queda archA, archivada: sus 6 respuestas siguen sumando.
      const series = (await preview(chart.chartId, 'public')).series;
      expect(series[0].answeredCount).toBe(6);
    });
  });

  // ── Criterio 18 ───────────────────────────────────────────────────────────

  describe('C18 — salud «requiere revisión»', () => {
    it('criterio 18: una fuente que pasa a estar bloqueada marca el gráfico y la vista previa la excluye', async () => {
      const chart = await createChart(chartBody(single([q.blkA, q.scB])));
      expect(chart.health).toBe('ok');

      await withBlocked(q.blkA, async () => {
        const after = await getChart(chart.chartId);
        expect(after.health).toBe('needs_review');
        expect(after.status).toBe('draft'); // nunca cambia de estado solo

        const body = await preview(chart.chartId, 'public');
        expect(body.health).toBe('needs_review');
        expect(body.excludedSources.map((s) => s.questionId)).toContain(q.blkA);
        // Solo scB: S0..S2, S6, S7.
        expect(body.series[0].answeredCount).toBe(5);
      });

      expect((await getChart(chart.chartId)).health).toBe('ok');
    });

    it('criterio 18: una fuente que cambia a un tipo incompatible marca el gráfico y se excluye', async () => {
      const chart = await createChart(chartBody(single([q.blkA, q.scB])));
      await action(chart.chartId, 'publish').expect(okStatus);

      await ds.query(
        `UPDATE questions SET type_id = $1 WHERE question_id = $2`,
        [typeIds.multiple_choice, q.blkA],
      );
      try {
        const after = await getChart(chart.chartId);
        expect(after.health).toBe('needs_review');
        expect(after.status).toBe('published'); // nunca se despublica solo

        const body = await preview(chart.chartId, 'public');
        expect(body.excludedSources.map((s) => s.questionId)).toContain(q.blkA);
      } finally {
        await ds.query(
          `UPDATE questions SET type_id = $1 WHERE question_id = $2`,
          [typeIds.single_choice, q.blkA],
        );
      }
    });
  });

  // ── Criterio 19 ───────────────────────────────────────────────────────────

  describe('C19 — semilla de C1, C2 y Resumen general', () => {
    // Ejecuta el CLI real contra desarrollo (`--env development`). Deja en la
    // base los gráficos sembrados: es el estado que la Fase 4 deja a propósito.
    // La comparación visual contra la curaduría del 66 es manual (Fase 4).
    const runSeed = () =>
      execFileSync(
        'pnpm',
        ['-s', 'seed:dashboard-charts', '--env', 'development'],
        {
          cwd: path.resolve(__dirname, '..'),
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'pipe'],
          timeout: 300_000,
        },
      );

    const seededCharts = async () => {
      const res = await http()
        .get(`${BASE}/categories`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      const cats = listOf<CategoryBody>(res.body).filter((c) =>
        ['C1', 'C2', 'OVERVIEW'].includes(c.code),
      );
      const result: Record<string, ChartBody[]> = {};
      for (const c of cats) {
        result[c.code] = await listCharts({ categoryId: c.categoryId });
      }
      return result;
    };

    it('criterio 19: la semilla es idempotente, reporta lo que no resuelve y siembra C1, C2 y OVERVIEW publicados y públicos', async () => {
      runSeed();
      const first = await seededCharts();
      const secondOutput = runSeed();
      const second = await seededCharts();

      for (const code of ['C1', 'C2', 'OVERVIEW']) {
        expect(second[code]?.length ?? 0).toBeGreaterThan(0);
        expect(second[code].map((c) => c.chartId).sort()).toEqual(
          first[code].map((c) => c.chartId).sort(),
        );
        for (const c of second[code]) {
          expect(c.status).toBe('published');
          expect(c.audience).toBe('public');
        }
      }
      // El reporte de lo no resuelto aparece aunque esté vacío.
      expect(secondOutput).toMatch(/no resuelt|unresolved/i);
    }, 600_000);
  });

  // ── Criterios 21–24 — métricas de entidad (P13, aprobada 2026-11-17) ───────

  describe('P13 — métricas de entidad (criterios 21–24)', () => {
    // MIN_SAMPLE_THRESHOLD y MIN_CELL_SIZE del 107 (`dashboard-privacy.config.ts`,
    // ambos 5). Se copian aquí para que el archivo compile sin el 107 mergeado.
    const MIN_SAMPLE = 5;
    const MIN_CELL = 5;
    const GEO_PREFIX = 'E2E108';

    // Catálogo exacto (P13): gráficos en orden (el primero es el default) y
    // filtros globales aceptados.
    const GEO_FILTERS = ['departmentId', 'townId', 'cropId'];
    const RESPONSE_FILTERS = [
      'gender',
      'ageRange',
      'educationLevel',
      'connectivity',
      'profile',
      'tenure',
      'chainStage',
      'actorTypeId',
      'campaignId',
      'dateFrom',
      'dateTo',
    ];
    const EXPECTED_METRICS: Record<
      string,
      { entity: string; charts: string[] }
    > = {
      farmers_by_department: {
        entity: 'farmer',
        charts: ['map', 'bars', 'horizontal-bars'],
      },
      farms_by_department: {
        entity: 'farm',
        charts: ['map', 'bars', 'horizontal-bars'],
      },
      farms_by_crop: {
        entity: 'farm',
        charts: ['bars', 'horizontal-bars', 'donut'],
      },
      production_units_by_crop: {
        entity: 'production_unit',
        charts: ['bars', 'horizontal-bars', 'donut'],
      },
      farm_area_distribution: { entity: 'farm', charts: ['histogram'] },
    };

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

    interface AreaBin {
      from: number | null;
      to: number | null;
      count: number | null;
      percentage: number | null;
      suppressed: boolean;
    }

    interface MetricPreview {
      health: 'ok' | 'needs_review';
      metricKey: string;
      ignoredFilters: string[];
      excludedSources: unknown[];
      series: {
        seriesKey: string;
        label: string;
        answeredCount: number;
        suppressed: boolean;
        aggregation: { buckets: MetricBucket[] } | { bins: AreaBin[] } | null;
      }[];
    }

    interface MetricChart {
      chartId: string;
      status: string;
      sourceKind: string;
      metricKey: string | null;
      questionType: string | null;
      chartKind: string;
      series: unknown[];
    }

    // Datos propios: departamentos, municipios y cultivos nuevos, de modo que
    // las celdas de esas categorías solo contienen lo sembrado aquí, aunque la
    // base de desarrollo tenga otros productores y fincas.
    const geo = { depBig: '', depSmall: '', townBig: '', townSmall: '' };
    const crop = { x: '', y: '', z: '' };
    const farmIds: string[] = [];
    const farmerIds: string[] = [];
    const farmCropIds: string[] = [];
    // Áreas de las 12 fincas del departamento grande; la última sin área.
    // 0.37 (mínimo) y 487.3 (atípico, máximo) nunca deben aparecer en la respuesta.
    const BIG_AREAS: (number | null)[] = [
      0.37,
      1,
      1.5,
      2,
      2,
      2.5,
      3,
      3,
      3.5,
      4,
      487.3,
      null,
    ];
    const AREA_MIN = 0.37;
    const AREA_MAX = 487.3;

    const metricBody = (
      metricKey: string | undefined,
      chartKind: string,
      overrides: Record<string, unknown> = {},
    ): Record<string, unknown> => ({
      categoryId,
      title: `${TITLE_PREFIX} métrica ${randomUUID().slice(0, 8)}`,
      sourceKind: 'entity_metric',
      metricKey,
      chartKind,
      audience: 'public',
      layout: 'normal',
      ...overrides,
    });

    const createMetricChart = async (
      metricKey: string,
      chartKind: string,
    ): Promise<MetricChart> => {
      const res = await http()
        .post(`${BASE}/charts`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send(metricBody(metricKey, chartKind));
      expect(res.status).toBe(201);
      return res.body as MetricChart;
    };

    const metricPreview = async (
      chartId: string,
      audience: 'public' | 'private',
      filters: Record<string, string> = {},
    ): Promise<MetricPreview> => {
      const res = await http()
        .get(`${BASE}/charts/${chartId}/preview`)
        .query({ audience, ...filters })
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      return res.body as MetricPreview;
    };

    const bucketsOf = (body: MetricPreview): MetricBucket[] => {
      const aggregation = body.series[0]?.aggregation;
      if (!aggregation || !('buckets' in aggregation)) {
        throw new Error('La métrica no devolvió `buckets`');
      }
      return aggregation.buckets;
    };

    const bucket = (body: MetricPreview, id: string): MetricBucket => {
      const found = bucketsOf(body).find((b) => b.id === id);
      if (!found) throw new Error(`Celda ${id} ausente en la métrica`);
      return found;
    };

    /** Todos los números de un JSON, a cualquier profundidad. */
    const numbersIn = (node: unknown, out: number[] = []): number[] => {
      if (typeof node === 'number') out.push(node);
      else if (Array.isArray(node)) node.forEach((n) => numbersIn(n, out));
      else if (node && typeof node === 'object') {
        Object.values(node as Record<string, unknown>).forEach((v) =>
          numbersIn(v, out),
        );
      }
      return out;
    };

    /** Todas las claves de un JSON, a cualquier profundidad. */
    const keysIn = (node: unknown, out: string[] = []): string[] => {
      if (Array.isArray(node)) node.forEach((n) => keysIn(n, out));
      else if (node && typeof node === 'object') {
        for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
          out.push(k);
          keysIn(v, out);
        }
      }
      return out;
    };

    beforeAll(async () => {
      const one = async <T>(sql: string, params: unknown[]): Promise<T> =>
        (await ds.query<T[]>(sql, params))[0];

      const department = async (name: string) =>
        (
          await one<{ department_id: string }>(
            `INSERT INTO departments (department_id, name) VALUES (gen_random_uuid(), $1)
             RETURNING department_id`,
            [name],
          )
        ).department_id;
      const town = async (name: string, departmentId: string) =>
        (
          await one<{ town_id: string }>(
            `INSERT INTO towns (town_id, name, department_id) VALUES (gen_random_uuid(), $1, $2)
             RETURNING town_id`,
            [name, departmentId],
          )
        ).town_id;
      const cropType = async (name: string) =>
        (
          await one<{ crop_id: string }>(
            `INSERT INTO types_of_crops (crop_id, name) VALUES (gen_random_uuid(), $1)
             RETURNING crop_id`,
            [name],
          )
        ).crop_id;
      const farm = async (
        name: string,
        townId: string,
        area: number | null,
      ) => {
        const { farm_id } = await one<{ farm_id: string }>(
          `INSERT INTO farms (farm_id, name, town_id, area) VALUES (gen_random_uuid(), $1, $2, $3)
           RETURNING farm_id`,
          [name, townId, area],
        );
        farmIds.push(farm_id);
        return farm_id;
      };
      const farmer = async (name: string, primaryFarmId: string) => {
        const { id } = await one<{ id: string }>(
          `INSERT INTO farmers (id, name, farm_id) VALUES (gen_random_uuid(), $1, $2)
           RETURNING id`,
          [name, primaryFarmId],
        );
        farmerIds.push(id);
        return id;
      };
      const link = (farmerId: string, farmId: string, primary: boolean) =>
        ds.query(
          `INSERT INTO farmer_farms (farmer_farm_id, farmer_id, farm_id, role, is_primary, source)
           VALUES (gen_random_uuid(), $1, $2, 'producer', $3, 'admin')`,
          [farmerId, farmId, primary],
        );
      const plant = async (
        farmId: string,
        cropId: string,
        archived = false,
      ) => {
        const { farm_crop_id } = await one<{ farm_crop_id: string }>(
          `INSERT INTO farms_crops (farm_crop_id, farm_id, crop_id, archived_at)
           VALUES (gen_random_uuid(), $1, $2, $3)
           RETURNING farm_crop_id`,
          [farmId, cropId, archived ? new Date() : null],
        );
        farmCropIds.push(farm_crop_id);
      };

      geo.depBig = await department(`${GEO_PREFIX} Dep grande`);
      geo.depSmall = await department(`${GEO_PREFIX} Dep pequeño`);
      geo.townBig = await town(`${GEO_PREFIX} Mun grande`, geo.depBig);
      geo.townSmall = await town(`${GEO_PREFIX} Mun pequeño`, geo.depSmall);
      crop.x = await cropType(`${GEO_PREFIX} Cultivo X`);
      crop.y = await cropType(`${GEO_PREFIX} Cultivo Y`);
      crop.z = await cropType(`${GEO_PREFIX} Cultivo Z`);

      // Departamento grande: 12 fincas, 11 productores (el 11 tiene también la 12).
      // Cultivo X activo en B1–B8 y archivado en B12; Y en B5–B12.
      const big: string[] = [];
      for (const [i, area] of BIG_AREAS.entries()) {
        big.push(
          await farm(`${GEO_PREFIX} Finca B${i + 1}`, geo.townBig, area),
        );
      }
      for (let i = 0; i < 11; i++) {
        const id = await farmer(`${GEO_PREFIX} Productor B${i + 1}`, big[i]);
        await link(id, big[i], true);
        if (i === 10) await link(id, big[11], false);
      }
      for (let i = 0; i < 8; i++) await plant(big[i], crop.x);
      await plant(big[11], crop.x, true);
      for (let i = 4; i < 12; i++) await plant(big[i], crop.y);

      // Departamento pequeño: 2 fincas, 2 productores, cultivo Z (< MIN_CELL).
      for (const [i, area] of [1, 2].entries()) {
        const id = await farm(
          `${GEO_PREFIX} Finca S${i + 1}`,
          geo.townSmall,
          area,
        );
        const producer = await farmer(`${GEO_PREFIX} Productor S${i + 1}`, id);
        await link(producer, id, true);
        await plant(id, crop.z);
      }
    }, 120_000);

    afterAll(async () => {
      // Orden inverso a la siembra.
      if (farmCropIds.length) {
        await ds.query(
          `DELETE FROM farms_crops WHERE farm_crop_id = ANY($1::uuid[])`,
          [farmCropIds],
        );
      }
      if (farmerIds.length) {
        await ds.query(
          `DELETE FROM farmer_farms WHERE farmer_id = ANY($1::uuid[])`,
          [farmerIds],
        );
        await ds.query(`DELETE FROM farmers WHERE id = ANY($1::uuid[])`, [
          farmerIds,
        ]);
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
      const townIds = [geo.townBig, geo.townSmall].filter(Boolean);
      if (townIds.length) {
        await ds.query(`DELETE FROM towns WHERE town_id = ANY($1::uuid[])`, [
          townIds,
        ]);
      }
      const departmentIds = [geo.depBig, geo.depSmall].filter(Boolean);
      if (departmentIds.length) {
        await ds.query(
          `DELETE FROM departments WHERE department_id = ANY($1::uuid[])`,
          [departmentIds],
        );
      }
    }, 60_000);

    // ── Criterio 21 ─────────────────────────────────────────────────────────

    it('criterio 21: GET /entity-metrics lista exactamente las cinco métricas con sus gráficos y filtros', async () => {
      const res = await http()
        .get(`${BASE}/entity-metrics`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      const items = listOf<MetricCatalogItem>(res.body);

      expect(items.map((m) => m.metricKey).sort()).toEqual(
        Object.keys(EXPECTED_METRICS).sort(),
      );
      for (const item of items) {
        const expected = EXPECTED_METRICS[item.metricKey];
        expect(typeof item.label).toBe('string');
        expect(item.label.length).toBeGreaterThan(0);
        expect(item.entity).toBe(expected.entity);
        // Orden incluido: el primero es el gráfico por defecto.
        expect(item.charts).toEqual(expected.charts);
        // Filtros: solo los geográficos y de cultivo; ninguno derivado de respuestas.
        expect([...item.filters].sort()).toEqual([...GEO_FILTERS].sort());
        for (const f of RESPONSE_FILTERS) expect(item.filters).not.toContain(f);
      }
    });

    it('criterio 21: ?entity= filtra el catálogo en el servidor', async () => {
      const res = await http()
        .get(`${BASE}/entity-metrics`)
        .query({ entity: 'farm' })
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(
        listOf<MetricCatalogItem>(res.body)
          .map((m) => m.metricKey)
          .sort(),
      ).toEqual(
        [
          'farm_area_distribution',
          'farms_by_crop',
          'farms_by_department',
        ].sort(),
      );
    });

    it('criterio 21: el catálogo de métricas es solo ADMIN', async () => {
      await http().get(`${BASE}/entity-metrics`).expect(401);
      await http()
        .get(`${BASE}/entity-metrics`)
        .set('Authorization', `Bearer ${researcherToken}`)
        .expect(403);
    });

    // ── Criterio 22 ─────────────────────────────────────────────────────────

    it('criterio 22: un gráfico de métrica se crea con metricKey y sin fuentes, en borrador', async () => {
      const chart = await createMetricChart('farms_by_department', 'map');
      expect(chart.status).toBe('draft');
      expect(chart.sourceKind).toBe('entity_metric');
      expect(chart.metricKey).toBe('farms_by_department');
      expect(chart.chartKind).toBe('map');
      expect(chart.questionType).toBeNull();
      expect(chart.series ?? []).toEqual([]);

      const stored = await http()
        .get(`${BASE}/charts/${chart.chartId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect((stored.body as MetricChart).metricKey).toBe(
        'farms_by_department',
      );
    });

    it('criterio 22: metricKey desconocido o ausente, o una métrica con fuentes, responde 400', async () => {
      const send = (body: Record<string, unknown>) =>
        http()
          .post(`${BASE}/charts`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send(body);

      await send(metricBody('e2e108_unknown_metric', 'bars')).expect(400);
      await send(metricBody(undefined, 'bars')).expect(400);
      await send(
        metricBody('farms_by_crop', 'bars', {
          combineMode: 'merge',
          series: single([q.scA]),
        }),
      ).expect(400);
      // Una métrica no se declara con sourceKind 'questions'.
      await send(
        metricBody('farms_by_crop', 'bars', { sourceKind: 'questions' }),
      ).expect(400);
    });

    it.each([
      ['farms_by_department', 'donut'],
      ['farmers_by_department', 'histogram'],
      ['farms_by_crop', 'map'],
      ['production_units_by_crop', 'histogram'],
      ['farm_area_distribution', 'bars'],
    ])(
      'criterio 22: %s no admite el gráfico %s (DASHBOARD_CHART_INCOMPATIBLE)',
      async (metricKey, chartKind) => {
        const res = await http()
          .post(`${BASE}/charts`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send(metricBody(metricKey, chartKind));
        expect(res.status).toBe(400);
        expect((res.body as BuilderError).code).toBe(CHART_INCOMPATIBLE);
      },
    );

    // ── Criterio 23 ─────────────────────────────────────────────────────────

    it.each([
      // [métrica, gráfico, celda visible, conteo esperado, celda suprimida]
      ['farmers_by_department', 'bars', 'depBig', 11, 'depSmall'],
      ['farms_by_department', 'bars', 'depBig', 12, 'depSmall'],
    ] as const)(
      'criterio 23: %s cuenta por departamento con celda mínima, en ambas audiencias',
      async (metricKey, chartKind, visible, expected, hidden) => {
        const chart = await createMetricChart(metricKey, chartKind);
        for (const audience of ['public', 'private'] as const) {
          const body = await metricPreview(chart.chartId, audience);
          expect(body.metricKey).toBe(metricKey);
          expect(body.excludedSources).toEqual([]);
          expect(body.series).toHaveLength(1);
          expect(body.series[0].suppressed).toBe(false);
          expect(bucket(body, geo[visible])).toEqual(
            expect.objectContaining({ count: expected, suppressed: false }),
          );
          // 2 entidades (< MIN_CELL): presente, suprimida, nunca 0 ni omitida.
          expect(bucket(body, geo[hidden])).toEqual(
            expect.objectContaining({
              count: null,
              percentage: null,
              suppressed: true,
            }),
          );
          for (const b of bucketsOf(body)) {
            if (!b.suppressed) {
              expect(b.count).toBeGreaterThanOrEqual(MIN_CELL);
            }
          }
        }
      },
    );

    it.each(['farms_by_crop', 'production_units_by_crop'])(
      'criterio 23: %s cuenta solo cultivos activos, con celda mínima',
      async (metricKey) => {
        const chart = await createMetricChart(metricKey, 'bars');
        for (const audience of ['public', 'private'] as const) {
          const body = await metricPreview(chart.chartId, audience);
          // X: 8 activos (el archivado de B12 no cuenta); Y: 8.
          expect(bucket(body, crop.x)).toEqual(
            expect.objectContaining({ count: 8, suppressed: false }),
          );
          expect(bucket(body, crop.y)).toEqual(
            expect.objectContaining({ count: 8, suppressed: false }),
          );
          expect(bucket(body, crop.z)).toEqual(
            expect.objectContaining({ count: null, suppressed: true }),
          );
        }
      },
    );

    it('criterio 23: una métrica con menos de MIN_SAMPLE_THRESHOLD entidades se suprime entera', async () => {
      const chart = await createMetricChart('farms_by_crop', 'bars');
      for (const audience of ['public', 'private'] as const) {
        // Departamento pequeño: 2 fincas.
        const body = await metricPreview(chart.chartId, audience, {
          departmentId: geo.depSmall,
        });
        expect(body.series[0].answeredCount).toBeLessThan(MIN_SAMPLE);
        expect(body.series[0].suppressed).toBe(true);
        expect(body.series[0].aggregation).toBeNull();
      }
    });

    it('criterio 23: aplica los filtros que acepta e informa los demás en ignoredFilters', async () => {
      const chart = await createMetricChart('farms_by_department', 'bars');
      const body = await metricPreview(chart.chartId, 'public', {
        departmentId: geo.depBig,
        gender: 'Mujer',
        dateFrom: '2099-01-01',
      });
      // departmentId se aplicó: solo queda el departamento grande, intacto
      // pese a dateFrom y gender, que no le aplican.
      expect(bucketsOf(body).map((b) => b.id)).toEqual([geo.depBig]);
      expect(bucket(body, geo.depBig).count).toBe(12);
      expect([...body.ignoredFilters].sort()).toEqual(['dateFrom', 'gender']);

      const noFilters = await metricPreview(chart.chartId, 'public');
      expect(noFilters.ignoredFilters).toEqual([]);
    });

    // ── Criterio 24 ─────────────────────────────────────────────────────────

    it('criterio 24: el área sale por intervalos del 107, sin valores crudos ni mínimo/máximo', async () => {
      const chart = await createMetricChart(
        'farm_area_distribution',
        'histogram',
      );
      for (const audience of ['public', 'private'] as const) {
        const body = await metricPreview(chart.chartId, audience, {
          departmentId: geo.depBig,
        });
        const series = body.series[0];
        // 11 fincas con área (B12 no tiene).
        expect(series.answeredCount).toBe(11);
        expect(series.suppressed).toBe(false);
        const aggregation = series.aggregation as {
          bins: AreaBin[];
        } | null;
        expect(aggregation).not.toBeNull();
        const bins = aggregation!.bins;
        expect(bins.length).toBeGreaterThan(0);

        // Extremos abiertos, contiguos.
        expect(bins[0].from).toBeNull();
        expect(bins[bins.length - 1].to).toBeNull();
        bins.forEach((b, i) => {
          if (i > 0) expect(b.from).not.toBeNull();
          if (i < bins.length - 1) {
            expect(b.to).not.toBeNull();
            expect(b.to).toBe(bins[i + 1].from);
          }
          // Celda mínima.
          if (b.suppressed) {
            expect(b.count).toBeNull();
            expect(b.percentage).toBeNull();
          } else {
            expect(b.count).toBeGreaterThanOrEqual(MIN_CELL);
          }
        });
        // Complementaria (P18-e): con el total visible, nunca un solo suprimido.
        expect(bins.filter((b) => b.suppressed)).not.toHaveLength(1);

        // Sin valores crudos ni extremos.
        const keys = keysIn(aggregation);
        for (const forbidden of ['distribution', 'min', 'max', 'values']) {
          expect(keys).not.toContain(forbidden);
        }
        const numbers = numbersIn(aggregation);
        expect(numbers).not.toContain(AREA_MAX);
        expect(numbers).not.toContain(AREA_MIN);
      }
    });

    it('criterio 24: con menos de MIN_SAMPLE_THRESHOLD fincas con área, la distribución se suprime', async () => {
      const chart = await createMetricChart(
        'farm_area_distribution',
        'histogram',
      );
      const body = await metricPreview(chart.chartId, 'public', {
        departmentId: geo.depSmall,
      });
      expect(body.series[0].suppressed).toBe(true);
      expect(body.series[0].aggregation).toBeNull();
    });
  });
});
