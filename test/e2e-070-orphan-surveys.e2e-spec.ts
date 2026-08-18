/**
 * Spec 70 — Auditoría y borrado acotado de encuestas vacías.
 *
 * ESTAS PRUEBAS NACEN EN ROJO: `GET /api/surveys/orphans` y
 * `DELETE /api/surveys/:id` no existen todavía (los crea la Fase 6 del spec).
 *
 * El discriminador que se verifica aquí es el que hace segura la limpieza:
 * una encuesta vacía solo es candidata si existe OTRA encuesta en la misma
 * `campaign_session`, con el mismo `step_order`, que SÍ tiene respuestas.
 * Un marcador de paso saltado (`POST /api/surveys/skip-step`) es siempre la
 * única encuesta de su paso, así que nunca puede ser borrado por esta vía.
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
const PREFIX = 'e2e-070';

interface LoginResponse {
  accessToken: string;
}

interface OrphanRow {
  surveyId: string;
  createdAt: string;
  stepOrder: number | null;
  siblingSurveyId: string;
}

interface RoleRow {
  role_id: string;
  name: string;
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

describe('spec-070 — encuestas huérfanas vacías: auditoría y borrado acotado (e2e)', () => {
  let app: INestApplication<App>;
  let ds: DataSource;

  let adminToken: string;
  let pollsterToken: string;

  let instrumentId: string;
  let sectionId: string;
  let questionId: string;
  let campaignId: string;
  let sessionId: string;

  // Escenario del piloto reproducido en base de datos:
  //   realSurveyId    — encuesta completada, con 1 respuesta (step_order = 1)
  //   orphanSurveyId  — encuesta vacía hermana de la anterior (step_order = 1)
  //   skipMarkerId    — marcador de paso saltado: vacío, único de su paso (step_order = 2)
  let realSurveyId: string;
  let orphanSurveyId: string;
  let skipMarkerId: string;

  const surveyIdsCreated: string[] = [];

  async function insertSurvey(stepOrder: number): Promise<string> {
    const rows = await ds.query<{ survey_id: string }[]>(
      `INSERT INTO surveys (survey_id, sincronized, campaign_session_id, step_order)
       VALUES (gen_random_uuid(), false, $1, $2)
       RETURNING survey_id`,
      [sessionId, stepOrder],
    );
    const surveyId = rows[0].survey_id;
    await ds.query(
      `INSERT INTO surveys_instruments (survey_id, instrument_id) VALUES ($1, $2)`,
      [surveyId, instrumentId],
    );
    surveyIdsCreated.push(surveyId);
    return surveyId;
  }

  async function insertResponse(surveyId: string): Promise<void> {
    await ds.query(
      `INSERT INTO responses (response_id, survey_id, question_id, text_value)
       VALUES (gen_random_uuid(), $1, $2, 'respuesta e2e-070')`,
      [surveyId, questionId],
    );
  }

  async function countResponses(surveyId: string): Promise<number> {
    const rows = await ds.query<{ count: string }[]>(
      `SELECT COUNT(*)::text AS count FROM responses WHERE survey_id = $1`,
      [surveyId],
    );
    return Number(rows[0].count);
  }

  async function surveyExists(surveyId: string): Promise<boolean> {
    const rows = await ds.query<{ survey_id: string }[]>(
      `SELECT survey_id FROM surveys WHERE survey_id = $1`,
      [surveyId],
    );
    return rows.length > 0;
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

    // ── usuarios de prueba (admin: audita y borra · pollster: no debe poder) ──
    const roles = await ds.query<RoleRow[]>(
      `SELECT role_id, name FROM roles WHERE name IN ('admin', 'pollster')`,
    );
    const roleId = (name: string) => roles.find((r) => r.name === name)!.role_id;

    const hash = await bcrypt.hash(TEST_PASSWORD, 10);
    for (const role of ['admin', 'pollster']) {
      const email = testEmail(role);
      const existing = await ds.query<{ user_id: string }[]>(
        `SELECT user_id FROM users WHERE email = $1`,
        [email],
      );
      if (!existing.length) {
        await ds.query(
          `INSERT INTO users (user_id, name, last_name, email, password, role_id, must_change_password)
           VALUES (gen_random_uuid(), 'E2E', 'OrphanSurveys', $1, $2, $3, false)`,
          [email, hash, roleId(role)],
        );
      }
    }
    adminToken = await loginAs(app, testEmail('admin'));
    pollsterToken = await loginAs(app, testEmail('pollster'));

    // ── instrumento + sección + pregunta ─────────────────────────────────────
    const instrumentRows = await ds.query<{ instrument_id: string }[]>(
      `INSERT INTO instruments (instrument_id, name, version, publish_date, is_active)
       VALUES (gen_random_uuid(), 'E2E 070 Instrument', 1, CURRENT_DATE, true)
       RETURNING instrument_id`,
    );
    instrumentId = instrumentRows[0].instrument_id;

    const sectionRows = await ds.query<{ section_id: string }[]>(
      `INSERT INTO sections (section_id, name, "order", instrument_id)
       VALUES (gen_random_uuid(), 'E2E 070 Section', 1, $1)
       RETURNING section_id`,
      [instrumentId],
    );
    sectionId = sectionRows[0].section_id;

    const typeRows = await ds.query<{ type_id: string }[]>(
      `SELECT type_id FROM types_of_questions WHERE name = 'open_text'`,
    );
    const questionRows = await ds.query<{ question_id: string }[]>(
      `INSERT INTO questions (question_id, section_id, text, type_id, is_required, "order")
       VALUES (gen_random_uuid(), $1, 'E2E 070 Q1 open_text', $2, true, 1)
       RETURNING question_id`,
      [sectionId, typeRows[0].type_id],
    );
    questionId = questionRows[0].question_id;

    // ── campaña + sesión ─────────────────────────────────────────────────────
    const campaignRows = await ds.query<{ campaign_id: string }[]>(
      `INSERT INTO campaigns (campaign_id, name, is_active)
       VALUES (gen_random_uuid(), 'E2E 070 Campaign', true)
       RETURNING campaign_id`,
    );
    campaignId = campaignRows[0].campaign_id;

    const sessionRows = await ds.query<{ session_id: string }[]>(
      `INSERT INTO campaign_sessions (session_id, campaign_id)
       VALUES (gen_random_uuid(), $1)
       RETURNING session_id`,
      [campaignId],
    );
    sessionId = sessionRows[0].session_id;

    // ── escenario ────────────────────────────────────────────────────────────
    realSurveyId = await insertSurvey(1);
    await insertResponse(realSurveyId);
    orphanSurveyId = await insertSurvey(1); // vacía, hermana de la real
    skipMarkerId = await insertSurvey(2); // vacía, única de su paso
  }, 30_000);

  afterAll(async () => {
    if (surveyIdsCreated.length) {
      await ds.query(`DELETE FROM responses WHERE survey_id = ANY($1::uuid[])`, [
        surveyIdsCreated,
      ]);
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
    await ds.query(`DELETE FROM campaigns WHERE campaign_id = $1`, [campaignId]);
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

  // ── GET /api/surveys/orphans — auditoría ───────────────────────────────────

  describe('GET /api/surveys/orphans', () => {
    it('TC-070-I · lista la encuesta vacía que tiene una hermana con respuestas', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/surveys/orphans')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const rows = res.body as OrphanRow[];
      const found = rows.find((r) => r.surveyId === orphanSurveyId);

      expect(found).toBeDefined();
      expect(found!.siblingSurveyId).toBe(realSurveyId);
      expect(found!.stepOrder).toBe(1);
    });

    it('TC-070-J · NUNCA lista un marcador de paso saltado (vacío, único de su paso)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/surveys/orphans')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const rows = res.body as OrphanRow[];
      expect(rows.some((r) => r.surveyId === skipMarkerId)).toBe(false);
    });

    it('TC-070-K · nunca lista una encuesta con respuestas', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/surveys/orphans')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const rows = res.body as OrphanRow[];
      expect(rows.some((r) => r.surveyId === realSurveyId)).toBe(false);
    });

    it('TC-070-L · es inaccesible para el rol pollster', async () => {
      await request(app.getHttpServer())
        .get('/api/surveys/orphans')
        .set('Authorization', `Bearer ${pollsterToken}`)
        .expect(403);
    });
  });

  // ── DELETE /api/surveys/:id — borrado acotado ──────────────────────────────

  describe('DELETE /api/surveys/:id', () => {
    it('TC-070-M · rechaza borrar una encuesta con respuestas', async () => {
      await request(app.getHttpServer())
        .delete(`/api/surveys/${realSurveyId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(409);

      expect(await surveyExists(realSurveyId)).toBe(true);
      expect(await countResponses(realSurveyId)).toBe(1);
    });

    it('TC-070-N · rechaza borrar un marcador de paso saltado', async () => {
      await request(app.getHttpServer())
        .delete(`/api/surveys/${skipMarkerId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(409);

      expect(await surveyExists(skipMarkerId)).toBe(true);
    });

    it('TC-070-O · es inaccesible para el rol pollster', async () => {
      await request(app.getHttpServer())
        .delete(`/api/surveys/${orphanSurveyId}`)
        .set('Authorization', `Bearer ${pollsterToken}`)
        .expect(403);

      expect(await surveyExists(orphanSurveyId)).toBe(true);
    });

    it('TC-070-P · responde 404 ante un surveyId inexistente', async () => {
      await request(app.getHttpServer())
        .delete('/api/surveys/00000000-0000-4000-8000-000000000000')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);
    });

    it('TC-070-Q · borra la huérfana candidata y deja intacta a su hermana con respuestas', async () => {
      await request(app.getHttpServer())
        .delete(`/api/surveys/${orphanSurveyId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(await surveyExists(orphanSurveyId)).toBe(false);
      expect(await surveyExists(realSurveyId)).toBe(true);
      expect(await countResponses(realSurveyId)).toBe(1);

      // Tras el borrado, la auditoría queda limpia para esta sesión.
      const res = await request(app.getHttpServer())
        .get('/api/surveys/orphans')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      const rows = res.body as OrphanRow[];
      expect(rows.some((r) => r.surveyId === orphanSurveyId)).toBe(false);
    });
  });
});
