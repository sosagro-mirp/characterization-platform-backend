/**
 * Spec 84 — Depuración de instrumentos e instrumento de Registro del productor.
 *
 * ESTAS PRUEBAS NACEN EN ROJO. Nada de lo que verifican existe todavía:
 * `S_REG` como código de sistema, las columnas `questions.archived_at`,
 * `options_question.archived_at` y `farms.corregimiento`, las guardas 409, los
 * endpoints de archivado, `GET /api/instruments/:id/editor-structure`, el mapeo
 * `farm.mainCrop` en la extracción y el módulo `src/database/instrument-sync/`
 * los crean las fases 1 a 3 del spec.
 *
 * Criterios cubiertos: 1, 2, 3, 7, 8, 9, 10, 12, 13 y 14. El resto (flujos de
 * UI, dashboard, snapshot real entre entornos y entregables) vive en
 * `docs/testing/test-084-depuracion-instrumentos-registro.md`.
 */

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { AppModule } from '../src/app.module';

// Fase 3 — módulo nuevo: hoy no existe y el archivo no compila.
import {
  exportManifest,
  buildPlan,
  applyPlan,
  type InstrumentManifest,
} from '../src/database/instrument-sync';

// ─── helpers ────────────────────────────────────────────────────────────────

const TEST_PASSWORD = 'E2eTest1234!';
const PREFIX = 'e2e-084';

interface LoginResponse {
  accessToken: string;
}

interface EditorQuestion {
  questionId: string;
  archivedAt: string | null;
  responseCount: number;
  options?: {
    optionId: string;
    archivedAt: string | null;
    responseCount: number;
  }[];
}

interface EditorStructure {
  sections: { sectionId: string; questions: EditorQuestion[] }[];
}

interface RenderStructure {
  sections: {
    sectionId: string;
    questions: { questionId: string; options?: { optionId: string }[] }[];
  }[];
}

function allRenderQuestions(render: RenderStructure) {
  return render.sections.flatMap((s) => s.questions);
}

describe('spec-084 — depuración de instrumentos y Registro del productor (e2e)', () => {
  let app: INestApplication<App>;
  let ds: DataSource;
  let adminToken: string;
  let adminUserId: string;

  // Instrumento de edición: pregunta respondida, pregunta libre, pregunta
  // condicionante con su dependiente, y selección única con opción usada/libre.
  let editorInstrumentId: string;
  let editorSectionId: string;
  let qAnswered: string;
  let qFree: string;
  let qCondition: string;
  let qDependent: string;
  let qChoice: string;
  let optUsed: string;
  let optFree: string;
  let editorSurveyId: string;

  // Registro: instrumento con los systemField del Registro (la extracción no
  // depende del código) + campaña y sesión.
  let regInstrumentId: string;
  let regSurveyId: string;
  let campaignId: string;
  let sessionId: string;
  let townId: string;
  let cafeCropId: string;
  const regDocument = `84${Date.now().toString().slice(-8)}`;

  // Instrumento con code S_REG creado solo si el entorno no lo tiene.
  let createdSRegId: string | null = null;

  // Constancia de consentimiento aceptada antes de existir el productor.
  let orphanConsentId: string | undefined;

  const typeId: Record<string, string> = {};

  function http() {
    return request(app.getHttpServer());
  }

  function auth(req: request.Test) {
    return req.set('Authorization', `Bearer ${adminToken}`);
  }

  async function insertInstrument(name: string, code: string | null = null) {
    const rows = await ds.query<{ instrument_id: string }[]>(
      `INSERT INTO instruments (instrument_id, name, version, publish_date, is_active, code)
       VALUES (gen_random_uuid(), $1, 1, CURRENT_DATE, true, $2) RETURNING instrument_id`,
      [name, code],
    );
    return rows[0].instrument_id;
  }

  async function insertSection(instrumentId: string, name: string, order = 1) {
    const rows = await ds.query<{ section_id: string }[]>(
      `INSERT INTO sections (section_id, name, "order", instrument_id)
       VALUES (gen_random_uuid(), $1, $2, $3) RETURNING section_id`,
      [name, order, instrumentId],
    );
    return rows[0].section_id;
  }

  async function insertQuestion(
    sectionId: string,
    text: string,
    type: string,
    order: number,
    extra: {
      systemField?: string;
      conditionQuestionId?: string;
      conditionValue?: string;
    } = {},
  ) {
    const rows = await ds.query<{ question_id: string }[]>(
      `INSERT INTO questions (question_id, section_id, text, type_id, is_required, "order",
         system_field, condition_question_id, condition_value)
       VALUES (gen_random_uuid(), $1, $2, $3, false, $4, $5, $6, $7) RETURNING question_id`,
      [
        sectionId,
        text,
        typeId[type],
        order,
        extra.systemField ?? null,
        extra.conditionQuestionId ?? null,
        extra.conditionValue ?? null,
      ],
    );
    return rows[0].question_id;
  }

  async function insertOption(
    questionId: string,
    text: string,
    metadataId: string | null = null,
  ) {
    const rows = await ds.query<{ option_id: string }[]>(
      `INSERT INTO options_question (option_id, question_id, text, value, metadata_id)
       VALUES (gen_random_uuid(), $1, $2, $2, $3) RETURNING option_id`,
      [questionId, text, metadataId],
    );
    return rows[0].option_id;
  }

  async function insertSurvey(
    instrumentId: string,
    campaignSessionId: string | null = null,
  ) {
    const rows = await ds.query<{ survey_id: string }[]>(
      `INSERT INTO surveys (survey_id, user_id, campaign_session_id, sincronized)
       VALUES (gen_random_uuid(), $1, $2, true) RETURNING survey_id`,
      [adminUserId, campaignSessionId],
    );
    const surveyId = rows[0].survey_id;
    await ds.query(
      `INSERT INTO surveys_instruments (survey_id, instrument_id) VALUES ($1, $2)`,
      [surveyId, instrumentId],
    );
    return surveyId;
  }

  async function insertResponse(
    surveyId: string,
    questionId: string,
    value: { text?: string; optionId?: string },
  ) {
    await ds.query(
      `INSERT INTO responses (response_id, survey_id, question_id, text_value, option_id)
       VALUES (gen_random_uuid(), $1, $2, $3, $4)`,
      [surveyId, questionId, value.text ?? null, value.optionId ?? null],
    );
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

    // ── administrador ────────────────────────────────────────────────────────
    const roles = await ds.query<{ role_id: string }[]>(
      `SELECT role_id FROM roles WHERE name = 'admin'`,
    );
    const email = `${PREFIX}-admin@test.local`;
    const existing = await ds.query<{ user_id: string }[]>(
      `SELECT user_id FROM users WHERE email = $1`,
      [email],
    );
    if (existing.length) {
      adminUserId = existing[0].user_id;
    } else {
      const hash = await bcrypt.hash(TEST_PASSWORD, 10);
      const created = await ds.query<{ user_id: string }[]>(
        `INSERT INTO users (user_id, name, last_name, email, password, role_id, must_change_password)
         VALUES (gen_random_uuid(), 'E2E', 'Spec84', $1, $2, $3, false) RETURNING user_id`,
        [email, hash, roles[0].role_id],
      );
      adminUserId = created[0].user_id;
    }
    const login = await http()
      .post('/api/auth/login')
      .send({ email, password: TEST_PASSWORD })
      .expect(200);
    adminToken = (login.body as LoginResponse).accessToken;

    for (const row of await ds.query<{ type_id: string; name: string }[]>(
      `SELECT type_id, name FROM types_of_questions`,
    )) {
      typeId[row.name] = row.type_id;
    }

    // ── instrumento de edición ───────────────────────────────────────────────
    editorInstrumentId = await insertInstrument('E2E 084 Instrumento Edicion');
    editorSectionId = await insertSection(
      editorInstrumentId,
      'E2E 084 Seccion',
    );
    qAnswered = await insertQuestion(
      editorSectionId,
      'Pregunta respondida',
      'open_text',
      1,
    );
    qFree = await insertQuestion(
      editorSectionId,
      'Pregunta sin respuestas',
      'open_text',
      2,
    );
    qCondition = await insertQuestion(
      editorSectionId,
      'Pregunta condicionante',
      'yes_no',
      3,
    );
    qDependent = await insertQuestion(
      editorSectionId,
      'Pregunta dependiente',
      'open_text',
      4,
      {
        conditionQuestionId: qCondition,
        conditionValue: 'true',
      },
    );
    qChoice = await insertQuestion(
      editorSectionId,
      'Seleccion',
      'single_choice',
      5,
    );
    optUsed = await insertOption(qChoice, 'Opcion usada');
    optFree = await insertOption(qChoice, 'Opcion libre');

    editorSurveyId = await insertSurvey(editorInstrumentId);
    await insertResponse(editorSurveyId, qAnswered, {
      text: 'respuesta e2e-084',
    });
    await insertResponse(editorSurveyId, qChoice, { optionId: optUsed });

    // ── Registro ─────────────────────────────────────────────────────────────
    const town = await ds.query<{ town_id: string; department_id: string }[]>(
      `SELECT town_id, department_id FROM towns ORDER BY name LIMIT 1`,
    );
    townId = town[0].town_id;
    const cafe = await ds.query<{ crop_id: string }[]>(
      `SELECT crop_id FROM types_of_crops WHERE name = 'Café'`,
    );
    cafeCropId = cafe[0].crop_id;

    regInstrumentId = await insertInstrument('E2E 084 Registro');
    const regSection = await insertSection(regInstrumentId, 'Registro');
    const qName = await insertQuestion(
      regSection,
      'Nombre completo',
      'open_text',
      1,
      { systemField: 'farmer.name' },
    );
    const qDoc = await insertQuestion(regSection, 'Documento', 'open_text', 2, {
      systemField: 'farmer.documentId',
    });
    const qPhone = await insertQuestion(regSection, 'Celular', 'open_text', 3, {
      systemField: 'farmer.phone',
    });
    const qFarm = await insertQuestion(regSection, 'Finca', 'open_text', 4, {
      systemField: 'farm.name',
    });
    const qTown = await insertQuestion(
      regSection,
      'Municipio',
      'single_choice',
      5,
      { systemField: 'farm.town' },
    );
    const optTown = await insertOption(qTown, 'Municipio e2e', townId);
    const qVereda = await insertQuestion(regSection, 'Vereda', 'open_text', 6, {
      systemField: 'farm.vereda',
    });
    const qCorr = await insertQuestion(
      regSection,
      'Corregimiento',
      'open_text',
      7,
      { systemField: 'farm.corregimiento' },
    );
    const qCrop = await insertQuestion(
      regSection,
      'Cultivo principal',
      'single_choice',
      8,
      { systemField: 'farm.mainCrop' },
    );
    const optCafe = await insertOption(qCrop, 'Café', cafeCropId);

    // Perfil (selección múltiple): queda como respuesta, con cada opción
    // ligada a su tipo de actor por metadataId (spec 84, Alcance B).
    const actorTypes = await ds.query<
      { actor_type_id: string; name: string }[]
    >(
      `SELECT actor_type_id, name FROM actor_type WHERE name IN ('productor', 'propietario', 'extensionista')`,
    );
    const actorTypeId = (name: string) =>
      actorTypes.find((a) => a.name === name)!.actor_type_id;
    const qProfile = await insertQuestion(
      regSection,
      'Perfil',
      'multiple_choice',
      9,
    );
    const optProductor = await insertOption(
      qProfile,
      'Productor',
      actorTypeId('productor'),
    );
    const optPropietario = await insertOption(
      qProfile,
      'Propietario',
      actorTypeId('propietario'),
    );
    await insertOption(qProfile, 'Extensionista', actorTypeId('extensionista'));

    const campaign = await ds.query<{ campaign_id: string }[]>(
      `INSERT INTO campaigns (campaign_id, name, is_active) VALUES (gen_random_uuid(), 'E2E 084 Campaña', true)
       RETURNING campaign_id`,
    );
    campaignId = campaign[0].campaign_id;
    const session = await ds.query<{ session_id: string }[]>(
      `INSERT INTO campaign_sessions (session_id, campaign_id, user_id, sincronized)
       VALUES (gen_random_uuid(), $1, $2, true) RETURNING session_id`,
      [campaignId, adminUserId],
    );
    sessionId = session[0].session_id;

    regSurveyId = await insertSurvey(regInstrumentId, sessionId);
    await insertResponse(regSurveyId, qName, { text: 'Productora E2E 084' });
    await insertResponse(regSurveyId, qDoc, { text: regDocument });
    await insertResponse(regSurveyId, qPhone, { text: '3000000084' });
    await insertResponse(regSurveyId, qFarm, { text: 'Finca E2E 084' });
    await insertResponse(regSurveyId, qTown, { optionId: optTown });
    await insertResponse(regSurveyId, qVereda, { text: 'Vereda E2E' });
    await insertResponse(regSurveyId, qCorr, { text: 'Corregimiento E2E' });
    await insertResponse(regSurveyId, qCrop, { optionId: optCafe });
    await insertResponse(regSurveyId, qProfile, { optionId: optProductor });
    await insertResponse(regSurveyId, qProfile, { optionId: optPropietario });

    // Género (selección única con systemField): la 4.ª ronda de test-084
    // mostró que `extractFarmer` descartaba las respuestas de selección y el
    // productor quedaba sin género.
    const qGender = await insertQuestion(
      regSection,
      'Género',
      'single_choice',
      10,
      { systemField: 'farmer.gender' },
    );
    const optMujer = await insertOption(qGender, 'Mujer');
    await insertResponse(regSurveyId, qGender, { optionId: optMujer });

    // Flujo real: el consentimiento se acepta al inicio, antes de que exista
    // el productor, y la extracción debe enlazarlo dentro de su transacción.
    const consentDocs = await ds.query<{ consent_document_id: string }[]>(
      `SELECT consent_document_id FROM consent_documents LIMIT 1`,
    );
    if (consentDocs.length) {
      const consent = await ds.query<{ consent_record_id: string }[]>(
        `INSERT INTO consent_records (consent_record_id, consent_document_id, session_id,
           accepted_data_processing, accepted_at, recorded_by)
         VALUES (gen_random_uuid(), $1, $2, true, now(), $3) RETURNING consent_record_id`,
        [consentDocs[0].consent_document_id, sessionId, adminUserId],
      );
      orphanConsentId = consent[0].consent_record_id;
    }
  });

  // Instrumento auxiliar del bloque de búsqueda — declarado aquí para que el
  // `afterAll` global también lo limpie.
  let searchInstrumentId: string | undefined;

  // Encuesta del caso de envíos concurrentes (criterio 10).
  let raceSurveyId: string | undefined;

  afterAll(async () => {
    const safe = async (sql: string, params: unknown[] = []) => {
      try {
        await ds.query(sql, params);
      } catch {
        /* limpieza tolerante: el caso que falló pudo no crear el recurso */
      }
    };
    const farmers = await ds.query<{ id: string; farm_id: string | null }[]>(
      `SELECT id, farm_id FROM farmers WHERE document_id = $1`,
      [regDocument],
    );
    for (const f of farmers) {
      await safe(`DELETE FROM consent_records WHERE farmer_id = $1`, [f.id]);
      await safe(
        `UPDATE campaign_sessions SET farmer_id = NULL WHERE farmer_id = $1`,
        [f.id],
      );
      await safe(`UPDATE surveys SET farmer_id = NULL WHERE farmer_id = $1`, [
        f.id,
      ]);
      await safe(`DELETE FROM farmers WHERE id = $1`, [f.id]);
      if (f.farm_id) {
        await safe(`DELETE FROM farms_crops WHERE farm_id = $1`, [f.farm_id]);
        await safe(`DELETE FROM farms WHERE farm_id = $1`, [f.farm_id]);
      }
    }
    for (const surveyId of [editorSurveyId, regSurveyId, raceSurveyId]) {
      if (surveyId)
        await safe(`DELETE FROM surveys WHERE survey_id = $1`, [surveyId]);
    }
    await safe(`DELETE FROM consent_records WHERE session_id = $1`, [
      sessionId,
    ]);
    await safe(`DELETE FROM campaign_sessions WHERE session_id = $1`, [
      sessionId,
    ]);
    await safe(`DELETE FROM campaigns WHERE campaign_id = $1`, [campaignId]);
    for (const id of [
      editorInstrumentId,
      regInstrumentId,
      createdSRegId,
      searchInstrumentId,
    ]) {
      if (id)
        await safe(`DELETE FROM instruments WHERE instrument_id = $1`, [id]);
    }
    await app.close();
  });

  // ── Criterio 1 ────────────────────────────────────────────────────────────

  describe('Criterio 1 — S_REG por código y alias heredados', () => {
    beforeAll(async () => {
      const found = await ds.query<{ instrument_id: string }[]>(
        `SELECT instrument_id FROM instruments WHERE code = 'S_REG'`,
      );
      if (!found.length) {
        createdSRegId = await insertInstrument('E2E 084 S_REG', 'S_REG');
      }
    });

    it('GET /instruments/by-code/S_REG devuelve el Registro', async () => {
      const res = await http()
        .get('/api/instruments/by-code/S_REG')
        .expect(200);
      expect(res.body).toMatchObject({ code: 'S_REG' });
    });

    it.each([
      ['S1', 'S1a'],
      ['S2', 'S1b'],
    ])('el alias %s sigue resolviendo a %s', async (alias, real) => {
      const res = await http()
        .get(`/api/instruments/by-code/${alias}`)
        .expect(200);
      expect(res.body).toMatchObject({ code: real });
    });
  });

  // ── Criterio 2 ────────────────────────────────────────────────────────────

  describe('Criterio 2 — S_REG es instrumento de sistema', () => {
    it('no aparece con excludeSystem=true', async () => {
      const res = await http()
        .get('/api/instruments?excludeSystem=true')
        .expect(200);
      const codes = (res.body as { code: string | null }[]).map((i) => i.code);
      expect(codes).not.toContain('S_REG');
    });

    it('no se puede agregar como paso de campaña', async () => {
      const sReg = await ds.query<{ instrument_id: string }[]>(
        `SELECT instrument_id FROM instruments WHERE code = 'S_REG'`,
      );
      await auth(http().post(`/api/campaigns/${campaignId}/steps`))
        .send({ instrumentId: sReg[0].instrument_id, order: 1 })
        .expect(400);
    });
  });

  // ── Criterio 3 ────────────────────────────────────────────────────────────

  describe('Criterio 3 — extracción del Registro sobre una misma encuesta', () => {
    it('crea productor y finca con corregimiento, y asigna el cultivo principal a finca y sesión', async () => {
      const farmerRes = await auth(
        http().post(`/api/surveys/${regSurveyId}/extract-farmer`),
      ).send({});
      expect([200, 201]).toContain(farmerRes.status);

      const cropsRes = await auth(
        http().post(`/api/surveys/${regSurveyId}/extract-crops`),
      ).send({});
      expect([200, 201]).toContain(cropsRes.status);

      const farmers = await ds.query<{ farm_id: string }[]>(
        `SELECT farm_id FROM farmers WHERE document_id = $1`,
        [regDocument],
      );
      expect(farmers).toHaveLength(1);

      const farms = await ds.query<
        { town_id: string; vereda: string; corregimiento: string }[]
      >(`SELECT town_id, vereda, corregimiento FROM farms WHERE farm_id = $1`, [
        farmers[0].farm_id,
      ]);
      expect(farms[0]).toMatchObject({
        town_id: townId,
        vereda: 'Vereda E2E',
        corregimiento: 'Corregimiento E2E',
      });

      const farmCrops = await ds.query<{ crop_id: string }[]>(
        `SELECT crop_id FROM farms_crops WHERE farm_id = $1`,
        [farmers[0].farm_id],
      );
      expect(farmCrops.map((c) => c.crop_id)).toEqual([cafeCropId]);

      const sessionCrops = await ds.query<{ crop_id: string }[]>(
        `SELECT types_of_crops_crop_id AS crop_id FROM campaign_sessions_crops
         WHERE campaign_sessions_session_id = $1`,
        [sessionId],
      );
      expect(sessionCrops.map((c) => c.crop_id)).toContain(cafeCropId);

      // Selección única con systemField: se guarda el texto de la opción.
      const gender = await ds.query<{ gender: string | null }[]>(
        `SELECT gender FROM farmers WHERE document_id = $1`,
        [regDocument],
      );
      expect(gender[0].gender).toBe('Mujer');

      // Regresión `b2b1042`: sin el manager de la transacción, el UPDATE salía
      // por otra conexión, la FK lo rechazaba y la constancia quedaba huérfana.
      if (orphanConsentId) {
        const linked = await ds.query<{ enlazada: boolean }[]>(
          `SELECT c.farmer_id = f.id AS enlazada
             FROM consent_records c JOIN farmers f ON f.document_id = $2
            WHERE c.consent_record_id = $1`,
          [orphanConsentId, regDocument],
        );
        expect(linked[0].enlazada).toBe(true);
      }
    });

    /**
     * Regresión de la ronda de pruebas del 2026-09-13: el flujo web disparaba
     * `extract-farmer` dos veces y ambas llamadas leían "no existe" antes de
     * que cualquiera escribiera, creando DOS productores con el mismo
     * documento y dos fincas. Se reprodujo dos veces en desarrollo.
     */
    it('extraer dos veces de la misma encuesta no duplica el productor', async () => {
      const [primera, segunda] = await Promise.all([
        auth(http().post(`/api/surveys/${regSurveyId}/extract-farmer`)).send(
          {},
        ),
        auth(http().post(`/api/surveys/${regSurveyId}/extract-farmer`)).send(
          {},
        ),
      ]);
      expect([200, 201]).toContain(primera.status);
      expect([200, 201]).toContain(segunda.status);

      const cuerpoA = primera.body as { farmer: { id: string } };
      const cuerpoB = segunda.body as { farmer: { id: string } };
      expect(cuerpoA.farmer.id).toBe(cuerpoB.farmer.id);

      const farmers = await ds.query<{ id: string }[]>(
        `SELECT id FROM farmers WHERE document_id = $1`,
        [regDocument],
      );
      expect(farmers).toHaveLength(1);

      // La encuesta queda marcada con el productor que salió de ella: es la
      // clave de idempotencia que hace inocuo cualquier reintento posterior.
      const surveys = await ds.query<{ farmer_id: string | null }[]>(
        `SELECT farmer_id FROM surveys WHERE survey_id = $1`,
        [regSurveyId],
      );
      expect(surveys[0].farmer_id).toBe(farmers[0].id);
    });
  });

  // ── Criterio 7 ────────────────────────────────────────────────────────────

  describe('Criterio 7 — guardas: nada con respuestas se destruye', () => {
    it('borrar una pregunta con respuestas → 409 y las respuestas siguen', async () => {
      const before = await countResponses(editorSurveyId);
      await auth(
        http().delete(
          `/api/sections/${editorSectionId}/questions/${qAnswered}`,
        ),
      ).expect(409);
      expect(await countResponses(editorSurveyId)).toBe(before);
    });

    it('cambiar el tipo de una pregunta con respuestas → 409', async () => {
      await auth(
        http().patch(`/api/sections/${editorSectionId}/questions/${qAnswered}`),
      )
        .send({ typeId: typeId.numeric })
        .expect(409);
    });

    it('borrar una sección con preguntas respondidas → 409', async () => {
      const before = await countResponses(editorSurveyId);
      await auth(
        http().delete(
          `/api/instruments/${editorInstrumentId}/sections/${editorSectionId}`,
        ),
      ).expect(409);
      expect(await countResponses(editorSurveyId)).toBe(before);
    });

    it('borrar una opción usada en respuestas → 409 y la respuesta conserva su opción', async () => {
      await auth(
        http().delete(`/api/questions/${qChoice}/options/${optUsed}`),
      ).expect(409);
      const rows = await ds.query<{ option_id: string | null }[]>(
        `SELECT option_id FROM responses WHERE survey_id = $1 AND question_id = $2`,
        [editorSurveyId, qChoice],
      );
      expect(rows[0].option_id).toBe(optUsed);
    });

    it('sin respuestas, borrar opción y pregunta sí funciona', async () => {
      const optRes = await auth(
        http().delete(`/api/questions/${qChoice}/options/${optFree}`),
      );
      expect([200, 204]).toContain(optRes.status);
      const qRes = await auth(
        http().delete(`/api/sections/${editorSectionId}/questions/${qFree}`),
      );
      expect([200, 204]).toContain(qRes.status);
    });
  });

  // ── Criterio 8 ────────────────────────────────────────────────────────────

  describe('Criterio 8 — dependencias al archivar', () => {
    it('archivar una pregunta de la que depende otra visible → 409', async () => {
      await auth(
        http().patch(
          `/api/sections/${editorSectionId}/questions/${qCondition}/archive`,
        ),
      ).expect(409);
    });
  });

  // ── Criterio 9 ────────────────────────────────────────────────────────────

  describe('Criterio 9 — visibilidad de lo archivado', () => {
    it('archivar oculta pregunta y opción del render y las muestra en editor-structure', async () => {
      await auth(
        http().patch(
          `/api/sections/${editorSectionId}/questions/${qAnswered}/archive`,
        ),
      ).expect(200);
      await auth(
        http().patch(`/api/questions/${qChoice}/options/${optUsed}/archive`),
      ).expect(200);

      const render = await http()
        .get(`/api/instruments/${editorInstrumentId}/render`)
        .expect(200);
      const renderQuestions = allRenderQuestions(
        render.body as RenderStructure,
      );
      expect(renderQuestions.map((q) => q.questionId)).not.toContain(qAnswered);
      const choice = renderQuestions.find((q) => q.questionId === qChoice);
      expect((choice?.options ?? []).map((o) => o.optionId)).not.toContain(
        optUsed,
      );

      const editor = await auth(
        http().get(`/api/instruments/${editorInstrumentId}/editor-structure`),
      ).expect(200);
      const editorQuestions = (editor.body as EditorStructure).sections.flatMap(
        (s) => s.questions,
      );
      const archived = editorQuestions.find((q) => q.questionId === qAnswered);
      expect(archived?.archivedAt).toBeTruthy();
      expect(archived?.responseCount).toBe(1);
      const archivedOption = editorQuestions
        .find((q) => q.questionId === qChoice)
        ?.options?.find((o) => o.optionId === optUsed);
      expect(archivedOption?.archivedAt).toBeTruthy();
      expect(archivedOption?.responseCount).toBe(1);
    });

    it('editor-structure exige autenticación', async () => {
      await http()
        .get(`/api/instruments/${editorInstrumentId}/editor-structure`)
        .expect(401);
    });

    it('desarchivar devuelve la pregunta al render', async () => {
      await auth(
        http().patch(
          `/api/sections/${editorSectionId}/questions/${qAnswered}/unarchive`,
        ),
      ).expect(200);
      const render = await http()
        .get(`/api/instruments/${editorInstrumentId}/render`)
        .expect(200);
      expect(
        allRenderQuestions(render.body as RenderStructure).map(
          (q) => q.questionId,
        ),
      ).toContain(qAnswered);
    });
  });

  // ── Criterio 10 ───────────────────────────────────────────────────────────

  describe('Criterio 10 — respuestas a lo archivado se aceptan y se conservan', () => {
    it('POST /responses/batch acepta una respuesta a una pregunta archivada', async () => {
      await auth(
        http().patch(
          `/api/sections/${editorSectionId}/questions/${qDependent}/archive`,
        ),
      ).expect(200);
      await auth(http().post('/api/responses/batch'))
        .send([
          {
            surveyId: editorSurveyId,
            questionId: qDependent,
            textValue: 'borrador tardío',
          },
        ])
        .expect(201);
    });

    it('el historial de la encuesta sigue mostrando respuestas de preguntas archivadas', async () => {
      const res = await auth(
        http().get(`/api/surveys/${editorSurveyId}/responses`),
      ).expect(200);
      expect(JSON.stringify(res.body)).toContain('borrador tardío');
    });

    /**
     * Regresión de la ronda de pruebas del 2026-09-13 (`d938548`): la app
     * móvil envió el mismo lote dos veces con un solo toque y la guarda de
     * idempotencia, fuera de transacción, dejó cada respuesta duplicada.
     */
    it('dos envíos concurrentes del mismo lote no duplican respuestas', async () => {
      raceSurveyId = await insertSurvey(editorInstrumentId);
      const lote = [
        {
          surveyId: raceSurveyId,
          questionId: qAnswered,
          textValue: 'carrera e2e-084',
        },
        { surveyId: raceSurveyId, questionId: qChoice, optionId: optUsed },
      ];
      const [primero, segundo] = await Promise.all([
        auth(http().post('/api/responses/batch')).send(lote),
        auth(http().post('/api/responses/batch')).send(lote),
      ]);
      expect([200, 201]).toContain(primero.status);
      expect([200, 201]).toContain(segundo.status);
      expect(await countResponses(raceSurveyId)).toBe(2);
    });
  });

  // ── Criterios 12, 13 y 14 — instrument-sync ───────────────────────────────

  describe('Criterios 12–14 — manifiesto, plan y aplicación', () => {
    let base: InstrumentManifest;

    beforeAll(async () => {
      base = await exportManifest(ds, {
        instrumentIds: [editorInstrumentId, regInstrumentId],
      });
    });

    it('Criterio 12 — catálogos por clave natural, hash y responseCount, sin datos personales', () => {
      const instrument = base.instruments.find(
        (i) => i.instrumentId === editorInstrumentId,
      );
      expect(instrument?.hash).toEqual(expect.any(String));
      const question = instrument?.sections
        .flatMap((s) => s.questions)
        .find((q) => q.questionId === qChoice);
      expect(question?.type).toBe('single_choice');
      expect(question?.responseCount).toEqual(expect.any(Number));

      const regOptions =
        base.instruments
          .find((i) => i.instrumentId === regInstrumentId)
          ?.sections.flatMap((s) => s.questions)
          .flatMap((q) => q.options ?? []) ?? [];
      const town = regOptions.find((o) => o.metadata?.kind === 'town');
      expect(town?.metadata?.kind).toBe('town');
      expect(typeof town?.metadata?.key).toBe('string');
      expect(town?.metadata?.key).toBeTruthy();
      const crop = regOptions.find((o) => o.metadata?.kind === 'crop');
      expect(crop?.metadata).toMatchObject({ kind: 'crop', key: 'Café' });
      const actorKeys = regOptions
        .filter((o) => o.metadata?.kind === 'actorType')
        .map((o) => o.metadata?.key)
        .sort();
      expect(actorKeys).toEqual(['extensionista', 'productor', 'propietario']);

      const serialized = JSON.stringify(base);
      expect(serialized).not.toContain(regDocument);
      expect(serialized).not.toContain('Productora E2E 084');
    });

    it('Criterio 13 — sin diferencias, 0 operaciones y 0 conflictos', () => {
      const plan = buildPlan({ base, desired: base, current: base });
      expect(plan.operations).toHaveLength(0);
      expect(plan.conflicts).toHaveLength(0);
    });

    it('Criterio 13 — detecta borrado con respuestas y cambio de tipo con respuestas', () => {
      const desired = structuredClone(base);
      const section = desired.instruments
        .find((i) => i.instrumentId === editorInstrumentId)!
        .sections.find((s) => s.sectionId === editorSectionId)!;
      section.questions = section.questions.filter(
        (q) => q.questionId !== qAnswered,
      );
      const choice = section.questions.find((q) => q.questionId === qChoice)!;
      choice.type = 'multiple_choice';

      const plan = buildPlan({ base, desired, current: base });
      const types = plan.conflicts.map((c) => c.type);
      expect(types).toContain('delete_with_responses');
      expect(types).toContain('type_change_with_responses');
    });

    it('Criterio 13 — detecta cambios en el destino posteriores al snapshot', () => {
      const desired = structuredClone(base);
      const current = structuredClone(base);
      const pick = (m: InstrumentManifest) =>
        m.instruments
          .find((i) => i.instrumentId === editorInstrumentId)!
          .sections.flatMap((s) => s.questions)
          .find((q) => q.questionId === qCondition)!;
      pick(desired).text = 'Pregunta condicionante (dev)';
      pick(current).text = 'Pregunta condicionante (prod)';
      pick(current).hash = 'hash-cambiado-en-produccion';

      const plan = buildPlan({ base, desired, current });
      expect(plan.conflicts.map((c) => c.type)).toContain('changed_in_target');
    });

    it('Criterio 14 — aplicar es atómico e idempotente, y no toca respuestas', async () => {
      const before = await countResponses(editorSurveyId);
      const desired = structuredClone(base);
      desired.instruments
        .find((i) => i.instrumentId === editorInstrumentId)!
        .sections.flatMap((s) => s.questions)
        .find((q) => q.questionId === qCondition)!.text =
        '¿Pregunta condicionante corregida?';

      const plan = buildPlan({ base, desired, current: base });
      expect(plan.conflicts).toHaveLength(0);
      expect(plan.operations).toEqual([
        expect.objectContaining({
          kind: 'update',
          entity: 'question',
          id: qCondition,
        }),
      ]);

      const result = await applyPlan(ds, plan);
      expect(result.backup).toBeDefined();

      const after = await exportManifest(ds, {
        instrumentIds: [editorInstrumentId, regInstrumentId],
      });
      const replan = buildPlan({ base: after, desired, current: after });
      expect(replan.operations).toHaveLength(0);
      expect(await countResponses(editorSurveyId)).toBe(before);
    });

    it('Criterio 14 — si el destino cambió desde el plan, no aplica nada', async () => {
      const desired = structuredClone(base);
      desired.instruments.find(
        (i) => i.instrumentId === editorInstrumentId,
      )!.name = 'E2E 084 Instrumento Edicion (renombrado)';
      const plan = buildPlan({ base, desired, current: base });

      await ds.query(
        `UPDATE instruments SET name = 'cambio concurrente' WHERE instrument_id = $1`,
        [editorInstrumentId],
      );
      await expect(applyPlan(ds, plan)).rejects.toThrow();
      const rows = await ds.query<{ name: string }[]>(
        `SELECT name FROM instruments WHERE instrument_id = $1`,
        [editorInstrumentId],
      );
      expect(rows[0].name).toBe('cambio concurrente');
    });
  });
  // ── Búsqueda de preguntas (apoyo al criterio 17) ──────────────────────────

  describe('GET /questions/search — detección de redundancias', () => {
    let dupA: string;
    let dupB: string;
    let otherInstrumentId: string;
    const needle = 'Sombrio del cultivo e2e084';

    beforeAll(async () => {
      // La misma pregunta repetida en dos instrumentos: el caso que la
      // depuración necesita encontrar. Una lleva tilde y mayúsculas para
      // comprobar que la búsqueda las ignora.
      dupA = await insertQuestion(editorSectionId, needle, 'open_text', 20);
      otherInstrumentId = await insertInstrument(
        'E2E 084 Instrumento Busqueda',
      );
      searchInstrumentId = otherInstrumentId;
      const otherSectionId = await insertSection(
        otherInstrumentId,
        'E2E 084 Seccion Busqueda',
      );
      dupB = await insertQuestion(
        otherSectionId,
        'SOMBRÍO DEL CULTIVO E2E084',
        'open_text',
        1,
      );
    });

    it('encuentra la misma pregunta en dos instrumentos, ignorando tildes y mayúsculas', async () => {
      const res = await auth(
        http()
          .get('/api/questions/search')
          .query({ q: 'sombrio del cultivo e2e084' }),
      ).expect(200);
      const body = res.body as {
        total: number;
        items: {
          questionId: string;
          instrumentId: string;
          responseCount: number;
        }[];
      };
      const ids = body.items.map((i) => i.questionId);
      expect(ids).toContain(dupA);
      expect(ids).toContain(dupB);
      expect(body.total).toBe(body.items.length);
      const found = body.items.find((i) => i.questionId === dupB);
      expect(found?.instrumentId).toBe(otherInstrumentId);
      expect(found?.responseCount).toBe(0);
    });

    it('instrumentIds acota la búsqueda a un instrumento', async () => {
      const res = await auth(
        http().get('/api/questions/search').query({
          q: 'sombrio del cultivo e2e084',
          instrumentIds: otherInstrumentId,
        }),
      ).expect(200);
      const body = res.body as { items: { questionId: string }[] };
      expect(body.items.map((i) => i.questionId)).toEqual([dupB]);
    });

    it('las archivadas solo aparecen con includeArchived=true', async () => {
      await auth(
        http().patch(
          `/api/sections/${editorSectionId}/questions/${dupA}/archive`,
        ),
      ).expect(200);

      const sinArchivadas = await auth(
        http()
          .get('/api/questions/search')
          .query({ q: 'sombrio del cultivo e2e084' }),
      ).expect(200);
      expect(
        (sinArchivadas.body as { items: { questionId: string }[] }).items.map(
          (i) => i.questionId,
        ),
      ).not.toContain(dupA);

      const conArchivadas = await auth(
        http()
          .get('/api/questions/search')
          .query({ q: 'sombrio del cultivo e2e084', includeArchived: 'true' }),
      ).expect(200);
      const archivada = (
        conArchivadas.body as {
          items: { questionId: string; archivedAt: string | null }[];
        }
      ).items.find((i) => i.questionId === dupA);
      expect(archivada?.archivedAt).toBeTruthy();

      // Se desarchiva para no dejar el estado alterado a los casos siguientes.
      await auth(
        http().patch(
          `/api/sections/${editorSectionId}/questions/${dupA}/unarchive`,
        ),
      ).expect(200);
    });

    it('devuelve el número de respuestas de cada coincidencia', async () => {
      const res = await auth(
        http().get('/api/questions/search').query({ q: 'Pregunta respondida' }),
      ).expect(200);
      const item = (
        res.body as { items: { questionId: string; responseCount: number }[] }
      ).items.find((i) => i.questionId === qAnswered);
      expect(item?.responseCount).toBe(1);
    });

    it('rechaza una búsqueda de menos de 2 caracteres', async () => {
      await auth(http().get('/api/questions/search').query({ q: 'a' })).expect(
        400,
      );
    });

    it('exige autenticación', async () => {
      await http()
        .get('/api/questions/search')
        .query({ q: 'sombrio' })
        .expect(401);
    });
  });
});
