import { randomUUID } from 'crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { AppModule } from '../src/app.module';

// ─── helpers ────────────────────────────────────────────────────────────────

const TEST_PASSWORD = 'E2eTest1234!';
const PREFIX = 'e2e-rb';

interface LoginResponse {
  accessToken: string;
}

interface ResponseBody {
  responseId: string;
  survey?: { surveyId: string };
  question?: { questionId: string };
  option?: { optionId: string } | null;
  textValue?: string | null;
  numericValue?: number | null;
}

interface RoleRow {
  role_id: string;
  name: string;
}

function testEmail(role: string) {
  return `${PREFIX}-${role}@test.local`;
}

function entityNameOf(repository: Repository<object>): string {
  return repository.metadata.name;
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

describe('spec-001 — POST /api/responses/batch — N+1 fix (e2e)', () => {
  let app: INestApplication<App>;
  let ds: DataSource;

  let pollsterToken: string;

  let instrumentId: string;
  let sectionId: string;

  // Q1: single_choice con dos opciones (O1a, O1b)
  let questionSingleId: string;
  let optionSingleA: string;
  let optionSingleB: string;

  // Q2: single_choice con una opción (O2a) — usada para el caso "option no pertenece a question"
  let questionOtherId: string;
  let optionOtherA: string;

  // Q3: open_text, sin opciones
  let questionTextId: string;

  // Q4: numeric_with_unit, con una opción de unidad
  let questionNumericUnitId: string;
  let optionUnitId: string;

  const surveyIdsCreated: string[] = [];

  async function createSurvey(): Promise<string> {
    const result = await ds.query<{ survey_id: string }[]>(
      `INSERT INTO surveys (survey_id, sincronized) VALUES (gen_random_uuid(), false) RETURNING survey_id`,
    );
    const surveyId = result[0].survey_id;
    surveyIdsCreated.push(surveyId);
    return surveyId;
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

    // ── usuario de prueba (pollster — rol que sincroniza batches desde mobile) ──
    const roles = await ds.query<RoleRow[]>(
      `SELECT role_id, name FROM roles WHERE name = 'pollster'`,
    );
    const pollsterRoleId = roles[0].role_id;

    const hash = await bcrypt.hash(TEST_PASSWORD, 10);
    const email = testEmail('pollster');
    const existing = await ds.query<{ user_id: string }[]>(
      `SELECT user_id FROM users WHERE email = $1`,
      [email],
    );
    if (!existing.length) {
      await ds.query(
        `INSERT INTO users (user_id, name, last_name, email, password, role_id, must_change_password)
         VALUES (gen_random_uuid(), 'E2E', 'ResponsesBatch', $1, $2, $3, false)`,
        [email, hash, pollsterRoleId],
      );
    }
    pollsterToken = await loginAs(app, email);

    // ── instrumento + sección de prueba ──────────────────────────────────────
    const instrumentResult = await ds.query<{ instrument_id: string }[]>(
      `INSERT INTO instruments (instrument_id, name, version, publish_date, is_active)
       VALUES (gen_random_uuid(), 'E2E RB Instrument', 1, CURRENT_DATE, true)
       RETURNING instrument_id`,
    );
    instrumentId = instrumentResult[0].instrument_id;

    const sectionResult = await ds.query<{ section_id: string }[]>(
      `INSERT INTO sections (section_id, name, "order", instrument_id)
       VALUES (gen_random_uuid(), 'E2E RB Section', 1, $1)
       RETURNING section_id`,
      [instrumentId],
    );
    sectionId = sectionResult[0].section_id;

    const typeIds = await ds.query<{ type_id: string; name: string }[]>(
      `SELECT type_id, name FROM types_of_questions
       WHERE name IN ('single_choice', 'open_text', 'numeric_with_unit')`,
    );
    const typeId = (name: string) =>
      typeIds.find((t) => t.name === name)!.type_id;

    // Q1 — single_choice con 2 opciones
    const q1 = await ds.query<{ question_id: string }[]>(
      `INSERT INTO questions (question_id, section_id, text, type_id, is_required, "order")
       VALUES (gen_random_uuid(), $1, 'E2E RB Q1 single_choice', $2, true, 1)
       RETURNING question_id`,
      [sectionId, typeId('single_choice')],
    );
    questionSingleId = q1[0].question_id;

    const o1a = await ds.query<{ option_id: string }[]>(
      `INSERT INTO options_question (option_id, question_id, text)
       VALUES (gen_random_uuid(), $1, 'E2E RB Q1 Opción A') RETURNING option_id`,
      [questionSingleId],
    );
    optionSingleA = o1a[0].option_id;

    const o1b = await ds.query<{ option_id: string }[]>(
      `INSERT INTO options_question (option_id, question_id, text)
       VALUES (gen_random_uuid(), $1, 'E2E RB Q1 Opción B') RETURNING option_id`,
      [questionSingleId],
    );
    optionSingleB = o1b[0].option_id;

    // Q2 — single_choice con 1 opción (para probar mismatch de option/question)
    const q2 = await ds.query<{ question_id: string }[]>(
      `INSERT INTO questions (question_id, section_id, text, type_id, is_required, "order")
       VALUES (gen_random_uuid(), $1, 'E2E RB Q2 single_choice', $2, true, 2)
       RETURNING question_id`,
      [sectionId, typeId('single_choice')],
    );
    questionOtherId = q2[0].question_id;

    const o2a = await ds.query<{ option_id: string }[]>(
      `INSERT INTO options_question (option_id, question_id, text)
       VALUES (gen_random_uuid(), $1, 'E2E RB Q2 Opción A') RETURNING option_id`,
      [questionOtherId],
    );
    optionOtherA = o2a[0].option_id;

    // Q3 — open_text
    const q3 = await ds.query<{ question_id: string }[]>(
      `INSERT INTO questions (question_id, section_id, text, type_id, is_required, "order")
       VALUES (gen_random_uuid(), $1, 'E2E RB Q3 open_text', $2, true, 3)
       RETURNING question_id`,
      [sectionId, typeId('open_text')],
    );
    questionTextId = q3[0].question_id;

    // Q4 — numeric_with_unit con 1 opción de unidad
    const q4 = await ds.query<{ question_id: string }[]>(
      `INSERT INTO questions (question_id, section_id, text, type_id, is_required, "order")
       VALUES (gen_random_uuid(), $1, 'E2E RB Q4 numeric_with_unit', $2, true, 4)
       RETURNING question_id`,
      [sectionId, typeId('numeric_with_unit')],
    );
    questionNumericUnitId = q4[0].question_id;

    const o4unit = await ds.query<{ option_id: string }[]>(
      `INSERT INTO options_question (option_id, question_id, text)
       VALUES (gen_random_uuid(), $1, 'kg') RETURNING option_id`,
      [questionNumericUnitId],
    );
    optionUnitId = o4unit[0].option_id;
  }, 30_000);

  afterAll(async () => {
    if (surveyIdsCreated.length) {
      await ds.query(
        `DELETE FROM responses WHERE survey_id = ANY($1::uuid[])`,
        [surveyIdsCreated],
      );
      await ds.query(`DELETE FROM surveys WHERE survey_id = ANY($1::uuid[])`, [
        surveyIdsCreated,
      ]);
    }
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

  // ── espía de queries: jest.spyOn conserva la implementación real y solo
  // registra las llamadas, así que basta con leer `.mock.calls`/`.mock.instances`
  // sobre `Repository.prototype.findOne`/`.find` en cada test que lo necesite.

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // ── caso 1: N+1 resuelto — 1 sola query a Survey, 1 sola a Question/Option ──

  describe('N+1 — precarga en lote', () => {
    it('lote de 5 respuestas (mismo surveyId, questionId repetido) ejecuta 1 sola query de Survey y 1 sola de Question/OptionQuestion', async () => {
      const surveyId = await createSurvey();

      const spyFindOne = jest.spyOn(Repository.prototype, 'findOne');
      const spyFind = jest.spyOn(Repository.prototype, 'find');

      const payload = [
        { surveyId, questionId: questionSingleId, optionId: optionSingleA },
        { surveyId, questionId: questionSingleId, optionId: optionSingleB },
        { surveyId, questionId: questionOtherId, optionId: optionOtherA },
        { surveyId, questionId: questionTextId, textValue: 'texto libre' },
        {
          surveyId,
          questionId: questionNumericUnitId,
          optionId: optionUnitId,
          numericValue: 12.5,
        },
      ];

      const res = await request(app.getHttpServer())
        .post('/api/responses/batch')
        .set('Authorization', `Bearer ${pollsterToken}`)
        .send(payload)
        .expect(201);

      const body = res.body as ResponseBody[];
      expect(body).toHaveLength(5);

      const surveyFindOneCalls = spyFindOne.mock.calls.filter(
        (_, i) => entityNameOf(spyFindOne.mock.instances[i]) === 'Survey',
      );
      expect(surveyFindOneCalls).toHaveLength(1);

      const questionFindCalls = spyFind.mock.calls.filter(
        (_, i) => entityNameOf(spyFind.mock.instances[i]) === 'Question',
      );
      expect(questionFindCalls).toHaveLength(1);

      const optionFindCalls = spyFind.mock.calls.filter(
        (_, i) => entityNameOf(spyFind.mock.instances[i]) === 'OptionQuestion',
      );
      expect(optionFindCalls).toHaveLength(1);
    });

    it('lote de 10 respuestas mantiene 1 sola query de Survey (no escala con el tamaño del lote)', async () => {
      const surveyId = await createSurvey();

      const spyFindOne = jest.spyOn(Repository.prototype, 'findOne');

      const payload = Array.from({ length: 10 }, () => ({
        surveyId,
        questionId: questionTextId,
        textValue: 'respuesta de carga',
      }));

      await request(app.getHttpServer())
        .post('/api/responses/batch')
        .set('Authorization', `Bearer ${pollsterToken}`)
        .send(payload)
        .expect(201);

      const surveyFindOneCalls = spyFindOne.mock.calls.filter(
        (_, i) => entityNameOf(spyFindOne.mock.instances[i]) === 'Survey',
      );
      expect(surveyFindOneCalls).toHaveLength(1);
    });
  });

  // ── caso 2: validaciones de negocio preservadas ───────────────────────────

  describe('Validaciones de negocio preservadas', () => {
    it('404 — surveyId no existe', async () => {
      await request(app.getHttpServer())
        .post('/api/responses/batch')
        .set('Authorization', `Bearer ${pollsterToken}`)
        .send([
          {
            surveyId: randomUUID(),
            questionId: questionTextId,
            textValue: 'x',
          },
        ])
        .expect(404);
    });

    it('404 — questionId no existe', async () => {
      const surveyId = await createSurvey();

      await request(app.getHttpServer())
        .post('/api/responses/batch')
        .set('Authorization', `Bearer ${pollsterToken}`)
        .send([{ surveyId, questionId: randomUUID(), textValue: 'x' }])
        .expect(404);
    });

    it('400 — optionId no pertenece a la questionId provista', async () => {
      const surveyId = await createSurvey();

      await request(app.getHttpServer())
        .post('/api/responses/batch')
        .set('Authorization', `Bearer ${pollsterToken}`)
        // optionOtherA pertenece a questionOtherId, no a questionSingleId
        .send([
          {
            surveyId,
            questionId: questionSingleId,
            optionId: optionOtherA,
          },
        ])
        .expect(400);
    });

    it('400 — numeric_with_unit sin optionId', async () => {
      const surveyId = await createSurvey();

      await request(app.getHttpServer())
        .post('/api/responses/batch')
        .set('Authorization', `Bearer ${pollsterToken}`)
        .send([
          {
            surveyId,
            questionId: questionNumericUnitId,
            numericValue: 10,
          },
        ])
        .expect(400);
    });
  });

  // ── caso 3: idempotencia preservada ───────────────────────────────────────

  describe('Idempotencia', () => {
    it('un segundo POST batch para el mismo surveyId devuelve las respuestas existentes sin duplicar', async () => {
      const surveyId = await createSurvey();

      const payload = [
        { surveyId, questionId: questionTextId, textValue: 'primera vez' },
      ];

      const first = await request(app.getHttpServer())
        .post('/api/responses/batch')
        .set('Authorization', `Bearer ${pollsterToken}`)
        .send(payload)
        .expect(201);

      const second = await request(app.getHttpServer())
        .post('/api/responses/batch')
        .set('Authorization', `Bearer ${pollsterToken}`)
        .send(payload)
        .expect(201);

      const firstBody = first.body as ResponseBody[];
      const secondBody = second.body as ResponseBody[];

      expect(secondBody).toHaveLength(firstBody.length);
      expect(secondBody.map((r) => r.responseId).sort()).toEqual(
        firstBody.map((r) => r.responseId).sort(),
      );

      const count = await ds.query<{ count: string }[]>(
        `SELECT COUNT(*) FROM responses WHERE survey_id = $1`,
        [surveyId],
      );
      expect(Number(count[0].count)).toBe(1);
    });
  });
});
