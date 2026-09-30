/**
 * Spec 92 — Encuestas realizadas: el encuestador ve en la app las encuestas
 * que aplicó y sus respuestas.
 *
 * Cubre los criterios 1-6 de `spec/92_encuestas_realizadas_mobile.md`.
 *
 * ESTAS PRUEBAS NACEN EN ROJO: `GET /api/surveys/mine` no existe todavía y
 * `GET /api/surveys/:id/responses` rechaza al rol pollster con 403 (los
 * cambian la Fase 1 y la Fase 2 del spec).
 *
 * Ninguna aserción depende de `publicUrl` para ningún rol: el spec 85
 * (TC-085-E09) lo retira de la respuesta, y estas pruebas deben convivir con
 * ese cambio sin importar cuál de los dos specs se fusione primero.
 *
 * Escenario montado en base de datos:
 *   ownSessionSurveyId — de pollsterA; productor SOLO en la sesión; 1 open_text
 *   ownDirectSurveyId  — de pollsterA; productor en la encuesta; 1 open_text +
 *                        1 multiple_choice con 2 opciones (2 filas) → cuenta 2
 *   ownMediaSurveyId   — de pollsterA; imagen con adjunto 'uploaded' + imagen
 *                        con adjunto 'pending'
 *   ownEmptySurveyId   — de pollsterA, sin respuestas (marcador de paso saltado)
 *   ownPublicSurveyId  — de pollsterA pero origin='public' (canal público)
 *   otherSurveyId      — de pollsterB, con respuestas
 *
 * `ownDirectSurveyId` y `ownMediaSurveyId` comparten `created_at` a propósito
 * para verificar el desempate por `survey_id DESC`.
 */

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { AppModule } from '../src/app.module';

// ─── helpers ────────────────────────────────────────────────────────────────

const TEST_PASSWORD = 'E2eTest1234!';
const PREFIX = 'e2e-092';
const INSTRUMENT_NAME = 'E2E 092 Instrument';
const CAMPAIGN_NAME = 'E2E 092 Campaign';

interface LoginResponse {
  accessToken: string;
}

interface RoleRow {
  role_id: string;
  name: string;
}

interface MySurveyItem {
  surveyId: string;
  clientSurveyId: string | null;
  instrumentName: string | null;
  campaignName: string | null;
  farmer: { farmerId: string; name: string } | null;
  responseCount: number;
  createdAt: string;
  updatedAt: string;
}

interface MySurveysPage {
  items: MySurveyItem[];
  total: number;
  page: number;
  limit: number;
}

type ResponseRow = Record<string, unknown> & {
  questionId: string;
  questionType: string;
  sectionId: string;
  sectionOrder: number;
  hasAttachment: boolean;
};

interface SurveyResponsesResult {
  surveyId: string;
  responses: ResponseRow[];
}

function testEmail(role: string) {
  return `${PREFIX}-${role}@test.local`;
}

async function loginAs(
  app: INestApplication<App>,
  email: string,
): Promise<string> {
  const res = await request(app.getHttpServer())
    .post('/api/auth/login')
    .send({ email, password: TEST_PASSWORD })
    .expect(200);
  return (res.body as LoginResponse).accessToken;
}

// ─── suite ──────────────────────────────────────────────────────────────────

describe('spec-092 — encuestas realizadas del encuestador (e2e)', () => {
  let app: INestApplication<App>;
  let ds: DataSource;

  let adminToken: string;
  let researcherToken: string;
  let pollsterAToken: string;
  let pollsterBToken: string;
  let pollsterAId: string;
  let pollsterBId: string;

  let instrumentId: string;
  let sectionId: string;
  let textQuestionId: string;
  let multiQuestionId: string;
  let imageQuestionId: string;
  let imagePendingQuestionId: string;
  let optionAId: string;
  let optionBId: string;
  let campaignId: string;
  let sessionId: string;
  let farmerSessionId: string;
  let farmerDirectId: string;

  let ownSessionSurveyId: string;
  let ownDirectSurveyId: string;
  let ownMediaSurveyId: string;
  let ownEmptySurveyId: string;
  let ownPublicSurveyId: string;
  let otherSurveyId: string;

  const surveyIdsCreated: string[] = [];
  const FARMER_SESSION_NAME = 'E2E 092 Productor Sesión';
  const FARMER_DIRECT_NAME = 'E2E 092 Productor Directo';
  const FARMER_DIRECT_DOC = '092000111';

  async function insertSurvey(opts: {
    userId: string;
    farmerId?: string | null;
    withSession?: boolean;
    origin?: 'field' | 'public';
    clientSurveyId?: string | null;
    createdAt?: string;
  }): Promise<string> {
    const rows = await ds.query<{ survey_id: string }[]>(
      `INSERT INTO surveys (survey_id, sincronized, user_id, farmer_id, campaign_session_id, step_order, origin, client_survey_id, created_at)
       VALUES (gen_random_uuid(), true, $1, $2, $3, 1, $4, $5, COALESCE($6::timestamp, CURRENT_TIMESTAMP))
       RETURNING survey_id`,
      [
        opts.userId,
        opts.farmerId ?? null,
        opts.withSession ? sessionId : null,
        opts.origin ?? 'field',
        opts.clientSurveyId ?? null,
        opts.createdAt ?? null,
      ],
    );
    const surveyId = rows[0].survey_id;
    await ds.query(
      `INSERT INTO surveys_instruments (survey_id, instrument_id) VALUES ($1, $2)`,
      [surveyId, instrumentId],
    );
    surveyIdsCreated.push(surveyId);
    return surveyId;
  }

  async function insertTextResponse(surveyId: string): Promise<void> {
    await ds.query(
      `INSERT INTO responses (response_id, survey_id, question_id, text_value)
       VALUES (gen_random_uuid(), $1, $2, 'respuesta e2e-092')`,
      [surveyId, textQuestionId],
    );
  }

  async function insertImageWithAttachment(
    surveyId: string,
    questionId: string,
    status: 'uploaded' | 'pending',
  ): Promise<void> {
    const responseId = (
      await ds.query<{ response_id: string }[]>(
        `INSERT INTO responses (response_id, survey_id, question_id)
         VALUES (gen_random_uuid(), $1, $2) RETURNING response_id`,
        [surveyId, questionId],
      )
    )[0].response_id;
    await ds.query(
      `INSERT INTO media_attachments (attachment_id, survey_id, question_id, response_id, storage_key, public_url, mime_type, status)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, 'image/jpeg', $6)`,
      [
        surveyId,
        questionId,
        responseId,
        `e2e-092/${status}.jpg`,
        `https://example.test/e2e-092/${status}.jpg`,
        status,
      ],
    );
  }

  /** Borra los restos de una corrida anterior abortada (idempotencia). */
  async function cleanupLeftovers(): Promise<void> {
    await ds.query(
      `DELETE FROM surveys WHERE user_id IN (SELECT user_id FROM users WHERE email LIKE $1)`,
      [`${PREFIX}-%@test.local`],
    );
    await ds.query(
      `DELETE FROM campaign_sessions WHERE campaign_id IN (SELECT campaign_id FROM campaigns WHERE name = $1)`,
      [CAMPAIGN_NAME],
    );
    await ds.query(`DELETE FROM campaigns WHERE name = $1`, [CAMPAIGN_NAME]);
    await ds.query(`DELETE FROM farmers WHERE name IN ($1, $2)`, [
      FARMER_SESSION_NAME,
      FARMER_DIRECT_NAME,
    ]);
    await ds.query(
      `DELETE FROM questions WHERE section_id IN (
         SELECT s.section_id FROM sections s
         JOIN instruments i ON i.instrument_id = s.instrument_id
         WHERE i.name = $1)`,
      [INSTRUMENT_NAME],
    );
    await ds.query(
      `DELETE FROM sections WHERE instrument_id IN (SELECT instrument_id FROM instruments WHERE name = $1)`,
      [INSTRUMENT_NAME],
    );
    await ds.query(`DELETE FROM instruments WHERE name = $1`, [
      INSTRUMENT_NAME,
    ]);
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

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
    await cleanupLeftovers();

    // ── usuarios: admin, investigador, dos encuestadores ────────────────────
    const roles = await ds.query<RoleRow[]>(
      `SELECT role_id, name FROM roles WHERE name IN ('admin', 'researcher', 'pollster')`,
    );
    const roleId = (name: string) =>
      roles.find((r) => r.name === name)!.role_id;

    const hash = await bcrypt.hash(TEST_PASSWORD, 10);
    const users: Array<[string, string]> = [
      ['admin', 'admin'],
      ['researcher', 'researcher'],
      ['pollster-a', 'pollster'],
      ['pollster-b', 'pollster'],
    ];
    for (const [key, role] of users) {
      const email = testEmail(key);
      const existing = await ds.query<{ user_id: string }[]>(
        `SELECT user_id FROM users WHERE email = $1`,
        [email],
      );
      if (!existing.length) {
        await ds.query(
          `INSERT INTO users (user_id, name, last_name, email, password, role_id, must_change_password)
           VALUES (gen_random_uuid(), 'E2E', 'CompletedSurveys', $1, $2, $3, false)`,
          [email, hash, roleId(role)],
        );
      }
    }
    const idOf = async (key: string) =>
      (
        await ds.query<{ user_id: string }[]>(
          `SELECT user_id FROM users WHERE email = $1`,
          [testEmail(key)],
        )
      )[0].user_id;
    pollsterAId = await idOf('pollster-a');
    pollsterBId = await idOf('pollster-b');

    adminToken = await loginAs(app, testEmail('admin'));
    researcherToken = await loginAs(app, testEmail('researcher'));
    pollsterAToken = await loginAs(app, testEmail('pollster-a'));
    pollsterBToken = await loginAs(app, testEmail('pollster-b'));

    // ── instrumento + sección + preguntas ────────────────────────────────────
    instrumentId = (
      await ds.query<{ instrument_id: string }[]>(
        `INSERT INTO instruments (instrument_id, name, version, publish_date, is_active)
         VALUES (gen_random_uuid(), $1, 1, CURRENT_DATE, true)
         RETURNING instrument_id`,
        [INSTRUMENT_NAME],
      )
    )[0].instrument_id;

    sectionId = (
      await ds.query<{ section_id: string }[]>(
        `INSERT INTO sections (section_id, name, "order", instrument_id)
         VALUES (gen_random_uuid(), 'E2E 092 Section', 1, $1)
         RETURNING section_id`,
        [instrumentId],
      )
    )[0].section_id;

    const typeId = async (name: string) =>
      (
        await ds.query<{ type_id: string }[]>(
          `SELECT type_id FROM types_of_questions WHERE name = $1`,
          [name],
        )
      )[0].type_id;

    const insertQuestion = async (
      text: string,
      type: string,
      order: number,
    ): Promise<string> =>
      (
        await ds.query<{ question_id: string }[]>(
          `INSERT INTO questions (question_id, section_id, text, type_id, is_required, "order")
           VALUES (gen_random_uuid(), $1, $2, $3, false, $4)
           RETURNING question_id`,
          [sectionId, text, await typeId(type), order],
        )
      )[0].question_id;

    textQuestionId = await insertQuestion(
      'E2E 092 Q1 open_text',
      'open_text',
      1,
    );
    multiQuestionId = await insertQuestion(
      'E2E 092 Q2 multiple_choice',
      'multiple_choice',
      2,
    );
    imageQuestionId = await insertQuestion('E2E 092 Q3 image', 'image', 3);
    imagePendingQuestionId = await insertQuestion(
      'E2E 092 Q4 image pendiente',
      'image',
      4,
    );

    const insertOption = async (text: string, value: number) =>
      (
        await ds.query<{ option_id: string }[]>(
          `INSERT INTO options_question (option_id, question_id, text, value)
           VALUES (gen_random_uuid(), $1, $2, $3) RETURNING option_id`,
          [multiQuestionId, text, value],
        )
      )[0].option_id;
    optionAId = await insertOption('Celular', 1);
    optionBId = await insertOption('Tableta', 2);

    // ── productores ──────────────────────────────────────────────────────────
    farmerSessionId = (
      await ds.query<{ id: string }[]>(
        `INSERT INTO farmers (id, name, document_id)
         VALUES (gen_random_uuid(), $1, NULL) RETURNING id`,
        [FARMER_SESSION_NAME],
      )
    )[0].id;
    farmerDirectId = (
      await ds.query<{ id: string }[]>(
        `INSERT INTO farmers (id, name, document_id)
         VALUES (gen_random_uuid(), $1, $2) RETURNING id`,
        [FARMER_DIRECT_NAME, FARMER_DIRECT_DOC],
      )
    )[0].id;

    // ── campaña + sesión (el productor vive solo en la sesión) ───────────────
    campaignId = (
      await ds.query<{ campaign_id: string }[]>(
        `INSERT INTO campaigns (campaign_id, name, is_active)
         VALUES (gen_random_uuid(), $1, true)
         RETURNING campaign_id`,
        [CAMPAIGN_NAME],
      )
    )[0].campaign_id;

    sessionId = (
      await ds.query<{ session_id: string }[]>(
        `INSERT INTO campaign_sessions (session_id, campaign_id, farmer_id, user_id)
         VALUES (gen_random_uuid(), $1, $2, $3)
         RETURNING session_id`,
        [campaignId, farmerSessionId, pollsterAId],
      )
    )[0].session_id;

    // ── escenario ────────────────────────────────────────────────────────────
    ownSessionSurveyId = await insertSurvey({
      userId: pollsterAId,
      withSession: true,
      clientSurveyId: 'local_survey_e2e092_session',
      createdAt: '2026-09-22T10:00:00',
    });
    await insertTextResponse(ownSessionSurveyId);

    // Mismo created_at en las dos siguientes: fuerza el desempate por id.
    const tiedAt = '2026-09-21T10:00:00';

    ownDirectSurveyId = await insertSurvey({
      userId: pollsterAId,
      farmerId: farmerDirectId,
      createdAt: tiedAt,
    });
    await insertTextResponse(ownDirectSurveyId);
    // Selección múltiple: el backend guarda una fila por opción.
    for (const optionId of [optionAId, optionBId]) {
      await ds.query(
        `INSERT INTO responses (response_id, survey_id, question_id, option_id)
         VALUES (gen_random_uuid(), $1, $2, $3)`,
        [ownDirectSurveyId, multiQuestionId, optionId],
      );
    }

    ownMediaSurveyId = await insertSurvey({
      userId: pollsterAId,
      farmerId: farmerDirectId,
      createdAt: tiedAt,
    });
    await insertImageWithAttachment(
      ownMediaSurveyId,
      imageQuestionId,
      'uploaded',
    );
    await insertImageWithAttachment(
      ownMediaSurveyId,
      imagePendingQuestionId,
      'pending',
    );

    ownEmptySurveyId = await insertSurvey({
      userId: pollsterAId,
      withSession: true,
    });

    ownPublicSurveyId = await insertSurvey({
      userId: pollsterAId,
      farmerId: farmerDirectId,
      origin: 'public',
    });
    await insertTextResponse(ownPublicSurveyId);

    otherSurveyId = await insertSurvey({
      userId: pollsterBId,
      farmerId: farmerDirectId,
    });
    await insertTextResponse(otherSurveyId);
  }, 30_000);

  afterAll(async () => {
    if (surveyIdsCreated.length) {
      await ds.query(
        `DELETE FROM media_attachments WHERE survey_id = ANY($1::uuid[])`,
        [surveyIdsCreated],
      );
      await ds.query(
        `DELETE FROM responses WHERE survey_id = ANY($1::uuid[])`,
        [surveyIdsCreated],
      );
      await ds.query(
        `DELETE FROM surveys_instruments WHERE survey_id = ANY($1::uuid[])`,
        [surveyIdsCreated],
      );
      await ds.query(`DELETE FROM surveys WHERE survey_id = ANY($1::uuid[])`, [
        surveyIdsCreated,
      ]);
    }
    await ds.query(`DELETE FROM campaign_sessions WHERE session_id = $1`, [
      sessionId,
    ]);
    await ds.query(`DELETE FROM campaigns WHERE campaign_id = $1`, [
      campaignId,
    ]);
    await ds.query(`DELETE FROM farmers WHERE id = ANY($1::uuid[])`, [
      [farmerSessionId, farmerDirectId],
    ]);
    await ds.query(`DELETE FROM questions WHERE section_id = $1`, [sectionId]);
    await ds.query(`DELETE FROM sections WHERE instrument_id = $1`, [
      instrumentId,
    ]);
    await ds.query(`DELETE FROM instruments WHERE instrument_id = $1`, [
      instrumentId,
    ]);
    await ds.query(`DELETE FROM users WHERE email LIKE $1`, [
      `${PREFIX}-%@test.local`,
    ]);
    await app.close();
  }, 15_000);

  async function getMine(
    token: string,
    query: Record<string, string | number> = {},
  ): Promise<MySurveysPage> {
    const res = await request(app.getHttpServer())
      .get('/api/surveys/mine')
      .query({ limit: 50, ...query })
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    return res.body as MySurveysPage;
  }

  async function getResponses(
    token: string,
    surveyId: string,
  ): Promise<SurveyResponsesResult> {
    const res = await request(app.getHttpServer())
      .get(`/api/surveys/${surveyId}/responses`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    return res.body as SurveyResponsesResult;
  }

  // ── Criterio 1 — solo las propias, de campo y con respuestas ──────────────

  describe('GET /api/surveys/mine — alcance', () => {
    it('TC-092-A · devuelve las encuestas propias con respuestas', async () => {
      const ids = (await getMine(pollsterAToken)).items.map((i) => i.surveyId);
      expect(ids).toEqual(
        expect.arrayContaining([
          ownSessionSurveyId,
          ownDirectSurveyId,
          ownMediaSurveyId,
        ]),
      );
    });

    it('TC-092-B · nunca devuelve encuestas de otro encuestador', async () => {
      const page = await getMine(pollsterAToken);
      expect(page.items.some((i) => i.surveyId === otherSurveyId)).toBe(false);

      const pageB = await getMine(pollsterBToken);
      expect(pageB.items.map((i) => i.surveyId)).toEqual([otherSurveyId]);
    });

    it('TC-092-C · excluye encuestas sin respuestas y las del canal público', async () => {
      const ids = (await getMine(pollsterAToken)).items.map((i) => i.surveyId);
      expect(ids).not.toContain(ownEmptySurveyId);
      expect(ids).not.toContain(ownPublicSurveyId);
    });

    it('TC-092-D · está acotado al JWT también para admin (no ve las de los encuestadores)', async () => {
      const ids = (await getMine(adminToken)).items.map((i) => i.surveyId);
      expect(ids).not.toContain(ownSessionSurveyId);
      expect(ids).not.toContain(otherSurveyId);
    });

    it('TC-092-E · sin token responde 401', async () => {
      await request(app.getHttpServer()).get('/api/surveys/mine').expect(401);
    });
  });

  // ── Criterio 2 — paginación estable y validación ──────────────────────────

  describe('GET /api/surveys/mine — paginación', () => {
    it('TC-092-F · pagina con page/limit y reporta el total', async () => {
      const first = await getMine(pollsterAToken, { page: 1, limit: 2 });
      expect(first.total).toBe(3);
      expect(first.page).toBe(1);
      expect(first.limit).toBe(2);
      expect(first.items).toHaveLength(2);

      const second = await getMine(pollsterAToken, { page: 2, limit: 2 });
      expect(second.items).toHaveLength(1);

      const all = [...first.items, ...second.items].map((i) => i.surveyId);
      expect(new Set(all).size).toBe(3);
    });

    it('TC-092-G · ordena por created_at DESC y desempata por survey_id DESC', async () => {
      const ids = (await getMine(pollsterAToken)).items.map((i) => i.surveyId);
      const tied = [ownDirectSurveyId, ownMediaSurveyId].sort().reverse();
      expect(ids).toEqual([ownSessionSurveyId, ...tied]);
    });

    it('TC-092-H · el orden es idéntico entre llamadas repetidas', async () => {
      const a = (await getMine(pollsterAToken, { limit: 1, page: 2 })).items;
      const b = (await getMine(pollsterAToken, { limit: 1, page: 2 })).items;
      expect(a.map((i) => i.surveyId)).toEqual(b.map((i) => i.surveyId));
    });

    it.each([
      [{ limit: 51 }],
      [{ limit: 0 }],
      [{ page: 0 }],
      [{ page: 'abc' }],
    ])('TC-092-I · rechaza parámetros inválidos %j con 400', async (query) => {
      await request(app.getHttpServer())
        .get('/api/surveys/mine')
        .query(query)
        .set('Authorization', `Bearer ${pollsterAToken}`)
        .expect(400);
    });
  });

  // ── Criterios 3 y 4 — contenido del ítem y búsqueda ───────────────────────

  describe('GET /api/surveys/mine — contenido del ítem', () => {
    it('TC-092-J · resuelve el productor desde la sesión cuando la encuesta no lo tiene', async () => {
      const { items } = await getMine(pollsterAToken);
      const item = items.find((i) => i.surveyId === ownSessionSurveyId)!;
      expect(item.farmer).toEqual({
        farmerId: farmerSessionId,
        name: FARMER_SESSION_NAME,
      });
      expect(item.campaignName).toBe(CAMPAIGN_NAME);
      expect(item.instrumentName).toBe(INSTRUMENT_NAME);
      expect(item.clientSurveyId).toBe('local_survey_e2e092_session');
      expect(item.responseCount).toBe(1);
    });

    it('TC-092-K · usa el productor de la encuesta y campaignName null sin sesión', async () => {
      const { items } = await getMine(pollsterAToken);
      const item = items.find((i) => i.surveyId === ownDirectSurveyId)!;
      expect(item.farmer?.name).toBe(FARMER_DIRECT_NAME);
      expect(item.campaignName).toBeNull();
    });

    it('TC-092-L · responseCount cuenta preguntas, no filas (selección múltiple de 2 opciones = 1)', async () => {
      const { items } = await getMine(pollsterAToken);
      const item = items.find((i) => i.surveyId === ownDirectSurveyId)!;
      expect(item.responseCount).toBe(2);
    });

    it('TC-092-M · search filtra por nombre del productor (sin distinguir mayúsculas)', async () => {
      const { items } = await getMine(pollsterAToken, {
        search: 'productor sesión',
      });
      expect(items.map((i) => i.surveyId)).toEqual([ownSessionSurveyId]);
    });

    it('TC-092-N · search filtra por documento del productor', async () => {
      const { items } = await getMine(pollsterAToken, {
        search: FARMER_DIRECT_DOC,
      });
      expect(items.map((i) => i.surveyId).sort()).toEqual(
        [ownDirectSurveyId, ownMediaSurveyId].sort(),
      );
    });

    it('TC-092-O · search trata % y _ como texto literal', async () => {
      const { items, total } = await getMine(pollsterAToken, { search: '%' });
      expect(items).toHaveLength(0);
      expect(total).toBe(0);
    });
  });

  // ── Criterios 5 y 6 — respuestas visibles para el encuestador ─────────────

  describe('GET /api/surveys/:id/responses — encuestador', () => {
    it('TC-092-P · el encuestador obtiene las respuestas de su encuesta', async () => {
      const body = await getResponses(pollsterAToken, ownDirectSurveyId);
      expect(body.surveyId).toBe(ownDirectSurveyId);
      // 1 open_text + 2 filas de la selección múltiple
      expect(body.responses).toHaveLength(3);
    });

    it('TC-092-Q · una encuesta ajena responde 404 al encuestador', async () => {
      await request(app.getHttpServer())
        .get(`/api/surveys/${otherSurveyId}/responses`)
        .set('Authorization', `Bearer ${pollsterAToken}`)
        .expect(404);
    });

    it('TC-092-R · al encuestador no le llega ningún dato de descarga (lista blanca)', async () => {
      const body = await getResponses(pollsterAToken, ownMediaSurveyId);
      for (const row of body.responses) {
        expect(row).not.toHaveProperty('publicUrl');
        expect(row).not.toHaveProperty('mimeType');
        expect(row).not.toHaveProperty('originalFilename');
        expect(row).not.toHaveProperty('attachmentId');
        expect(JSON.stringify(row)).not.toContain('example.test');
      }
    });

    it('TC-092-S · hasAttachment es true solo con un adjunto subido con éxito', async () => {
      const body = await getResponses(pollsterAToken, ownMediaSurveyId);
      const uploaded = body.responses.find(
        (r) => r.questionId === imageQuestionId,
      )!;
      const pending = body.responses.find(
        (r) => r.questionId === imagePendingQuestionId,
      )!;
      expect(uploaded.hasAttachment).toBe(true);
      expect(pending.hasAttachment).toBe(false);
    });

    it('TC-092-T · hasAttachment es false en respuestas sin evidencia', async () => {
      const body = await getResponses(pollsterAToken, ownDirectSurveyId);
      const text = body.responses.find((r) => r.questionId === textQuestionId)!;
      expect(text.hasAttachment).toBe(false);
    });

    it('TC-092-U · cada fila trae sectionId y sectionOrder', async () => {
      const body = await getResponses(pollsterAToken, ownDirectSurveyId);
      for (const row of body.responses) {
        expect(row.sectionId).toBe(sectionId);
        expect(row.sectionOrder).toBe(1);
      }
    });
  });

  describe('GET /api/surveys/:id/responses — admin e investigador', () => {
    it('TC-092-V · admin sigue viendo cualquier encuesta, con hasAttachment', async () => {
      const body = await getResponses(adminToken, ownMediaSurveyId);
      const row = body.responses.find((r) => r.questionId === imageQuestionId)!;
      expect(row.hasAttachment).toBe(true);
    });

    it('TC-092-W · investigador sigue viendo cualquier encuesta', async () => {
      const body = await getResponses(researcherToken, otherSurveyId);
      expect(body.surveyId).toBe(otherSurveyId);
      expect(body.responses.length).toBeGreaterThan(0);
    });
  });
});
