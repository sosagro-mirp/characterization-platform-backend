/**
 * Spec 104 — Retiro de campañas (H8), etapa C «limpiar».
 * `spec/104_retiro_de_campanas.md` (raíz del ecosistema), criterios C18–C22.
 *
 * NACE EN ROJO y solo se exige en verde desde la Fase 8, después de la
 * compuerta B→C.
 *
 * ── Contrato ────────────────────────────────────────────────────────────────
 *   - `/api/campaigns*` y `/api/campaign-sessions*` → 404 (rutas inexistentes).
 *   - `POST /surveys` con `campaignSessionId`, `POST /consents` con `sessionId`
 *     y el dashboard con `campaignId` → 400 (propiedad no permitida).
 *   - `POST /surveys/:id/extract-crops` → 404.
 *   - `GET /system-fields?all=true` → todas las entradas con `aliases: []`.
 *   - `farmers.farm_id` no existe y `GET /farmers/:id` devuelve en `farm` la
 *     finca principal de `farmer_farms`.
 *   - Las cinco tablas de campañas siguen existiendo (DH8-1).
 *
 * ENTORNO: SOLO desarrollo (Neon `sosagro-dev`). Datos `Spec104C`, se borran
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
const MISSING_UUID = '00000000-0000-4000-8000-000000000000';
const CAMPAIGN_TABLES = [
  'campaigns',
  'campaign_steps',
  'step_conditions',
  'campaign_sessions',
  'campaign_sessions_crops',
];

describe('Spec 104 — retiro de campañas, etapa C (e2e)', () => {
  let app: INestApplication<App>;
  let ds: DataSource;
  let adminToken: string;

  let farmerId: string;
  let primaryFarmId: string;
  let secondaryFarmId: string;
  let instrumentId: string;

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

  async function insertFarm(label: string, isPrimary: boolean) {
    const [farm] = await ds.query<{ farm_id: string }[]>(
      `INSERT INTO farms (farm_id, name) VALUES (gen_random_uuid(), $1)
       RETURNING farm_id`,
      [`Spec104C Finca ${label} ${RUN}`],
    );
    await ds.query(
      `INSERT INTO farmer_farms (farmer_id, farm_id, role, is_primary, source)
       VALUES ($1, $2, 'owner', $3, 'e2e-104')`,
      [farmerId, farm.farm_id, isPrimary],
    );
    return farm.farm_id;
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
      [`Spec104C Productor ${RUN}`, `104C${RUN}`],
    );
    farmerId = farmer.id;
    secondaryFarmId = await insertFarm('B', false);
    primaryFarmId = await insertFarm('A', true);

    const [instrument] = await ds.query<{ instrument_id: string }[]>(
      `INSERT INTO instruments (instrument_id, name, version, publish_date, is_active, scope_level)
       VALUES (gen_random_uuid(), $1, 1, now()::date, true, 'farmer')
       RETURNING instrument_id`,
      [`Spec104C Instrumento ${RUN}`],
    );
    instrumentId = instrument.instrument_id;
  });

  afterAll(async () => {
    const safe = async (sql: string, params: unknown[] = []) => {
      try {
        await ds.query(sql, params);
      } catch {
        /* limpieza tolerante */
      }
    };
    await safe(`DELETE FROM instruments WHERE instrument_id = $1`, [
      instrumentId,
    ]);
    await safe(`DELETE FROM farmer_farms WHERE farmer_id = $1`, [farmerId]);
    await safe(`DELETE FROM farms WHERE farm_id = ANY($1::uuid[])`, [
      [primaryFarmId, secondaryFarmId],
    ]);
    await safe(`DELETE FROM farmers WHERE id = $1`, [farmerId]);
    await app.close();
  });

  it('C18 — las rutas de campañas y sesiones ya no existen (404)', async () => {
    const paths = [
      '/api/campaigns',
      '/api/campaigns/active',
      `/api/campaigns/${MISSING_UUID}`,
      `/api/campaigns/${MISSING_UUID}/render`,
      '/api/campaign-sessions/last-farmer',
      `/api/campaign-sessions/${MISSING_UUID}`,
    ];
    for (const path of paths) {
      const res = await http().get(path).set(auth(adminToken));
      expect({ path, status: res.status }).toEqual({ path, status: 404 });
    }
  });

  it('C19 — campaignSessionId, sessionId y campaignId se rechazan (400)', async () => {
    await http()
      .post('/api/surveys')
      .set(auth(adminToken))
      .send({ instrumentIds: [instrumentId], campaignSessionId: MISSING_UUID })
      .expect(400);
    await http()
      .post('/api/consents')
      .set(auth(adminToken))
      .send({
        sessionId: MISSING_UUID,
        acceptedDataProcessing: true,
        respondentName: `Spec104C ${RUN}`,
        acceptedAt: new Date().toISOString(),
      })
      .expect(400);
    await http()
      .get('/api/dashboard/summary')
      .query({ campaignId: MISSING_UUID })
      .expect(400);
  });

  it('C20 — extract-crops no existe y no quedan alias de systemField', async () => {
    await http()
      .post(`/api/surveys/${MISSING_UUID}/extract-crops`)
      .set(auth(adminToken))
      .send({})
      .expect(404);
    const res = await http()
      .get('/api/system-fields')
      .query({ all: 'true' })
      .set(auth(adminToken))
      .expect(200);
    const withAliases = (res.body as { key?: string; aliases: string[] }[])
      .filter((d) => d.aliases.length > 0)
      .map((d) => d.key);
    expect(withAliases).toEqual([]);
  });

  it('C21 — farmers.farm_id no existe y farm es la finca principal', async () => {
    const cols = await ds.query<{ column_name: string }[]>(
      `SELECT column_name FROM information_schema.columns
        WHERE table_name = 'farmers' AND column_name = 'farm_id'`,
    );
    expect(cols).toEqual([]);

    const res = await http()
      .get(`/api/farmers/${farmerId}`)
      .set(auth(adminToken))
      .expect(200);
    const body = res.body as { farm?: { farmId: string } | null };
    expect(body.farm?.farmId).toBe(primaryFarmId);
  });

  it('C22 — las tablas de campañas se conservan', async () => {
    const rows = await ds.query<{ table_name: string }[]>(
      `SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = ANY($1::text[])`,
      [CAMPAIGN_TABLES],
    );
    expect(rows.map((r) => r.table_name).sort()).toEqual(
      [...CAMPAIGN_TABLES].sort(),
    );
  });
});
