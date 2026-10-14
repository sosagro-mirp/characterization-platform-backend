/**
 * Spec 94 — Modelo de datos centrado en el productor: modelo y backfill.
 * `spec/94_modelo_datos_centrado_productor.md` (raíz del ecosistema).
 * Dividido el 2026-10-14: la extracción automática en el batch, el estado de
 * extracción, los alias de `clientFarmerId`, las discrepancias por API y el
 * replay viven en el spec 95 (`e2e-095-extraccion-unificada.e2e-spec.ts`).
 *
 * ESTAS PRUEBAS NACEN EN ROJO (enfoque test-first). Hoy no existe nada de lo
 * que verifican: la tabla `farmer_farms`, la PK `farm_crop_id` y `archived_at` de
 * `farms_crops`, los anclajes de `surveys` (`farm_id`, `farm_crop_id`…), las
 * migraciones `Spec94*`, `src/database/spec94/verify.ts`, los endpoints de
 * vínculo productor-finca, `farms[]` / `farmers[]` / `farmCrops` en las
 * respuestas, los filtros `farmId` / `farmCropId`, ni que `extract-farmer` /
 * `extract-crops` escriban el modelo nuevo.
 *
 * Criterios cubiertos: C1 a C13 (un `describe` por criterio, prefijo `Cnn`).
 * En este spec el batch NO extrae: los casos que necesitan productor o
 * cultivos anclados llaman explícitamente a `extract-farmer` / `extract-crops`
 * (como hacen hoy la web y el móvil).
 *
 * Cómo fallan hoy:
 *  - Los módulos nuevos (migraciones, `verify.ts`) se cargan con `require`
 *    dinámico (`loadMigration` / `loadModule`), así que la suite COMPILA y
 *    cada caso falla en runtime con un mensaje que nombra el símbolo
 *    esperado. Nada de este archivo impide compilar el resto de e2e.
 *  - Los endpoints nuevos responden 404, los DTO rechazan los campos nuevos
 *    con 400 (`forbidNonWhitelisted`), y las consultas a columnas o tablas
 *    nuevas fallan en SQL.
 *
 * Migraciones y backfill (C1–C4, C10): se ejecutan las clases de migración
 * (`up` / `down`) DENTRO de una transacción de un `QueryRunner` propio que
 * SIEMPRE se revierte (`withRollback`). Postgres revierte también el DDL, así
 * que la base de desarrollo queda intacta. Requisito de diseño que esto fija:
 * `Spec94BackfillAnchors.up()` debe poder ejecutarse dos veces seguidas (C4,
 * "una segunda ejecución no cambia nada"), es decir, su DDL de auditoría usa
 * `IF NOT EXISTS`.
 *
 * Todo lo demás se ejercita por HTTP (supertest sobre la app Nest completa,
 * como los e2e 068, 084 y 093). El SQL directo solo monta precondiciones, lee
 * el estado resultante y limpia.
 *
 * Datos: desarrollo (`sosagro-dev`) está vacío, así que la suite siembra sus
 * propios instrumentos (registro y no-registro, con `systemField`), usuario
 * administrador, campañas, sesiones y, si no hay ninguno publicado, un
 * documento de consentimiento (las constancias de C10 lo necesitan). Identidades con
 * prefijo `Spec94` y documentos `94<RUN><nn>`. Todo se elimina en `afterAll`.
 *
 * ENTORNO: SOLO contra la base de desarrollo (`DATABASE_URL` activa del
 * `.env`, Neon `sosagro-dev`), NUNCA contra producción. Recomendado
 * `--runInBand`: los casos de backfill toman locks amplios dentro de su
 * transacción revertida.
 */

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getOptionsToken } from '@nestjs/throttler';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource, EntityManager, QueryRunner } from 'typeorm';
import * as bcrypt from 'bcrypt';
import * as fs from 'fs';
import * as path from 'path';
import { AppModule } from '../src/app.module';

jest.setTimeout(180_000);

// ─── constantes ─────────────────────────────────────────────────────────────

const TEST_PASSWORD = 'E2eTest1234!';
const PREFIX = 'e2e-094';
/** Sello de la corrida: aísla documentos y nombres entre corridas. */
const RUN = Date.now().toString().slice(-6);

const CROP_NAMES = ['Café', 'Cacao'] as const;
type CropName = (typeof CROP_NAMES)[number];

type InstrumentKey = 'reg' | 'nonReg';

/** Campos con `systemField` que siembra la suite. `note` no tiene systemField. */
type FieldKey =
  | 'name'
  | 'document'
  | 'phone'
  | 'farmName'
  | 'vereda'
  | 'corregimiento'
  | 'mainCrop'
  | 'note';

const SYSTEM_FIELD: Record<FieldKey, string | null> = {
  name: 'farmer.name',
  document: 'farmer.documentId',
  phone: 'farmer.phone',
  farmName: 'farm.name',
  vereda: 'farm.vereda',
  corregimiento: 'farm.corregimiento',
  mainCrop: 'farm.mainCrop',
  note: null,
};

/** Preguntas de cada instrumento. `nonReg` no identifica al productor. */
const INSTRUMENT_FIELDS: Record<InstrumentKey, FieldKey[]> = {
  reg: ['name', 'document', 'phone', 'farmName', 'vereda', 'mainCrop'],
  nonReg: ['farmName', 'vereda', 'corregimiento', 'mainCrop', 'note'],
};

// ─── contrato asumido (spec 94, "Contrato de API") ──────────────────────────
// La implementación debe respetar estos nombres o ajustar este archivo (con
// aprobación) si cambian.

interface FarmCropRef {
  farmCropId: string;
  cropId: string;
  name: string;
}

interface FarmerFarmRef {
  farmId: string;
  name: string;
  vereda?: string | null;
  town?: unknown;
  role: string;
  isPrimary: boolean;
  crops: FarmCropRef[];
}

interface FarmerBody {
  id?: string;
  farmerId?: string;
  name: string;
  documentId: string | null;
  farm?: {
    farmId: string;
    name: string;
    crops?: { cropId: string; name: string }[];
  } | null;
  farms?: FarmerFarmRef[];
}

interface ExtractFarmerBody {
  farmer: FarmerBody;
  existed: boolean;
  crops?: unknown;
  extraction?: unknown;
}

interface FarmBody {
  farmId: string;
  name: string;
  crops?: { cropId: string; name: string }[];
  farmCrops?: FarmCropRef[];
  farmers?: {
    farmerId: string;
    name: string;
    role: string;
    isPrimary: boolean;
  }[];
}

interface DeletionPreviewBody {
  farm: { farmId: string; shared: boolean; willBeDeleted: boolean } | null;
  farms?: { farmId: string; shared: boolean; willBeDeleted: boolean }[];
}

interface KpiBody {
  key: string;
  value: number | null;
}

interface LoginResponse {
  accessToken: string;
}

/** Respuestas de una encuesta de la suite. Omitido = sin responder. */
interface Answers {
  name?: string;
  document?: string;
  phone?: string;
  farmName?: string;
  vereda?: string;
  corregimiento?: string;
  mainCrop?: CropName;
  note?: string;
}

interface ResponseItem {
  questionId: string;
  optionId?: string;
  textValue?: string;
}

/** Contrato mínimo de una migración TypeORM, cargada por su clase. */
interface MigrationLike {
  up(queryRunner: QueryRunner): Promise<void>;
  down(queryRunner: QueryRunner): Promise<void>;
}

/**
 * Contrato asumido de `src/database/spec94/verify.ts` (`pnpm spec94:verify`):
 * una función de solo lectura que recibe un `EntityManager` (para poder
 * correr dentro de una transacción) y devuelve un informe serializable. El
 * informe debe LISTAR los ids de las constancias no anclables (C10).
 */
type Spec94Verify = (manager: EntityManager) => Promise<unknown>;

/** Firma del chequeo de dependientes de `snapshot.ts` (C12). */
type AssertNoUnknownDependents = (ds: DataSource) => Promise<void>;

// ─── carga dinámica de módulos que aún no existen ───────────────────────────
// `require` (no `import`) para que la suite compile hoy: el módulo ausente
// solo hace fallar el caso que lo usa, con un mensaje que nombra el símbolo.

const SRC_DIR = path.join(__dirname, '..', 'src');

function loadModule(relativePath: string): Record<string, unknown> {
  const full = path.join(SRC_DIR, relativePath);
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require(full) as Record<string, unknown>;
  } catch (err) {
    throw new Error(
      `spec 94: no se pudo cargar src/${relativePath} — ${(err as Error).message}`,
    );
  }
}

/**
 * Carga la migración `src/migrations/<timestamp>-<prefix>.ts` y devuelve una
 * instancia de la clase exportada cuyo nombre empieza por `<prefix>` (patrón
 * del repo: `Spec84ArchiveAndCorregimiento1788100000000`).
 */
function loadMigration(prefix: string): MigrationLike {
  const dir = path.join(SRC_DIR, 'migrations');
  const file = fs.readdirSync(dir).find((f) => f.endsWith(`-${prefix}.ts`));
  if (!file) {
    throw new Error(
      `spec 94: falta la migración src/migrations/<timestamp>-${prefix}.ts`,
    );
  }
  const mod = loadModule(path.join('migrations', file.replace(/\.ts$/, '')));
  const entry = Object.entries(mod).find(
    ([name, value]) => name.startsWith(prefix) && typeof value === 'function',
  );
  if (!entry) {
    throw new Error(
      `spec 94: ${file} no exporta una clase ${prefix}<timestamp>`,
    );
  }
  const Ctor = entry[1] as new () => MigrationLike;
  return new Ctor();
}

/** `src/database/spec94/verify.ts` — acepta `verifySpec94` o `verify`. */
function loadVerify(): Spec94Verify {
  const mod = loadModule(path.join('database', 'spec94', 'verify'));
  const fn = mod.verifySpec94 ?? mod.verify;
  if (typeof fn !== 'function') {
    throw new Error(
      'spec 94: src/database/spec94/verify.ts debe exportar `verifySpec94(manager)` (o `verify`)',
    );
  }
  return fn as Spec94Verify;
}

// ─── suite ──────────────────────────────────────────────────────────────────

describe('spec-094 — modelo de datos centrado en el productor (e2e)', () => {
  let app: INestApplication<App>;
  let ds: DataSource;

  let adminToken: string;
  let adminUserId: string;

  const typeId: Record<string, string> = {};
  const cropId = {} as Record<CropName, string>;
  let consentDocumentId: string;
  let createdConsentDocumentId: string | null = null;

  const instrumentId = {} as Record<InstrumentKey, string>;
  /** q[instrumento][campo] = questionId */
  const q = {} as Record<InstrumentKey, Partial<Record<FieldKey, string>>>;
  /** cropOpt[instrumento][cultivo] = optionId de farm.mainCrop */
  const cropOpt = {} as Record<InstrumentKey, Record<CropName, string>>;

  // Registro para la limpieza.
  const surveyIds: string[] = [];
  const campaignIds: string[] = [];
  const sessionIds: string[] = [];

  let docSeq = 0;
  function newDoc(): string {
    docSeq += 1;
    return `94${RUN}${String(docSeq).padStart(2, '0')}`;
  }

  function http() {
    return request(app.getHttpServer());
  }

  function as(token: string, req: request.Test) {
    return req.set('Authorization', `Bearer ${token}`);
  }

  function auth(req: request.Test) {
    return as(adminToken, req);
  }

  // ── helpers de base de datos ─────────────────────────────────────────────

  async function count(sql: string, params: unknown[] = []): Promise<number> {
    const rows = await ds.query<{ n: string }[]>(sql, params);
    return Number(rows[0].n);
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
         VALUES (gen_random_uuid(), 'E2E', 'Spec94', $1, $2, $3, false)`,
        [email, hash, roles[0].role_id],
      );
    }
    const login = await http()
      .post('/api/auth/login')
      .send({ email, password: TEST_PASSWORD })
      .expect(200);
    return (login.body as LoginResponse).accessToken;
  }

  async function buildInstrument(key: InstrumentKey): Promise<void> {
    const inst = await ds.query<{ instrument_id: string }[]>(
      `INSERT INTO instruments (instrument_id, name, version, publish_date, is_active)
       VALUES (gen_random_uuid(), $1, 1, CURRENT_DATE, true) RETURNING instrument_id`,
      [`E2E 094 ${key} ${RUN}`],
    );
    instrumentId[key] = inst[0].instrument_id;
    const section = await ds.query<{ section_id: string }[]>(
      `INSERT INTO sections (section_id, name, "order", instrument_id)
       VALUES (gen_random_uuid(), 'E2E 094 Sección', 1, $1) RETURNING section_id`,
      [instrumentId[key]],
    );
    q[key] = {};
    let order = 0;
    for (const field of INSTRUMENT_FIELDS[key]) {
      order += 1;
      const type = field === 'mainCrop' ? 'single_choice' : 'open_text';
      const rows = await ds.query<{ question_id: string }[]>(
        `INSERT INTO questions (question_id, section_id, text, type_id, is_required, "order", system_field)
         VALUES (gen_random_uuid(), $1, $2, $3, false, $4, $5) RETURNING question_id`,
        [
          section[0].section_id,
          `E2E 094 ${field}`,
          typeId[type],
          order,
          SYSTEM_FIELD[field],
        ],
      );
      q[key][field] = rows[0].question_id;
    }
    cropOpt[key] = {} as Record<CropName, string>;
    for (const crop of CROP_NAMES) {
      const rows = await ds.query<{ option_id: string }[]>(
        `INSERT INTO options_question (option_id, question_id, text, value, metadata_id)
         VALUES (gen_random_uuid(), $1, $2, NULL, $3) RETURNING option_id`,
        [q[key].mainCrop, crop, cropId[crop]],
      );
      cropOpt[key][crop] = rows[0].option_id;
    }
  }

  function buildResponses(key: InstrumentKey, a: Answers): ResponseItem[] {
    const items: ResponseItem[] = [];
    for (const field of INSTRUMENT_FIELDS[key]) {
      const questionId = q[key][field]!;
      if (field === 'mainCrop') {
        if (a.mainCrop) {
          items.push({ questionId, optionId: cropOpt[key][a.mainCrop] });
        }
        continue;
      }
      const value = a[field];
      if (value !== undefined) items.push({ questionId, textValue: value });
    }
    if (!items.length) {
      throw new Error(`Respuestas vacías para el instrumento ${key}`);
    }
    return items;
  }

  /**
   * Siembra el estado POST-H3 de un productor con finca: finca, productor con
   * `farm_id` espejo y su fila en `farmer_farms` (principal). Hoy la última
   * inserción falla (la tabla no existe): el caso que la usa queda en rojo.
   */
  async function seedLinkedFarmer(fields: {
    tag: string;
    name?: string;
    documentId?: string;
    phone?: string | null;
    farm?: {
      name?: string;
      vereda?: string | null;
      corregimiento?: string | null;
      crops?: CropName[];
    } | null;
  }): Promise<{ farmerId: string; farmId: string | null; doc: string }> {
    const doc = fields.documentId ?? newDoc();
    let farmId: string | null = null;
    if (fields.farm !== null) {
      const farm = fields.farm ?? {};
      const rows = await ds.query<{ farm_id: string }[]>(
        `INSERT INTO farms (farm_id, name, vereda, corregimiento)
         VALUES (gen_random_uuid(), $1, $2, $3) RETURNING farm_id`,
        [
          farm.name ?? `Spec94 Finca ${fields.tag} ${RUN}`,
          farm.vereda ?? null,
          farm.corregimiento ?? null,
        ],
      );
      farmId = rows[0].farm_id;
      for (const crop of farm.crops ?? []) {
        await ds.query(
          `INSERT INTO farms_crops (farm_id, crop_id) VALUES ($1, $2)`,
          [farmId, cropId[crop]],
        );
      }
    }
    const farmer = await ds.query<{ id: string }[]>(
      `INSERT INTO farmers (id, name, document_id, phone, farm_id)
       VALUES (gen_random_uuid(), $1, $2, $3, $4) RETURNING id`,
      [
        fields.name ?? `Spec94 ${fields.tag} Productor`,
        doc,
        fields.phone ?? null,
        farmId,
      ],
    );
    const farmerId = farmer[0].id;
    if (farmId) {
      await ds.query(
        `INSERT INTO farmer_farms (farmer_farm_id, farmer_id, farm_id, role, is_primary, source)
         VALUES (gen_random_uuid(), $1, $2, 'producer', true, 'admin')`,
        [farmerId, farmId],
      );
    }
    return { farmerId, farmId, doc };
  }

  async function seedCampaignSession(
    farmerId: string | null,
  ): Promise<{ campaignId: string; sessionId: string }> {
    const campaign = await ds.query<{ campaign_id: string }[]>(
      `INSERT INTO campaigns (campaign_id, name, is_active)
       VALUES (gen_random_uuid(), $1, true) RETURNING campaign_id`,
      [`E2E 094 Campaña ${RUN} ${campaignIds.length + 1}`],
    );
    const campaignId = campaign[0].campaign_id;
    campaignIds.push(campaignId);
    const session = await ds.query<{ session_id: string }[]>(
      `INSERT INTO campaign_sessions (session_id, campaign_id, user_id, farmer_id, sincronized)
       VALUES (gen_random_uuid(), $1, $2, $3, true) RETURNING session_id`,
      [campaignId, adminUserId, farmerId],
    );
    const sessionId = session[0].session_id;
    sessionIds.push(sessionId);
    return { campaignId, sessionId };
  }

  /** `POST /surveys` (admin). `extra` lleva los campos nuevos del spec 94. */
  async function createSurvey(
    key: InstrumentKey,
    extra: Record<string, unknown> = {},
  ): Promise<string> {
    const res = await auth(http().post('/api/surveys')).send({
      instrumentIds: [instrumentId[key]],
      sincronized: true,
      ...extra,
    });
    expect(res.status).toBe(201);
    const { surveyId } = res.body as { surveyId: string };
    surveyIds.push(surveyId);
    return surveyId;
  }

  function batch(key: InstrumentKey, surveyId: string, a: Answers) {
    return auth(http().post('/api/responses/batch')).send(
      buildResponses(key, a).map((r) => ({ surveyId, ...r })),
    );
  }

  async function batchOk(key: InstrumentKey, surveyId: string, a: Answers) {
    const res = await batch(key, surveyId, a);
    expect(res.status).toBe(201);
    return res;
  }

  function extractFarmer(surveyId: string, body: object = {}) {
    return auth(http().post(`/api/surveys/${surveyId}/extract-farmer`)).send(
      body,
    );
  }

  function extractCrops(surveyId: string) {
    return auth(http().post(`/api/surveys/${surveyId}/extract-crops`)).send({});
  }

  async function surveyAnchors(surveyId: string) {
    const rows = await ds.query<
      {
        farmer_id: string | null;
        farm_id: string | null;
        farm_crop_id: string | null;
        crop_id: string | null;
      }[]
    >(
      `SELECT farmer_id, farm_id, farm_crop_id, crop_id
         FROM surveys WHERE survey_id = $1`,
      [surveyId],
    );
    return rows[0];
  }

  async function farmerLinks(farmerId: string) {
    return ds.query<
      { farm_id: string; role: string; is_primary: boolean; source: string }[]
    >(
      `SELECT farm_id, role, is_primary, source FROM farmer_farms
        WHERE farmer_id = $1 ORDER BY is_primary DESC, created_at ASC`,
      [farmerId],
    );
  }

  async function farmCrops(farmId: string) {
    return ds.query<
      { farm_crop_id: string; crop_id: string; archived_at: Date | null }[]
    >(
      `SELECT farm_crop_id, crop_id, archived_at FROM farms_crops
        WHERE farm_id = $1 ORDER BY crop_id`,
      [farmId],
    );
  }

  async function activeCropIds(farmId: string): Promise<string[]> {
    return (await farmCrops(farmId))
      .filter((r) => r.archived_at === null)
      .map((r) => r.crop_id)
      .sort();
  }

  function sortedCropIds(names: CropName[]): string[] {
    return names.map((n) => cropId[n]).sort();
  }

  function farmerIdOf(farmer: FarmerBody): string {
    return farmer.farmerId ?? farmer.id ?? '';
  }

  // ── helpers del backfill (transacción siempre revertida) ─────────────────

  /** `QueryRunner.query` no es genérico: envoltorio tipado. */
  async function qrq<T>(
    qr: QueryRunner,
    sql: string,
    params: unknown[] = [],
  ): Promise<T> {
    return (await qr.query(sql, params)) as T;
  }

  async function withRollback<T>(
    fn: (qr: QueryRunner) => Promise<T>,
  ): Promise<T> {
    const qr = ds.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      return await fn(qr);
    } finally {
      await qr.rollbackTransaction();
      await qr.release();
    }
  }

  async function expectSqlError(
    qr: QueryRunner,
    sql: string,
    params: unknown[] = [],
  ): Promise<void> {
    await qr.query('SAVEPOINT spec94_expect_error');
    let failed = false;
    try {
      await qr.query(sql, params);
    } catch {
      failed = true;
    }
    await qr.query('ROLLBACK TO SAVEPOINT spec94_expect_error');
    expect(failed).toBe(true);
  }

  interface PreH3Seed {
    farmA: string;
    farmB: string;
    farmerA: string;
    farmerB: string;
    /** Sesión S1 (productor A, cultivo de sesión Cacao) — s1a es la primera. */
    sessionS1: string;
    s1a: string;
    s1b: string;
    /** Sesión S2 (productor B, sin cultivos de sesión). */
    s2: string;
    /** Productor A directo, sin sesión; las respuestas resuelven Café. */
    s3: string;
    /** Productor A directo, sin sesión ni cultivo resoluble → ambiguo. */
    s4: string;
    /** Sesión S5 sin productor; su encuesta s5 sí lo tiene (B). */
    sessionS5: string;
    s5: string;
    /** Sesión S6 abandonada: sin productor ni encuestas. */
    sessionS6: string;
    consentBySession: string;
    consentBySurvey: string;
    consentOrphan: string;
    surveys: string[];
    consents: string[];
    sessions: string[];
  }

  /**
   * Siembra, dentro de la transacción, el estado "pre-H3" (datos tal como los
   * dejó el modelo anterior): encuestas sin anclajes, productores con
   * `farmers.farm_id`, constancias sin productor. Con `withFarmerFarms` se
   * agrega lo que ya habría hecho la migración 1 (`Spec94CreateFarmerFarms`):
   * la finca principal en `farmer_farms`, `source = 'backfill'`.
   */
  async function seedPreH3(
    qr: QueryRunner,
    withFarmerFarms: boolean,
  ): Promise<PreH3Seed> {
    const one = async (sql: string, params: unknown[]): Promise<string> => {
      const rows = await qrq<Record<string, string>[]>(qr, sql, params);
      return Object.values(rows[0])[0];
    };
    const farm = (name: string) =>
      one(
        `INSERT INTO farms (farm_id, name) VALUES (gen_random_uuid(), $1) RETURNING farm_id`,
        [name],
      );
    const farmA = await farm(`Spec94 BF Finca A ${RUN}`);
    const farmB = await farm(`Spec94 BF Finca B ${RUN}`);
    for (const [f, c] of [
      [farmA, cropId['Café']],
      [farmA, cropId['Cacao']],
      [farmB, cropId['Café']],
    ]) {
      await qr.query(
        `INSERT INTO farms_crops (farm_id, crop_id) VALUES ($1, $2)`,
        [f, c],
      );
    }
    const farmer = (name: string, farmId: string) =>
      one(
        `INSERT INTO farmers (id, name, document_id, farm_id)
         VALUES (gen_random_uuid(), $1, $2, $3) RETURNING id`,
        [name, newDoc(), farmId],
      );
    const farmerA = await farmer('Spec94 BF Productor A', farmA);
    const farmerB = await farmer('Spec94 BF Productor B', farmB);
    if (withFarmerFarms) {
      for (const [fr, fm] of [
        [farmerA, farmA],
        [farmerB, farmB],
      ]) {
        await qr.query(
          `INSERT INTO farmer_farms (farmer_farm_id, farmer_id, farm_id, role, is_primary, source)
           VALUES (gen_random_uuid(), $1, $2, 'producer', true, 'backfill')`,
          [fr, fm],
        );
      }
    }

    const campaignId = await one(
      `INSERT INTO campaigns (campaign_id, name, is_active)
       VALUES (gen_random_uuid(), $1, true) RETURNING campaign_id`,
      [`E2E 094 BF Campaña ${RUN}`],
    );
    const session = (farmerId: string | null) =>
      one(
        `INSERT INTO campaign_sessions (session_id, campaign_id, user_id, farmer_id, sincronized)
         VALUES (gen_random_uuid(), $1, $2, $3, true) RETURNING session_id`,
        [campaignId, adminUserId, farmerId],
      );
    const sessionS1 = await session(farmerA);
    const sessionS2 = await session(farmerB);
    const sessionS5 = await session(null);
    const sessionS6 = await session(null);
    await qr.query(
      `INSERT INTO campaign_sessions_crops (campaign_sessions_session_id, types_of_crops_crop_id)
       VALUES ($1, $2)`,
      [sessionS1, cropId['Cacao']],
    );

    const survey = (
      sessionId: string | null,
      farmerId: string | null,
      createdAt: string,
    ) =>
      one(
        `INSERT INTO surveys (survey_id, user_id, campaign_session_id, farmer_id, sincronized, created_at)
         VALUES (gen_random_uuid(), $1, $2, $3, true, $4::timestamp) RETURNING survey_id`,
        [adminUserId, sessionId, farmerId, createdAt],
      );
    const s1a = await survey(sessionS1, null, '2026-01-01T08:00:00');
    const s1b = await survey(sessionS1, null, '2026-01-01T09:00:00');
    const s2 = await survey(sessionS2, null, '2026-01-02T08:00:00');
    const s3 = await survey(null, farmerA, '2026-01-03T08:00:00');
    const s4 = await survey(null, farmerA, '2026-01-04T08:00:00');
    const s5 = await survey(sessionS5, farmerB, '2026-01-05T08:00:00');
    const surveys = [s1a, s1b, s2, s3, s4, s5];
    for (const s of surveys) {
      await qr.query(
        `INSERT INTO surveys_instruments (survey_id, instrument_id) VALUES ($1, $2)`,
        [s, instrumentId.nonReg],
      );
      await qr.query(
        `INSERT INTO responses (response_id, survey_id, question_id, text_value)
         VALUES (gen_random_uuid(), $1, $2, 'Spec94 BF nota')`,
        [s, q.nonReg.note],
      );
    }
    // s3: las respuestas resuelven un único cultivo (Café) de una finca con dos.
    await qr.query(
      `INSERT INTO responses (response_id, survey_id, question_id, option_id)
       VALUES (gen_random_uuid(), $1, $2, $3)`,
      [s3, q.nonReg.mainCrop, cropOpt.nonReg['Café']],
    );

    const consent = (sessionId: string | null, surveyId: string | null) =>
      one(
        `INSERT INTO consent_records (consent_record_id, consent_document_id, session_id, survey_id,
                                      accepted_data_processing, accepted_at, recorded_by)
         VALUES (gen_random_uuid(), $1, $2, $3, true, now(), $4) RETURNING consent_record_id`,
        [consentDocumentId, sessionId, surveyId, adminUserId],
      );
    const consentBySession = await consent(sessionS1, null);
    const consentBySurvey = await consent(null, s3);
    const consentOrphan = await consent(sessionS6, null);

    return {
      farmA,
      farmB,
      farmerA,
      farmerB,
      sessionS1,
      s1a,
      s1b,
      s2,
      s3,
      s4,
      sessionS5,
      s5,
      sessionS6,
      consentBySession,
      consentBySurvey,
      consentOrphan,
      surveys,
      consents: [consentBySession, consentBySurvey, consentOrphan],
      sessions: [sessionS1, sessionS2, sessionS5, sessionS6],
    };
  }

  /** Estado comparable de lo sembrado (para idempotencia y `down`). */
  async function seedState(qr: QueryRunner, seed: PreH3Seed) {
    return {
      surveys: await qrq<unknown[]>(
        qr,
        `SELECT survey_id, farmer_id, farm_id, farm_crop_id, crop_id
           FROM surveys WHERE survey_id = ANY($1::uuid[]) ORDER BY survey_id`,
        [seed.surveys],
      ),
      consents: await qrq<unknown[]>(
        qr,
        `SELECT consent_record_id, farmer_id, survey_id, session_id
           FROM consent_records WHERE consent_record_id = ANY($1::uuid[])
          ORDER BY consent_record_id`,
        [seed.consents],
      ),
      sessions: await qrq<unknown[]>(
        qr,
        `SELECT session_id, farmer_id FROM campaign_sessions
          WHERE session_id = ANY($1::uuid[]) ORDER BY session_id`,
        [seed.sessions],
      ),
    };
  }

  async function seedRow<T>(
    qr: QueryRunner,
    sql: string,
    params: unknown[],
  ): Promise<T> {
    const rows = await qrq<T[]>(qr, sql, params);
    return rows[0];
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
    adminUserId = (
      await ds.query<{ user_id: string }[]>(
        `SELECT user_id FROM users WHERE email = $1`,
        [`${PREFIX}-admin@test.local`],
      )
    )[0].user_id;

    for (const row of await ds.query<{ type_id: string; name: string }[]>(
      `SELECT type_id, name FROM types_of_questions`,
    )) {
      typeId[row.name] = row.type_id;
    }
    for (const row of await ds.query<{ crop_id: string; name: string }[]>(
      `SELECT crop_id, name FROM types_of_crops WHERE name = ANY($1::varchar[])`,
      [[...CROP_NAMES]],
    )) {
      cropId[row.name as CropName] = row.crop_id;
    }

    // Documento de consentimiento publicado (backlog: `sosagro-dev` no trae
    // ninguno). Se crea solo si falta y se elimina en afterAll.
    const published = await ds.query<{ consent_document_id: string }[]>(
      `SELECT consent_document_id FROM consent_documents
        WHERE status = 'published' ORDER BY published_at DESC LIMIT 1`,
    );
    if (published.length) {
      consentDocumentId = published[0].consent_document_id;
    } else {
      const created = await ds.query<{ consent_document_id: string }[]>(
        `INSERT INTO consent_documents (consent_document_id, version, title, body,
            data_processing_clause, multimedia_clause, rights_clause,
            responsible_entity, contact_email, status, published_at)
         VALUES (gen_random_uuid(), $1, 'E2E 094 Consentimiento', 'Cuerpo de prueba',
            'Cláusula de datos', 'Cláusula multimedia', 'Cláusula de derechos',
            'SosAgro 4.C (prueba)', 'e2e-094@test.local', 'published', now())
         RETURNING consent_document_id`,
        [`e2e094-${RUN}`],
      );
      consentDocumentId = created[0].consent_document_id;
      createdConsentDocumentId = consentDocumentId;
    }

    await buildInstrument('reg');
    await buildInstrument('nonReg');
  });

  // ── limpieza ─────────────────────────────────────────────────────────────

  afterAll(async () => {
    const safe = async (sql: string, params: unknown[] = []) => {
      try {
        await ds.query(sql, params);
      } catch {
        /* limpieza tolerante: hoy varias tablas del spec aún no existen */
      }
    };

    const farmerIds = (
      await ds.query<{ id: string }[]>(
        `SELECT id FROM farmers WHERE name ILIKE 'spec94%'`,
      )
    ).map((r) => r.id);
    const farmIds = (
      await ds.query<{ farm_id: string }[]>(
        `SELECT farm_id FROM farms WHERE name ILIKE 'spec94%'`,
      )
    ).map((r) => r.farm_id);

    await safe(
      `DELETE FROM farmer_document_collisions
        WHERE survey_id = ANY($1::uuid[]) OR existing_farmer_id = ANY($2::uuid[])`,
      [surveyIds, farmerIds],
    );
    await safe(
      `DELETE FROM consent_records
        WHERE survey_id = ANY($1::uuid[]) OR farmer_id = ANY($2::uuid[])
           OR session_id = ANY($3::uuid[])`,
      [surveyIds, farmerIds, sessionIds],
    );
    await safe(
      `DELETE FROM campaign_sessions_crops
        WHERE campaign_sessions_session_id = ANY($1::uuid[])`,
      [sessionIds],
    );
    await safe(`DELETE FROM responses WHERE survey_id = ANY($1::uuid[])`, [
      surveyIds,
    ]);
    await safe(
      `DELETE FROM surveys_instruments WHERE survey_id = ANY($1::uuid[])`,
      [surveyIds],
    );
    await safe(`DELETE FROM surveys WHERE survey_id = ANY($1::uuid[])`, [
      surveyIds,
    ]);
    await safe(
      `DELETE FROM campaign_sessions WHERE session_id = ANY($1::uuid[])`,
      [sessionIds],
    );
    await safe(`DELETE FROM campaigns WHERE campaign_id = ANY($1::uuid[])`, [
      campaignIds,
    ]);
    await safe(
      `DELETE FROM farmer_farms
        WHERE farmer_id = ANY($1::uuid[]) OR farm_id = ANY($2::uuid[])`,
      [farmerIds, farmIds],
    );
    await safe(`DELETE FROM farmers WHERE id = ANY($1::uuid[])`, [farmerIds]);
    await safe(`DELETE FROM farms_crops WHERE farm_id = ANY($1::uuid[])`, [
      farmIds,
    ]);
    await safe(`DELETE FROM farms WHERE farm_id = ANY($1::uuid[])`, [farmIds]);
    for (const key of Object.keys(instrumentId) as InstrumentKey[]) {
      await safe(
        `DELETE FROM options_question WHERE question_id IN
           (SELECT question_id FROM questions WHERE section_id IN
              (SELECT section_id FROM sections WHERE instrument_id = $1))`,
        [instrumentId[key]],
      );
      await safe(
        `DELETE FROM questions WHERE section_id IN
           (SELECT section_id FROM sections WHERE instrument_id = $1)`,
        [instrumentId[key]],
      );
      await safe(`DELETE FROM sections WHERE instrument_id = $1`, [
        instrumentId[key],
      ]);
      await safe(`DELETE FROM instruments WHERE instrument_id = $1`, [
        instrumentId[key],
      ]);
    }
    if (createdConsentDocumentId) {
      await safe(`DELETE FROM consent_records WHERE consent_document_id = $1`, [
        createdConsentDocumentId,
      ]);
      await safe(
        `DELETE FROM consent_documents WHERE consent_document_id = $1`,
        [createdConsentDocumentId],
      );
    }
    await safe(`DELETE FROM users WHERE email LIKE $1`, [
      `${PREFIX}-%@test.local`,
    ]);
    await app.close();
  });

  // ═════════════════════════════════════════════════════════════════════════
  // C1 — farmer_farms tras la migración 1
  // ═════════════════════════════════════════════════════════════════════════

  describe('C1 — tras la migración, cada agricultor con farm_id tiene una sola fila principal en farmer_farms y el espejo coincide', () => {
    it('Spec94CreateFarmerFarms.up crea el vínculo principal (producer, backfill) y la base impide una segunda principal', async () => {
      // Símbolo esperado: clase `Spec94CreateFarmerFarms<timestamp>` en
      // src/migrations/<timestamp>-Spec94CreateFarmerFarms.ts.
      const m1 = loadMigration('Spec94CreateFarmerFarms');

      await withRollback(async (qr) => {
        // Volver al estado previo a la migración 1 (DDL transaccional: se
        // revierte con todo lo demás al final).
        await m1.down(qr);
        const seed = await seedPreH3(qr, false);
        await m1.up(qr);

        for (const [farmerId, farmId] of [
          [seed.farmerA, seed.farmA],
          [seed.farmerB, seed.farmB],
        ]) {
          const links = await qrq<
            {
              farm_id: string;
              role: string;
              is_primary: boolean;
              source: string;
            }[]
          >(
            qr,
            `SELECT farm_id, role, is_primary, source FROM farmer_farms WHERE farmer_id = $1`,
            [farmerId],
          );
          expect(links).toEqual([
            {
              farm_id: farmId,
              role: 'producer',
              is_primary: true,
              source: 'backfill',
            },
          ]);
          const mirror = await seedRow<{ farm_id: string }>(
            qr,
            `SELECT farm_id FROM farmers WHERE id = $1`,
            [farmerId],
          );
          expect(mirror.farm_id).toBe(farmId);
        }

        // Índice único parcial `(farmer_id) WHERE is_primary`.
        await expectSqlError(
          qr,
          `INSERT INTO farmer_farms (farmer_farm_id, farmer_id, farm_id, role, is_primary, source)
           VALUES (gen_random_uuid(), $1, $2, 'producer', true, 'admin')`,
          [seed.farmerA, seed.farmB],
        );
        // `UNIQUE (farmer_id, farm_id)`.
        await expectSqlError(
          qr,
          `INSERT INTO farmer_farms (farmer_farm_id, farmer_id, farm_id, role, is_primary, source)
           VALUES (gen_random_uuid(), $1, $2, 'worker', false, 'admin')`,
          [seed.farmerA, seed.farmA],
        );
        // `CHECK` sobre el catálogo de roles (D-H3-3).
        await expectSqlError(
          qr,
          `INSERT INTO farmer_farms (farmer_farm_id, farmer_id, farm_id, role, is_primary, source)
           VALUES (gen_random_uuid(), $1, $2, 'jefe', false, 'admin')`,
          [seed.farmerA, seed.farmB],
        );
      });
    });
  });

  // ═════════════════════════════════════════════════════════════════════════
  // C2 — ninguna encuesta con productor de sesión queda sin farmer_id
  // ═════════════════════════════════════════════════════════════════════════

  describe('C2 — ninguna encuesta con campaign_session.farmer_id queda con farmer_id NULL', () => {
    it('Spec94BackfillAnchors.up copia el productor de la sesión a sus encuestas', async () => {
      // Símbolo esperado: clase `Spec94BackfillAnchors<timestamp>`.
      const m4 = loadMigration('Spec94BackfillAnchors');

      await withRollback(async (qr) => {
        const seed = await seedPreH3(qr, true);
        await m4.up(qr);

        const orphans = await qrq<{ survey_id: string }[]>(
          qr,
          `SELECT s.survey_id FROM surveys s
             JOIN campaign_sessions cs ON cs.session_id = s.campaign_session_id
            WHERE s.survey_id = ANY($1::uuid[])
              AND cs.farmer_id IS NOT NULL AND s.farmer_id IS NULL`,
          [seed.surveys],
        );
        expect(orphans).toEqual([]);

        for (const [surveyId, farmerId] of [
          [seed.s1a, seed.farmerA],
          [seed.s1b, seed.farmerA],
          [seed.s2, seed.farmerB],
        ]) {
          const row = await seedRow<{ farmer_id: string }>(
            qr,
            `SELECT farmer_id FROM surveys WHERE survey_id = $1`,
            [surveyId],
          );
          expect(row.farmer_id).toBe(farmerId);
        }
      });
    });

    it('paso f: la sesión sin productor toma el de sus encuestas', async () => {
      const m4 = loadMigration('Spec94BackfillAnchors');
      await withRollback(async (qr) => {
        const seed = await seedPreH3(qr, true);
        await m4.up(qr);
        const session = await seedRow<{ farmer_id: string | null }>(
          qr,
          `SELECT farmer_id FROM campaign_sessions WHERE session_id = $1`,
          [seed.sessionS5],
        );
        expect(session.farmer_id).toBe(seed.farmerB);
        // La sesión abandonada (sin encuestas) sigue sin productor.
        const abandoned = await seedRow<{ farmer_id: string | null }>(
          qr,
          `SELECT farmer_id FROM campaign_sessions WHERE session_id = $1`,
          [seed.sessionS6],
        );
        expect(abandoned.farmer_id).toBeNull();
      });
    });
  });

  // ═════════════════════════════════════════════════════════════════════════
  // C3 — farm_id y farm_crop_id coherentes
  // ═════════════════════════════════════════════════════════════════════════

  describe('C3 — toda encuesta con productor tiene farm_id; farm_crop_id es de su finca y crop_id se deriva', () => {
    it('backfill: farm_id = finca principal; farm_crop_id por prioridad sesión → respuestas → único de la finca → NULL', async () => {
      const m4 = loadMigration('Spec94BackfillAnchors');

      await withRollback(async (qr) => {
        const seed = await seedPreH3(qr, true);
        await m4.up(qr);

        const anchors = async (surveyId: string) =>
          seedRow<{
            farmer_id: string | null;
            farm_id: string | null;
            farm_crop_id: string | null;
            crop_id: string | null;
            fc_crop_id: string | null;
            fc_farm_id: string | null;
          }>(
            qr,
            `SELECT s.farmer_id, s.farm_id, s.farm_crop_id, s.crop_id,
                    fc.crop_id AS fc_crop_id, fc.farm_id AS fc_farm_id
               FROM surveys s
               LEFT JOIN farms_crops fc ON fc.farm_crop_id = s.farm_crop_id
              WHERE s.survey_id = $1`,
            [surveyId],
          );

        // Toda encuesta sembrada con productor quedó con finca.
        const withoutFarm = await qrq<{ survey_id: string }[]>(
          qr,
          `SELECT survey_id FROM surveys
            WHERE survey_id = ANY($1::uuid[]) AND farmer_id IS NOT NULL AND farm_id IS NULL`,
          [seed.surveys],
        );
        expect(withoutFarm).toEqual([]);

        // s1a: único cultivo de la sesión (Cacao), que es cultivo de la finca A.
        const s1a = await anchors(seed.s1a);
        expect(s1a.farm_id).toBe(seed.farmA);
        expect(s1a.fc_crop_id).toBe(cropId['Cacao']);
        // s2: sesión sin cultivos; la finca B tiene un único cultivo (Café).
        const s2 = await anchors(seed.s2);
        expect(s2.farm_id).toBe(seed.farmB);
        expect(s2.fc_crop_id).toBe(cropId['Café']);
        // s3: sin sesión; las respuestas resuelven un único cultivo (Café).
        const s3 = await anchors(seed.s3);
        expect(s3.farm_id).toBe(seed.farmA);
        expect(s3.fc_crop_id).toBe(cropId['Café']);
        // s4: finca con dos cultivos y nada que decida → NULL (ambiguo).
        const s4 = await anchors(seed.s4);
        expect(s4.farm_id).toBe(seed.farmA);
        expect(s4.farm_crop_id).toBeNull();

        for (const row of [s1a, s2, s3]) {
          expect(row.crop_id).toBe(row.fc_crop_id);
          expect(row.fc_farm_id).toBe(row.farm_id);
        }
      });
    });

    it('la base rechaza un farm_crop_id que pertenece a otra finca (FK compuesta)', async () => {
      await withRollback(async (qr) => {
        const seed = await seedPreH3(qr, true);
        const foreign = await seedRow<{ farm_crop_id: string }>(
          qr,
          `SELECT farm_crop_id FROM farms_crops WHERE farm_id = $1 LIMIT 1`,
          [seed.farmB],
        );
        await expectSqlError(
          qr,
          `UPDATE surveys SET farm_id = $1, farm_crop_id = $2 WHERE survey_id = $3`,
          [seed.farmA, foreign.farm_crop_id, seed.s4],
        );
      });
    });
  });

  // ═════════════════════════════════════════════════════════════════════════
  // C4 — conservación, idempotencia y down exacto
  // ═════════════════════════════════════════════════════════════════════════

  describe('C4 — el backfill no cambia respuestas, farms_crops ni constancias; es idempotente y su down restaura', () => {
    it('totales intactos, segunda ejecución sin cambios y down deja los valores originales', async () => {
      const m4 = loadMigration('Spec94BackfillAnchors');

      await withRollback(async (qr) => {
        const seed = await seedPreH3(qr, true);
        const totals = async () => ({
          responses: await seedRow<{ n: string }>(
            qr,
            `SELECT COUNT(*)::text AS n FROM responses WHERE survey_id = ANY($1::uuid[])`,
            [seed.surveys],
          ),
          farmsCrops: await seedRow<{ n: string }>(
            qr,
            `SELECT COUNT(*)::text AS n FROM farms_crops WHERE farm_id = ANY($1::uuid[])`,
            [[seed.farmA, seed.farmB]],
          ),
          consents: await seedRow<{ n: string }>(
            qr,
            `SELECT COUNT(*)::text AS n FROM consent_records
              WHERE consent_record_id = ANY($1::uuid[])`,
            [seed.consents],
          ),
        });

        const totalsBefore = await totals();
        const before = await seedState(qr, seed);

        await m4.up(qr);
        const afterFirst = await seedState(qr, seed);
        expect(await totals()).toEqual(totalsBefore);
        expect(afterFirst).not.toEqual(before);

        // Segunda ejecución: nada cambia (exige DDL de auditoría idempotente).
        await m4.up(qr);
        expect(await seedState(qr, seed)).toEqual(afterFirst);
        expect(await totals()).toEqual(totalsBefore);

        // `down` con `spec94_backfill_audit`: valores originales exactos.
        await m4.down(qr);
        expect(await seedState(qr, seed)).toEqual(before);
        expect(await totals()).toEqual(totalsBefore);
      });
    });
  });

  // ═════════════════════════════════════════════════════════════════════════
  // C5 — PATCH /farms/:id archiva en vez de borrar
  // ═════════════════════════════════════════════════════════════════════════

  describe('C5 — PATCH /farms/:id {cropIds} mantiene el contrato pero suma, archiva los quitados y reactiva los que vuelven', () => {
    it('PATCH archiva el cultivo quitado (sin borrar la fila) y lo reactiva al volver, con el mismo farm_crop_id', async () => {
      const seeded = await seedLinkedFarmer({
        tag: 'C5',
        farm: { crops: ['Café', 'Cacao'] },
      });
      const farmId = seeded.farmId!;
      const cacaoBefore = (await farmCrops(farmId)).find(
        (r) => r.crop_id === cropId['Cacao'],
      );
      expect(cacaoBefore?.archived_at).toBeNull();

      await auth(http().patch(`/api/farms/${farmId}`))
        .send({ cropIds: [cropId['Café']] })
        .expect(200);
      const archived = (await farmCrops(farmId)).find(
        (r) => r.crop_id === cropId['Cacao'],
      );
      expect(archived).toBeDefined();
      expect(archived!.archived_at).not.toBeNull();
      const farm = await auth(http().get(`/api/farms/${farmId}`)).expect(200);
      expect(
        ((farm.body as FarmBody).crops ?? []).map((c) => c.cropId),
      ).toEqual([cropId['Café']]);

      await auth(http().patch(`/api/farms/${farmId}`))
        .send({ cropIds: [cropId['Café'], cropId['Cacao']] })
        .expect(200);
      const reactivated = (await farmCrops(farmId)).find(
        (r) => r.crop_id === cropId['Cacao'],
      );
      expect(reactivated!.archived_at).toBeNull();
      expect(reactivated!.farm_crop_id).toBe(cacaoBefore!.farm_crop_id);
    });

    it('una encuesta anclada al cultivo que se archiva lo conserva (farm_crop_id y crop_id intactos)', async () => {
      const seeded = await seedLinkedFarmer({
        tag: 'C5b',
        farm: { crops: ['Café', 'Cacao'] },
      });
      const farmId = seeded.farmId!;
      const { sessionId } = await seedCampaignSession(seeded.farmerId);
      const surveyId = await createSurvey('nonReg', {
        campaignSessionId: sessionId,
        stepOrder: 1,
      });
      await batchOk('nonReg', surveyId, { mainCrop: 'Cacao' });
      // Spec 94: el batch no extrae; extract-crops ancla la encuesta.
      expect([200, 201]).toContain((await extractCrops(surveyId)).status);
      const anchored = await surveyAnchors(surveyId);
      expect(anchored.crop_id).toBe(cropId['Cacao']);
      expect(anchored.farm_crop_id).not.toBeNull();

      await auth(http().patch(`/api/farms/${farmId}`))
        .send({ cropIds: [cropId['Café']] })
        .expect(200);

      const after = await surveyAnchors(surveyId);
      expect(after.farm_crop_id).toBe(anchored.farm_crop_id);
      expect(after.crop_id).toBe(cropId['Cacao']);
    });
  });

  // ═════════════════════════════════════════════════════════════════════════
  // C6 — POST /farmers/:id/farms
  // ═════════════════════════════════════════════════════════════════════════

  describe('C6 — POST /farmers/:id/farms asocia un segundo productor; GET /farms/:id lista a ambos con su rol; repetir da 409', () => {
    it('vincula, lista con rol y rechaza el duplicado', async () => {
      const owner = await seedLinkedFarmer({
        tag: 'C6',
        farm: { crops: ['Café'] },
      });
      const created = await auth(http().post('/api/farmers')).send({
        name: 'Spec94 C6 Trabajador Segundo',
        documentId: newDoc(),
      });
      expect(created.status).toBe(201);
      const workerId = farmerIdOf(created.body as FarmerBody);

      await auth(http().post(`/api/farmers/${workerId}/farms`))
        .send({ farmId: owner.farmId, role: 'worker' })
        .expect(201);

      const farm = await auth(http().get(`/api/farms/${owner.farmId}`)).expect(
        200,
      );
      const farmers = (farm.body as FarmBody).farmers ?? [];
      expect(farmers.map((f) => f.farmerId).sort()).toEqual(
        [owner.farmerId, workerId].sort(),
      );
      expect(farmers.find((f) => f.farmerId === owner.farmerId)).toMatchObject({
        role: 'producer',
        isPrimary: true,
      });
      expect(farmers.find((f) => f.farmerId === workerId)?.role).toBe('worker');
      expect((farm.body as FarmBody).farmCrops?.map((c) => c.cropId)).toEqual([
        cropId['Café'],
      ]);

      await auth(http().post(`/api/farmers/${workerId}/farms`))
        .send({ farmId: owner.farmId, role: 'worker' })
        .expect(409);
    });
  });

  // ═════════════════════════════════════════════════════════════════════════
  // C7 — farm (principal) + farms[]
  // ═════════════════════════════════════════════════════════════════════════

  describe('C7 — GET /farmers/:id mantiene farm (principal, con crops) y agrega farms[]; igual search y extract-farmer', () => {
    it('detalle, búsqueda y extract-farmer exponen farm y farms[] con rol, principal y FarmCrop', async () => {
      const name = 'Spec94 C7 Ines Duarte Rey';
      const farmName = `Spec94 Finca C7 ${RUN}`;
      const seeded = await seedLinkedFarmer({
        tag: 'C7',
        name,
        farm: { name: farmName, crops: ['Café'] },
      });

      const expectShape = (farmer: FarmerBody) => {
        expect(farmer.farm?.farmId).toBe(seeded.farmId);
        expect((farmer.farm?.crops ?? []).map((c) => c.cropId)).toEqual([
          cropId['Café'],
        ]);
        expect(farmer.farms).toHaveLength(1);
        const primary = farmer.farms![0];
        expect(primary).toMatchObject({
          farmId: seeded.farmId,
          name: farmName,
          role: 'producer',
          isPrimary: true,
        });
        expect(primary.crops).toEqual([
          expect.objectContaining({
            farmCropId: expect.any(String) as unknown,
            cropId: cropId['Café'],
          }),
        ]);
      };

      const detail = await auth(
        http().get(`/api/farmers/${seeded.farmerId}`),
      ).expect(200);
      expectShape(detail.body as FarmerBody);

      const search = await auth(
        http().get('/api/farmers/search').query({ q: seeded.doc }),
      ).expect(200);
      const hit = (search.body as FarmerBody[]).find(
        (f) => farmerIdOf(f) === seeded.farmerId,
      );
      expect(hit).toBeDefined();
      expectShape(hit!);
      // `search` es público: `farms[]` no expone la vereda (decisión 2026-10-14).
      expect(hit!.farms).toBeDefined();
      for (const f of hit!.farms!) expect('vereda' in f).toBe(false);

      const surveyId = await createSurvey('reg');
      await batchOk('reg', surveyId, {
        name,
        document: seeded.doc,
        farmName,
      });
      const extracted = await extractFarmer(surveyId).expect(201);
      expectShape((extracted.body as ExtractFarmerBody).farmer);
    });
  });

  // ═════════════════════════════════════════════════════════════════════════
  // C8 — GET /surveys?farmerId= estable; ?farmId= filtra
  // ═════════════════════════════════════════════════════════════════════════

  describe('C8 — GET /surveys?farmerId= devuelve el mismo conjunto antes y después de anclar; ?farmId= y ?farmCropId= filtran', () => {
    async function listIds(query: Record<string, string>): Promise<string[]> {
      const res = await auth(http().get('/api/surveys').query(query)).expect(
        200,
      );
      return (res.body as { surveyId: string }[]).map((s) => s.surveyId).sort();
    }

    it('mismo conjunto por farmerId antes y después de anclar la sesión (camino legado + anclaje directo)', async () => {
      const name = 'Spec94 C8 Lucia Mora Paz';
      const farmName = `Spec94 Finca C8 ${RUN}`;
      const seeded = await seedLinkedFarmer({
        tag: 'C8',
        name,
        farm: { name: farmName, crops: ['Café'] },
      });
      const { sessionId } = await seedCampaignSession(seeded.farmerId);
      // Encuesta legada: en la sesión del productor, sin farmer_id.
      const legacy = await ds.query<{ survey_id: string }[]>(
        `INSERT INTO surveys (survey_id, user_id, campaign_session_id, sincronized)
         VALUES (gen_random_uuid(), $1, $2, true) RETURNING survey_id`,
        [adminUserId, sessionId],
      );
      surveyIds.push(legacy[0].survey_id);
      const registration = await createSurvey('reg', {
        campaignSessionId: sessionId,
        stepOrder: 1,
      });

      const before = await listIds({ farmerId: seeded.farmerId });
      expect(before).toEqual(
        expect.arrayContaining([legacy[0].survey_id, registration]),
      );

      await batchOk('reg', registration, {
        name,
        document: seeded.doc,
        farmName,
      });
      // Spec 94: el batch no extrae; el cliente llama a extract-farmer.
      await extractFarmer(registration).expect(201);

      expect(await listIds({ farmerId: seeded.farmerId })).toEqual(before);
      expect((await surveyAnchors(registration)).farm_id).toBe(seeded.farmId);
    });

    it('?farmId= y ?farmCropId= devuelven solo las encuestas ancladas a esa finca / ese cultivo de finca', async () => {
      // Dos productores con su finca; cada encuesta se ancla con los
      // endpoints de transición (extract-farmer + extract-crops).
      const anchoredSurvey = async (tag: string, crop: CropName) => {
        const name = `Spec94 ${tag} Productor Filtro`;
        const farmName = `Spec94 Finca ${tag} ${RUN}`;
        const seeded = await seedLinkedFarmer({
          tag,
          name,
          farm: { name: farmName, crops: ['Café', 'Cacao'] },
        });
        const { sessionId } = await seedCampaignSession(seeded.farmerId);
        const surveyId = await createSurvey('reg', {
          campaignSessionId: sessionId,
          stepOrder: 1,
        });
        await batchOk('reg', surveyId, {
          name,
          document: seeded.doc,
          farmName,
          mainCrop: crop,
        });
        await extractFarmer(surveyId).expect(201);
        expect([200, 201]).toContain((await extractCrops(surveyId)).status);
        return { ...seeded, surveyId };
      };
      const x = await anchoredSurvey('C8x', 'Café');
      const y = await anchoredSurvey('C8y', 'Cacao');

      expect(await listIds({ farmId: x.farmId! })).toEqual([x.surveyId]);
      expect(await listIds({ farmId: y.farmId! })).toEqual([y.surveyId]);

      const xAnchors = await surveyAnchors(x.surveyId);
      expect(xAnchors.farm_crop_id).not.toBeNull();
      expect(await listIds({ farmCropId: xAnchors.farm_crop_id! })).toEqual([
        x.surveyId,
      ]);
    });
  });

  // ═════════════════════════════════════════════════════════════════════════
  // C9 — dashboard sobre crop_id derivado y survey.farm_id
  // ═════════════════════════════════════════════════════════════════════════

  describe('C9 — el dashboard por cropId cuenta el crop_id derivado y countDistinctFarms cuenta fincas de las encuestas', () => {
    it('summary?cropId cuenta las 3 encuestas con Café; el KPI farmCount cuenta las 2 fincas de las encuestas, no la principal actual', async () => {
      const seeded = await seedLinkedFarmer({
        tag: 'C9',
        farm: { crops: ['Café'] },
      });
      const second = await ds.query<{ farm_id: string }[]>(
        `INSERT INTO farms (farm_id, name) VALUES (gen_random_uuid(), $1) RETURNING farm_id`,
        [`Spec94 Finca C9 Segunda ${RUN}`],
      );
      const secondFarmId = second[0].farm_id;
      await ds.query(
        `INSERT INTO farms_crops (farm_id, crop_id) VALUES ($1, $2)`,
        [secondFarmId, cropId['Café']],
      );
      const { campaignId, sessionId } = await seedCampaignSession(
        seeded.farmerId,
      );

      const anchorWithCafe = async (stepOrder: number) => {
        const s = await createSurvey('nonReg', {
          campaignSessionId: sessionId,
          stepOrder,
        });
        await batchOk('nonReg', s, { mainCrop: 'Café' });
        // Spec 94: el batch no extrae; extract-crops ancla farm_crop_id y
        // deriva crop_id.
        expect([200, 201]).toContain((await extractCrops(s)).status);
        return s;
      };

      // 1.ª encuesta: anclada a la finca principal original.
      const first = await anchorWithCafe(1);
      expect((await surveyAnchors(first)).farm_id).toBe(seeded.farmId);

      // Cambia la finca principal (y el espejo farmers.farm_id).
      await auth(http().post(`/api/farmers/${seeded.farmerId}/farms`))
        .send({ farmId: secondFarmId, role: 'producer', isPrimary: true })
        .expect(201);

      // 2.ª y 3.ª: ancladas a la nueva principal. Con el conteo antiguo
      // (DISTINCT farmers.farm_id) daría 1; sobre survey.farm_id, 2.
      const s2 = await anchorWithCafe(2);
      await anchorWithCafe(3);
      expect((await surveyAnchors(s2)).farm_id).toBe(secondFarmId);

      const summary = await http()
        .get('/api/dashboard/summary')
        .query({ campaignId, cropId: cropId['Café'] })
        .expect(200);
      expect((summary.body as { count: number }).count).toBe(3);

      const kpis = await http()
        .get('/api/dashboard/kpis')
        .query({ campaignId })
        .expect(200);
      const farmCount = (kpis.body as KpiBody[]).find(
        (k) => k.key === 'farmCount',
      );
      expect(farmCount?.value).toBe(2);
    });
  });

  // ═════════════════════════════════════════════════════════════════════════
  // C10 — constancias ancladas al productor
  // ═════════════════════════════════════════════════════════════════════════

  describe('C10 — toda constancia con sesión o encuesta con productor queda con farmer_id; las no anclables se listan y no se borran', () => {
    it('backfill de consent_records + informe de verify con la constancia huérfana', async () => {
      const m4 = loadMigration('Spec94BackfillAnchors');
      // Símbolo esperado: `verifySpec94(manager)` en src/database/spec94/verify.ts.
      const verify = loadVerify();

      await withRollback(async (qr) => {
        const seed = await seedPreH3(qr, true);
        await m4.up(qr);

        const consent = (id: string) =>
          seedRow<{
            farmer_id: string | null;
            survey_id: string | null;
          }>(
            qr,
            `SELECT farmer_id, survey_id FROM consent_records WHERE consent_record_id = $1`,
            [id],
          );

        // Solo sesión → productor de la sesión y primera encuesta de la sesión.
        expect(await consent(seed.consentBySession)).toEqual({
          farmer_id: seed.farmerA,
          survey_id: seed.s1a,
        });
        // Solo encuesta → productor de la encuesta.
        expect((await consent(seed.consentBySurvey)).farmer_id).toBe(
          seed.farmerA,
        );
        // Sesión abandonada → sigue sin productor, pero no se borra.
        const orphan = await qrq<{ farmer_id: string | null }[]>(
          qr,
          `SELECT farmer_id FROM consent_records WHERE consent_record_id = $1`,
          [seed.consentOrphan],
        );
        expect(orphan).toEqual([{ farmer_id: null }]);

        const report = await verify(qr.manager);
        expect(JSON.stringify(report)).toContain(seed.consentOrphan);
      });
    });
  });

  // ═════════════════════════════════════════════════════════════════════════
  // C11 — borrado en cascada N:M
  // ═════════════════════════════════════════════════════════════════════════

  describe('C11 — el borrado en cascada conserva la finca compartida por farmer_farms, borra los vínculos del productor y no choca con los RESTRICT', () => {
    /** Encuesta de registro del productor, anclada con extract-farmer (spec 94). */
    async function anchoredRegistration(
      name: string,
      doc: string,
      farmName: string,
    ): Promise<string> {
      const surveyId = await createSurvey('reg');
      await batchOk('reg', surveyId, { name, document: doc, farmName });
      await extractFarmer(surveyId).expect(201);
      return surveyId;
    }

    it('finca compartida por farmer_farms: sobrevive con el vínculo del otro productor y su encuesta anclada', async () => {
      const farmName = `Spec94 Finca C11 ${RUN}`;
      const a = await seedLinkedFarmer({
        tag: 'C11a',
        name: 'Spec94 C11 Productor A',
        farm: { name: farmName, crops: ['Café'] },
      });
      const b = await seedLinkedFarmer({
        tag: 'C11b',
        name: 'Spec94 C11 Productor B',
        farm: null,
      });
      await auth(http().post(`/api/farmers/${b.farmerId}/farms`))
        .send({ farmId: a.farmId, role: 'worker', isPrimary: true })
        .expect(201);

      const surveyA = await anchoredRegistration(
        'Spec94 C11 Productor A',
        a.doc,
        farmName,
      );
      const surveyB = await anchoredRegistration(
        'Spec94 C11 Productor B',
        b.doc,
        farmName,
      );
      expect((await surveyAnchors(surveyA)).farm_id).toBe(a.farmId);
      expect((await surveyAnchors(surveyB)).farm_id).toBe(a.farmId);

      const preview = await auth(
        http().get(`/api/farmers/${a.farmerId}/deletion-preview`),
      ).expect(200);
      const previewBody = preview.body as DeletionPreviewBody;
      expect(previewBody.farm?.farmId).toBe(a.farmId);
      expect(previewBody.farms).toEqual([
        expect.objectContaining({
          farmId: a.farmId,
          shared: true,
          willBeDeleted: false,
        }),
      ]);

      await auth(http().delete(`/api/farmers/${a.farmerId}/cascade`)).expect(
        200,
      );

      expect(
        await count(
          `SELECT COUNT(*)::text AS n FROM farms WHERE farm_id = $1`,
          [a.farmId],
        ),
      ).toBe(1);
      expect(await farmerLinks(a.farmerId)).toHaveLength(0);
      expect(await farmerLinks(b.farmerId)).toHaveLength(1);
      expect(
        await count(
          `SELECT COUNT(*)::text AS n FROM surveys WHERE survey_id = $1`,
          [surveyA],
        ),
      ).toBe(0);
      expect((await surveyAnchors(surveyB)).farm_id).toBe(a.farmId);
    });

    it('finca exclusiva con encuestas ancladas: se borra después de las encuestas, sin chocar con los RESTRICT', async () => {
      const farmName = `Spec94 Finca C11c ${RUN}`;
      const c = await seedLinkedFarmer({
        tag: 'C11c',
        name: 'Spec94 C11 Productor C',
        farm: { name: farmName, crops: ['Cacao'] },
      });
      const surveyC = await anchoredRegistration(
        'Spec94 C11 Productor C',
        c.doc,
        farmName,
      );
      expect((await surveyAnchors(surveyC)).farm_id).toBe(c.farmId);

      await auth(http().delete(`/api/farmers/${c.farmerId}/cascade`)).expect(
        200,
      );
      expect(
        await count(
          `SELECT COUNT(*)::text AS n FROM farms WHERE farm_id = $1`,
          [c.farmId],
        ),
      ).toBe(0);
      expect(
        await count(
          `SELECT COUNT(*)::text AS n FROM farms_crops WHERE farm_id = $1`,
          [c.farmId],
        ),
      ).toBe(0);
    });

    it('finca sin otro vínculo pero con encuestas de otro productor: se conserva', async () => {
      const d = await seedLinkedFarmer({
        tag: 'C11d',
        farm: { crops: ['Cacao'] },
      });
      const e = await seedLinkedFarmer({ tag: 'C11e', farm: null });
      // Precondición por SQL: encuesta de E anclada a la finca de D (caso de
      // datos históricos; los endpoints de transición anclan a la principal).
      const rows = await ds.query<{ survey_id: string }[]>(
        `INSERT INTO surveys (survey_id, user_id, farmer_id, farm_id, sincronized)
         VALUES (gen_random_uuid(), $1, $2, $3, true) RETURNING survey_id`,
        [adminUserId, e.farmerId, d.farmId],
      );
      surveyIds.push(rows[0].survey_id);

      const res = await auth(
        http().delete(`/api/farmers/${d.farmerId}/cascade`),
      );
      expect(res.status).toBe(200);
      expect(
        await count(
          `SELECT COUNT(*)::text AS n FROM farms WHERE farm_id = $1`,
          [d.farmId],
        ),
      ).toBe(1);
      expect((await surveyAnchors(rows[0].survey_id)).farm_id).toBe(d.farmId);
    });
  });

  // ═════════════════════════════════════════════════════════════════════════
  // C12 — instruments:snapshot con las tablas nuevas
  // ═════════════════════════════════════════════════════════════════════════

  describe('C12 — instruments:snapshot sigue funcionando contra desarrollo con las tablas nuevas', () => {
    it('la guarda de dependientes de snapshot() acepta el esquema del 94 (farmer_farms preservada, FK de anclaje en surveys)', async () => {
      // Ejecutar `snapshot()` vaciaría la base de desarrollo: se prueba su
      // guarda previa. Símbolo esperado: `assertNoUnknownDependents(ds)`
      // EXPORTADO desde src/database/instrument-sync/snapshot.ts (hoy es
      // privado), con `farmer_farms` en PRESERVED_TABLES.
      const fks = await ds.query<
        { column_name: string; foreign_table: string }[]
      >(
        `SELECT kcu.column_name, ccu.table_name AS foreign_table
           FROM information_schema.table_constraints tc
           JOIN information_schema.key_column_usage kcu
             ON kcu.constraint_name = tc.constraint_name
           JOIN information_schema.constraint_column_usage ccu
             ON ccu.constraint_name = tc.constraint_name
          WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_name = 'surveys'
            AND kcu.column_name IN ('farm_id', 'farm_crop_id')`,
      );
      expect(fks).toEqual(
        expect.arrayContaining([
          { column_name: 'farm_id', foreign_table: 'farms' },
          { column_name: 'farm_crop_id', foreign_table: 'farms_crops' },
        ]),
      );
      expect(
        await count(
          `SELECT COUNT(*)::text AS n FROM information_schema.tables
            WHERE table_name = 'farmer_farms'`,
        ),
      ).toBe(1);

      const mod = loadModule(
        path.join('database', 'instrument-sync', 'snapshot'),
      );
      expect(typeof mod.assertNoUnknownDependents).toBe('function');
      const check = mod.assertNoUnknownDependents as AssertNoUnknownDependents;
      await expect(check(ds)).resolves.toBeUndefined();
    });
  });

  // ═════════════════════════════════════════════════════════════════════════
  // C13 — transición: extract-farmer / extract-crops sobre el modelo nuevo
  // ═════════════════════════════════════════════════════════════════════════

  describe('C13 — extract-farmer y extract-crops, llamados como hoy, crean el vínculo principal, anclan la encuesta y nunca quitan cultivos', () => {
    // En el spec 94 el batch NO extrae: el cliente (web y móvil) sigue
    // llamando a los endpoints actuales. Este caso fija que esos endpoints
    // ya escriben el modelo nuevo.
    it('registro en sesión: farmer_farms principal + espejo, encuesta anclada y crop_id derivado de farm_crop_id', async () => {
      const doc = newDoc();
      const farmName = `Spec94 Finca C13 ${RUN}`;
      const { sessionId } = await seedCampaignSession(null);
      const registration = await createSurvey('reg', {
        campaignSessionId: sessionId,
        stepOrder: 1,
      });
      await batchOk('reg', registration, {
        name: 'Spec94 C13 Rosa Mejia Tobon',
        document: doc,
        farmName,
        vereda: 'Vereda C13',
        mainCrop: 'Café',
      });

      const extracted = await extractFarmer(registration).expect(201);
      const farmerId = farmerIdOf((extracted.body as ExtractFarmerBody).farmer);
      const crops = await extractCrops(registration);
      expect([200, 201]).toContain(crops.status);

      const links = await farmerLinks(farmerId);
      expect(links).toHaveLength(1);
      expect(links[0]).toMatchObject({
        role: 'producer',
        is_primary: true,
        source: 'extraction',
      });
      const mirror = await ds.query<{ farm_id: string | null }[]>(
        `SELECT farm_id FROM farmers WHERE id = $1`,
        [farmerId],
      );
      expect(mirror[0].farm_id).toBe(links[0].farm_id);

      const anchors = await surveyAnchors(registration);
      expect(anchors.farmer_id).toBe(farmerId);
      expect(anchors.farm_id).toBe(links[0].farm_id);
      expect(anchors.farm_crop_id).not.toBeNull();
      expect(anchors.crop_id).toBe(cropId['Café']);
      const fc = await ds.query<{ farm_id: string; crop_id: string }[]>(
        `SELECT farm_id, crop_id FROM farms_crops WHERE farm_crop_id = $1`,
        [anchors.farm_crop_id],
      );
      expect(fc).toEqual([
        { farm_id: links[0].farm_id, crop_id: cropId['Café'] },
      ]);
    });

    it('extract-crops de encuestas posteriores suma cultivos y, con menos cultivos, no quita ninguno', async () => {
      const doc = newDoc();
      const { sessionId } = await seedCampaignSession(null);
      const registration = await createSurvey('reg', {
        campaignSessionId: sessionId,
        stepOrder: 1,
      });
      await batchOk('reg', registration, {
        name: 'Spec94 C13b Tomas Arango Gil',
        document: doc,
        farmName: `Spec94 Finca C13b ${RUN}`,
        mainCrop: 'Café',
      });
      const extracted = await extractFarmer(registration).expect(201);
      const farmerId = farmerIdOf((extracted.body as ExtractFarmerBody).farmer);
      expect([200, 201]).toContain((await extractCrops(registration)).status);
      const farmId = (await farmerLinks(farmerId))[0].farm_id;

      const second = await createSurvey('nonReg', {
        campaignSessionId: sessionId,
        stepOrder: 2,
      });
      await batchOk('nonReg', second, { mainCrop: 'Cacao' });
      expect([200, 201]).toContain((await extractCrops(second)).status);
      expect(await activeCropIds(farmId)).toEqual(
        sortedCropIds(['Café', 'Cacao']),
      );
      expect((await surveyAnchors(second)).crop_id).toBe(cropId['Cacao']);

      // Hoy extract-crops REEMPLAZA: Cacao desaparecería.
      const third = await createSurvey('nonReg', {
        campaignSessionId: sessionId,
        stepOrder: 3,
      });
      await batchOk('nonReg', third, { mainCrop: 'Café' });
      expect([200, 201]).toContain((await extractCrops(third)).status);
      expect(await activeCropIds(farmId)).toEqual(
        sortedCropIds(['Café', 'Cacao']),
      );
      expect(await farmerLinks(farmerId)).toHaveLength(1);
    });
  });
});
