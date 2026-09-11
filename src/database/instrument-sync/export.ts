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

  const questionRows = sectionIds.length
    ? await ds.query<QuestionRow[]>(
        `SELECT q.question_id, q.section_id, q.text, t.name AS type_name,
                q.is_required, q.is_selection_criteria, q.is_key_question,
                q."order", q.system_field, q.condition_question_id,
                q.condition_value, q.archived_at
         FROM questions q
         JOIN types_of_questions t ON t.type_id = q.type_id
         WHERE q.section_id = ANY($1::uuid[]) ORDER BY q."order"`,
        [sectionIds],
      )
    : [];
  const questionIds = questionRows.map((r) => r.question_id);

  const optionRows = questionIds.length
    ? await ds.query<OptionRow[]>(
        `SELECT option_id, question_id, text, value, is_other, metadata_id, archived_at
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
