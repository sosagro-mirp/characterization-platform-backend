/**
 * Spec 68 — Colisión de `documentId` entre agricultores distintos.
 *
 * Escrito ANTES de la implementación (enfoque test-first). **Arranca en rojo**:
 * hoy `SurveysService.extractFarmer()` deduplica por `documentId` sin comparar
 * el nombre ("Level 1: dedup by documentId (solid)"), así que la segunda
 * extracción responde 201 reutilizando al agricultor equivocado en vez de 409.
 *
 * Cubre los criterios de aceptación 1–7 y 13 de
 * `spec/68_colision_documentid_entre_agricultores.md`.
 *
 * Contrato bajo prueba (propuesto por el spec, Fase 2):
 *   POST /api/surveys/:id/extract-farmer
 *     body vacío  → 409 si el documento pertenece a otra persona (sin mutar nada)
 *     body { resolution: 'same_person' }     → reutiliza el agricultor existente
 *     body { resolution: 'separate_person' } → crea un agricultor nuevo con el mismo documento
 *   GET /api/farmers/document-collisions (admin) → colisiones registradas
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
const PREFIX = 'e2e-068';

/** Documentos reservados para esta suite. No reutilizar en otras. */
const DOC_COLLISION = '9068000001';
const DOC_SAME_PERSON = '9068000002';
const DOC_SEPARATE = '9068000003';
const DOC_BATTERY = '9068000004';

const NAME_P1 = 'Santiago Suarez Cortes';
const NAME_P2 = 'Karol Vanessa Quintero Marin';

interface LoginResponse {
  accessToken: string;
}

interface RoleRow {
  role_id: string;
  name: string;
}

interface FarmerBody {
  id?: string;
  farmerId?: string;
  name: string;
  documentId: string | null;
}

interface ExtractFarmerBody {
  farmer: FarmerBody;
  existed: boolean;
}

interface CollisionConflictBody {
  documentId?: string;
  existingFarmer?: { farmerId?: string; id?: string; name?: string };
  submittedName?: string;
  message?: string;
}

interface CollisionRecord {
  documentId: string;
  submittedName: string;
  existingFarmer?: { farmerId?: string; id?: string; name?: string };
  resolution: string | null;
}

function testEmail(role: string) {
  return `${PREFIX}-${role}@test.local`;
}

function farmerIdOf(farmer: FarmerBody): string {
  return farmer.farmerId ?? farmer.id ?? '';
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

describe('Spec 68 — Colisión de documentId entre agricultores (e2e)', () => {
  let app: INestApplication<App>;
  let ds: DataSource;

  let pollsterToken: string;
  let adminToken: string;

  let instrumentId: string;
  let sectionId: string;
  let questionNameId: string;
  let questionDocumentId: string;

  const surveyIdsCreated: string[] = [];
  const documentsUsed: string[] = [
    DOC_COLLISION,
    DOC_SAME_PERSON,
    DOC_SEPARATE,
    DOC_BATTERY,
  ];

  async function createSurvey(): Promise<string> {
    const result = await ds.query<{ survey_id: string }[]>(
      `INSERT INTO surveys (survey_id, sincronized) VALUES (gen_random_uuid(), false) RETURNING survey_id`,
    );
    const surveyId = result[0].survey_id;
    surveyIdsCreated.push(surveyId);
    return surveyId;
  }

  /** Crea una encuesta S1a-like con nombre + documento ya respondidos. */
  async function createIdentificationSurvey(
    name: string,
    documentId: string,
  ): Promise<string> {
    const surveyId = await createSurvey();
    await request(app.getHttpServer())
      .post('/api/responses/batch')
      .set('Authorization', `Bearer ${pollsterToken}`)
      .send([
        { surveyId, questionId: questionNameId, textValue: name },
        { surveyId, questionId: questionDocumentId, textValue: documentId },
      ])
      .expect(201);
    return surveyId;
  }

  function extractFarmer(surveyId: string, body: object = {}) {
    return request(app.getHttpServer())
      .post(`/api/surveys/${surveyId}/extract-farmer`)
      .set('Authorization', `Bearer ${pollsterToken}`)
      .send(body);
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
      `SELECT role_id, name FROM roles WHERE name IN ('pollster', 'admin')`,
    );
    const roleId = (name: string) =>
      roles.find((r) => r.name === name)!.role_id;
    const hash = await bcrypt.hash(TEST_PASSWORD, 10);

    for (const role of ['pollster', 'admin'] as const) {
      const email = testEmail(role);
      const existing = await ds.query<{ user_id: string }[]>(
        `SELECT user_id FROM users WHERE email = $1`,
        [email],
      );
      if (!existing.length) {
        await ds.query(
          `INSERT INTO users (user_id, name, last_name, email, password, role_id, must_change_password)
           VALUES (gen_random_uuid(), 'E2E', 'Spec68', $1, $2, $3, false)`,
          [email, hash, roleId(role)],
        );
      }
    }
    pollsterToken = await loginAs(app, testEmail('pollster'));
    adminToken = await loginAs(app, testEmail('admin'));

    // ── instrumento S1a-like: nombre + documento con systemField ─────────────
    const instrumentResult = await ds.query<{ instrument_id: string }[]>(
      `INSERT INTO instruments (instrument_id, name, version, publish_date, is_active)
       VALUES (gen_random_uuid(), 'E2E 068 Identificación', 1, CURRENT_DATE, true)
       RETURNING instrument_id`,
    );
    instrumentId = instrumentResult[0].instrument_id;

    const sectionResult = await ds.query<{ section_id: string }[]>(
      `INSERT INTO sections (section_id, name, "order", instrument_id)
       VALUES (gen_random_uuid(), 'E2E 068 Sección', 1, $1)
       RETURNING section_id`,
      [instrumentId],
    );
    sectionId = sectionResult[0].section_id;

    const typeRows = await ds.query<{ type_id: string; name: string }[]>(
      `SELECT type_id, name FROM types_of_questions WHERE name = 'open_text'`,
    );
    const openTextTypeId = typeRows[0].type_id;

    const qName = await ds.query<{ question_id: string }[]>(
      `INSERT INTO questions (question_id, section_id, text, type_id, is_required, "order", system_field)
       VALUES (gen_random_uuid(), $1, 'E2E 068 Nombre completo', $2, true, 1, 'farmer.name')
       RETURNING question_id`,
      [sectionId, openTextTypeId],
    );
    questionNameId = qName[0].question_id;

    const qDoc = await ds.query<{ question_id: string }[]>(
      `INSERT INTO questions (question_id, section_id, text, type_id, is_required, "order", system_field)
       VALUES (gen_random_uuid(), $1, 'E2E 068 Documento de identidad', $2, true, 2, 'farmer.documentId')
       RETURNING question_id`,
      [sectionId, openTextTypeId],
    );
    questionDocumentId = qDoc[0].question_id;
  }, 60_000);

  afterAll(async () => {
    // Registro de colisiones (tabla propuesta por el spec — puede no existir aún).
    try {
      await ds.query(
        `DELETE FROM farmer_document_collisions WHERE document_id = ANY($1::varchar[])`,
        [documentsUsed],
      );
    } catch {
      // La tabla todavía no existe mientras el spec está sin implementar.
    }

    if (surveyIdsCreated.length) {
      await ds.query(
        `DELETE FROM responses WHERE survey_id = ANY($1::uuid[])`,
        [surveyIdsCreated],
      );
      await ds.query(`DELETE FROM surveys WHERE survey_id = ANY($1::uuid[])`, [
        surveyIdsCreated,
      ]);
    }
    await ds.query(
      `DELETE FROM farmers WHERE document_id = ANY($1::varchar[])`,
      [documentsUsed],
    );
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
  }, 30_000);

  // ── criterios 1, 2 y 3 ────────────────────────────────────────────────────

  describe('Detección de la colisión', () => {
    let existingFarmerId: string;

    beforeAll(async () => {
      // El titular real del documento — equivale a la tablet 1 del piloto.
      const surveyP1 = await createIdentificationSurvey(NAME_P1, DOC_COLLISION);
      const res = await extractFarmer(surveyP1).expect(201);
      const body = res.body as ExtractFarmerBody;
      existingFarmerId = farmerIdOf(body.farmer);
      expect(existingFarmerId).not.toBe('');
      expect(body.existed).toBe(false);
    });

    // Criterios 1 y 2
    it('responde 409 cuando el documento ya pertenece a una persona con otro nombre', async () => {
      const surveyP2 = await createIdentificationSurvey(NAME_P2, DOC_COLLISION);

      const res = await extractFarmer(surveyP2).expect(409);
      const body = res.body as CollisionConflictBody;

      expect(body.documentId).toBe(DOC_COLLISION);
      expect(body.submittedName).toBe(NAME_P2);
      expect(body.existingFarmer?.name).toBe(NAME_P1);
      expect(body.existingFarmer?.farmerId ?? body.existingFarmer?.id).toBe(
        existingFarmerId,
      );
    });

    // Criterio 3 — el 409 no puede dejar rastro en la base.
    it('el 409 no crea ni modifica ningún agricultor', async () => {
      const before = await ds.query<{ count: string }[]>(
        `SELECT COUNT(*)::text AS count FROM farmers WHERE document_id = $1`,
        [DOC_COLLISION],
      );

      const surveyP2 = await createIdentificationSurvey(NAME_P2, DOC_COLLISION);
      await extractFarmer(surveyP2).expect(409);

      const after = await ds.query<{ count: string }[]>(
        `SELECT COUNT(*)::text AS count FROM farmers WHERE document_id = $1`,
        [DOC_COLLISION],
      );
      expect(after[0].count).toBe(before[0].count);

      const existing = await ds.query<{ name: string }[]>(
        `SELECT name FROM farmers WHERE id = $1`,
        [existingFarmerId],
      );
      expect(existing[0].name).toBe(NAME_P1);
    });

    // El agricultor "absorbido" no debe desaparecer del sistema sin aviso:
    // este es el síntoma exacto verificado en producción el 2026-08-12.
    it('la encuesta en conflicto no queda asociada al agricultor existente', async () => {
      const surveyP2 = await createIdentificationSurvey(NAME_P2, DOC_COLLISION);
      await extractFarmer(surveyP2).expect(409);

      const rows = await ds.query<{ farmer_id: string | null }[]>(
        `SELECT farmer_id FROM surveys WHERE survey_id = $1`,
        [surveyP2],
      );
      expect(rows[0].farmer_id).toBeNull();
    });
  });

  // ── criterio 4 ────────────────────────────────────────────────────────────

  describe("Resolución 'same_person'", () => {
    it('reutiliza el agricultor existente cuando el encuestador confirma que es la misma persona', async () => {
      const surveyP1 = await createIdentificationSurvey(
        NAME_P1,
        DOC_SAME_PERSON,
      );
      const first = await extractFarmer(surveyP1).expect(201);
      const originalId = farmerIdOf((first.body as ExtractFarmerBody).farmer);

      const surveyP2 = await createIdentificationSurvey(
        NAME_P2,
        DOC_SAME_PERSON,
      );
      await extractFarmer(surveyP2).expect(409);

      const res = await extractFarmer(surveyP2, {
        resolution: 'same_person',
      }).expect(201);
      const body = res.body as ExtractFarmerBody;

      expect(farmerIdOf(body.farmer)).toBe(originalId);
      expect(body.existed).toBe(true);

      const rows = await ds.query<{ count: string }[]>(
        `SELECT COUNT(*)::text AS count FROM farmers WHERE document_id = $1`,
        [DOC_SAME_PERSON],
      );
      expect(rows[0].count).toBe('1');
    });
  });

  // ── criterio 5 ────────────────────────────────────────────────────────────

  describe("Resolución 'separate_person'", () => {
    it('crea un agricultor nuevo con el mismo documento y conserva intacto el existente', async () => {
      const surveyP1 = await createIdentificationSurvey(NAME_P1, DOC_SEPARATE);
      const first = await extractFarmer(surveyP1).expect(201);
      const originalId = farmerIdOf((first.body as ExtractFarmerBody).farmer);

      const surveyP2 = await createIdentificationSurvey(NAME_P2, DOC_SEPARATE);
      await extractFarmer(surveyP2).expect(409);

      const res = await extractFarmer(surveyP2, {
        resolution: 'separate_person',
      }).expect(201);
      const body = res.body as ExtractFarmerBody;

      expect(farmerIdOf(body.farmer)).not.toBe(originalId);
      expect(body.farmer.name).toBe(NAME_P2);
      expect(body.existed).toBe(false);

      const rows = await ds.query<{ id: string; name: string }[]>(
        `SELECT id, name FROM farmers WHERE document_id = $1 ORDER BY created_at ASC`,
        [DOC_SEPARATE],
      );
      expect(rows).toHaveLength(2);
      expect(rows[0].name).toBe(NAME_P1);
      expect(rows[1].name).toBe(NAME_P2);
    });
  });

  // ── criterios 6 y 7: la batería de nombres del spec ───────────────────────

  describe('Batería de nombres — cuándo avisar y cuándo no', () => {
    const REGISTERED = 'Santiago Suarez Cortes';

    // Fuente de verdad: § "Batería de casos de nombres" del spec 68.
    const cases: { label: string; submitted: string; shouldWarn: boolean }[] = [
      {
        label: 'idéntico',
        submitted: 'Santiago Suarez Cortes',
        shouldWarn: false,
      },
      {
        label: 'mayúsculas y sin tildes',
        submitted: 'SANTIAGO SUAREZ CORTES',
        shouldWarn: false,
      },
      {
        label: 'con tildes',
        submitted: 'Santiago Suárez Cortés',
        shouldWarn: false,
      },
      {
        label: 'espacios repetidos',
        submitted: 'Santiago  Suarez   Cortes',
        shouldWarn: false,
      },
      {
        label: 'apellido omitido',
        submitted: 'Santiago Suarez',
        shouldWarn: false,
      },
      {
        label: 'error de tipeo',
        submitted: 'Santigo Suarez Cortes',
        shouldWarn: false,
      },
      {
        label: 'primer nombre + un apellido',
        submitted: 'Santiago Suarez Marin',
        shouldWarn: false,
      },
      {
        label: 'puntuación',
        submitted: 'Santiago Suarez Cortes.',
        shouldWarn: false,
      },
      {
        label: 'otro primer nombre',
        submitted: 'Maria Suarez Cortes',
        shouldWarn: true,
      },
      {
        label: 'ningún apellido en común',
        submitted: 'Santiago Quintero Marin',
        shouldWarn: true,
      },
      { label: 'persona distinta', submitted: NAME_P2, shouldWarn: true },
    ];

    beforeAll(async () => {
      const survey = await createIdentificationSurvey(REGISTERED, DOC_BATTERY);
      await extractFarmer(survey).expect(201);
    });

    it.each(cases)('$label → $submitted', async ({ submitted, shouldWarn }) => {
      const survey = await createIdentificationSurvey(submitted, DOC_BATTERY);
      const res = await extractFarmer(survey);

      if (shouldWarn) {
        expect(res.status).toBe(409);
      } else {
        // Sin aviso: reutiliza al titular del documento, como hasta hoy.
        expect(res.status).toBe(201);
        expect((res.body as ExtractFarmerBody).existed).toBe(true);
      }
    });
  });

  // ── criterio 13 ───────────────────────────────────────────────────────────

  describe('Registro auditable de colisiones', () => {
    it('un administrador puede listar las colisiones detectadas y su resolución', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/farmers/document-collisions')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const rows = res.body as CollisionRecord[];
      expect(Array.isArray(rows)).toBe(true);

      const collision = rows.find(
        (r) => r.documentId === DOC_COLLISION && r.submittedName === NAME_P2,
      );
      expect(collision).toBeDefined();

      const sameP = rows.find((r) => r.documentId === DOC_SAME_PERSON);
      expect(sameP?.resolution).toBe('same_person');

      const separate = rows.find((r) => r.documentId === DOC_SEPARATE);
      expect(separate?.resolution).toBe('separate_person');
    });

    it('la ruta de colisiones no colisiona con GET /api/farmers/:id', async () => {
      // `document-collisions` debe declararse antes de `@Get(':id')`, igual que
      // `search`; si no, el ParseUUIDPipe de `:id` responde 400.
      const res = await request(app.getHttpServer())
        .get('/api/farmers/document-collisions')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).not.toBe(400);
    });
  });
});
