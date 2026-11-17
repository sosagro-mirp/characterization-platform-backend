/**
 * Bug: fuga de identificantes del productor en el dashboard público (2026-11-17).
 *
 * `DENIED_SYSTEM_FIELDS` solo bloqueaba campos de la finca. Los talleres
 * capturan «Documento de identidad» (`farmer.documentId`) como
 * `numeric_with_unit` y «Número de celular» (`farmer.phone`) como `numeric`,
 * así que `GET /api/dashboard/analytics?instrumentId=…` (público) los agregaba
 * y, con 5 o más respuestas, devolvía los valores crudos en `distribution`.
 *
 * Contrato del arreglo: una pregunta con `systemField` identificante del
 * productor no llega a la respuesta pública, y ninguno de sus valores aparece
 * en el cuerpo. Una pregunta numérica sin `systemField` del mismo instrumento
 * se sigue sirviendo.
 */

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';

interface AnalyticsBody {
  questions: { questionId: string }[];
}

// Valores reconocibles para buscarlos en el cuerpo de la respuesta.
const PHONES = [
  3009990001, 3009990002, 3009990003, 3009990004, 3009990005, 3009990006,
];
const DOCUMENTS = [
  987650001, 987650002, 987650003, 987650004, 987650005, 987650006,
];
const TREES = [10, 20, 30, 40, 50, 60];

describe('bug — identificantes del productor en el dashboard público (e2e)', () => {
  let app: INestApplication<App>;
  let ds: DataSource;

  let instrumentId: string;
  let phoneQuestionId: string;
  let documentQuestionId: string;
  let controlQuestionId: string;
  let documentUnitOptionId: string;
  const surveyIds: string[] = [];

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

    const instrumentRows = await ds.query<{ instrument_id: string }[]>(
      `INSERT INTO instruments (instrument_id, name, version, publish_date, is_active)
       VALUES (gen_random_uuid(), 'E2E bug identificantes productor', 1, CURRENT_DATE, true)
       RETURNING instrument_id`,
    );
    instrumentId = instrumentRows[0].instrument_id;

    const sectionRows = await ds.query<{ section_id: string }[]>(
      `INSERT INTO sections (section_id, name, "order", instrument_id)
       VALUES (gen_random_uuid(), 'E2E bug identificación', 1, $1)
       RETURNING section_id`,
      [instrumentId],
    );
    const sectionId = sectionRows[0].section_id;

    phoneQuestionId = await insertQuestion(
      sectionId,
      'numeric',
      'Número de celular (e2e bug)',
      'farmer.phone',
      1,
    );
    documentQuestionId = await insertQuestion(
      sectionId,
      'numeric_with_unit',
      'Documento de identidad (e2e bug)',
      'farmer.documentId',
      2,
    );
    controlQuestionId = await insertQuestion(
      sectionId,
      'numeric',
      'Número de árboles (e2e bug)',
      null,
      3,
    );

    const optionRows = await ds.query<{ option_id: string }[]>(
      `INSERT INTO options_question (option_id, question_id, text)
       VALUES (gen_random_uuid(), $1, 'CC')
       RETURNING option_id`,
      [documentQuestionId],
    );
    documentUnitOptionId = optionRows[0].option_id;

    for (let i = 0; i < PHONES.length; i++) {
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
         VALUES (gen_random_uuid(), $1, $2, NULL, $3),
                (gen_random_uuid(), $1, $4, $5, $6),
                (gen_random_uuid(), $1, $7, NULL, $8)`,
        [
          surveyId,
          phoneQuestionId,
          PHONES[i],
          documentQuestionId,
          documentUnitOptionId,
          DOCUMENTS[i],
          controlQuestionId,
          TREES[i],
        ],
      );
    }
  });

  afterAll(async () => {
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

  it('no sirve las preguntas de documento ni celular del productor', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/dashboard/analytics')
      .query({ instrumentId })
      .expect(200);

    const ids = (res.body as AnalyticsBody).questions.map((q) => q.questionId);
    expect(ids).not.toContain(phoneQuestionId);
    expect(ids).not.toContain(documentQuestionId);
    expect(ids).toContain(controlQuestionId);
  });

  it('ningún documento ni celular aparece en el cuerpo de la respuesta', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/dashboard/analytics')
      .query({ instrumentId })
      .expect(200);

    const raw = JSON.stringify(res.body);
    for (const value of [...PHONES, ...DOCUMENTS]) {
      expect(raw).not.toContain(String(value));
    }
  });
});
