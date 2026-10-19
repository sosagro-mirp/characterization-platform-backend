/**
 * Spec 95 — Extracción unificada (depende del spec 94, modelo de datos).
 * Spec 94 dividido el 2026-10-14: el 94 deja el modelo (farmer_farms,
 * FarmCrop, anclajes, backfill) y este archivo cubre la extracción que el
 * backend hace solo al recibir la encuesta.
 *
 * ESTAS PRUEBAS NACEN EN ROJO (enfoque test-first). Hoy no existe: la
 * extracción dentro de `POST /responses/batch` (con `SAVEPOINT`), el servicio
 * `FarmerExtractionService`, `GET /surveys/:id/extraction`, el estado
 * `extraction_status`, los alias `client_farmer_id` / `farmer_client_aliases`,
 * las discrepancias (`entity_field_discrepancies`, `GET /farmers/:id/
 * discrepancies`, `GET|PATCH /discrepancies`), `role` en `process-public` y el
 * reprocesado histórico (`extraction:replay`). Además dependen del esquema del
 * spec 94 (`farmer_farms`, `farms_crops.farm_crop_id` / `archived_at`,
 * `surveys.farm_id` / `farm_crop_id`).
 *
 * Criterios cubiertos: C1 a C15 (un `describe` por criterio, prefijo `Cnn`),
 * más C11b (snapshot), C13b (cascada de alias y discrepancias) y C14b
 * (migración `Spec95ExtractionColumns` → `backfilled`).
 *
 * Cómo fallan hoy: el batch responde 201 pero no extrae (productor ausente,
 * columnas/tablas inexistentes en SQL), los endpoints nuevos responden 404,
 * `POST /surveys` rechaza `clientFarmerId` / `farmId` con 400
 * (`forbidNonWhitelisted`) y el módulo del replay se carga con `require`
 * dinámico (`loadReplay`), así que la suite COMPILA y cada caso falla en
 * runtime nombrando el símbolo esperado.
 *
 * Todo se ejercita por HTTP (supertest sobre la app Nest completa, como los
 * e2e 068, 084 y 093) salvo el replay (C15), que se invoca como función. El
 * SQL directo solo monta precondiciones, lee el estado resultante y limpia.
 *
 * Datos: desarrollo (`sosagro-dev`) está vacío, así que la suite siembra sus
 * propios instrumentos (registro, no-registro y público, con `systemField`),
 * usuarios (admin, investigador, encuestador), campañas, sesiones y, si no
 * hay ninguno publicado, un documento de consentimiento. Identidades con
 * prefijo `Spec95` y documentos `95<RUN><nn>`. Todo se elimina en `afterAll`.
 *
 * ENTORNO: SOLO contra la base de desarrollo (`DATABASE_URL` activa del
 * `.env`, Neon `sosagro-dev`), NUNCA contra producción. Crea y elimina un
 * trigger temporal (`spec95_*`) en C11.
 */

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getOptionsToken } from '@nestjs/throttler';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource, QueryRunner } from 'typeorm';
import * as bcrypt from 'bcrypt';
import * as fs from 'fs';
import * as path from 'path';
import { AppModule } from '../src/app.module';

jest.setTimeout(180_000);

// ─── constantes ─────────────────────────────────────────────────────────────

const TEST_PASSWORD = 'E2eTest1234!';
const PREFIX = 'e2e-095';
/** Sello de la corrida: aísla documentos y nombres entre corridas. */
const RUN = Date.now().toString().slice(-6);

const CROP_NAMES = ['Café', 'Cacao'] as const;
type CropName = (typeof CROP_NAMES)[number];

type InstrumentKey = 'reg' | 'nonReg' | 'pub';

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
  pub: ['name', 'document', 'phone', 'farmName', 'vereda', 'mainCrop'],
};

// ─── contrato asumido (specs 94 y 95) ──────────────────────────
// La implementación debe respetar estos nombres o ajustar este archivo (con
// aprobación) si cambian.

type ExtractionStatus =
  | 'done'
  | 'collision'
  | 'no_identity'
  | 'pending_alias'
  | 'not_applicable'
  | 'awaiting_review'
  | 'error'
  | 'backfilled';

interface SurveyExtraction {
  status: ExtractionStatus | null;
  farmerId: string | null;
  farmerName?: string | null;
  existed?: boolean;
  clientFarmerId?: string | null;
  farm?: { farmId: string; name?: string } | null;
  farmCropId?: string | null;
  crops?: { cropId: string; name?: string }[];
  collision?: unknown;
  openDiscrepancies?: number | unknown[];
  extractedAt?: string | null;
}

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

interface CollisionConflictBody {
  documentId?: string;
  submittedName?: string;
  existingFarmer?: { farmerId?: string; id?: string; name?: string };
}

interface Discrepancy {
  discrepancyId: string;
  entityType: 'farmer' | 'farm' | 'farmer_farm';
  field: string;
  systemField?: string | null;
  currentValue: unknown;
  submittedValue: unknown;
  surveyId?: string | null;
  status: 'open' | 'applied' | 'dismissed';
}

interface ProcessPublicBody {
  farmer: { id: string; name: string };
  existed: boolean;
  farm?: { farmId: string } | null;
  farmCrops?: FarmCropRef[];
  role?: string;
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

/**
 * Contrato asumido del reprocesado histórico (`pnpm extraction:replay
 * --dry-run | --apply`, D-H3-5): una función exportada que el CLI envuelve.
 * `surveyIds` acota el reprocesado (imprescindible para no tocar el resto de
 * la base de desarrollo); el informe es serializable y menciona cada encuesta.
 */
type ExtractionReplay = (
  ds: DataSource,
  options: { mode: 'dry-run' | 'apply'; surveyIds?: string[] },
) => Promise<unknown>;

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
      `spec 95: no se pudo cargar src/${relativePath} — ${(err as Error).message}`,
    );
  }
}

/**
 * `src/database/spec95/replay.ts` — exporta `runExtractionReplay`.
 */
function loadReplay(): ExtractionReplay {
  const mod = loadModule(path.join('database', 'spec95', 'replay'));
  if (typeof mod.runExtractionReplay !== 'function') {
    throw new Error(
      'spec 95: src/database/spec95/replay.ts debe exportar `runExtractionReplay(ds, { mode, surveyIds })`',
    );
  }
  return mod.runExtractionReplay as ExtractionReplay;
}

/** Contrato mínimo de una migración TypeORM, cargada por su clase. */
interface MigrationLike {
  up(queryRunner: QueryRunner): Promise<void>;
  down(queryRunner: QueryRunner): Promise<void>;
}

/** Firma del chequeo de dependientes de `snapshot.ts` (C11b). */
type AssertNoUnknownDependents = (ds: DataSource) => Promise<void>;

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
      `spec 95: falta la migración src/migrations/<timestamp>-${prefix}.ts`,
    );
  }
  const mod = loadModule(path.join('migrations', file.replace(/\.ts$/, '')));
  const entry = Object.entries(mod).find(
    ([name, value]) => name.startsWith(prefix) && typeof value === 'function',
  );
  if (!entry) {
    throw new Error(
      `spec 95: ${file} no exporta una clase ${prefix}<timestamp>`,
    );
  }
  const Ctor = entry[1] as new () => MigrationLike;
  return new Ctor();
}

// ─── suite ──────────────────────────────────────────────────────────────────

describe('spec-094 — modelo de datos centrado en el productor (e2e)', () => {
  let app: INestApplication<App>;
  let ds: DataSource;

  let adminToken: string;
  let adminUserId: string;
  let researcherToken: string;
  let pollsterToken: string;

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
    return `95${RUN}${String(docSeq).padStart(2, '0')}`;
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
         VALUES (gen_random_uuid(), 'E2E', 'Spec95', $1, $2, $3, false)`,
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
      [`E2E 095 ${key} ${RUN}`],
    );
    instrumentId[key] = inst[0].instrument_id;
    const section = await ds.query<{ section_id: string }[]>(
      `INSERT INTO sections (section_id, name, "order", instrument_id)
       VALUES (gen_random_uuid(), 'E2E 095 Sección', 1, $1) RETURNING section_id`,
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
          `E2E 095 ${field}`,
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
    if (key === 'pub') {
      await ds.query(
        `UPDATE instruments SET is_public = true WHERE instrument_id = $1`,
        [instrumentId[key]],
      );
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
          farm.name ?? `Spec95 Finca ${fields.tag} ${RUN}`,
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
        fields.name ?? `Spec95 ${fields.tag} Productor`,
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
      [`E2E 095 Campaña ${RUN} ${campaignIds.length + 1}`],
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

  async function getExtraction(
    surveyId: string,
    token: string = adminToken,
  ): Promise<SurveyExtraction> {
    const res = await as(
      token,
      http().get(`/api/surveys/${surveyId}/extraction`),
    );
    expect(res.status).toBe(200);
    return res.body as SurveyExtraction;
  }

  async function surveyAnchors(surveyId: string) {
    const rows = await ds.query<
      {
        farmer_id: string | null;
        farm_id: string | null;
        farm_crop_id: string | null;
        crop_id: string | null;
        client_farmer_id: string | null;
        extraction_status: string | null;
        extraction_error: string | null;
      }[]
    >(
      `SELECT farmer_id, farm_id, farm_crop_id, crop_id, client_farmer_id,
              extraction_status, extraction_error
         FROM surveys WHERE survey_id = $1`,
      [surveyId],
    );
    return rows[0];
  }

  async function farmersByDocument(doc: string) {
    return ds.query<{ id: string; name: string; farm_id: string | null }[]>(
      `SELECT id, name, farm_id FROM farmers
        WHERE regexp_replace(document_id, '[.\\s-]', '', 'g') = $1
        ORDER BY created_at ASC`,
      [doc],
    );
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

  /** Acepta lista plana o página (`items` / `data`). */
  function asList<T>(body: unknown): T[] {
    if (Array.isArray(body)) return body as T[];
    const page = body as { items?: T[]; data?: T[] };
    return page.items ?? page.data ?? [];
  }

  async function discrepanciesOf(
    farmerId: string,
    status?: 'open' | 'applied' | 'dismissed',
    token: string = adminToken,
  ): Promise<Discrepancy[]> {
    const res = await as(
      token,
      http()
        .get(`/api/farmers/${farmerId}/discrepancies`)
        .query(status ? { status } : {}),
    );
    expect(res.status).toBe(200);
    return asList<Discrepancy>(res.body);
  }

  function isField(d: Discrepancy, systemField: string): boolean {
    const field = systemField.split('.')[1];
    return d.systemField === systemField || d.field === field;
  }

  /** Transacción propia que SIEMPRE se revierte (DDL incluido). */
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
         VALUES (gen_random_uuid(), $1, 'E2E 095 Consentimiento', 'Cuerpo de prueba',
            'Cláusula de datos', 'Cláusula multimedia', 'Cláusula de derechos',
            'SosAgro 4.C (prueba)', 'e2e-095@test.local', 'published', now())
         RETURNING consent_document_id`,
        [`e2e095-${RUN}`],
      );
      consentDocumentId = created[0].consent_document_id;
      createdConsentDocumentId = consentDocumentId;
    }

    await buildInstrument('reg');
    await buildInstrument('nonReg');
    await buildInstrument('pub');
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

    await safe(`DROP TRIGGER IF EXISTS spec95_block_farmer ON farmers`);
    await safe(`DROP FUNCTION IF EXISTS spec95_block_farmer()`);

    const farmerIds = (
      await ds.query<{ id: string }[]>(
        `SELECT id FROM farmers WHERE name ILIKE 'spec95%'`,
      )
    ).map((r) => r.id);
    const farmIds = (
      await ds.query<{ farm_id: string }[]>(
        `SELECT farm_id FROM farms WHERE name ILIKE 'spec95%'`,
      )
    ).map((r) => r.farm_id);

    await safe(
      `DELETE FROM entity_field_discrepancies
        WHERE survey_id = ANY($1::uuid[]) OR farmer_id = ANY($2::uuid[])
           OR farm_id = ANY($3::uuid[])`,
      [surveyIds, farmerIds, farmIds],
    );
    await safe(
      `DELETE FROM farmer_client_aliases
        WHERE farmer_id = ANY($1::uuid[]) OR survey_id = ANY($2::uuid[])
           OR client_farmer_id LIKE $3`,
      [farmerIds, surveyIds, `local_farmer_spec95_${RUN}%`],
    );
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
  // C1 — el batch de registro extrae solo
  // ═════════════════════════════════════════════════════════════════════════

  describe('C1 — el batch de una encuesta de registro crea productor, finca y cultivos sin llamar a extract-*', () => {
    it('GET /surveys/:id/extraction devuelve done con farmerId y la encuesta queda anclada', async () => {
      const doc = newDoc();
      const farmName = `Spec95 Finca C1 ${RUN}`;
      const surveyId = await createSurvey('reg');
      await batchOk('reg', surveyId, {
        name: 'Spec95 C1 Rosa Mejia Tobon',
        document: doc,
        phone: '3005550005',
        farmName,
        vereda: 'Vereda C5',
        mainCrop: 'Café',
      });

      const extraction = await getExtraction(surveyId);
      expect(extraction.status).toBe('done');
      const farmers = await farmersByDocument(doc);
      expect(farmers).toHaveLength(1);
      expect(extraction.farmerId).toBe(farmers[0].id);
      expect(extraction.farmerName).toBe('Spec95 C1 Rosa Mejia Tobon');

      const links = await farmerLinks(farmers[0].id);
      expect(links).toHaveLength(1);
      expect(links[0]).toMatchObject({ role: 'producer', is_primary: true });
      expect(farmers[0].farm_id).toBe(links[0].farm_id);
      expect(await activeCropIds(links[0].farm_id)).toEqual(
        sortedCropIds(['Café']),
      );

      const anchors = await surveyAnchors(surveyId);
      expect(anchors.farmer_id).toBe(farmers[0].id);
      expect(anchors.farm_id).toBe(links[0].farm_id);
      expect(anchors.farm_crop_id).not.toBeNull();
      expect(anchors.crop_id).toBe(cropId['Café']);
      expect(anchors.extraction_status).toBe('done');
    });

    it('un encuestador no ve la extracción de una encuesta ajena (404, como el spec 92)', async () => {
      const surveyId = await createSurvey('reg');
      await batchOk('reg', surveyId, {
        name: 'Spec95 C5b Ajena',
        document: newDoc(),
      });
      await as(
        pollsterToken,
        http().get(`/api/surveys/${surveyId}/extraction`),
      ).expect(404);
    });
  });

  // ═════════════════════════════════════════════════════════════════════════
  // C2 — instrumento que no es de registro completa la finca
  // ═════════════════════════════════════════════════════════════════════════

  describe('C2 — el batch de un instrumento no de registro, con farm.* y productor conocido, completa los vacíos de su finca', () => {
    it('llena farm.vereda vacío y no toca corregimiento ya poblado', async () => {
      const seeded = await seedLinkedFarmer({
        tag: 'C2',
        farm: { vereda: null, corregimiento: 'Corregimiento Original' },
      });
      const surveyId = await createSurvey('nonReg', {
        farmerId: seeded.farmerId,
      });
      await batchOk('nonReg', surveyId, {
        vereda: 'Vereda Nueva C2',
        corregimiento: 'Corregimiento Distinto',
        note: 'Sin identidad del productor',
      });

      const farm = await ds.query<
        { vereda: string | null; corregimiento: string | null }[]
      >(`SELECT vereda, corregimiento FROM farms WHERE farm_id = $1`, [
        seeded.farmId,
      ]);
      expect(farm[0].vereda).toBe('Vereda Nueva C2');
      expect(farm[0].corregimiento).toBe('Corregimiento Original');

      const anchors = await surveyAnchors(surveyId);
      expect(anchors.farmer_id).toBe(seeded.farmerId);
      expect(anchors.farm_id).toBe(seeded.farmId);
    });
  });

  // ═════════════════════════════════════════════════════════════════════════
  // C3 — solo completar vacíos; discrepancias
  // ═════════════════════════════════════════════════════════════════════════

  describe('C3 — con productor existente nunca se sobrescribe un valor no nulo; la diferencia es una discrepancia open', () => {
    it('conserva teléfono y vereda, registra las discrepancias y no las duplica al repetir', async () => {
      const farmName = `Spec95 Finca C3 ${RUN}`;
      const seeded = await seedLinkedFarmer({
        tag: 'C3',
        name: 'Spec95 C3 Ana Ruiz Mora',
        phone: '3001110007',
        farm: { name: farmName, vereda: 'Vereda Original C3' },
      });
      const surveyId = await createSurvey('reg');
      await batchOk('reg', surveyId, {
        name: 'Spec95 C3 Ana Ruiz Mora',
        document: seeded.doc,
        phone: '3009990007',
        farmName,
        vereda: 'Vereda Distinta C3',
      });

      const farmer = await ds.query<{ phone: string | null }[]>(
        `SELECT phone FROM farmers WHERE id = $1`,
        [seeded.farmerId],
      );
      expect(farmer[0].phone).toBe('3001110007');
      const farm = await ds.query<{ vereda: string | null }[]>(
        `SELECT vereda FROM farms WHERE farm_id = $1`,
        [seeded.farmId],
      );
      expect(farm[0].vereda).toBe('Vereda Original C3');

      const open = await discrepanciesOf(seeded.farmerId, 'open');
      const phone = open.filter((d) => isField(d, 'farmer.phone'));
      expect(phone).toHaveLength(1);
      expect(phone[0].status).toBe('open');
      expect(JSON.stringify(phone[0].submittedValue)).toContain('3009990007');
      expect(JSON.stringify(phone[0].currentValue)).toContain('3001110007');
      expect(open.filter((d) => isField(d, 'farm.vereda'))).toHaveLength(1);

      // Repetir la extracción (alias) no duplica.
      const again = await extractFarmer(surveyId);
      expect(again.status).toBe(201);
      const afterRepeat = await discrepanciesOf(seeded.farmerId, 'open');
      expect(afterRepeat).toHaveLength(open.length);
    });
  });

  // ═════════════════════════════════════════════════════════════════════════
  // C4 — cultivos aditivos desde cualquier encuesta, por el batch
  // ═════════════════════════════════════════════════════════════════════════

  describe('C4 — el batch suma cultivos a la finca desde cualquier encuesta y nunca quita ninguno', () => {
    it('una encuesta de sesión con menos cultivos no quita ninguno (solo el batch, sin extract-*)', async () => {
      const seeded = await seedLinkedFarmer({
        tag: 'C4a',
        farm: { crops: ['Café', 'Cacao'] },
      });
      const { sessionId } = await seedCampaignSession(seeded.farmerId);
      const surveyId = await createSurvey('nonReg', {
        campaignSessionId: sessionId,
        stepOrder: 1,
      });
      await batchOk('nonReg', surveyId, { mainCrop: 'Café' });
      // La extracción del batch dejó la encuesta anclada a Café…
      expect((await surveyAnchors(surveyId)).crop_id).toBe(cropId['Café']);

      expect(await activeCropIds(seeded.farmId!)).toEqual(
        sortedCropIds(['Café', 'Cacao']),
      );
    });

    it('una encuesta sin sesión de un productor conocido suma un cultivo nuevo a la finca', async () => {
      const seeded = await seedLinkedFarmer({
        tag: 'C4b',
        farm: { crops: ['Café'] },
      });
      const surveyId = await createSurvey('nonReg', {
        farmerId: seeded.farmerId,
      });
      await batchOk('nonReg', surveyId, { mainCrop: 'Cacao' });
      expect(await activeCropIds(seeded.farmId!)).toEqual(
        sortedCropIds(['Café', 'Cacao']),
      );
    });
  });

  // ═════════════════════════════════════════════════════════════════════════
  // C5 — colisión en el batch
  // ═════════════════════════════════════════════════════════════════════════

  describe('C5 — un batch con colisión de documento sin resolver responde 201, deja la colisión pendiente y no crea productor', () => {
    it('respuestas guardadas, extraction_status=collision y fila pendiente en farmer_document_collisions', async () => {
      const existing = await seedLinkedFarmer({
        tag: 'C5',
        name: 'Spec95 Pedro Gomez Lara',
      });
      const surveyId = await createSurvey('reg');
      const res = await batch('reg', surveyId, {
        name: 'Spec95 Lucia Fernandez Rios',
        document: existing.doc,
        farmName: `Spec95 Finca C5 ${RUN}`,
      });
      expect(res.status).toBe(201);

      expect(
        await count(
          `SELECT COUNT(*)::text AS n FROM responses WHERE survey_id = $1`,
          [surveyId],
        ),
      ).toBe(3);
      const anchors = await surveyAnchors(surveyId);
      expect(anchors.extraction_status).toBe('collision');
      expect(anchors.farmer_id).toBeNull();
      expect(await farmersByDocument(existing.doc)).toHaveLength(1);

      const collisions = await ds.query<
        { resolution: string | null; existing_farmer_id: string }[]
      >(
        `SELECT resolution, existing_farmer_id FROM farmer_document_collisions
          WHERE survey_id = $1`,
        [surveyId],
      );
      expect(collisions).toEqual([
        { resolution: null, existing_farmer_id: existing.farmerId },
      ]);
    });
  });

  // ═════════════════════════════════════════════════════════════════════════
  // C6 — extract-farmer sobre la colisión del batch
  // ═════════════════════════════════════════════════════════════════════════

  describe('C6 — extract-farmer sin resolution responde 409 (spec 68); con resolution 201; una tercera llamada 201 con el mismo productor', () => {
    it('409 → same_person 201 → reintento 201 idempotente', async () => {
      const existing = await seedLinkedFarmer({
        tag: 'C6',
        name: 'Spec95 Rafael Nieto Soto',
      });
      const surveyId = await createSurvey('reg');
      await batchOk('reg', surveyId, {
        name: 'Spec95 Gloria Beltran Cruz',
        document: existing.doc,
      });
      // Precondición del criterio: el batch dejó la colisión (C5).
      expect((await surveyAnchors(surveyId)).extraction_status).toBe(
        'collision',
      );

      const conflict = await extractFarmer(surveyId).expect(409);
      const body = conflict.body as CollisionConflictBody;
      expect(body.documentId).toBe(existing.doc);
      expect(body.submittedName).toBe('Spec95 Gloria Beltran Cruz');
      expect(body.existingFarmer?.farmerId ?? body.existingFarmer?.id).toBe(
        existing.farmerId,
      );

      const resolved = await extractFarmer(surveyId, {
        resolution: 'same_person',
      }).expect(201);
      const first = resolved.body as ExtractFarmerBody;
      expect(farmerIdOf(first.farmer)).toBe(existing.farmerId);

      const third = await extractFarmer(surveyId).expect(201);
      expect(farmerIdOf((third.body as ExtractFarmerBody).farmer)).toBe(
        existing.farmerId,
      );
      expect((await surveyAnchors(surveyId)).extraction_status).toBe('done');
    });
  });

  // ═════════════════════════════════════════════════════════════════════════
  // C7 — correctedDocumentId tras el 409
  // ═════════════════════════════════════════════════════════════════════════

  describe('C7 — extract-farmer con correctedDocumentId se aplica aunque haya habido un 409', () => {
    it('corrige el documento persistido y crea al productor con el documento nuevo', async () => {
      const existing = await seedLinkedFarmer({
        tag: 'C7',
        name: 'Spec95 Julio Paz Leon',
      });
      const surveyId = await createSurvey('reg');
      await batchOk('reg', surveyId, {
        name: 'Spec95 Marta Quiroga Vega',
        document: existing.doc,
      });
      expect((await surveyAnchors(surveyId)).extraction_status).toBe(
        'collision',
      );
      await extractFarmer(surveyId).expect(409);

      const corrected = newDoc();
      const res = await extractFarmer(surveyId, {
        correctedDocumentId: corrected,
      }).expect(201);
      const body = res.body as ExtractFarmerBody;
      expect(body.existed).toBe(false);
      expect(body.farmer.documentId).toBe(corrected);
      expect(await farmersByDocument(corrected)).toHaveLength(1);
      const anchors = await surveyAnchors(surveyId);
      expect(anchors.farmer_id).toBe(farmerIdOf(body.farmer));
      expect(anchors.extraction_status).toBe('done');
    });
  });

  // ═════════════════════════════════════════════════════════════════════════
  // C8 — extract-crops estable y sin doble finca
  // ═════════════════════════════════════════════════════════════════════════

  describe('C8 — extract-crops devuelve la misma lista siempre y nunca crea una segunda finca, también en concurrencia', () => {
    it('dos llamadas simultáneas + una tercera: misma lista, una sola finca vinculada', async () => {
      const seeded = await seedLinkedFarmer({ tag: 'C8', farm: null });
      const farmName = `Spec95 Finca C8 ${RUN}`;
      const { sessionId } = await seedCampaignSession(seeded.farmerId);
      const surveyId = await createSurvey('nonReg', {
        campaignSessionId: sessionId,
        stepOrder: 1,
      });
      await batchOk('nonReg', surveyId, { farmName, mainCrop: 'Cacao' });

      const [a, b] = await Promise.all([
        extractCrops(surveyId),
        extractCrops(surveyId),
      ]);
      for (const r of [a, b]) expect([200, 201]).toContain(r.status);
      const third = await extractCrops(surveyId);
      expect([200, 201]).toContain(third.status);

      const lists = [a, b, third].map((r) =>
        ((r.body as { crops: { cropId: string }[] }).crops ?? [])
          .map((c) => c.cropId)
          .sort(),
      );
      expect(lists[0]).toEqual(sortedCropIds(['Cacao']));
      expect(lists[1]).toEqual(lists[0]);
      expect(lists[2]).toEqual(lists[0]);

      expect(
        await count(`SELECT COUNT(*)::text AS n FROM farms WHERE name = $1`, [
          farmName,
        ]),
      ).toBe(1);
      expect(await farmerLinks(seeded.farmerId)).toHaveLength(1);
    });
  });

  // ═════════════════════════════════════════════════════════════════════════
  // C9 — dos batches concurrentes, mismo documento nuevo
  // ═════════════════════════════════════════════════════════════════════════

  describe('C9 — dos batches concurrentes de dos encuestas con el mismo documento nuevo crean un solo productor', () => {
    it('Promise.all de dos batches → un productor y ambas encuestas ancladas a él', async () => {
      const doc = newDoc();
      const answers: Answers = {
        name: 'Spec95 C9 Carmen Rojas Vega',
        document: doc,
        farmName: `Spec95 Finca C9 ${RUN}`,
        mainCrop: 'Café',
      };
      const s1 = await createSurvey('reg');
      const s2 = await createSurvey('reg');

      const [r1, r2] = await Promise.all([
        batch('reg', s1, answers),
        batch('reg', s2, answers),
      ]);
      expect(r1.status).toBe(201);
      expect(r2.status).toBe(201);

      const farmers = await farmersByDocument(doc);
      expect(farmers).toHaveLength(1);
      expect((await surveyAnchors(s1)).farmer_id).toBe(farmers[0].id);
      expect((await surveyAnchors(s2)).farmer_id).toBe(farmers[0].id);
      expect(await farmerLinks(farmers[0].id)).toHaveLength(1);
    });
  });

  // ═════════════════════════════════════════════════════════════════════════
  // C10 — clientFarmerId: pending_alias y anclaje al llegar el registro
  // ═════════════════════════════════════════════════════════════════════════

  describe('C10 — encuesta con clientFarmerId antes del registro queda pending_alias y se ancla al llegar el registro', () => {
    it('pending_alias → registro con el mismo clientFarmerId → anclada al productor real y alias registrado', async () => {
      const clientFarmerId = `local_farmer_spec95_${RUN}_c10`;
      const early = await createSurvey('nonReg', { clientFarmerId });
      await batchOk('nonReg', early, {
        vereda: 'Vereda C10',
        mainCrop: 'Café',
      });
      const pending = await surveyAnchors(early);
      expect(pending.client_farmer_id).toBe(clientFarmerId);
      expect(pending.farmer_id).toBeNull();
      expect(pending.extraction_status).toBe('pending_alias');

      const doc = newDoc();
      const registration = await createSurvey('reg', { clientFarmerId });
      await batchOk('reg', registration, {
        name: 'Spec95 C10 Tomas Arango Gil',
        document: doc,
        farmName: `Spec95 Finca C10 ${RUN}`,
        mainCrop: 'Café',
      });

      const farmers = await farmersByDocument(doc);
      expect(farmers).toHaveLength(1);
      const anchored = await surveyAnchors(early);
      expect(anchored.farmer_id).toBe(farmers[0].id);
      expect(anchored.extraction_status).not.toBe('pending_alias');

      const alias = await ds.query<{ farmer_id: string }[]>(
        `SELECT farmer_id FROM farmer_client_aliases WHERE client_farmer_id = $1`,
        [clientFarmerId],
      );
      expect(alias).toEqual([{ farmer_id: farmers[0].id }]);
    });
  });

  // ═════════════════════════════════════════════════════════════════════════
  // C11 — un error de extracción no tumba el batch
  // ═════════════════════════════════════════════════════════════════════════

  describe('C11 — un error inesperado de la extracción no hace fallar el batch', () => {
    afterEach(async () => {
      await ds.query(`DROP TRIGGER IF EXISTS spec95_block_farmer ON farmers`);
      await ds.query(`DROP FUNCTION IF EXISTS spec95_block_farmer()`);
    });

    it('respuestas guardadas, extraction_status=error y sin productor creado', async () => {
      const name = `Spec95 C11 Falla Forzada ${RUN}`;
      // Trigger acotado a ESTE nombre: el resto de suites no se ve afectado.
      await ds.query(`
        CREATE OR REPLACE FUNCTION spec95_block_farmer() RETURNS trigger AS $$
        BEGIN
          IF NEW.name = '${name}' THEN
            RAISE EXCEPTION 'spec95: fallo forzado en la extracción';
          END IF;
          RETURN NEW;
        END $$ LANGUAGE plpgsql`);
      await ds.query(`
        CREATE TRIGGER spec95_block_farmer BEFORE INSERT ON farmers
        FOR EACH ROW EXECUTE FUNCTION spec95_block_farmer()`);

      const doc = newDoc();
      const surveyId = await createSurvey('reg');
      const res = await batch('reg', surveyId, {
        name,
        document: doc,
        farmName: `Spec95 Finca C11 ${RUN}`,
        mainCrop: 'Café',
      });
      expect(res.status).toBe(201);

      expect(
        await count(
          `SELECT COUNT(*)::text AS n FROM responses WHERE survey_id = $1`,
          [surveyId],
        ),
      ).toBe(4);
      const anchors = await surveyAnchors(surveyId);
      expect(anchors.extraction_status).toBe('error');
      expect(anchors.extraction_error).not.toBeNull();
      expect(anchors.farmer_id).toBeNull();
      expect(await farmersByDocument(doc)).toHaveLength(0);
    });
  });

  // ═════════════════════════════════════════════════════════════════════════
  // C11b — instruments:snapshot con las tablas del spec 95
  // ═════════════════════════════════════════════════════════════════════════

  describe('C11b — instruments:snapshot acepta las tablas nuevas del spec 95 (alias y discrepancias)', () => {
    it('ambas tablas tienen FK a surveys y la guarda de dependientes de snapshot() las reconoce', async () => {
      // Ejecutar `snapshot()` vaciaría la base de desarrollo: se prueba su
      // guarda previa. Símbolo esperado: `assertNoUnknownDependents(ds)`
      // exportado desde src/database/instrument-sync/snapshot.ts, con
      // `entity_field_discrepancies` y `farmer_client_aliases` en
      // TABLES_TO_CLEAR (antes de `surveys`).
      const dependents = await ds.query<{ table_name: string }[]>(
        `SELECT DISTINCT tc.table_name
           FROM information_schema.table_constraints tc
           JOIN information_schema.constraint_column_usage ccu
             ON ccu.constraint_name = tc.constraint_name
          WHERE tc.constraint_type = 'FOREIGN KEY' AND ccu.table_name = 'surveys'`,
      );
      expect(dependents.map((r) => r.table_name)).toEqual(
        expect.arrayContaining([
          'entity_field_discrepancies',
          'farmer_client_aliases',
        ]),
      );

      const mod = loadModule(
        path.join('database', 'instrument-sync', 'snapshot'),
      );
      expect(typeof mod.assertNoUnknownDependents).toBe('function');
      const check = mod.assertNoUnknownDependents as AssertNoUnknownDependents;
      await expect(check(ds)).resolves.toBeUndefined();
    });
  });

  // ═════════════════════════════════════════════════════════════════════════
  // C12 — process-public sobre el servicio unificado
  // ═════════════════════════════════════════════════════════════════════════

  describe('C12 — process-public mantiene su resultado y, al vincular o crear finca, crea farmer_farms con el role indicado', () => {
    async function submitPublic(a: Answers): Promise<string> {
      const res = await http()
        .post('/api/public/surveys')
        .send({
          instrumentId: instrumentId.pub,
          consent: { acceptedDataProcessing: true },
          responses: buildResponses('pub', a),
        });
      expect(res.status).toBe(201);
      const { surveyId } = res.body as { surveyId: string };
      surveyIds.push(surveyId);
      return surveyId;
    }

    it('envío limpio: awaiting_review antes; después productor, finca principal producer y cultivos (regresión e2e-093)', async () => {
      const doc = newDoc();
      const farmName = `Spec95 Finca C12 ${RUN}`;
      const surveyId = await submitPublic({
        name: 'Spec95 C12 Hector Salas Pinto',
        document: doc,
        farmName,
        vereda: 'Vereda C12',
        mainCrop: 'Cacao',
      });
      expect((await getExtraction(surveyId)).status).toBe('awaiting_review');

      const res = await auth(
        http().post(`/api/surveys/${surveyId}/process-public`),
      ).send({});
      expect(res.status).toBe(201);
      const body = res.body as ProcessPublicBody;
      expect(body.existed).toBe(false);
      expect(body.role).toBe('producer');
      expect(body.farm?.farmId).toEqual(expect.any(String));
      expect((body.farmCrops ?? []).map((c) => c.cropId)).toEqual([
        cropId['Cacao'],
      ]);

      const farmers = await farmersByDocument(doc);
      expect(farmers).toHaveLength(1);
      expect(farmers[0].id).toBe(body.farmer.id);
      const links = await farmerLinks(body.farmer.id);
      expect(links).toHaveLength(1);
      expect(links[0]).toMatchObject({
        farm_id: body.farm!.farmId,
        role: 'producer',
        is_primary: true,
        source: 'public_process',
      });
      expect(await activeCropIds(body.farm!.farmId)).toEqual(
        sortedCropIds(['Cacao']),
      );
      const review = await ds.query<{ review_status: string }[]>(
        `SELECT review_status FROM surveys WHERE survey_id = $1`,
        [surveyId],
      );
      expect(review[0].review_status).toBe('processed');
      expect((await surveyAnchors(surveyId)).farm_id).toBe(body.farm!.farmId);
    });

    it("farm.mode='link' con role='owner' vincula a la finca existente con ese rol, sin crear otra", async () => {
      const shared = await seedLinkedFarmer({
        tag: 'C12b',
        farm: { name: `Spec95 Hacienda C12 ${RUN}`, crops: ['Café'] },
      });
      const doc = newDoc();
      const surveyId = await submitPublic({
        name: 'Spec95 C12 Socia Arboleda',
        document: doc,
        farmName: `Spec95 Hacienda C12 ${RUN}`,
        mainCrop: 'Café',
      });

      const res = await auth(
        http().post(`/api/surveys/${surveyId}/process-public`),
      ).send({ farm: { mode: 'link', farmId: shared.farmId }, role: 'owner' });
      expect(res.status).toBe(201);
      const body = res.body as ProcessPublicBody;
      expect(body.role).toBe('owner');

      const links = await farmerLinks(body.farmer.id);
      expect(links).toHaveLength(1);
      expect(links[0]).toMatchObject({
        farm_id: shared.farmId,
        role: 'owner',
        is_primary: true,
      });
      expect(
        await count(`SELECT COUNT(*)::text AS n FROM farms WHERE name = $1`, [
          `Spec95 Hacienda C12 ${RUN}`,
        ]),
      ).toBe(1);
    });

    it("crear finca con role='manager' deja el vínculo nuevo con ese rol y como principal", async () => {
      const surveyId = await submitPublic({
        name: 'Spec95 C12 Encargado Finca Nueva',
        document: newDoc(),
        farmName: `Spec95 Finca C12c ${RUN}`,
        mainCrop: 'Café',
      });
      const res = await auth(
        http().post(`/api/surveys/${surveyId}/process-public`),
      ).send({ farm: { mode: 'create' }, role: 'manager' });
      expect(res.status).toBe(201);
      const body = res.body as ProcessPublicBody;
      expect(body.role).toBe('manager');
      const links = await farmerLinks(body.farmer.id);
      expect(links).toHaveLength(1);
      expect(links[0]).toMatchObject({
        farm_id: body.farm!.farmId,
        role: 'manager',
        is_primary: true,
      });
    });
  });

  // ═════════════════════════════════════════════════════════════════════════
  // C13 — discrepancias: permisos, apply y dismiss
  // ═════════════════════════════════════════════════════════════════════════

  describe('C13 — solo ADMIN y RESEARCHER leen y resuelven discrepancias; apply sobrescribe y marca applied; dismiss no toca', () => {
    let farmerId: string;
    let farmId: string;
    let phoneDiscrepancy: Discrepancy;
    let veredaDiscrepancy: Discrepancy;

    beforeAll(async () => {
      const farmName = `Spec95 Finca C13 ${RUN}`;
      const seeded = await seedLinkedFarmer({
        tag: 'C13',
        name: 'Spec95 C13 Gloria Nieto Paz',
        phone: '3001110024',
        farm: { name: farmName, vereda: 'Vereda Vieja C13' },
      });
      farmerId = seeded.farmerId;
      farmId = seeded.farmId!;
      const surveyId = await createSurvey('reg');
      await batchOk('reg', surveyId, {
        name: 'Spec95 C13 Gloria Nieto Paz',
        document: seeded.doc,
        phone: '3009990024',
        farmName,
        vereda: 'Vereda Nueva C13',
      });
      const open = await discrepanciesOf(farmerId, 'open');
      phoneDiscrepancy = open.find((d) => isField(d, 'farmer.phone'))!;
      veredaDiscrepancy = open.find((d) => isField(d, 'farm.vereda'))!;
    });

    it('un encuestador recibe 403 en las tres rutas', async () => {
      expect(phoneDiscrepancy).toBeDefined();
      await as(
        pollsterToken,
        http().get(`/api/farmers/${farmerId}/discrepancies`),
      ).expect(403);
      await as(pollsterToken, http().get('/api/discrepancies')).expect(403);
      await as(
        pollsterToken,
        http().patch(`/api/discrepancies/${phoneDiscrepancy.discrepancyId}`),
      )
        .send({ action: 'dismiss' })
        .expect(403);
    });

    it('un investigador lista las discrepancias (por productor y globales, filtrables)', async () => {
      const mine = await discrepanciesOf(farmerId, 'open', researcherToken);
      expect(mine.map((d) => d.discrepancyId)).toEqual(
        expect.arrayContaining([
          phoneDiscrepancy.discrepancyId,
          veredaDiscrepancy.discrepancyId,
        ]),
      );
      const global = await as(
        researcherToken,
        http()
          .get('/api/discrepancies')
          .query({ status: 'open', entityType: 'farmer', page: '1' }),
      ).expect(200);
      const list = asList<Discrepancy>(global.body);
      expect(list.every((d) => d.entityType === 'farmer')).toBe(true);
    });

    it("PATCH {action:'apply'} sobrescribe el teléfono y marca applied", async () => {
      const res = await as(
        researcherToken,
        http().patch(`/api/discrepancies/${phoneDiscrepancy.discrepancyId}`),
      ).send({ action: 'apply' });
      expect(res.status).toBe(200);
      const farmer = await ds.query<{ phone: string | null }[]>(
        `SELECT phone FROM farmers WHERE id = $1`,
        [farmerId],
      );
      expect(farmer[0].phone).toBe('3009990024');
      const row = await ds.query<
        { status: string; resolved_at: Date | null }[]
      >(
        `SELECT status, resolved_at FROM entity_field_discrepancies WHERE discrepancy_id = $1`,
        [phoneDiscrepancy.discrepancyId],
      );
      expect(row[0].status).toBe('applied');
      expect(row[0].resolved_at).not.toBeNull();
    });

    it("PATCH {action:'dismiss'} no toca la finca y marca dismissed", async () => {
      const res = await auth(
        http().patch(`/api/discrepancies/${veredaDiscrepancy.discrepancyId}`),
      ).send({ action: 'dismiss' });
      expect(res.status).toBe(200);
      const farm = await ds.query<{ vereda: string | null }[]>(
        `SELECT vereda FROM farms WHERE farm_id = $1`,
        [farmId],
      );
      expect(farm[0].vereda).toBe('Vereda Vieja C13');
      const row = await ds.query<{ status: string }[]>(
        `SELECT status FROM entity_field_discrepancies WHERE discrepancy_id = $1`,
        [veredaDiscrepancy.discrepancyId],
      );
      expect(row[0].status).toBe('dismissed');
    });
  });
  // ═════════════════════════════════════════════════════════════════════════
  // C13b — la cascada borra alias y discrepancias
  // ═════════════════════════════════════════════════════════════════════════

  describe('C13b — el borrado en cascada de un productor borra sus alias y sus discrepancias', () => {
    it('DELETE /farmers/:id/cascade deja 0 alias y 0 discrepancias del productor', async () => {
      const name = 'Spec95 C13b Ana Ruiz Mora';
      const doc = newDoc();
      const farmName = `Spec95 Finca C13b ${RUN}`;
      const clientFarmerId = `local_farmer_spec95_${RUN}_c13b`;

      // Registro con identidad provisional → productor nuevo + alias.
      const registration = await createSurvey('reg', { clientFarmerId });
      await batchOk('reg', registration, {
        name,
        document: doc,
        phone: '3001110013',
        farmName,
        vereda: 'Vereda Original C13b',
      });
      const farmers = await farmersByDocument(doc);
      expect(farmers).toHaveLength(1);
      const farmerId = farmers[0].id;

      // Segundo registro con datos distintos → discrepancias.
      const second = await createSurvey('reg');
      await batchOk('reg', second, {
        name,
        document: doc,
        phone: '3009990013',
        farmName,
        vereda: 'Vereda Distinta C13b',
      });

      const aliases = () =>
        count(
          `SELECT COUNT(*)::text AS n FROM farmer_client_aliases WHERE farmer_id = $1`,
          [farmerId],
        );
      const discrepancies = () =>
        count(
          `SELECT COUNT(*)::text AS n FROM entity_field_discrepancies
            WHERE farmer_id = $1 OR farm_id = $2`,
          [farmerId, farmers[0].farm_id],
        );
      expect(await aliases()).toBe(1);
      expect(await discrepancies()).toBeGreaterThan(0);

      await auth(http().delete(`/api/farmers/${farmerId}/cascade`)).expect(200);
      expect(await aliases()).toBe(0);
      expect(await discrepancies()).toBe(0);
      expect(
        await count(
          `SELECT COUNT(*)::text AS n FROM farmer_client_aliases WHERE client_farmer_id = $1`,
          [clientFarmerId],
        ),
      ).toBe(0);
    });
  });

  // ═════════════════════════════════════════════════════════════════════════
  // C14 — contrato de GET /surveys/:id/extraction
  // ═════════════════════════════════════════════════════════════════════════

  describe('C14 — GET /surveys/:id/extraction expone el contrato completo y un encuestador solo ve las suyas', () => {
    it('tras un registro: todas las claves del contrato con sus valores', async () => {
      const doc = newDoc();
      const name = 'Spec95 C14 Carmen Rojas Vega';
      const farmName = `Spec95 Finca C14 ${RUN}`;
      const clientFarmerId = `local_farmer_spec95_${RUN}_c14`;
      const surveyId = await createSurvey('reg', { clientFarmerId });
      await batchOk('reg', surveyId, {
        name,
        document: doc,
        farmName,
        mainCrop: 'Cacao',
      });

      const e = await getExtraction(surveyId);
      for (const key of [
        'status',
        'farmerId',
        'farmerName',
        'existed',
        'clientFarmerId',
        'farm',
        'farmCropId',
        'crops',
        'openDiscrepancies',
        'extractedAt',
      ]) {
        expect(e).toHaveProperty(key);
      }
      const farmers = await farmersByDocument(doc);
      expect(e).toMatchObject({
        status: 'done',
        farmerId: farmers[0].id,
        farmerName: name,
        existed: false,
        clientFarmerId,
      });
      expect(e.farm).toMatchObject({
        farmId: farmers[0].farm_id,
        name: farmName,
      });
      expect(e.farmCropId).toEqual(expect.any(String));
      expect((e.crops ?? []).map((c) => c.cropId)).toEqual([cropId['Cacao']]);
      expect(e.extractedAt).not.toBeNull();
    });

    it('con colisión pendiente: status collision y el detalle en collision', async () => {
      const existing = await seedLinkedFarmer({
        tag: 'C14b',
        name: 'Spec95 Pedro Gomez Lara',
      });
      const surveyId = await createSurvey('reg');
      await batchOk('reg', surveyId, {
        name: 'Spec95 Lucia Fernandez Rios',
        document: existing.doc,
      });
      const e = await getExtraction(surveyId);
      expect(e.status).toBe('collision');
      expect(e.farmerId).toBeNull();
      expect(e.collision).toMatchObject({
        documentId: existing.doc,
        submittedName: 'Spec95 Lucia Fernandez Rios',
      });
      expect(JSON.stringify(e.collision)).toContain(existing.farmerId);
    });

    it('un encuestador ve la suya (200) y recibe 404 en la de otro usuario', async () => {
      const own = await as(pollsterToken, http().post('/api/surveys')).send({
        instrumentIds: [instrumentId.reg],
        sincronized: true,
      });
      expect(own.status).toBe(201);
      const ownId = (own.body as { surveyId: string }).surveyId;
      surveyIds.push(ownId);
      await as(pollsterToken, http().post('/api/responses/batch'))
        .send(
          buildResponses('reg', {
            name: 'Spec95 C14 Propia Encuestador',
            document: newDoc(),
          }).map((r) => ({ surveyId: ownId, ...r })),
        )
        .expect(201);
      expect((await getExtraction(ownId, pollsterToken)).status).toBe('done');

      const foreign = await createSurvey('reg');
      await batchOk('reg', foreign, {
        name: 'Spec95 C14 Ajena Admin',
        document: newDoc(),
      });
      await as(
        pollsterToken,
        http().get(`/api/surveys/${foreign}/extraction`),
      ).expect(404);
    });
  });

  // ═════════════════════════════════════════════════════════════════════════
  // C14b — la migración del 95 marca backfilled
  // ═════════════════════════════════════════════════════════════════════════

  describe('C14b — tras la migración Spec95ExtractionColumns, las encuestas con productor quedan backfilled', () => {
    it('up marca backfilled las que tienen productor y deja NULL las que no', async () => {
      // Símbolo esperado: clase `Spec95ExtractionColumns<timestamp>` en
      // src/migrations/<timestamp>-Spec95ExtractionColumns.ts. Corre dentro de
      // una transacción que SIEMPRE se revierte (DDL incluido).
      const m1 = loadMigration('Spec95ExtractionColumns');

      const seeded = await seedLinkedFarmer({
        tag: 'C14b',
        farm: { crops: ['Café'] },
      });

      await withRollback(async (qr) => {
        // Estado previo al 95: sin las columnas de extracción.
        await m1.down(qr);
        const insertSurvey = async (farmerId: string | null) => {
          const rows = (await qr.query(
            `INSERT INTO surveys (survey_id, user_id, farmer_id, sincronized)
             VALUES (gen_random_uuid(), $1, $2, true) RETURNING survey_id`,
            [adminUserId, farmerId],
          )) as { survey_id: string }[];
          return rows[0].survey_id;
        };
        const withFarmer = await insertSurvey(seeded.farmerId);
        const withoutFarmer = await insertSurvey(null);

        await m1.up(qr);

        const status = async (surveyId: string) =>
          (
            (await qr.query(
              `SELECT extraction_status FROM surveys WHERE survey_id = $1`,
              [surveyId],
            )) as { extraction_status: string | null }[]
          )[0].extraction_status;
        expect(await status(withFarmer)).toBe('backfilled');
        expect(await status(withoutFarmer)).toBeNull();
      });
    });
  });

  // ═════════════════════════════════════════════════════════════════════════
  // C15 — extraction:replay
  // ═════════════════════════════════════════════════════════════════════════

  describe('C15 — extraction:replay --dry-run no escribe nada; --apply completa vacíos, registra discrepancias y es idempotente', () => {
    /**
     * Encuesta "histórica": respuestas insertadas por SQL (sin pasar por el
     * batch, como las de antes del spec 95), productor anclado y finca con
     * vereda vacía. Nadie la extrajo: extraction_status NULL.
     */
    async function seedHistorical(tag: string) {
      const seeded = await seedLinkedFarmer({
        tag,
        farm: {
          vereda: null,
          corregimiento: 'Corregimiento Original',
          crops: ['Café'],
        },
      });
      const rows = await ds.query<{ survey_id: string }[]>(
        `INSERT INTO surveys (survey_id, user_id, farmer_id, sincronized)
         VALUES (gen_random_uuid(), $1, $2, true) RETURNING survey_id`,
        [adminUserId, seeded.farmerId],
      );
      const surveyId = rows[0].survey_id;
      surveyIds.push(surveyId);
      await ds.query(
        `INSERT INTO surveys_instruments (survey_id, instrument_id) VALUES ($1, $2)`,
        [surveyId, instrumentId.nonReg],
      );
      await ds.query(
        `INSERT INTO responses (response_id, survey_id, question_id, text_value)
         VALUES (gen_random_uuid(), $1, $2, $3)`,
        [surveyId, q.nonReg.vereda, `Vereda Replay ${tag}`],
      );
      await ds.query(
        `INSERT INTO responses (response_id, survey_id, question_id, text_value)
         VALUES (gen_random_uuid(), $1, $2, 'Corregimiento Replay')`,
        [surveyId, q.nonReg.corregimiento],
      );
      await ds.query(
        `INSERT INTO responses (response_id, survey_id, question_id, option_id)
         VALUES (gen_random_uuid(), $1, $2, $3)`,
        [surveyId, q.nonReg.mainCrop, cropOpt.nonReg['Cacao']],
      );
      return { ...seeded, surveyId };
    }

    async function state(s: {
      surveyId: string;
      farmId: string | null;
      farmerId: string;
    }) {
      return {
        survey: await surveyAnchors(s.surveyId),
        farm: await ds.query<unknown[]>(
          `SELECT vereda, corregimiento FROM farms WHERE farm_id = $1`,
          [s.farmId],
        ),
        crops: await farmCrops(s.farmId!),
        discrepancies: await count(
          `SELECT COUNT(*)::text AS n FROM entity_field_discrepancies WHERE survey_id = $1`,
          [s.surveyId],
        ),
        links: await farmerLinks(s.farmerId),
      };
    }

    it('--dry-run informa la encuesta pero no cambia nada', async () => {
      const replay = loadReplay();
      const s = await seedHistorical('C15a');
      const before = await state(s);

      const report = await replay(ds, {
        mode: 'dry-run',
        surveyIds: [s.surveyId],
      });
      expect(JSON.stringify(report)).toContain(s.surveyId);
      expect(await state(s)).toEqual(before);
    });

    it('--apply completa la vereda vacía, registra la discrepancia, suma el cultivo y ancla; una segunda aplicación no cambia nada', async () => {
      const replay = loadReplay();
      const s = await seedHistorical('C15b');

      await replay(ds, { mode: 'apply', surveyIds: [s.surveyId] });
      const afterFirst = await state(s);
      const farm = afterFirst.farm as {
        vereda: string | null;
        corregimiento: string | null;
      }[];
      expect(farm[0].vereda).toBe('Vereda Replay C15b');
      // Solo completar vacíos: el corregimiento poblado no se pisa y la
      // diferencia queda como discrepancia.
      expect(farm[0].corregimiento).toBe('Corregimiento Original');
      expect(afterFirst.discrepancies).toBe(1);
      expect(await activeCropIds(s.farmId!)).toEqual(
        sortedCropIds(['Café', 'Cacao']),
      );
      expect(afterFirst.survey.farm_id).toBe(s.farmId);
      expect(afterFirst.survey.extraction_status).toBe('done');

      await replay(ds, { mode: 'apply', surveyIds: [s.surveyId] });
      const afterSecond = await state(s);
      expect(afterSecond.farm).toEqual(afterFirst.farm);
      expect(afterSecond.crops).toEqual(afterFirst.crops);
      expect(afterSecond.discrepancies).toBe(afterFirst.discrepancies);
      expect(afterSecond.links).toEqual(afterFirst.links);
      expect(afterSecond.survey.farm_crop_id).toBe(
        afterFirst.survey.farm_crop_id,
      );
    });
  });
});
