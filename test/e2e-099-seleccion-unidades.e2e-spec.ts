/**
 * Spec 99 — Selección de las 40 unidades productivas.
 * `spec/99_seleccion_unidades_productivas.md` (raíz del ecosistema).
 *
 * ESTAS PRUEBAS NACEN EN ROJO (enfoque test-first): hoy no existen
 * `farm_selections`, `farm_selection_events` ni `/unit-selections`, y además
 * dependen del spec 98. Los endpoints nuevos responden 404.
 *
 * Criterios cubiertos: C01–C06, C10 y C11 (`Cnn`). C07–C09 quedan en
 * `frontend/lib/production-units/e2e-099-selection.test.ts`.
 *
 * ENTORNO: SOLO contra la base de desarrollo (`DATABASE_URL` activa del `.env`,
 * Neon `sosagro-dev`), NUNCA contra producción. Identidades con prefijo
 * `Spec99`. Todo se elimina en `afterAll`.
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
const PREFIX = 'e2e-099';
const RUN = Date.now().toString().slice(-6);

interface SelectionBody {
  farmId: string;
  status: string;
  reason: string;
  version: number;
}

interface HistoryEvent {
  fromStatus: string | null;
  toStatus: string;
  reason: string;
  userName: string;
  createdAt: string;
  coverageSnapshot: unknown;
}

interface SummaryBody {
  target: number;
  total: Record<string, number>;
  byCrop: { cropId: string; included: number }[];
}

interface LoginResponse {
  accessToken: string;
}

describe('Spec 99 — selección de unidades productivas (e2e)', () => {
  let app: INestApplication<App>;
  let ds: DataSource;
  let adminToken: string;
  let researcherToken: string;
  let pollsterToken: string;
  let farmId: string;
  let farmTwoCropsId: string;
  let farmerId: string;
  let cropIds: string[];

  const http = () => request(app.getHttpServer());
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const put = (id: string, token: string, body: Record<string, unknown>) =>
    http().put(`/api/unit-selections/${id}`).set(auth(token)).send(body);

  async function ensureUser(role: string): Promise<string> {
    const email = `${PREFIX}-${role}@test.local`;
    const existing = await ds.query<{ user_id: string }[]>(
      `SELECT user_id FROM users WHERE email = $1`,
      [email],
    );
    if (!existing.length) {
      const roles = await ds.query<{ role_id: string }[]>(
        `SELECT role_id FROM roles WHERE name = $1`,
        [role],
      );
      const hash = await bcrypt.hash(TEST_PASSWORD, 10);
      await ds.query(
        `INSERT INTO users (user_id, name, last_name, email, password, role_id, must_change_password)
         VALUES (gen_random_uuid(), 'E2E', 'Spec99', $1, $2, $3, false)`,
        [email, hash, roles[0].role_id],
      );
    }
    const login = await http()
      .post('/api/auth/login')
      .send({ email, password: TEST_PASSWORD })
      .expect(200);
    return (login.body as LoginResponse).accessToken;
  }

  async function insertFarm(name: string): Promise<string> {
    const rows = await ds.query<{ farm_id: string }[]>(
      `INSERT INTO farms (farm_id, name) VALUES (gen_random_uuid(), $1)
       RETURNING farm_id`,
      [name],
    );
    return rows[0].farm_id;
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
    researcherToken = await ensureUser('researcher');
    pollsterToken = await ensureUser('pollster');

    farmId = await insertFarm(`Spec99 Finca ${RUN}`);
    farmTwoCropsId = await insertFarm(`Spec99 Dos cultivos ${RUN}`);

    const crops = await ds.query<{ crop_id: string }[]>(
      `SELECT crop_id FROM types_of_crops ORDER BY name LIMIT 2`,
    );
    cropIds = crops.map((c) => c.crop_id);
    for (const cropId of cropIds) {
      await ds.query(
        `INSERT INTO farms_crops (farm_id, crop_id) VALUES ($1, $2)`,
        [farmTwoCropsId, cropId],
      );
    }

    const [farmer] = await ds.query<{ id: string }[]>(
      `INSERT INTO farmers (id, name, document_id)
       VALUES (gen_random_uuid(), $1, $2) RETURNING id`,
      [`Spec99 Productor ${RUN}`, `99${RUN}01`],
    );
    farmerId = farmer.id;
    await ds.query(
      `INSERT INTO farmer_farms (farmer_id, farm_id, role, is_primary, source)
       VALUES ($1, $2, 'owner', true, 'e2e-099')`,
      [farmerId, farmId],
    );
  });

  afterAll(async () => {
    const safe = async (sql: string, params: unknown[] = []) => {
      try {
        await ds.query(sql, params);
      } catch {
        /* limpieza tolerante: hoy las tablas del spec aún no existen */
      }
    };
    const farms = [farmId, farmTwoCropsId];
    await safe(
      `DELETE FROM farm_selection_events WHERE farm_id = ANY($1::uuid[])`,
      [farms],
    );
    await safe(`DELETE FROM farm_selections WHERE farm_id = ANY($1::uuid[])`, [
      farms,
    ]);
    await safe(`DELETE FROM farmer_farms WHERE farmer_id = $1`, [farmerId]);
    await safe(`DELETE FROM farms_crops WHERE farm_id = ANY($1::uuid[])`, [
      farms,
    ]);
    await safe(`DELETE FROM farms WHERE farm_id = ANY($1::uuid[])`, [farms]);
    await safe(`DELETE FROM farmers WHERE id = $1`, [farmerId]);
    await safe(`DELETE FROM users WHERE email LIKE $1`, [`${PREFIX}-%`]);
    await app.close();
  });

  describe('C01 y C02 — decisión y permisos', () => {
    it('sin motivo responde 400', async () => {
      await put(farmId, adminToken, {
        status: 'included',
        reason: '   ',
        expectedVersion: 0,
      }).expect(400);
    });

    it('POLLSTER recibe 403', async () => {
      await put(farmId, pollsterToken, {
        status: 'included',
        reason: 'x',
        expectedVersion: 0,
      }).expect(403);
    });

    it('RESEARCHER registra la decisión', async () => {
      const res = await put(farmId, researcherToken, {
        status: 'in_review',
        reason: 'Cobertura por verificar',
        expectedVersion: 0,
      }).expect(200);
      const body = res.body as SelectionBody;
      expect(body).toMatchObject({ farmId, status: 'in_review', version: 1 });
    });
  });

  describe('C05 — edición simultánea', () => {
    it('una versión vieja recibe 409 y no pisa la decisión', async () => {
      await put(farmId, adminToken, {
        status: 'excluded',
        reason: 'Versión vieja',
        expectedVersion: 0,
      }).expect(409);

      const [row] = await ds.query<{ status: string }[]>(
        `SELECT status FROM farm_selections WHERE farm_id = $1`,
        [farmId],
      );
      expect(row.status).toBe('in_review');
    });
  });

  describe('C03 y C04 — historial', () => {
    it('conserva cada cambio con su cobertura', async () => {
      await put(farmId, adminToken, {
        status: 'included',
        reason: 'Cumple',
        expectedVersion: 1,
      }).expect(200);

      const res = await http()
        .get(`/api/unit-selections/${farmId}/history`)
        .set(auth(adminToken))
        .expect(200);
      const events = res.body as HistoryEvent[];

      expect(events).toHaveLength(2);
      expect(events[0]).toMatchObject({
        fromStatus: 'in_review',
        toStatus: 'included',
        reason: 'Cumple',
      });
      expect(events[1].fromStatus).toBeNull();
      expect(events[0].coverageSnapshot).toBeTruthy();
    });

    it('el historial no se puede modificar por API', async () => {
      await http()
        .delete(`/api/unit-selections/${farmId}/history`)
        .set(auth(adminToken))
        .expect(404);
    });
  });

  describe('C06 — resumen', () => {
    it('una finca con dos cultivos cuenta una vez en el total', async () => {
      const before = await http()
        .get('/api/unit-selections/summary')
        .set(auth(adminToken))
        .expect(200);
      const totalBefore = (before.body as SummaryBody).total.included ?? 0;

      await put(farmTwoCropsId, adminToken, {
        status: 'included',
        reason: 'Dos cultivos',
        expectedVersion: 0,
      }).expect(200);

      const after = await http()
        .get('/api/unit-selections/summary')
        .set(auth(adminToken))
        .expect(200);
      const summary = after.body as SummaryBody;

      expect(summary.target).toBe(40);
      expect(summary.total.included).toBe(totalBefore + 1);
      for (const cropId of cropIds) {
        const crop = summary.byCrop.find((c) => c.cropId === cropId);
        expect(crop?.included).toBeGreaterThanOrEqual(1);
      }
    });
  });

  describe('C10 — exportación del resultado', () => {
    it('devuelve el archivo y queda registrada', async () => {
      await http()
        .post('/api/unit-selections/export')
        .set(auth(adminToken))
        .send({})
        .expect(201);

      const rows = await ds.query<{ export_type: string }[]>(
        `SELECT export_type FROM data_export_logs
          WHERE user_email = $1 ORDER BY created_at DESC LIMIT 1`,
        [`${PREFIX}-admin@test.local`],
      );
      expect(rows[0]?.export_type).toBe('unit_selection');
    });
  });

  describe('C11 — borrado protegido', () => {
    it('la vista previa del borrado explica la decisión y la cascada no procede', async () => {
      const preview = await http()
        .get(`/api/farmers/${farmerId}/deletion-preview`)
        .set(auth(adminToken))
        .expect(200);
      expect(JSON.stringify(preview.body)).toContain('selection');

      await http()
        .delete(`/api/farmers/${farmerId}/cascade`)
        .set(auth(adminToken))
        .expect(409);
    });
  });
});
