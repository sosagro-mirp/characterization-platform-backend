import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { AppModule } from '../src/app.module';

// ─── helpers ────────────────────────────────────────────────────────────────

const TEST_PASSWORD = 'E2eTest1234!';
const LOCAL_ID = 'e2e-cr-local-uuid-001';

function testEmail(role: string) {
  return `e2e-cr-${role}@test.local`;
}

async function loginAs(app: INestApplication<App>, email: string): Promise<string> {
  const res = await request(app.getHttpServer())
    .post('/api/auth/login')
    .send({ email, password: TEST_PASSWORD })
    .expect(200);
  return res.body.accessToken as string;
}

// ─── suite ──────────────────────────────────────────────────────────────────

describe('Bloque A — Change Requests (e2e)', () => {
  let app: INestApplication<App>;
  let ds: DataSource;

  let adminToken: string;
  let researcherToken: string;
  let pollsterToken: string;

  let adminUserId: string;
  let pollsterUserId: string;

  // changeRequestId creado en A1 (mobile) — reutilizado en A8/A9/A10
  let mobileTicketId: string;

  // ── bootstrap ─────────────────────────────────────────────────────────────

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();

    ds = moduleFixture.get(DataSource);

    // Resolve role IDs dynamically
    const roles = await ds.query(
      `SELECT role_id, name FROM roles WHERE name IN ('admin','researcher','pollster')`,
    ) as { role_id: string; name: string }[];

    const roleId = (name: string) =>
      roles.find((r) => r.name === name)!.role_id;

    // Create test users
    const hash = await bcrypt.hash(TEST_PASSWORD, 10);

    const insertUser = async (name: string, role: string): Promise<string> => {
      const email = testEmail(role);
      // Upsert-style: skip if already exists (re-run safety)
      const existing = await ds.query(
        `SELECT user_id FROM users WHERE email = $1`,
        [email],
      ) as { user_id: string }[];

      if (existing.length) return existing[0].user_id;

      const result = await ds.query(
        `INSERT INTO users (user_id, name, last_name, email, password, role_id, must_change_password)
         VALUES (gen_random_uuid(), $1, 'E2E', $2, $3, $4, false)
         RETURNING user_id`,
        [name, email, hash, roleId(role)],
      ) as { user_id: string }[];
      return result[0].user_id;
    };

    adminUserId    = await insertUser('E2E Admin',      'admin');
    pollsterUserId = await insertUser('E2E Pollster',   'pollster');
    await insertUser('E2E Researcher', 'researcher');

    // Obtain tokens
    adminToken      = await loginAs(app, testEmail('admin'));
    researcherToken = await loginAs(app, testEmail('researcher'));
    pollsterToken   = await loginAs(app, testEmail('pollster'));
  }, 30_000);

  afterAll(async () => {
    // Delete test change_requests (both tickets created during this suite)
    await ds.query(
      `DELETE FROM change_requests WHERE created_by_user_id IN (
        SELECT user_id FROM users WHERE email LIKE 'e2e-cr-%@test.local'
      )`,
    );
    // Delete test users
    await ds.query(
      `DELETE FROM users WHERE email LIKE 'e2e-cr-%@test.local'`,
    );
    await app.close();
  }, 15_000);

  // ── A1: Crear ticket desde mobile ─────────────────────────────────────────

  describe('A1 — POST /api/change-requests (mobile con localId)', () => {
    it('201: crea el ticket con source=mobile y category=null', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/change-requests')
        .set('Authorization', `Bearer ${pollsterToken}`)
        .send({
          description: 'El nombre del agricultor Juan Pérez está mal escrito, es Juan Peres.',
          localId: LOCAL_ID,
        })
        .expect(201);

      expect(res.body.source).toBe('mobile');
      expect(res.body.category).toBeNull();
      expect(res.body.status).toBe('open');
      expect(res.body.changeRequestId).toBeDefined();

      mobileTicketId = res.body.changeRequestId as string;
    });

    it('200: idempotencia — reenvío con mismo localId devuelve el mismo ticket', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/change-requests')
        .set('Authorization', `Bearer ${pollsterToken}`)
        .send({
          description: 'El nombre del agricultor Juan Pérez está mal escrito, es Juan Peres.',
          localId: LOCAL_ID,
        })
        .expect(200);

      expect(res.body.changeRequestId).toBe(mobileTicketId);
    });
  });

  // ── A2: Crear ticket desde web ────────────────────────────────────────────

  describe('A2 — POST /api/change-requests (web con category)', () => {
    it('201: crea el ticket con source=web y category=bug_ui', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/change-requests')
        .set('Authorization', `Bearer ${researcherToken}`)
        .send({
          description: 'El botón de guardar en la sección de instrumentos no responde al primer click.',
          category: 'bug_ui',
        })
        .expect(201);

      expect(res.body.source).toBe('web');
      expect(res.body.category).toBe('bug_ui');
      expect(res.body.status).toBe('open');
    });
  });

  // ── A3: Sin localId ni category ───────────────────────────────────────────

  describe('A3 — Validación: sin localId ni category', () => {
    it('400: rechaza el request', async () => {
      await request(app.getHttpServer())
        .post('/api/change-requests')
        .set('Authorization', `Bearer ${pollsterToken}`)
        .send({ description: 'Descripción de prueba sin categoría ni localId.' })
        .expect(400);
    });
  });

  // ── A4: Descripción demasiado corta ───────────────────────────────────────

  describe('A4 — Validación: descripción demasiado corta', () => {
    it('400: rechaza descripciones menores a 10 caracteres', async () => {
      await request(app.getHttpServer())
        .post('/api/change-requests')
        .set('Authorization', `Bearer ${pollsterToken}`)
        .send({ description: 'corto', category: 'other' })
        .expect(400);
    });
  });

  // ── A5: Listar tickets ────────────────────────────────────────────────────

  describe('A5 — GET /api/change-requests (admin)', () => {
    it('200: devuelve array con los tickets creados, incluyendo relaciones', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/change-requests')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThanOrEqual(2);

      const ticket = res.body[0];
      expect(ticket).toHaveProperty('createdBy');
      expect(ticket.createdBy).toHaveProperty('userId');
    });
  });

  // ── A6: Filtro por source ─────────────────────────────────────────────────

  describe('A6 — Filtros por source', () => {
    it('?source=mobile devuelve solo tickets de mobile', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/change-requests?source=mobile')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.every((t: { source: string }) => t.source === 'mobile')).toBe(true);
    });

    it('?source=web devuelve solo tickets de web', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/change-requests?source=web')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.every((t: { source: string }) => t.source === 'web')).toBe(true);
    });
  });

  // ── A7: Filtro por status ─────────────────────────────────────────────────

  describe('A7 — Filtros por status', () => {
    it('?status=open devuelve solo tickets abiertos', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/change-requests?status=open')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.every((t: { status: string }) => t.status === 'open')).toBe(true);
    });

    it('?status=resolved devuelve array vacío (aún no hay resueltos)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/change-requests?status=resolved')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      // Solo verifica que los del suite de test no están (pueden existir otros resueltos en la DB)
      const fromSuite = (res.body as { changeRequestId: string }[]).find(
        (t) => t.changeRequestId === mobileTicketId,
      );
      expect(fromSuite).toBeUndefined();
    });
  });

  // ── A8: Resolver ticket ───────────────────────────────────────────────────

  describe('A8 — PATCH /api/change-requests/:id/resolve', () => {
    it('200: resuelve el ticket y popula resolvedAt y resolvedBy', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/change-requests/${mobileTicketId}/resolve`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.status).toBe('resolved');
      expect(res.body.resolvedAt).not.toBeNull();
      expect(res.body.resolvedBy).toBeDefined();
      expect(res.body.resolvedBy.userId).toBe(adminUserId);
    });
  });

  // ── A9: Resolver ticket ya resuelto ───────────────────────────────────────

  describe('A9 — Resolver ticket ya resuelto', () => {
    it('400: rechaza resolver un ticket que ya está resuelto', async () => {
      await request(app.getHttpServer())
        .patch(`/api/change-requests/${mobileTicketId}/resolve`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(400);
    });
  });

  // ── A10: Mis resueltas ────────────────────────────────────────────────────

  describe('A10 — GET /api/change-requests/my-resolved', () => {
    it('sin ?since devuelve el ticket resuelto del pollster', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/change-requests/my-resolved')
        .set('Authorization', `Bearer ${pollsterToken}`)
        .expect(200);

      const ticket = (res.body as { changeRequestId: string }[]).find(
        (t) => t.changeRequestId === mobileTicketId,
      );
      expect(ticket).toBeDefined();
    });

    it('?since en fecha pasada también lo devuelve', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/change-requests/my-resolved?since=2026-01-01T00:00:00Z')
        .set('Authorization', `Bearer ${pollsterToken}`)
        .expect(200);

      const ticket = (res.body as { changeRequestId: string }[]).find(
        (t) => t.changeRequestId === mobileTicketId,
      );
      expect(ticket).toBeDefined();
    });

    it('?since en fecha futura devuelve array vacío para el ticket del suite', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/change-requests/my-resolved?since=2099-01-01T00:00:00Z')
        .set('Authorization', `Bearer ${pollsterToken}`)
        .expect(200);

      const ticket = (res.body as { changeRequestId: string }[]).find(
        (t) => t.changeRequestId === mobileTicketId,
      );
      expect(ticket).toBeUndefined();
    });
  });

  // ── A11: Acceso denegado a POLLSTER en listado ────────────────────────────

  describe('A11 — Acceso denegado a POLLSTER en GET /api/change-requests', () => {
    it('403: POLLSTER no puede listar todos los tickets', async () => {
      await request(app.getHttpServer())
        .get('/api/change-requests')
        .set('Authorization', `Bearer ${pollsterToken}`)
        .expect(403);
    });
  });
});
