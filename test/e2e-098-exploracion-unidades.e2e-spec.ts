/**
 * Spec 98 — Exploración de unidades productivas: cobertura y Excel.
 * `spec/98_exploracion_unidades_productivas.md` (raíz del ecosistema).
 *
 * ESTAS PRUEBAS NACEN EN ROJO (enfoque test-first): hoy no existen
 * `scope_level`, `coverage_group`, `instruments_crops`, `data_export_logs`, los
 * endpoints `/production-units` ni el script de la matriz. Los endpoints nuevos
 * responden 404 y el DTO rechaza los campos nuevos con 400. Las reglas finas del
 * cálculo viven en `src/coverage/e2e-098-coverage-calculator.spec.ts`.
 *
 * Criterios cubiertos: C01, C02, C06, C09, C11, C13, C14, C15, C16 (`Cnn`).
 * C03–C05, C07, C08 quedan en la prueba del cálculo; C10 y parte de C12, en
 * `frontend/lib/production-units/e2e-098-filters.test.ts`.
 *
 * ENTORNO: SOLO contra la base de desarrollo (`DATABASE_URL` activa del `.env`,
 * Neon `sosagro-dev`), NUNCA contra producción. Identidades con prefijo
 * `Spec98`. Todo se elimina en `afterAll`.
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

/** `exceljs` aún no está instalado: se carga en runtime para que la suite compile. */
interface WorkbookLike {
  xlsx: { load(data: ArrayBuffer): Promise<unknown> };
  worksheets: { name: string }[];
  getWorksheet(name: string): { actualRowCount: number } | undefined;
}

function newWorkbook(): WorkbookLike {
  const moduleName = 'exceljs';
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const excel = require(moduleName) as { Workbook: new () => WorkbookLike };
  return new excel.Workbook();
}

const TEST_PASSWORD = 'E2eTest1234!';
const PREFIX = 'e2e-098';
const RUN = Date.now().toString().slice(-6);

interface ProductionUnitRow {
  farmId: string;
  coverage: Record<string, { status: string }>;
}

interface ProductionUnitsBody {
  instruments: { instrumentId: string }[];
  rows: ProductionUnitRow[];
  summary: { instrumentsWithoutScope: number };
  unlocated: { surveyId: string }[];
}

interface LoginResponse {
  accessToken: string;
}

describe('Spec 98 — exploración de unidades productivas (e2e)', () => {
  let app: INestApplication<App>;
  let ds: DataSource;
  let adminToken: string;
  let researcherToken: string;
  let pollsterToken: string;

  let farmId: string;
  let farmNoSurveysId: string;
  let farmerId: string;
  let scopedInstrumentId: string;
  let unscopedInstrumentId: string;
  let unlocatedSurveyId: string;

  const http = () => request(app.getHttpServer());
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

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
         VALUES (gen_random_uuid(), 'E2E', 'Spec98', $1, $2, $3, false)`,
        [email, hash, roles[0].role_id],
      );
    }
    const login = await http()
      .post('/api/auth/login')
      .send({ email, password: TEST_PASSWORD })
      .expect(200);
    return (login.body as LoginResponse).accessToken;
  }

  async function insertInstrument(name: string): Promise<string> {
    const rows = await ds.query<{ instrument_id: string }[]>(
      `INSERT INTO instruments (instrument_id, name, version, publish_date, is_active)
       VALUES (gen_random_uuid(), $1, 1, now()::date, true)
       RETURNING instrument_id`,
      [name],
    );
    return rows[0].instrument_id;
  }

  async function getUnits(): Promise<ProductionUnitsBody> {
    const res = await http()
      .get('/api/production-units')
      .set(auth(adminToken))
      .expect(200);
    return res.body as ProductionUnitsBody;
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

    const [farmer] = await ds.query<{ id: string }[]>(
      `INSERT INTO farmers (id, name, document_id)
       VALUES (gen_random_uuid(), $1, $2) RETURNING id`,
      [`Spec98 Productor ${RUN}`, `98${RUN}01`],
    );
    farmerId = farmer.id;

    const [farm] = await ds.query<{ farm_id: string }[]>(
      `INSERT INTO farms (farm_id, name) VALUES (gen_random_uuid(), $1)
       RETURNING farm_id`,
      [`Spec98 Finca ${RUN}`],
    );
    farmId = farm.farm_id;
    await ds.query(
      `INSERT INTO farmer_farms (farmer_id, farm_id, role, is_primary, source)
       VALUES ($1, $2, 'owner', true, 'e2e-098')`,
      [farmerId, farmId],
    );

    const [emptyFarm] = await ds.query<{ farm_id: string }[]>(
      `INSERT INTO farms (farm_id, name) VALUES (gen_random_uuid(), $1)
       RETURNING farm_id`,
      [`Spec98 Finca sin encuestas ${RUN}`],
    );
    farmNoSurveysId = emptyFarm.farm_id;

    scopedInstrumentId = await insertInstrument(`Spec98 Con alcance ${RUN}`);
    unscopedInstrumentId = await insertInstrument(`Spec98 Sin alcance ${RUN}`);

    const [survey] = await ds.query<{ survey_id: string }[]>(
      `INSERT INTO surveys (survey_id, sincronized, origin)
       VALUES (gen_random_uuid(), true, 'field') RETURNING survey_id`,
    );
    unlocatedSurveyId = survey.survey_id;
  });

  afterAll(async () => {
    const safe = async (sql: string, params: unknown[] = []) => {
      try {
        await ds.query(sql, params);
      } catch {
        /* limpieza tolerante: hoy varias tablas del spec aún no existen */
      }
    };
    await safe(`DELETE FROM surveys WHERE survey_id = $1`, [unlocatedSurveyId]);
    await safe(`DELETE FROM farmer_farms WHERE farmer_id = $1`, [farmerId]);
    await safe(`DELETE FROM farms WHERE farm_id = ANY($1::uuid[])`, [
      [farmId, farmNoSurveysId],
    ]);
    await safe(`DELETE FROM farmers WHERE id = $1`, [farmerId]);
    await safe(
      `DELETE FROM instruments WHERE instrument_id = ANY($1::uuid[])`,
      [[scopedInstrumentId, unscopedInstrumentId]],
    );
    await safe(`DELETE FROM users WHERE email LIKE $1`, [`${PREFIX}-%`]);
    await app.close();
  });

  describe('C01 — permisos de la vista', () => {
    it('ADMIN y RESEARCHER acceden', async () => {
      await http()
        .get('/api/production-units')
        .set(auth(adminToken))
        .expect(200);
      await http()
        .get('/api/production-units')
        .set(auth(researcherToken))
        .expect(200);
    });

    it('POLLSTER recibe 403', async () => {
      await http()
        .get('/api/production-units')
        .set(auth(pollsterToken))
        .expect(403);
    });
  });

  describe('C02 — una fila por finca', () => {
    it('incluye fincas sin encuestas, productor ni cultivo', async () => {
      const body = await getUnits();
      const ids = body.rows.map((r) => r.farmId);
      expect(ids).toEqual(expect.arrayContaining([farmId, farmNoSurveysId]));
      expect(new Set(ids).size).toBe(ids.length);
    });
  });

  describe('C14 — alcance por instrumento', () => {
    it('se edita por PATCH', async () => {
      const res = await http()
        .patch(`/api/instruments/${scopedInstrumentId}`)
        .set(auth(adminToken))
        .send({ scopeLevel: 'farm', coverageGroup: `G${RUN}` })
        .expect(200);
      expect(res.body).toMatchObject({ scopeLevel: 'farm' });
    });

    it('acepta cropIds en un PATCH aparte cuando ya es farm_crop', async () => {
      const [crop] = await ds.query<{ crop_id: string }[]>(
        `SELECT crop_id FROM types_of_crops ORDER BY name LIMIT 1`,
      );
      await http()
        .patch(`/api/instruments/${scopedInstrumentId}`)
        .set(auth(adminToken))
        .send({ scopeLevel: 'farm_crop' })
        .expect(200);
      const res = await http()
        .patch(`/api/instruments/${scopedInstrumentId}`)
        .set(auth(adminToken))
        .send({ cropIds: [crop.crop_id] })
        .expect(200);
      expect(res.body).toMatchObject({
        scopeLevel: 'farm_crop',
        cropIds: [crop.crop_id],
      });
      // restaura el alcance que esperan las pruebas siguientes
      await http()
        .patch(`/api/instruments/${scopedInstrumentId}`)
        .set(auth(adminToken))
        .send({ scopeLevel: 'farm' })
        .expect(200);
    });

    it('rechaza un nivel inválido', async () => {
      await http()
        .patch(`/api/instruments/${scopedInstrumentId}`)
        .set(auth(adminToken))
        .send({ scopeLevel: 'vereda' })
        .expect(400);
    });
  });

  describe('C06 — instrumentos sin alcance', () => {
    it('no salen en cobertura y se cuentan en el resumen', async () => {
      const body = await getUnits();
      const ids = body.instruments.map((i) => i.instrumentId);
      expect(ids).not.toContain(unscopedInstrumentId);
      expect(body.summary.instrumentsWithoutScope).toBeGreaterThanOrEqual(1);
    });
  });

  describe('C09 — encuestas sin ubicar', () => {
    it('se listan aparte', async () => {
      const body = await getUnits();
      const ids = body.unlocated.map((s) => s.surveyId);
      expect(ids).toContain(unlocatedSurveyId);
    });
  });

  describe('C11 y C13 — exportación', () => {
    const exportBody = () => ({
      farmIds: [farmId],
      filters: { departmentId: null },
    });

    it('devuelve un xlsx solo con las fincas pedidas y sus hojas', async () => {
      const res = await http()
        .post('/api/production-units/export')
        .set(auth(researcherToken))
        .send(exportBody())
        .buffer(true)
        .parse((response, callback) => {
          const chunks: Buffer[] = [];
          response.on('data', (chunk: Buffer) => chunks.push(chunk));
          response.on('end', () => callback(null, Buffer.concat(chunks)));
        })
        .expect(201);

      const workbook = newWorkbook();
      await workbook.xlsx.load(res.body as ArrayBuffer);
      const names = workbook.worksheets.map((s) => s.name);
      expect(names).toEqual(
        expect.arrayContaining([
          'Unidades',
          'Cobertura',
          'Sin ubicar',
          'Diccionario',
          'Metadatos',
        ]),
      );
      expect(workbook.getWorksheet('Unidades')?.actualRowCount).toBe(2);
    });

    it('rechaza una finca inexistente', async () => {
      await http()
        .post('/api/production-units/export')
        .set(auth(adminToken))
        .send({
          farmIds: ['00000000-0000-4000-8000-000000000000'],
          filters: {},
        })
        .expect(400);
    });

    it('POLLSTER recibe 403 y no queda registro', async () => {
      await http()
        .post('/api/production-units/export')
        .set(auth(pollsterToken))
        .send(exportBody())
        .expect(403);
    });

    it('registra la exportación con usuario, fincas y hash', async () => {
      const rows = await ds.query<
        {
          farm_ids: string[];
          row_count: number;
          file_sha256: string;
        }[]
      >(
        `SELECT farm_ids, row_count, file_sha256 FROM data_export_logs
          WHERE user_email = $1 ORDER BY created_at DESC LIMIT 1`,
        [`${PREFIX}-researcher@test.local`],
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].farm_ids).toEqual([farmId]);
      expect(rows[0].row_count).toBe(1);
      expect(rows[0].file_sha256).toMatch(/^[0-9a-f]{64}$/);
    });

    it('solo ADMIN consulta el registro', async () => {
      await http()
        .get('/api/production-units/exports')
        .set(auth(adminToken))
        .expect(200);
      await http()
        .get('/api/production-units/exports')
        .set(auth(researcherToken))
        .expect(403);
    });
  });

  describe('C16 — migraciones', () => {
    it('agregan alcance sin tocar datos', async () => {
      const columns = await ds.query<{ column_name: string }[]>(
        `SELECT column_name FROM information_schema.columns
          WHERE table_name = 'instruments'
            AND column_name IN ('scope_level', 'coverage_group')`,
      );
      expect(columns).toHaveLength(2);

      const [unscoped] = await ds.query<{ scope_level: string | null }[]>(
        `SELECT scope_level FROM instruments WHERE instrument_id = $1`,
        [unscopedInstrumentId],
      );
      expect(unscoped.scope_level).toBeNull();
    });
  });

  describe('C15 — script de la matriz', () => {
    it('es idempotente y no pisa ediciones del panel', async () => {
      const modulePath = '../src/database/seeds/instrument-scope-matrix.seed';
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const seed = require(modulePath) as {
        applyInstrumentScopeMatrix(
          ds: DataSource,
        ): Promise<{ updated: number }>;
      };

      await seed.applyInstrumentScopeMatrix(ds);
      const second = await seed.applyInstrumentScopeMatrix(ds);
      expect(second.updated).toBe(0);

      const [scoped] = await ds.query<{ scope_level: string }[]>(
        `SELECT scope_level FROM instruments WHERE instrument_id = $1`,
        [scopedInstrumentId],
      );
      expect(scoped.scope_level).toBe('farm');
    });
  });
  describe('C09 — encuesta con finca pero sin cultivo, con varios cultivos aplicables', () => {
    it('sale en "Sin ubicar" con su motivo', async () => {
      const crops = await ds.query<{ crop_id: string }[]>(
        `SELECT crop_id FROM types_of_crops ORDER BY name LIMIT 2`,
      );
      const [farm] = await ds.query<{ farm_id: string }[]>(
        `INSERT INTO farms (farm_id, name) VALUES (gen_random_uuid(), $1)
         RETURNING farm_id`,
        [`Spec98 Ambigua ${RUN}`],
      );
      for (const c of crops) {
        await ds.query(
          `INSERT INTO farms_crops (farm_id, crop_id) VALUES ($1, $2)`,
          [farm.farm_id, c.crop_id],
        );
      }
      const instrumentId = await insertInstrument(`Spec98 Por cultivo ${RUN}`);
      await ds.query(
        `UPDATE instruments SET scope_level = 'farm_crop' WHERE instrument_id = $1`,
        [instrumentId],
      );
      const [survey] = await ds.query<{ survey_id: string }[]>(
        `INSERT INTO surveys (survey_id, sincronized, origin, farm_id)
         VALUES (gen_random_uuid(), true, 'field', $1) RETURNING survey_id`,
        [farm.farm_id],
      );
      await ds.query(
        `INSERT INTO surveys_instruments (survey_id, instrument_id) VALUES ($1, $2)`,
        [survey.survey_id, instrumentId],
      );
      try {
        const body = await getUnits();
        const found = (
          body.unlocated as { surveyId: string; reason: string }[]
        ).find((u) => u.surveyId === survey.survey_id);
        expect(found?.reason).toBe('cultivo_ambiguo');
      } finally {
        await ds.query(`DELETE FROM surveys_instruments WHERE survey_id = $1`, [
          survey.survey_id,
        ]);
        await ds.query(`DELETE FROM surveys WHERE survey_id = $1`, [
          survey.survey_id,
        ]);
        await ds.query(`DELETE FROM farms_crops WHERE farm_id = $1`, [
          farm.farm_id,
        ]);
        await ds.query(`DELETE FROM farms WHERE farm_id = $1`, [farm.farm_id]);
        await ds.query(`DELETE FROM instruments WHERE instrument_id = $1`, [
          instrumentId,
        ]);
      }
    });
  });
});
