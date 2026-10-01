/**
 * Spec 92 — Encuestas realizadas: el encuestador ve en la app las encuestas
 * que aplicó y sus respuestas.
 *
 * Cubre los criterios de aceptación 1-6 (backend). Los criterios 7, 9 y 12
 * (interfaz móvil) se verifican en la ronda manual
 * `docs/testing/test-092-encuestas-realizadas.md`.
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

interface SurveyResponsesBody {
  surveyId: string;
  instrumentName: string | null;
  syncedAt: string;
  responses: Record<string, unknown>[];
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

describe('spec-092 — encuestas realizadas (e2e)', () => {
  let app: INestApplication<App>;
  let ds: DataSource;

  let pollsterAToken: string;
  let pollsterBToken: string;
  let researcherToken: string;

  let instrumentId: string;
  let qTextId: string;
  let qMultiId: string;
  let optionAId: string;
  let optionBId: string;

  let farmerAlphaId: string;
  let farmerBetaId: string;
  let farmerOtherId: string;
  let farmerPagId: string;

  let campaignId: string;
  let sessionBetaId: string;

  let surveyAlphaId: string;
  let surveyBetaId: string;
  let surveyNoResponsesId: string;
  let surveyOtherUserId: string;
  let surveyPublicOriginId: string;

  const paginationSurveyIds: string[] = [];

  const surveyIdsCreated: string[] = [];
  const farmerIdsCreated: string[] = [];
  const attachmentIdsCreated: string[] = [];

  function uniqueDocument(tag: string): string {
    return `${tag}${Date.now().toString().slice(-8)}${Math.floor(Math.random() * 100)}`;
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

    // ── usuarios de prueba ──────────────────────────────────────────────────
    const hash = await bcrypt.hash(TEST_PASSWORD, 10);

    async function ensureUser(role: string): Promise<string> {
      const roles = await ds.query<RoleRow[]>(
        `SELECT role_id, name FROM roles WHERE name = $1`,
        [role],
      );
      const roleId = roles[0].role_id;
      const email = testEmail(role);
      const existing = await ds.query<{ user_id: string }[]>(
        `SELECT user_id FROM users WHERE email = $1`,
        [email],
      );
      if (!existing.length) {
        await ds.query(
          `INSERT INTO users (user_id, name, last_name, email, password, role_id, must_change_password)
           VALUES (gen_random_uuid(), 'E2E', 'EncuestasRealizadas', $1, $2, $3, false)`,
          [email, hash, roleId],
        );
      }
      return loginAs(app, email);
    }

    pollsterAToken = await ensureUser('pollster');
    researcherToken = await ensureUser('researcher');

    // Un segundo pollster, con email distinto, para probar el aislamiento
    // por dueño (criterios 1 y 5).
    const rolesB = await ds.query<RoleRow[]>(
      `SELECT role_id, name FROM roles WHERE name = 'pollster'`,
    );
    const emailB = `${PREFIX}-pollster-b@test.local`;
    const existingB = await ds.query<{ user_id: string }[]>(
      `SELECT user_id FROM users WHERE email = $1`,
      [emailB],
    );
    if (!existingB.length) {
      await ds.query(
        `INSERT INTO users (user_id, name, last_name, email, password, role_id, must_change_password)
         VALUES (gen_random_uuid(), 'E2E', 'PollsterB', $1, $2, $3, false)`,
        [emailB, hash, rolesB[0].role_id],
      );
    }
    pollsterBToken = await loginAs(app, emailB);

    async function userIdOf(email: string): Promise<string> {
      const rows = await ds.query<{ user_id: string }[]>(
        `SELECT user_id FROM users WHERE email = $1`,
        [email],
      );
      return rows[0].user_id;
    }
    const pollsterAId = await userIdOf(testEmail('pollster'));
    const pollsterBId = await userIdOf(emailB);

    // ── instrumento con una pregunta de texto y una de selección múltiple ────
    const instrumentRows = await ds.query<{ instrument_id: string }[]>(
      `INSERT INTO instruments (instrument_id, name, version, publish_date, is_active)
       VALUES (gen_random_uuid(), 'E2E 092 Instrumento', 1, CURRENT_DATE, true)
       RETURNING instrument_id`,
    );
    instrumentId = instrumentRows[0].instrument_id;

    const sectionRows = await ds.query<{ section_id: string }[]>(
      `INSERT INTO sections (section_id, name, "order", instrument_id)
       VALUES (gen_random_uuid(), 'E2E 092 Seccion', 1, $1)
       RETURNING section_id`,
      [instrumentId],
    );
    const sectionId = sectionRows[0].section_id;

    const openTextType = await ds.query<{ type_id: string }[]>(
      `SELECT type_id FROM types_of_questions WHERE name = 'open_text'`,
    );
    const multiType = await ds.query<{ type_id: string }[]>(
      `SELECT type_id FROM types_of_questions WHERE name = 'multiple_choice'`,
    );

    const qText = await ds.query<{ question_id: string }[]>(
      `INSERT INTO questions (question_id, section_id, text, type_id, is_required, "order")
       VALUES (gen_random_uuid(), $1, 'E2E 092 pregunta de texto', $2, false, 1)
       RETURNING question_id`,
      [sectionId, openTextType[0].type_id],
    );
    qTextId = qText[0].question_id;

    const qMulti = await ds.query<{ question_id: string }[]>(
      `INSERT INTO questions (question_id, section_id, text, type_id, is_required, "order")
       VALUES (gen_random_uuid(), $1, 'E2E 092 pregunta multiple', $2, false, 2)
       RETURNING question_id`,
      [sectionId, multiType[0].type_id],
    );
    qMultiId = qMulti[0].question_id;

    const optionA = await ds.query<{ option_id: string }[]>(
      `INSERT INTO options_question (option_id, question_id, text)
       VALUES (gen_random_uuid(), $1, 'Opción A') RETURNING option_id`,
      [qMultiId],
    );
    optionAId = optionA[0].option_id;
    const optionB = await ds.query<{ option_id: string }[]>(
      `INSERT INTO options_question (option_id, question_id, text)
       VALUES (gen_random_uuid(), $1, 'Opción B') RETURNING option_id`,
      [qMultiId],
    );
    optionBId = optionB[0].option_id;

    // ── agricultores ─────────────────────────────────────────────────────────
    async function createFarmer(name: string, documentId: string) {
      const rows = await ds.query<{ id: string }[]>(
        `INSERT INTO farmers (id, name, document_id) VALUES (gen_random_uuid(), $1, $2) RETURNING id`,
        [name, documentId],
      );
      farmerIdsCreated.push(rows[0].id);
      return rows[0].id;
    }

    farmerAlphaId = await createFarmer(
      'Encuestado Alpha 092',
      uniqueDocument('ALPHA'),
    );
    farmerBetaId = await createFarmer(
      'Encuestado Beta 092',
      uniqueDocument('BETA'),
    );
    farmerOtherId = await createFarmer(
      'Encuestado Otro 092',
      uniqueDocument('OTHER'),
    );
    farmerPagId = await createFarmer(
      'Paginacion Noventaydos',
      uniqueDocument('PAG'),
    );

    // ── campaña y sesión (farmerBeta solo vive en la sesión) ─────────────────
    const campaignRows = await ds.query<{ campaign_id: string }[]>(
      `INSERT INTO campaigns (campaign_id, name, is_active) VALUES (gen_random_uuid(), 'E2E 092 Campaña', true) RETURNING campaign_id`,
    );
    campaignId = campaignRows[0].campaign_id;

    const sessionRows = await ds.query<{ session_id: string }[]>(
      `INSERT INTO campaign_sessions (session_id, campaign_id, farmer_id, sincronized)
       VALUES (gen_random_uuid(), $1, $2, false) RETURNING session_id`,
      [campaignId, farmerBetaId],
    );
    sessionBetaId = sessionRows[0].session_id;

    // ── encuestas ────────────────────────────────────────────────────────────
    async function insertSurvey(params: {
      userId: string | null;
      farmerId?: string | null;
      campaignSessionId?: string | null;
      origin: 'field' | 'public';
      createdAt?: Date;
    }): Promise<string> {
      const rows = await ds.query<{ survey_id: string }[]>(
        `INSERT INTO surveys (survey_id, user_id, farmer_id, campaign_session_id, origin, sincronized, created_at, updated_at)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, false, COALESCE($5, now()), COALESCE($5, now()))
         RETURNING survey_id`,
        [
          params.userId,
          params.farmerId ?? null,
          params.campaignSessionId ?? null,
          params.origin,
          params.createdAt ?? null,
        ],
      );
      const surveyId = rows[0].survey_id;
      surveyIdsCreated.push(surveyId);
      return surveyId;
    }

    async function linkInstrument(surveyId: string) {
      await ds.query(
        `INSERT INTO surveys_instruments (survey_id, instrument_id) VALUES ($1, $2)`,
        [surveyId, instrumentId],
      );
    }

    async function insertAttachment(params: {
      surveyId: string;
      questionId: string;
      responseId: string;
      status: 'pending' | 'uploaded' | 'failed';
      publicUrl?: string | null;
    }) {
      const rows = await ds.query<{ attachment_id: string }[]>(
        `INSERT INTO media_attachments
           (attachment_id, survey_id, question_id, response_id, storage_key, public_url, mime_type, status)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, 'image/jpeg', $6)
         RETURNING attachment_id`,
        [
          params.surveyId,
          params.questionId,
          params.responseId,
          `e2e-092/${params.responseId}`,
          params.publicUrl ?? null,
          params.status,
        ],
      );
      attachmentIdsCreated.push(rows[0].attachment_id);
    }

    // Alpha — farmer directo, con adjunto SUBIDO (para el criterio 6).
    surveyAlphaId = await insertSurvey({
      userId: pollsterAId,
      farmerId: farmerAlphaId,
      origin: 'field',
    });
    await linkInstrument(surveyAlphaId);
    const alphaResponse = await ds.query<{ response_id: string }[]>(
      `INSERT INTO responses (response_id, survey_id, question_id, text_value)
       VALUES (gen_random_uuid(), $1, $2, 'respuesta alpha') RETURNING response_id`,
      [surveyAlphaId, qTextId],
    );
    await insertAttachment({
      surveyId: surveyAlphaId,
      questionId: qTextId,
      responseId: alphaResponse[0].response_id,
      status: 'uploaded',
      publicUrl: 'https://example.test/e2e-092-alpha.jpg',
    });

    // Beta — farmer solo en la sesión de campaña; selección múltiple con 2
    // filas de respuesta para la MISMA pregunta (criterio 3). Una de ellas
    // lleva un adjunto todavía 'pending' (no cuenta como hasAttachment).
    surveyBetaId = await insertSurvey({
      userId: pollsterAId,
      campaignSessionId: sessionBetaId,
      origin: 'field',
    });
    await linkInstrument(surveyBetaId);
    const betaResponseA = await ds.query<{ response_id: string }[]>(
      `INSERT INTO responses (response_id, survey_id, question_id, option_id)
       VALUES (gen_random_uuid(), $1, $2, $3) RETURNING response_id`,
      [surveyBetaId, qMultiId, optionAId],
    );
    await ds.query(
      `INSERT INTO responses (response_id, survey_id, question_id, option_id)
       VALUES (gen_random_uuid(), $1, $2, $3)`,
      [surveyBetaId, qMultiId, optionBId],
    );
    await insertAttachment({
      surveyId: surveyBetaId,
      questionId: qMultiId,
      responseId: betaResponseA[0].response_id,
      status: 'pending',
    });

    // Sin respuestas — debe quedar excluida (criterio 1).
    surveyNoResponsesId = await insertSurvey({
      userId: pollsterAId,
      farmerId: farmerAlphaId,
      origin: 'field',
    });

    // De otro encuestador — debe quedar excluida de la lista de A (criterio 1)
    // y su detalle debe responder 404 para A (criterio 5).
    surveyOtherUserId = await insertSurvey({
      userId: pollsterBId,
      farmerId: farmerOtherId,
      origin: 'field',
    });
    await ds.query(
      `INSERT INTO responses (response_id, survey_id, question_id, text_value)
       VALUES (gen_random_uuid(), $1, $2, 'respuesta otro encuestador')`,
      [surveyOtherUserId, qTextId],
    );

    // origin='public' aunque tenga user_id — debe quedar excluida (criterio 1).
    surveyPublicOriginId = await insertSurvey({
      userId: pollsterAId,
      origin: 'public',
    });
    await ds.query(
      `INSERT INTO responses (response_id, survey_id, question_id, text_value)
       VALUES (gen_random_uuid(), $1, $2, 'respuesta canal publico')`,
      [surveyPublicOriginId, qTextId],
    );

    // 25 encuestas para paginación (criterio 2), con created_at explícito y
    // decreciente para que el orden esperado sea determinista.
    const base = new Date();
    for (let i = 0; i < 25; i++) {
      const createdAt = new Date(base.getTime() - i * 1000);
      const surveyId = await insertSurvey({
        userId: pollsterAId,
        farmerId: farmerPagId,
        origin: 'field',
        createdAt,
      });
      await ds.query(
        `INSERT INTO responses (response_id, survey_id, question_id, text_value)
         VALUES (gen_random_uuid(), $1, $2, $3)`,
        [surveyId, qTextId, `respuesta paginacion ${i}`],
      );
      paginationSurveyIds.push(surveyId);
    }
  });

  afterAll(async () => {
    for (const attachmentId of attachmentIdsCreated) {
      await ds.query(`DELETE FROM media_attachments WHERE attachment_id = $1`, [
        attachmentId,
      ]);
    }
    for (const surveyId of surveyIdsCreated) {
      await ds.query(`DELETE FROM responses WHERE survey_id = $1`, [surveyId]);
      await ds.query(`DELETE FROM surveys_instruments WHERE survey_id = $1`, [
        surveyId,
      ]);
      await ds.query(`DELETE FROM surveys WHERE survey_id = $1`, [surveyId]);
    }
    if (sessionBetaId) {
      await ds.query(`DELETE FROM campaign_sessions WHERE session_id = $1`, [
        sessionBetaId,
      ]);
    }
    if (campaignId) {
      await ds.query(`DELETE FROM campaigns WHERE campaign_id = $1`, [
        campaignId,
      ]);
    }
    for (const farmerId of farmerIdsCreated) {
      await ds.query(`DELETE FROM farmers WHERE id = $1`, [farmerId]);
    }
    if (instrumentId) {
      await ds.query(
        `DELETE FROM questions WHERE section_id IN (SELECT section_id FROM sections WHERE instrument_id = $1)`,
        [instrumentId],
      );
      await ds.query(`DELETE FROM sections WHERE instrument_id = $1`, [
        instrumentId,
      ]);
      await ds.query(`DELETE FROM instruments WHERE instrument_id = $1`, [
        instrumentId,
      ]);
    }
    await app.close();
  });

  // ── criterios 1, 3 y 4 — GET /api/surveys/mine ────────────────────────────

  describe('GET /api/surveys/mine', () => {
    it('criterio 1 — solo devuelve las propias encuestas de campo con respuestas', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/surveys/mine?limit=50')
        .set('Authorization', `Bearer ${pollsterAToken}`)
        .expect(200);

      const body = res.body as MySurveysPage;
      const ids = body.items.map((i) => i.surveyId);

      expect(ids).toContain(surveyAlphaId);
      expect(ids).toContain(surveyBetaId);
      expect(ids).not.toContain(surveyNoResponsesId);
      expect(ids).not.toContain(surveyOtherUserId);
      expect(ids).not.toContain(surveyPublicOriginId);
      // 25 de paginación + alpha + beta.
      expect(body.total).toBe(27);
    });

    it('criterio 3 — trae el productor aunque solo esté en la sesión de campaña, y responseCount cuenta preguntas', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/surveys/mine?limit=50')
        .set('Authorization', `Bearer ${pollsterAToken}`)
        .expect(200);

      const body = res.body as MySurveysPage;
      const alpha = body.items.find((i) => i.surveyId === surveyAlphaId)!;
      const beta = body.items.find((i) => i.surveyId === surveyBetaId)!;

      expect(alpha.farmer?.farmerId).toBe(farmerAlphaId);
      expect(alpha.responseCount).toBe(1);
      expect(alpha.instrumentName).toBe('E2E 092 Instrumento');

      expect(beta.farmer?.farmerId).toBe(farmerBetaId);
      // 2 filas de respuesta (una por opción), pero 1 sola pregunta.
      expect(beta.responseCount).toBe(1);
    });

    it('criterio 4 — search filtra por nombre o documento del productor', async () => {
      const byName = await request(app.getHttpServer())
        .get('/api/surveys/mine?search=Alpha 092')
        .set('Authorization', `Bearer ${pollsterAToken}`)
        .expect(200);
      const byNameBody = byName.body as MySurveysPage;
      expect(byNameBody.items.map((i) => i.surveyId)).toEqual([
        surveyAlphaId,
      ]);

      const betaDocument = (
        await ds.query<{ document_id: string }[]>(
          `SELECT document_id FROM farmers WHERE id = $1`,
          [farmerBetaId],
        )
      )[0].document_id;

      const byDocument = await request(app.getHttpServer())
        .get(`/api/surveys/mine?search=${encodeURIComponent(betaDocument)}`)
        .set('Authorization', `Bearer ${pollsterAToken}`)
        .expect(200);
      const byDocumentBody = byDocument.body as MySurveysPage;
      expect(byDocumentBody.items.map((i) => i.surveyId)).toEqual([
        surveyBetaId,
      ]);
    });

    it('criterio 2 — pagina con orden estable y rechaza page/limit fuera de rango', async () => {
      const page1 = await request(app.getHttpServer())
        .get('/api/surveys/mine?search=Paginacion Noventaydos&limit=10&page=1')
        .set('Authorization', `Bearer ${pollsterAToken}`)
        .expect(200);
      const page1Body = page1.body as MySurveysPage;
      expect(page1Body.total).toBe(25);
      expect(page1Body.items).toHaveLength(10);
      expect(page1Body.items.map((i) => i.surveyId)).toEqual(
        paginationSurveyIds.slice(0, 10),
      );

      const page3 = await request(app.getHttpServer())
        .get('/api/surveys/mine?search=Paginacion Noventaydos&limit=10&page=3')
        .set('Authorization', `Bearer ${pollsterAToken}`)
        .expect(200);
      const page3Body = page3.body as MySurveysPage;
      expect(page3Body.items).toHaveLength(5);
      expect(page3Body.items.map((i) => i.surveyId)).toEqual(
        paginationSurveyIds.slice(20, 25),
      );

      await request(app.getHttpServer())
        .get('/api/surveys/mine?page=0')
        .set('Authorization', `Bearer ${pollsterAToken}`)
        .expect(400);

      await request(app.getHttpServer())
        .get('/api/surveys/mine?limit=51')
        .set('Authorization', `Bearer ${pollsterAToken}`)
        .expect(400);

      await request(app.getHttpServer())
        .get('/api/surveys/mine?limit=0')
        .set('Authorization', `Bearer ${pollsterAToken}`)
        .expect(400);
    });

    it('exige autenticación', async () => {
      await request(app.getHttpServer()).get('/api/surveys/mine').expect(401);
    });
  });

  // ── criterios 5 y 6 — GET /api/surveys/:id/responses ──────────────────────

  describe('GET /api/surveys/:id/responses', () => {
    it('criterio 5 — un encuestador ve sus propias respuestas', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/surveys/${surveyAlphaId}/responses`)
        .set('Authorization', `Bearer ${pollsterAToken}`)
        .expect(200);

      const body = res.body as SurveyResponsesBody;
      expect(body.surveyId).toBe(surveyAlphaId);
      expect(body.responses.length).toBeGreaterThan(0);
    });

    it('criterio 5 — 404 si la encuesta es de otro encuestador (no 403)', async () => {
      await request(app.getHttpServer())
        .get(`/api/surveys/${surveyAlphaId}/responses`)
        .set('Authorization', `Bearer ${pollsterBToken}`)
        .expect(404);
    });

    it('criterio 6 — al encuestador nunca le llega publicUrl/mimeType/originalFilename, y hasAttachment refleja solo lo subido', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/surveys/${surveyAlphaId}/responses`)
        .set('Authorization', `Bearer ${pollsterAToken}`)
        .expect(200);

      const body = res.body as SurveyResponsesBody;
      for (const row of body.responses) {
        expect(row).not.toHaveProperty('publicUrl');
        expect(row).not.toHaveProperty('mimeType');
        expect(row).not.toHaveProperty('originalFilename');
        expect(row).toHaveProperty('sectionId');
        expect(row).toHaveProperty('sectionOrder');
      }
      const textRow = body.responses.find((r) => r.questionId === qTextId)!;
      expect(textRow.hasAttachment).toBe(true);

      const betaRes = await request(app.getHttpServer())
        .get(`/api/surveys/${surveyBetaId}/responses`)
        .set('Authorization', `Bearer ${pollsterAToken}`)
        .expect(200);
      const betaBody = betaRes.body as SurveyResponsesBody;
      // El adjunto de Beta quedó 'pending' — nunca cuenta como evidencia.
      expect(betaBody.responses.every((r) => r.hasAttachment === false)).toBe(
        true,
      );
    });

    it('criterio 6 — el investigador sigue viendo las respuestas de cualquier encuesta, con publicUrl', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/surveys/${surveyAlphaId}/responses`)
        .set('Authorization', `Bearer ${researcherToken}`)
        .expect(200);

      const body = res.body as SurveyResponsesBody;
      const textRow = body.responses.find((r) => r.questionId === qTextId)!;
      expect(textRow).toHaveProperty('publicUrl');
      expect(textRow.publicUrl).toBe('https://example.test/e2e-092-alpha.jpg');
      expect(textRow).toHaveProperty('sectionId');
      expect(textRow).toHaveProperty('sectionOrder');
    });
  });
});
