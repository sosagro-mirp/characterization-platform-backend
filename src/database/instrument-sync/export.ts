import { Queryable, resolveMetadataByIds } from './metadata';
import { contentHash } from './hash';
import {
  InstrumentManifest,
  ManifestInstrument,
  ManifestOption,
  ManifestQuestion,
  ManifestSection,
} from './types';

interface InstrumentRow {
  instrument_id: string;
  name: string;
  version: number;
  publish_date: string | Date;
  is_active: boolean;
  is_public: boolean;
  code: string | null;
}

interface SectionRow {
  section_id: string;
  instrument_id: string;
  name: string;
  order: number;
}

interface QuestionRow {
  question_id: string;
  section_id: string;
  text: string;
  type_name: string;
  is_required: boolean;
  is_selection_criteria: boolean;
  is_key_question: boolean;
  order: number;
  system_field: string | null;
  condition_question_id: string | null;
  condition_value: string | null;
  archived_at: string | null;
}

interface OptionRow {
  option_id: string;
  question_id: string;
  text: string;
  value: number | null;
  is_other: boolean;
  metadata_id: string | null;
  archived_at: string | null;
  origin: string;
}

/** ¿Existe la columna en el entorno conectado? Interpolar su nombre en SQL es seguro: ambos argumentos son literales de este módulo, nunca entrada del usuario. */
async function hasColumn(
  ds: Queryable,
  table: string,
  column: string,
): Promise<boolean> {
  const rows = await ds.query<{ exists: string }[]>(
    `SELECT column_name AS exists FROM information_schema.columns
      WHERE table_name = $1 AND column_name = $2 LIMIT 1`,
    [table, column],
  );
  return rows.length > 0;
}

/**
 * Spec 84, Fase 3 — exporta instrumentos completos (secciones → preguntas →
 * opciones) a un manifiesto portable entre entornos. Solo lectura: no
 * modifica nada. Sin datos personales — no toca `responses.text_value` ni
 * ninguna tabla de agricultores; solo cuenta respuestas (`responseCount`).
 *
 * `instrumentIds` filtra el alcance; sin él, exporta todos los instrumentos.
 */
export async function exportManifest(
  ds: Queryable,
  opts: { instrumentIds?: string[] } = {},
): Promise<InstrumentManifest> {
  const instrumentFilter = opts.instrumentIds;

  const instrumentRows = await ds.query<InstrumentRow[]>(
    instrumentFilter
      ? `SELECT instrument_id, name, version, publish_date, is_active, is_public, code
         FROM instruments WHERE instrument_id = ANY($1::uuid[]) ORDER BY name`
      : `SELECT instrument_id, name, version, publish_date, is_active, is_public, code
         FROM instruments ORDER BY name`,
    instrumentFilter ? [instrumentFilter] : [],
  );
  const instrumentIds = instrumentRows.map((r) => r.instrument_id);
  if (instrumentIds.length === 0) {
    return {
      formatVersion: 1,
      exportedAt: new Date().toISOString(),
      instruments: [],
    };
  }

  const actorTypeRows = await ds.query<
    { instrument_id: string; name: string }[]
  >(
    `SELECT ita.instrument_id, at.name
     FROM instruments_actor_types ita
     JOIN actor_type at ON at.actor_type_id = ita.actor_type_id
     WHERE ita.instrument_id = ANY($1::uuid[])`,
    [instrumentIds],
  );
  const actorTypesByInstrument = new Map<string, string[]>();
  for (const row of actorTypeRows) {
    const list = actorTypesByInstrument.get(row.instrument_id) ?? [];
    list.push(row.name);
    actorTypesByInstrument.set(row.instrument_id, list);
  }

  const sectionRows = await ds.query<SectionRow[]>(
    `SELECT section_id, instrument_id, name, "order"
     FROM sections WHERE instrument_id = ANY($1::uuid[]) ORDER BY "order"`,
    [instrumentIds],
  );
  const sectionIds = sectionRows.map((r) => r.section_id);

  // `archived_at` lo agrega la migración de la Fase 1, que no está corrida en
  // todos los entornos: producción se exporta en solo lectura ANTES de
  // migrarla (Fase 7), así que donde la columna no exista se exporta `null`
  // — que es su valor real: sin columna no hay nada archivado.
  const questionArchivedAt = (await hasColumn(ds, 'questions', 'archived_at'))
    ? archivedAtSelect('q.archived_at')
    : 'NULL::text AS archived_at';
  const optionArchivedAt = (await hasColumn(
    ds,
    'options_question',
    'archived_at',
  ))
    ? archivedAtSelect('archived_at')
    : 'NULL::text AS archived_at';
  // Spec 86 — mismo criterio: sin la columna, todas son del instrumento.
  const optionOrigin = (await hasColumn(ds, 'options_question', 'origin'))
    ? 'origin'
    : "'instrument'::text AS origin";

  const questionRows = sectionIds.length
    ? await ds.query<QuestionRow[]>(
        `SELECT q.question_id, q.section_id, q.text, t.name AS type_name,
                q.is_required, q.is_selection_criteria, q.is_key_question,
                q."order", q.system_field, q.condition_question_id,
                q.condition_value, ${questionArchivedAt}
         FROM questions q
         JOIN types_of_questions t ON t.type_id = q.type_id
         WHERE q.section_id = ANY($1::uuid[]) ORDER BY q."order"`,
        [sectionIds],
      )
    : [];
  const questionIds = questionRows.map((r) => r.question_id);

  const optionRows = questionIds.length
    ? await ds.query<OptionRow[]>(
        `SELECT option_id, question_id, text, value, is_other, metadata_id, ${optionArchivedAt}, ${optionOrigin}
         FROM options_question WHERE question_id = ANY($1::uuid[]) ORDER BY created_at`,
        [questionIds],
      )
    : [];
  const optionIds = optionRows.map((r) => r.option_id);

  const questionResponseCounts = questionIds.length
    ? await ds.query<{ question_id: string; count: string }[]>(
        `SELECT question_id, COUNT(*)::text AS count FROM responses
         WHERE question_id = ANY($1::uuid[]) GROUP BY question_id`,
        [questionIds],
      )
    : [];
  const responseCountByQuestion = new Map(
    questionResponseCounts.map((r) => [r.question_id, Number(r.count)]),
  );

  const optionResponseCounts = optionIds.length
    ? await ds.query<{ option_id: string; count: string }[]>(
        `SELECT option_id, COUNT(*)::text AS count FROM responses
         WHERE option_id = ANY($1::uuid[]) GROUP BY option_id`,
        [optionIds],
      )
    : [];
  const responseCountByOption = new Map(
    optionResponseCounts.map((r) => [r.option_id, Number(r.count)]),
  );

  const metadataIds = [
    ...new Set(
      optionRows
        .map((r) => r.metadata_id)
        .filter((id): id is string => id !== null),
    ),
  ];
  const metadataByCatalogId = await resolveMetadataByIds(ds, metadataIds);

  const optionsByQuestion = new Map<string, ManifestOption[]>();
  for (const row of optionRows) {
    const metadata = row.metadata_id
      ? (metadataByCatalogId.get(row.metadata_id) ?? null)
      : null;
    const option: Omit<ManifestOption, 'hash'> = {
      optionId: row.option_id,
      text: row.text,
      value: row.value,
      isOther: row.is_other,
      metadata,
      archivedAt: row.archived_at,
      ...(row.origin === 'field' && { origin: 'field' as const }),
      responseCount: responseCountByOption.get(row.option_id) ?? 0,
    };
    const list = optionsByQuestion.get(row.question_id) ?? [];
    list.push({ ...option, hash: contentHash(option) });
    optionsByQuestion.set(row.question_id, list);
  }

  const questionsBySection = new Map<string, ManifestQuestion[]>();
  for (const row of questionRows) {
    const options = optionsByQuestion.get(row.question_id) ?? [];
    const question: Omit<ManifestQuestion, 'hash'> = {
      questionId: row.question_id,
      text: row.text,
      type: row.type_name,
      isRequired: row.is_required,
      isSelectionCriteria: row.is_selection_criteria,
      isKeyQuestion: row.is_key_question,
      order: row.order,
      systemField: row.system_field,
      conditionQuestionId: row.condition_question_id,
      conditionValue: row.condition_value,
      archivedAt: row.archived_at,
      responseCount: responseCountByQuestion.get(row.question_id) ?? 0,
      options,
    };
    const list = questionsBySection.get(row.section_id) ?? [];
    list.push({
      ...question,
      hash: contentHash({ ...question, options: undefined }),
    });
    questionsBySection.set(row.section_id, list);
  }

  const sectionsByInstrument = new Map<string, ManifestSection[]>();
  for (const row of sectionRows) {
    const section: ManifestSection = {
      sectionId: row.section_id,
      name: row.name,
      order: row.order,
      questions: questionsBySection.get(row.section_id) ?? [],
    };
    const list = sectionsByInstrument.get(row.instrument_id) ?? [];
    list.push(section);
    sectionsByInstrument.set(row.instrument_id, list);
  }

  const instruments: ManifestInstrument[] = instrumentRows.map((row) => {
    const actorTypes = (actorTypesByInstrument.get(row.instrument_id) ?? [])
      .slice()
      .sort();
    const base: Omit<ManifestInstrument, 'hash' | 'sections'> = {
      instrumentId: row.instrument_id,
      name: row.name,
      version: row.version,
      publishDate:
        row.publish_date instanceof Date
          ? row.publish_date.toISOString().slice(0, 10)
          : String(row.publish_date),
      isActive: row.is_active,
      isPublic: row.is_public,
      code: row.code,
      actorTypes,
    };
    return {
      ...base,
      hash: contentHash(base),
      sections: sectionsByInstrument.get(row.instrument_id) ?? [],
    };
  });

  return {
    formatVersion: 1,
    exportedAt: new Date().toISOString(),
    instruments,
  };
}

/**
 * Expresión SQL que exporta `archived_at` tal como está guardado.
 *
 * Spec 84 (TC-084-014, 2026-09-15) — la columna es `timestamp` sin zona. Si
 * se deja que `pg` la convierta a `Date`, la interpreta con la zona del
 * proceso y el JSON sale con `Z`; al escribirla en otra base se pierde la
 * zona y el valor queda corrido (5 horas entre desarrollo y Neon). Exportarla
 * como texto sin zona conserva exactamente el mismo valor en cualquier base.
 */
export function archivedAtSelect(column: string): string {
  return `to_char(${column}, 'YYYY-MM-DD"T"HH24:MI:SS.US') AS archived_at`;
}
