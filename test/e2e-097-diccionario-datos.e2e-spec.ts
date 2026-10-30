/**
 * Spec 97 — Diccionario de datos: destinos validados pregunta → entidad (H4
 * del spec 83).
 *
 * ESTAS PRUEBAS NACEN EN ROJO (enfoque test-first). Hoy no existe: el
 * registro `src/questions/system-fields/system-field-registry.ts`,
 * `GET /api/system-fields`, la validación de `systemField` en create / update /
 * copy (códigos `SYSTEM_FIELD_*`), las claves canónicas `farm.crops` y
 * `farm.hasCrop.<x>`, las unidades regionales de área, la columna
 * `farmers.document_type`, las columnas `questions.is_inverted_scale` /
 * `is_digital_demand_item`, la migración de datos `Spec97SystemFieldData` ni
 * los métodos del dashboard que agregan todas las preguntas de un destino.
 *
 * Criterios cubiertos: C1 a C14 (un `describe` por criterio, prefijo `Cnn`).
 * C15 (móvil), C16 (web) y C17 (MCP) viven en sus repositorios.
 *
 * Cómo fallan hoy: el endpoint nuevo responde 404, la API acepta cualquier
 * `systemField` (201 donde se espera 400/409), las columnas nuevas no existen
 * en SQL y los módulos nuevos se cargan con `require` dinámico (`load`), así
 * que la suite COMPILA y cada caso falla en runtime nombrando el símbolo
 * esperado.
 *
 * Nombres propuestos (contrato que la implementación debe exponer):
 * - `system-field-registry.ts`: `SYSTEM_FIELDS`, `resolveSystemField(raw)`,
 *   `canonicalKey(raw)`, `keysFor(key)`, `isSelectable(def)`.
 * - `DashboardService.findQuestionsBySystemField(key)` y
 *   `DashboardService.findDigitalDemandQuestions()` (públicos).
 * - Migración de datos con nombre de clase que contenga `Spec97SystemFieldData`.
 *
 * Todo lo de API se ejercita por HTTP (supertest sobre la app Nest completa,
 * como los e2e 093–095). El SQL directo solo monta precondiciones, lee el
 * estado resultante y limpia.
 *
 * ENTORNO: SOLO contra la base de desarrollo (`DATABASE_URL` activa del
 * `.env`, Neon `sosagro-dev`), NUNCA contra producción. C12 corre `up` y
 * `down` de la migración de datos sobre toda la tabla `questions` de
 * desarrollo: el `down` la deja como estaba.
 */

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getOptionsToken } from '@nestjs/throttler';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource, MigrationInterface } from 'typeorm';
import * as bcrypt from 'bcrypt';
import * as fs from 'fs';
import * as path from 'path';
import { AppModule } from '../src/app.module';

jest.setTimeout(180_000);

// ─── constantes ─────────────────────────────────────────────────────────────

const TEST_PASSWORD = 'E2eTest1234!';
const PREFIX = 'e2e-097';
const RUN = Date.now().toString().slice(-6);
const STRATEGIC_TAG = 'Pregunta estratégica de caracterización tecnológica';

interface LoginResponse {
  accessToken: string;
}

interface SystemFieldDto {
  key: string;
  entity: 'farmer' | 'farm' | 'farmCrop';
  field: string | null;
  dataType: string;
  questionTypes: string[];
  metadataCatalog: string | null;
  label: string;
  status: 'active' | 'noSource' | 'legacy';
  aliases: string[];
}

interface ErrorBody {
  code?: string;
  message?: string | string[];
}

interface QuestionBody {
  questionId: string;
  systemField: string | null;
  warnings?: { code: string; message: string }[];
}

interface CropResponseLike {
  booleanValue?: boolean | null;
  question?: { systemField?: string | null } | null;
  option?: { text?: string | null; metadataId?: string | null } | null;
}

interface CropExtractionModule {
  resolveCropsFromResponses: <T extends { cropId: string; name: string }>(
    responses: CropResponseLike[],
    catalog: T[],
  ) => { crops: T[]; unmapped: string[] };
}

interface UnitConversionModule {
  convertAreaToHectares: (
    value: number,
    unit: string,
  ) => { hectares: number | null; converted: boolean; unitUnknown: boolean };
}

interface RegistryModule {
  SYSTEM_FIELDS: { key: string; status: string; aliases?: string[] }[];
  canonicalKey: (raw: string) => string | null;
  keysFor: (key: string) => string[];
}

interface MetadataCatalogsModule {
  catalogsForSystemField: (systemField?: string | null) => string[];
}

interface ExtractionPlanModule {
  systemFieldOf: (entity: 'farmer' | 'farm', field: string) => string | null;
}

interface DashboardContract {
  findQuestionsBySystemField: (
    key: string,
  ) => Promise<{ questionId: string }[]>;
  findDigitalDemandQuestions: () => Promise<{ questionId: string }[]>;
}

type MigrationCtor = new () => MigrationInterface;

/** Carga dinámica: el módulo puede no existir todavía (suite en rojo). */
function load<T>(relative: string): T {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require(path.join(__dirname, '..', 'src', relative)) as T;
}

function loadDataMigration(): MigrationCtor {
  const dir = path.join(__dirname, '..', 'src', 'migrations');
  const file = fs
    .readdirSync(dir)
    .find((f) => /Spec97SystemFieldData\.ts$/.test(f));
  if (!file) {
    throw new Error('No existe la migración *Spec97SystemFieldData.ts');
  }
  const mod = load<Record<string, MigrationCtor>>(
    path.join('migrations', file),
  );
  const ctor = Object.values(mod).find((v) => typeof v === 'function');
  if (!ctor) throw new Error('La migración no exporta una clase');
  return ctor;
}

describe('spec-097 — diccionario de datos (e2e)', () => {
  let app: INestApplication<App>;
  let ds: DataSource;

  let adminToken: string;
  let researcherToken: string;
  let pollsterToken: string;

  const typeId: Record<string, string> = {};
  const instrumentIds: string[] = [];
  /** Sección de cada instrumento de la suite. */
  const sectionOf: Record<string, string> = {};
  let instA: string;
  let instB: string;

  function http() {
    return request(app.getHttpServer());
  }

  function as(token: string, req: request.Test) {
    return req.set('Authorization', `Bearer ${token}`);
  }

  function auth(req: request.Test) {
    return as(adminToken, req);
  }

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
         VALUES (gen_random_uuid(), 'E2E', 'Spec97', $1, $2, $3, false)`,
        [email, hash, roles[0].role_id],
      );
    }
    const login = await http()
      .post('/api/auth/login')
      .send({ email, password: TEST_PASSWORD })
      .expect(200);
    return (login.body as LoginResponse).accessToken;
  }

  async function createInstrument(label: string): Promise<string> {
    const inst = await ds.query<{ instrument_id: string }[]>(
      `INSERT INTO instruments (instrument_id, name, version, publish_date, is_active)
       VALUES (gen_random_uuid(), $1, 1, CURRENT_DATE, true) RETURNING instrument_id`,
      [`E2E 097 ${label} ${RUN}`],
    );
    const instrumentId = inst[0].instrument_id;
    instrumentIds.push(instrumentId);
    const section = await ds.query<{ section_id: string }[]>(
      `INSERT INTO sections (section_id, name, "order", instrument_id)
       VALUES (gen_random_uuid(), 'E2E 097 Sección', 1, $1) RETURNING section_id`,
      [instrumentId],
    );
    sectionOf[instrumentId] = section[0].section_id;
    return instrumentId;
  }

  let order = 0;
  /** Crea por la API; devuelve la respuesta cruda para afirmar el código. */
  function postQuestion(
    instrumentId: string,
    type: string,
    systemField: string | null,
    extra: Record<string, unknown> = {},
  ) {
    order += 1;
    return auth(
      http().post(`/api/sections/${sectionOf[instrumentId]}/questions`),
    ).send({
      text: `E2E 097 ${type} ${systemField ?? 'sin destino'} ${order}`,
      typeId: typeId[type],
      isRequired: false,
      order,
      ...(systemField === null ? {} : { systemField }),
      ...extra,
    });
  }

  /** Inserta por SQL (sin validación): para precondiciones con claves viejas. */
  async function insertQuestion(
    instrumentId: string,
    type: string,
    systemField: string | null,
    archived = false,
  ): Promise<string> {
    order += 1;
    const rows = await ds.query<{ question_id: string }[]>(
      `INSERT INTO questions (question_id, section_id, text, type_id, is_required, "order", system_field, archived_at)
       VALUES (gen_random_uuid(), $1, $2, $3, false, $4, $5, $6) RETURNING question_id`,
      [
        sectionOf[instrumentId],
        `E2E 097 sql ${systemField ?? 'null'} ${order}`,
        typeId[type],
        order,
        systemField,
        archived ? new Date() : null,
      ],
    );
    return rows[0].question_id;
  }

  async function systemFieldOfQuestion(questionId: string) {
    const rows = await ds.query<{ system_field: string | null }[]>(
      `SELECT system_field FROM questions WHERE question_id = $1`,
      [questionId],
    );
    return rows[0]?.system_field ?? null;
  }

  async function fetchCatalog(all = false): Promise<SystemFieldDto[]> {
    const res = await auth(
      http().get(`/api/system-fields${all ? '?all=true' : ''}`),
    );
    expect(res.status).toBe(200);
    return res.body as SystemFieldDto[];
  }

  // ── montaje ──────────────────────────────────────────────────────────────

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

    for (const row of await ds.query<{ type_id: string; name: string }[]>(
      `SELECT type_id, name FROM types_of_questions`,
    )) {
      typeId[row.name] = row.type_id;
    }

    instA = await createInstrument('A');
    instB = await createInstrument('B');
  });

  // ── limpieza ─────────────────────────────────────────────────────────────

  afterAll(async () => {
    const safe = async (sql: string, params: unknown[] = []) => {
      try {
        await ds.query(sql, params);
      } catch {
        /* limpieza tolerante: varias columnas del spec aún no existen */
      }
    };
    await safe(
      `DELETE FROM responses WHERE question_id IN (
         SELECT q.question_id FROM questions q JOIN sections s ON s.section_id = q.section_id
          WHERE s.instrument_id = ANY($1::uuid[]))`,
      [instrumentIds],
    );
    await safe(
      `DELETE FROM options_question WHERE question_id IN (
         SELECT q.question_id FROM questions q JOIN sections s ON s.section_id = q.section_id
          WHERE s.instrument_id = ANY($1::uuid[]))`,
      [instrumentIds],
    );
    await safe(
      `DELETE FROM questions WHERE section_id IN (
         SELECT section_id FROM sections WHERE instrument_id = ANY($1::uuid[]))`,
      [instrumentIds],
    );
    await safe(`DELETE FROM sections WHERE instrument_id = ANY($1::uuid[])`, [
      instrumentIds,
    ]);
    await safe(
      `DELETE FROM instruments WHERE instrument_id = ANY($1::uuid[])`,
      [instrumentIds],
    );
    await safe(`DELETE FROM users WHERE email LIKE $1`, [
      `${PREFIX}-%@test.local`,
    ]);
    await app.close();
  });

  // ── C1 ───────────────────────────────────────────────────────────────────

  describe('C1 — GET /api/system-fields expone el catálogo con su contrato y sus permisos', () => {
    it('ADMIN recibe cada destino con todas sus propiedades', async () => {
      const catalog = await fetchCatalog();
      expect(catalog.length).toBeGreaterThan(20);
      for (const def of catalog) {
        expect(typeof def.key).toBe('string');
        expect(['farmer', 'farm', 'farmCrop']).toContain(def.entity);
        expect(typeof def.dataType).toBe('string');
        expect(Array.isArray(def.questionTypes)).toBe(true);
        expect(typeof def.label).toBe('string');
        expect(['active', 'noSource', 'legacy']).toContain(def.status);
        expect(Array.isArray(def.aliases)).toBe(true);
        expect(def).toHaveProperty('field');
        expect(def).toHaveProperty('metadataCatalog');
      }
    });

    it('RESEARCHER recibe 200 y POLLSTER 403', async () => {
      await as(researcherToken, http().get('/api/system-fields')).expect(200);
      await as(pollsterToken, http().get('/api/system-fields')).expect(403);
    });
  });

  // ── C2 ───────────────────────────────────────────────────────────────────

  describe('C2 — sin all=true no hay legacy; aparecen las claves nuevas y los alias cuelgan de la canónica', () => {
    it('filtra legacy y publica documentType, farm.crops y farm.hasCrop.canamo', async () => {
      const catalog = await fetchCatalog();
      const keys = catalog.map((d) => d.key);
      expect(catalog.some((d) => d.status === 'legacy')).toBe(false);
      expect(keys).toEqual(
        expect.arrayContaining([
          'farmer.documentType',
          'farm.crops',
          'farm.hasCrop.canamo',
        ]),
      );
      expect(keys).not.toContain('farm.mainCrop');
      expect(catalog.find((d) => d.key === 'farm.crops')?.aliases).toContain(
        'farm.mainCrop',
      );
      expect(
        catalog.find((d) => d.key === 'farm.hasCrop.canamo')?.aliases,
      ).toContain('crop.canamo');
    });

    it('con all=true aparecen las legacy de rol (farmer.isRespondent)', async () => {
      const all = await fetchCatalog(true);
      expect(all.find((d) => d.key === 'farmer.isRespondent')?.status).toBe(
        'legacy',
      );
    });
  });

  // ── C3 ───────────────────────────────────────────────────────────────────

  describe('C3 — una clave fuera del catálogo responde 400 SYSTEM_FIELD_UNKNOWN', () => {
    it('rechaza «foo.bar» y la etiqueta estratégica', async () => {
      for (const sf of ['foo.bar', STRATEGIC_TAG]) {
        const res = await postQuestion(instA, 'open_text', sf);
        expect(res.status).toBe(400);
        expect((res.body as ErrorBody).code).toBe('SYSTEM_FIELD_UNKNOWN');
      }
    });
  });

  // ── C4 ───────────────────────────────────────────────────────────────────

  describe('C4 — un destino incompatible con el tipo responde 400 SYSTEM_FIELD_TYPE_MISMATCH', () => {
    it('farm.area en yes_no es incompatible al crear', async () => {
      const res = await postQuestion(instA, 'yes_no', 'farm.area');
      expect(res.status).toBe(400);
      expect((res.body as ErrorBody).code).toBe('SYSTEM_FIELD_TYPE_MISMATCH');
    });

    it('cambiar el typeId de una pregunta con destino se valida; con systemField null pasa', async () => {
      const created = await postQuestion(
        instA,
        'numeric_with_unit',
        'farm.area',
      );
      expect(created.status).toBe(201);
      const { questionId } = created.body as QuestionBody;
      const url = `/api/sections/${sectionOf[instA]}/questions/${questionId}`;

      const bad = await auth(http().patch(url)).send({
        typeId: typeId.yes_no,
      });
      expect(bad.status).toBe(400);
      expect((bad.body as ErrorBody).code).toBe('SYSTEM_FIELD_TYPE_MISMATCH');

      await auth(http().patch(url))
        .send({ typeId: typeId.yes_no, systemField: null })
        .expect(200);
    });
  });

  // ── C5 ───────────────────────────────────────────────────────────────────

  describe('C5 — una clave legacy responde 400 SYSTEM_FIELD_LEGACY', () => {
    it('no se puede asignar farmer.isRespondent a una pregunta nueva', async () => {
      const res = await postQuestion(instA, 'yes_no', 'farmer.isRespondent');
      expect(res.status).toBe(400);
      expect((res.body as ErrorBody).code).toBe('SYSTEM_FIELD_LEGACY');
    });
  });

  // ── C6 ───────────────────────────────────────────────────────────────────

  describe('C6 — los alias se normalizan a la clave canónica al crear y al copiar', () => {
    it('farm.mainCrop → farm.crops y crop.canamo → farm.hasCrop.canamo', async () => {
      const inst = await createInstrument('C6');
      const crops = await postQuestion(
        inst,
        'multiple_choice',
        'farm.mainCrop',
      );
      expect(crops.status).toBe(201);
      expect(
        await systemFieldOfQuestion((crops.body as QuestionBody).questionId),
      ).toBe('farm.crops');

      const flag = await postQuestion(inst, 'yes_no', 'crop.canamo');
      expect(flag.status).toBe(201);
      expect(
        await systemFieldOfQuestion((flag.body as QuestionBody).questionId),
      ).toBe('farm.hasCrop.canamo');
    });

    it('copiar una pregunta con alias (sembrada por SQL) deja la clave canónica en la copia', async () => {
      const source = await createInstrument('C6 origen');
      const target = await createInstrument('C6 destino');
      const sourceQuestionId = await insertQuestion(
        source,
        'single_choice',
        'farm.mainCrop',
      );
      const res = await auth(
        http().post(`/api/sections/${sectionOf[target]}/questions/copy`),
      ).send({ sourceQuestionId });
      expect(res.status).toBe(201);
      const copyId =
        (res.body as { question?: QuestionBody } & QuestionBody).question
          ?.questionId ?? (res.body as QuestionBody).questionId;
      expect(await systemFieldOfQuestion(copyId)).toBe('farm.crops');
    });
  });

  // ── C7 ───────────────────────────────────────────────────────────────────

  describe('C7 — duplicados: 409 en el mismo instrumento, aviso entre instrumentos', () => {
    it('el mismo destino dos veces en un instrumento responde 409 SYSTEM_FIELD_DUPLICATE', async () => {
      await postQuestion(instB, 'open_text', 'farm.vereda').expect(201);
      const dup = await postQuestion(instB, 'open_text', 'farm.vereda');
      expect(dup.status).toBe(409);
      expect((dup.body as ErrorBody).code).toBe('SYSTEM_FIELD_DUPLICATE');
    });

    it('el mismo destino en otro instrumento responde 201 con warnings[]', async () => {
      const other = await createInstrument('C7 otro');
      const res = await postQuestion(other, 'open_text', 'farm.vereda');
      expect(res.status).toBe(201);
      const warnings = (res.body as QuestionBody).warnings ?? [];
      expect(warnings.length).toBeGreaterThan(0);
    });
  });

  // ── C8 ───────────────────────────────────────────────────────────────────

  describe('C8 — la extracción de cultivos da lo mismo con las claves nuevas y con los alias', () => {
    it('farm.crops / farm.hasCrop.x ≡ farm.mainCrop / crop.x', () => {
      const { resolveCropsFromResponses } = load<CropExtractionModule>(
        'surveys/crop-extraction',
      );
      const catalog = [
        { cropId: 'c-cafe', name: 'Café' },
        { cropId: 'c-canamo', name: 'Cáñamo' },
      ];
      const build = (list: string, flag: string): CropResponseLike[] => [
        {
          question: { systemField: list },
          option: { text: 'Café', metadataId: 'c-cafe' },
        },
        { question: { systemField: flag }, booleanValue: true },
      ];
      const ids = (r: { crops: { cropId: string }[] }) =>
        r.crops.map((c) => c.cropId).sort();

      const legacy = resolveCropsFromResponses(
        build('farm.mainCrop', 'crop.canamo'),
        catalog,
      );
      const canonical = resolveCropsFromResponses(
        build('farm.crops', 'farm.hasCrop.canamo'),
        catalog,
      );
      expect(ids(legacy)).toEqual(['c-cafe', 'c-canamo']);
      expect(ids(canonical)).toEqual(ids(legacy));
    });
  });

  // ── C9 ───────────────────────────────────────────────────────────────────

  describe('C9 — unidades regionales de área se convierten a hectáreas', () => {
    it.each(['fanegada', 'Fanegadas', 'cuadra', 'plaza'])(
      '2 %s = 1,28 ha, convertido',
      (unit) => {
        const { convertAreaToHectares } = load<UnitConversionModule>(
          'surveys/unit-conversion',
        );
        const r = convertAreaToHectares(2, unit);
        expect(r.unitUnknown).toBe(false);
        expect(r.converted).toBe(true);
        expect(r.hectares).toBeCloseTo(1.28, 4);
      },
    );
  });

  // ── C10 ──────────────────────────────────────────────────────────────────

  describe('C10 — farmers.document_type existe y farmer.documentType es destino extraíble', () => {
    it('la columna existe en la base de desarrollo', async () => {
      const rows = await ds.query<{ column_name: string }[]>(
        `SELECT column_name FROM information_schema.columns
          WHERE table_name = 'farmers' AND column_name = 'document_type'`,
      );
      expect(rows).toHaveLength(1);
    });

    it('la extracción conoce el destino (plan «solo completar vacíos»)', () => {
      const { systemFieldOf } = load<ExtractionPlanModule>(
        'farmer-extraction/extraction-plan',
      );
      expect(systemFieldOf('farmer', 'documentType')).toBe(
        'farmer.documentType',
      );
    });
  });

  // ── C11 ──────────────────────────────────────────────────────────────────

  describe('C11 — el catálogo de metadataId sale del destino, con clave nueva o alias', () => {
    it('farm.crops y farm.mainCrop → [crop]', () => {
      const { catalogsForSystemField } = load<MetadataCatalogsModule>(
        'options-question/metadata-catalogs',
      );
      expect(catalogsForSystemField('farm.crops')).toEqual(['crop']);
      expect(catalogsForSystemField('farm.mainCrop')).toEqual(['crop']);
    });

    it('un metadataId de otro catálogo en una opción de farm.crops responde 400', async () => {
      const inst = await createInstrument('C11');
      const created = await postQuestion(inst, 'multiple_choice', 'farm.crops');
      expect(created.status).toBe(201);
      const { questionId } = created.body as QuestionBody;
      const town = await ds.query<{ town_id: string }[]>(
        `SELECT town_id FROM towns LIMIT 1`,
      );
      const res = await auth(
        http().post(`/api/questions/${questionId}/options`),
      ).send({ text: 'Municipio no es cultivo', metadataId: town[0].town_id });
      expect(res.status).toBe(400);
    });
  });

  // ── C12 ──────────────────────────────────────────────────────────────────

  describe('C12 — la migración de datos limpia system_field, respalda en columnas y su down restaura', () => {
    it('up: sin estratégicas, inverted ni alias; columnas pobladas — down: valores originales', async () => {
      const inst = await createInstrument('C12');
      const strategic = await insertQuestion(
        inst,
        'likert',
        STRATEGIC_TAG,
        true,
      );
      const inverted = await insertQuestion(
        inst,
        'likert',
        'inverted:B9.9',
        true,
      );
      const alias = await insertQuestion(
        inst,
        'single_choice',
        'farm.mainCrop',
      );
      const legacy = await insertQuestion(
        inst,
        'yes_no',
        'farmer.isRespondent',
      );
      // Precondición de la Fase 3: las columnas ya existen y están pobladas
      // por la migración de esquema B (backfill desde el texto).
      await ds.query(
        `UPDATE questions SET is_digital_demand_item = true WHERE question_id = $1`,
        [strategic],
      );
      await ds.query(
        `UPDATE questions SET is_inverted_scale = true WHERE question_id = $1`,
        [inverted],
      );

      const Migration = loadDataMigration();
      const migration = new Migration();
      const runner = ds.createQueryRunner();
      try {
        await migration.up(runner);

        expect(await systemFieldOfQuestion(strategic)).toBeNull();
        expect(await systemFieldOfQuestion(inverted)).toBeNull();
        expect(await systemFieldOfQuestion(alias)).toBe('farm.crops');
        expect(await systemFieldOfQuestion(legacy)).toBe('farmer.isRespondent');
        const left = await ds.query<{ n: string }[]>(
          `SELECT count(*) AS n FROM questions
            WHERE system_field = $1 OR system_field LIKE 'inverted:%'
               OR system_field = 'farm.mainCrop' OR system_field LIKE 'crop.%'`,
          [STRATEGIC_TAG],
        );
        expect(Number(left[0].n)).toBe(0);
        const flags = await ds.query<
          { is_inverted_scale: boolean; is_digital_demand_item: boolean }[]
        >(
          `SELECT is_inverted_scale, is_digital_demand_item FROM questions
            WHERE question_id = ANY($1::uuid[]) ORDER BY question_id = $2 DESC`,
          [[strategic, inverted], strategic],
        );
        expect(flags[0].is_digital_demand_item).toBe(true);
        expect(flags[1].is_inverted_scale).toBe(true);
      } finally {
        await migration.down(runner);
        await runner.release();
      }

      expect(await systemFieldOfQuestion(strategic)).toBe(STRATEGIC_TAG);
      expect(await systemFieldOfQuestion(inverted)).toBe('inverted:B9.9');
      expect(await systemFieldOfQuestion(alias)).toBe('farm.mainCrop');
    });
  });

  // ── C13 ──────────────────────────────────────────────────────────────────

  describe('C13 — «Demanda digital» se apoya en is_digital_demand_item, no en el texto de system_field', () => {
    it('una Likert marcada y sin system_field entra; una Likert clave sin marca no', async () => {
      const inst = await createInstrument('C13');
      const marked = await insertQuestion(inst, 'likert', null);
      const keyOnly = await insertQuestion(inst, 'likert', null);
      await ds.query(
        `UPDATE questions SET is_digital_demand_item = true WHERE question_id = $1`,
        [marked],
      );
      await ds.query(
        `UPDATE questions SET is_key_question = true WHERE question_id = $1`,
        [keyOnly],
      );

      const { DashboardService } = load<{
        DashboardService: abstract new (...args: never[]) => unknown;
      }>('dashboard/dashboard.service');
      const service: DashboardContract = app.get(DashboardService);
      const ids = (await service.findDigitalDemandQuestions()).map(
        (q) => q.questionId,
      );
      expect(ids).toContain(marked);
      expect(ids).not.toContain(keyOnly);
    });
  });

  // ── C14 ──────────────────────────────────────────────────────────────────

  describe('C14 — los KPI por destino toman todas las preguntas del destino, alias incluidos', () => {
    it('findQuestionsBySystemField(farm.crops) incluye la canónica, el alias y la archivada', async () => {
      const inst = await createInstrument('C14');
      const canonical = await insertQuestion(
        inst,
        'multiple_choice',
        'farm.crops',
      );
      const alias = await insertQuestion(
        inst,
        'single_choice',
        'farm.mainCrop',
      );
      const archived = await insertQuestion(
        inst,
        'single_choice',
        'farm.mainCrop',
        true,
      );

      const { keysFor } = load<RegistryModule>(
        'questions/system-fields/system-field-registry',
      );
      expect(keysFor('farm.crops')).toEqual(
        expect.arrayContaining(['farm.crops', 'farm.mainCrop']),
      );

      const { DashboardService } = load<{
        DashboardService: abstract new (...args: never[]) => unknown;
      }>('dashboard/dashboard.service');
      const service: DashboardContract = app.get(DashboardService);
      const ids = (await service.findQuestionsBySystemField('farm.crops')).map(
        (q) => q.questionId,
      );
      expect(ids).toEqual(expect.arrayContaining([canonical, alias, archived]));
    });
  });
});
