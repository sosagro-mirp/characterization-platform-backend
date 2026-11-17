/**
 * e2e-107 — Endurecer la privacidad del dashboard.
 * `spec/107_endurecer_privacidad_dashboard.md` (raíz del ecosistema).
 *
 * ESTAS PRUEBAS NACEN EN ROJO (enfoque test-first). Se escriben contra el
 * código del spec 66 ya mergeado (`dashboard-privacy.config.ts`); sobre una
 * rama sin el 66 el archivo ni siquiera importa. Hoy fallan porque:
 *   - `PII_QUESTION_DENYLIST` y `isIdentifyingQuestionText` son registro, no
 *     barrera (criterios 1 y 2);
 *   - `aggregateYesNo` no aplica `suppressCell` (criterios 4 y 13);
 *   - los numéricos devuelven `distribution`, `min` y `max` y no traen
 *     intervalos (criterios 5, 6, 7 y 14);
 *   - `GET /dashboard/analytics?instrumentId=` es público (criterio 8).
 *
 * Cubre los criterios 1–9, 12, 13 y 14 del spec. El 10 vive en
 * `frontend/lib/dashboard/e2e-107-endurecerPrivacidadDashboard.test.ts` y en
 * `docs/testing/test-107-endurecer-privacidad-dashboard.md`; el 11 en
 * `mcp/test/e2e-107-mcp-endurecer-privacidad-dashboard.spec.ts`.
 *
 * ── Contrato que fija este archivo (lo que el spec deja abierto) ────────────
 * Intervalo (`bins[]` de `numeric` y de cada grupo de `numeric_with_unit`):
 *   { from: number | null; to: number | null;
 *     count: number | null; percentage: number | null; suppressed: boolean }
 *   - `from: null` = extremo abierto inferior («menos de `to`»);
 *     `to: null` = extremo abierto superior («`from` o más»). Un extremo
 *     abierto NO puede llevar el límite que no tiene: ese número sería el
 *     mínimo o el máximo (lectura estricta de P24).
 *   - Intervalos contiguos: `bins[i].to === bins[i + 1].from`.
 *   - Suprimido ⇒ `count` y `percentage` en `null`; visible ⇒
 *     `count >= MIN_CELL_SIZE`.
 *   - Supresión complementaria (criterio 14, 2026-11-17): con el total
 *     visible nunca queda exactamente un intervalo suprimido; se suprime
 *     también el siguiente más pequeño.
 * Agregación numérica: sin las claves `distribution`, `min` ni `max`;
 *   `median`, `q1` y `q3` en `null` por debajo de `2 × MIN_SAMPLE_THRESHOLD`
 *   respuestas; `average` se mantiene.
 * Sí/No: mismos campos planos de hoy, ahora anulables, más una bandera por
 *   celda: `yesCount`, `noCount`, `yesPercentage`, `noPercentage`
 *   (`number | null`) y `yesSuppressed`, `noSuppressed` (`boolean`).
 *   Supresión complementaria (criterio 13, 2026-11-17): si una celda se
 *   suprime, la otra también; `answeredCount` puede seguir visible.
 * Denylist por locator: la barrera consulta `PII_QUESTION_DENYLIST` al servir
 *   (este archivo le agrega una entrada propia con `jest.mock` antes de
 *   cargar la app; ver criterio 1).
 *
 * Datos: un instrumento propio (código `E2E-107`) con sus preguntas y 41
 * encuestas `origin` por defecto (12 para casi todo; 41 para el criterio 14), sembrados por SQL directo; usuarios
 * `e2e-107-*@test.local` (ADMIN, RESEARCHER, POLLSTER) y una API key `read`
 * del ADMIN. Todo se elimina en `afterAll`, en orden inverso.
 *
 * ENTORNO: SOLO contra la base de desarrollo (`DATABASE_URL` activa del
 * `.env`, Neon `sosagro-dev`), NUNCA contra producción.
 */

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getOptionsToken } from '@nestjs/throttler';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { AppModule } from '../src/app.module';
import {
  DENIED_SYSTEM_FIELDS,
  MIN_CELL_SIZE,
  MIN_SAMPLE_THRESHOLD,
  PII_QUESTION_DENYLIST,
} from '../src/dashboard/dashboard-privacy.config';

// Criterio 1: una pregunta de la denylist por locator que NO tiene
// `systemField` ni texto identificante, para que solo esa barrera la pueda
// bloquear (todas las entradas reales de la lista también caen por texto).
// `jest.mock` se eleva sobre los imports: la entrada existe antes de que el
// servicio cargue la configuración. Los literales se repiten abajo porque la
// fábrica no puede leer variables del archivo.
jest.mock('../src/dashboard/dashboard-privacy.config', () => {
  const actual = jest.requireActual<{
    PII_QUESTION_DENYLIST: {
      instrumentCode: string;
      questionText: string;
      reason: string;
    }[];
  }>('../src/dashboard/dashboard-privacy.config');
  actual.PII_QUESTION_DENYLIST.push({
    instrumentCode: 'E2E-107',
    questionText: 'Cantidad de colmenas (e2e 107)',
    reason: 'e2e-107: entrada de prueba de la barrera por locator.',
  });
  return actual;
});

jest.setTimeout(180_000);

const INSTRUMENT_CODE = 'E2E-107';
const DENYLISTED_TEXT = 'Cantidad de colmenas (e2e 107)';
const PREFIX = 'e2e-107';
const TEST_PASSWORD = 'E2eTest1234!';

// ─── valores sembrados ──────────────────────────────────────────────────────
// Numérica con 12 respuestas (≥ 2 × umbral): extremos atípicos y decimales,
// para que un mínimo o un máximo filtrado sea inconfundible.
const NUM_MIN = 1.37;
const NUM_MAX = 987.65;
const NUM_VALUES = [NUM_MIN, 41, 43, 44, 46, 47, 48, 49, 51, 52, 54, NUM_MAX];
// Numérica con 6 respuestas (≥ umbral, < 2 × umbral): solo promedio.
const SMALL_VALUES = [20, 22, 25, 27, 30, 33];
// Criterio 14 (supresión complementaria en intervalos): cuatro grupos densos
// de 10 respuestas y un valor aislado entre ellos. Con intervalos de ancho
// redondo (P24), el valor aislado cae solo en un intervalo bajo MIN_CELL_SIZE
// y los demás superan el umbral: sin supresión complementaria, total − visibles
// revelaría ese conteo. Si la regla de P24 agrupa distinto y ningún intervalo
// queda bajo el umbral, se ajusta esta siembra (con aprobación).
const BIN_COMPLEMENT_VALUES = [
  ...Array<number>(10).fill(10),
  ...Array<number>(10).fill(20),
  30,
  ...Array<number>(10).fill(40),
  ...Array<number>(10).fill(50),
];
// Numérica con unidad, 12 respuestas en hectáreas.
const UNIT_MIN = 0.37;
const UNIT_MAX = 876.54;
const UNIT_VALUES = [
  UNIT_MIN,
  11,
  12,
  13,
  14,
  15,
  16,
  17,
  18,
  19,
  21,
  UNIT_MAX,
];
// Edad (`farmer.age`) para `overview`.
const AGE_VALUES = [19, 24, 31, 35, 38, 42, 44, 47, 51, 56, 63, 71];
// Sí/No: 10 «Sí» y 1 «No» → la celda «No» queda bajo MIN_CELL_SIZE.
const YES_NO_VALUES = [...Array<boolean>(10).fill(true), false];
// Criterio 13 (supresión complementaria): 7 «Sí» y 2 «No». Con el total (9)
// visible, mostrar el 7 permitiría reconstruir el 2 restando.
const COMPLEMENT_YES = 7;
const COMPLEMENT_NO = 2;
const COMPLEMENT_VALUES = [
  ...Array<boolean>(COMPLEMENT_YES).fill(true),
  ...Array<boolean>(COMPLEMENT_NO).fill(false),
];
// Control del criterio 13: 7 «Sí» y 5 «No», ambas celdas ≥ MIN_CELL_SIZE.
const CONTROL_YES = 7;
const CONTROL_NO = 5;
const CONTROL_VALUES = [
  ...Array<boolean>(CONTROL_YES).fill(true),
  ...Array<boolean>(CONTROL_NO).fill(false),
];

// Identificantes (6 respuestas cada uno): valores reconocibles en el cuerpo.
const DENYLISTED_VALUES = [
  7771001, 7771002, 7771003, 7771004, 7771005, 7771006,
];
const TEXT_PII_VALUES = [
  3007771001, 3007771002, 3007771003, 3007771004, 3007771005, 3007771006,
];
const DOCUMENT_VALUES = [
  917771001, 917771002, 917771003, 917771004, 917771005, 917771006,
];
const PHONE_VALUES = [
  3017771001, 3017771002, 3017771003, 3017771004, 3017771005, 3017771006,
];
const PRODUCER_PHONE_VALUES = [
  3027771001, 3027771002, 3027771003, 3027771004, 3027771005, 3027771006,
];
const PRODUCER_DOCUMENT_VALUES = [
  927771001, 927771002, 927771003, 927771004, 927771005, 927771006,
];

// 12 encuestas para el resto de preguntas; más si el criterio 14 las necesita.
const SURVEY_COUNT = Math.max(12, BIN_COMPLEMENT_VALUES.length);

// ─── tipos de la respuesta ──────────────────────────────────────────────────

interface Bin {
  from: number | null;
  to: number | null;
  count: number | null;
  percentage: number | null;
  suppressed: boolean;
}

interface NumericAggregation {
  type: 'numeric';
  count: number;
  average: number | null;
  median: number | null;
  q1: number | null;
  q3: number | null;
  bins: Bin[];
  [key: string]: unknown;
}

interface UnitGroup {
  optionId: string;
  unit: string;
  count: number | null;
  suppressed: boolean;
  average: number | null;
  median: number | null;
  q1: number | null;
  q3: number | null;
  bins: Bin[];
  [key: string]: unknown;
}

interface YesNoAggregation {
  type: 'yes_no';
  yesCount: number | null;
  noCount: number | null;
  yesPercentage: number | null;
  noPercentage: number | null;
  yesSuppressed: boolean;
  noSuppressed: boolean;
}

interface DashboardQuestion {
  questionId: string;
  questionText: string;
  questionType: string;
  systemField: string | null;
  suppressed: boolean;
  answeredCount: number;
  aggregation: Record<string, unknown> | null;
}

interface AnalyticsBody {
  suppressed: boolean;
  questions: DashboardQuestion[];
}

interface OverviewBody {
  suppressed: boolean;
  age: Record<string, unknown> | null;
  experienceYears: Record<string, unknown> | null;
}

interface DashboardCategory {
  id: string;
}

// ─── utilidades ─────────────────────────────────────────────────────────────

const RAW_VALUE_KEYS = ['distribution', 'min', 'max'];

/** Claves de valores crudos o extremos presentes en una agregación numérica
 * (en la raíz o en sus grupos por unidad). */
function rawValueKeysIn(aggregation: Record<string, unknown>): string[] {
  const found = RAW_VALUE_KEYS.filter((key) => key in aggregation);
  const units = aggregation.units;
  if (Array.isArray(units)) {
    for (const group of units as Record<string, unknown>[]) {
      found.push(
        ...RAW_VALUE_KEYS.filter((key) => key in group).map(
          (key) => `units[].${key}`,
        ),
      );
    }
  }
  return found;
}

/** Todas las hojas numéricas de un objeto. */
function numericLeaves(value: unknown): number[] {
  if (typeof value === 'number') return [value];
  if (Array.isArray(value)) return value.flatMap(numericLeaves);
  if (value && typeof value === 'object') {
    return Object.values(value).flatMap(numericLeaves);
  }
  return [];
}

function isNumericType(type: string): boolean {
  return type === 'numeric' || type === 'numeric_with_unit';
}

/** Respuestas sembradas que caen en un intervalo (`to` es exclusivo). */
function valuesInBin(values: number[], bin: Bin): number {
  return values.filter(
    (v) =>
      (bin.from === null || v >= bin.from) && (bin.to === null || v < bin.to),
  ).length;
}

/**
 * Criterio 14: con el total visible, nunca queda exactamente un intervalo
 * suprimido (total − visibles lo revelaría). Si se conocen los valores
 * sembrados, además ninguna resta entre el total y los conteos visibles da el
 * conteo real de un intervalo suprimido.
 */
function expectNoReconstructableBin(
  total: number | null | undefined,
  bins: Bin[] | undefined,
  label: string,
  values?: number[],
): void {
  if (typeof total !== 'number' || !Array.isArray(bins)) return;
  const hidden = bins.filter((bin) => bin.suppressed);
  expect({ label, suppressedBins: hidden.length === 1 }).toEqual({
    label,
    suppressedBins: false,
  });
  if (!values || hidden.length === 0) return;
  const visibleSum = bins
    .filter((bin) => !bin.suppressed)
    .reduce((sum, bin) => sum + (bin.count ?? 0), 0);
  const reconstructed = total - visibleSum;
  for (const bin of hidden) {
    expect({ label, bin, real: valuesInBin(values, bin) }).not.toEqual({
      label,
      bin,
      real: reconstructed,
    });
  }
}

function expectValidBins(bins: Bin[] | undefined, label: string): void {
  expect(Array.isArray(bins)).toBe(true);
  const list = bins!;
  expect(list.length).toBeGreaterThan(0);

  // Extremos abiertos: el primero sin límite inferior, el último sin superior.
  expect({ label, from: list[0].from }).toEqual({ label, from: null });
  expect({ label, to: list[list.length - 1].to }).toEqual({ label, to: null });

  for (let i = 0; i < list.length; i++) {
    const bin = list[i];
    // Solo los extremos pueden ser abiertos.
    if (i > 0) expect(typeof bin.from).toBe('number');
    if (i < list.length - 1) {
      expect(typeof bin.to).toBe('number');
      expect(bin.to).toBe(list[i + 1].from);
    }
    if (bin.suppressed) {
      expect(bin.count).toBeNull();
      expect(bin.percentage).toBeNull();
    } else {
      expect(bin.count).toBeGreaterThanOrEqual(MIN_CELL_SIZE);
    }
  }
}

// ─── suite ──────────────────────────────────────────────────────────────────

describe('e2e-107 — Endurecer la privacidad del dashboard', () => {
  let app: INestApplication<App>;
  let ds: DataSource;
  let server: App;

  let adminToken: string;
  let researcherToken: string;
  let pollsterToken: string;
  let apiKey: string;

  let instrumentId: string | undefined;
  const surveyIds: string[] = [];

  let numQuestionId: string;
  let smallQuestionId: string;
  let binComplementQuestionId: string;
  let unitQuestionId: string;
  let hectaresOptionId: string;
  let ageQuestionId: string;
  let yesNoQuestionId: string;
  let complementQuestionId: string;
  let controlYesNoQuestionId: string;
  let denylistedQuestionId: string;
  let textPiiQuestionId: string;
  let documentQuestionId: string;
  let phoneQuestionId: string;
  let producerPhoneQuestionId: string;
  let producerDocumentQuestionId: string;

  // Respuestas que se reutilizan entre criterios (se piden una sola vez).
  let adminAnalytics: AnalyticsBody;
  let overview: OverviewBody;
  const categoryBodies: AnalyticsBody[] = [];
  const allBodies: string[] = [];

  const http = () => request(server);
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

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
         VALUES (gen_random_uuid(), 'E2E', 'Spec107', $1, $2, $3, false)`,
        [email, hash, roles[0].role_id],
      );
    }
    const login = await http()
      .post('/api/auth/login')
      .send({ email, password: TEST_PASSWORD })
      .expect(200);
    return (login.body as { accessToken: string }).accessToken;
  }

  async function insertQuestion(
    sectionId: string,
    typeName: string,
    text: string,
    systemField: string | null,
    order: number,
  ): Promise<string> {
    const typeRows = await ds.query<{ type_id: string }[]>(
      `SELECT type_id FROM types_of_questions WHERE name = $1`,
      [typeName],
    );
    const rows = await ds.query<{ question_id: string }[]>(
      `INSERT INTO questions (question_id, section_id, text, type_id, is_required, "order", system_field)
       VALUES (gen_random_uuid(), $1, $2, $3, false, $4, $5)
       RETURNING question_id`,
      [sectionId, text, typeRows[0].type_id, order, systemField],
    );
    return rows[0].question_id;
  }

  async function insertOption(questionId: string, text: string) {
    const rows = await ds.query<{ option_id: string }[]>(
      `INSERT INTO options_question (option_id, question_id, text)
       VALUES (gen_random_uuid(), $1, $2)
       RETURNING option_id`,
      [questionId, text],
    );
    return rows[0].option_id;
  }

  async function answerNumeric(
    questionId: string,
    values: number[],
    optionId: string | null = null,
  ): Promise<void> {
    for (let i = 0; i < values.length; i++) {
      await ds.query(
        `INSERT INTO responses (response_id, survey_id, question_id, option_id, numeric_value)
         VALUES (gen_random_uuid(), $1, $2, $3, $4)`,
        [surveyIds[i], questionId, optionId, values[i]],
      );
    }
  }

  /** Borra un instrumento de prueba y todo lo que cuelga de él. */
  async function purgeInstrument(id: string): Promise<void> {
    const surveys = await ds.query<{ survey_id: string }[]>(
      `SELECT survey_id FROM surveys_instruments WHERE instrument_id = $1`,
      [id],
    );
    const ids = surveys.map((s) => s.survey_id);
    if (ids.length) {
      await ds.query(
        `DELETE FROM responses WHERE survey_id = ANY($1::uuid[])`,
        [ids],
      );
      await ds.query(
        `DELETE FROM surveys_instruments WHERE survey_id = ANY($1::uuid[])`,
        [ids],
      );
      await ds.query(`DELETE FROM surveys WHERE survey_id = ANY($1::uuid[])`, [
        ids,
      ]);
    }
    await ds.query(
      `DELETE FROM responses WHERE question_id IN (
         SELECT q.question_id FROM questions q
         JOIN sections s ON s.section_id = q.section_id
         WHERE s.instrument_id = $1)`,
      [id],
    );
    await ds.query(
      `DELETE FROM options_question WHERE question_id IN (
         SELECT q.question_id FROM questions q
         JOIN sections s ON s.section_id = q.section_id
         WHERE s.instrument_id = $1)`,
      [id],
    );
    await ds.query(
      `DELETE FROM questions WHERE section_id IN (
         SELECT section_id FROM sections WHERE instrument_id = $1)`,
      [id],
    );
    await ds.query(`DELETE FROM sections WHERE instrument_id = $1`, [id]);
    await ds.query(`DELETE FROM instruments WHERE instrument_id = $1`, [id]);
  }

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
    server = app.getHttpServer();

    // Restos de una corrida anterior interrumpida (el código es único).
    const leftovers = await ds.query<{ instrument_id: string }[]>(
      `SELECT instrument_id FROM instruments WHERE code = $1`,
      [INSTRUMENT_CODE],
    );
    for (const row of leftovers) await purgeInstrument(row.instrument_id);

    adminToken = await ensureUser('admin');
    researcherToken = await ensureUser('researcher');
    pollsterToken = await ensureUser('pollster');

    const [adminRow] = await ds.query<{ user_id: string }[]>(
      `SELECT user_id FROM users WHERE email = $1`,
      [`${PREFIX}-admin@test.local`],
    );
    const keyRes = await http()
      .post('/api/api-keys')
      .set(auth(adminToken))
      .send({
        name: 'e2e-107 read',
        scopes: ['read'],
        userId: adminRow.user_id,
      })
      .expect(201);
    apiKey = (keyRes.body as { key: string }).key;

    const [instrument] = await ds.query<{ instrument_id: string }[]>(
      `INSERT INTO instruments (instrument_id, name, version, publish_date, is_active, code)
       VALUES (gen_random_uuid(), 'E2E 107 privacidad dashboard', 1, CURRENT_DATE, true, $1)
       RETURNING instrument_id`,
      [INSTRUMENT_CODE],
    );
    instrumentId = instrument.instrument_id;

    const [section] = await ds.query<{ section_id: string }[]>(
      `INSERT INTO sections (section_id, name, "order", instrument_id)
       VALUES (gen_random_uuid(), 'E2E 107 sección', 1, $1)
       RETURNING section_id`,
      [instrumentId],
    );
    const sectionId = section.section_id;

    let order = 1;
    numQuestionId = await insertQuestion(
      sectionId,
      'numeric',
      'Número de árboles por lote (e2e 107)',
      null,
      order++,
    );
    binComplementQuestionId = await insertQuestion(
      sectionId,
      'numeric',
      'Plantas por surco (e2e 107)',
      null,
      order++,
    );
    smallQuestionId = await insertQuestion(
      sectionId,
      'numeric',
      'Litros de agua por riego (e2e 107)',
      null,
      order++,
    );
    unitQuestionId = await insertQuestion(
      sectionId,
      'numeric_with_unit',
      'Área sembrada (e2e 107)',
      null,
      order++,
    );
    ageQuestionId = await insertQuestion(
      sectionId,
      'numeric',
      'Edad (e2e 107)',
      'farmer.age',
      order++,
    );
    yesNoQuestionId = await insertQuestion(
      sectionId,
      'yes_no',
      '¿Usa riego tecnificado? (e2e 107)',
      null,
      order++,
    );
    complementQuestionId = await insertQuestion(
      sectionId,
      'yes_no',
      '¿Hace compostaje? (e2e 107)',
      null,
      order++,
    );
    controlYesNoQuestionId = await insertQuestion(
      sectionId,
      'yes_no',
      '¿Tiene vivero propio? (e2e 107)',
      null,
      order++,
    );
    denylistedQuestionId = await insertQuestion(
      sectionId,
      'numeric',
      DENYLISTED_TEXT,
      null,
      order++,
    );
    textPiiQuestionId = await insertQuestion(
      sectionId,
      'numeric',
      'Número de celular de contacto (e2e 107)',
      null,
      order++,
    );
    // Textos neutros a propósito: solo el `systemField` los puede bloquear.
    documentQuestionId = await insertQuestion(
      sectionId,
      'numeric_with_unit',
      'Dato A (e2e 107)',
      'farmer.documentId',
      order++,
    );
    phoneQuestionId = await insertQuestion(
      sectionId,
      'numeric',
      'Dato B (e2e 107)',
      'farmer.phone',
      order++,
    );
    producerPhoneQuestionId = await insertQuestion(
      sectionId,
      'numeric',
      'Dato C (e2e 107)',
      'farmer.producerPhone',
      order++,
    );
    producerDocumentQuestionId = await insertQuestion(
      sectionId,
      'numeric',
      'Dato D (e2e 107)',
      'farmer.producerDocumentId',
      order++,
    );

    hectaresOptionId = await insertOption(unitQuestionId, 'hectáreas');
    const documentUnitOptionId = await insertOption(documentQuestionId, 'CC');

    for (let i = 0; i < SURVEY_COUNT; i++) {
      const [survey] = await ds.query<{ survey_id: string }[]>(
        `INSERT INTO surveys (survey_id, sincronized) VALUES (gen_random_uuid(), true)
         RETURNING survey_id`,
      );
      surveyIds.push(survey.survey_id);
      await ds.query(
        `INSERT INTO surveys_instruments (survey_id, instrument_id) VALUES ($1, $2)`,
        [survey.survey_id, instrumentId],
      );
    }

    await answerNumeric(numQuestionId, NUM_VALUES);
    await answerNumeric(smallQuestionId, SMALL_VALUES);
    await answerNumeric(binComplementQuestionId, BIN_COMPLEMENT_VALUES);
    await answerNumeric(unitQuestionId, UNIT_VALUES, hectaresOptionId);
    await answerNumeric(ageQuestionId, AGE_VALUES);
    await answerNumeric(denylistedQuestionId, DENYLISTED_VALUES);
    await answerNumeric(textPiiQuestionId, TEXT_PII_VALUES);
    await answerNumeric(
      documentQuestionId,
      DOCUMENT_VALUES,
      documentUnitOptionId,
    );
    await answerNumeric(phoneQuestionId, PHONE_VALUES);
    await answerNumeric(producerPhoneQuestionId, PRODUCER_PHONE_VALUES);
    await answerNumeric(producerDocumentQuestionId, PRODUCER_DOCUMENT_VALUES);
    for (const [questionId, values] of [
      [yesNoQuestionId, YES_NO_VALUES],
      [complementQuestionId, COMPLEMENT_VALUES],
      [controlYesNoQuestionId, CONTROL_VALUES],
    ] as const) {
      for (let i = 0; i < values.length; i++) {
        await ds.query(
          `INSERT INTO responses (response_id, survey_id, question_id, boolean_value)
           VALUES (gen_random_uuid(), $1, $2, $3)`,
          [surveyIds[i], questionId, values[i]],
        );
      }
    }

    // Respuestas compartidas por varios criterios. La consulta por
    // instrumento se pide con token de ADMIN: tras P20 deja de ser pública.
    const analyticsRes = await http()
      .get('/api/dashboard/analytics')
      .query({ instrumentId })
      .set(auth(adminToken));
    adminAnalytics = analyticsRes.body as AnalyticsBody;
    allBodies.push(JSON.stringify(analyticsRes.body));

    const overviewRes = await http().get('/api/dashboard/overview');
    overview = overviewRes.body as OverviewBody;
    allBodies.push(JSON.stringify(overviewRes.body));

    const kpisRes = await http().get('/api/dashboard/kpis');
    allBodies.push(JSON.stringify(kpisRes.body));

    const categoriesRes = await http()
      .get('/api/dashboard/categories')
      .expect(200);
    for (const category of categoriesRes.body as DashboardCategory[]) {
      const res = await http()
        .get('/api/dashboard/analytics')
        .query({ categoryId: category.id });
      if (res.status === 200) categoryBodies.push(res.body as AnalyticsBody);
      allBodies.push(JSON.stringify(res.body));
    }
  });

  afterAll(async () => {
    const safe = async (fn: () => Promise<unknown>) => {
      try {
        await fn();
      } catch {
        /* limpieza tolerante: se reporta lo que quede con la consulta final */
      }
    };
    if (instrumentId) {
      const id = instrumentId;
      await safe(() => purgeInstrument(id));
    }
    // Las API keys caen en cascada con su usuario.
    await safe(() =>
      ds.query(`DELETE FROM users WHERE email LIKE $1`, [`${PREFIX}-%`]),
    );
    await app.close();
  });

  const servedIds = () =>
    (adminAnalytics.questions ?? []).map((q) => q.questionId);
  const served = (questionId: string) =>
    (adminAnalytics.questions ?? []).find((q) => q.questionId === questionId);

  // ─── criterios ────────────────────────────────────────────────────────────

  it('criterio 1 — una pregunta de PII_QUESTION_DENYLIST no aparece aunque su tipo y su systemField lo permitan', () => {
    // La entrada de prueba está en la lista (la puso el jest.mock)…
    expect(
      PII_QUESTION_DENYLIST.some(
        (entry) =>
          entry.instrumentCode === INSTRUMENT_CODE &&
          entry.questionText === DENYLISTED_TEXT,
      ),
    ).toBe(true);
    // …el instrumento sí se sirve (control)…
    expect(servedIds()).toContain(numQuestionId);
    // …pero la pregunta de la denylist no, ni sus valores en ninguna respuesta.
    expect(servedIds()).not.toContain(denylistedQuestionId);
    for (const body of allBodies) {
      for (const value of DENYLISTED_VALUES) {
        expect(body).not.toContain(String(value));
      }
    }
  });

  it('criterio 2 — una numérica sin systemField con texto identificante no aparece', () => {
    expect(servedIds()).toContain(numQuestionId);
    expect(servedIds()).not.toContain(textPiiQuestionId);
    for (const body of allBodies) {
      expect(body).not.toContain('Número de celular de contacto (e2e 107)');
      for (const value of TEXT_PII_VALUES) {
        expect(body).not.toContain(String(value));
      }
    }
  });

  it('criterio 3 — documentId, phone, producerPhone y producerDocumentId no aparecen ni filtran valores', () => {
    const blocked = [
      documentQuestionId,
      phoneQuestionId,
      producerPhoneQuestionId,
      producerDocumentQuestionId,
    ];
    expect(servedIds()).toContain(numQuestionId);
    for (const id of blocked) expect(servedIds()).not.toContain(id);

    const values = [
      ...DOCUMENT_VALUES,
      ...PHONE_VALUES,
      ...PRODUCER_PHONE_VALUES,
      ...PRODUCER_DOCUMENT_VALUES,
    ];
    for (const body of allBodies) {
      for (const value of values) {
        expect(body).not.toContain(String(value));
      }
    }
  });

  it('criterio 4 — Sí/No con una celda bajo MIN_CELL_SIZE la devuelve suprimida, nunca cero ni omitida', () => {
    const question = served(yesNoQuestionId);
    expect(question).toBeDefined();
    expect(question!.suppressed).toBe(false);
    expect(question!.answeredCount).toBe(YES_NO_VALUES.length);

    const aggregation = question!.aggregation as unknown as YesNoAggregation;
    expect(aggregation.type).toBe('yes_no');

    // «Sí» (10) también queda suprimida por la supresión complementaria
    // (criterio 13, ampliación de P18 del 2026-11-17); aquí solo se fija la
    // celda pequeña.

    // «No»: 1 respuesta, suprimida — presente, con null, no 0 ni ausente.
    expect('noCount' in aggregation).toBe(true);
    expect('noPercentage' in aggregation).toBe(true);
    expect(aggregation.noSuppressed).toBe(true);
    expect(aggregation.noCount).toBeNull();
    expect(aggregation.noPercentage).toBeNull();
  });

  it('criterio 5 — ninguna respuesta de analytics ni de overview trae distribution, min ni max de un numérico', () => {
    const offenders: string[] = [];
    for (const body of [adminAnalytics, ...categoryBodies]) {
      for (const question of body.questions ?? []) {
        if (!isNumericType(question.questionType) || !question.aggregation) {
          continue;
        }
        for (const key of rawValueKeysIn(question.aggregation)) {
          offenders.push(`${question.questionText} → ${key}`);
        }
      }
    }
    for (const [name, stats] of [
      ['overview.age', overview.age],
      ['overview.experienceYears', overview.experienceYears],
    ] as const) {
      if (!stats) continue;
      for (const key of rawValueKeysIn(stats)) {
        offenders.push(`${name} → ${key}`);
      }
    }
    expect(offenders).toEqual([]);

    // Los casos sembrados existen (la prueba no pasa en vacío) y sus extremos
    // no aparecen como ningún número de la agregación.
    const numeric = served(numQuestionId);
    const unit = served(unitQuestionId);
    expect(numeric?.aggregation).toBeTruthy();
    expect(unit?.aggregation).toBeTruthy();
    const numericNumbers = numericLeaves(numeric!.aggregation);
    expect(numericNumbers).not.toContain(NUM_MIN);
    expect(numericNumbers).not.toContain(NUM_MAX);
    const unitNumbers = numericLeaves(unit!.aggregation);
    expect(unitNumbers).not.toContain(UNIT_MIN);
    expect(unitNumbers).not.toContain(UNIT_MAX);

    // `overview` tiene edades sembradas: su bloque existe y va por intervalos.
    expect(overview.age).not.toBeNull();
    expect(Array.isArray(overview.age!.bins)).toBe(true);
  });

  it('criterio 6 — los numéricos devuelven intervalos con extremos abiertos y celda mínima por intervalo', () => {
    const numeric = served(numQuestionId)!.aggregation as NumericAggregation;
    expect(numeric.type).toBe('numeric');
    expectValidBins(numeric.bins, 'numeric');
    // Con n ≥ 2 × MIN_CELL_SIZE, ensanchar los extremos antes de suprimir
    // deja al menos un intervalo visible.
    expect(numeric.bins.some((bin) => !bin.suppressed)).toBe(true);

    const small = served(smallQuestionId)!.aggregation as NumericAggregation;
    expectValidBins(small.bins, 'numeric (6 respuestas)');

    const unit = served(unitQuestionId)!.aggregation as {
      units: UnitGroup[];
    };
    const hectares = unit.units.find((g) => g.optionId === hectaresOptionId);
    expect(hectares).toBeDefined();
    expectValidBins(hectares!.bins, 'numeric_with_unit (hectáreas)');

    expectValidBins(
      overview.age!.bins as Bin[] | undefined,
      'overview.age (farmer.age)',
    );
  });

  it('criterio 7 — mediana y cuartiles solo con al menos 2 × MIN_SAMPLE_THRESHOLD respuestas', () => {
    const threshold = 2 * MIN_SAMPLE_THRESHOLD;
    expect(NUM_VALUES.length).toBeGreaterThanOrEqual(threshold);
    expect(SMALL_VALUES.length).toBeLessThan(threshold);
    expect(SMALL_VALUES.length).toBeGreaterThanOrEqual(MIN_SAMPLE_THRESHOLD);

    const numeric = served(numQuestionId)!.aggregation as NumericAggregation;
    expect(typeof numeric.median).toBe('number');
    expect(typeof numeric.q1).toBe('number');
    expect(typeof numeric.q3).toBe('number');
    expect(typeof numeric.average).toBe('number');

    const small = served(smallQuestionId)!.aggregation as NumericAggregation;
    expect(small.median ?? null).toBeNull();
    expect(small.q1 ?? null).toBeNull();
    expect(small.q3 ?? null).toBeNull();
    expect(typeof small.average).toBe('number');

    const hectares = (
      served(unitQuestionId)!.aggregation as { units: UnitGroup[] }
    ).units.find((g) => g.optionId === hectaresOptionId)!;
    expect(typeof hectares.median).toBe('number');
    expect(typeof hectares.q1).toBe('number');
    expect(typeof hectares.q3).toBe('number');
  });

  describe('criterio 8 — analytics?instrumentId= exige ADMIN o RESEARCHER', () => {
    it('sin token responde 401', async () => {
      await http()
        .get('/api/dashboard/analytics')
        .query({ instrumentId })
        .expect(401);
    });

    it('con POLLSTER responde 403', async () => {
      await http()
        .get('/api/dashboard/analytics')
        .query({ instrumentId })
        .set(auth(pollsterToken))
        .expect(403);
    });

    it('con ADMIN y con RESEARCHER responde 200 con Cache-Control: private, no-store', async () => {
      for (const token of [adminToken, researcherToken]) {
        const res = await http()
          .get('/api/dashboard/analytics')
          .query({ instrumentId })
          .set(auth(token))
          .expect(200);
        const cacheControl = String(res.headers['cache-control'] ?? '');
        expect(cacheControl).toMatch(/\bprivate\b/);
        expect(cacheControl).toMatch(/\bno-store\b/);
        expect(cacheControl).not.toMatch(/\bpublic\b/);
        expect((res.body as AnalyticsBody).questions.length).toBeGreaterThan(0);
      }
    });

    it('con la API key read de un ADMIN (uso del MCP) responde 200', async () => {
      const res = await http()
        .get('/api/dashboard/analytics')
        .query({ instrumentId })
        .set('X-API-Key', apiKey)
        .expect(200);
      expect(String(res.headers['cache-control'] ?? '')).toMatch(
        /\bno-store\b/,
      );
    });
  });

  it('criterio 9 — analytics?categoryId= sigue respondiendo sin token', async () => {
    const res = await http()
      .get('/api/dashboard/analytics')
      .query({ categoryId: 'C1' })
      .expect(200);
    const body = res.body as AnalyticsBody;
    expect(Array.isArray(body.questions)).toBe(true);
    expect(typeof body.suppressed).toBe('boolean');
    // Todas las categorías respondieron 200 sin token en el beforeAll.
    expect(categoryBodies.length).toBe(allBodies.length - 3);
  });

  it('criterio 12 — las barreras del hotfix y del 66 siguen vigentes (los dos e2e de privacidad se corren aparte)', () => {
    // La verificación completa del criterio 12 es correr en verde
    // `e2e-bug-dashboard-farmer-identifiers` y `e2e-066-dashboard-privacy`
    // (Fase 6). Aquí se fija que la configuración en la que se apoyan no se
    // perdió al resolver el conflicto del merge con el 66.
    expect(DENIED_SYSTEM_FIELDS).toEqual(
      expect.arrayContaining([
        'farmer.documentId',
        'farmer.phone',
        'farmer.producerPhone',
        'farmer.producerDocumentId',
        'farmer.name',
        'farmer.email',
        'farmer.producerName',
        'farmer.producerEmail',
        'farm.latitude',
        'farm.longitude',
        'farm.name',
        'farm.vereda',
        'farm.corregimiento',
      ]),
    );
    expect(PII_QUESTION_DENYLIST.length).toBeGreaterThan(1);
  });

  it('criterio 13 — si una celda Sí/No se suprime, la complementaria también, y ningún número permite reconstruirla', () => {
    // Precondición del caso: 7 queda visible por sí sola y 2 no.
    expect(COMPLEMENT_YES).toBeGreaterThanOrEqual(MIN_CELL_SIZE);
    expect(COMPLEMENT_NO).toBeLessThan(MIN_CELL_SIZE);

    const question = served(complementQuestionId);
    expect(question).toBeDefined();
    expect(question!.suppressed).toBe(false);

    const aggregation = question!.aggregation as unknown as YesNoAggregation;
    expect(aggregation.type).toBe('yes_no');
    // Ambas celdas suprimidas, presentes y en null.
    expect(aggregation).toEqual(
      expect.objectContaining({
        yesSuppressed: true,
        noSuppressed: true,
        yesCount: null,
        noCount: null,
        yesPercentage: null,
        noPercentage: null,
      }),
    );

    // El total puede seguir visible: sin ninguna celda no reconstruye nada.
    const total = COMPLEMENT_YES + COMPLEMENT_NO;
    const leaves = numericLeaves(question);
    const revealing = [
      COMPLEMENT_YES,
      COMPLEMENT_NO,
      Math.round((COMPLEMENT_YES / total) * 10_000) / 100,
      Math.round((COMPLEMENT_NO / total) * 10_000) / 100,
    ];
    for (const value of revealing) expect(leaves).not.toContain(value);
    // Ninguna resta entre dos números de la pregunta da la celda pequeña
    // (p. ej. total − «Sí» = «No»).
    const differences = leaves.flatMap((a) => leaves.map((b) => a - b));
    expect(differences).not.toContain(COMPLEMENT_NO);

    // Control: con ambas celdas ≥ MIN_CELL_SIZE, las dos siguen visibles.
    const control = served(controlYesNoQuestionId)!
      .aggregation as unknown as YesNoAggregation;
    expect(control).toEqual(
      expect.objectContaining({
        yesSuppressed: false,
        noSuppressed: false,
        yesCount: CONTROL_YES,
        noCount: CONTROL_NO,
      }),
    );
  });

  it('criterio 14 — con el total visible, ningún intervalo suprimido se puede reconstruir restando', () => {
    const question = served(binComplementQuestionId);
    expect(question).toBeDefined();
    expect(question!.suppressed).toBe(false);
    const aggregation = question!.aggregation as NumericAggregation;
    expect(aggregation.type).toBe('numeric');
    expect(aggregation.count).toBe(BIN_COMPLEMENT_VALUES.length);
    expectValidBins(aggregation.bins, 'numeric (criterio 14)');

    // El caso existe: al menos un intervalo tiene, con los valores sembrados,
    // menos de MIN_CELL_SIZE respuestas.
    expect(
      aggregation.bins.some(
        (bin) => valuesInBin(BIN_COMPLEMENT_VALUES, bin) < MIN_CELL_SIZE,
      ),
    ).toBe(true);
    // Ningún intervalo bajo el umbral queda visible.
    for (const bin of aggregation.bins) {
      if (valuesInBin(BIN_COMPLEMENT_VALUES, bin) < MIN_CELL_SIZE) {
        expect({ bin, suppressed: bin.suppressed }).toEqual({
          bin,
          suppressed: true,
        });
      }
    }
    expectNoReconstructableBin(
      aggregation.count,
      aggregation.bins,
      'numeric (criterio 14)',
      BIN_COMPLEMENT_VALUES,
    );

    // La misma regla en el resto de numéricas sembradas, en cada grupo por
    // unidad y en `overview` (allí sin valores conocidos: solo el conteo de
    // intervalos suprimidos).
    for (const [id, values] of [
      [numQuestionId, NUM_VALUES],
      [smallQuestionId, SMALL_VALUES],
    ] as const) {
      const agg = served(id)!.aggregation as NumericAggregation;
      expectNoReconstructableBin(agg.count, agg.bins, id, [...values]);
    }
    const unit = served(unitQuestionId)!.aggregation as { units: UnitGroup[] };
    for (const group of unit.units) {
      expectNoReconstructableBin(
        group.count,
        group.bins,
        `numeric_with_unit (${group.unit})`,
        group.optionId === hectaresOptionId ? UNIT_VALUES : undefined,
      );
    }
    for (const [name, stats] of [
      ['overview.age', overview.age],
      ['overview.experienceYears', overview.experienceYears],
    ] as const) {
      if (!stats) continue;
      expectNoReconstructableBin(
        stats.count as number | undefined,
        stats.bins as Bin[] | undefined,
        name,
      );
    }
  });
});
