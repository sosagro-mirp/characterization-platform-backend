/**
 * Spec 77 — Duplicación de instrumentos completos y copia de preguntas entre
 * instrumentos.
 *
 * ESTAS PRUEBAS NACEN EN ROJO: `POST /api/instruments/:id/duplicate` y
 * `POST /api/sections/:sectionId/questions/copy` no existen todavía (los crean
 * las fases 1 y 2 del spec).
 *
 * Lo que se verifica aquí no es "que copie", sino las tres cosas que hacen
 * segura una copia estructural:
 *   1. La copia es completa y profunda (secciones → preguntas → opciones) y no
 *      comparte ningún identificador con el original.
 *   2. Las condiciones de visibilidad internas se REMAPEAN a las preguntas
 *      copiadas. Si B' siguiera apuntando a la A del original, borrar el
 *      original rompería la copia en silencio.
 *   3. La copia nunca hereda `code` ni `isActive`: heredar `code` violaría el
 *      índice único y convertiría una copia en un instrumento del sistema.
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
const PREFIX = 'e2e-077';

interface LoginResponse {
  accessToken: string;
}

interface RoleRow {
  role_id: string;
  name: string;
}

interface OptionPayload {
  optionId: string;
  text: string;
  value: number | null;
  isOther: boolean;
  metadataId: string | null;
}

interface QuestionPayload {
  questionId: string;
  text: string;
  order: number;
  isRequired: boolean;
  isSelectionCriteria: boolean;
  isKeyQuestion: boolean;
  systemField: string | null;
  conditionQuestionId: string | null;
  conditionValue: string | null;
  type: { typeId: string; name: string };
  options: OptionPayload[];
}

interface SectionPayload {
  sectionId: string;
  name: string;
  order: number;
  questions: QuestionPayload[];
}

interface RenderPayload {
  instrumentId: string;
  sections: SectionPayload[];
}

interface InstrumentPayload {
  instrumentId: string;
  name: string;
  version: number;
  isActive: boolean;
  code: string | null;
  actorTypes: { actorTypeId: string; name: string }[];
}

interface CopyQuestionPayload {
  question: QuestionPayload;
  droppedCondition: boolean;
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

describe('spec-077 — duplicación de instrumentos y copia de preguntas (e2e)', () => {
  let app: INestApplication<App>;
  let ds: DataSource;

  let adminToken: string;
  let pollsterToken: string;

  // Instrumento origen: 2 secciones, 5 preguntas, condición cruzada entre
  // secciones (B1 depende de A1, que vive en la sección anterior).
  let sourceInstrumentId: string;
  let sectionAId: string;
  let sectionBId: string;
  let qA1Id: string; // single_choice, 4 opciones, isKeyQuestion
  let qA2Id: string; // open_text con systemField
  let qA3Id: string; // multiple_choice, 3 opciones (una isOther, una metadataId)
  let qB1Id: string; // condicionada por A1
  let actorTypeId: string;

  // Instrumento destino de las copias de pregunta: 1 sección vacía.
  let targetInstrumentId: string;
  let targetSectionId: string;

  const instrumentIdsCreated: string[] = [];

  async function typeIdOf(name: string): Promise<string> {
    const rows = await ds.query<{ type_id: string }[]>(
      `SELECT type_id FROM types_of_questions WHERE name = $1`,
      [name],
    );
    return rows[0].type_id;
  }

  async function insertInstrument(name: string): Promise<string> {
    const rows = await ds.query<{ instrument_id: string }[]>(
      `INSERT INTO instruments (instrument_id, name, version, publish_date, is_active)
       VALUES (gen_random_uuid(), $1, 1, CURRENT_DATE, true)
       RETURNING instrument_id`,
      [name],
    );
    instrumentIdsCreated.push(rows[0].instrument_id);
    return rows[0].instrument_id;
  }

  async function insertSection(
    instrumentId: string,
    name: string,
    order: number,
  ): Promise<string> {
    const rows = await ds.query<{ section_id: string }[]>(
      `INSERT INTO sections (section_id, name, "order", instrument_id)
       VALUES (gen_random_uuid(), $1, $2, $3)
       RETURNING section_id`,
      [name, order, instrumentId],
    );
    return rows[0].section_id;
  }

  async function insertQuestion(
    sectionId: string,
    text: string,
    typeName: string,
    order: number,
    extra: {
      isKeyQuestion?: boolean;
      isSelectionCriteria?: boolean;
      systemField?: string;
      conditionQuestionId?: string;
      conditionValue?: string;
    } = {},
  ): Promise<string> {
    const rows = await ds.query<{ question_id: string }[]>(
      `INSERT INTO questions
         (question_id, section_id, text, type_id, is_required, is_selection_criteria,
          is_key_question, "order", system_field, condition_question_id, condition_value)
       VALUES (gen_random_uuid(), $1, $2, $3, true, $4, $5, $6, $7, $8, $9)
       RETURNING question_id`,
      [
        sectionId,
        text,
        await typeIdOf(typeName),
        extra.isSelectionCriteria ?? false,
        extra.isKeyQuestion ?? false,
        order,
        extra.systemField ?? null,
        extra.conditionQuestionId ?? null,
        extra.conditionValue ?? null,
      ],
    );
    return rows[0].question_id;
  }

  async function insertOption(
    questionId: string,
    text: string,
    opts: { value?: number; isOther?: boolean; metadataId?: string } = {},
  ): Promise<void> {
    await ds.query(
      `INSERT INTO options_question (option_id, question_id, text, value, is_other, metadata_id)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5)`,
      [
        questionId,
        text,
        opts.value ?? null,
        opts.isOther ?? false,
        opts.metadataId ?? null,
      ],
    );
  }

  async function render(instrumentId: string): Promise<RenderPayload> {
    const res = await request(app.getHttpServer())
      .get(`/api/instruments/${instrumentId}/render`)
      .expect(200);
    return res.body as RenderPayload;
  }

  function sectionsSorted(payload: RenderPayload): SectionPayload[] {
    return [...payload.sections].sort((a, b) => a.order - b.order);
  }

  function questionsSorted(section: SectionPayload): QuestionPayload[] {
    return [...section.questions].sort((a, b) => a.order - b.order);
  }

  function duplicate(
    instrumentId: string,
    body: Record<string, unknown>,
    token: string,
  ) {
    return request(app.getHttpServer())
      .post(`/api/instruments/${instrumentId}/duplicate`)
      .set('Authorization', `Bearer ${token}`)
      .send(body);
  }

  function copyQuestion(
    targetSection: string,
    sourceQuestionId: string,
    token: string,
  ) {
    return request(app.getHttpServer())
      .post(`/api/sections/${targetSection}/questions/copy`)
      .set('Authorization', `Bearer ${token}`)
      .send({ sourceQuestionId });
  }

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

    // ── usuarios (admin duplica · pollster no debe poder) ────────────────────
    const roles = await ds.query<RoleRow[]>(
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
           VALUES (gen_random_uuid(), 'E2E', 'Duplicate077', $1, $2, $3, false)`,
          [email, hash, roleId(role)],
        );
      }
    }
    adminToken = await loginAs(app, testEmail('admin'));
    pollsterToken = await loginAs(app, testEmail('pollster'));

    // ── instrumento origen ───────────────────────────────────────────────────
    sourceInstrumentId = await insertInstrument('E2E 077 Origen');

    const actorRows = await ds.query<{ actor_type_id: string }[]>(
      `SELECT actor_type_id FROM actor_type LIMIT 1`,
    );
    actorTypeId = actorRows[0].actor_type_id;
    await ds.query(
      `INSERT INTO instruments_actor_types (instrument_id, actor_type_id) VALUES ($1, $2)`,
      [sourceInstrumentId, actorTypeId],
    );

    sectionAId = await insertSection(
      sourceInstrumentId,
      'E2E 077 Sección A',
      1,
    );
    sectionBId = await insertSection(
      sourceInstrumentId,
      'E2E 077 Sección B',
      2,
    );

    qA1Id = await insertQuestion(sectionAId, 'E2E 077 A1', 'single_choice', 1, {
      isKeyQuestion: true,
      isSelectionCriteria: true,
    });
    await insertOption(qA1Id, 'Opción 1', { value: 1 });
    await insertOption(qA1Id, 'Opción 2', { value: 2 });
    await insertOption(qA1Id, 'Opción 3', { value: 3 });
    await insertOption(qA1Id, 'Opción 4', { value: 4 });

    qA2Id = await insertQuestion(sectionAId, 'E2E 077 A2', 'open_text', 2, {
      systemField: 'farmer.name',
    });

    qA3Id = await insertQuestion(
      sectionAId,
      'E2E 077 A3',
      'multiple_choice',
      3,
    );
    const townRows = await ds.query<{ town_id: string }[]>(
      `SELECT town_id FROM towns LIMIT 1`,
    );
    await insertOption(qA3Id, 'Múltiple 1', {
      metadataId: townRows[0].town_id,
    });
    await insertOption(qA3Id, 'Múltiple 2');
    await insertOption(qA3Id, 'Otro', { isOther: true });

    // La condición cruza secciones a propósito: al copiar, A1' todavía no
    // existe cuando se inserta B1', así que el remapeo obliga a una segunda
    // pasada. Es el caso que más fácilmente se implementa mal.
    qB1Id = await insertQuestion(sectionBId, 'E2E 077 B1', 'open_text', 1, {
      conditionQuestionId: qA1Id,
      conditionValue: 'Opción 1',
    });
    await insertQuestion(sectionBId, 'E2E 077 B2', 'numeric', 2);

    // ── instrumento destino ──────────────────────────────────────────────────
    targetInstrumentId = await insertInstrument('E2E 077 Destino');
    targetSectionId = await insertSection(
      targetInstrumentId,
      'E2E 077 Sección Destino',
      1,
    );
  });

  afterAll(async () => {
    // El borrado en cascada de instruments → sections → questions → options
    // está garantizado por las FK (onDelete: CASCADE) de las entidades.
    for (const id of instrumentIdsCreated) {
      await ds.query(
        `DELETE FROM instruments_actor_types WHERE instrument_id = $1`,
        [id],
      );
      await ds.query(`DELETE FROM instruments WHERE instrument_id = $1`, [id]);
    }
    await ds.query(`DELETE FROM users WHERE email LIKE $1`, [`${PREFIX}-%`]);
    await app.close();
  });

  // ── Duplicación de instrumento ────────────────────────────────────────────

  describe('POST /api/instruments/:id/duplicate', () => {
    let copyId: string;
    let sourceRender: RenderPayload;
    let copyRender: RenderPayload;

    beforeAll(async () => {
      sourceRender = await render(sourceInstrumentId);

      const res = await duplicate(
        sourceInstrumentId,
        { name: 'E2E 077 Origen (copia)', version: 2 },
        adminToken,
      ).expect(201);

      const body = res.body as InstrumentPayload;
      copyId = body.instrumentId;
      instrumentIdsCreated.push(copyId);
      copyRender = await render(copyId);
    });

    it('crea un instrumento nuevo con el nombre y la versión enviados (AC-1)', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/instruments/${copyId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const body = res.body as InstrumentPayload;
      expect(body.name).toBe('E2E 077 Origen (copia)');
      expect(body.version).toBe(2);
      expect(body.instrumentId).not.toBe(sourceInstrumentId);
    });

    it('copia todas las secciones, preguntas y opciones (AC-2)', () => {
      const src = sectionsSorted(sourceRender);
      const cop = sectionsSorted(copyRender);

      expect(cop).toHaveLength(src.length);
      cop.forEach((section, i) => {
        expect(section.name).toBe(src[i].name);
        expect(section.order).toBe(src[i].order);

        const srcQs = questionsSorted(src[i]);
        const copQs = questionsSorted(section);
        expect(copQs).toHaveLength(srcQs.length);

        copQs.forEach((q, j) => {
          expect(q.text).toBe(srcQs[j].text);
          expect(q.order).toBe(srcQs[j].order);
          expect(q.type.name).toBe(srcQs[j].type.name);
          expect(q.isRequired).toBe(srcQs[j].isRequired);
          expect(q.isSelectionCriteria).toBe(srcQs[j].isSelectionCriteria);
          expect(q.isKeyQuestion).toBe(srcQs[j].isKeyQuestion);
          expect(q.options).toHaveLength(srcQs[j].options.length);
        });
      });
    });

    it('conserva systemField, isOther y metadataId de las opciones (AC-3)', () => {
      const copQuestions = sectionsSorted(copyRender).flatMap((s) =>
        questionsSorted(s),
      );

      const a2 = copQuestions.find((q) => q.text === 'E2E 077 A2')!;
      expect(a2.systemField).toBe('farmer.name');

      const a3 = copQuestions.find((q) => q.text === 'E2E 077 A3')!;
      expect(a3.options.filter((o) => o.isOther)).toHaveLength(1);
      expect(a3.options.filter((o) => o.metadataId !== null)).toHaveLength(1);

      const srcA3 = sectionsSorted(sourceRender)
        .flatMap((s) => s.questions)
        .find((q) => q.text === 'E2E 077 A3')!;
      const srcMetadata = srcA3.options.find((o) => o.metadataId !== null)!;
      const copMetadata = a3.options.find((o) => o.metadataId !== null)!;
      expect(copMetadata.metadataId).toBe(srcMetadata.metadataId);
    });

    it('conserva los tipos de actor del original (AC-3)', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/instruments/${copyId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const body = res.body as InstrumentPayload;
      expect(body.actorTypes.map((a) => a.actorTypeId)).toContain(actorTypeId);
    });

    it('remapea la condición de visibilidad a la pregunta copiada (AC-4)', () => {
      const copQuestions = sectionsSorted(copyRender).flatMap((s) =>
        questionsSorted(s),
      );
      const copA1 = copQuestions.find((q) => q.text === 'E2E 077 A1')!;
      const copB1 = copQuestions.find((q) => q.text === 'E2E 077 B1')!;

      expect(copB1.conditionQuestionId).toBe(copA1.questionId);
      expect(copB1.conditionQuestionId).not.toBe(qA1Id);
      expect(copB1.conditionValue).toBe('Opción 1');
    });

    it('crea la copia inactiva y sin código de sistema (AC-5)', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/instruments/${copyId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const body = res.body as InstrumentPayload;
      expect(body.isActive).toBe(false);
      expect(body.code ?? null).toBeNull();
    });

    it('no comparte ningún identificador con el original (AC-6)', () => {
      const ids = (payload: RenderPayload) => {
        const out: string[] = [payload.instrumentId];
        for (const section of payload.sections) {
          out.push(section.sectionId);
          for (const q of section.questions) {
            out.push(q.questionId);
            out.push(...q.options.map((o) => o.optionId));
          }
        }
        return out;
      };

      const shared = ids(copyRender).filter((id) =>
        ids(sourceRender).includes(id),
      );
      expect(shared).toEqual([]);
    });

    it('deja el instrumento original intacto (AC-7)', async () => {
      const after = await render(sourceInstrumentId);
      expect(JSON.stringify(sectionsSorted(after))).toBe(
        JSON.stringify(sectionsSorted(sourceRender)),
      );
    });

    it('no crea nada si el instrumento origen no existe (AC-8)', async () => {
      // Comparar un COUNT(*) global sería inestable: otras suites e2e corren
      // en paralelo contra esta misma base de desarrollo e insertan
      // instrumentos propios. En su lugar, se verifica que el nombre
      // exclusivo de este intento nunca llegó a existir.
      await duplicate(
        '00000000-0000-4000-8000-000000000000',
        { name: 'E2E 077 Inexistente', version: 1 },
        adminToken,
      ).expect(404);

      const created = await ds.query<{ instrument_id: string }[]>(
        `SELECT instrument_id FROM instruments WHERE name = $1`,
        ['E2E 077 Inexistente'],
      );
      expect(created).toHaveLength(0);
    });

    it('rechaza la duplicación para un encuestador (AC-9)', async () => {
      await duplicate(
        sourceInstrumentId,
        { name: 'E2E 077 Prohibida', version: 1 },
        pollsterToken,
      ).expect(403);
    });
  });

  // ── Copia de pregunta entre instrumentos ──────────────────────────────────

  describe('POST /api/sections/:sectionId/questions/copy', () => {
    it('copia la pregunta con sus opciones al final de la sección destino (AC-10, AC-11)', async () => {
      const res = await copyQuestion(targetSectionId, qA3Id, adminToken).expect(
        201,
      );
      const body = res.body as CopyQuestionPayload;

      expect(body.question.questionId).not.toBe(qA3Id);
      expect(body.question.text).toBe('E2E 077 A3');
      expect(body.question.type.name).toBe('multiple_choice');

      const target = await render(targetInstrumentId);
      const section = sectionsSorted(target)[0];
      const copied = questionsSorted(section).at(-1)!;

      expect(copied.questionId).toBe(body.question.questionId);
      expect(copied.order).toBe(section.questions.length);
      expect(copied.options).toHaveLength(3);
      expect(copied.options.filter((o) => o.isOther)).toHaveLength(1);
    });

    it('conserva el systemField de la pregunta copiada (AC-11)', async () => {
      const res = await copyQuestion(targetSectionId, qA2Id, adminToken).expect(
        201,
      );
      const body = res.body as CopyQuestionPayload;
      expect(body.question.systemField).toBe('farmer.name');
    });

    it('descarta la condición de visibilidad y lo informa (AC-12)', async () => {
      const res = await copyQuestion(targetSectionId, qB1Id, adminToken).expect(
        201,
      );
      const body = res.body as CopyQuestionPayload;

      expect(body.droppedCondition).toBe(true);
      expect(body.question.conditionQuestionId).toBeNull();
      expect(body.question.conditionValue).toBeNull();
    });

    it('deja la pregunta original sin modificar (AC-13)', async () => {
      const source = await render(sourceInstrumentId);
      const original = source.sections
        .flatMap((s) => s.questions)
        .find((q) => q.questionId === qB1Id)!;

      expect(original.conditionQuestionId).toBe(qA1Id);
      expect(original.conditionValue).toBe('Opción 1');
    });

    it('copia dentro del mismo instrumento a otra sección (AC-10)', async () => {
      const res = await copyQuestion(sectionBId, qA1Id, adminToken).expect(201);
      const body = res.body as CopyQuestionPayload;

      const source = await render(sourceInstrumentId);
      const sectionB = sectionsSorted(source).find(
        (s) => s.sectionId === sectionBId,
      )!;
      const copied = questionsSorted(sectionB).at(-1)!;

      expect(copied.questionId).toBe(body.question.questionId);
      expect(copied.text).toBe('E2E 077 A1');
      expect(copied.options).toHaveLength(4);

      const sectionA = sectionsSorted(source).find(
        (s) => s.sectionId === sectionAId,
      )!;
      expect(sectionA.questions.some((q) => q.questionId === qA1Id)).toBe(true);
    });

    it('responde 404 y no crea nada si el origen no existe (AC-15)', async () => {
      const before = await ds.query<{ count: string }[]>(
        `SELECT COUNT(*)::text AS count FROM questions WHERE section_id = $1`,
        [targetSectionId],
      );

      await copyQuestion(
        targetSectionId,
        '00000000-0000-4000-8000-000000000000',
        adminToken,
      ).expect(404);

      const after = await ds.query<{ count: string }[]>(
        `SELECT COUNT(*)::text AS count FROM questions WHERE section_id = $1`,
        [targetSectionId],
      );
      expect(after[0].count).toBe(before[0].count);
    });

    it('responde 404 si la sección destino no existe (AC-15)', async () => {
      await copyQuestion(
        '00000000-0000-4000-8000-000000000000',
        qA1Id,
        adminToken,
      ).expect(404);
    });

    it('rechaza la copia para un encuestador', async () => {
      await copyQuestion(targetSectionId, qA1Id, pollsterToken).expect(403);
    });
  });
});
