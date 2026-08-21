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
    const roleId = (name: string) =>
      roles.find((r) => r.name === name)!.role_id;

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

  // ── POST /api/surveys — idempotencia por clientSurveyId (Fase 9) ──────────
  //
  // NACE EN ROJO junto con la Fase 9: antes de implementarla, dos POST con el
  // mismo clientSurveyId creaban dos encuestas distintas.

  describe('POST /api/surveys — idempotencia (Fase 9)', () => {
    it('TC-070-R · reenviar el mismo clientSurveyId devuelve la encuesta ya creada, sin duplicarla', async () => {
      const clientSurveyId = `e2e-070-idem-${Date.now()}`;

      const first = await request(app.getHttpServer())
        .post('/api/surveys')
        .set('Authorization', `Bearer ${pollsterToken}`)
        .send({
          instrumentIds: [instrumentId],
          campaignSessionId: sessionId,
          stepOrder: 3,
          clientSurveyId,
        })
        .expect(201);
      surveyIdsCreated.push((first.body as { surveyId: string }).surveyId);

      const second = await request(app.getHttpServer())
        .post('/api/surveys')
        .set('Authorization', `Bearer ${pollsterToken}`)
        .send({
          instrumentIds: [instrumentId],
          campaignSessionId: sessionId,
          stepOrder: 3,
          clientSurveyId,
        })
        .expect(201);

      expect((second.body as { surveyId: string }).surveyId).toBe(
        (first.body as { surveyId: string }).surveyId,
      );

      const rows = await ds.query<{ count: string }[]>(
        `SELECT COUNT(*)::text AS count FROM surveys WHERE client_survey_id = $1`,
        [clientSurveyId],
      );
      expect(Number(rows[0].count)).toBe(1);
    });

    it('TC-070-S · dos creaciones concurrentes con el mismo clientSurveyId no duplican la fila (carrera real)', async () => {
      const clientSurveyId = `e2e-070-race-${Date.now()}`;
      const payload = {
        instrumentIds: [instrumentId],
        campaignSessionId: sessionId,
        stepOrder: 3,
        clientSurveyId,
      };

      const [a, b] = await Promise.all([
        request(app.getHttpServer())
          .post('/api/surveys')
          .set('Authorization', `Bearer ${pollsterToken}`)
          .send(payload),
        request(app.getHttpServer())
          .post('/api/surveys')
          .set('Authorization', `Bearer ${pollsterToken}`)
          .send(payload),
      ]);

      expect(a.status).toBe(201);
      expect(b.status).toBe(201);
      const aId = (a.body as { surveyId: string }).surveyId;
      const bId = (b.body as { surveyId: string }).surveyId;
      surveyIdsCreated.push(aId);
      if (bId !== aId) surveyIdsCreated.push(bId);

      expect(bId).toBe(aId);

      const rows = await ds.query<{ count: string }[]>(
        `SELECT COUNT(*)::text AS count FROM surveys WHERE client_survey_id = $1`,
        [clientSurveyId],
      );
      expect(Number(rows[0].count)).toBe(1);
    });

    it('sin clientSurveyId, el comportamiento no cambia: cada POST crea una fila distinta', async () => {
      const a = await request(app.getHttpServer())
        .post('/api/surveys')
        .set('Authorization', `Bearer ${pollsterToken}`)
        .send({
          instrumentIds: [instrumentId],
          campaignSessionId: sessionId,
          stepOrder: 3,
        })
        .expect(201);
      const b = await request(app.getHttpServer())
        .post('/api/surveys')
        .set('Authorization', `Bearer ${pollsterToken}`)
        .send({
          instrumentIds: [instrumentId],
          campaignSessionId: sessionId,
          stepOrder: 3,
        })
        .expect(201);

      const aId = (a.body as { surveyId: string }).surveyId;
      const bId = (b.body as { surveyId: string }).surveyId;
      surveyIdsCreated.push(aId, bId);

      expect(aId).not.toBe(bId);
    });
  });

  // ── POST /api/surveys/skip-step — idempotencia (Fase 10) ───────────────────
  //
  // NACE EN ROJO junto con la Fase 10: antes de implementarla, un doble salto
  // (o un salto offline sobre un paso que otro dispositivo ya completó)
  // producía una segunda fila para el mismo (sesión, stepOrder), que
  // aparecería como falso positivo en GET /api/surveys/orphans (tendría un
  // hermano con respuestas o un hermano marcador en su mismo paso).

  describe('POST /api/surveys/skip-step — idempotencia (Fase 10)', () => {
    it('TC-070-T · saltar el mismo paso dos veces devuelve el mismo marcador, sin crear un segundo', async () => {
      const first = await request(app.getHttpServer())
        .post('/api/surveys/skip-step')
        .set('Authorization', `Bearer ${pollsterToken}`)
        .send({ sessionId, instrumentId, stepOrder: 5 })
        .expect(201);
      surveyIdsCreated.push((first.body as { surveyId: string }).surveyId);

      const second = await request(app.getHttpServer())
        .post('/api/surveys/skip-step')
        .set('Authorization', `Bearer ${pollsterToken}`)
        .send({ sessionId, instrumentId, stepOrder: 5 })
        .expect(201);

      expect((second.body as { surveyId: string }).surveyId).toBe(
        (first.body as { surveyId: string }).surveyId,
      );

      const rows = await ds.query<{ count: string }[]>(
        `SELECT COUNT(*)::text AS count FROM surveys WHERE campaign_session_id = $1 AND step_order = $2`,
        [sessionId, 5],
      );
      expect(Number(rows[0].count)).toBe(1);

      // Ese único marcador no debe aparecer nunca en la auditoría.
      const orphans = await request(app.getHttpServer())
        .get('/api/surveys/orphans')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      const orphanRows = orphans.body as OrphanRow[];
      expect(
        orphanRows.some(
          (r) => r.surveyId === (first.body as { surveyId: string }).surveyId,
        ),
      ).toBe(false);
    });

    it('TC-070-U · saltar un paso ya completado de verdad devuelve la encuesta real, sin crear un marcador vacío', async () => {
      const realStepOrder = 6;
      const completedSurveyId = await insertSurvey(realStepOrder);
      await insertResponse(completedSurveyId);

      const res = await request(app.getHttpServer())
        .post('/api/surveys/skip-step')
        .set('Authorization', `Bearer ${pollsterToken}`)
        .send({ sessionId, instrumentId, stepOrder: realStepOrder })
        .expect(201);

      expect((res.body as { surveyId: string }).surveyId).toBe(
        completedSurveyId,
      );

      const rows = await ds.query<{ count: string }[]>(
        `SELECT COUNT(*)::text AS count FROM surveys WHERE campaign_session_id = $1 AND step_order = $2`,
        [sessionId, realStepOrder],
      );
      expect(Number(rows[0].count)).toBe(1);

      // No debe haber aparecido como huérfana: no se creó ningún hermano vacío.
      const orphans = await request(app.getHttpServer())
        .get('/api/surveys/orphans')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      const orphanRows = orphans.body as OrphanRow[];
      expect(orphanRows.some((r) => r.surveyId === completedSurveyId)).toBe(
        false,
      );
    });
  });
});
