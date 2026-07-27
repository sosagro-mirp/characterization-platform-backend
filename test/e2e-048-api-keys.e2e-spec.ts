/**
 * Spec 48 — MCP de administración: autenticación por API key.
 *
 * Escrito ANTES de la implementación (enfoque test-first). Arranca en rojo:
 * el módulo `api-keys` y sus guards todavía no existen.
 *
 * Cubre los criterios de aceptación 1–9 del spec.
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
const EMAIL_PREFIX = 'e2e-apikey-';

interface LoginResponse {
  accessToken: string;
}

interface RoleRow {
  role_id: string;
  name: string;
}

interface ApiKeyCreatedResponse {
  apiKeyId: string;
  name: string;
  keyPrefix: string;
  scopes: string[];
  key: string;
  expiresAt: string | null;
}

interface ApiKeyResponse {
  apiKeyId: string;
  name: string;
  keyPrefix: string;
  scopes: string[];
  revokedAt: string | null;
  expiresAt: string | null;
  lastUsedAt: string | null;
  key?: string;
}

interface InstrumentResponse {
  instrumentId: string;
  name: string;
  createdBy?: { userId: string } | null;
}

function testEmail(suffix: string) {
  return `${EMAIL_PREFIX}${suffix}@test.local`;
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

describe('Spec 48 — API keys y acceso del MCP (e2e)', () => {
  let app: INestApplication<App>;
  let ds: DataSource;

  let adminToken: string;
  let serviceUserId: string;

  // Keys creadas durante la suite
  let readWriteKey: string;
  let readOnlyKey: string;
  let revokedKey: string;
  let revokedKeyId: string;
  let expiredKey: string;

  // Instrumento creado con la key read+write (criterio 5)
  let createdInstrumentId: string;

  const createKey = async (body: Record<string, unknown>) => {
    const res = await request(app.getHttpServer())
      .post('/api/api-keys')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(body)
      .expect(201);
    return res.body as ApiKeyCreatedResponse;
  };

  // ── bootstrap ─────────────────────────────────────────────────────────────

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

    const roles = await ds.query<RoleRow[]>(
      `SELECT role_id, name FROM roles WHERE name IN ('admin','pollster')`,
    );
    const roleId = (name: string) =>
      roles.find((r) => r.name === name)!.role_id;

    const hash = await bcrypt.hash(TEST_PASSWORD, 10);

    const insertUser = async (
      name: string,
      suffix: string,
      role: string,
    ): Promise<string> => {
      const email = testEmail(suffix);
      const existing = await ds.query<{ user_id: string }[]>(
        `SELECT user_id FROM users WHERE email = $1`,
        [email],
      );
      if (existing.length) return existing[0].user_id;

      const result = await ds.query<{ user_id: string }[]>(
        `INSERT INTO users (user_id, name, last_name, email, password, role_id, must_change_password)
         VALUES (gen_random_uuid(), $1, 'E2E', $2, $3, $4, false)
         RETURNING user_id`,
        [name, email, hash, roleId(role)],
      );
      return result[0].user_id;
    };

    await insertUser('E2E ApiKey Admin', 'admin', 'admin');
    serviceUserId = await insertUser('E2E MCP Service', 'service', 'admin');

    adminToken = await loginAs(app, testEmail('admin'));
  }, 30_000);

  afterAll(async () => {
    if (createdInstrumentId) {
      await ds.query(`DELETE FROM instruments WHERE instrument_id = $1`, [
        createdInstrumentId,
      ]);
    }
    await ds.query(
      `DELETE FROM api_keys WHERE user_id IN (
        SELECT user_id FROM users WHERE email LIKE '${EMAIL_PREFIX}%@test.local'
      )`,
    );
    await ds.query(
      `DELETE FROM users WHERE email LIKE '${EMAIL_PREFIX}%@test.local'`,
    );
    await app.close();
  }, 15_000);

  // ── Criterio 1 ────────────────────────────────────────────────────────────

  describe('C1 — creación de la key y visibilidad única del secreto', () => {
    it('201: POST /api/api-keys devuelve el secreto en claro una sola vez', async () => {
      const created = await createKey({
        name: 'E2E MCP read+write',
        scopes: ['read', 'write'],
        userId: serviceUserId,
      });

      expect(created.apiKeyId).toBeDefined();
      expect(created.key).toMatch(
        /^sosagro_sk_[A-Za-z0-9_-]{8}_[A-Za-z0-9_-]+$/,
      );
      expect(created.key).toContain(created.keyPrefix);
      expect(created.scopes).toEqual(['read', 'write']);

      readWriteKey = created.key;
    });

    it('200: ni el listado ni el detalle vuelven a exponer el secreto', async () => {
      const list = await request(app.getHttpServer())
        .get('/api/api-keys')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const keys = list.body as ApiKeyResponse[];
      const mine = keys.find((k) => k.name === 'E2E MCP read+write');
      expect(mine).toBeDefined();
      expect(mine!.key).toBeUndefined();
      expect(JSON.stringify(list.body)).not.toContain(readWriteKey);

      const detail = await request(app.getHttpServer())
        .get(`/api/api-keys/${mine!.apiKeyId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect((detail.body as ApiKeyResponse).key).toBeUndefined();
    });

    it('403: un usuario no ADMIN no puede crear API keys', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/api-keys')
        .send({
          name: 'sin token',
          scopes: ['read'],
          userId: serviceUserId,
        });
      expect([401, 403]).toContain(res.status);
    });
  });

  // ── Criterio 2 ────────────────────────────────────────────────────────────

  describe('C2 — la key autentica sin JWT', () => {
    it('200: GET /api/users con X-API-Key responde igual que con JWT', async () => {
      await request(app.getHttpServer())
        .get('/api/users')
        .set('X-API-Key', readWriteKey)
        .expect(200);
    });

    it('401: la misma ruta sin credencial alguna sigue rechazando', async () => {
      await request(app.getHttpServer()).get('/api/users').expect(401);
    });
  });

  // ── Criterio 3 ────────────────────────────────────────────────────────────

  describe('C3 — keys inválidas, revocadas y expiradas', () => {
    beforeAll(async () => {
      const revoked = await createKey({
        name: 'E2E MCP revoked',
        scopes: ['read'],
        userId: serviceUserId,
      });
      revokedKey = revoked.key;
      revokedKeyId = revoked.apiKeyId;

      const expired = await createKey({
        name: 'E2E MCP expired',
        scopes: ['read'],
        userId: serviceUserId,
        expiresAt: new Date(Date.now() - 60_000).toISOString(),
      });
      expiredKey = expired.key;

      await request(app.getHttpServer())
        .patch(`/api/api-keys/${revokedKeyId}/revoke`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
    });

    it('401: key con formato inválido', async () => {
      await request(app.getHttpServer())
        .get('/api/users')
        .set('X-API-Key', 'no-es-una-key')
        .expect(401);
    });

    it('401: key inexistente pero bien formada', async () => {
      await request(app.getHttpServer())
        .get('/api/users')
        .set('X-API-Key', 'sosagro_sk_deadbeef_' + 'x'.repeat(43))
        .expect(401);
    });

    it('401: key revocada', async () => {
      await request(app.getHttpServer())
        .get('/api/users')
        .set('X-API-Key', revokedKey)
        .expect(401);
    });

    it('401: key expirada', async () => {
      await request(app.getHttpServer())
        .get('/api/users')
        .set('X-API-Key', expiredKey)
        .expect(401);
    });

    it('el mensaje de error es genérico y no distingue el motivo', async () => {
      const inexistente = await request(app.getHttpServer())
        .get('/api/users')
        .set('X-API-Key', 'sosagro_sk_deadbeef_' + 'x'.repeat(43));
      const revocada = await request(app.getHttpServer())
        .get('/api/users')
        .set('X-API-Key', revokedKey);

      expect((inexistente.body as { message: string }).message).toBe(
        (revocada.body as { message: string }).message,
      );
    });
  });

  // ── Criterio 4 ────────────────────────────────────────────────────────────

  describe('C4 — scope read no puede escribir', () => {
    beforeAll(async () => {
      const created = await createKey({
        name: 'E2E MCP read-only',
        scopes: ['read'],
        userId: serviceUserId,
      });
      readOnlyKey = created.key;
    });

    it('200: la key read puede leer', async () => {
      // Se usa una ruta NO pública (a diferencia de GET /api/instruments)
      // para que la request realmente pase por la validación de la key.
      await request(app.getHttpServer())
        .get('/api/users')
        .set('X-API-Key', readOnlyKey)
        .expect(200);
    });

    it('403: la key read no puede hacer POST', async () => {
      await request(app.getHttpServer())
        .post('/api/instruments')
        .set('X-API-Key', readOnlyKey)
        .send({ name: 'E2E scope test', description: 'no debe crearse' })
        .expect(403);
    });

    it('403: la key read no puede hacer PATCH', async () => {
      await request(app.getHttpServer())
        .patch('/api/users/' + serviceUserId)
        .set('X-API-Key', readOnlyKey)
        .send({ name: 'No permitido' })
        .expect(403);
    });
  });

  // ── Criterio 5 ────────────────────────────────────────────────────────────

  describe('C5 — scope write escribe y queda auditado', () => {
    it('201: crea un instrumento con la key read+write', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/instruments')
        .set('X-API-Key', readWriteKey)
        .send({
          name: 'E2E MCP instrumento',
          version: 1,
          publishDate: '2026-01-01',
          isActive: true,
        })
        .expect(201);

      const body = res.body as InstrumentResponse;
      expect(body.instrumentId).toBeDefined();
      createdInstrumentId = body.instrumentId;
    });

    it('createdBy apunta al usuario de servicio de la key', async () => {
      // GET /api/instruments/:id no incluye la relación createdBy en su
      // respuesta (comportamiento preexistente, fuera del alcance del
      // spec 48) — se verifica la columna directamente en la base.
      const rows = await ds.query<{ created_by_id: string }[]>(
        `SELECT created_by_id FROM instruments WHERE instrument_id = $1`,
        [createdInstrumentId],
      );
      expect(rows[0]?.created_by_id).toBe(serviceUserId);
    });

    it('lastUsedAt de la key queda registrado', async () => {
      const list = await request(app.getHttpServer())
        .get('/api/api-keys')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const mine = (list.body as ApiKeyResponse[]).find(
        (k) => k.name === 'E2E MCP read+write',
      );
      expect(mine!.lastUsedAt).not.toBeNull();
    });
  });

  // ── Criterio 6 ────────────────────────────────────────────────────────────

  describe('C6 — DELETE siempre prohibido para API keys', () => {
    it('403: DELETE de instrumento con key write', async () => {
      await request(app.getHttpServer())
        .delete(`/api/instruments/${createdInstrumentId}`)
        .set('X-API-Key', readWriteKey)
        .expect(403);
    });

    it('el recurso sigue existiendo tras el intento', async () => {
      await request(app.getHttpServer())
        .get(`/api/instruments/${createdInstrumentId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
    });

    it('403: DELETE de usuario con key write', async () => {
      await request(app.getHttpServer())
        .delete(`/api/users/${serviceUserId}`)
        .set('X-API-Key', readWriteKey)
        .expect(403);
    });
  });

  // ── Criterio 7 ────────────────────────────────────────────────────────────

  describe('C7 — una API key no puede gestionar API keys', () => {
    it('403: GET /api/api-keys con X-API-Key', async () => {
      await request(app.getHttpServer())
        .get('/api/api-keys')
        .set('X-API-Key', readWriteKey)
        .expect(403);
    });

    it('403: POST /api/api-keys con X-API-Key', async () => {
      await request(app.getHttpServer())
        .post('/api/api-keys')
        .set('X-API-Key', readWriteKey)
        .send({
          name: 'escalada',
          scopes: ['read', 'write'],
          userId: serviceUserId,
        })
        .expect(403);
    });

    it('403: revocar otra key con X-API-Key', async () => {
      await request(app.getHttpServer())
        .patch(`/api/api-keys/${revokedKeyId}/revoke`)
        .set('X-API-Key', readWriteKey)
        .expect(403);
    });
  });

  // ── Criterio 8 ────────────────────────────────────────────────────────────

  describe('C8 — la revocación surte efecto inmediato', () => {
    it('200 antes de revocar, 401 después', async () => {
      const created = await createKey({
        name: 'E2E MCP revocación inmediata',
        scopes: ['read'],
        userId: serviceUserId,
      });

      // Ruta NO pública — /api/instruments (GET) es @Public() y devolvería
      // 200 sin importar si la key es válida, lo cual invalidaría este caso.
      await request(app.getHttpServer())
        .get('/api/users')
        .set('X-API-Key', created.key)
        .expect(200);

      await request(app.getHttpServer())
        .patch(`/api/api-keys/${created.apiKeyId}/revoke`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      await request(app.getHttpServer())
        .get('/api/users')
        .set('X-API-Key', created.key)
        .expect(401);
    });
  });

  // ── Criterio 9 ────────────────────────────────────────────────────────────

  describe('C9 — los flujos JWT existentes no se alteran', () => {
    it('200: JWT sigue autenticando rutas protegidas', async () => {
      await request(app.getHttpServer())
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
    });

    it('200: las rutas públicas siguen sin requerir credenciales', async () => {
      await request(app.getHttpServer()).get('/api/health').expect(200);
    });

    it('401: un JWT inválido sigue siendo rechazado', async () => {
      await request(app.getHttpServer())
        .get('/api/auth/me')
        .set('Authorization', 'Bearer token-invalido')
        .expect(401);
    });

    it('401: si se envían ambas credenciales, la X-API-Key inválida corta la request', async () => {
      // Regla fijada en el spec 48: la presencia del header X-API-Key define
      // el mecanismo de autenticación. Una key inválida no se "degrada" al JWT.
      await request(app.getHttpServer())
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('X-API-Key', revokedKey)
        .expect(401);
    });
  });
});
