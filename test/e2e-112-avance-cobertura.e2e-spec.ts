/**
 * Spec 112 — avance de cobertura: contrato del endpoint y del Excel.
 * `spec/112_avance_cobertura_unidades_productivas.md` (raíz del ecosistema).
 *
 * ESTAS PRUEBAS NACEN EN ROJO (enfoque test-first): las celdas de
 * `GET /production-units` aún no traen `possible`, `done` ni `cropUnits`, el
 * export no acepta `progressCropIds` y el libro no tiene la hoja `Avance`.
 *
 * Criterios cubiertos: C01, C02, C13 y C17. Los contadores finos y la
 * agregación están en `src/coverage/e2e-112-coverage-progress.spec.ts`; los
 * rellenos y el autofiltro, en `src/production-units/e2e-112-cobertura-excel.spec.ts`.
 *
 * ENTORNO: SOLO contra la base de desarrollo (`DATABASE_URL` activa del `.env`,
 * Neon `sosagro-dev`), NUNCA contra producción. Identidades con prefijo
 * `e2e-112`. Todo se elimina en `afterAll`.
 */

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getOptionsToken } from '@nestjs/throttler';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import * as ExcelJS from 'exceljs';
import { AppModule } from '../src/app.module';

jest.setTimeout(120_000);

const TEST_PASSWORD = 'E2eTest1234!';
const PREFIX = 'e2e-112';
const RUN = Date.now().toString().slice(-6);

interface Cell {
  status: string;
  possible?: number;
  done?: number;
  cropUnits?: { farmCropId: string; cropId: string; covered: boolean }[];
}

interface UnitsBody {
  rows: { farmId: string; coverage: Record<string, Cell> }[];
}

interface LoginResponse {
  accessToken: string;
}

describe('Spec 112 — avance de cobertura (e2e)', () => {
  let app: INestApplication<App>;
  let ds: DataSource;
  let adminToken: string;
  let researcherToken: string;
  let pollsterToken: string;
  let farmId: string;
  let instrumentId: string;
  let sectionId: string;
  let questionId: string;
  let surveyId: string;
  const crops: { cropId: string; farmCropId: string }[] = [];

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
         VALUES (gen_random_uuid(), 'E2E', 'Spec112', $1, $2, $3, false)`,
        [email, hash, roles[0].role_id],
      );
    }
    const login = await http()
      .post('/api/auth/login')
      .send({ email, password: TEST_PASSWORD })
      .expect(200);
    return (login.body as LoginResponse).accessToken;
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

    // Finca con dos cultivos.
    const [farm] = await ds.query<{ farm_id: string }[]>(
      `INSERT INTO farms (farm_id, name) VALUES (gen_random_uuid(), $1)
       RETURNING farm_id`,
      [`Spec112 Mixta ${RUN}`],
    );
    farmId = farm.farm_id;
    const cropRows = await ds.query<{ crop_id: string }[]>(
      `SELECT crop_id FROM types_of_crops ORDER BY name LIMIT 2`,
    );
    for (const c of cropRows) {
      const [fc] = await ds.query<{ farm_crop_id: string }[]>(
        `INSERT INTO farms_crops (farm_id, crop_id) VALUES ($1, $2)
         RETURNING farm_crop_id`,
        [farmId, c.crop_id],
      );
      crops.push({ cropId: c.crop_id, farmCropId: fc.farm_crop_id });
    }

    // Instrumento por cultivo para todos los cultivos, con una pregunta.
    const [instrument] = await ds.query<{ instrument_id: string }[]>(
      `INSERT INTO instruments (instrument_id, name, version, publish_date, is_active, scope_level)
       VALUES (gen_random_uuid(), $1, 1, CURRENT_DATE, true, 'farm_crop')
       RETURNING instrument_id`,
      [`Spec112 Por cultivo ${RUN}`],
    );
    instrumentId = instrument.instrument_id;
    const [section] = await ds.query<{ section_id: string }[]>(
      `INSERT INTO sections (section_id, name, "order", instrument_id)
       VALUES (gen_random_uuid(), 'Spec112 Sección', 1, $1) RETURNING section_id`,
      [instrumentId],
    );
    sectionId = section.section_id;
    const [type] = await ds.query<{ type_id: string }[]>(
      `SELECT type_id FROM types_of_questions WHERE name = 'open_text'`,
    );
    const [question] = await ds.query<{ question_id: string }[]>(
      `INSERT INTO questions (question_id, section_id, text, type_id, is_required, "order")
       VALUES (gen_random_uuid(), $1, 'Spec112 Q1', $2, false, 1) RETURNING question_id`,
      [sectionId, type.type_id],
    );
    questionId = question.question_id;

    // Encuesta contable solo en el primer cultivo.
    const [survey] = await ds.query<{ survey_id: string }[]>(
      `INSERT INTO surveys (survey_id, sincronized, origin, farm_id, farm_crop_id)
       VALUES (gen_random_uuid(), true, 'field', $1, $2) RETURNING survey_id`,
      [farmId, crops[0].farmCropId],
    );
    surveyId = survey.survey_id;
    await ds.query(
      `INSERT INTO surveys_instruments (survey_id, instrument_id) VALUES ($1, $2)`,
      [surveyId, instrumentId],
    );
    await ds.query(
      `INSERT INTO responses (response_id, survey_id, question_id, text_value)
       VALUES (gen_random_uuid(), $1, $2, 'respuesta e2e-112')`,
      [surveyId, questionId],
    );
  });

  afterAll(async () => {
    const safe = async (sql: string, params: unknown[] = []) => {
      try {
        await ds.query(sql, params);
      } catch {
        /* limpieza tolerante */
      }
    };
    await safe(`DELETE FROM responses WHERE survey_id = $1`, [surveyId]);
    await safe(`DELETE FROM surveys_instruments WHERE survey_id = $1`, [
      surveyId,
    ]);
    await safe(`DELETE FROM surveys WHERE survey_id = $1`, [surveyId]);
    await safe(`DELETE FROM questions WHERE question_id = $1`, [questionId]);
    await safe(`DELETE FROM sections WHERE section_id = $1`, [sectionId]);
    await safe(`DELETE FROM instruments WHERE instrument_id = $1`, [
      instrumentId,
    ]);
    await safe(`DELETE FROM farms_crops WHERE farm_id = $1`, [farmId]);
    await safe(`DELETE FROM farms WHERE farm_id = $1`, [farmId]);
    await safe(`DELETE FROM data_export_logs WHERE user_email LIKE $1`, [
      `${PREFIX}-%`,
    ]);
    await safe(`DELETE FROM users WHERE email LIKE $1`, [`${PREFIX}-%`]);
    await app.close();
  });

  async function cell(): Promise<Cell> {
    const res = await http()
      .get('/api/production-units')
      .set(auth(researcherToken))
      .expect(200);
    const row = (res.body as UnitsBody).rows.find((r) => r.farmId === farmId);
    expect(row).toBeDefined();
    return row!.coverage[instrumentId];
  }

  describe('C01 y C02 — contadores en GET /production-units', () => {
    it('la celda de un farm_crop parcial trae 1 de 2 y sus cultivos', async () => {
      const c = await cell();
      expect(c.status).toBe('parcial');
      expect(c.possible).toBe(2);
      expect(c.done).toBe(1);
      expect(c.cropUnits).toEqual(
        expect.arrayContaining([
          { ...crops[0], covered: true },
          { ...crops[1], covered: false },
        ]),
      );
    });

    it('el detalle por finca trae los mismos contadores', async () => {
      const res = await http()
        .get(`/api/production-units/${farmId}/coverage`)
        .set(auth(adminToken))
        .expect(200);
      expect(JSON.stringify(res.body)).toContain('"possible":2');
    });
  });

  describe('C13 — el Excel trae el avance', () => {
    it('Cobertura con Realizadas, Posibles y % avance numéricos, y hoja Avance', async () => {
      const res = await http()
        .post('/api/production-units/export')
        .set(auth(researcherToken))
        .send({ farmIds: [farmId], filters: {} })
        .buffer(true)
        .parse((response, callback) => {
          const chunks: Buffer[] = [];
          response.on('data', (chunk: Buffer) => chunks.push(chunk));
          response.on('end', () => callback(null, Buffer.concat(chunks)));
        })
        .expect(201);
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(res.body as ArrayBuffer);
      expect(wb.worksheets.map((s) => s.name)).toEqual(
        expect.arrayContaining(['Cobertura', 'Avance', 'Metadatos']),
      );
      const ws = wb.getWorksheet('Cobertura')!;
      const header = (ws.getRow(1).values as unknown[]).slice(1).map(String);
      expect(header.slice(-3)).toEqual(['Realizadas', 'Posibles', '% avance']);
      const possibleCol = header.indexOf('Posibles') + 1;
      expect(typeof ws.getRow(2).getCell(possibleCol).value).toBe('number');
    });

    it('con progressCropIds cuenta solo esos cultivos', async () => {
      const res = await http()
        .post('/api/production-units/export')
        .set(auth(researcherToken))
        .send({
          farmIds: [farmId],
          filters: {},
          progressCropIds: [crops[1].cropId],
        })
        .buffer(true)
        .parse((response, callback) => {
          const chunks: Buffer[] = [];
          response.on('data', (chunk: Buffer) => chunks.push(chunk));
          response.on('end', () => callback(null, Buffer.concat(chunks)));
        })
        .expect(201);
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(res.body as ArrayBuffer);
      const ws = wb.getWorksheet('Avance')!;
      const row = (() => {
        let found: ExcelJS.Row | undefined;
        ws.eachRow((r) => {
          if (r.getCell(1).text.includes('Spec112 Por cultivo')) found = r;
        });
        return found;
      })();
      expect(row).toBeDefined();
      const header = (ws.getRow(1).values as unknown[]).slice(1).map(String);
      expect(row!.getCell(header.indexOf('Realizadas') + 1).value).toBe(0);
      expect(row!.getCell(header.indexOf('Posibles') + 1).value).toBe(1);
    });
  });

  describe('C17 — validación y permisos', () => {
    it('progressCropIds con un id que no es cultivo responde 400', async () => {
      await http()
        .post('/api/production-units/export')
        .set(auth(adminToken))
        .send({
          farmIds: [farmId],
          filters: {},
          progressCropIds: ['00000000-0000-4000-8000-000000000000'],
        })
        .expect(400);
    });

    it('POLLSTER recibe 403', async () => {
      await http()
        .post('/api/production-units/export')
        .set(auth(pollsterToken))
        .send({ farmIds: [farmId], filters: {}, progressCropIds: [] })
        .expect(403);
    });
  });
});
