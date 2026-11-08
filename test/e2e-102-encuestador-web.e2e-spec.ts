/**
 * Spec 102 — Flujo del encuestador por productor en la web (H7): endpoints.
 * `spec/102_encuestador_web_por_productor.md` (raíz del ecosistema).
 *
 * ESTAS PRUEBAS NACEN EN ROJO (enfoque test-first): hoy los endpoints de
 * cobertura responden 403 a POLLSTER y `POST /api/consents` exige `sessionId`.
 * Los casos de C6 (ancla de la encuesta) documentan un comportamiento que ya
 * existe desde el spec 95 y sirven de red de seguridad para el flujo web.
 *
 * Criterios cubiertos: C6 (validación de servidor), C12, C13 y C14. La parte
 * unitaria de C12 vive en `src/consents/e2e-102-consent-anchor.spec.ts`.
 *
 * Requiere un documento de consentimiento `published` en la base (lo hay
 * desde el spec 78); si no existe, los casos de consentimiento fallan con 404.
 *
 * ENTORNO: SOLO contra la base de desarrollo (`DATABASE_URL` activa del `.env`,
 * Neon `sosagro-dev`), NUNCA contra producción. Identidades con prefijo
 * `Spec102` / `e2e-102`. Todo se elimina en `afterAll`.
 */

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getOptionsToken } from '@nestjs/throttler';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { AppModule } from '../src/app.module';

jest.setTimeout(120_000);

const TEST_PASSWORD = 'E2eTest1234!';
const PREFIX = 'e2e-102';
const RUN = Date.now().toString().slice(-6);
const MISSING_UUID = '00000000-0000-4000-8000-000000000000';

interface LoginResponse {
  accessToken: string;
}

describe('Spec 102 — encuestador web por productor (e2e)', () => {
  let app: INestApplication<App>;
  let ds: DataSource;
  let adminToken: string;
  let pollsterToken: string;

  // A con finca FA y cultivo CA; B con finca FB y cultivo CB.
  let farmerA: string;
  let farmerB: string;
  let farmA: string;
  let farmB: string;
  let cropA: string;
  let cropB: string;
  let farmInstrument: string;
  const surveyIds: string[] = [];

  const http = () => request(app.getHttpServer());
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  async function ensureUser(role: string): Promise<string> {
    const email = `${PREFIX}-${role}@test.local`;
    const rows = await ds.query<{ user_id: string }[]>(
      `SELECT user_id FROM users WHERE email = $1`,
      [email],
    );
    if (!rows.length) {
      const roles = await ds.query<{ role_id: string }[]>(
        `SELECT role_id FROM roles WHERE name = $1`,
        [role],
      );
      const hash = await bcrypt.hash(TEST_PASSWORD, 10);
      await ds.query(
        `INSERT INTO users (user_id, name, last_name, email, password, role_id, must_change_password)
         VALUES (gen_random_uuid(), 'E2E', 'Spec102', $1, $2, $3, false)`,
        [email, hash, roles[0].role_id],
      );
    }
    const login = await http()
      .post('/api/auth/login')
      .send({ email, password: TEST_PASSWORD })
      .expect(200);
    return (login.body as LoginResponse).accessToken;
  }

  async function insertFarmer(label: string) {
    const [row] = await ds.query<{ id: string }[]>(
      `INSERT INTO farmers (id, name, document_id)
       VALUES (gen_random_uuid(), $1, $2) RETURNING id`,
      [`Spec102 Productor ${label} ${RUN}`, `102${RUN}${label}`],
    );
    return row.id;
  }

  async function insertFarmWithCrop(farmerId: string, label: string) {
    const [farm] = await ds.query<{ farm_id: string }[]>(
      `INSERT INTO farms (farm_id, name) VALUES (gen_random_uuid(), $1)
       RETURNING farm_id`,
      [`Spec102 Finca ${label} ${RUN}`],
    );
    await ds.query(
      `INSERT INTO farmer_farms (farmer_id, farm_id, role, is_primary, source)
       VALUES ($1, $2, 'owner', true, 'e2e-102')`,
      [farmerId, farm.farm_id],
    );
    const [crop] = await ds.query<{ crop_id: string }[]>(
      `SELECT crop_id FROM types_of_crops ORDER BY name LIMIT 1`,
    );
    const [farmCrop] = await ds.query<{ farm_crop_id: string }[]>(
      `INSERT INTO farms_crops (farm_id, crop_id) VALUES ($1, $2)
       RETURNING farm_crop_id`,
      [farm.farm_id, crop.crop_id],
    );
    return { farmId: farm.farm_id, farmCropId: farmCrop.farm_crop_id };
  }

  function createSurvey(token: string, body: Record<string, unknown>) {
    return http().post('/api/surveys').set(auth(token)).send(body);
  }

  function consent(token: string, anchor: Record<string, string>) {
    return http()
      .post('/api/consents')
      .set(auth(token))
      .send({
        ...anchor,
        acceptedDataProcessing: true,
        respondentName: `Spec102 ${RUN}`,
        acceptedAt: new Date().toISOString(),
      });
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(getOptionsToken())
      .useValue([{ ttl: 60_000, limit: 100_000 }])
      .compile();

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

    adminToken = await ensureUser('admin');
    pollsterToken = await ensureUser('pollster');

    farmerA = await insertFarmer('A');
    farmerB = await insertFarmer('B');
    ({ farmId: farmA, farmCropId: cropA } = await insertFarmWithCrop(
      farmerA,
      'A',
    ));
    ({ farmId: farmB, farmCropId: cropB } = await insertFarmWithCrop(
      farmerB,
      'B',
    ));

    const [instrument] = await ds.query<{ instrument_id: string }[]>(
      `INSERT INTO instruments (instrument_id, name, version, publish_date, is_active, scope_level)
       VALUES (gen_random_uuid(), $1, 1, now()::date, true, 'farm_crop')
       RETURNING instrument_id`,
      [`Spec102 Por cultivo ${RUN}`],
    );
    farmInstrument = instrument.instrument_id;
  });

  afterAll(async () => {
    const safe = async (sql: string, params: unknown[] = []) => {
      try {
        await ds.query(sql, params);
      } catch {
        /* limpieza tolerante */
      }
    };
    const farmers = [farmerA, farmerB].filter(Boolean);
    const farms = [farmA, farmB].filter(Boolean);
    await safe(
      `DELETE FROM consent_records
        WHERE farmer_id = ANY($1::uuid[]) OR survey_id = ANY($2::uuid[])`,
      [farmers, surveyIds],
    );
    await safe(
      `DELETE FROM surveys_instruments WHERE survey_id = ANY($1::uuid[])`,
      [surveyIds],
    );
    await safe(`DELETE FROM surveys WHERE survey_id = ANY($1::uuid[])`, [
      surveyIds,
    ]);
    await safe(`DELETE FROM farms_crops WHERE farm_id = ANY($1::uuid[])`, [
      farms,
    ]);
    await safe(`DELETE FROM farmer_farms WHERE farmer_id = ANY($1::uuid[])`, [
      farmers,
    ]);
    await safe(`DELETE FROM farms WHERE farm_id = ANY($1::uuid[])`, [farms]);
    await safe(`DELETE FROM farmers WHERE id = ANY($1::uuid[])`, [farmers]);
    await safe(`DELETE FROM instruments WHERE instrument_id = $1`, [
      farmInstrument,
    ]);
    await safe(`DELETE FROM users WHERE email LIKE $1`, [`${PREFIX}-%`]);
    await app.close();
  });

  describe('C14 — permisos del POLLSTER', () => {
    it('obtiene 200 en la cobertura del productor y en la lista', async () => {
      await http()
        .get(`/api/farmers/${farmerA}/coverage`)
        .set(auth(pollsterToken))
        .expect(200);
      await http()
        .get('/api/coverage/farmers')
        .set(auth(pollsterToken))
        .expect(200);
    });

    it('sigue recibiendo 403 en discrepancias y en el detalle del productor', async () => {
      await http()
        .get(`/api/farmers/${farmerA}/discrepancies`)
        .set(auth(pollsterToken))
        .expect(403);
      await http()
        .get(`/api/farmers/${farmerA}`)
        .set(auth(pollsterToken))
        .expect(403);
    });
  });

  describe('C6 — ancla de la encuesta creada por el POLLSTER', () => {
    it('crea la encuesta con productor, finca y cultivo de finca', async () => {
      const res = await createSurvey(pollsterToken, {
        instrumentIds: [farmInstrument],
        farmerId: farmerA,
        farmId: farmA,
        farmCropId: cropA,
      }).expect(201);
      const surveyId = (res.body as { surveyId: string }).surveyId;
      surveyIds.push(surveyId);
      const [row] = await ds.query<
        { farmer_id: string; farm_id: string; farm_crop_id: string }[]
      >(
        `SELECT farmer_id, farm_id, farm_crop_id FROM surveys WHERE survey_id = $1`,
        [surveyId],
      );
      expect(row).toEqual({
        farmer_id: farmerA,
        farm_id: farmA,
        farm_crop_id: cropA,
      });
    });

    it('rechaza un cultivo de otra finca con 400', async () => {
      await createSurvey(pollsterToken, {
        instrumentIds: [farmInstrument],
        farmerId: farmerA,
        farmId: farmA,
        farmCropId: cropB,
      }).expect(400);
    });

    it('rechaza una finca de otro productor con 400', async () => {
      await createSurvey(pollsterToken, {
        instrumentIds: [farmInstrument],
        farmerId: farmerA,
        farmId: farmB,
      }).expect(400);
    });
  });

  describe('C12 — POST /api/consents con ancla sin sesión', () => {
    it('sin ancla, o con dos, responde 400', async () => {
      await consent(pollsterToken, {}).expect(400);
      await consent(pollsterToken, {
        farmerId: farmerA,
        surveyId: MISSING_UUID,
      }).expect(400);
    });

    it('productor o encuesta inexistentes responden 404', async () => {
      await consent(pollsterToken, { farmerId: MISSING_UUID }).expect(404);
      await consent(pollsterToken, { surveyId: MISSING_UUID }).expect(404);
    });

    it('por productor: 201 la primera vez y 200 con la misma constancia al reintentar', async () => {
      const first = await consent(pollsterToken, { farmerId: farmerA }).expect(
        201,
      );
      const again = await consent(pollsterToken, { farmerId: farmerA }).expect(
        200,
      );
      const id = (b: unknown) =>
        (b as { consentRecordId: string }).consentRecordId;
      expect(id(again.body)).toBe(id(first.body));

      const [row] = await ds.query<
        { farmer_id: string; session_id: string | null }[]
      >(
        `SELECT farmer_id, session_id FROM consent_records WHERE consent_record_id = $1`,
        [id(first.body)],
      );
      expect(row).toEqual({ farmer_id: farmerA, session_id: null });
    });

    it('una constancia revocada no cuenta para la idempotencia', async () => {
      await ds.query(
        `UPDATE consent_records SET revoked_at = now(), revoked_reason = 'e2e-102'
          WHERE farmer_id = $1 AND revoked_at IS NULL`,
        [farmerA],
      );
      await consent(pollsterToken, { farmerId: farmerA }).expect(201);
    });

    it('C13 — por encuesta: queda vinculada al productor de esa encuesta', async () => {
      const res = await createSurvey(pollsterToken, {
        instrumentIds: [farmInstrument],
        farmerId: farmerB,
        farmId: farmB,
        farmCropId: cropB,
      }).expect(201);
      const surveyId = (res.body as { surveyId: string }).surveyId;
      surveyIds.push(surveyId);

      const created = await consent(pollsterToken, { surveyId }).expect(201);
      const [row] = await ds.query<
        { farmer_id: string | null; survey_id: string }[]
      >(
        `SELECT farmer_id, survey_id FROM consent_records WHERE consent_record_id = $1`,
        [(created.body as { consentRecordId: string }).consentRecordId],
      );
      expect(row).toEqual({ farmer_id: farmerB, survey_id: surveyId });

      await consent(pollsterToken, { surveyId }).expect(200);
    });

    it('ADMIN también puede registrar por productor', async () => {
      await consent(adminToken, { farmerId: farmerB }).expect(201);
    });
  });
});
