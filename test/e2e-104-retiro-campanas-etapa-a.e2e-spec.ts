/**
 * Spec 104 — Retiro de campañas (H8), etapa A «congelar»: endpoints y esquema.
 * `spec/104_retiro_de_campanas.md` (raíz del ecosistema).
 *
 * ESTAS PRUEBAS NACEN EN ROJO (enfoque test-first). Hoy:
 *   - las escrituras de campañas, pasos y condiciones responden 201/200/400;
 *   - las FK `surveys.campaign_session_id` y `campaign_sessions.campaign_id`
 *     son CASCADE;
 *   - `surveys.legacy_campaign_name` no existe;
 *   - no hay cabecera `Deprecation`.
 *
 * Criterios cubiertos: C1, C2, C3, C4 y C5. C6 (conteos antes y después de la
 * migración) lo verifica `pnpm spec104:verify` en la Fase 1.
 *
 * ── Contrato ────────────────────────────────────────────────────────────────
 *   - POST/PATCH/DELETE de `/campaigns`, `/campaigns/:id/steps[/:stepId]` y
 *     `/campaigns/:id/steps/:stepId/conditions[/:conditionId]` → 410 con
 *     `body.code === 'CAMPAIGNS_RETIRED'`. El retiro se evalúa ANTES de
 *     validar el cuerpo: un cuerpo vacío también da 410, no 400.
 *   - GET de campañas: sin cambios (200), con cabecera `Deprecation: true`.
 *   - `GET /surveys/mine` → `items[].campaignName`, y `GET /surveys?farmerId`
 *     → `[].campaignName` (string | null), los dos desde
 *     `surveys.legacy_campaign_name`.
 *   - `POST /surveys` con `campaignSessionId` copia el nombre de la campaña.
 *
 * ENTORNO: SOLO contra la base de desarrollo (`DATABASE_URL` activa del `.env`,
 * Neon `sosagro-dev`), NUNCA contra producción. Identidades con prefijo
 * `Spec104` / `e2e-104`. Todo se elimina en `afterAll`.
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
const PREFIX = 'e2e-104';
const RUN = Date.now().toString().slice(-6);
const MISSING_UUID = '00000000-0000-4000-8000-000000000000';
const CAMPAIGN_NAME = `Spec104 Campaña ${RUN}`;

interface LoginResponse {
  accessToken: string;
}

describe('Spec 104 — retiro de campañas, etapa A (e2e)', () => {
  let app: INestApplication<App>;
  let ds: DataSource;
  let adminToken: string;

  let farmerId: string;
  let farmId: string;
  let farmCropId: string;
  let instrumentId: string;
  let campaignId: string;
  let sessionId: string;
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
         VALUES (gen_random_uuid(), 'E2E', 'Spec104', $1, $2, $3, false)`,
        [email, hash, roles[0].role_id],
      );
    }
    const login = await http()
      .post('/api/auth/login')
      .send({ email, password: TEST_PASSWORD })
      .expect(200);
    return (login.body as LoginResponse).accessToken;
  }

  function expectRetired(res: request.Response, label: string) {
    expect({ label, status: res.status }).toEqual({ label, status: 410 });
    expect((res.body as { code?: string }).code).toBe('CAMPAIGNS_RETIRED');
  }

  async function deleteRule(table: string, column: string): Promise<string> {
    const rows = await ds.query<{ delete_rule: string }[]>(
      `SELECT rc.delete_rule
         FROM information_schema.referential_constraints rc
         JOIN information_schema.key_column_usage kcu
           ON kcu.constraint_name = rc.constraint_name
          AND kcu.constraint_schema = rc.constraint_schema
        WHERE kcu.table_name = $1 AND kcu.column_name = $2`,
      [table, column],
    );
    return rows[0]?.delete_rule ?? 'NONE';
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

    const [farmer] = await ds.query<{ id: string }[]>(
      `INSERT INTO farmers (id, name, document_id)
       VALUES (gen_random_uuid(), $1, $2) RETURNING id`,
      [`Spec104 Productor ${RUN}`, `104${RUN}`],
    );
    farmerId = farmer.id;

    const [farm] = await ds.query<{ farm_id: string }[]>(
      `INSERT INTO farms (farm_id, name) VALUES (gen_random_uuid(), $1)
       RETURNING farm_id`,
      [`Spec104 Finca ${RUN}`],
    );
    farmId = farm.farm_id;
    await ds.query(
      `INSERT INTO farmer_farms (farmer_id, farm_id, role, is_primary, source)
       VALUES ($1, $2, 'owner', true, 'e2e-104')`,
      [farmerId, farmId],
    );
    const [crop] = await ds.query<{ crop_id: string }[]>(
      `SELECT crop_id FROM types_of_crops ORDER BY name LIMIT 1`,
    );
    const [farmCrop] = await ds.query<{ farm_crop_id: string }[]>(
      `INSERT INTO farms_crops (farm_id, crop_id) VALUES ($1, $2)
       RETURNING farm_crop_id`,
      [farmId, crop.crop_id],
    );
    farmCropId = farmCrop.farm_crop_id;

    const [instrument] = await ds.query<{ instrument_id: string }[]>(
      `INSERT INTO instruments (instrument_id, name, version, publish_date, is_active, scope_level)
       VALUES (gen_random_uuid(), $1, 1, now()::date, true, 'farmer')
       RETURNING instrument_id`,
      [`Spec104 Instrumento ${RUN}`],
    );
    instrumentId = instrument.instrument_id;

    // Desde la etapa A las campañas no se crean por API: se siembran por SQL.
    const [campaign] = await ds.query<{ campaign_id: string }[]>(
      `INSERT INTO campaigns (campaign_id, name) VALUES (gen_random_uuid(), $1)
       RETURNING campaign_id`,
      [CAMPAIGN_NAME],
    );
    campaignId = campaign.campaign_id;
    const [session] = await ds.query<{ session_id: string }[]>(
      `INSERT INTO campaign_sessions (session_id, campaign_id, farmer_id)
       VALUES (gen_random_uuid(), $1, $2) RETURNING session_id`,
      [campaignId, farmerId],
    );
    sessionId = session.session_id;
  });

  afterAll(async () => {
    const safe = async (sql: string, params: unknown[] = []) => {
      try {
        await ds.query(sql, params);
      } catch {
        /* limpieza tolerante */
      }
    };
    // Con RESTRICT el orden importa: encuestas → sesiones → campaña.
    await safe(`DELETE FROM responses WHERE survey_id = ANY($1::uuid[])`, [
      surveyIds,
    ]);
    await safe(
      `DELETE FROM surveys_instruments WHERE survey_id = ANY($1::uuid[])`,
      [surveyIds],
    );
    await safe(`DELETE FROM surveys WHERE survey_id = ANY($1::uuid[])`, [
      surveyIds,
    ]);
    await safe(`DELETE FROM campaign_sessions WHERE campaign_id = $1`, [
      campaignId,
    ]);
    await safe(`DELETE FROM campaigns WHERE campaign_id = $1`, [campaignId]);
    await safe(`DELETE FROM instruments WHERE instrument_id = $1`, [
      instrumentId,
    ]);
    await safe(`DELETE FROM farms_crops WHERE farm_id = $1`, [farmId]);
    await safe(`DELETE FROM farmer_farms WHERE farmer_id = $1`, [farmerId]);
    await safe(`DELETE FROM farms WHERE farm_id = $1`, [farmId]);
    await safe(`DELETE FROM farmers WHERE id = $1`, [farmerId]);
    await app.close();
  });

  // ── C1 ──────────────────────────────────────────────────────────────────
  describe('C1 — escrituras de configuración retiradas (410)', () => {
    it('POST /campaigns → 410, aunque el cuerpo sea válido', async () => {
      const res = await http()
        .post('/api/campaigns')
        .set(auth(adminToken))
        .send({ name: `Spec104 Nueva ${RUN}` });
      expectRetired(res, 'POST /campaigns');
    });

    it('PATCH y DELETE /campaigns/:id → 410 y la campaña no cambia', async () => {
      expectRetired(
        await http()
          .patch(`/api/campaigns/${campaignId}`)
          .set(auth(adminToken))
          .send({ name: 'cambiado' }),
        'PATCH /campaigns/:id',
      );
      expectRetired(
        await http()
          .delete(`/api/campaigns/${campaignId}`)
          .set(auth(adminToken)),
        'DELETE /campaigns/:id',
      );
      const [row] = await ds.query<{ name: string }[]>(
        `SELECT name FROM campaigns WHERE campaign_id = $1`,
        [campaignId],
      );
      expect(row?.name).toBe(CAMPAIGN_NAME);
    });

    it('pasos y condiciones: POST/PATCH/DELETE → 410, antes de validar el cuerpo', async () => {
      const base = `/api/campaigns/${campaignId}/steps`;
      const cond = `${base}/${MISSING_UUID}/conditions`;
      const cases: [string, () => request.Test][] = [
        ['POST steps', () => http().post(base).set(auth(adminToken)).send({})],
        [
          'PATCH steps/:id',
          () =>
            http()
              .patch(`${base}/${MISSING_UUID}`)
              .set(auth(adminToken))
              .send({}),
        ],
        [
          'DELETE steps/:id',
          () => http().delete(`${base}/${MISSING_UUID}`).set(auth(adminToken)),
        ],
        [
          'POST conditions',
          () => http().post(cond).set(auth(adminToken)).send({}),
        ],
        [
          'PATCH conditions/:id',
          () =>
            http()
              .patch(`${cond}/${MISSING_UUID}`)
              .set(auth(adminToken))
              .send({}),
        ],
        [
          'DELETE conditions/:id',
          () => http().delete(`${cond}/${MISSING_UUID}`).set(auth(adminToken)),
        ],
      ];
      for (const [label, req] of cases) {
        expectRetired(await req(), label);
      }
    });

    it('las lecturas siguen respondiendo 200', async () => {
      await http().get('/api/campaigns').set(auth(adminToken)).expect(200);
      await http()
        .get(`/api/campaigns/${campaignId}`)
        .set(auth(adminToken))
        .expect(200);
      await http().get('/api/campaigns/active').expect(200);
      await http().get(`/api/campaigns/${campaignId}/render`).expect(200);
    });
  });

  // ── C2 ──────────────────────────────────────────────────────────────────
  describe('C2 — sin borrados en cascada', () => {
    it('las FK de encuestas y sesiones son RESTRICT', async () => {
      expect(await deleteRule('surveys', 'campaign_session_id')).toBe(
        'RESTRICT',
      );
      expect(await deleteRule('campaign_sessions', 'campaign_id')).toBe(
        'RESTRICT',
      );
    });
  });

  // ── C3 y C4 ─────────────────────────────────────────────────────────────
  describe('C3/C4 — campaña de origen en las encuestas', () => {
    let campaignSurveyId: string;
    let anchoredSurveyId: string;

    beforeAll(async () => {
      const viaSession = await http()
        .post('/api/surveys')
        .set(auth(adminToken))
        .send({ instrumentIds: [instrumentId], campaignSessionId: sessionId })
        .expect(201);
      campaignSurveyId = (viaSession.body as { surveyId: string }).surveyId;
      surveyIds.push(campaignSurveyId);

      const anchored = await http()
        .post('/api/surveys')
        .set(auth(adminToken))
        .send({ instrumentIds: [instrumentId], farmerId, farmId, farmCropId })
        .expect(201);
      anchoredSurveyId = (anchored.body as { surveyId: string }).surveyId;
      surveyIds.push(anchoredSurveyId);
    });

    it('C4 — POST /surveys con campaignSessionId hereda el productor y copia la campaña', async () => {
      const [row] = await ds.query<
        { farmer_id: string | null; legacy_campaign_name: string | null }[]
      >(
        `SELECT farmer_id, legacy_campaign_name FROM surveys WHERE survey_id = $1`,
        [campaignSurveyId],
      );
      expect(row.farmer_id).toBe(farmerId);
      expect(row.legacy_campaign_name).toBe(CAMPAIGN_NAME);
    });

    it('C3 — no queda ninguna encuesta con sesión y sin legacy_campaign_name', async () => {
      const [row] = await ds.query<{ n: string }[]>(
        `SELECT count(*)::text AS n FROM surveys
          WHERE campaign_session_id IS NOT NULL AND legacy_campaign_name IS NULL`,
      );
      expect(row.n).toBe('0');
    });

    it('C3 — GET /surveys?farmerId devuelve campaignName (string | null)', async () => {
      const res = await http()
        .get('/api/surveys')
        .query({ farmerId })
        .set(auth(adminToken))
        .expect(200);
      const rows = res.body as { surveyId: string; campaignName?: unknown }[];
      const byId = new Map(rows.map((r) => [r.surveyId, r]));
      expect(byId.get(campaignSurveyId)?.campaignName).toBe(CAMPAIGN_NAME);
      expect(byId.get(anchoredSurveyId)).toHaveProperty('campaignName', null);
    });

    it('C3 — GET /surveys/mine lee campaignName aunque la campaña cambie de nombre', async () => {
      // La fuente es la columna desnormalizada, no la tabla viva.
      // `/surveys/mine` solo lista encuestas con al menos una respuesta.
      await ds.query(
        `INSERT INTO responses (survey_id, question_id, text_value)
         SELECT s.id, (SELECT question_id FROM questions LIMIT 1), 'e2e-104'
           FROM unnest($1::uuid[]) AS s(id)`,
        [[campaignSurveyId, anchoredSurveyId]],
      );
      await ds.query(`UPDATE campaigns SET name = $2 WHERE campaign_id = $1`, [
        campaignId,
        `${CAMPAIGN_NAME} (renombrada)`,
      ]);
      try {
        const res = await http()
          .get('/api/surveys/mine')
          .query({ limit: 50 })
          .set(auth(adminToken))
          .expect(200);
        const items = (
          res.body as {
            items: { surveyId: string; campaignName: string | null }[];
          }
        ).items;
        const byId = new Map(items.map((i) => [i.surveyId, i]));
        expect(byId.get(campaignSurveyId)?.campaignName).toBe(CAMPAIGN_NAME);
        expect(byId.get(anchoredSurveyId)?.campaignName).toBeNull();
      } finally {
        await ds.query(
          `UPDATE campaigns SET name = $2 WHERE campaign_id = $1`,
          [campaignId, CAMPAIGN_NAME],
        );
      }
    });

    it('C2 — DELETE /campaign-sessions/:id con encuestas → 409 y no borra nada', async () => {
      await http()
        .delete(`/api/campaign-sessions/${sessionId}`)
        .set(auth(adminToken))
        .expect(409);
      const [row] = await ds.query<{ n: string }[]>(
        `SELECT count(*)::text AS n FROM surveys WHERE campaign_session_id = $1`,
        [sessionId],
      );
      expect(row.n).toBe('1');
    });
  });

  // ── C5 ──────────────────────────────────────────────────────────────────
  describe('C5 — telemetría de uso heredado', () => {
    it('los endpoints de campañas y sesiones llevan Deprecation: true', async () => {
      const active = await http().get('/api/campaigns/active').expect(200);
      expect(active.headers['deprecation']).toBe('true');

      const session = await http()
        .get(`/api/campaign-sessions/${sessionId}`)
        .set(auth(adminToken));
      expect(session.headers['deprecation']).toBe('true');
    });

    it('los endpoints del flujo por productor no llevan la cabecera', async () => {
      const res = await http()
        .get('/api/coverage/farmers')
        .set(auth(adminToken))
        .expect(200);
      expect(res.headers['deprecation']).toBeUndefined();
    });
  });
});
