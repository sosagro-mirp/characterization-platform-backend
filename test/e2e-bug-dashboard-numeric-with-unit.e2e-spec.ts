/**
 * Bug `numeric_with_unit` en el dashboard público (spec/backlog.md, 2026-08-05).
 *
 * `GET /api/dashboard/analytics` respondía 500 en cuanto una pregunta
 * `numeric_with_unit` alcanzaba el umbral de muestra: `buildAggregation` no
 * tenía `case` para ese tipo y la excepción tumbaba toda la respuesta.
 *
 * Contrato del arreglo:
 *   - la pregunta se agrega como `type: 'numeric_with_unit'`, con un grupo por
 *     unidad (la opción elegida), sin convertir entre unidades;
 *   - cada grupo trae su conteo y su porcentaje sobre las respuestas;
 *   - las estadísticas y los valores crudos de un grupo solo se exponen si ese
 *     grupo alcanza el umbral de privacidad (5); si no, van en `null`.
 *   - Spec 66 (D2, celda mínima): un grupo bajo el umbral tampoco expone su
 *     conteo ni su porcentaje (`suppressed: true`), igual que una opción.
 */

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { AppModule } from '../src/app.module';

interface UnitGroup {
  optionId: string;
  unit: string;
  count: number | null;
  percentage: number | null;
  suppressed: boolean;
  average: number | null;
  median: number | null;
  bins: {
    from: number | null;
    to: number | null;
    count: number | null;
    suppressed: boolean;
  }[];
}

interface AnalyticsBody {
  suppressed: boolean;
  questions: {
    questionId: string;
    questionType: string;
    suppressed: boolean;
    answeredCount: number;
    aggregation: { type: string; count: number; units: UnitGroup[] } | null;
  }[];
}

const HECTARES = [1, 2, 3, 4, 5, 6];
const SQUARE_METERS = [500, 800];

describe('bug — numeric_with_unit en el dashboard (e2e)', () => {
  let app: INestApplication<App>;
  let ds: DataSource;

  let instrumentId: string;
  let questionId: string;
  let optHectares: string;
  let optSquareMeters: string;
  const surveyIds: string[] = [];

  // Spec 107 (P20): la consulta por instrumento exige ADMIN o RESEARCHER.
  const ADMIN_EMAIL = 'e2e-bug-numeric-unit-admin@test.local';
  const ADMIN_PASSWORD = 'E2eTest1234!';
  let adminToken: string;

  async function createAdminToken(): Promise<string> {
    const roles = await ds.query<{ role_id: string }[]>(
      `SELECT role_id FROM roles WHERE name = 'admin'`,
    );
    await ds.query(`DELETE FROM users WHERE email = $1`, [ADMIN_EMAIL]);
    await ds.query(
      `INSERT INTO users (user_id, name, last_name, email, password, role_id, must_change_password)
       VALUES (gen_random_uuid(), 'E2E', 'Bug', $1, $2, $3, false)`,
      [ADMIN_EMAIL, await bcrypt.hash(ADMIN_PASSWORD, 10), roles[0].role_id],
    );
    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD })
      .expect(200);
    return (login.body as { accessToken: string }).accessToken;
  }

  async function insertSurveyWithAnswer(
    value: number,
    optionId: string,
  ): Promise<void> {
    const rows = await ds.query<{ survey_id: string }[]>(
      `INSERT INTO surveys (survey_id, sincronized) VALUES (gen_random_uuid(), true)
       RETURNING survey_id`,
    );
    const surveyId = rows[0].survey_id;
    surveyIds.push(surveyId);
    await ds.query(
      `INSERT INTO surveys_instruments (survey_id, instrument_id) VALUES ($1, $2)`,
      [surveyId, instrumentId],
    );
    await ds.query(
      `INSERT INTO responses (response_id, survey_id, question_id, option_id, numeric_value)
       VALUES (gen_random_uuid(), $1, $2, $3, $4)`,
      [surveyId, questionId, optionId, value],
    );
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
    adminToken = await createAdminToken();

    const instrumentRows = await ds.query<{ instrument_id: string }[]>(
      `INSERT INTO instruments (instrument_id, name, version, publish_date, is_active)
       VALUES (gen_random_uuid(), 'E2E bug numeric_with_unit', 1, CURRENT_DATE, true)
       RETURNING instrument_id`,
    );
    instrumentId = instrumentRows[0].instrument_id;

    const sectionRows = await ds.query<{ section_id: string }[]>(
      `INSERT INTO sections (section_id, name, "order", instrument_id)
       VALUES (gen_random_uuid(), 'E2E bug seccion', 1, $1)
       RETURNING section_id`,
      [instrumentId],
    );

    const typeRows = await ds.query<{ type_id: string }[]>(
      `SELECT type_id FROM types_of_questions WHERE name = 'numeric_with_unit'`,
    );
    const questionRows = await ds.query<{ question_id: string }[]>(
      `INSERT INTO questions (question_id, section_id, text, type_id, is_required, "order")
       VALUES (gen_random_uuid(), $1, 'Área sembrada (e2e bug)', $2, false, 1)
       RETURNING question_id`,
      [sectionRows[0].section_id, typeRows[0].type_id],
    );
    questionId = questionRows[0].question_id;

    const insertOption = async (text: string): Promise<string> => {
      const rows = await ds.query<{ option_id: string }[]>(
        `INSERT INTO options_question (option_id, question_id, text)
         VALUES (gen_random_uuid(), $1, $2)
         RETURNING option_id`,
        [questionId, text],
      );
      return rows[0].option_id;
    };
    optHectares = await insertOption('hectáreas');
    optSquareMeters = await insertOption('m²');

    for (const value of HECTARES) {
      await insertSurveyWithAnswer(value, optHectares);
    }
    for (const value of SQUARE_METERS) {
      await insertSurveyWithAnswer(value, optSquareMeters);
    }
  });

  afterAll(async () => {
    await ds.query(`DELETE FROM users WHERE email = $1`, [ADMIN_EMAIL]);
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
    if (instrumentId) {
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
    await app.close();
  });

  it('responde 200 y agrega la pregunta agrupada por unidad', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/dashboard/analytics')
      .query({ instrumentId })
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const body = res.body as AnalyticsBody;
    expect(body.suppressed).toBe(false);

    const question = body.questions.find((q) => q.questionId === questionId);
    expect(question).toBeDefined();
    expect(question!.suppressed).toBe(false);
    expect(question!.answeredCount).toBe(
      HECTARES.length + SQUARE_METERS.length,
    );

    const aggregation = question!.aggregation!;
    expect(aggregation.type).toBe('numeric_with_unit');
    expect(aggregation.count).toBe(HECTARES.length + SQUARE_METERS.length);
    expect(aggregation.units.map((u) => u.unit)).toEqual(['hectáreas', 'm²']);
  });

  it('suprime ambos grupos cuando solo uno alcanza el umbral (supresión complementaria, P18-e)', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/dashboard/analytics')
      .query({ instrumentId })
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const body = res.body as AnalyticsBody;
    const units = body.questions.find((q) => q.questionId === questionId)!
      .aggregation!.units;

    // 6 hectáreas (visible por sí sola) y 2 m² (bajo el umbral): con el total
    // visible, restar revelaría el grupo oculto, así que se suprimen los dos.
    for (const optionId of [optHectares, optSquareMeters]) {
      const group = units.find((u) => u.optionId === optionId)!;
      expect(group.suppressed).toBe(true);
      expect(group.count).toBeNull();
      expect(group.percentage).toBeNull();
      expect(group.average).toBeNull();
      expect(group.median).toBeNull();
      expect(group.bins).toEqual([]);
      expect(group).not.toHaveProperty('min');
      expect(group).not.toHaveProperty('max');
      expect(group).not.toHaveProperty('distribution');
    }
  });
});
