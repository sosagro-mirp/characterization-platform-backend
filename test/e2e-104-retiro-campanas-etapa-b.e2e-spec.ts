/**
 * Spec 104 — Retiro de campañas (H8), etapa B «cerrar la captura».
 * `spec/104_retiro_de_campanas.md` (raíz del ecosistema), criterios C14–C17.
 *
 * NACE EN ROJO y solo se exige en verde desde la Fase 7, después de la
 * compuerta A→B. Mientras la etapa A no se despliegue, este archivo falla por
 * diseño.
 *
 * ── Contrato ────────────────────────────────────────────────────────────────
 *   - `GET /campaigns/active` → 200 `[]`.
 *   - `GET /campaigns/:id/render`, `GET /campaign-sessions/:id/next-step`,
 *     `GET /campaign-sessions/last-farmer`, `GET /surveys/check-duplicate` y
 *     `POST /campaign-sessions` → 410 `CAMPAIGNS_RETIRED`, antes de validar.
 *   - El dashboard acepta `campaignId` y lo ignora: misma respuesta que sin él.
 *   - Ingesta heredada aceptada: `POST /surveys` con `campaignSessionId`
 *     existente (201) y `PATCH /campaign-sessions/:id/sync` (200).
 *
 * ENTORNO: SOLO desarrollo (Neon `sosagro-dev`). Datos `Spec104B`, se borran
 * en `afterAll`.
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

describe('Spec 104 — retiro de campañas, etapa B (e2e)', () => {
  let app: INestApplication<App>;
  let ds: DataSource;
  let adminToken: string;
  let pollsterToken: string;

  let farmerId: string;
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
    return (login.body as { accessToken: string }).accessToken;
  }

  function expectRetired(res: request.Response, label: string) {
    expect({ label, status: res.status }).toEqual({ label, status: 410 });
    expect((res.body as { code?: string }).code).toBe('CAMPAIGNS_RETIRED');
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

    const [farmer] = await ds.query<{ id: string }[]>(
      `INSERT INTO farmers (id, name, document_id)
       VALUES (gen_random_uuid(), $1, $2) RETURNING id`,
      [`Spec104B Productor ${RUN}`, `104B${RUN}`],
    );
    farmerId = farmer.id;
    const [instrument] = await ds.query<{ instrument_id: string }[]>(
      `INSERT INTO instruments (instrument_id, name, version, publish_date, is_active, scope_level)
       VALUES (gen_random_uuid(), $1, 1, now()::date, true, 'farmer')
       RETURNING instrument_id`,
      [`Spec104B Instrumento ${RUN}`],
    );
    instrumentId = instrument.instrument_id;
    const [campaign] = await ds.query<{ campaign_id: string }[]>(
      `INSERT INTO campaigns (campaign_id, name) VALUES (gen_random_uuid(), $1)
       RETURNING campaign_id`,
      [`Spec104B Campaña ${RUN}`],
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
    await safe(`DELETE FROM farmers WHERE id = $1`, [farmerId]);
    await app.close();
  });

  it('C14 — GET /campaigns/active responde 200 []', async () => {
    const res = await http().get('/api/campaigns/active').expect(200);
    expect(res.body).toEqual([]);
  });

  it('C15 — la captura por campañas responde 410', async () => {
    expectRetired(
      await http().get(`/api/campaigns/${campaignId}/render`),
      'render',
    );
    expectRetired(
      await http()
        .get(`/api/campaign-sessions/${sessionId}/next-step`)
        .set(auth(pollsterToken)),
      'next-step',
    );
    expectRetired(
      await http()
        .get('/api/campaign-sessions/last-farmer')
        .set(auth(pollsterToken)),
      'last-farmer',
    );
    expectRetired(
      await http()
        .get('/api/surveys/check-duplicate')
        .query({ farmerId, instrumentId, campaignId })
        .set(auth(pollsterToken)),
      'check-duplicate',
    );
    expectRetired(
      await http()
        .post('/api/campaign-sessions')
        .set(auth(pollsterToken))
        .send({}),
      'POST /campaign-sessions',
    );
  });

  it('C16 — el dashboard acepta campaignId y lo ignora', async () => {
    const without = await http().get('/api/dashboard/summary').expect(200);
    const withFilter = await http()
      .get('/api/dashboard/summary')
      .query({ campaignId })
      .expect(200);
    expect(withFilter.body).toEqual(without.body);
  });

  it('C17 — POST /surveys con campaignSessionId existente sigue aceptándose', async () => {
    const res = await http()
      .post('/api/surveys')
      .set(auth(pollsterToken))
      .send({ instrumentIds: [instrumentId], campaignSessionId: sessionId })
      .expect(201);
    surveyIds.push((res.body as { surveyId: string }).surveyId);
  });

  it('C17 — PATCH /campaign-sessions/:id/sync sigue aceptándose', async () => {
    await http()
      .patch(`/api/campaign-sessions/${sessionId}/sync`)
      .set(auth(adminToken))
      .expect(200);
  });
});
