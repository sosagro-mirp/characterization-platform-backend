/**
 * Spec 85 — Endurecimiento de privacidad de multimedia y datos sensibles.
 *
 * ESTAS PRUEBAS NACEN EN ROJO. Nada de lo que verifican existe todavía:
 * `GET /api/media-attachments/:attachmentId/download-url`,
 * `POST /api/media-attachments/purge-pending`, la tabla `media_deletion_queue`,
 * el DTO de salida de `GET /api/surveys/:surveyId/media-attachments` (hoy
 * serializa la entidad completa, con `storageKey`), el campo `attachmentId` en
 * `GET /api/surveys/:id/responses` y el borrado real de objetos en R2 lo crean
 * las Fases 3, 6 y 7 del spec.
 *
 * Criterios cubiertos: 1, 2, 4, 8, 9 y 10.
 * Los criterios 5, 6, 7 (parte de tableta), 11-15 y 17 se validan a mano en
 * `docs/testing/test-085-privacidad-multimedia-datos-sensibles.md`.
 *
 * ── Doble de R2 ────────────────────────────────────────────────────────────
 * El repositorio NO tiene convención previa para aislar R2 en e2e (ningún
 * `*.e2e-spec.ts` toca `StorageService`). Se deja el doble explícito: un
 * `StorageService` falso con un almacén en memoria, inyectado con
 * `.overrideProvider(StorageService)`. El PUT del binario contra la URL
 * firmada lo hace el cliente real (tableta o navegador) directamente contra
 * Cloudflare; aquí lo simula `r2.put(...)`, que es exactamente lo que hace ese
 * PUT desde el punto de vista del backend. «La URL sirve el archivo» se
 * verifica resolviéndola contra el mismo almacén (`r2.serve(url)`).
 */

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { AppModule } from '../src/app.module';
import { StorageService } from '../src/storage/storage.service';

// ─── doble de R2 ────────────────────────────────────────────────────────────

const FAKE_R2_HOST = 'https://r2.fake.local';

class FakeR2 {
  readonly objects = new Map<string, Buffer>();
  /** Fuerza el fallo de los borrados, para ejercitar `media_deletion_queue`. */
  failDeletes = false;

  put(key: string, body: Buffer): void {
    this.objects.set(key, body);
  }

  has(key: string): boolean {
    return this.objects.has(key);
  }

  /** Resuelve una URL firmada emitida por este doble contra el almacén. */
  serve(url: string): Buffer | null {
    const key = decodeURIComponent(new URL(url).pathname.replace(/^\//, ''));
    return this.objects.get(key) ?? null;
  }

  keysUnder(prefix: string): string[] {
    return [...this.objects.keys()].filter((k) => k.startsWith(prefix));
  }

  // ── superficie de StorageService ──
  generatePresignedUploadUrl(key: string): Promise<string> {
    return Promise.resolve(`${FAKE_R2_HOST}/${encodeURI(key)}?upload=1`);
  }

  generatePresignedDownloadUrl(
    key: string,
    options?: { mimeType?: string; filename?: string; expiresIn?: number },
  ): Promise<string> {
    const params = new URLSearchParams({
      'X-Amz-Signature': 'e2e-085',
      'response-content-type': options?.mimeType ?? '',
      'response-content-disposition': options?.filename
        ? `attachment; filename="${options.filename}"`
        : '',
    });
    return Promise.resolve(`${FAKE_R2_HOST}/${encodeURI(key)}?${params}`);
  }

  buildPublicUrl(key: string): string {
    return `${FAKE_R2_HOST}/public/${key}`;
  }

  deleteObject(key: string): Promise<void> {
    if (this.failDeletes) return Promise.reject(new Error('R2 caído (e2e)'));
    this.objects.delete(key);
    return Promise.resolve();
  }

  /** Devuelve las claves que FALLARON (contrato de la Fase 7). */
  deleteObjects(keys: string[]): Promise<string[]> {
    if (this.failDeletes) return Promise.resolve([...keys]);
    keys.forEach((k) => this.objects.delete(k));
    return Promise.resolve([]);
  }
}

// ─── helpers ────────────────────────────────────────────────────────────────

const TEST_PASSWORD = 'E2eTest1234!';
const PREFIX = 'e2e-085';

interface LoginResponse {
  accessToken: string;
}

interface PresignedUrlResponse {
  attachmentId: string;
  presignedUrl: string;
  storageKey: string;
  expiresAt: string;
}

interface DownloadUrlResponse {
  attachmentId: string;
  url: string;
  expiresAt: string;
  mimeType: string;
  originalFilename: string | null;
}

interface SurveyResponsesPayload {
  surveyId: string;
  responses: Record<string, unknown>[];
}

interface DeletionPreview {
  farmerId: string;
  mediaObjects?: { deleted: number; queued: number };
}

interface PurgeResult {
  deleted: number;
  failed: number;
  remaining: number;
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

describe('spec-085 — privacidad de multimedia: URL firmada y borrado efectivo (e2e)', () => {
  let app: INestApplication<App>;
  let ds: DataSource;
  const r2 = new FakeR2();

  let adminToken: string;
  let pollsterToken: string;

  let instrumentId: string;
  let sectionId: string;
  let imageQuestionId: string;
  let textQuestionId: string;
  let spareImageQuestionId: string;

  let campaignId: string;
  let farmerId: string;
  let farmerSessionId: string;
  let farmerSurveyId: string;

  let orphanSessionId: string;
  let realSurveyId: string;
  let orphanSurveyId: string;

  const surveyIdsCreated: string[] = [];

  async function insertSurvey(
    sessionId: string,
    stepOrder: number,
  ): Promise<string> {
    const rows = await ds.query<{ survey_id: string }[]>(
      `INSERT INTO surveys (survey_id, sincronized, campaign_session_id, step_order)
       VALUES (gen_random_uuid(), false, $1, $2)
       RETURNING survey_id`,
      [sessionId, stepOrder],
    );
    const surveyId = rows[0].survey_id;
    await ds.query(
      `INSERT INTO surveys_instruments (survey_id, instrument_id) VALUES ($1, $2)`,
      [surveyId, instrumentId],
    );
    surveyIdsCreated.push(surveyId);
    return surveyId;
  }

  async function insertResponse(
    surveyId: string,
    questionId: string,
    textValue: string | null,
  ): Promise<string> {
    const rows = await ds.query<{ response_id: string }[]>(
      `INSERT INTO responses (response_id, survey_id, question_id, text_value)
       VALUES (gen_random_uuid(), $1, $2, $3)
       RETURNING response_id`,
      [surveyId, questionId, textValue],
    );
    return rows[0].response_id;
  }

  /** Ciclo real del cliente: presigned-url → PUT del binario → confirm. */
  async function uploadAttachment(
    token: string,
    surveyId: string,
    questionId: string,
    filename = 'foto-cultivo.jpg',
  ): Promise<PresignedUrlResponse> {
    const res = await request(app.getHttpServer())
      .post('/api/media-attachments/presigned-url')
      .set('Authorization', `Bearer ${token}`)
      .send({
        surveyId,
        questionId,
        mimeType: 'image/jpeg',
        fileSizeBytes: 1024,
        originalFilename: filename,
      })
      .expect(201);

    const body = res.body as PresignedUrlResponse;
    // El PUT real del binario contra la URL firmada (lo hace el cliente).
    r2.put(body.storageKey, Buffer.from(`binario de ${filename}`));

    await request(app.getHttpServer())
      .patch(`/api/media-attachments/${body.attachmentId}/confirm`)
      .set('Authorization', `Bearer ${token}`)
      .send({ actualFileSizeBytes: 1024 })
      .expect(200);

    return body;
  }

  async function attachmentRowExists(attachmentId: string): Promise<boolean> {
    const rows = await ds.query<{ attachment_id: string }[]>(
      `SELECT attachment_id FROM media_attachments WHERE attachment_id = $1`,
      [attachmentId],
    );
    return rows.length > 0;
  }

  async function deletionQueueKeys(): Promise<string[]> {
    const rows = await ds.query<{ storage_key: string }[]>(
      `SELECT storage_key FROM media_deletion_queue WHERE deleted_at IS NULL`,
    );
    return rows.map((r) => r.storage_key);
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(StorageService)
      .useValue(r2)
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

    // ── usuarios (admin: ve y borra · pollster: no debe ver evidencia, D3) ──
    const roles = await ds.query<{ role_id: string; name: string }[]>(
      `SELECT role_id, name FROM roles WHERE name IN ('admin', 'pollster')`,
    );
    const roleId = (name: string) =>
      roles.find((r) => r.name === name)!.role_id;

    const hash = await bcrypt.hash(TEST_PASSWORD, 10);
    for (const role of ['admin', 'pollster']) {
      const email = testEmail(role);
      const existing = await ds.query<{ user_id: string }[]>(
        `SELECT user_id FROM users WHERE email = $1`,
        [email],
      );
      if (!existing.length) {
        await ds.query(
          `INSERT INTO users (user_id, name, last_name, email, password, role_id, must_change_password)
           VALUES (gen_random_uuid(), 'E2E', 'PrivacidadMultimedia', $1, $2, $3, false)`,
          [email, hash, roleId(role)],
        );
      }
    }
    adminToken = await loginAs(app, testEmail('admin'));
    pollsterToken = await loginAs(app, testEmail('pollster'));

    // ── instrumento + sección + preguntas ──────────────────────────────────
    const instrumentRows = await ds.query<{ instrument_id: string }[]>(
      `INSERT INTO instruments (instrument_id, name, version, publish_date, is_active)
       VALUES (gen_random_uuid(), 'E2E 085 Instrument', 1, CURRENT_DATE, true)
       RETURNING instrument_id`,
    );
    instrumentId = instrumentRows[0].instrument_id;

    const sectionRows = await ds.query<{ section_id: string }[]>(
      `INSERT INTO sections (section_id, name, "order", instrument_id)
       VALUES (gen_random_uuid(), 'E2E 085 Section', 1, $1)
       RETURNING section_id`,
      [instrumentId],
    );
    sectionId = sectionRows[0].section_id;

    const typeRows = await ds.query<{ type_id: string; name: string }[]>(
      `SELECT type_id, name FROM types_of_questions WHERE name IN ('image', 'open_text')`,
    );
    const typeId = (name: string) =>
      typeRows.find((t) => t.name === name)!.type_id;

    const insertQuestion = async (
      text: string,
      type: string,
      order: number,
    ): Promise<string> => {
      const rows = await ds.query<{ question_id: string }[]>(
        `INSERT INTO questions (question_id, section_id, text, type_id, is_required, "order")
         VALUES (gen_random_uuid(), $1, $2, $3, false, $4)
         RETURNING question_id`,
        [sectionId, text, typeId(type), order],
      );
      return rows[0].question_id;
    };

    imageQuestionId = await insertQuestion('E2E 085 foto', 'image', 1);
    textQuestionId = await insertQuestion('E2E 085 texto', 'open_text', 2);
    spareImageQuestionId = await insertQuestion(
      'E2E 085 foto borrable',
      'image',
      3,
    );

    // ── campaña, agricultor, sesión y encuestas ────────────────────────────
    const campaignRows = await ds.query<{ campaign_id: string }[]>(
      `INSERT INTO campaigns (campaign_id, name, is_active)
       VALUES (gen_random_uuid(), 'E2E 085 Campaign', true)
       RETURNING campaign_id`,
    );
    campaignId = campaignRows[0].campaign_id;

    const farmerRows = await ds.query<{ id: string }[]>(
      `INSERT INTO farmers (id, name, document_id)
       VALUES (gen_random_uuid(), 'E2E 085 Productor TEST', '9000850001')
       RETURNING id`,
    );
    farmerId = farmerRows[0].id;

    const farmerSessionRows = await ds.query<{ session_id: string }[]>(
      `INSERT INTO campaign_sessions (session_id, campaign_id, farmer_id)
       VALUES (gen_random_uuid(), $1, $2)
       RETURNING session_id`,
      [campaignId, farmerId],
    );
    farmerSessionId = farmerSessionRows[0].session_id;
    farmerSurveyId = await insertSurvey(farmerSessionId, 1);

    const orphanSessionRows = await ds.query<{ session_id: string }[]>(
      `INSERT INTO campaign_sessions (session_id, campaign_id)
       VALUES (gen_random_uuid(), $1)
       RETURNING session_id`,
      [campaignId],
    );
    orphanSessionId = orphanSessionRows[0].session_id;
    realSurveyId = await insertSurvey(orphanSessionId, 1);
    await insertResponse(realSurveyId, textQuestionId, 'respuesta e2e-085');
    orphanSurveyId = await insertSurvey(orphanSessionId, 1); // vacía, hermana
  }, 45_000);

  afterAll(async () => {
    // Si `beforeAll` no llegó a conectar (sin túnel a la base de desarrollo),
    // no hay nada que limpiar: no enmascarar el error real con otro de teardown.
    if (!ds) {
      if (app) await app.close();
      return;
    }
    const sessionIds = [farmerSessionId, orphanSessionId].filter(Boolean);
    if (surveyIdsCreated.length) {
      await ds.query(
        `DELETE FROM media_attachments WHERE survey_id = ANY($1::uuid[])`,
        [surveyIdsCreated],
      );
      await ds.query(
        `DELETE FROM responses WHERE survey_id = ANY($1::uuid[])`,
        [surveyIdsCreated],
      );
      await ds.query(
        `DELETE FROM surveys_instruments WHERE survey_id = ANY($1::uuid[])`,
        [surveyIdsCreated],
      );
      await ds.query(`DELETE FROM surveys WHERE survey_id = ANY($1::uuid[])`, [
        surveyIdsCreated,
      ]);
    }
    if (sessionIds.length) {
      await ds.query(
        `DELETE FROM campaign_sessions WHERE session_id = ANY($1::uuid[])`,
        [sessionIds],
      );
    }
    await ds.query(`DELETE FROM campaigns WHERE campaign_id = $1`, [
      campaignId,
    ]);
    await ds.query(`DELETE FROM farmers WHERE document_id = $1`, [
      '9000850001',
    ]);
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
    // La cola es de la Fase 7: puede no existir todavía.
    await ds
      .query(`DELETE FROM media_deletion_queue WHERE storage_key LIKE $1`, [
        '%surveys/%',
      ])
      .catch(() => undefined);
    await app.close();
  }, 20_000);

  beforeEach(() => {
    r2.failDeletes = false;
  });

  // ── Criterio 1 — ciclo completo hasta la URL firmada ──────────────────────

  describe('ciclo presigned-url → PUT → confirm → download-url (criterio 1)', () => {
    it('TC-085-E01 · la URL firmada devuelta sirve el archivo subido', async () => {
      const uploaded = await uploadAttachment(
        adminToken,
        farmerSurveyId,
        imageQuestionId,
      );

      const res = await request(app.getHttpServer())
        .get(`/api/media-attachments/${uploaded.attachmentId}/download-url`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const body = res.body as DownloadUrlResponse;
      expect(body.attachmentId).toBe(uploaded.attachmentId);
      expect(body.url).toEqual(expect.any(String));
      expect(r2.serve(body.url)?.toString()).toContain('binario de');
    });

    it('TC-085-E02 · la respuesta trae expiresAt, mimeType y originalFilename', async () => {
      const uploaded = await uploadAttachment(
        adminToken,
        farmerSurveyId,
        imageQuestionId,
        'cedula.jpg',
      );

      const res = await request(app.getHttpServer())
        .get(`/api/media-attachments/${uploaded.attachmentId}/download-url`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const body = res.body as DownloadUrlResponse;
      expect(body.mimeType).toBe('image/jpeg');
      expect(body.originalFilename).toBe('cedula.jpg');
      expect(Number.isNaN(Date.parse(body.expiresAt))).toBe(false);
      expect(Date.parse(body.expiresAt)).toBeGreaterThan(Date.now());
    });

    it('TC-085-E03 · nunca expone storageKey ni publicUrl en la respuesta', async () => {
      const uploaded = await uploadAttachment(
        adminToken,
        farmerSurveyId,
        imageQuestionId,
      );

      const res = await request(app.getHttpServer())
        .get(`/api/media-attachments/${uploaded.attachmentId}/download-url`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body).not.toHaveProperty('storageKey');
      expect(res.body).not.toHaveProperty('publicUrl');
    });

    it('TC-085-E04 · confirm sigue respondiendo 200 con la clave publicUrl en null (criterio 7)', async () => {
      const presigned = await request(app.getHttpServer())
        .post('/api/media-attachments/presigned-url')
        .set('Authorization', `Bearer ${pollsterToken}`)
        .send({
          surveyId: farmerSurveyId,
          questionId: imageQuestionId,
          mimeType: 'image/jpeg',
          fileSizeBytes: 2048,
          originalFilename: 'desde-tableta.jpg',
        })
        .expect(201);

      const body = presigned.body as PresignedUrlResponse;
      r2.put(body.storageKey, Buffer.from('binario de tableta'));

      const confirmed = await request(app.getHttpServer())
        .patch(`/api/media-attachments/${body.attachmentId}/confirm`)
        .set('Authorization', `Bearer ${pollsterToken}`)
        .send({ actualFileSizeBytes: 2048 })
        .expect(200);

      expect(Object.keys(confirmed.body as object)).toContain('publicUrl');
      expect((confirmed.body as { publicUrl: unknown }).publicUrl).toBeNull();
    });
  });

  // ── Criterio 2 — guardas del endpoint de descarga ─────────────────────────

  describe('GET /api/media-attachments/:attachmentId/download-url — guardas (criterio 2)', () => {
    let attachmentId: string;

    beforeAll(async () => {
      const uploaded = await uploadAttachment(
        adminToken,
        farmerSurveyId,
        imageQuestionId,
        'guardas.jpg',
      );
      attachmentId = uploaded.attachmentId;
    });

    it('TC-085-E05 · responde 401 sin JWT', async () => {
      await request(app.getHttpServer())
        .get(`/api/media-attachments/${attachmentId}/download-url`)
        .expect(401);
    });

    it('TC-085-E06 · responde 403 con rol POLLSTER (D3)', async () => {
      await request(app.getHttpServer())
        .get(`/api/media-attachments/${attachmentId}/download-url`)
        .set('Authorization', `Bearer ${pollsterToken}`)
        .expect(403);
    });

    it('TC-085-E07 · responde 404 con un attachmentId inexistente', async () => {
      await request(app.getHttpServer())
        .get(
          '/api/media-attachments/00000000-0000-4000-8000-000000000000/download-url',
        )
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);
    });

    it('TC-085-E08 · responde 409 con un adjunto sin confirmar (status pending)', async () => {
      const presigned = await request(app.getHttpServer())
        .post('/api/media-attachments/presigned-url')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          surveyId: farmerSurveyId,
          questionId: imageQuestionId,
          mimeType: 'image/jpeg',
          fileSizeBytes: 512,
          originalFilename: 'sin-confirmar.jpg',
        })
        .expect(201);

      const { attachmentId: pendingId } =
        presigned.body as PresignedUrlResponse;

      await request(app.getHttpServer())
        .get(`/api/media-attachments/${pendingId}/download-url`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(409);
    });
  });

  // ── Criterio 4 — el payload deja de filtrar URLs y claves ─────────────────

  describe('payloads sin URL pública ni storageKey (criterio 4)', () => {
    it('TC-085-E09 · GET /api/surveys/:id/responses devuelve attachmentId y no publicUrl', async () => {
      const uploaded = await uploadAttachment(
        adminToken,
        farmerSurveyId,
        imageQuestionId,
        'en-respuesta.jpg',
      );
      const responseId = await insertResponse(
        farmerSurveyId,
        imageQuestionId,
        null,
      );
      await ds.query(
        `UPDATE media_attachments SET response_id = $1 WHERE attachment_id = $2`,
        [responseId, uploaded.attachmentId],
      );

      const res = await request(app.getHttpServer())
        .get(`/api/surveys/${farmerSurveyId}/responses`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const payload = res.body as SurveyResponsesPayload;
      const item = payload.responses.find((r) => r.responseId === responseId);

      expect(item).toBeDefined();
      expect(item!.attachmentId).toBe(uploaded.attachmentId);
      expect(Object.keys(item!)).not.toContain('publicUrl');
      // Serializado completo: ninguna URL de R2 puede viajar en el payload.
      expect(JSON.stringify(payload)).not.toContain('r2.fake.local');
    });

    it('TC-085-E10 · GET /api/surveys/:surveyId/media-attachments no devuelve storageKey ni publicUrl', async () => {
      await uploadAttachment(
        adminToken,
        farmerSurveyId,
        imageQuestionId,
        'listado.jpg',
      );

      const res = await request(app.getHttpServer())
        .get(`/api/surveys/${farmerSurveyId}/media-attachments`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const items = res.body as Record<string, unknown>[];
      expect(items.length).toBeGreaterThan(0);
      for (const item of items) {
        expect(Object.keys(item)).not.toContain('storageKey');
        expect(Object.keys(item)).not.toContain('publicUrl');
        expect(item.attachmentId).toEqual(expect.any(String));
      }
    });
  });

  // ── Criterios 8 y 9 — borrado efectivo y cola de reintento ────────────────

  describe('DELETE /api/farmers/:id/cascade — borrado efectivo en R2 (criterios 8 y 9)', () => {
    it('TC-085-E11 · un fallo de R2 no revierte el borrado en base de datos y encola la clave', async () => {
      // Este caso corre ANTES del borrado exitoso porque consume el agricultor.
      const uploaded = await uploadAttachment(
        adminToken,
        farmerSurveyId,
        imageQuestionId,
        'se-queda-en-cola.jpg',
      );
      r2.failDeletes = true;

      const res = await request(app.getHttpServer())
        .delete(`/api/farmers/${farmerId}/cascade`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const preview = res.body as DeletionPreview;
      expect(preview.mediaObjects).toBeDefined();
      expect(preview.mediaObjects!.queued).toBeGreaterThan(0);

      // El borrado en base de datos se completó pese al fallo de R2.
      expect(await attachmentRowExists(uploaded.attachmentId)).toBe(false);
      // El objeto sigue en el bucket, y su clave quedó en la cola.
      expect(r2.has(uploaded.storageKey)).toBe(true);
      expect(await deletionQueueKeys()).toContain(uploaded.storageKey);
    });

    it('TC-085-E12 · POST /api/media-attachments/purge-pending procesa la cola después', async () => {
      r2.failDeletes = false;

      const res = await request(app.getHttpServer())
        .post('/api/media-attachments/purge-pending')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({})
        .expect(201);

      const result = res.body as PurgeResult;
      expect(result.deleted).toBeGreaterThan(0);
      expect(result.failed).toBe(0);
      expect(result.remaining).toBe(0);

      const prefijo = `surveys/${farmerSurveyId}/`;
      expect(r2.keysUnder(prefijo)).toHaveLength(0);
      expect(await deletionQueueKeys()).toHaveLength(0);
    });

    it('TC-085-E13 · purge-pending es inaccesible para el rol pollster', async () => {
      await request(app.getHttpServer())
        .post('/api/media-attachments/purge-pending')
        .set('Authorization', `Bearer ${pollsterToken}`)
        .send({})
        .expect(403);
    });

    it('TC-085-E14 · el cascade informa mediaObjects.deleted y deja cero objetos del agricultor', async () => {
      // Segundo agricultor: el primero ya fue borrado por TC-085-E11.
      const rows = await ds.query<{ id: string }[]>(
        `INSERT INTO farmers (id, name, document_id)
         VALUES (gen_random_uuid(), 'E2E 085 Productor DOS TEST', '9000850002')
         RETURNING id`,
      );
      const otroFarmerId = rows[0].id;

      const sessionRows = await ds.query<{ session_id: string }[]>(
        `INSERT INTO campaign_sessions (session_id, campaign_id, farmer_id)
         VALUES (gen_random_uuid(), $1, $2)
         RETURNING session_id`,
        [campaignId, otroFarmerId],
      );
      const surveyId = await insertSurvey(sessionRows[0].session_id, 1);

      const a1 = await uploadAttachment(
        adminToken,
        surveyId,
        imageQuestionId,
        'evidencia-1.jpg',
      );
      const a2 = await uploadAttachment(
        adminToken,
        surveyId,
        imageQuestionId,
        'evidencia-2.jpg',
      );

      const res = await request(app.getHttpServer())
        .delete(`/api/farmers/${otroFarmerId}/cascade`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const preview = res.body as DeletionPreview;
      expect(preview.mediaObjects).toEqual({ deleted: 2, queued: 0 });
      expect(r2.has(a1.storageKey)).toBe(false);
      expect(r2.has(a2.storageKey)).toBe(false);
      expect(r2.keysUnder(`surveys/${surveyId}/`)).toHaveLength(0);
    });
  });

  // ── Criterio 10 — otros caminos de borrado ────────────────────────────────

  describe('otros caminos que eliminan filas de media_attachments (criterio 10)', () => {
    it('TC-085-E15 · borrar una encuesta huérfana elimina también sus objetos', async () => {
      const uploaded = await uploadAttachment(
        adminToken,
        orphanSurveyId,
        imageQuestionId,
        'en-huerfana.jpg',
      );

      await request(app.getHttpServer())
        .delete(`/api/surveys/${orphanSurveyId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(await attachmentRowExists(uploaded.attachmentId)).toBe(false);
      expect(r2.has(uploaded.storageKey)).toBe(false);
    });

    it('TC-085-E16 · borrar una pregunta multimedia con adjunto pendiente elimina sus objetos', async () => {
      // El adjunto se crea en `presigned-url`, antes de cualquier `Response`:
      // la guarda de «no borrar preguntas con respuestas» no lo protege.
      const presigned = await request(app.getHttpServer())
        .post('/api/media-attachments/presigned-url')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          surveyId: realSurveyId,
          questionId: spareImageQuestionId,
          mimeType: 'image/jpeg',
          fileSizeBytes: 900,
          originalFilename: 'pendiente-sin-respuesta.jpg',
        })
        .expect(201);

      const body = presigned.body as PresignedUrlResponse;
      r2.put(body.storageKey, Buffer.from('binario pendiente'));

      await request(app.getHttpServer())
        .delete(`/api/sections/${sectionId}/questions/${spareImageQuestionId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(204);

      expect(await attachmentRowExists(body.attachmentId)).toBe(false);
      expect(r2.has(body.storageKey)).toBe(false);
    });
  });
});
