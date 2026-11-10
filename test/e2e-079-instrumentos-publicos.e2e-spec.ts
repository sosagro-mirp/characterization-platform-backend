/**
 * Spec 79 — Instrumentos públicos: aplicación por URL compartible.
 *
 * ESTAS PRUEBAS NACEN EN ROJO. Nada de lo que verifican existe todavía:
 * la columna `instruments.is_public`, las columnas `surveys.origin` /
 * `surveys.review_status`, la columna `consent_records.survey_id`, el módulo
 * público (`GET/POST /api/public/surveys`) y los endpoints de bandeja
 * (`/api/surveys/public-submissions`, `process-public`, `discard-public`)
 * los crean las fases 1 a 4 del spec.
 *
 * Un caso por criterio de aceptación verificable desde el API. Los criterios
 * 1, 4 y 16 (interfaz del panel y del formulario) se cubren en
 * `docs/testing/test-079-instrumentos-publicos.md`.
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
const PREFIX = 'e2e-079';

interface LoginResponse {
  accessToken: string;
}

interface RoleRow {
  role_id: string;
  name: string;
}

interface PublicInstrumentResponse {
  instrumentId: string;
  name: string;
  sections: { questions: { questionId: string }[] }[];
  consentDocument: { consentDocumentId: string; version: string };
}

interface PublicSubmitResponse {
  surveyId: string;
}

interface SubmissionRow {
  surveyId: string;
  instrumentName: string;
  createdAt: string;
  responseCount: number;
  reviewStatus: string;
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

describe('spec-079 — instrumentos públicos por URL compartible (e2e)', () => {
  let app: INestApplication<App>;
  let ds: DataSource;

  let adminToken: string;

  // Instrumento apto para el canal público: solo preguntas de texto, con dos
  // de ellas mapeadas a farmer.name / farmer.documentId para poder procesar.
  let publicInstrumentId: string;
  let qNameId: string;
  let qDocumentId: string;
  let qFreeTextId: string;

  // Instrumento con una pregunta de tipo `image` — no puede hacerse público.
  let mediaInstrumentId: string;

  let consentDocumentId: string;

  const surveyIdsCreated: string[] = [];
  const farmerIdsCreated: string[] = [];

  function uniqueDocument(): string {
    return `79${Date.now().toString().slice(-8)}${Math.floor(Math.random() * 100)}`;
  }

  function answersFor(name: string, document: string) {
    return [
      { questionId: qNameId, textValue: name },
      { questionId: qDocumentId, textValue: document },
      { questionId: qFreeTextId, textValue: 'Respuesta libre e2e-079' },
    ];
  }

  const acceptedConsent = {
    consentDocumentId: '',
    acceptedDataProcessing: true,
    acceptedPhoto: false,
    acceptedAudio: false,
    acceptedVideo: false,
    acceptedFollowUpContact: false,
  };

  async function setPublic(isPublic: boolean): Promise<void> {
    await ds.query(
      `UPDATE instruments SET is_public = $1 WHERE instrument_id = $2`,
      [isPublic, publicInstrumentId],
    );
  }

  function submitPublic(body: Record<string, unknown>) {
    return request(app.getHttpServer()).post('/api/public/surveys').send(body);
  }

  async function surveyRow(surveyId: string) {
    const rows = await ds.query<
      {
        farmer_id: string | null;
        user_id: string | null;
        origin: string;
        review_status: string | null;
      }[]
    >(
      `SELECT farmer_id, user_id, origin, review_status FROM surveys WHERE survey_id = $1`,
      [surveyId],
    );
    return rows[0];
  }

  async function countResponses(surveyId: string): Promise<number> {
    const rows = await ds.query<{ count: string }[]>(
      `SELECT COUNT(*)::text AS count FROM responses WHERE survey_id = $1`,
      [surveyId],
    );
    return Number(rows[0].count);
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

    // ── usuario administrador ────────────────────────────────────────────────
    const roles = await ds.query<RoleRow[]>(
      `SELECT role_id, name FROM roles WHERE name = 'admin'`,
    );
    const hash = await bcrypt.hash(TEST_PASSWORD, 10);
    const email = testEmail('admin');
    const existing = await ds.query<{ user_id: string }[]>(
      `SELECT user_id FROM users WHERE email = $1`,
      [email],
    );
    if (!existing.length) {
      await ds.query(
        `INSERT INTO users (user_id, name, last_name, email, password, role_id, must_change_password)
         VALUES (gen_random_uuid(), 'E2E', 'PublicInstruments', $1, $2, $3, false)`,
        [email, hash, roles[0].role_id],
      );
    }
    adminToken = await loginAs(app, email);

    // ── instrumento público ──────────────────────────────────────────────────
    const instrumentRows = await ds.query<{ instrument_id: string }[]>(
      `INSERT INTO instruments (instrument_id, name, version, publish_date, is_active)
       VALUES (gen_random_uuid(), 'E2E 079 Instrumento Publico', 1, CURRENT_DATE, true)
       RETURNING instrument_id`,
    );
    publicInstrumentId = instrumentRows[0].instrument_id;

    const sectionRows = await ds.query<{ section_id: string }[]>(
      `INSERT INTO sections (section_id, name, "order", instrument_id)
       VALUES (gen_random_uuid(), 'E2E 079 Seccion', 1, $1)
       RETURNING section_id`,
      [publicInstrumentId],
    );
    const sectionId = sectionRows[0].section_id;

    const openTextType = await ds.query<{ type_id: string }[]>(
      `SELECT type_id FROM types_of_questions WHERE name = 'open_text'`,
    );

    const insertQuestion = async (
      text: string,
      order: number,
      systemField: string | null,
    ): Promise<string> => {
      const rows = await ds.query<{ question_id: string }[]>(
        `INSERT INTO questions (question_id, section_id, text, type_id, is_required, "order", system_field)
         VALUES (gen_random_uuid(), $1, $2, $3, true, $4, $5)
         RETURNING question_id`,
        [sectionId, text, openTextType[0].type_id, order, systemField],
      );
      return rows[0].question_id;
    };

    qNameId = await insertQuestion('Nombre completo', 1, 'farmer.name');
    qDocumentId = await insertQuestion('Documento', 2, 'farmer.documentId');
    qFreeTextId = await insertQuestion('Comentario', 3, null);

    // ── instrumento con pregunta multimedia ──────────────────────────────────
    const mediaRows = await ds.query<{ instrument_id: string }[]>(
      `INSERT INTO instruments (instrument_id, name, version, publish_date, is_active)
       VALUES (gen_random_uuid(), 'E2E 079 Instrumento Multimedia', 1, CURRENT_DATE, true)
       RETURNING instrument_id`,
    );
    mediaInstrumentId = mediaRows[0].instrument_id;

    const mediaSection = await ds.query<{ section_id: string }[]>(
      `INSERT INTO sections (section_id, name, "order", instrument_id)
       VALUES (gen_random_uuid(), 'E2E 079 Seccion Media', 1, $1)
       RETURNING section_id`,
      [mediaInstrumentId],
    );
    const imageType = await ds.query<{ type_id: string }[]>(
      `SELECT type_id FROM types_of_questions WHERE name = 'image'`,
    );
    await ds.query(
      `INSERT INTO questions (question_id, section_id, text, type_id, is_required, "order")
       VALUES (gen_random_uuid(), $1, 'Foto de la finca', $2, true, 1)`,
      [mediaSection[0].section_id, imageType[0].type_id],
    );

    // ── documento de consentimiento activo (spec 78) ─────────────────────────
    const activeDoc = await ds.query<{ consent_document_id: string }[]>(
      `SELECT consent_document_id FROM consent_documents
       WHERE published_at IS NOT NULL ORDER BY published_at DESC LIMIT 1`,
    );
    consentDocumentId = activeDoc[0].consent_document_id;
    acceptedConsent.consentDocumentId = consentDocumentId;

    await setPublic(true);
  });

  afterAll(async () => {
    for (const surveyId of surveyIdsCreated) {
      await ds.query(`DELETE FROM consent_records WHERE survey_id = $1`, [
        surveyId,
      ]);
      await ds.query(`DELETE FROM responses WHERE survey_id = $1`, [surveyId]);
      await ds.query(`DELETE FROM surveys_instruments WHERE survey_id = $1`, [
        surveyId,
      ]);
      await ds.query(`DELETE FROM surveys WHERE survey_id = $1`, [surveyId]);
    }
    for (const farmerId of farmerIdsCreated) {
      await ds.query(`DELETE FROM consent_records WHERE farmer_id = $1`, [
        farmerId,
      ]);
      // El caso de colisión (criterio 12) deja un registro en
      // farmer_document_collisions apuntando a existing_farmer_id — sin
      // borrarlo primero, el FK bloquea el DELETE del farmer.
      await ds.query(
        `DELETE FROM farmer_document_collisions WHERE existing_farmer_id = $1`,
        [farmerId],
      );
      // La PK de "farmers" es "id" (sin sufijo): distinto de "farmer_id",
      // que es el nombre de la FK en surveys/consent_records.
      await ds.query(`DELETE FROM farmers WHERE id = $1`, [farmerId]);
    }
    for (const instrumentId of [publicInstrumentId, mediaInstrumentId]) {
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

  // ── criterio 2 y 3 — el toggle del enlace público ──────────────────────────

  describe('activación del enlace público', () => {
    it('criterio 3 — rechaza con 422 hacer público un instrumento con preguntas multimedia', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/instruments/${mediaInstrumentId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ isPublic: true });

      expect(res.status).toBe(422);
      expect(JSON.stringify(res.body)).toMatch(/imagen|image|multimedia/i);

      const rows = await ds.query<{ is_public: boolean }[]>(
        `SELECT is_public FROM instruments WHERE instrument_id = $1`,
        [mediaInstrumentId],
      );
      expect(rows[0].is_public).toBe(false);
    });

    it('criterio 2 — con el enlace cerrado, el instrumento no se sirve por el canal público', async () => {
      await setPublic(false);

      const res = await request(app.getHttpServer()).get(
        `/api/public/surveys/${publicInstrumentId}`,
      );

      expect(res.status).toBe(404);
      // El cuerpo debe distinguir "cerrado" de "inexistente" (criterio 2 vs 9).
      expect((res.body as { reason?: string }).reason).toBe('closed');

      await setPublic(true);
    });

    it('criterio 9 — un instrumento inexistente responde con un motivo distinto', async () => {
      const res = await request(app.getHttpServer()).get(
        `/api/public/surveys/00000000-0000-4000-8000-000000000000`,
      );

      expect(res.status).toBe(404);
      expect((res.body as { reason?: string }).reason).toBe('not_found');
    });

    it('un instrumento público pero inactivo tampoco se sirve', async () => {
      await ds.query(
        `UPDATE instruments SET is_active = false WHERE instrument_id = $1`,
        [publicInstrumentId],
      );

      const res = await request(app.getHttpServer()).get(
        `/api/public/surveys/${publicInstrumentId}`,
      );
      expect(res.status).toBe(404);

      await ds.query(
        `UPDATE instruments SET is_active = true WHERE instrument_id = $1`,
        [publicInstrumentId],
      );
    });
  });

  // ── criterio 4 — carga sin autenticación ───────────────────────────────────

  describe('carga del formulario público', () => {
    it('criterio 4 — sirve la estructura del instrumento y el consentimiento activo sin token', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/public/surveys/${publicInstrumentId}`)
        .expect(200);

      const body = res.body as PublicInstrumentResponse;
      expect(body.instrumentId).toBe(publicInstrumentId);
      expect(body.sections.length).toBeGreaterThan(0);
      expect(body.consentDocument.consentDocumentId).toBe(consentDocumentId);
    });
  });

  // ── criterios 5 a 9 — el envío ─────────────────────────────────────────────

  describe('envío público', () => {
    it('criterios 6 y 7 — crea la encuesta sin agricultor, pendiente, con sus respuestas y su constancia', async () => {
      const document = uniqueDocument();
      const res = await submitPublic({
        instrumentId: publicInstrumentId,
        consent: acceptedConsent,
        responses: answersFor('Prueba Publica 079', document),
      }).expect(201);

      const { surveyId } = res.body as PublicSubmitResponse;
      surveyIdsCreated.push(surveyId);

      const survey = await surveyRow(surveyId);
      expect(survey.farmer_id).toBeNull();
      expect(survey.user_id).toBeNull();
      expect(survey.origin).toBe('public');
      expect(survey.review_status).toBe('pending');

      expect(await countResponses(surveyId)).toBe(3);

      const consents = await ds.query<{ accepted_data_processing: boolean }[]>(
        `SELECT accepted_data_processing FROM consent_records WHERE survey_id = $1`,
        [surveyId],
      );
      expect(consents).toHaveLength(1);
      expect(consents[0].accepted_data_processing).toBe(true);
    });

    it('criterio 5 — rechaza el envío si no se aceptó el tratamiento de datos', async () => {
      const res = await submitPublic({
        instrumentId: publicInstrumentId,
        consent: { ...acceptedConsent, acceptedDataProcessing: false },
        responses: answersFor('Sin Consentimiento 079', uniqueDocument()),
      });

      expect(res.status).toBe(400);
    });

    it('criterio 8 — un envío inválido no deja encuesta, respuestas ni constancia a medias', async () => {
      const before = await ds.query<{ count: string }[]>(
        `SELECT COUNT(*)::text AS count FROM surveys WHERE origin = 'public'`,
      );

      // Una questionId que no pertenece al instrumento invalida el lote entero.
      const res = await submitPublic({
        instrumentId: publicInstrumentId,
        consent: acceptedConsent,
        responses: [
          { questionId: qNameId, textValue: 'Atomicidad 079' },
          {
            questionId: '00000000-0000-4000-8000-000000000000',
            textValue: 'ajena',
          },
        ],
      });

      expect(res.status).toBeGreaterThanOrEqual(400);

      const after = await ds.query<{ count: string }[]>(
        `SELECT COUNT(*)::text AS count FROM surveys WHERE origin = 'public'`,
      );
      expect(after[0].count).toBe(before[0].count);
    });

    it('rechaza respuestas con adjunto: el canal público no admite multimedia', async () => {
      const res = await submitPublic({
        instrumentId: publicInstrumentId,
        consent: acceptedConsent,
        responses: [
          {
            questionId: qNameId,
            textValue: 'Con adjunto 079',
            attachmentId: '00000000-0000-4000-8000-000000000001',
          },
        ],
      });

      expect(res.status).toBeGreaterThanOrEqual(400);
    });

    it('criterio 9 — rechaza el envío si el enlace se cerró después de cargar el formulario', async () => {
      await setPublic(false);

      const res = await submitPublic({
        instrumentId: publicInstrumentId,
        consent: acceptedConsent,
        responses: answersFor('Enlace Cerrado 079', uniqueDocument()),
      });

      expect(res.status).toBe(403);

      const rows = await ds.query<{ count: string }[]>(
        `SELECT COUNT(*)::text AS count FROM responses r
         JOIN surveys s ON s.survey_id = r.survey_id
         WHERE r.text_value = 'Enlace Cerrado 079'`,
      );
      expect(rows[0].count).toBe('0');

      await setPublic(true);
    });
  });

  // ── criterios 10 a 14 — la bandeja de revisión ─────────────────────────────

  describe('bandeja de revisión', () => {
    it('criterio 10 — lista los envíos públicos pendientes con su metadata', async () => {
      const res = await request(app.getHttpServer())
        .get(
          `/api/surveys/public-submissions?instrumentId=${publicInstrumentId}&reviewStatus=pending`,
        )
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const rows = res.body as SubmissionRow[] | { data: SubmissionRow[] };
      const list = Array.isArray(rows) ? rows : rows.data;

      expect(list.length).toBeGreaterThan(0);
      const item = list.find((r) => surveyIdsCreated.includes(r.surveyId));
      expect(item).toBeDefined();
      expect(item!.responseCount).toBe(3);
      expect(item!.reviewStatus).toBe('pending');
    });

    it('la bandeja no expone encuestas de campo', async () => {
      const fieldSurvey = await ds.query<{ survey_id: string }[]>(
        `INSERT INTO surveys (survey_id, sincronized) VALUES (gen_random_uuid(), false)
         RETURNING survey_id`,
      );
      const fieldSurveyId = fieldSurvey[0].survey_id;
      surveyIdsCreated.push(fieldSurveyId);

      const res = await request(app.getHttpServer())
        .get('/api/surveys/public-submissions')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const rows = res.body as SubmissionRow[] | { data: SubmissionRow[] };
      const list = Array.isArray(rows) ? rows : rows.data;
      expect(list.some((r) => r.surveyId === fieldSurveyId)).toBe(false);
    });

    it('criterios 11 y 12 — procesar crea el agricultor y reancla la constancia', async () => {
      const document = uniqueDocument();
      const submit = await submitPublic({
        instrumentId: publicInstrumentId,
        consent: acceptedConsent,
        responses: answersFor('Agricultor Procesado 079', document),
      }).expect(201);

      const { surveyId } = submit.body as PublicSubmitResponse;
      surveyIdsCreated.push(surveyId);

      await request(app.getHttpServer())
        .post(`/api/surveys/${surveyId}/process-public`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({})
        .expect(201);

      const survey = await surveyRow(surveyId);
      expect(survey.review_status).toBe('processed');
      expect(survey.farmer_id).not.toBeNull();
      farmerIdsCreated.push(survey.farmer_id!);

      const farmer = await ds.query<{ name: string; document_id: string }[]>(
        `SELECT name, document_id FROM farmers WHERE id = $1`,
        [survey.farmer_id],
      );
      expect(farmer[0].document_id).toBe(document);

      // criterio 11 — la constancia deja de estar huérfana.
      const consent = await ds.query<{ farmer_id: string | null }[]>(
        `SELECT farmer_id FROM consent_records WHERE survey_id = $1`,
        [surveyId],
      );
      expect(consent[0].farmer_id).toBe(survey.farmer_id);
    });

    it('criterio 12 — una colisión de documento deja el envío sin procesar', async () => {
      const document = uniqueDocument();

      const existing = await ds.query<{ id: string }[]>(
        `INSERT INTO farmers (id, name, document_id)
         VALUES (gen_random_uuid(), 'Nombre Totalmente Distinto', $1)
         RETURNING id`,
        [document],
      );
      farmerIdsCreated.push(existing[0].id);

      const submit = await submitPublic({
        instrumentId: publicInstrumentId,
        consent: acceptedConsent,
        responses: answersFor('Otra Persona 079', document),
      }).expect(201);
      const { surveyId } = submit.body as PublicSubmitResponse;
      surveyIdsCreated.push(surveyId);

      const conflict = await request(app.getHttpServer())
        .post(`/api/surveys/${surveyId}/process-public`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({});

      expect(conflict.status).toBe(409);

      const stillPending = await surveyRow(surveyId);
      expect(stillPending.review_status).toBe('pending');
      expect(stillPending.farmer_id).toBeNull();

      // Con la resolución declarada, sí procesa.
      await request(app.getHttpServer())
        .post(`/api/surveys/${surveyId}/process-public`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ resolution: 'same_person' })
        .expect(201);

      const resolved = await surveyRow(surveyId);
      expect(resolved.review_status).toBe('processed');
      expect(resolved.farmer_id).toBe(existing[0].id);
    });

    it('criterio 13 — descartar no borra la encuesta ni sus respuestas', async () => {
      const submit = await submitPublic({
        instrumentId: publicInstrumentId,
        consent: acceptedConsent,
        responses: answersFor('Descartado 079', uniqueDocument()),
      }).expect(201);
      const { surveyId } = submit.body as PublicSubmitResponse;
      surveyIdsCreated.push(surveyId);

      await request(app.getHttpServer())
        .post(`/api/surveys/${surveyId}/discard-public`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({})
        .expect(201);

      const survey = await surveyRow(surveyId);
      expect(survey.review_status).toBe('discarded');
      expect(survey.farmer_id).toBeNull();
      expect(await countResponses(surveyId)).toBe(3);
    });

    it('rechaza procesar una encuesta que no es de origen público', async () => {
      const fieldSurvey = await ds.query<{ survey_id: string }[]>(
        `INSERT INTO surveys (survey_id, sincronized) VALUES (gen_random_uuid(), false)
         RETURNING survey_id`,
      );
      surveyIdsCreated.push(fieldSurvey[0].survey_id);

      await request(app.getHttpServer())
        .post(`/api/surveys/${fieldSurvey[0].survey_id}/process-public`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({})
        .expect(409);
    });

    it('la bandeja exige autenticación', async () => {
      await request(app.getHttpServer())
        .get('/api/surveys/public-submissions')
        .expect(401);
    });
  });

  // ── criterio 14 — el dashboard público ─────────────────────────────────────

  describe('dashboard público', () => {
    it('criterio 14 — los envíos públicos pendientes no cuentan en los agregados', async () => {
      const questionRows = await ds.query<{ count: string }[]>(
        `SELECT COUNT(*)::text AS count FROM responses r
         JOIN surveys s ON s.survey_id = r.survey_id
         WHERE s.origin = 'public' AND s.review_status = 'pending'`,
      );
      expect(Number(questionRows[0].count)).toBeGreaterThan(0);

      // La consulta que alimenta el dashboard debe excluirlas.
      const counted = await ds.query<{ count: string }[]>(
        `SELECT COUNT(*)::text AS count FROM surveys
         WHERE origin = 'field' OR review_status = 'processed'`,
      );
      const all = await ds.query<{ count: string }[]>(
        `SELECT COUNT(*)::text AS count FROM surveys`,
      );
      expect(Number(counted[0].count)).toBeLessThan(Number(all[0].count));
    });
  });
});
