/**
 * Spec 93 — Incorporación de los envíos del taller como productores.
 * `spec/93_incorporacion_envios_taller_productores.md` (raíz del ecosistema).
 *
 * ESTAS PRUEBAS NACEN EN ROJO (enfoque test-first). Compilan hoy, pero fallan
 * en ejecución porque el comportamiento todavía no existe: `metadataId` no es
 * escribible en los DTOs de opciones, `GET /api/surveys/:id/process-preview`
 * no existe, `process-public` no acepta `farm` ni `townId`, los cultivos no
 * llegan a la finca sin sesión, el procesado no es atómico, la búsqueda por
 * documento no normaliza, el área no se convierte, etc. Las fases 1 y 2 del
 * spec las ponen en verde. Algunos casos (C03 y la regresión de
 * `extract-crops` con sesión, parte de C17) protegen comportamiento que ya
 * existe y pueden pasar desde el principio: son guardas de regresión.
 *
 * Criterios cubiertos: 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13 y 17 (un
 * `describe` por criterio, prefijo `Cnn`). El 14 (bandeja) lo cubren el
 * Vitest del frontend y `test-093`; el 15 (CLI), las unitarias de la Fase 3;
 * el 16 y el 19 se verifican en la operación (Fase 8); el 18, el e2e del MCP.
 *
 * Todo se ejercita por HTTP (supertest sobre la app Nest completa, como los
 * e2e 068, 079 y 084). El SQL directo solo monta precondiciones, lee el
 * estado resultante y limpia. No se importa ningún módulo nuevo del spec
 * (`crop-extraction.ts`, `public-submission-plan.ts`, …).
 *
 * Datos: instrumento público propio que reproduce las preguntas mapeadas del
 * taller «Talleres de co-creación — SosAgro 4.C» (no depende del taller real
 * ni de ids de producción). Identidades sintéticas con prefijo `Spec93` y
 * documentos `93<RUN><nn>`. Todo lo creado se elimina en `afterAll`.
 *
 * ENTORNO: se ejecuta SOLO contra la base de desarrollo / de test que usan
 * los e2e existentes (la del `.env` local, vía túnel a `mirp-lab`), NUNCA
 * contra producción (Neon). El caso C04 crea y elimina triggers temporales
 * (`spec93_*`) para forzar un fallo a mitad del procesado.
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

// ─── constantes ─────────────────────────────────────────────────────────────

const TEST_PASSWORD = 'E2eTest1234!';
const PREFIX = 'e2e-093';
/** Sello de la corrida: aísla documentos y nombres de fincas entre corridas. */
const RUN = Date.now().toString().slice(-6);

const CROP_NAMES = ['Café', 'Cacao', 'Cannabis', 'Cáñamo'] as const;
type CropName = (typeof CROP_NAMES)[number];

const LONG_ACCESS = [
  'Carretera destapada transitable solo en verano',
  'Camino de herradura con tramos en mal estado',
  'Trocha peatonal desde la vía principal',
];

// ─── contrato asumido de los endpoints nuevos ───────────────────────────────
// La implementación debe respetar estos nombres o ajustar este archivo (con
// aprobación) si cambian. Ver el reporte del spec.

type DocumentStatus = 'new' | 'same_person_match' | 'collision';

interface ProcessPreview {
  surveyId: string;
  identity: {
    name: string | null;
    /** Documento normalizado (sin puntos, espacios ni guiones). */
    documentId: string | null;
    phone: string | null;
  };
  document: {
    status: DocumentStatus;
    /** Productor que se reutilizaría (same_person_match) o null. */
    farmerId: string | null;
    candidates: { farmerId: string; name: string }[];
  };
  farm: {
    action: 'create' | 'link' | 'complete' | 'none';
    farmId: string | null;
    sharedCandidates: {
      source: 'farm' | 'pending_submission';
      farmId: string | null;
      surveyId: string | null;
      name: string;
      vereda: string | null;
    }[];
  };
  crops: {
    resolved: { cropId: string; name: string }[];
    /** Textos de opciones de cultivo sin `metadataId`. */
    unmapped: string[];
  };
  fieldsToComplete: {
    entity: 'farmer' | 'farm';
    field: string;
    value: unknown;
  }[];
  warnings: { code: string; message?: string }[];
}

interface ProcessResult {
  farmer: { id: string; name: string };
  existed: boolean;
}

interface CollisionConflictBody {
  documentId?: string;
  existingFarmer?: { farmerId?: string; name?: string };
}

interface LoginResponse {
  accessToken: string;
}

interface RenderedOption {
  optionId: string;
  text: string;
  metadataId: string | null;
  departmentId: string | null;
}

interface RenderedInstrument {
  sections: {
    questions: {
      questionId: string;
      systemField: string | null;
      options: RenderedOption[];
    }[];
  }[];
}

/** Respuestas del formulario del taller. `null` = pregunta sin responder. */
interface WorkshopAnswers {
  name: string | null;
  document: number | null;
  phone: string | null;
  farmName: string | null;
  vereda: string | null;
  corregimiento: string | null;
  mainCrop: CropName | 'Otro' | null;
  alsoCanamo: boolean | null;
  otherCrops: string[];
  profile: string[];
  department: 'A' | 'B' | null;
  town: 'A' | 'B' | null;
  area: { value: number; unit: 'ha' | 'm²' | 'km²' | 'fanegada' } | null;
  access: string[];
  water: string[];
}

interface PublicResponseItem {
  questionId: string;
  optionId?: string;
  textValue?: string;
  numericValue?: number;
  booleanValue?: boolean;
}

// ─── suite ──────────────────────────────────────────────────────────────────

describe('spec-093 — incorporación de los envíos del taller (e2e)', () => {
  let app: INestApplication<App>;
  let ds: DataSource;
  let adminToken: string;
  let adminUserId: string;

  const typeId: Record<string, string> = {};
  const cropId = {} as Record<CropName, string>;
  const actorTypeId: Record<string, string> = {};
  let townA: { townId: string; departmentId: string };
  let townB: { townId: string; departmentId: string };

  // Instrumento público del taller (réplica mapeada).
  let instrumentId: string;
  const q: Record<string, string> = {};
  /** opt[preguntaClave][textoOpción] = optionId */
  const opt: Record<string, Record<string, string>> = {};

  // Sección auxiliar de C01 (mapeo de metadataId por API).
  let mapSectionId: string;

  // Registro para la limpieza.
  const surveyIds: string[] = [];
  const campaignIds: string[] = [];
  const sessionIds: string[] = [];

  let docSeq = 0;
  function newDoc(): number {
    docSeq += 1;
    return Number(`93${RUN}${String(docSeq).padStart(2, '0')}`);
  }

  function withDots(doc: number): string {
    return String(doc).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  }

  function withSpacesAndHyphens(doc: number): string {
    const s = String(doc);
    return `${s.slice(0, 3)} ${s.slice(3, 6)}-${s.slice(6)}`;
  }

  function http() {
    return request(app.getHttpServer());
  }

  function auth(req: request.Test) {
    return req.set('Authorization', `Bearer ${adminToken}`);
  }

  // ── helpers de base de datos ─────────────────────────────────────────────

  async function count(sql: string, params: unknown[] = []): Promise<number> {
    const rows = await ds.query<{ n: string }[]>(sql, params);
    return Number(rows[0].n);
  }

  async function insertInstrument(name: string): Promise<string> {
    const rows = await ds.query<{ instrument_id: string }[]>(
      `INSERT INTO instruments (instrument_id, name, version, publish_date, is_active)
       VALUES (gen_random_uuid(), $1, 1, CURRENT_DATE, true) RETURNING instrument_id`,
      [name],
    );
    return rows[0].instrument_id;
  }

  async function insertSection(
    instrument: string,
    name: string,
    order: number,
  ): Promise<string> {
    const rows = await ds.query<{ section_id: string }[]>(
      `INSERT INTO sections (section_id, name, "order", instrument_id)
       VALUES (gen_random_uuid(), $1, $2, $3) RETURNING section_id`,
      [name, order, instrument],
    );
    return rows[0].section_id;
  }

  async function insertQuestion(
    sectionId: string,
    text: string,
    type: string,
    order: number,
    systemField: string | null = null,
  ): Promise<string> {
    const rows = await ds.query<{ question_id: string }[]>(
      `INSERT INTO questions (question_id, section_id, text, type_id, is_required, "order", system_field)
       VALUES (gen_random_uuid(), $1, $2, $3, false, $4, $5) RETURNING question_id`,
      [sectionId, text, typeId[type], order, systemField],
    );
    return rows[0].question_id;
  }

  async function insertOption(
    questionKey: string,
    text: string,
    metadataId: string | null = null,
  ): Promise<string> {
    const rows = await ds.query<{ option_id: string }[]>(
      `INSERT INTO options_question (option_id, question_id, text, value, metadata_id)
       VALUES (gen_random_uuid(), $1, $2, NULL, $3) RETURNING option_id`,
      [q[questionKey], text, metadataId],
    );
    opt[questionKey] ??= {};
    opt[questionKey][text] = rows[0].option_id;
    return rows[0].option_id;
  }

  async function insertFarm(fields: {
    name: string;
    vereda?: string | null;
    area?: number | null;
    corregimiento?: string | null;
    townId?: string | null;
    crops?: CropName[];
  }): Promise<string> {
    const rows = await ds.query<{ farm_id: string }[]>(
      `INSERT INTO farms (farm_id, name, vereda, area, corregimiento, town_id)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5) RETURNING farm_id`,
      [
        fields.name,
        fields.vereda ?? null,
        fields.area ?? null,
        fields.corregimiento ?? null,
        fields.townId ?? null,
      ],
    );
    const farmId = rows[0].farm_id;
    for (const crop of fields.crops ?? []) {
      await ds.query(
        `INSERT INTO farms_crops (farm_id, crop_id) VALUES ($1, $2)`,
        [farmId, cropId[crop]],
      );
    }
    return farmId;
  }

  async function insertFarmer(fields: {
    name: string;
    documentId: string;
    phone?: string | null;
    email?: string | null;
    gender?: string | null;
    farmId?: string | null;
    createdAt?: string;
  }): Promise<string> {
    const rows = await ds.query<{ id: string }[]>(
      `INSERT INTO farmers (id, name, document_id, phone, email, gender, farm_id, created_at)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, COALESCE($7::timestamp, now()))
       RETURNING id`,
      [
        fields.name,
        fields.documentId,
        fields.phone ?? null,
        fields.email ?? null,
        fields.gender ?? null,
        fields.farmId ?? null,
        fields.createdAt ?? null,
      ],
    );
    return rows[0].id;
  }

  async function surveyRow(surveyId: string) {
    const rows = await ds.query<
      {
        farmer_id: string | null;
        review_status: string | null;
        reviewed_at: Date | null;
        campaign_session_id: string | null;
      }[]
    >(
      `SELECT farmer_id, review_status, reviewed_at, campaign_session_id
         FROM surveys WHERE survey_id = $1`,
      [surveyId],
    );
    return rows[0];
  }

  async function farmerRow(farmerId: string) {
    const rows = await ds.query<
      {
        id: string;
        name: string;
        document_id: string | null;
        phone: string | null;
        email: string | null;
        gender: string | null;
        farm_id: string | null;
        updated_at: Date;
      }[]
    >(
      `SELECT id, name, document_id, phone, email, gender, farm_id, updated_at
         FROM farmers WHERE id = $1`,
      [farmerId],
    );
    return rows[0];
  }

  async function farmRow(farmId: string) {
    const rows = await ds.query<
      {
        farm_id: string;
        name: string;
        vereda: string | null;
        area: number | null;
        corregimiento: string | null;
        town_id: string | null;
        main_access_type: string | null;
        water_source_type: string | null;
      }[]
    >(
      `SELECT farm_id, name, vereda, area, corregimiento, town_id,
              main_access_type, water_source_type
         FROM farms WHERE farm_id = $1`,
      [farmId],
    );
    return rows[0];
  }

  async function farmCropIds(farmId: string): Promise<string[]> {
    const rows = await ds.query<{ crop_id: string }[]>(
      `SELECT crop_id FROM farms_crops WHERE farm_id = $1`,
      [farmId],
    );
    return rows.map((r) => r.crop_id).sort();
  }

  function sortedCropIds(names: CropName[]): string[] {
    return names.map((n) => cropId[n]).sort();
  }

  async function farmersByDocument(doc: number) {
    // Comparación normalizada en la propia consulta: el documento puede estar
    // guardado con puntos, espacios o guiones.
    return ds.query<{ id: string; name: string; farm_id: string | null }[]>(
      `SELECT id, name, farm_id FROM farmers
        WHERE regexp_replace(document_id, '[.\\s-]', '', 'g') = $1
        ORDER BY created_at ASC`,
      [String(doc)],
    );
  }

  /** Estado acotado a los datos Spec93, para comparar antes/después. */
  async function spec93Snapshot(surveyId: string) {
    return {
      farmers: await count(
        `SELECT COUNT(*)::text AS n FROM farmers WHERE name ILIKE 'spec93%'`,
      ),
      farms: await count(
        `SELECT COUNT(*)::text AS n FROM farms WHERE name ILIKE 'spec93%'`,
      ),
      farmsCrops: await count(
        `SELECT COUNT(*)::text AS n FROM farms_crops fc
           JOIN farms f ON f.farm_id = fc.farm_id WHERE f.name ILIKE 'spec93%'`,
      ),
      collisions: await count(
        `SELECT COUNT(*)::text AS n FROM farmer_document_collisions WHERE survey_id = $1`,
        [surveyId],
      ),
      sessions: await count(
        `SELECT COUNT(*)::text AS n FROM campaign_sessions cs
           JOIN farmers f ON f.id = cs.farmer_id WHERE f.name ILIKE 'spec93%'`,
      ),
      consentLinked: await count(
        `SELECT COUNT(*)::text AS n FROM consent_records
          WHERE survey_id = $1 AND farmer_id IS NOT NULL`,
        [surveyId],
      ),
      survey: await surveyRow(surveyId),
    };
  }

  // ── helpers HTTP del flujo público ───────────────────────────────────────

  function workshop(
    tag: string,
    overrides: Partial<WorkshopAnswers> = {},
  ): WorkshopAnswers {
    const document = overrides.document ?? newDoc();
    return {
      name: `Spec93 ${tag} Productora`,
      document,
      phone: `3${String(document).slice(-9)}`,
      farmName: `Spec93 Finca ${tag} ${RUN}`,
      vereda: `Vereda ${tag}`,
      corregimiento: null,
      mainCrop: 'Café',
      alsoCanamo: false,
      otherCrops: [],
      profile: ['Encargado de cultivo (productor)'],
      department: 'A',
      town: 'A',
      area: { value: 1, unit: 'ha' },
      access: [],
      water: [],
      ...overrides,
    };
  }

  function buildResponses(a: WorkshopAnswers): PublicResponseItem[] {
    const items: PublicResponseItem[] = [];
    const text = (key: string, value: string | null) => {
      if (value !== null) items.push({ questionId: q[key], textValue: value });
    };
    const choice = (key: string, label: string) => {
      const optionId = opt[key]?.[label];
      if (!optionId) throw new Error(`Opción inexistente ${key}/${label}`);
      items.push({ questionId: q[key], optionId });
    };

    text('name', a.name);
    if (a.document !== null) {
      items.push({
        questionId: q.document,
        numericValue: a.document,
        optionId: opt.document.CC,
      });
    }
    text('phone', a.phone);
    text('farmName', a.farmName);
    text('vereda', a.vereda);
    text('corregimiento', a.corregimiento);
    if (a.mainCrop) choice('mainCrop', a.mainCrop);
    if (a.alsoCanamo !== null) {
      items.push({ questionId: q.canamo, booleanValue: a.alsoCanamo });
    }
    for (const label of a.otherCrops) choice('otherCrops', label);
    for (const label of a.profile) choice('profile', label);
    if (a.department) {
      choice(
        'department',
        a.department === 'A' ? 'Departamento A' : 'Departamento B',
      );
    }
    if (a.town) choice('town', a.town === 'A' ? 'Municipio A' : 'Municipio B');
    if (a.area) {
      items.push({
        questionId: q.area,
        numericValue: a.area.value,
        optionId: opt.area[a.area.unit],
      });
    }
    for (const label of a.access) choice('access', label);
    for (const label of a.water) choice('water', label);
    return items;
  }

  async function submit(answers: WorkshopAnswers): Promise<string> {
    const res = await http()
      .post('/api/public/surveys')
      .send({
        instrumentId,
        consent: { acceptedDataProcessing: true },
        responses: buildResponses(answers),
      });
    expect(res.status).toBe(201);
    const { surveyId } = res.body as { surveyId: string };
    surveyIds.push(surveyId);
    return surveyId;
  }

  function processPublic(surveyId: string, body: Record<string, unknown> = {}) {
    return auth(http().post(`/api/surveys/${surveyId}/process-public`)).send(
      body,
    );
  }

  async function processOk(
    surveyId: string,
    body: Record<string, unknown> = {},
  ): Promise<ProcessResult> {
    const res = await processPublic(surveyId, body);
    expect(res.status).toBe(201);
    return res.body as ProcessResult;
  }

  async function preview(
    surveyId: string,
    query: Record<string, string> = {},
  ): Promise<ProcessPreview> {
    const res = await auth(
      http().get(`/api/surveys/${surveyId}/process-preview`).query(query),
    );
    expect(res.status).toBe(200);
    return res.body as ProcessPreview;
  }

  function warningCodes(p: ProcessPreview): string[] {
    return (p.warnings ?? []).map((w) => w.code);
  }

  /** Finca del productor que dejó el procesado de un envío. */
  async function farmOfSurvey(surveyId: string): Promise<string> {
    const survey = await surveyRow(surveyId);
    expect(survey.farmer_id).not.toBeNull();
    const farmer = await farmerRow(survey.farmer_id!);
    expect(farmer.farm_id).not.toBeNull();
    return farmer.farm_id!;
  }

  // ── montaje ──────────────────────────────────────────────────────────────

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      // La suite hace bastante más de 60 peticiones por minuto desde la misma
      // IP; se sube el tope del ThrottlerGuard global solo en esta app de test.
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

    // ── administrador ────────────────────────────────────────────────────
    const roles = await ds.query<{ role_id: string }[]>(
      `SELECT role_id FROM roles WHERE name = 'admin'`,
    );
    const email = `${PREFIX}-admin@test.local`;
    const existing = await ds.query<{ user_id: string }[]>(
      `SELECT user_id FROM users WHERE email = $1`,
      [email],
    );
    if (existing.length) {
      adminUserId = existing[0].user_id;
    } else {
      const hash = await bcrypt.hash(TEST_PASSWORD, 10);
      const created = await ds.query<{ user_id: string }[]>(
        `INSERT INTO users (user_id, name, last_name, email, password, role_id, must_change_password)
         VALUES (gen_random_uuid(), 'E2E', 'Spec93', $1, $2, $3, false) RETURNING user_id`,
        [email, hash, roles[0].role_id],
      );
      adminUserId = created[0].user_id;
    }
    const login = await http()
      .post('/api/auth/login')
      .send({ email, password: TEST_PASSWORD })
      .expect(200);
    adminToken = (login.body as LoginResponse).accessToken;

    // ── catálogos ────────────────────────────────────────────────────────
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
    for (const row of await ds.query<{ actor_type_id: string; name: string }[]>(
      `SELECT actor_type_id, name FROM actor_type`,
    )) {
      actorTypeId[row.name] = row.actor_type_id;
    }
    const towns = await ds.query<{ town_id: string; department_id: string }[]>(
      `SELECT town_id, department_id FROM towns ORDER BY name LIMIT 1`,
    );
    townA = { townId: towns[0].town_id, departmentId: towns[0].department_id };
    const otherTown = await ds.query<
      { town_id: string; department_id: string }[]
    >(
      `SELECT town_id, department_id FROM towns
        WHERE department_id <> $1 ORDER BY name LIMIT 1`,
      [townA.departmentId],
    );
    townB = {
      townId: otherTown[0].town_id,
      departmentId: otherTown[0].department_id,
    };

    // ── instrumento público: réplica mapeada del taller ─────────────────
    instrumentId = await insertInstrument(`E2E 093 Taller ${RUN}`);
    const s1 = await insertSection(instrumentId, 'Datos del productor', 1);
    const s2 = await insertSection(instrumentId, 'La finca', 2);

    q.profile = await insertQuestion(s1, 'Perfil', 'multiple_choice', 1);
    q.department = await insertQuestion(
      s1,
      'Departamento',
      'single_choice',
      2,
      'farm.department',
    );
    q.town = await insertQuestion(
      s1,
      'Municipio',
      'single_choice',
      3,
      'farm.town',
    );
    q.name = await insertQuestion(
      s1,
      'Nombre completo',
      'open_text',
      4,
      'farmer.name',
    );
    q.document = await insertQuestion(
      s1,
      'Documento de identidad',
      'numeric_with_unit',
      5,
      'farmer.documentId',
    );
    q.phone = await insertQuestion(
      s1,
      'Teléfono',
      'open_text',
      6,
      'farmer.phone',
    );
    q.corregimiento = await insertQuestion(
      s1,
      'Corregimiento',
      'open_text',
      7,
      'farm.corregimiento',
    );

    q.mainCrop = await insertQuestion(
      s2,
      'Cultivo principal',
      'single_choice',
      1,
      'farm.mainCrop',
    );
    q.canamo = await insertQuestion(
      s2,
      '¿Cultiva también Cáñamo?',
      'yes_no',
      2,
      'crop.canamo',
    );
    q.otherCrops = await insertQuestion(
      s2,
      '¿Cultiva también…?',
      'multiple_choice',
      3,
      'farm.mainCrop',
    );
    q.farmName = await insertQuestion(
      s2,
      'Nombre de la finca',
      'open_text',
      4,
      'farm.name',
    );
    q.vereda = await insertQuestion(
      s2,
      'Vereda',
      'open_text',
      5,
      'farm.vereda',
    );
    q.area = await insertQuestion(
      s2,
      'Área de la finca',
      'numeric_with_unit',
      6,
      'farm.area',
    );
    q.access = await insertQuestion(
      s2,
      'Tipo de acceso a la finca',
      'multiple_choice',
      7,
      'farm.mainAccessType',
    );
    q.water = await insertQuestion(
      s2,
      'Fuente de agua',
      'multiple_choice',
      8,
      'farm.waterSourceType',
    );

    await insertOption('profile', 'Propietario', actorTypeId.propietario);
    await insertOption(
      'profile',
      'Encargado de cultivo (productor)',
      actorTypeId.productor,
    );
    await insertOption(
      'profile',
      'Extensionista/Técnico',
      actorTypeId.extensionista,
    );
    await insertOption('profile', 'Secretaria');
    await insertOption('profile', 'Familiar');
    await insertOption('profile', 'Socio');

    await insertOption('department', 'Departamento A', townA.departmentId);
    await insertOption('department', 'Departamento B', townB.departmentId);
    await insertOption('town', 'Municipio A', townA.townId);
    await insertOption('town', 'Municipio B', townB.townId);

    await insertOption('document', 'CC');

    for (const crop of CROP_NAMES) {
      await insertOption('mainCrop', crop, cropId[crop]);
    }
    await insertOption('mainCrop', 'Otro');

    await insertOption('otherCrops', 'Cacao', cropId['Cacao']);
    await insertOption('otherCrops', 'Café', cropId['Café']);
    await insertOption('otherCrops', 'Cafe', cropId['Café']);
    await insertOption('otherCrops', 'Cannabis', cropId['Cannabis']);
    await insertOption('otherCrops', 'Cáñamo', cropId['Cáñamo']);
    await insertOption('otherCrops', 'Caucho');
    await insertOption('otherCrops', 'Frutos amazónicos');
    await insertOption('otherCrops', 'Otro');

    for (const unit of ['ha', 'm²', 'km²', 'fanegada']) {
      await insertOption('area', unit);
    }
    for (const label of LONG_ACCESS) await insertOption('access', label);
    for (const label of ['Nacimiento', 'Acueducto veredal', 'Aljibe']) {
      await insertOption('water', label);
    }

    // Sección auxiliar de C01: preguntas sin opciones, mapeadas por API.
    mapSectionId = await insertSection(instrumentId, 'E2E 093 Mapeo', 3);
    q.mapCrop = await insertQuestion(
      mapSectionId,
      'Mapeo cultivo',
      'single_choice',
      1,
      'farm.mainCrop',
    );
    q.mapTown = await insertQuestion(
      mapSectionId,
      'Mapeo municipio',
      'single_choice',
      2,
      'farm.town',
    );
    q.mapDept = await insertQuestion(
      mapSectionId,
      'Mapeo departamento',
      'single_choice',
      3,
      'farm.department',
    );
    q.mapFree = await insertQuestion(
      mapSectionId,
      'Mapeo perfil (sin systemField)',
      'multiple_choice',
      4,
    );

    await ds.query(
      `UPDATE instruments SET is_public = true WHERE instrument_id = $1`,
      [instrumentId],
    );
  });

  // ── limpieza ─────────────────────────────────────────────────────────────

  afterAll(async () => {
    const safe = async (sql: string, params: unknown[] = []) => {
      try {
        await ds.query(sql, params);
      } catch {
        /* limpieza tolerante: el caso que falló pudo no crear el recurso */
      }
    };

    await dropTriggers(safe);

    const farmerIds = (
      await ds.query<{ id: string }[]>(
        `SELECT id FROM farmers WHERE name ILIKE 'spec93%'`,
      )
    ).map((r) => r.id);

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
    await safe(
      `UPDATE campaign_sessions SET farmer_id = NULL WHERE farmer_id = ANY($1::uuid[])`,
      [farmerIds],
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
    await safe(`DELETE FROM farmers WHERE id = ANY($1::uuid[])`, [farmerIds]);
    await safe(
      `DELETE FROM farms_crops WHERE farm_id IN
         (SELECT farm_id FROM farms WHERE name ILIKE 'spec93%')`,
    );
    await safe(`DELETE FROM farms WHERE name ILIKE 'spec93%'`);
    await safe(
      `DELETE FROM campaign_sessions WHERE session_id = ANY($1::uuid[])`,
      [sessionIds],
    );
    await safe(`DELETE FROM campaigns WHERE campaign_id = ANY($1::uuid[])`, [
      campaignIds,
    ]);
    await safe(
      `DELETE FROM questions WHERE section_id IN
         (SELECT section_id FROM sections WHERE instrument_id = $1)`,
      [instrumentId],
    );
    await safe(`DELETE FROM sections WHERE instrument_id = $1`, [instrumentId]);
    await safe(`DELETE FROM instruments WHERE instrument_id = $1`, [
      instrumentId,
    ]);
    await safe(`DELETE FROM users WHERE user_id = $1`, [adminUserId]);
    await app.close();
  });

  // ── triggers temporales de C04 ───────────────────────────────────────────

  const UUID_RE = /^[0-9a-f-]{36}$/i;

  async function dropTriggers(
    run: (sql: string) => Promise<unknown> = (sql) => ds.query(sql),
  ) {
    await run(`DROP TRIGGER IF EXISTS spec93_block_processed ON surveys`);
    await run(`DROP FUNCTION IF EXISTS spec93_block_processed()`);
    await run(`DROP TRIGGER IF EXISTS spec93_block_farm_crops ON farms_crops`);
    await run(`DROP FUNCTION IF EXISTS spec93_block_farm_crops()`);
  }

  // ═════════════════════════════════════════════════════════════════════════
  // C01 — metadataId escribible y validado contra el catálogo
  // ═════════════════════════════════════════════════════════════════════════

  describe('C01 — metadataId se crea y actualiza por API; un UUID ajeno al catálogo da 400', () => {
    async function optionMetadata(optionId: string): Promise<string | null> {
      const rows = await ds.query<{ metadata_id: string | null }[]>(
        `SELECT metadata_id FROM options_question WHERE option_id = $1`,
        [optionId],
      );
      return rows[0]?.metadata_id ?? null;
    }

    async function optionCount(questionKey: string): Promise<number> {
      return count(
        `SELECT COUNT(*)::text AS n FROM options_question WHERE question_id = $1`,
        [q[questionKey]],
      );
    }

    it('POST /questions/:id/options guarda metadataId de un tipo de cultivo en farm.mainCrop', async () => {
      const res = await auth(
        http().post(`/api/questions/${q.mapCrop}/options`),
      ).send({ text: 'Café (mapeo)', metadataId: cropId['Café'] });
      expect(res.status).toBe(201);
      const { optionId } = res.body as { optionId: string };
      expect(await optionMetadata(optionId)).toBe(cropId['Café']);
    });

    it('POST con un municipio sobre farm.mainCrop (catálogo equivocado) → 400', async () => {
      const before = await optionCount('mapCrop');
      await auth(http().post(`/api/questions/${q.mapCrop}/options`))
        .send({ text: 'Municipio colado', metadataId: townA.townId })
        .expect(400);
      expect(await optionCount('mapCrop')).toBe(before);
    });

    it('POST con un UUID que no existe en ningún catálogo → 400', async () => {
      await auth(http().post(`/api/questions/${q.mapCrop}/options`))
        .send({
          text: 'Fantasma',
          metadataId: '00000000-0000-4000-8000-000000000093',
        })
        .expect(400);
    });

    it('POST con metadataId que no es UUID → 400', async () => {
      await auth(http().post(`/api/questions/${q.mapCrop}/options`))
        .send({ text: 'No uuid', metadataId: 'cafe' })
        .expect(400);
    });

    it('POST …/options/batch guarda los metadataId de municipios en farm.town', async () => {
      const res = await auth(
        http().post(`/api/questions/${q.mapTown}/options/batch`),
      ).send([
        { text: 'Municipio A (mapeo)', metadataId: townA.townId },
        { text: 'Municipio B (mapeo)', metadataId: townB.townId },
      ]);
      expect(res.status).toBe(201);
      const rows = await ds.query<{ metadata_id: string | null }[]>(
        `SELECT metadata_id FROM options_question WHERE question_id = $1`,
        [q.mapTown],
      );
      expect(rows.map((r) => r.metadata_id).sort()).toEqual(
        [townA.townId, townB.townId].sort(),
      );
    });

    it('batch con un solo metadataId inválido → 400 y no crea ninguna opción del lote', async () => {
      const before = await optionCount('mapTown');
      await auth(http().post(`/api/questions/${q.mapTown}/options/batch`))
        .send([
          { text: 'Municipio válido', metadataId: townA.townId },
          { text: 'Cultivo colado', metadataId: cropId['Cacao'] },
        ])
        .expect(400);
      expect(await optionCount('mapTown')).toBe(before);
    });

    it('PATCH /questions/:qid/options/:id fija metadataId de departamento; catálogo equivocado → 400', async () => {
      const created = await auth(
        http().post(`/api/questions/${q.mapDept}/options`),
      ).send({ text: 'Departamento sin mapear' });
      expect(created.status).toBe(201);
      const { optionId } = created.body as { optionId: string };

      await auth(
        http().patch(`/api/questions/${q.mapDept}/options/${optionId}`),
      )
        .send({ metadataId: townA.departmentId })
        .expect(200);
      expect(await optionMetadata(optionId)).toBe(townA.departmentId);

      await auth(
        http().patch(`/api/questions/${q.mapDept}/options/${optionId}`),
      )
        .send({ metadataId: cropId['Café'] })
        .expect(400);
      expect(await optionMetadata(optionId)).toBe(townA.departmentId);
    });

    it('sin systemField: acepta un tipo de actor y rechaza un UUID de ningún catálogo', async () => {
      const ok = await auth(
        http().post(`/api/questions/${q.mapFree}/options`),
      ).send({
        text: 'Extensionista (mapeo)',
        metadataId: actorTypeId.extensionista,
      });
      expect(ok.status).toBe(201);
      expect(
        await optionMetadata((ok.body as { optionId: string }).optionId),
      ).toBe(actorTypeId.extensionista);

      await auth(http().post(`/api/questions/${q.mapFree}/options`))
        .send({
          text: 'Nada',
          metadataId: '00000000-0000-4000-8000-000000000094',
        })
        .expect(400);
    });
  });

  // ═════════════════════════════════════════════════════════════════════════
  // C02 — unión de cultivos de la cadena en la finca, sin sesión
  // ═════════════════════════════════════════════════════════════════════════

  describe('C02 — procesar deja la finca con la unión de cultivos; opciones sin metadataId no crean cultivos', () => {
    it('cultivo principal + «¿también cáñamo?» + otros cultivos → Café, Cáñamo y Cacao en farms_crops', async () => {
      const cropCatalogBefore = await count(
        `SELECT COUNT(*)::text AS n FROM types_of_crops`,
      );
      const surveyId = await submit(
        workshop('C02', {
          mainCrop: 'Café',
          alsoCanamo: true,
          otherCrops: ['Cacao', 'Cafe', 'Caucho', 'Frutos amazónicos', 'Otro'],
        }),
      );

      const p = await preview(surveyId);
      expect(p.crops.resolved.map((c) => c.cropId).sort()).toEqual(
        sortedCropIds(['Café', 'Cáñamo', 'Cacao']),
      );
      expect(p.crops.unmapped).toEqual(
        expect.arrayContaining(['Caucho', 'Frutos amazónicos']),
      );

      await processOk(surveyId);

      const farmId = await farmOfSurvey(surveyId);
      // Sin duplicados: «Café» y «Cafe» apuntan al mismo cultivo.
      expect(await farmCropIds(farmId)).toEqual(
        sortedCropIds(['Café', 'Cáñamo', 'Cacao']),
      );
      expect(
        await count(`SELECT COUNT(*)::text AS n FROM types_of_crops`),
      ).toBe(cropCatalogBefore);
    });

    it('«¿también cáñamo?» = no y sin otros cultivos → solo el cultivo principal', async () => {
      const surveyId = await submit(
        workshop('C02b', { mainCrop: 'Cannabis', alsoCanamo: false }),
      );
      await processOk(surveyId);
      expect(await farmCropIds(await farmOfSurvey(surveyId))).toEqual(
        sortedCropIds(['Cannabis']),
      );
    });

    it('cultivo principal «Otro» (sin metadataId) no crea cultivos', async () => {
      const surveyId = await submit(
        workshop('C02c', { mainCrop: 'Otro', otherCrops: ['Caucho'] }),
      );
      await processOk(surveyId);
      expect(await farmCropIds(await farmOfSurvey(surveyId))).toEqual([]);
    });
  });

  // ═════════════════════════════════════════════════════════════════════════
  // C03 — sin sesiones; extract-crops con sesión no cambia
  // ═════════════════════════════════════════════════════════════════════════

  describe('C03 — procesar un envío público no toca sesiones de campaña', () => {
    it('no crea ni modifica sesiones ni campaign_sessions_crops', async () => {
      const surveyId = await submit(
        workshop('C03', { mainCrop: 'Cacao', alsoCanamo: true }),
      );
      const sessionsBefore = await count(
        `SELECT COUNT(*)::text AS n FROM campaign_sessions`,
      );
      const sessionCropsBefore = await count(
        `SELECT COUNT(*)::text AS n FROM campaign_sessions_crops`,
      );

      await processOk(surveyId);

      const survey = await surveyRow(surveyId);
      expect(survey.campaign_session_id).toBeNull();
      expect(
        await count(
          `SELECT COUNT(*)::text AS n FROM campaign_sessions WHERE farmer_id = $1`,
          [survey.farmer_id],
        ),
      ).toBe(0);
      // Conteos globales: pueden moverse si otra suite corre en paralelo
      // (jest usa varios workers); en ejecución aislada deben ser iguales.
      expect(
        await count(`SELECT COUNT(*)::text AS n FROM campaign_sessions`),
      ).toBe(sessionsBefore);
      expect(
        await count(`SELECT COUNT(*)::text AS n FROM campaign_sessions_crops`),
      ).toBe(sessionCropsBefore);
    });
  });

  describe('C03 (regresión) — extract-crops con sesión se comporta igual que antes', () => {
    it('asigna a la sesión y REEMPLAZA los cultivos de la finca del productor de la sesión', async () => {
      const farmId = await insertFarm({
        name: `Spec93 Finca Campo ${RUN}`,
        crops: ['Cacao'],
      });
      const farmerId = await insertFarmer({
        name: 'Spec93 Campo Regresion',
        documentId: String(newDoc()),
        farmId,
      });
      const campaign = await ds.query<{ campaign_id: string }[]>(
        `INSERT INTO campaigns (campaign_id, name, is_active)
         VALUES (gen_random_uuid(), $1, true) RETURNING campaign_id`,
        [`E2E 093 Campaña ${RUN}`],
      );
      campaignIds.push(campaign[0].campaign_id);
      const session = await ds.query<{ session_id: string }[]>(
        `INSERT INTO campaign_sessions (session_id, campaign_id, user_id, farmer_id, sincronized)
         VALUES (gen_random_uuid(), $1, $2, $3, true) RETURNING session_id`,
        [campaign[0].campaign_id, adminUserId, farmerId],
      );
      const sessionId = session[0].session_id;
      sessionIds.push(sessionId);

      const survey = await ds.query<{ survey_id: string }[]>(
        `INSERT INTO surveys (survey_id, user_id, campaign_session_id, sincronized)
         VALUES (gen_random_uuid(), $1, $2, true) RETURNING survey_id`,
        [adminUserId, sessionId],
      );
      const surveyId = survey[0].survey_id;
      surveyIds.push(surveyId);
      await ds.query(
        `INSERT INTO surveys_instruments (survey_id, instrument_id) VALUES ($1, $2)`,
        [surveyId, instrumentId],
      );
      await ds.query(
        `INSERT INTO responses (response_id, survey_id, question_id, option_id)
         VALUES (gen_random_uuid(), $1, $2, $3)`,
        [surveyId, q.mainCrop, opt.mainCrop['Café']],
      );
      await ds.query(
        `INSERT INTO responses (response_id, survey_id, question_id, boolean_value)
         VALUES (gen_random_uuid(), $1, $2, true)`,
        [surveyId, q.canamo],
      );

      const res = await auth(
        http().post(`/api/surveys/${surveyId}/extract-crops`),
      ).send({});
      expect([200, 201]).toContain(res.status);
      const body = res.body as { crops: { cropId: string }[] };
      expect(body.crops.map((c) => c.cropId).sort()).toEqual(
        sortedCropIds(['Café', 'Cáñamo']),
      );

      const sessionCrops = await ds.query<{ crop_id: string }[]>(
        `SELECT types_of_crops_crop_id AS crop_id FROM campaign_sessions_crops
          WHERE campaign_sessions_session_id = $1`,
        [sessionId],
      );
      expect(sessionCrops.map((c) => c.crop_id).sort()).toEqual(
        sortedCropIds(['Café', 'Cáñamo']),
      );
      // Semántica del flujo de campo: reemplaza (Cacao desaparece). Solo el
      // canal público suma.
      expect(await farmCropIds(farmId)).toEqual(
        sortedCropIds(['Café', 'Cáñamo']),
      );
    });
  });

  // ═════════════════════════════════════════════════════════════════════════
  // C04 — atomicidad
  // ═════════════════════════════════════════════════════════════════════════

  describe('C04 — si falla cualquier paso, no queda productor, finca, cultivo, constancia ni cambio de estado', () => {
    async function expectNothingLeft(
      surveyId: string,
      answers: WorkshopAnswers,
    ) {
      expect(await farmersByDocument(answers.document!)).toHaveLength(0);
      expect(
        await count(`SELECT COUNT(*)::text AS n FROM farms WHERE name = $1`, [
          answers.farmName,
        ]),
      ).toBe(0);
      expect(
        await count(
          `SELECT COUNT(*)::text AS n FROM farms_crops fc
             JOIN farms f ON f.farm_id = fc.farm_id WHERE f.name = $1`,
          [answers.farmName],
        ),
      ).toBe(0);
      expect(
        await count(
          `SELECT COUNT(*)::text AS n FROM consent_records
            WHERE survey_id = $1 AND farmer_id IS NOT NULL`,
          [surveyId],
        ),
      ).toBe(0);
      const survey = await surveyRow(surveyId);
      expect(survey.review_status).toBe('pending');
      expect(survey.farmer_id).toBeNull();
      expect(survey.reviewed_at).toBeNull();
    }

    afterEach(async () => {
      await dropTriggers();
    });

    it('fallo al marcar «processed» (último paso) → rollback completo', async () => {
      const answers = workshop('C04a', { alsoCanamo: true });
      const surveyId = await submit(answers);
      expect(surveyId).toMatch(UUID_RE);

      // Trigger temporal acotado a ESTA encuesta: el resto de la tabla (y de
      // las suites que corran en paralelo) no se ve afectado.
      await ds.query(`
        CREATE OR REPLACE FUNCTION spec93_block_processed() RETURNS trigger AS $$
        BEGIN
          IF NEW.survey_id = '${surveyId}'::uuid AND NEW.review_status = 'processed' THEN
            RAISE EXCEPTION 'spec93: fallo forzado al marcar processed';
          END IF;
          RETURN NEW;
        END $$ LANGUAGE plpgsql`);
      await ds.query(`
        CREATE TRIGGER spec93_block_processed BEFORE UPDATE ON surveys
        FOR EACH ROW EXECUTE FUNCTION spec93_block_processed()`);

      const res = await processPublic(surveyId);
      expect(res.status).toBeGreaterThanOrEqual(400);

      await expectNothingLeft(surveyId, answers);

      // Sin el fallo, el mismo envío se procesa con normalidad.
      await dropTriggers();
      await processOk(surveyId);
      expect((await surveyRow(surveyId)).review_status).toBe('processed');
    });

    it('fallo al asignar cultivos a la finca → rollback completo', async () => {
      const answers = workshop('C04b', { mainCrop: 'Cacao' });
      const surveyId = await submit(answers);

      await ds.query(`
        CREATE OR REPLACE FUNCTION spec93_block_farm_crops() RETURNS trigger AS $$
        BEGIN
          IF EXISTS (SELECT 1 FROM farms WHERE farm_id = NEW.farm_id
                      AND name = '${answers.farmName!.replace(/'/g, "''")}') THEN
            RAISE EXCEPTION 'spec93: fallo forzado al asignar cultivos';
          END IF;
          RETURN NEW;
        END $$ LANGUAGE plpgsql`);
      await ds.query(`
        CREATE TRIGGER spec93_block_farm_crops BEFORE INSERT ON farms_crops
        FOR EACH ROW EXECUTE FUNCTION spec93_block_farm_crops()`);

      // Hoy el canal público ni siquiera escribe farms_crops (sin sesión), así
      // que la petición "tiene éxito" y este caso falla: rojo esperado.
      const res = await processPublic(surveyId);
      expect(res.status).toBeGreaterThanOrEqual(400);

      await expectNothingLeft(surveyId, answers);
    });
  });

  // ═════════════════════════════════════════════════════════════════════════
  // C05 — idempotencia y concurrencia
  // ═════════════════════════════════════════════════════════════════════════

  describe('C05 — procesar dos veces, o en paralelo, no duplica productor ni finca', () => {
    it('dos process-public simultáneos → un productor, una finca, processed una sola vez', async () => {
      const answers = workshop('C05', { alsoCanamo: true });
      const surveyId = await submit(answers);

      const [a, b] = await Promise.all([
        processPublic(surveyId),
        processPublic(surveyId),
      ]);
      const statuses = [a.status, b.status];
      expect(statuses).toContain(201);
      // El segundo puede devolver el mismo resultado (201) o «ya revisado» (409),
      // nunca un 500 ni un segundo productor.
      for (const status of statuses) expect([201, 409]).toContain(status);
      const ok = [a, b].filter((r) => r.status === 201);
      const ids = new Set(ok.map((r) => (r.body as ProcessResult).farmer.id));
      expect(ids.size).toBe(1);

      expect(await farmersByDocument(answers.document!)).toHaveLength(1);
      expect(
        await count(`SELECT COUNT(*)::text AS n FROM farms WHERE name = $1`, [
          answers.farmName,
        ]),
      ).toBe(1);

      const survey = await surveyRow(surveyId);
      expect(survey.review_status).toBe('processed');
      const reviewedAt = survey.reviewed_at;

      // Un tercer intento secuencial no reprocesa ni cambia la marca.
      const again = await processPublic(surveyId);
      expect(again.status).toBe(409);
      expect((await surveyRow(surveyId)).reviewed_at).toEqual(reviewedAt);
      expect(await farmersByDocument(answers.document!)).toHaveLength(1);
    });
  });

  // ═════════════════════════════════════════════════════════════════════════
  // C06 — productor existente: completar sin pisar, sumar cultivos
  // ═════════════════════════════════════════════════════════════════════════

  describe('C06 — documento existente con nombre compatible: vincula, completa lo vacío y suma cultivos', () => {
    it('llena solo columnas nulas del productor y de la finca y suma cultivos sin quitar', async () => {
      const doc = newDoc();
      const farmName = `Spec93 Finca La Esperanza ${RUN}`;
      const farmId = await insertFarm({
        name: farmName,
        vereda: 'El Retiro',
        area: null,
        corregimiento: null,
        townId: null,
        crops: ['Cacao'],
      });
      const farmerId = await insertFarmer({
        name: 'Spec93 Ana Ruiz Mora',
        documentId: String(doc),
        phone: null,
        email: 'spec93.ana@example.test',
        gender: 'Mujer',
        farmId,
      });
      const before = await farmerRow(farmerId);

      const surveyId = await submit(
        workshop('C06', {
          name: 'Spec93 Ana Ruiz',
          document: doc,
          phone: '3001112233',
          farmName,
          vereda: 'Otra Vereda',
          corregimiento: 'Corregimiento C06',
          area: { value: 2, unit: 'ha' },
          town: 'A',
          mainCrop: 'Café',
          alsoCanamo: true,
        }),
      );

      const p = await preview(surveyId);
      expect(p.document.status).toBe('same_person_match');
      expect(p.document.farmerId).toBe(farmerId);
      const fields = p.fieldsToComplete.map((f) => `${f.entity}.${f.field}`);
      expect(fields).toEqual(
        expect.arrayContaining(['farmer.phone', 'farm.corregimiento']),
      );
      expect(fields).not.toContain('farmer.email');
      expect(fields).not.toContain('farmer.name');
      expect(fields).not.toContain('farm.vereda');

      const result = await processOk(surveyId);
      expect(result.existed).toBe(true);
      expect(result.farmer.id).toBe(farmerId);
      expect((await surveyRow(surveyId)).farmer_id).toBe(farmerId);
      expect(await farmersByDocument(doc)).toHaveLength(1);

      const after = await farmerRow(farmerId);
      expect(after.name).toBe(before.name);
      expect(after.email).toBe('spec93.ana@example.test');
      expect(after.gender).toBe('Mujer');
      expect(after.phone).toBe('3001112233');
      expect(after.farm_id).toBe(farmId);

      const farm = await farmRow(farmId);
      expect(farm.vereda).toBe('El Retiro');
      expect(farm.corregimiento).toBe('Corregimiento C06');
      expect(farm.area).toBeCloseTo(2);
      expect(farm.town_id).toBe(townA.townId);
      expect(
        await count(`SELECT COUNT(*)::text AS n FROM farms WHERE name = $1`, [
          farmName,
        ]),
      ).toBe(1);

      // Suma, no reemplaza: Cacao sigue.
      expect(await farmCropIds(farmId)).toEqual(
        sortedCropIds(['Cacao', 'Café', 'Cáñamo']),
      );
    });

    it('productor existente sin finca → crea y vincula la finca del envío', async () => {
      const doc = newDoc();
      const farmerId = await insertFarmer({
        name: 'Spec93 Hector Salas Pinto',
        documentId: String(doc),
      });
      const answers = workshop('C06b', {
        name: 'Spec93 Hector Salas Pinto',
        document: doc,
        mainCrop: 'Cacao',
      });
      const surveyId = await submit(answers);

      const result = await processOk(surveyId);
      expect(result.existed).toBe(true);
      expect(result.farmer.id).toBe(farmerId);

      const farmer = await farmerRow(farmerId);
      expect(farmer.farm_id).not.toBeNull();
      const farm = await farmRow(farmer.farm_id!);
      expect(farm.name).toBe(answers.farmName);
      expect(await farmCropIds(farm.farm_id)).toEqual(sortedCropIds(['Cacao']));
    });

    it('productor existente con otra finca de otro nombre → no crea una segunda y advierte', async () => {
      const doc = newDoc();
      const farmId = await insertFarm({
        name: `Spec93 Finca Original ${RUN}`,
        crops: ['Café'],
      });
      const farmerId = await insertFarmer({
        name: 'Spec93 Ines Duarte Rey',
        documentId: String(doc),
        farmId,
      });
      const answers = workshop('C06c', {
        name: 'Spec93 Ines Duarte Rey',
        document: doc,
        farmName: `Spec93 Finca Distinta ${RUN}`,
        mainCrop: 'Cacao',
      });
      const surveyId = await submit(answers);

      const p = await preview(surveyId);
      expect(warningCodes(p)).toContain('different_farm_name_existing_farmer');

      await processOk(surveyId);
      expect((await farmerRow(farmerId)).farm_id).toBe(farmId);
      expect(
        await count(`SELECT COUNT(*)::text AS n FROM farms WHERE name = $1`, [
          answers.farmName,
        ]),
      ).toBe(0);
      // Los cultivos del envío se suman a la única finca del productor.
      expect(await farmCropIds(farmId)).toEqual(
        sortedCropIds(['Café', 'Cacao']),
      );
    });
  });

  // ═════════════════════════════════════════════════════════════════════════
  // C07 — colisión: 409 con solo la fila de colisión
  // ═════════════════════════════════════════════════════════════════════════

  describe('C07 — documento existente con otro nombre: 409 sin mutar nada salvo la fila de colisión', () => {
    let doc: number;
    let existingFarmerId: string;

    beforeAll(async () => {
      doc = newDoc();
      existingFarmerId = await insertFarmer({
        name: 'Spec93 Pedro Gomez Lara',
        documentId: String(doc),
        phone: '3009990001',
      });
    });

    it('responde 409 y solo registra una colisión pendiente (una sola, aunque se reintente)', async () => {
      const surveyId = await submit(
        workshop('C07', { name: 'Spec93 Lucia Fernandez Rios', document: doc }),
      );
      const existingBefore = await farmerRow(existingFarmerId);
      const before = await spec93Snapshot(surveyId);

      const res = await processPublic(surveyId);
      expect(res.status).toBe(409);
      const body = res.body as CollisionConflictBody;
      expect(body.existingFarmer?.farmerId).toBe(existingFarmerId);

      const after = await spec93Snapshot(surveyId);
      expect(after.farmers).toBe(before.farmers);
      expect(after.farms).toBe(before.farms);
      expect(after.farmsCrops).toBe(before.farmsCrops);
      expect(after.sessions).toBe(before.sessions);
      expect(after.consentLinked).toBe(0);
      expect(after.survey.review_status).toBe('pending');
      expect(after.survey.farmer_id).toBeNull();
      expect(after.collisions).toBe(before.collisions + 1);
      expect(await farmerRow(existingFarmerId)).toEqual(existingBefore);

      const rows = await ds.query<
        { resolution: string | null; existing_farmer_id: string }[]
      >(
        `SELECT resolution, existing_farmer_id FROM farmer_document_collisions
          WHERE survey_id = $1`,
        [surveyId],
      );
      expect(rows).toEqual([
        { resolution: null, existing_farmer_id: existingFarmerId },
      ]);

      // Reintento sin resolución: sigue habiendo una sola fila pendiente.
      await processPublic(surveyId).expect(409);
      expect((await spec93Snapshot(surveyId)).collisions).toBe(1);
    });

    it("con resolution 'same_person' vincula al existente y resuelve la misma fila", async () => {
      const surveyId = await submit(
        workshop('C07b', {
          name: 'Spec93 Lucia Fernandez Rios',
          document: doc,
        }),
      );
      await processPublic(surveyId).expect(409);

      const result = await processOk(surveyId, { resolution: 'same_person' });
      expect(result.farmer.id).toBe(existingFarmerId);
      expect(result.existed).toBe(true);
      expect((await surveyRow(surveyId)).review_status).toBe('processed');
      // El nombre del existente no se pisa.
      expect((await farmerRow(existingFarmerId)).name).toBe(
        'Spec93 Pedro Gomez Lara',
      );

      const rows = await ds.query<{ resolution: string | null }[]>(
        `SELECT resolution FROM farmer_document_collisions WHERE survey_id = $1`,
        [surveyId],
      );
      expect(rows).toEqual([{ resolution: 'same_person' }]);
    });

    it("con resolution 'separate_person' crea un productor nuevo con el mismo documento", async () => {
      const surveyId = await submit(
        workshop('C07c', { name: 'Spec93 Marta Quiroga Paz', document: doc }),
      );
      await processPublic(surveyId).expect(409);

      const result = await processOk(surveyId, {
        resolution: 'separate_person',
      });
      expect(result.existed).toBe(false);
      expect(result.farmer.id).not.toBe(existingFarmerId);
      const same = await farmersByDocument(doc);
      expect(same.map((f) => f.id)).toEqual(
        expect.arrayContaining([existingFarmerId, result.farmer.id]),
      );
    });
  });

  // ═════════════════════════════════════════════════════════════════════════
  // C08 — búsqueda normalizada y determinista
  // ═════════════════════════════════════════════════════════════════════════

  describe('C08 — la búsqueda por documento ignora puntos, espacios y guiones y es determinista', () => {
    it('con varios productores del mismo documento elige el que coincide en nombre', async () => {
      const doc = newDoc();
      // El más antiguo tiene OTRO nombre (guardado con espacios y guion)…
      await insertFarmer({
        name: 'Spec93 Otro Nombre Distinto',
        documentId: withSpacesAndHyphens(doc),
        createdAt: '2026-01-01T00:00:00',
      });
      // …y el que coincide en nombre está guardado con puntos.
      const matchingId = await insertFarmer({
        name: 'Spec93 Carmen Rojas Vega',
        documentId: withDots(doc),
        createdAt: '2026-02-01T00:00:00',
      });

      const surveyId = await submit(
        workshop('C08', { name: 'Spec93 Carmen Rojas Vega', document: doc }),
      );

      const p = await preview(surveyId);
      expect(p.identity.documentId).toBe(String(doc));
      expect(p.document.status).toBe('same_person_match');
      expect(p.document.farmerId).toBe(matchingId);

      const result = await processOk(surveyId);
      expect(result.existed).toBe(true);
      expect(result.farmer.id).toBe(matchingId);
      // Normalizar es para comparar: lo guardado no se reescribe.
      expect((await farmerRow(matchingId)).document_id).toBe(withDots(doc));
      expect(await farmersByDocument(doc)).toHaveLength(2);
    });

    it('con varios que coinciden en nombre elige siempre el más antiguo (ORDER BY created_at)', async () => {
      const doc = newDoc();
      const oldestId = await insertFarmer({
        name: 'Spec93 Julio Paz Leon',
        documentId: withDots(doc),
        createdAt: '2026-01-01T00:00:00',
      });
      await insertFarmer({
        name: 'Spec93 Julio Paz Leon',
        documentId: withSpacesAndHyphens(doc),
        createdAt: '2026-03-01T00:00:00',
      });

      const surveyId = await submit(
        workshop('C08b', { name: 'Spec93 Julio Paz Leon', document: doc }),
      );

      const picks = new Set<string | null>();
      for (let i = 0; i < 3; i++) {
        picks.add((await preview(surveyId)).document.farmerId);
      }
      expect([...picks]).toEqual([oldestId]);

      const result = await processOk(surveyId);
      expect(result.farmer.id).toBe(oldestId);
    });
  });

  // ═════════════════════════════════════════════════════════════════════════
  // C09 — vista previa de solo lectura que anticipa el procesado
  // ═════════════════════════════════════════════════════════════════════════

  describe('C09 — GET /surveys/:id/process-preview no escribe nada y anticipa process-public', () => {
    it('sobre una colisión: ni fila de colisión, ni productor, ni finca, ni cambio de estado', async () => {
      const doc = newDoc();
      const existingId = await insertFarmer({
        name: 'Spec93 Rafael Nieto Soto',
        documentId: String(doc),
      });
      const surveyId = await submit(
        workshop('C09', { name: 'Spec93 Gloria Beltran Cruz', document: doc }),
      );
      const before = await spec93Snapshot(surveyId);

      const p1 = await preview(surveyId);
      const p2 = await preview(surveyId);

      expect(await spec93Snapshot(surveyId)).toEqual(before);
      expect(before.collisions).toBe(0);
      expect(p2).toEqual(p1);

      expect(p1.document.status).toBe('collision');
      expect(p1.document.candidates.map((c) => c.farmerId)).toContain(
        existingId,
      );
      // Lo que anticipa se cumple: process-public responde 409.
      await processPublic(surveyId).expect(409);
    });

    it('sobre un envío limpio: identidad, finca a crear y cultivos coinciden con lo procesado', async () => {
      const answers = workshop('C09b', {
        name: 'Spec93 Tomas Arango Gil',
        mainCrop: 'Cacao',
        alsoCanamo: true,
      });
      const surveyId = await submit(answers);
      const before = await spec93Snapshot(surveyId);

      const p = await preview(surveyId);
      expect(await spec93Snapshot(surveyId)).toEqual(before);

      expect(p.surveyId).toBe(surveyId);
      expect(p.identity).toMatchObject({
        name: answers.name,
        documentId: String(answers.document),
        phone: answers.phone,
      });
      expect(p.document.status).toBe('new');
      expect(p.farm.action).toBe('create');
      const anticipatedCrops = p.crops.resolved.map((c) => c.cropId).sort();
      expect(anticipatedCrops).toEqual(sortedCropIds(['Cacao', 'Cáñamo']));

      const result = await processOk(surveyId);
      expect(result.existed).toBe(false);
      expect(await farmCropIds(await farmOfSurvey(surveyId))).toEqual(
        anticipatedCrops,
      );
    });

    it('acepta las mismas decisiones que process-public (townId por query)', async () => {
      const surveyId = await submit(
        workshop('C09c', { department: null, town: null }),
      );
      expect(warningCodes(await preview(surveyId))).toContain('missing_town');
      expect(
        warningCodes(await preview(surveyId, { townId: townB.townId })),
      ).not.toContain('missing_town');
    });

    it('exige autenticación', async () => {
      const surveyId = await submit(workshop('C09d'));
      await http().get(`/api/surveys/${surveyId}/process-preview`).expect(401);
    });
  });

  // ═════════════════════════════════════════════════════════════════════════
  // C10 — finca candidata a compartida
  // ═════════════════════════════════════════════════════════════════════════

  describe('C10 — fincas candidatas a compartida: por defecto se crea otra; con link se vincula', () => {
    const sharedName = `Spec93 Hacienda La Arboleda ${RUN}`;
    let existingFarmId: string;

    beforeAll(async () => {
      existingFarmId = await insertFarm({
        name: sharedName,
        vereda: 'La Palma',
        townId: townA.townId,
        crops: ['Café'],
      });
      await insertFarmer({
        name: 'Spec93 Dueño Arboleda Uno',
        documentId: String(newDoc()),
        farmId: existingFarmId,
      });
    });

    function sharedAnswers(tag: string, name: string): WorkshopAnswers {
      return workshop(tag, {
        name,
        // Mismo nombre normalizado: mayúsculas y espacios distintos.
        farmName: `SPEC93 hacienda  la ARBOLEDA ${RUN}`,
        vereda: 'la palma',
        town: 'A',
      });
    }

    it('la vista previa marca la finca existente como candidata y por defecto se crea una nueva', async () => {
      const surveyId = await submit(
        sharedAnswers('C10', 'Spec93 Socio Arboleda Dos'),
      );
      const p = await preview(surveyId);
      expect(p.farm.action).toBe('create');
      expect(
        p.farm.sharedCandidates
          .filter((c) => c.source === 'farm')
          .map((c) => c.farmId),
      ).toContain(existingFarmId);

      const farmsBefore = await count(
        `SELECT COUNT(*)::text AS n FROM farms WHERE name ILIKE $1`,
        [`%arboleda ${RUN}`],
      );
      const result = await processOk(surveyId);
      const farmer = await farmerRow(result.farmer.id);
      expect(farmer.farm_id).not.toBeNull();
      expect(farmer.farm_id).not.toBe(existingFarmId);
      expect(
        await count(
          `SELECT COUNT(*)::text AS n FROM farms WHERE name ILIKE $1`,
          [`%arboleda ${RUN}`],
        ),
      ).toBe(farmsBefore + 1);
    });

    it("con farm.mode = 'link' el productor queda en la finca existente sin crear otra", async () => {
      const surveyId = await submit(
        sharedAnswers('C10b', 'Spec93 Socia Arboleda Tres'),
      );
      const farmsBefore = await count(
        `SELECT COUNT(*)::text AS n FROM farms WHERE name ILIKE $1`,
        [`%arboleda ${RUN}`],
      );

      const result = await processOk(surveyId, {
        farm: { mode: 'link', farmId: existingFarmId },
      });
      expect((await farmerRow(result.farmer.id)).farm_id).toBe(existingFarmId);
      expect(
        await count(
          `SELECT COUNT(*)::text AS n FROM farms WHERE name ILIKE $1`,
          [`%arboleda ${RUN}`],
        ),
      ).toBe(farmsBefore);
      // El nombre guardado de la finca existente no cambia.
      expect((await farmRow(existingFarmId)).name).toBe(sharedName);
    });

    it('otro envío pendiente con la misma finca y vereda aparece como candidato', async () => {
      const pendingName = `Spec93 Finca Compartida ${RUN}`;
      const first = await submit(
        workshop('C10c', {
          name: 'Spec93 Vecina Cedro Uno',
          farmName: pendingName,
          vereda: 'El Cedro',
        }),
      );
      const second = await submit(
        workshop('C10d', {
          name: 'Spec93 Vecino Pino Dos',
          farmName: pendingName.toLowerCase(),
          vereda: 'el cedro',
        }),
      );
      const p = await preview(second);
      expect(
        p.farm.sharedCandidates
          .filter((c) => c.source === 'pending_submission')
          .map((c) => c.surveyId),
      ).toContain(first);
    });
  });

  // ═════════════════════════════════════════════════════════════════════════
  // C11 — área en hectáreas
  // ═════════════════════════════════════════════════════════════════════════

  describe('C11 — farm.area se guarda en hectáreas; unidad desconocida → NULL + advertencia', () => {
    it.each([
      ['m²', 25_000, 2.5],
      ['km²', 0.5, 50],
      ['ha', 3, 3],
    ] as const)('%s: %d → %d ha', async (unit, value, hectares) => {
      const surveyId = await submit(
        workshop(`C11${unit === 'm²' ? 'm2' : unit === 'km²' ? 'km2' : 'ha'}`, {
          area: { value, unit },
        }),
      );
      if (unit !== 'ha') {
        expect(warningCodes(await preview(surveyId))).toContain(
          'area_converted',
        );
      }
      await processOk(surveyId);
      const farm = await farmRow(await farmOfSurvey(surveyId));
      expect(farm.area).toBeCloseTo(hectares, 6);
    });

    it('unidad desconocida (fanegada) → area NULL y advertencia area_unit_unknown', async () => {
      const surveyId = await submit(
        workshop('C11fan', { area: { value: 2, unit: 'fanegada' } }),
      );
      expect(warningCodes(await preview(surveyId))).toContain(
        'area_unit_unknown',
      );
      await processOk(surveyId);
      expect((await farmRow(await farmOfSurvey(surveyId))).area).toBeNull();
    });
  });

  // ═════════════════════════════════════════════════════════════════════════
  // C12 — municipio indicado por el administrador
  // ═════════════════════════════════════════════════════════════════════════

  describe('C12 — townId del administrador se asigna a la finca cuando el envío no trae municipio', () => {
    it('envío sin departamento ni municipio + townId → farms.town_id = townId', async () => {
      const surveyId = await submit(
        workshop('C12', { department: null, town: null }),
      );
      await processOk(surveyId, { townId: townB.townId });
      expect((await farmRow(await farmOfSurvey(surveyId))).town_id).toBe(
        townB.townId,
      );
    });

    it('sin townId la finca queda sin municipio (y la vista previa lo advierte)', async () => {
      const surveyId = await submit(
        workshop('C12b', { department: null, town: null }),
      );
      expect(warningCodes(await preview(surveyId))).toContain('missing_town');
      await processOk(surveyId);
      expect((await farmRow(await farmOfSurvey(surveyId))).town_id).toBeNull();
    });
  });

  // ═════════════════════════════════════════════════════════════════════════
  // C13 — advertencias de la vista previa
  // ═════════════════════════════════════════════════════════════════════════

  describe('C13 — la vista previa advierte perfil no productor, falta de municipio, truncado y documento repetido', () => {
    it('respondent_not_producer para Extensionista/Técnico; no para Propietario', async () => {
      const ext = await submit(
        workshop('C13ext', { profile: ['Extensionista/Técnico'] }),
      );
      expect(warningCodes(await preview(ext))).toContain(
        'respondent_not_producer',
      );

      const owner = await submit(
        workshop('C13own', { profile: ['Propietario'] }),
      );
      expect(warningCodes(await preview(owner))).not.toContain(
        'respondent_not_producer',
      );
    });

    it('missing_town cuando el envío no trae municipio', async () => {
      const surveyId = await submit(
        workshop('C13town', { department: null, town: null }),
      );
      expect(warningCodes(await preview(surveyId))).toContain('missing_town');
    });

    it('multi_value_truncated cuando la selección múltiple concatenada pasa de 100 caracteres', async () => {
      const surveyId = await submit(
        workshop('C13multi', {
          access: [...LONG_ACCESS],
          water: ['Nacimiento', 'Acueducto veredal'],
        }),
      );
      expect(warningCodes(await preview(surveyId))).toContain(
        'multi_value_truncated',
      );

      await processOk(surveyId);
      const farm = await farmRow(await farmOfSurvey(surveyId));
      // D-H2-9: textos ordenados, unidos con «; », con tope de 100.
      expect(farm.main_access_type).not.toBeNull();
      expect(farm.main_access_type!.length).toBeLessThanOrEqual(100);
      const sortedAccess = [...LONG_ACCESS].sort((a, b) => a.localeCompare(b));
      expect(farm.main_access_type!.startsWith(sortedAccess[0])).toBe(true);
      expect(farm.water_source_type).toBe('Acueducto veredal; Nacimiento');
    });

    it('duplicate_document_in_pending cuando otro envío pendiente trae el mismo documento', async () => {
      const doc = newDoc();
      const first = await submit(
        workshop('C13dup1', { name: 'Spec93 Rosa Mejia Tobon', document: doc }),
      );
      const second = await submit(
        workshop('C13dup2', { name: 'Spec93 Rosa Mejia', document: doc }),
      );
      expect(warningCodes(await preview(first))).toContain(
        'duplicate_document_in_pending',
      );
      expect(warningCodes(await preview(second))).toContain(
        'duplicate_document_in_pending',
      );
    });

    it('un envío completo y limpio no trae ninguna de esas advertencias', async () => {
      const surveyId = await submit(workshop('C13clean'));
      const codes = warningCodes(await preview(surveyId));
      for (const code of [
        'respondent_not_producer',
        'missing_town',
        'multi_value_truncated',
        'duplicate_document_in_pending',
        'area_unit_unknown',
      ]) {
        expect(codes).not.toContain(code);
      }
    });
  });

  // ═════════════════════════════════════════════════════════════════════════
  // C17 — Departamento y Municipio en el formulario público
  // ═════════════════════════════════════════════════════════════════════════

  describe('C17 — Municipio se filtra por Departamento en el formulario público y ambos llegan a la finca', () => {
    it('el render público expone el departamento de cada municipio (base del filtro)', async () => {
      const res = await http()
        .get(`/api/public/surveys/${instrumentId}`)
        .expect(200);
      const questions = (res.body as RenderedInstrument).sections.flatMap(
        (s) => s.questions,
      );
      const dept = questions.find((x) => x.systemField === 'farm.department');
      const town = questions.find(
        (x) => x.systemField === 'farm.town' && x.questionId === q.town,
      );
      expect(dept?.options.map((o) => o.metadataId).sort()).toEqual(
        [townA.departmentId, townB.departmentId].sort(),
      );
      const byTown = new Map(
        (town?.options ?? []).map((o) => [o.metadataId, o.departmentId]),
      );
      expect(byTown.get(townA.townId)).toBe(townA.departmentId);
      expect(byTown.get(townB.townId)).toBe(townB.departmentId);
    });

    it('procesar un envío con Departamento B y Municipio B deja la finca en ese municipio y departamento', async () => {
      const surveyId = await submit(
        workshop('C17', { department: 'B', town: 'B' }),
      );
      expect(warningCodes(await preview(surveyId))).not.toContain(
        'missing_town',
      );
      await processOk(surveyId);
      const farm = await farmRow(await farmOfSurvey(surveyId));
      expect(farm.town_id).toBe(townB.townId);
      const dept = await ds.query<{ department_id: string }[]>(
        `SELECT department_id FROM towns WHERE town_id = $1`,
        [farm.town_id],
      );
      expect(dept[0].department_id).toBe(townB.departmentId);
    });
  });
});
