/**
 * Spec 103 — Flujo del encuestador por productor en el móvil (H6): servidor.
 * `spec/103_encuestador_movil_por_productor.md` (raíz del ecosistema).
 *
 * ESTAS PRUEBAS NACEN EN ROJO (enfoque test-first): hoy no existe
 * `GET /api/coverage/farmers/snapshot` (404, también sin token). Los casos de
 * C5 y C10 que no tocan la foto documentan un comportamiento que ya existe
 * desde los specs 70, 95 y 102 (anclas de `POST /api/surveys`, idempotencia por
 * `clientSurveyId`, consentimiento por `surveyId`) y son la red de seguridad
 * del contrato que usará la cola offline del móvil.
 *
 * Criterios cubiertos (lado servidor): C5, C7, C10 y C12. La parte pura de C12
 * (compactación y lista blanca) vive en
 * `src/coverage/e2e-103-coverage-snapshot.spec.ts`.
 *
 * Contrato que asume esta prueba para la foto (ver la cabecera del unitario):
 *   { computedAt, instruments: CoverageColumn[], farmers: SnapshotFarmer[] }
 * con una entrada por productor, sin `no_aplica`, `documentId: null` con API
 * key y sin teléfono, correo ni coordenadas.
 *
 * C7 reproduce lo que hará la cola del móvil al sincronizar una encuesta de
 * cultivo sin sesión: `POST /api/surveys` (con `clientSurveyId` y anclas) →
 * `POST /api/responses/batch` → `PATCH /api/surveys/:id/sync`.
 *
 * C10 simula la resolución de identidad del productor provisional llamando a
 * `ConsentRecordsService.linkOrphansToFarmerBySurvey`, el mismo paso que
 * ejecuta `FarmerExtractionService` tras extraer el S_REG.
 *
 * Requiere un documento de consentimiento `published` en la base (lo hay
 * desde el spec 78); si no existe, los casos de consentimiento fallan con 404.
 *
 * ENTORNO: SOLO contra la base de desarrollo (`DATABASE_URL` activa del `.env`,
 * Neon `sosagro-dev`), NUNCA contra producción. Identidades con prefijo
 * `Spec103` / `e2e-103`. Todo se elimina en `afterAll`.
 */

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getOptionsToken } from '@nestjs/throttler';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { AppModule } from '../src/app.module';
import { ConsentRecordsService } from '../src/consents/consent-records.service';

jest.setTimeout(120_000);

const TEST_PASSWORD = 'E2eTest1234!';
const PREFIX = 'e2e-103';
const RUN = Date.now().toString().slice(-6);

/** Tope de la Fase 1 (DM2): 1,5 MB y 3 s en desarrollo. */
const MAX_BYTES = 1.5 * 1024 * 1024;
const MAX_MS = 3000;

const DOCUMENT_A = `103${RUN}01`;
const PHONE_A = `310${RUN}7`;
const EMAIL_A = `spec103.${RUN}@example.com`;
const LATITUDE = 6.1034567;
const LONGITUDE = -75.6034567;

type Status = 'aplicado' | 'parcial' | 'falta' | 'no_aplica';

interface Summary {
  applicable: number;
  applied: number;
  partial: number;
  pending: number;
  notApplicable: number;
  instrumentsWithoutScope: number;
}

interface CoverageUnit {
  unitType: 'farmer' | 'farm' | 'farm_crop';
  farmId?: string;
  farmCropId?: string;
  status: Status;
  surveyId: string | null;
  surveyCount: number;
  coveredByOtherFarmer?: boolean;
}

interface FarmerCoverageBody {
  farmerId: string;
  summary: Summary;
  farms: {
    farmId: string;
    role: string | null;
    isPrimary: boolean;
    town: { townId: string } | null;
    crops: { farmCropId: string; cropId: string }[];
  }[];
  instruments: {
    instrumentId: string;
    status: Status;
    surveyCount: number;
    latestSurvey: { surveyId: string; createdAt: string } | null;
    units: CoverageUnit[];
  }[];
  warnings: string[];
}

interface SnapshotInstrument {
  instrumentId: string;
  status: Exclude<Status, 'no_aplica'>;
  surveyCount: number;
  latestSurvey: {
    surveyId: string;
    createdAt: string;
    farmId: string | null;
    farmCropId: string | null;
    farmerId: string | null;
  } | null;
  units: CoverageUnit[];
}

interface SnapshotFarmer {
  farmerId: string;
  name: string;
  documentId: string | null;
  departmentId: string | null;
  townId: string | null;
  farmsCount: number;
  cropIds: string[];
  hasPendingConsent: boolean;
  summary: Summary;
  warnings: string[];
  farms: {
    farmId: string;
    name: string;
    role: string | null;
    isPrimary: boolean;
    town: { townId: string; name: string } | null;
    crops: { farmCropId: string; cropId: string; name: string }[];
  }[];
  instruments: SnapshotInstrument[];
}

interface SnapshotBody {
  computedAt: string;
  instruments: { instrumentId: string; memberIds: string[] }[];
  farmers: SnapshotFarmer[];
}

interface LoginResponse {
  accessToken: string;
}

/** Todas las claves de un valor JSON, a cualquier profundidad. */
function allKeys(value: unknown, acc = new Set<string>()): Set<string> {
  if (Array.isArray(value)) {
    for (const v of value) allKeys(v, acc);
  } else if (value !== null && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      acc.add(k);
      allKeys(v, acc);
    }
  }
  return acc;
}

describe('Spec 103 — encuestador móvil por productor (e2e)', () => {
  let app: INestApplication<App>;
  let ds: DataSource;
  let adminToken: string;
  let researcherToken: string;
  let pollsterToken: string;
  let apiKey: string;

  // A: finca FA (con coordenadas) y cultivo CA. B: finca FB y cultivo CB.
  // C: productor "resuelto" a partir del provisional de C10.
  let farmerA: string;
  let farmerB: string;
  let farmerC: string;
  let farmA: string;
  let farmB: string;
  let cropA: string;
  let cropB: string;
  let cropInstrument: string;
  let farmerInstrument: string;
  let cropQuestion: string;
  let farmerQuestion: string;
  const surveyIds: string[] = [];

  const CLIENT_SURVEY_CROP = `local_survey_${PREFIX}-${RUN}-crop`;
  const CLIENT_SURVEY_SREG = `local_survey_${PREFIX}-${RUN}-sreg`;
  const CLIENT_FARMER = `local_farmer_${PREFIX}-${RUN}`;
  const ACCEPTED_AT = '2026-11-01T14:30:00.000Z';

  const http = () => request(app.getHttpServer());
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  async function ensureUser(
    role: string,
  ): Promise<{ token: string; userId: string }> {
    const email = `${PREFIX}-${role}@test.local`;
    let rows = await ds.query<{ user_id: string }[]>(
      `SELECT user_id FROM users WHERE email = $1`,
      [email],
    );
    if (!rows.length) {
      const roles = await ds.query<{ role_id: string }[]>(
        `SELECT role_id FROM roles WHERE name = $1`,
        [role],
      );
      const hash = await bcrypt.hash(TEST_PASSWORD, 10);
      rows = await ds.query<{ user_id: string }[]>(
        `INSERT INTO users (user_id, name, last_name, email, password, role_id, must_change_password)
         VALUES (gen_random_uuid(), 'E2E', 'Spec103', $1, $2, $3, false)
         RETURNING user_id`,
        [email, hash, roles[0].role_id],
      );
    }
    const login = await http()
      .post('/api/auth/login')
      .send({ email, password: TEST_PASSWORD })
      .expect(200);
    return {
      token: (login.body as LoginResponse).accessToken,
      userId: rows[0].user_id,
    };
  }

  async function insertFarmer(
    label: string,
    extra: { document?: string; phone?: string; email?: string } = {},
  ) {
    const [row] = await ds.query<{ id: string }[]>(
      `INSERT INTO farmers (id, name, document_id, phone, email)
       VALUES (gen_random_uuid(), $1, $2, $3, $4) RETURNING id`,
      [
        `Spec103 Productor ${label} ${RUN}`,
        extra.document ?? `103${RUN}${label}`,
        extra.phone ?? null,
        extra.email ?? null,
      ],
    );
    return row.id;
  }

  async function insertFarmWithCrop(
    farmerId: string,
    label: string,
    coords: { latitude: number; longitude: number } | null = null,
  ) {
    const [farm] = await ds.query<{ farm_id: string }[]>(
      `INSERT INTO farms (farm_id, name, latitude, longitude)
       VALUES (gen_random_uuid(), $1, $2, $3)
       RETURNING farm_id`,
      [
        `Spec103 Finca ${label} ${RUN}`,
        coords?.latitude ?? null,
        coords?.longitude ?? null,
      ],
    );
    await ds.query(
      `INSERT INTO farmer_farms (farmer_id, farm_id, role, is_primary, source)
       VALUES ($1, $2, 'owner', true, 'e2e-103')`,
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

  /** Instrumento activo con una sección y una pregunta `open_text`. */
  async function insertInstrument(label: string, scope: string) {
    const [instrument] = await ds.query<{ instrument_id: string }[]>(
      `INSERT INTO instruments (instrument_id, name, version, publish_date, is_active, scope_level)
       VALUES (gen_random_uuid(), $1, 1, now()::date, true, $2)
       RETURNING instrument_id`,
      [`Spec103 ${label} ${RUN}`, scope],
    );
    const [section] = await ds.query<{ section_id: string }[]>(
      `INSERT INTO sections (section_id, name, "order", instrument_id)
       VALUES (gen_random_uuid(), $1, 1, $2) RETURNING section_id`,
      [`Spec103 Sección ${label}`, instrument.instrument_id],
    );
    const [type] = await ds.query<{ type_id: string }[]>(
      `SELECT type_id FROM types_of_questions WHERE name = 'open_text'`,
    );
    const [question] = await ds.query<{ question_id: string }[]>(
      `INSERT INTO questions (question_id, section_id, text, type_id, is_required, "order")
       VALUES (gen_random_uuid(), $1, $2, $3, false, 1) RETURNING question_id`,
      [section.section_id, `Spec103 Pregunta ${label}`, type.type_id],
    );
    return {
      instrumentId: instrument.instrument_id,
      questionId: question.question_id,
    };
  }

  function createSurvey(token: string, body: Record<string, unknown>) {
    return http().post('/api/surveys').set(auth(token)).send(body);
  }

  /** Lo que hace la cola del móvil al materializar una encuesta terminada. */
  async function syncResponses(surveyId: string, questionId: string) {
    await http()
      .post('/api/responses/batch')
      .set(auth(pollsterToken))
      .send([{ surveyId, questionId, textValue: `respuesta ${PREFIX}` }])
      .expect(201);
    await http()
      .patch(`/api/surveys/${surveyId}/sync`)
      .set(auth(pollsterToken))
      .expect(200);
  }

  function consent(token: string, anchor: Record<string, string>) {
    return http()
      .post('/api/consents')
      .set(auth(token))
      .send({
        ...anchor,
        acceptedDataProcessing: true,
        respondentName: `Spec103 ${RUN}`,
        acceptedAt: ACCEPTED_AT,
      });
  }

  async function snapshot(token = pollsterToken): Promise<SnapshotBody> {
    const res = await http()
      .get('/api/coverage/farmers/snapshot')
      .set(auth(token))
      .expect(200);
    return res.body as SnapshotBody;
  }

  function farmerOf(body: SnapshotBody, farmerId: string): SnapshotFarmer {
    const found = body.farmers.find((f) => f.farmerId === farmerId);
    if (!found) throw new Error(`productor ${farmerId} ausente en la foto`);
    return found;
  }

  async function coverageOf(farmerId: string): Promise<FarmerCoverageBody> {
    const res = await http()
      .get(`/api/farmers/${farmerId}/coverage`)
      .set(auth(pollsterToken))
      .expect(200);
    return res.body as FarmerCoverageBody;
  }

  /** La entrada de la foto coincide con el detalle del spec 100. */
  function expectCoherent(entry: SnapshotFarmer, detail: FarmerCoverageBody) {
    expect(entry.summary).toEqual(detail.summary);
    expect(entry.warnings).toEqual(detail.warnings);
    expect(entry.farmsCount).toBe(detail.farms.length);
    expect(
      entry.farms.map((f) => ({
        farmId: f.farmId,
        role: f.role,
        isPrimary: f.isPrimary,
        townId: f.town?.townId ?? null,
        farmCropIds: f.crops.map((c) => c.farmCropId),
      })),
    ).toEqual(
      detail.farms.map((f) => ({
        farmId: f.farmId,
        role: f.role,
        isPrimary: f.isPrimary,
        townId: f.town?.townId ?? null,
        farmCropIds: f.crops.map((c) => c.farmCropId),
      })),
    );
    const applicable = detail.instruments.filter(
      (i) => i.status !== 'no_aplica',
    );
    expect(entry.instruments.map((i) => i.instrumentId).sort()).toEqual(
      applicable.map((i) => i.instrumentId).sort(),
    );
    for (const original of applicable) {
      const compact = entry.instruments.find(
        (i) => i.instrumentId === original.instrumentId,
      )!;
      expect(compact.status).toBe(original.status);
      expect(compact.surveyCount).toBe(original.surveyCount);
      expect(compact.latestSurvey?.surveyId ?? null).toBe(
        original.latestSurvey?.surveyId ?? null,
      );
      expect(compact.latestSurvey?.createdAt ?? null).toBe(
        original.latestSurvey?.createdAt ?? null,
      );
      expect(compact.units).toEqual(original.units);
    }
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

    const admin = await ensureUser('admin');
    adminToken = admin.token;
    researcherToken = (await ensureUser('researcher')).token;
    pollsterToken = (await ensureUser('pollster')).token;

    const key = await http()
      .post('/api/api-keys')
      .set(auth(adminToken))
      .send({
        name: `${PREFIX} read ${RUN}`,
        scopes: ['read'],
        userId: admin.userId,
      })
      .expect(201);
    apiKey = (key.body as { key: string }).key;

    farmerA = await insertFarmer('A', {
      document: DOCUMENT_A,
      phone: PHONE_A,
      email: EMAIL_A,
    });
    farmerB = await insertFarmer('B');
    farmerC = await insertFarmer('C');
    ({ farmId: farmA, farmCropId: cropA } = await insertFarmWithCrop(
      farmerA,
      'A',
      { latitude: LATITUDE, longitude: LONGITUDE },
    ));
    ({ farmId: farmB, farmCropId: cropB } = await insertFarmWithCrop(
      farmerB,
      'B',
    ));

    ({ instrumentId: cropInstrument, questionId: cropQuestion } =
      await insertInstrument('Por cultivo', 'farm_crop'));
    ({ instrumentId: farmerInstrument, questionId: farmerQuestion } =
      await insertInstrument('Por productor', 'farmer'));
  });

  afterAll(async () => {
    const safe = async (sql: string, params: unknown[] = []) => {
      try {
        await ds.query(sql, params);
      } catch {
        /* limpieza tolerante */
      }
    };
    const farmers = [farmerA, farmerB, farmerC].filter(Boolean);
    const farms = [farmA, farmB].filter(Boolean);
    const instruments = [cropInstrument, farmerInstrument].filter(Boolean);
    // Por si una implementación futura reintenta y crea filas no registradas.
    const extra = await ds
      .query<{ survey_id: string }[]>(
        `SELECT survey_id FROM surveys
          WHERE client_survey_id LIKE $1 OR client_farmer_id = $2`,
        [`local_survey_${PREFIX}-${RUN}-%`, CLIENT_FARMER],
      )
      .catch(() => [] as { survey_id: string }[]);
    const allSurveys = [
      ...new Set([...surveyIds, ...extra.map((r) => r.survey_id)]),
    ];
    await safe(
      `DELETE FROM consent_records
        WHERE farmer_id = ANY($1::uuid[]) OR survey_id = ANY($2::uuid[])`,
      [farmers, allSurveys],
    );
    await safe(`DELETE FROM responses WHERE survey_id = ANY($1::uuid[])`, [
      allSurveys,
    ]);
    await safe(
      `DELETE FROM surveys_instruments WHERE survey_id = ANY($1::uuid[])`,
      [allSurveys],
    );
    await safe(`DELETE FROM surveys WHERE survey_id = ANY($1::uuid[])`, [
      allSurveys,
    ]);
    await safe(
      `DELETE FROM farmer_client_aliases WHERE client_farmer_id = $1`,
      [CLIENT_FARMER],
    );
    await safe(`DELETE FROM farms_crops WHERE farm_id = ANY($1::uuid[])`, [
      farms,
    ]);
    await safe(`DELETE FROM farmer_farms WHERE farmer_id = ANY($1::uuid[])`, [
      farmers,
    ]);
    await safe(`DELETE FROM farms WHERE farm_id = ANY($1::uuid[])`, [farms]);
    await safe(`DELETE FROM farmers WHERE id = ANY($1::uuid[])`, [farmers]);
    await safe(
      `DELETE FROM questions WHERE section_id IN (
         SELECT section_id FROM sections WHERE instrument_id = ANY($1::uuid[]))`,
      [instruments],
    );
    await safe(`DELETE FROM sections WHERE instrument_id = ANY($1::uuid[])`, [
      instruments,
    ]);
    await safe(
      `DELETE FROM instruments WHERE instrument_id = ANY($1::uuid[])`,
      [instruments],
    );
    await safe(
      `DELETE FROM api_keys WHERE user_id IN (
         SELECT user_id FROM users WHERE email LIKE $1)`,
      [`${PREFIX}-%`],
    );
    await safe(`DELETE FROM users WHERE email LIKE $1`, [`${PREFIX}-%`]);
    await app.close();
  });

  describe('C12 — GET /api/coverage/farmers/snapshot', () => {
    it('responde 200 a ADMIN, RESEARCHER y POLLSTER', async () => {
      for (const token of [adminToken, researcherToken, pollsterToken]) {
        await http()
          .get('/api/coverage/farmers/snapshot')
          .set(auth(token))
          .expect(200);
      }
    });

    it('responde 401 sin token', async () => {
      await http().get('/api/coverage/farmers/snapshot').expect(401);
    });

    it('trae computedAt global, las columnas una vez y una entrada por productor', async () => {
      const body = await snapshot();
      expect(typeof body.computedAt).toBe('string');
      expect(Number.isNaN(Date.parse(body.computedAt))).toBe(false);

      const columnIds = body.instruments.map((c) => c.instrumentId);
      expect(columnIds).toEqual(
        expect.arrayContaining([cropInstrument, farmerInstrument]),
      );
      for (const c of body.instruments) {
        expect(Array.isArray(c.memberIds)).toBe(true);
      }

      const ids = body.farmers.map((f) => f.farmerId);
      expect(new Set(ids).size).toBe(ids.length);
      const [{ n }] = await ds.query<{ n: number }[]>(
        `SELECT count(*)::int AS n FROM farmers`,
      );
      expect(ids).toHaveLength(n);
      expect(ids).toEqual(expect.arrayContaining([farmerA, farmerB, farmerC]));
    });

    it('las columnas coinciden con las de GET /api/coverage/farmers', async () => {
      const [body, list] = await Promise.all([
        snapshot(),
        http()
          .get('/api/coverage/farmers')
          .set(auth(pollsterToken))
          .expect(200),
      ]);
      const listIds = (
        list.body as { instruments: { instrumentId: string }[] }
      ).instruments.map((c) => c.instrumentId);
      expect(body.instruments.map((c) => c.instrumentId)).toEqual(listIds);
    });

    it('es compacta: sin computedAt por productor, sin metadatos de columna y sin no_aplica', async () => {
      const body = await snapshot();
      const columnIds = new Set(body.instruments.map((c) => c.instrumentId));
      for (const f of body.farmers) {
        expect(f).not.toHaveProperty('computedAt');
        for (const i of f.instruments) {
          expect(columnIds.has(i.instrumentId)).toBe(true);
          expect((i.status as string) === 'no_aplica').toBe(false);
          expect(i).not.toHaveProperty('memberIds');
          expect(i).not.toHaveProperty('name');
        }
      }
    });

    it('no incluye teléfono, correo ni coordenadas', async () => {
      const body = await snapshot(adminToken);
      const keys = allKeys(body);
      for (const key of ['phone', 'email', 'latitude', 'longitude']) {
        expect(keys.has(key)).toBe(false);
      }
      const raw = JSON.stringify(body);
      expect(raw).not.toContain(PHONE_A);
      expect(raw).not.toContain(EMAIL_A);
      expect(raw).not.toContain(String(LATITUDE));
      expect(raw).not.toContain(String(LONGITUDE));
    });

    it('con JWT trae el documentId; con API key llega en null', async () => {
      const jwt = await snapshot(adminToken);
      expect(farmerOf(jwt, farmerA).documentId).toBe(DOCUMENT_A);

      const res = await http()
        .get('/api/coverage/farmers/snapshot')
        .set('X-API-Key', apiKey)
        .expect(200);
      const body = res.body as SnapshotBody;
      expect(body.farmers.length).toBeGreaterThan(0);
      expect(body.farmers.every((f) => f.documentId === null)).toBe(true);
      expect(JSON.stringify(body)).not.toContain(DOCUMENT_A);
    });

    it('conserva fincas con rol y municipio, y cultivos con farmCropId', async () => {
      const a = farmerOf(await snapshot(), farmerA);
      expect(a.farmsCount).toBe(1);
      expect(a.farms).toHaveLength(1);
      expect(a.farms[0]).toMatchObject({
        farmId: farmA,
        role: 'owner',
        isPrimary: true,
      });
      expect(a.farms[0].crops.map((c) => c.farmCropId)).toEqual([cropA]);
      expect(a.cropIds).toEqual([a.farms[0].crops[0].cropId]);

      const crop = a.instruments.find(
        (i) => i.instrumentId === cropInstrument,
      )!;
      expect(
        crop.units.map((u) => [u.unitType, u.farmId, u.farmCropId]),
      ).toEqual([['farm_crop', farmA, cropA]]);
    });

    it('es coherente con GET /api/farmers/:id/coverage para el mismo productor', async () => {
      const body = await snapshot();
      for (const farmerId of [farmerA, farmerB, farmerC]) {
        expectCoherent(farmerOf(body, farmerId), await coverageOf(farmerId));
      }
    });

    it('cumple el tope de la Fase 1: menos de 1,5 MB y 3 s', async () => {
      await snapshot(); // calentamiento: conexiones y planes de consulta
      const start = Date.now();
      const res = await http()
        .get('/api/coverage/farmers/snapshot')
        .set(auth(pollsterToken))
        .expect(200);
      const elapsed = Date.now() - start;
      const body = res.body as { farmers: unknown[] };
      const bytes = Buffer.byteLength(JSON.stringify(body), 'utf8');
      // Medición de la Fase 1 (se anota en el spec).
      process.stdout.write(
        `SNAPSHOT_METRICS ${bytes} bytes, ${elapsed} ms, ${body.farmers.length} farmers\n`,
      );
      expect(elapsed).toBeLessThan(MAX_MS);
      expect(bytes).toBeLessThan(MAX_BYTES);
    });
  });

  describe('C5 — encuesta anclada sin sesión, idempotente por clientSurveyId', () => {
    let surveyId: string;

    it('crea la encuesta de cultivo con farmerId, farmId y farmCropId, sin campaignSessionId', async () => {
      const res = await createSurvey(pollsterToken, {
        instrumentIds: [cropInstrument],
        farmerId: farmerA,
        farmId: farmA,
        farmCropId: cropA,
        clientSurveyId: CLIENT_SURVEY_CROP,
      }).expect(201);
      surveyId = (res.body as { surveyId: string }).surveyId;
      surveyIds.push(surveyId);

      const [row] = await ds.query<
        {
          farmer_id: string;
          farm_id: string;
          farm_crop_id: string;
          campaign_session_id: string | null;
          step_order: number | null;
        }[]
      >(
        `SELECT farmer_id, farm_id, farm_crop_id, campaign_session_id, step_order
           FROM surveys WHERE survey_id = $1`,
        [surveyId],
      );
      expect(row).toEqual({
        farmer_id: farmerA,
        farm_id: farmA,
        farm_crop_id: cropA,
        campaign_session_id: null,
        step_order: null,
      });
    });

    it('el reintento con el mismo clientSurveyId devuelve la misma encuesta sin duplicarla', async () => {
      const again = await createSurvey(pollsterToken, {
        instrumentIds: [cropInstrument],
        farmerId: farmerA,
        farmId: farmA,
        farmCropId: cropA,
        clientSurveyId: CLIENT_SURVEY_CROP,
      });
      expect([200, 201]).toContain(again.status);
      expect((again.body as { surveyId: string }).surveyId).toBe(surveyId);

      const [{ n }] = await ds.query<{ n: number }[]>(
        `SELECT count(*)::int AS n FROM surveys WHERE client_survey_id = $1`,
        [CLIENT_SURVEY_CROP],
      );
      expect(n).toBe(1);
    });

    it('rechaza un cultivo que no es de la finca con 400', async () => {
      await createSurvey(pollsterToken, {
        instrumentIds: [cropInstrument],
        farmerId: farmerA,
        farmId: farmA,
        farmCropId: cropB,
        clientSurveyId: `local_survey_${PREFIX}-${RUN}-bad`,
      }).expect(400);
    });
  });

  describe('C7 — la encuesta de cultivo sincronizada aparece «aplicado» en la foto', () => {
    it('antes de sincronizar responses la unidad sigue en falta', async () => {
      const a = farmerOf(await snapshot(), farmerA);
      const crop = a.instruments.find(
        (i) => i.instrumentId === cropInstrument,
      )!;
      expect(crop.status).toBe('falta');
      expect(crop.units.find((u) => u.farmCropId === cropA)?.status).toBe(
        'falta',
      );
    });

    it('tras responses/batch y sync la foto la muestra aplicada, una sola vez', async () => {
      const [surveyId] = surveyIds;
      expect(surveyId).toBeDefined();
      await syncResponses(surveyId, cropQuestion);

      const a = farmerOf(await snapshot(), farmerA);
      const crop = a.instruments.find(
        (i) => i.instrumentId === cropInstrument,
      )!;
      expect(crop.status).toBe('aplicado');
      expect(crop.surveyCount).toBe(1);
      const unit = crop.units.find((u) => u.farmCropId === cropA)!;
      expect(unit).toMatchObject({
        status: 'aplicado',
        surveyId,
        surveyCount: 1,
      });
      expect(crop.latestSurvey).toMatchObject({
        surveyId,
        farmId: farmA,
        farmCropId: cropA,
        farmerId: farmerA,
      });
      expect(Number.isNaN(Date.parse(crop.latestSurvey!.createdAt))).toBe(
        false,
      );
    });

    it('un reintento de la cola (mismo clientSurveyId) no la cuenta dos veces', async () => {
      const [surveyId] = surveyIds;
      const again = await createSurvey(pollsterToken, {
        instrumentIds: [cropInstrument],
        farmerId: farmerA,
        farmId: farmA,
        farmCropId: cropA,
        clientSurveyId: CLIENT_SURVEY_CROP,
      });
      expect((again.body as { surveyId: string }).surveyId).toBe(surveyId);

      const body = await snapshot();
      const a = farmerOf(body, farmerA);
      const crop = a.instruments.find(
        (i) => i.instrumentId === cropInstrument,
      )!;
      expect(crop.surveyCount).toBe(1);
      expectCoherent(a, await coverageOf(farmerA));
    });

    it('no cubre el cultivo de otro productor', async () => {
      const b = farmerOf(await snapshot(), farmerB);
      const crop = b.instruments.find(
        (i) => i.instrumentId === cropInstrument,
      )!;
      expect(crop.status).toBe('falta');
      expect(crop.units.find((u) => u.farmCropId === cropB)?.status).toBe(
        'falta',
      );
    });
  });

  describe('C10 — consentimiento sin sesión anclado a la encuesta de un productor provisional', () => {
    let sregSurveyId: string;
    let consentId: string;

    it('la encuesta con clientFarmerId (sin alias) se crea sin productor ni sesión', async () => {
      const res = await createSurvey(pollsterToken, {
        instrumentIds: [farmerInstrument],
        clientFarmerId: CLIENT_FARMER,
        clientSurveyId: CLIENT_SURVEY_SREG,
      }).expect(201);
      sregSurveyId = (res.body as { surveyId: string }).surveyId;
      surveyIds.push(sregSurveyId);

      const [row] = await ds.query<
        {
          farmer_id: string | null;
          client_farmer_id: string;
          campaign_session_id: string | null;
        }[]
      >(
        `SELECT farmer_id, client_farmer_id, campaign_session_id
           FROM surveys WHERE survey_id = $1`,
        [sregSurveyId],
      );
      expect(row).toEqual({
        farmer_id: null,
        client_farmer_id: CLIENT_FARMER,
        campaign_session_id: null,
      });
      await syncResponses(sregSurveyId, farmerQuestion);
    });

    it('POST /api/consents con surveyId responde 201 y conserva la fecha real de aceptación', async () => {
      const created = await consent(pollsterToken, {
        surveyId: sregSurveyId,
      }).expect(201);
      consentId = (created.body as { consentRecordId: string }).consentRecordId;

      const [row] = await ds.query<
        {
          survey_id: string;
          farmer_id: string | null;
          session_id: string | null;
          accepted_at: Date;
        }[]
      >(
        `SELECT survey_id, farmer_id, session_id, accepted_at
           FROM consent_records WHERE consent_record_id = $1`,
        [consentId],
      );
      expect(row.survey_id).toBe(sregSurveyId);
      expect(row.farmer_id).toBeNull();
      expect(row.session_id).toBeNull();
      expect(new Date(row.accepted_at).toISOString()).toBe(ACCEPTED_AT);
    });

    it('el reintento de la cola responde 200 con la misma constancia', async () => {
      const again = await consent(pollsterToken, {
        surveyId: sregSurveyId,
      }).expect(200);
      expect((again.body as { consentRecordId: string }).consentRecordId).toBe(
        consentId,
      );
    });

    it('nunca acepta un id local como ancla (400)', async () => {
      await consent(pollsterToken, {
        surveyId: CLIENT_SURVEY_SREG,
      }).expect(400);
      await consent(pollsterToken, { farmerId: CLIENT_FARMER }).expect(400);
    });

    it('al resolverse el productor, la constancia queda vinculada y la foto lo muestra con consentimiento vigente', async () => {
      // Antes: el productor "real" aún no tiene constancia.
      expect(farmerOf(await snapshot(), farmerC).hasPendingConsent).toBe(true);

      // Paso que ejecuta FarmerExtractionService tras extraer el S_REG.
      await ds.query(`UPDATE surveys SET farmer_id = $1 WHERE survey_id = $2`, [
        farmerC,
        sregSurveyId,
      ]);
      await app
        .get(ConsentRecordsService)
        .linkOrphansToFarmerBySurvey(sregSurveyId, farmerC);

      const [row] = await ds.query<{ farmer_id: string | null }[]>(
        `SELECT farmer_id FROM consent_records WHERE consent_record_id = $1`,
        [consentId],
      );
      expect(row.farmer_id).toBe(farmerC);

      const c = farmerOf(await snapshot(), farmerC);
      expect(c.hasPendingConsent).toBe(false);
      const farmerCol = c.instruments.find(
        (i) => i.instrumentId === farmerInstrument,
      )!;
      expect(farmerCol.status).toBe('aplicado');
    });

    it('por productor existente: farmerId también funciona y la foto lo refleja', async () => {
      expect(farmerOf(await snapshot(), farmerB).hasPendingConsent).toBe(true);
      await consent(pollsterToken, { farmerId: farmerB }).expect(201);
      expect(farmerOf(await snapshot(), farmerB).hasPendingConsent).toBe(false);
    });
  });
});
