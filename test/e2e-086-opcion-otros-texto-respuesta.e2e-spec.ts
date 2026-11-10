/**
 * Spec 86 — Opción "Otros": el texto personalizado se guarda en la respuesta,
 * sin crear opciones nuevas en `options_question`.
 *
 * ESTAS PRUEBAS NACEN EN ROJO. No existen todavía:
 *   - la columna `options_question.origin` ('instrument' | 'field'),
 *   - la validación de `textValue` atada a la opción `isOther` (400 / 255 máx.),
 *   - la cuarentena de `POST /api/questions/:id/options` (hoy es @Public),
 *   - la normalización de respuestas que apuntan a opciones `origin = 'field'`,
 *   - `isOther` en `GET /api/surveys/:id/responses`,
 *   - la exclusión de opciones `field` al duplicar instrumentos,
 *   - el módulo `src/database/seeds/migrate-other-options.ts` (Fase 4).
 *
 * Contrato que asume la suite para el módulo del script de datos legados
 * (se importa dinámicamente para que el resto de la suite compile sin él):
 *
 *   detectLegacyOtherOptions(ds: DataSource, opts?: { instrumentIds?: string[] })
 *     => Promise<Array<{ optionId; questionId; otherOptionId; text; responseCount }>>
 *
 *   migrateLegacyOtherOptions(ds: DataSource, opts: { optionIds: string[]; apply: boolean })
 *     => Promise<{
 *          migratedResponses: number;
 *          archivedOptionIds: string[];
 *          deletedOptionIds: string[];
 *          conflicts: Array<{ optionId: string; reason: string }>;
 *        }>
 *   Con `apply: false` reporta lo que haría y no persiste nada.
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
const PREFIX = 'e2e-086';
const OTHER_TEXT_MAX = 255;
const MIGRATION_MODULE = '../src/database/seeds/migrate-other-options';

interface LoginResponse {
  accessToken: string;
}

interface RoleRow {
  role_id: string;
  name: string;
}

interface ResponseRow {
  option_id: string | null;
  text_value: string | null;
}

interface OptionRow {
  option_id: string;
  text: string;
  origin: string;
  archived_at: Date | null;
}

interface SurveyResponseItem {
  questionId: string;
  optionText: string | null;
  textValue: string | null;
  isOther: boolean;
}

interface MigrationModule {
  detectLegacyOtherOptions: (
    ds: DataSource,
    opts?: { instrumentIds?: string[] },
  ) => Promise<
    {
      optionId: string;
      questionId: string;
      otherOptionId: string;
      text: string;
      responseCount: number;
    }[]
  >;
  migrateLegacyOtherOptions: (
    ds: DataSource,
    opts: { optionIds: string[]; apply: boolean },
  ) => Promise<{
    migratedResponses: number;
    archivedOptionIds: string[];
    deletedOptionIds: string[];
    conflicts: { optionId: string; reason: string }[];
  }>;
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

function loadMigrationModule(): Promise<MigrationModule> {
  // Ruta en variable: TypeScript no intenta resolver el módulo al compilar.
  // `require` y no `import()`: Jest no admite import dinámico sin
  // --experimental-vm-modules.
  const path: string = MIGRATION_MODULE;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return Promise.resolve(require(path) as MigrationModule);
}

// ─── suite ──────────────────────────────────────────────────────────────────

describe('spec-086 — opción "Otros" con texto en la respuesta (e2e)', () => {
  let app: INestApplication<App>;
  let ds: DataSource;

  let adminToken: string;
  let pollsterToken: string;

  let instrumentId: string;
  let sectionId: string;

  // multiple_choice con "Otros"
  let qMulti: string;
  let optCafe: string;
  let optCacao: string;
  let optOtherMulti: string;

  // single_choice con "Otros"
  let qSingle: string;
  let optSingleA: string;
  let optOtherSingle: string;

  // single_choice SIN "Otros"
  let qNoOther: string;
  let optNoOtherX: string;

  let consentDocumentId: string;

  // Opción creada por un "cliente viejo" con rol pollster (TC-086-H)
  let quarantinedOptionId: string;
  const QUARANTINED_TEXT = 'Arracacha e2e-086';

  const surveyIdsCreated: string[] = [];
  const instrumentIdsCreated: string[] = [];

  async function insertQuestion(
    text: string,
    typeName: string,
    order: number,
  ): Promise<string> {
    const typeRows = await ds.query<{ type_id: string }[]>(
      `SELECT type_id FROM types_of_questions WHERE name = $1`,
      [typeName],
    );
    const rows = await ds.query<{ question_id: string }[]>(
      `INSERT INTO questions (question_id, section_id, text, type_id, is_required, "order")
       VALUES (gen_random_uuid(), $1, $2, $3, false, $4)
       RETURNING question_id`,
      [sectionId, text, typeRows[0].type_id, order],
    );
    return rows[0].question_id;
  }

  async function insertOption(
    questionId: string,
    text: string,
    value: number | null,
    isOther = false,
  ): Promise<string> {
    const rows = await ds.query<{ option_id: string }[]>(
      `INSERT INTO options_question (option_id, question_id, text, value, is_other)
       VALUES (gen_random_uuid(), $1, $2, $3, $4)
       RETURNING option_id`,
      [questionId, text, value, isOther],
    );
    return rows[0].option_id;
  }

  async function insertSurvey(): Promise<string> {
    const rows = await ds.query<{ survey_id: string }[]>(
      `INSERT INTO surveys (survey_id, sincronized) VALUES (gen_random_uuid(), false)
       RETURNING survey_id`,
    );
    const surveyId = rows[0].survey_id;
    await ds.query(
      `INSERT INTO surveys_instruments (survey_id, instrument_id) VALUES ($1, $2)`,
      [surveyId, instrumentId],
    );
    surveyIdsCreated.push(surveyId);
    return surveyId;
  }

  async function responsesOf(
    surveyId: string,
    questionId: string,
  ): Promise<ResponseRow[]> {
    return ds.query<ResponseRow[]>(
      `SELECT option_id, text_value FROM responses
       WHERE survey_id = $1 AND question_id = $2`,
      [surveyId, questionId],
    );
  }

  async function countOptions(questionId: string): Promise<number> {
    const rows = await ds.query<{ count: string }[]>(
      `SELECT COUNT(*)::text AS count FROM options_question WHERE question_id = $1`,
      [questionId],
    );
    return Number(rows[0].count);
  }

  async function optionRow(optionId: string): Promise<OptionRow | undefined> {
    const rows = await ds.query<OptionRow[]>(
      `SELECT option_id, text, origin, archived_at FROM options_question WHERE option_id = $1`,
      [optionId],
    );
    return rows[0];
  }

  function postBatch(body: Record<string, unknown>[]) {
    return request(app.getHttpServer())
      .post('/api/responses/batch')
      .set('Authorization', `Bearer ${pollsterToken}`)
      .send(body);
  }

  function submitPublic(responses: Record<string, unknown>[]) {
    return request(app.getHttpServer())
      .post('/api/public/surveys')
      .send({
        instrumentId,
        consent: {
          consentDocumentId,
          acceptedDataProcessing: true,
          acceptedPhoto: false,
          acceptedAudio: false,
          acceptedVideo: false,
          acceptedFollowUpContact: false,
        },
        responses,
      });
  }

  async function renderedOptionIds(questionId: string): Promise<string[]> {
    const res = await request(app.getHttpServer())
      .get(`/api/instruments/${instrumentId}/render`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const body = res.body as {
      sections: {
        questions: { questionId: string; options: { optionId: string }[] }[];
      }[];
    };
    const question = body.sections
      .flatMap((s) => s.questions)
      .find((q) => q.questionId === questionId);
    return (question?.options ?? []).map((o) => o.optionId);
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

    // ── usuarios de prueba ───────────────────────────────────────────────────
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
           VALUES (gen_random_uuid(), 'E2E', 'OtrosTexto', $1, $2, $3, false)`,
          [email, hash, roleId(role)],
        );
      }
    }
    adminToken = await loginAs(app, testEmail('admin'));
    pollsterToken = await loginAs(app, testEmail('pollster'));

    // ── instrumento (activo y público, para cubrir también el canal público) ─
    const instrumentRows = await ds.query<{ instrument_id: string }[]>(
      `INSERT INTO instruments (instrument_id, name, version, publish_date, is_active, is_public)
       VALUES (gen_random_uuid(), 'E2E 086 Instrumento Otros', 1, CURRENT_DATE, true, true)
       RETURNING instrument_id`,
    );
    instrumentId = instrumentRows[0].instrument_id;
    instrumentIdsCreated.push(instrumentId);

    const sectionRows = await ds.query<{ section_id: string }[]>(
      `INSERT INTO sections (section_id, name, "order", instrument_id)
       VALUES (gen_random_uuid(), 'E2E 086 Seccion', 1, $1)
       RETURNING section_id`,
      [instrumentId],
    );
    sectionId = sectionRows[0].section_id;

    qMulti = await insertQuestion(
      '¿Qué cultivos trabaja? (e2e-086)',
      'multiple_choice',
      1,
    );
    optCafe = await insertOption(qMulti, 'Café', 1);
    optCacao = await insertOption(qMulti, 'Cacao', 2);
    optOtherMulti = await insertOption(qMulti, 'Otros', 99, true);

    qSingle = await insertQuestion(
      '¿Qué fuente de agua usa? (e2e-086)',
      'single_choice',
      2,
    );
    optSingleA = await insertOption(qSingle, 'Acueducto', 1);
    optOtherSingle = await insertOption(qSingle, 'Otros', 99, true);

    qNoOther = await insertQuestion(
      'Pregunta sin Otros (e2e-086)',
      'single_choice',
      3,
    );
    optNoOtherX = await insertOption(qNoOther, 'X', 1);
    await insertOption(qNoOther, 'Y', 2);

    // ── documento de consentimiento publicado (spec 78/79) ───────────────────
    const activeDoc = await ds.query<{ consent_document_id: string }[]>(
      `SELECT consent_document_id FROM consent_documents
       WHERE published_at IS NOT NULL ORDER BY published_at DESC LIMIT 1`,
    );
    consentDocumentId = activeDoc[0]?.consent_document_id;
  }, 30_000);

  afterAll(async () => {
    if (surveyIdsCreated.length) {
      await ds.query(
        `DELETE FROM consent_records WHERE survey_id = ANY($1::uuid[])`,
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
    for (const id of instrumentIdsCreated) {
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
    await ds.query(`DELETE FROM users WHERE email LIKE $1`, [
      `${PREFIX}-%@test.local`,
    ]);
    await app.close();
  }, 30_000);

  // ── Criterios 1–5: almacenamiento y validación en /api/responses/batch ─────

  describe('POST /api/responses/batch', () => {
    it('TC-086-A · multiple_choice: "Otros" + texto no crea opción y guarda el texto en la fila isOther', async () => {
      const surveyId = await insertSurvey();
      const optionsBefore = await countOptions(qMulti);

      await postBatch([
        { surveyId, questionId: qMulti, optionId: optCafe },
        {
          surveyId,
          questionId: qMulti,
          optionId: optOtherMulti,
          textValue: '  Arroz e2e-086  ',
        },
      ]).expect(201);

      expect(await countOptions(qMulti)).toBe(optionsBefore);

      const rows = await responsesOf(surveyId, qMulti);
      expect(rows).toHaveLength(2);
      const otherRow = rows.find((r) => r.option_id === optOtherMulti);
      const cafeRow = rows.find((r) => r.option_id === optCafe);
      expect(otherRow?.text_value).toBe('Arroz e2e-086');
      // Criterio 2: las demás opciones marcadas no llevan texto.
      expect(cafeRow?.text_value).toBeNull();
    });

    it('TC-086-B · single_choice: "Otros" + texto se guarda en la misma fila', async () => {
      const surveyId = await insertSurvey();
      const optionsBefore = await countOptions(qSingle);

      await postBatch([
        {
          surveyId,
          questionId: qSingle,
          optionId: optOtherSingle,
          textValue: 'Aljibe comunitario',
        },
      ]).expect(201);

      expect(await countOptions(qSingle)).toBe(optionsBefore);
      const rows = await responsesOf(surveyId, qSingle);
      expect(rows).toEqual([
        { option_id: optOtherSingle, text_value: 'Aljibe comunitario' },
      ]);
    });

    it('TC-086-C · rechaza textValue en una opción que no es isOther (400)', async () => {
      const surveyId = await insertSurvey();

      await postBatch([
        {
          surveyId,
          questionId: qSingle,
          optionId: optSingleA,
          textValue: 'texto indebido',
        },
      ]).expect(400);

      await postBatch([
        {
          surveyId,
          questionId: qNoOther,
          optionId: optNoOtherX,
          textValue: 'texto indebido',
        },
      ]).expect(400);

      expect(await responsesOf(surveyId, qSingle)).toHaveLength(0);
      expect(await responsesOf(surveyId, qNoOther)).toHaveLength(0);
    });

    it(`TC-086-D · rechaza un texto de "Otros" de más de ${OTHER_TEXT_MAX} caracteres (400) y acepta el límite exacto`, async () => {
      const tooLong = await insertSurvey();
      await postBatch([
        {
          surveyId: tooLong,
          questionId: qSingle,
          optionId: optOtherSingle,
          textValue: 'a'.repeat(OTHER_TEXT_MAX + 1),
        },
      ]).expect(400);
      expect(await responsesOf(tooLong, qSingle)).toHaveLength(0);

      const atLimit = await insertSurvey();
      await postBatch([
        {
          surveyId: atLimit,
          questionId: qSingle,
          optionId: optOtherSingle,
          textValue: 'b'.repeat(OTHER_TEXT_MAX),
        },
      ]).expect(201);
      const rows = await responsesOf(atLimit, qSingle);
      expect(rows[0]?.text_value).toHaveLength(OTHER_TEXT_MAX);
    });

    it('TC-086-E · acepta "Otros" sin texto y lo guarda con text_value nulo', async () => {
      const surveyId = await insertSurvey();

      await postBatch([
        { surveyId, questionId: qMulti, optionId: optCacao },
        { surveyId, questionId: qMulti, optionId: optOtherMulti },
      ]).expect(201);

      const otherRow = (await responsesOf(surveyId, qMulti)).find(
        (r) => r.option_id === optOtherMulti,
      );
      expect(otherRow).toBeDefined();
      expect(otherRow!.text_value).toBeNull();
    });
  });

  // ── Criterio 6: canal público ──────────────────────────────────────────────

  describe('POST /api/public/surveys', () => {
    it('TC-086-F · guarda "Otros" + texto en la fila isOther sin crear opción', async () => {
      expect(consentDocumentId).toBeDefined();
      const optionsBefore = await countOptions(qMulti);

      const res = await submitPublic([
        { questionId: qMulti, optionId: optCafe },
        {
          questionId: qMulti,
          optionId: optOtherMulti,
          textValue: ' Plátano e2e-086 ',
        },
      ]).expect(201);
      const surveyId = (res.body as { surveyId: string }).surveyId;
      surveyIdsCreated.push(surveyId);

      expect(await countOptions(qMulti)).toBe(optionsBefore);
      const otherRow = (await responsesOf(surveyId, qMulti)).find(
        (r) => r.option_id === optOtherMulti,
      );
      expect(otherRow?.text_value).toBe('Plátano e2e-086');
    });

    it('TC-086-G · rechaza textValue en opción no isOther y texto demasiado largo (400)', async () => {
      await submitPublic([
        { questionId: qSingle, optionId: optSingleA, textValue: 'indebido' },
      ]).expect(400);

      await submitPublic([
        {
          questionId: qSingle,
          optionId: optOtherSingle,
          textValue: 'c'.repeat(OTHER_TEXT_MAX + 1),
        },
      ]).expect(400);
    });
  });

  // ── Criterios 7–10: cuarentena del endpoint individual de opciones ──────────

  describe('POST /api/questions/:id/options (cuarentena)', () => {
    it('TC-086-H · sin sesión responde 401 y no crea nada', async () => {
      const before = await countOptions(qMulti);
      await request(app.getHttpServer())
        .post(`/api/questions/${qMulti}/options`)
        .send({ text: 'Intruso e2e-086' })
        .expect(401);
      expect(await countOptions(qMulti)).toBe(before);
    });

    it('TC-086-I · con rol pollster responde 201, pero la opción nace archivada con origin=field y no se renderiza', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/questions/${qMulti}/options`)
        .set('Authorization', `Bearer ${pollsterToken}`)
        .send({ text: QUARANTINED_TEXT })
        .expect(201);
      quarantinedOptionId = (res.body as { optionId: string }).optionId;
      expect(quarantinedOptionId).toBeDefined();

      const row = await optionRow(quarantinedOptionId);
      expect(row?.origin).toBe('field');
      expect(row?.archived_at).not.toBeNull();

      expect(await renderedOptionIds(qMulti)).not.toContain(
        quarantinedOptionId,
      );
    });

    it('TC-086-J · con rol admin la opción se crea visible con origin=instrument', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/questions/${qNoOther}/options`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ text: 'Z admin e2e-086' })
        .expect(201);
      const optionId = (res.body as { optionId: string }).optionId;

      const row = await optionRow(optionId);
      expect(row?.origin).toBe('instrument');
      expect(row?.archived_at).toBeNull();
      expect(await renderedOptionIds(qNoOther)).toContain(optionId);
    });

    it('TC-086-K · una respuesta que apunta a una opción field se normaliza a "Otros" con el texto de la opción', async () => {
      expect(quarantinedOptionId).toBeDefined();
      const surveyId = await insertSurvey();

      await postBatch([
        { surveyId, questionId: qMulti, optionId: optCafe },
        { surveyId, questionId: qMulti, optionId: quarantinedOptionId },
      ]).expect(201);

      const rows = await responsesOf(surveyId, qMulti);
      expect(rows.some((r) => r.option_id === quarantinedOptionId)).toBe(false);
      const otherRow = rows.find((r) => r.option_id === optOtherMulti);
      expect(otherRow?.text_value).toBe(QUARANTINED_TEXT);
    });
  });

  // ── Criterios 11–13: lectura, dashboard público y duplicación ───────────────

  describe('lectura y efectos colaterales', () => {
    it('TC-086-L · GET /api/surveys/:id/responses expone isOther y el texto', async () => {
      const surveyId = await insertSurvey();
      await postBatch([
        {
          surveyId,
          questionId: qSingle,
          optionId: optOtherSingle,
          textValue: 'Pozo profundo',
        },
      ]).expect(201);

      const res = await request(app.getHttpServer())
        .get(`/api/surveys/${surveyId}/responses`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const items = (res.body as { responses: SurveyResponseItem[] }).responses;
      const item = items.find((r) => r.questionId === qSingle);
      expect(item).toMatchObject({
        isOther: true,
        optionText: 'Otros',
        textValue: 'Pozo profundo',
      });
    });

    it('TC-086-M · el dashboard público no incluye el texto de ninguna respuesta "Otros"', async () => {
      const secret = `Secreto-${Date.now()}-e2e-086`;
      const surveyId = await insertSurvey();
      await postBatch([
        {
          surveyId,
          questionId: qMulti,
          optionId: optOtherMulti,
          textValue: secret,
        },
      ]).expect(201);

      const res = await request(app.getHttpServer())
        .get('/api/dashboard/analytics')
        .query({ instrumentId })
        .expect(200);

      expect(JSON.stringify(res.body)).not.toContain(secret);
    });

    it('TC-086-N · duplicar el instrumento no copia las opciones origin=field', async () => {
      expect(quarantinedOptionId).toBeDefined();
      const copyName = `E2E 086 Copia ${Date.now()}`;

      await request(app.getHttpServer())
        .post(`/api/instruments/${instrumentId}/duplicate`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: copyName, version: 2 })
        .expect(201);

      const copy = await ds.query<{ instrument_id: string }[]>(
        `SELECT instrument_id FROM instruments WHERE name = $1`,
        [copyName],
      );
      expect(copy).toHaveLength(1);
      instrumentIdsCreated.push(copy[0].instrument_id);

      const copiedTexts = await ds.query<{ text: string }[]>(
        `SELECT o.text FROM options_question o
         JOIN questions q ON q.question_id = o.question_id
         JOIN sections s ON s.section_id = q.section_id
         WHERE s.instrument_id = $1`,
        [copy[0].instrument_id],
      );
      const texts = copiedTexts.map((r) => r.text);
      expect(texts).toContain('Otros');
      expect(texts).not.toContain(QUARANTINED_TEXT);
    });
  });

  // ── Criterio 16: script de datos legados (Fase 4) ──────────────────────────

  describe('migración de opciones dinámicas legadas', () => {
    let legacyUsed: string; // opción dinámica con una respuesta
    let legacyUnused: string; // opción dinámica sin respuestas
    let legacyNoSibling: string; // opción dinámica en pregunta sin "Otros"
    let legacySurvey: string;
    let noSiblingSurvey: string;

    beforeAll(async () => {
      legacyUsed = await insertOption(qMulti, 'Yuca legado e2e-086', null);
      legacyUnused = await insertOption(qMulti, 'Sin uso legado e2e-086', null);
      legacyNoSibling = await insertOption(
        qNoOther,
        'Huérfana legado e2e-086',
        null,
      );

      legacySurvey = await insertSurvey();
      await ds.query(
        `INSERT INTO responses (response_id, survey_id, question_id, option_id)
         VALUES (gen_random_uuid(), $1, $2, $3), (gen_random_uuid(), $1, $2, $4)`,
        [legacySurvey, qMulti, optCafe, legacyUsed],
      );

      noSiblingSurvey = await insertSurvey();
      await ds.query(
        `INSERT INTO responses (response_id, survey_id, question_id, option_id)
         VALUES (gen_random_uuid(), $1, $2, $3)`,
        [noSiblingSurvey, qNoOther, legacyNoSibling],
      );
    });

    it('TC-086-O · la detección lista las opciones dinámicas y no las del instrumento', async () => {
      const { detectLegacyOtherOptions } = await loadMigrationModule();
      const candidates = await detectLegacyOtherOptions(ds, {
        instrumentIds: [instrumentId],
      });
      const ids = candidates.map((c) => c.optionId);

      expect(ids).toEqual(expect.arrayContaining([legacyUsed, legacyUnused]));
      expect(ids).not.toContain(optCafe);
      expect(ids).not.toContain(optOtherMulti);

      const used = candidates.find((c) => c.optionId === legacyUsed);
      expect(used).toMatchObject({
        questionId: qMulti,
        otherOptionId: optOtherMulti,
        responseCount: 1,
      });
    });

    it('TC-086-P · en simulación reporta sin persistir', async () => {
      const { migrateLegacyOtherOptions } = await loadMigrationModule();
      const report = await migrateLegacyOtherOptions(ds, {
        optionIds: [legacyUsed, legacyUnused, legacyNoSibling],
        apply: false,
      });

      expect(report.migratedResponses).toBe(1);
      expect(
        (await responsesOf(legacySurvey, qMulti)).map((r) => r.option_id),
      ).toContain(legacyUsed);
      expect(await optionRow(legacyUnused)).toBeDefined();
      expect((await optionRow(legacyUsed))?.archived_at).toBeNull();
    });

    it('TC-086-Q · con apply migra, archiva, borra las sin uso y reporta conflictos sin tocarlos', async () => {
      const { migrateLegacyOtherOptions } = await loadMigrationModule();
      const report = await migrateLegacyOtherOptions(ds, {
        optionIds: [legacyUsed, legacyUnused, legacyNoSibling],
        apply: true,
      });

      expect(report.migratedResponses).toBe(1);
      expect(report.archivedOptionIds).toEqual([legacyUsed]);
      expect(report.deletedOptionIds).toEqual([legacyUnused]);
      expect(report.conflicts.map((c) => c.optionId)).toEqual([
        legacyNoSibling,
      ]);

      const rows = await responsesOf(legacySurvey, qMulti);
      expect(rows.some((r) => r.option_id === legacyUsed)).toBe(false);
      expect(rows.find((r) => r.option_id === optOtherMulti)?.text_value).toBe(
        'Yuca legado e2e-086',
      );

      const used = await optionRow(legacyUsed);
      expect(used?.origin).toBe('field');
      expect(used?.archived_at).not.toBeNull();
      expect(await optionRow(legacyUnused)).toBeUndefined();

      // El conflicto queda intacto.
      expect((await responsesOf(noSiblingSurvey, qNoOther))[0]?.option_id).toBe(
        legacyNoSibling,
      );
      expect((await optionRow(legacyNoSibling))?.archived_at).toBeNull();
    });

    it('TC-086-R · una segunda ejecución no cambia nada (idempotente)', async () => {
      const { migrateLegacyOtherOptions } = await loadMigrationModule();
      const report = await migrateLegacyOtherOptions(ds, {
        optionIds: [legacyUsed, legacyNoSibling],
        apply: true,
      });

      expect(report.migratedResponses).toBe(0);
      expect(report.archivedOptionIds).toEqual([]);
      expect(report.deletedOptionIds).toEqual([]);
    });
  });
});
