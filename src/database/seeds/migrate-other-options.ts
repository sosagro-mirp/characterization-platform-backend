import { DataSource, QueryRunner } from 'typeorm';

/**
 * Spec 86 — Fase 4: migración de las opciones "Otros" dinámicas legadas.
 *
 * Hasta el spec 86, al responder "Otros" + texto, la web y el móvil creaban
 * una opción nueva en la pregunta (`POST /questions/:id/options`) y
 * respondían con ella. Este módulo:
 *
 *   1. `detectLegacyOtherOptions` — lista las candidatas para revisión humana.
 *      No existe una marca de origen fiable, así que la detección es
 *      heurística y SIEMPRE requiere que el usuario revise la lista:
 *        - pregunta `single_choice` / `multiple_choice` con una opción "Otros";
 *        - la opción no es "Otros", no tiene `value` ni `metadata_id`;
 *        - fue creada DESPUÉS de la opción "Otros" de su pregunta (las
 *          opciones del instrumento se crean antes o en el mismo lote);
 *        - no está ya marcada `origin = 'field'`.
 *      Cada candidata trae datos para la revisión (respuestas, minutos entre
 *      la creación de la opción y su primera respuesta).
 *
 *   2. `migrateLegacyOtherOptions` — sobre la lista aprobada, en una sola
 *      transacción: mueve las respuestas a la opción "Otros" con el texto de
 *      la opción en `text_value`, marca la opción `origin = 'field'` y la
 *      archiva; las opciones sin respuestas se borran. Con `apply: false`
 *      hace lo mismo y ROLLBACK (simulación).
 *
 * Conflictos que se reportan sin tocar nada de esa opción:
 *   - `not_found`                 — la opción no existe.
 *   - `is_other_option`           — es la propia opción "Otros".
 *   - `not_choice_question`       — la pregunta no es de selección.
 *   - `no_other_option`           — la pregunta no tiene opción "Otros".
 *   - `survey_already_has_other`  — alguna encuesta ya tiene una fila con la
 *                                   opción "Otros" en esa pregunta (incluye
 *                                   dos opciones dinámicas en la misma
 *                                   encuesta: la segunda cae aquí).
 *
 * Idempotente: una opción ya marcada `origin = 'field'` y archivada se omite.
 */

const CHOICE_TYPES = ['single_choice', 'multiple_choice'];

export interface LegacyOtherCandidate {
  optionId: string;
  questionId: string;
  otherOptionId: string;
  text: string;
  responseCount: number;
  instrumentId: string;
  instrumentName: string;
  questionText: string;
  optionCreatedAt: string;
  /** Minutos entre la creación de la opción y su primera respuesta (null si no tiene). */
  minutesToFirstResponse: number | null;
}

export type LegacyOtherConflictReason =
  | 'not_found'
  | 'is_other_option'
  | 'not_choice_question'
  | 'no_other_option'
  | 'survey_already_has_other';

export interface LegacyOtherMigrationReport {
  apply: boolean;
  migratedResponses: number;
  archivedOptionIds: string[];
  deletedOptionIds: string[];
  skippedAlreadyMigrated: string[];
  conflicts: { optionId: string; reason: LegacyOtherConflictReason }[];
}

interface CandidateRow {
  option_id: string;
  question_id: string;
  other_option_id: string;
  text: string;
  response_count: number;
  instrument_id: string;
  instrument_name: string;
  question_text: string;
  option_created_at: string;
  minutes_to_first_response: string | null;
}

export async function detectLegacyOtherOptions(
  ds: DataSource,
  opts: { instrumentIds?: string[] } = {},
): Promise<LegacyOtherCandidate[]> {
  const rows = await ds.query<CandidateRow[]>(
    `SELECT o.option_id, o.question_id, other.option_id AS other_option_id, o.text,
            (SELECT COUNT(*) FROM responses r WHERE r.option_id = o.option_id)::int AS response_count,
            i.instrument_id, i.name AS instrument_name, q.text AS question_text,
            o.created_at::text AS option_created_at,
            ROUND(EXTRACT(EPOCH FROM (
              (SELECT MIN(r.created_at) FROM responses r WHERE r.option_id = o.option_id)
              - o.created_at)) / 60)::text AS minutes_to_first_response
     FROM options_question o
     JOIN questions q ON q.question_id = o.question_id
     JOIN types_of_questions t ON t.type_id = q.type_id
     JOIN sections s ON s.section_id = q.section_id
     JOIN instruments i ON i.instrument_id = s.instrument_id
     JOIN options_question other
       ON other.question_id = o.question_id AND other.is_other = true
     WHERE t.name = ANY($1::text[])
       AND o.is_other = false
       AND o.value IS NULL
       AND o.metadata_id IS NULL
       AND o.origin <> 'field'
       AND o.created_at > other.created_at
       AND ($2::uuid[] IS NULL OR i.instrument_id = ANY($2::uuid[]))
     ORDER BY i.name, q."order", o.created_at`,
    [CHOICE_TYPES, opts.instrumentIds?.length ? opts.instrumentIds : null],
  );

  return rows.map((r) => ({
    optionId: r.option_id,
    questionId: r.question_id,
    otherOptionId: r.other_option_id,
    text: r.text,
    responseCount: Number(r.response_count),
    instrumentId: r.instrument_id,
    instrumentName: r.instrument_name,
    questionText: r.question_text,
    optionCreatedAt: r.option_created_at,
    minutesToFirstResponse:
      r.minutes_to_first_response === null
        ? null
        : Number(r.minutes_to_first_response),
  }));
}

interface OptionRow {
  option_id: string;
  question_id: string;
  text: string;
  is_other: boolean;
  origin: string;
  archived_at: string | null;
  type_name: string;
}

export async function migrateLegacyOtherOptions(
  ds: DataSource,
  opts: { optionIds: string[]; apply: boolean },
): Promise<LegacyOtherMigrationReport> {
  const report: LegacyOtherMigrationReport = {
    apply: opts.apply,
    migratedResponses: 0,
    archivedOptionIds: [],
    deletedOptionIds: [],
    skippedAlreadyMigrated: [],
    conflicts: [],
  };

  const runner = ds.createQueryRunner();
  await runner.connect();
  await runner.startTransaction();
  try {
    for (const optionId of [...new Set(opts.optionIds)]) {
      await migrateOne(runner, optionId, report);
    }
    if (opts.apply) {
      await runner.commitTransaction();
    } else {
      await runner.rollbackTransaction();
    }
  } catch (error) {
    await runner.rollbackTransaction();
    throw error;
  } finally {
    await runner.release();
  }

  return report;
}

async function migrateOne(
  runner: QueryRunner,
  optionId: string,
  report: LegacyOtherMigrationReport,
): Promise<void> {
  const conflict = (reason: LegacyOtherConflictReason): void => {
    report.conflicts.push({ optionId, reason });
  };

  const [option] = (await runner.query(
    `SELECT o.option_id, o.question_id, o.text, o.is_other, o.origin,
            o.archived_at::text AS archived_at, t.name AS type_name
     FROM options_question o
     JOIN questions q ON q.question_id = o.question_id
     JOIN types_of_questions t ON t.type_id = q.type_id
     WHERE o.option_id = $1`,
    [optionId],
  )) as OptionRow[];

  if (!option) return conflict('not_found');
  if (option.origin === 'field' && option.archived_at !== null) {
    report.skippedAlreadyMigrated.push(optionId);
    return;
  }
  if (option.is_other) return conflict('is_other_option');
  if (!CHOICE_TYPES.includes(option.type_name)) {
    return conflict('not_choice_question');
  }

  const [other] = (await runner.query(
    `SELECT option_id FROM options_question
     WHERE question_id = $1 AND is_other = true LIMIT 1`,
    [option.question_id],
  )) as { option_id: string }[];
  if (!other) return conflict('no_other_option');

  const [clash] = (await runner.query(
    `SELECT 1 FROM responses r
     WHERE r.question_id = $1 AND r.option_id = $2
       AND r.survey_id IN (SELECT survey_id FROM responses WHERE option_id = $3)
     LIMIT 1`,
    [option.question_id, other.option_id, optionId],
  )) as unknown[];
  if (clash) return conflict('survey_already_has_other');

  const [{ count }] = (await runner.query(
    `SELECT COUNT(*)::int AS count FROM responses WHERE option_id = $1`,
    [optionId],
  )) as { count: number }[];

  if (Number(count) === 0) {
    await runner.query(`DELETE FROM options_question WHERE option_id = $1`, [
      optionId,
    ]);
    report.deletedOptionIds.push(optionId);
    return;
  }

  await runner.query(
    `UPDATE responses
     SET option_id = $1, text_value = COALESCE(text_value, $2), updated_at = now()
     WHERE option_id = $3`,
    [other.option_id, option.text.trim(), optionId],
  );
  await runner.query(
    `UPDATE options_question
     SET origin = 'field', archived_at = now(), updated_at = now()
     WHERE option_id = $1`,
    [optionId],
  );
  report.migratedResponses += Number(count);
  report.archivedOptionIds.push(optionId);
}
