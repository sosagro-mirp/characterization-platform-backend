/**
 * Spec 100 — Cobertura de instrumentos por productor: endpoints.
 * `spec/100_cobertura_por_productor.md` (raíz del ecosistema).
 *
 * ESTAS PRUEBAS NACEN EN ROJO (enfoque test-first): hoy no existen
 * `GET /api/farmers/:farmerId/coverage` ni `GET /api/coverage/farmers` (404), y
 * `GET /api/farmers/:farmerId/discrepancies` no trae `liveValue`, `isStale` ni
 * `canApply`. Las reglas finas del cálculo viven en
 * `src/coverage/e2e-100-farmer-coverage-calculator.spec.ts` (C1–C10).
 *
 * Criterios cubiertos: C11–C17 (`Cnn`). C18–C20 (MCP) están en
 * `mcp/test/e2e-100-mcp-cobertura-productor.spec.ts`.
 *
 * C14 (salida de `/api/production-units` idéntica tras el refactor): la red de
 * seguridad principal es `e2e-098-*` y `e2e-099-*` en verde. Aquí se verifican
 * invariantes de la vista sobre los datos de la suite y su coherencia con la
 * cobertura por productor.
 *
 * C17 se mide sobre el volumen que tenga la base de desarrollo; para que valga
 * como criterio, la base debe tener un volumen equivalente al de producción
 * (~150 productores).
 *
 * ENTORNO: SOLO contra la base de desarrollo (`DATABASE_URL` activa del `.env`,
 * Neon `sosagro-dev`), NUNCA contra producción. Identidades con prefijo
 * `Spec100` / `e2e-100`. Todo se elimina en `afterAll`.
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
const PREFIX = 'e2e-100';
const RUN = Date.now().toString().slice(-6);
const MISSING_UUID = '00000000-0000-4000-8000-000000000000';

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
  status: Status;
  coveredByOtherFarmer?: boolean;
}

interface FarmerCoverageBody {
  farmerId: string;
  name: string;
  computedAt: string;
  summary: Summary;
  farms: { farmId: string; role: string | null; isPrimary: boolean }[];
  instruments: {
    instrumentId: string;
    status: Status;
    surveyCount: number;
    units: CoverageUnit[];
  }[];
  warnings: string[];
  unlocatedSurveys: { surveyId: string; reason: string }[];
  unsyncedWithResponses: number;
}

interface FarmerCoverageRow {
  farmerId: string;
  name: string;
  documentId: string | null;
  primaryFarm: { farmId: string } | null;
  farmsCount: number;
  cropIds: string[];
  hasPendingConsent: boolean;
  openDiscrepancies: number;
  summary: Summary;
  statusByInstrument: Record<string, Status>;
  warnings: string[];
}

interface FarmerCoverageListBody {
  instruments: { instrumentId: string }[];
  rows: FarmerCoverageRow[];
  summary: { farmers: number; withoutFarm: number; fullyCovered: number };
}

interface ProductionUnitsBody {
  instruments: { instrumentId: string }[];
  rows: {
    farmId: string;
    farmers: { farmerId: string }[];
    coverage: Record<string, { status: Status }>;
  }[];
  summary: { farms: number };
}

interface DiscrepancyView {
  discrepancyId: string;
  entityType: 'farmer' | 'farm' | 'farmer_farm';
  field: string;
  currentValue: unknown;
  submittedValue: unknown;
  status: string;
  liveValue?: unknown;
  isStale?: boolean;
  canApply?: boolean;
}

interface LoginResponse {
  accessToken: string;
}

describe('Spec 100 — cobertura por productor (e2e)', () => {
  let app: INestApplication<App>;
  let ds: DataSource;
  let adminToken: string;
  let researcherToken: string;
  let pollsterToken: string;
  let apiKey: string;

  // Productor A: dos fincas (una compartida con B). Productor C: sin fincas.
  let farmerA: string;
  let farmerB: string;
  let farmerC: string;
  let sharedFarm: string;
  let ownFarm: string;
  let farmerInstrument: string;
  let farmInstrument: string;
  let unscopedInstrument: string;
  const surveyIds: string[] = [];

  let phoneDiscrepancy1: string;
  let phoneDiscrepancy2: string;
  let linkDiscrepancy: string;

  const PHONE_REGISTERED = `300${RUN}1`;
  const PHONE_SUBMITTED_1 = `300${RUN}2`;
  const PHONE_SUBMITTED_2 = `300${RUN}3`;
  const DOCUMENT_A = `100${RUN}01`;

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
         VALUES (gen_random_uuid(), 'E2E', 'Spec100', $1, $2, $3, false)
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

  async function insertFarmer(name: string, document: string | null) {
    const [row] = await ds.query<{ id: string }[]>(
      `INSERT INTO farmers (id, name, document_id, phone)
       VALUES (gen_random_uuid(), $1, $2, $3) RETURNING id`,
      [name, document, PHONE_REGISTERED],
    );
    return row.id;
  }

  async function insertFarm(name: string) {
    const [row] = await ds.query<{ farm_id: string }[]>(
      `INSERT INTO farms (farm_id, name) VALUES (gen_random_uuid(), $1)
       RETURNING farm_id`,
      [name],
    );
    return row.farm_id;
  }

  async function insertInstrument(name: string, scope: string | null) {
    const [row] = await ds.query<{ instrument_id: string }[]>(
      `INSERT INTO instruments (instrument_id, name, version, publish_date, is_active, scope_level)
       VALUES (gen_random_uuid(), $1, 1, now()::date, true, $2)
       RETURNING instrument_id`,
      [name, scope],
    );
    return row.instrument_id;
  }

  async function insertSurvey(
    farmerId: string,
    farmId: string | null,
    instrumentId?: string,
  ) {
    const [row] = await ds.query<{ survey_id: string }[]>(
      `INSERT INTO surveys (survey_id, sincronized, origin, farmer_id, farm_id)
       VALUES (gen_random_uuid(), true, 'field', $1, $2) RETURNING survey_id`,
      [farmerId, farmId],
    );
    surveyIds.push(row.survey_id);
    if (instrumentId) {
      await ds.query(
        `INSERT INTO surveys_instruments (survey_id, instrument_id) VALUES ($1, $2)`,
        [row.survey_id, instrumentId],
      );
    }
    return row.survey_id;
  }

  async function insertDiscrepancy(d: {
    entityType: 'farmer' | 'farm' | 'farmer_farm';
    farmerId: string | null;
    farmId: string | null;
    field: string;
    systemField: string | null;
    current: unknown;
    submitted: unknown;
    surveyId: string;
  }) {
    const [row] = await ds.query<{ discrepancy_id: string }[]>(
      `INSERT INTO entity_field_discrepancies
         (entity_type, farmer_id, farm_id, field, system_field,
          current_value, submitted_value, survey_id, status)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8, 'open')
       RETURNING discrepancy_id`,
      [
        d.entityType,
        d.farmerId,
        d.farmId,
        d.field,
        d.systemField,
        JSON.stringify(d.current),
        JSON.stringify(d.submitted),
        d.surveyId,
      ],
    );
    return row.discrepancy_id;
  }

  async function coverageOf(
    farmerId: string,
    token = adminToken,
  ): Promise<FarmerCoverageBody> {
    const res = await http()
      .get(`/api/farmers/${farmerId}/coverage`)
      .set(auth(token))
      .expect(200);
    return res.body as FarmerCoverageBody;
  }

  async function list(token = adminToken): Promise<FarmerCoverageListBody> {
    const res = await http()
      .get('/api/coverage/farmers')
      .set(auth(token))
      .expect(200);
    return res.body as FarmerCoverageListBody;
  }

  async function openDiscrepanciesOf(
    farmerId: string,
  ): Promise<DiscrepancyView[]> {
    const res = await http()
      .get(`/api/farmers/${farmerId}/discrepancies`)
      .query({ status: 'open' })
      .set(auth(adminToken))
      .expect(200);
    return res.body as DiscrepancyView[];
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

    farmerA = await insertFarmer(`Spec100 Productor A ${RUN}`, DOCUMENT_A);
    farmerB = await insertFarmer(`Spec100 Productor B ${RUN}`, `100${RUN}02`);
    farmerC = await insertFarmer(`Spec100 Productor C ${RUN}`, `100${RUN}03`);

    sharedFarm = await insertFarm(`Spec100 Finca compartida ${RUN}`);
    ownFarm = await insertFarm(`Spec100 Finca propia ${RUN}`);
    await ds.query(
      `INSERT INTO farmer_farms (farmer_id, farm_id, role, is_primary, source)
       VALUES ($1, $3, 'owner', true, 'e2e-100'),
              ($1, $4, 'owner', false, 'e2e-100'),
              ($2, $3, 'owner', true, 'e2e-100')`,
      [farmerA, farmerB, sharedFarm, ownFarm],
    );

    farmerInstrument = await insertInstrument(
      `Spec100 Por productor ${RUN}`,
      'farmer',
    );
    farmInstrument = await insertInstrument(`Spec100 Por finca ${RUN}`, 'farm');
    unscopedInstrument = await insertInstrument(
      `Spec100 Sin alcance ${RUN}`,
      null,
    );

    // Encuesta de B sobre la finca compartida (sin respuestas: no contable).
    await insertSurvey(farmerB, sharedFarm, farmInstrument);

    const s1 = await insertSurvey(farmerA, sharedFarm);
    const s2 = await insertSurvey(farmerA, sharedFarm);
    phoneDiscrepancy1 = await insertDiscrepancy({
      entityType: 'farmer',
      farmerId: farmerA,
      farmId: null,
      field: 'phone',
      systemField: 'farmer.phone',
      current: PHONE_REGISTERED,
      submitted: PHONE_SUBMITTED_1,
      surveyId: s1,
    });
    phoneDiscrepancy2 = await insertDiscrepancy({
      entityType: 'farmer',
      farmerId: farmerA,
      farmId: null,
      field: 'phone',
      systemField: 'farmer.phone',
      current: PHONE_REGISTERED,
      submitted: PHONE_SUBMITTED_2,
      surveyId: s2,
    });
    linkDiscrepancy = await insertDiscrepancy({
      entityType: 'farmer_farm',
      farmerId: farmerA,
      farmId: sharedFarm,
      field: 'role',
      systemField: null,
      current: 'owner',
      submitted: 'tenant',
      surveyId: s1,
    });
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
    const farms = [sharedFarm, ownFarm].filter(Boolean);
    await safe(
      `DELETE FROM entity_field_discrepancies WHERE survey_id = ANY($1::uuid[])`,
      [surveyIds],
    );
    await safe(
      `DELETE FROM surveys_instruments WHERE survey_id = ANY($1::uuid[])`,
      [surveyIds],
    );
    await safe(`DELETE FROM surveys WHERE survey_id = ANY($1::uuid[])`, [
      surveyIds,
    ]);
    await safe(`DELETE FROM farmer_farms WHERE farmer_id = ANY($1::uuid[])`, [
      farmers,
    ]);
    await safe(`DELETE FROM farms WHERE farm_id = ANY($1::uuid[])`, [farms]);
    await safe(`DELETE FROM farmers WHERE id = ANY($1::uuid[])`, [farmers]);
    await safe(
      `DELETE FROM instruments WHERE instrument_id = ANY($1::uuid[])`,
      [[farmerInstrument, farmInstrument, unscopedInstrument].filter(Boolean)],
    );
    await safe(
      `DELETE FROM api_keys WHERE user_id IN (
         SELECT user_id FROM users WHERE email LIKE $1)`,
      [`${PREFIX}-%`],
    );
    await safe(`DELETE FROM users WHERE email LIKE $1`, [`${PREFIX}-%`]);
    await app.close();
  });

  describe('C11 — GET /api/farmers/:farmerId/coverage: roles y errores', () => {
    it('ADMIN, RESEARCHER y API key acceden', async () => {
      await coverageOf(farmerA, adminToken);
      await coverageOf(farmerA, researcherToken);
      await http()
        .get(`/api/farmers/${farmerA}/coverage`)
        .set('X-API-Key', apiKey)
        .expect(200);
    });

    it('400 con un id que no es UUID', async () => {
      await http()
        .get('/api/farmers/no-es-uuid/coverage')
        .set(auth(adminToken))
        .expect(400);
    });

    it('404 si el productor no existe', async () => {
      await http()
        .get(`/api/farmers/${MISSING_UUID}/coverage`)
        .set(auth(adminToken))
        .expect(404);
    });

    it('403 a POLLSTER, en el detalle y en la lista', async () => {
      await http()
        .get(`/api/farmers/${farmerA}/coverage`)
        .set(auth(pollsterToken))
        .expect(403);
      await http()
        .get('/api/coverage/farmers')
        .set(auth(pollsterToken))
        .expect(403);
    });

    it('el detalle trae el contrato y no expone documento ni teléfono', async () => {
      const body = await coverageOf(farmerA);
      expect(body).toMatchObject({ farmerId: farmerA });
      expect(typeof body.computedAt).toBe('string');
      expect(body.farms.map((f) => f.farmId).sort()).toEqual(
        [sharedFarm, ownFarm].sort(),
      );
      const ids = body.instruments.map((i) => i.instrumentId);
      expect(ids).toEqual(
        expect.arrayContaining([farmerInstrument, farmInstrument]),
      );
      expect(ids).not.toContain(unscopedInstrument);
      expect(body.summary.instrumentsWithoutScope).toBeGreaterThanOrEqual(1);
      const raw = JSON.stringify(body);
      expect(raw).not.toContain(DOCUMENT_A);
      expect(raw).not.toContain(PHONE_REGISTERED);
    });

    it('productor sin fincas: farm no aplica, con aviso sin_finca', async () => {
      const body = await coverageOf(farmerC);
      expect(body.farms).toEqual([]);
      expect(body.warnings).toContain('sin_finca');
      const farm = body.instruments.find(
        (i) => i.instrumentId === farmInstrument,
      );
      expect(farm?.status).toBe('no_aplica');
    });
  });

  describe('C12 — GET /api/coverage/farmers: una fila por productor, coherente con el detalle', () => {
    it('devuelve una fila por productor', async () => {
      const body = await list();
      const ids = body.rows.map((r) => r.farmerId);
      expect(new Set(ids).size).toBe(ids.length);
      const [{ n }] = await ds.query<{ n: number }[]>(
        `SELECT count(*)::int AS n FROM farmers`,
      );
      expect(ids).toHaveLength(n);
      expect(body.summary.farmers).toBe(n);
      expect(ids).toEqual(expect.arrayContaining([farmerA, farmerB, farmerC]));
    });

    it('los conteos de cada fila coinciden con el detalle', async () => {
      const body = await list();
      for (const farmerId of [farmerA, farmerB, farmerC]) {
        const row = body.rows.find((r) => r.farmerId === farmerId)!;
        const detail = await coverageOf(farmerId);
        expect(row.summary).toEqual(detail.summary);
        expect(row.farmsCount).toBe(detail.farms.length);
        for (const instrument of detail.instruments) {
          expect(row.statusByInstrument[instrument.instrumentId]).toBe(
            instrument.status,
          );
        }
        expect(Object.keys(row.statusByInstrument).sort()).toEqual(
          detail.instruments.map((i) => i.instrumentId).sort(),
        );
      }
    });

    it('fila con finca principal, sin finca y discrepancias abiertas', async () => {
      const body = await list();
      const a = body.rows.find((r) => r.farmerId === farmerA)!;
      const c = body.rows.find((r) => r.farmerId === farmerC)!;
      expect(a.primaryFarm?.farmId).toBe(sharedFarm);
      expect(a.openDiscrepancies).toBe(3);
      expect(c.primaryFarm).toBeNull();
      expect(c.farmsCount).toBe(0);
      expect(c.warnings).toContain('sin_finca');
      expect(body.summary.withoutFarm).toBeGreaterThanOrEqual(1);
    });
  });

  describe('C13 — con API key la lista enmascara el documento', () => {
    it('JWT ve el documento; API key recibe documentId: null', async () => {
      const jwt = await list();
      expect(jwt.rows.find((r) => r.farmerId === farmerA)?.documentId).toBe(
        DOCUMENT_A,
      );

      const res = await http()
        .get('/api/coverage/farmers')
        .set('X-API-Key', apiKey)
        .expect(200);
      const body = res.body as FarmerCoverageListBody;
      expect(body.rows.length).toBeGreaterThan(0);
      expect(body.rows.every((r) => r.documentId === null)).toBe(true);
      expect(JSON.stringify(body)).not.toContain(DOCUMENT_A);
    });
  });

  describe('C14 — /api/production-units conserva su salida y es coherente con la cobertura por productor', () => {
    it('una fila por finca, con una celda por columna', async () => {
      const res = await http()
        .get('/api/production-units')
        .set(auth(adminToken))
        .expect(200);
      const body = res.body as ProductionUnitsBody;
      const ids = body.rows.map((r) => r.farmId);
      expect(new Set(ids).size).toBe(ids.length);
      expect(body.summary.farms).toBe(body.rows.length);
      const columns = body.instruments.map((i) => i.instrumentId);
      for (const row of body.rows) {
        expect(Object.keys(row.coverage).sort()).toEqual([...columns].sort());
      }
      const shared = body.rows.find((r) => r.farmId === sharedFarm)!;
      expect(shared.farmers.map((f) => f.farmerId).sort()).toEqual(
        [farmerA, farmerB].sort(),
      );
    });

    it('la celda farm de cada finca coincide con la unidad del productor', async () => {
      const res = await http()
        .get('/api/production-units')
        .set(auth(adminToken))
        .expect(200);
      const units = (res.body as ProductionUnitsBody).rows;
      const detail = await coverageOf(farmerA);
      const farm = detail.instruments.find(
        (i) => i.instrumentId === farmInstrument,
      )!;
      for (const farmId of [sharedFarm, ownFarm]) {
        const cell = units.find((r) => r.farmId === farmId)!.coverage[
          farmInstrument
        ];
        const unit = farm.units.find((u) => u.farmId === farmId);
        expect(unit?.status).toBe(cell.status);
      }
    });
  });

  describe('C15 — discrepancias abiertas con liveValue, isStale y canApply', () => {
    it('las de productor traen el valor vivo y se pueden aplicar', async () => {
      const open = await openDiscrepanciesOf(farmerA);
      const phone = open.find((d) => d.discrepancyId === phoneDiscrepancy1)!;
      expect(phone).toMatchObject({
        liveValue: PHONE_REGISTERED,
        isStale: false,
        canApply: true,
      });
    });

    it('las de farmer_farm traen canApply: false', async () => {
      const open = await openDiscrepanciesOf(farmerA);
      const link = open.find((d) => d.discrepancyId === linkDiscrepancy)!;
      expect(link).toHaveProperty('liveValue');
      expect(link).toHaveProperty('isStale');
      expect(link.canApply).toBe(false);
    });

    it('toda discrepancia abierta trae los tres campos', async () => {
      const open = await openDiscrepanciesOf(farmerA);
      expect(open).toHaveLength(3);
      for (const d of open) {
        expect(d).toHaveProperty('liveValue');
        expect(typeof d.isStale).toBe('boolean');
        expect(typeof d.canApply).toBe('boolean');
      }
    });
  });

  describe('C16 — aplicar una discrepancia deja desactualizadas las demás del mismo campo', () => {
    it('la otra discrepancia de teléfono sale con isStale: true', async () => {
      await http()
        .patch(`/api/discrepancies/${phoneDiscrepancy1}`)
        .set(auth(adminToken))
        .send({ action: 'apply' })
        .expect(200);

      const open = await openDiscrepanciesOf(farmerA);
      expect(open.map((d) => d.discrepancyId)).not.toContain(phoneDiscrepancy1);
      const other = open.find((d) => d.discrepancyId === phoneDiscrepancy2)!;
      expect(other).toMatchObject({
        currentValue: PHONE_REGISTERED,
        liveValue: PHONE_SUBMITTED_1,
        isStale: true,
      });
    });
  });

  describe('C17 — rendimiento de la lista', () => {
    it('GET /api/coverage/farmers responde en menos de 1,5 s', async () => {
      await list(); // calentamiento: conexiones y planes de consulta
      const start = Date.now();
      await list();
      expect(Date.now() - start).toBeLessThan(1500);
    });
  });
});
