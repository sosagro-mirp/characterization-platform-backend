import { DataSource, EntityManager } from 'typeorm';
import { exportManifest } from './export';
import { contentEqual, contentOf, flatten, FlatManifest } from './diff';
import { resolveMetadataId } from './metadata';
import { ApplyResult, InstrumentManifest, Plan, PlanOperation } from './types';

/**
 * Spec 84, Fase 3 — aplica un plan generado por `buildPlan` contra el
 * entorno destino, en una sola transacción:
 *
 *   1. Rechaza de plano si el plan trae conflictos sin resolver.
 *   2. Vuelve a exportar el destino y lo compara contra `plan.baseline`
 *      (el estado con el que se calculó el plan) — si algo cambió desde
 *      entonces, aborta sin escribir nada (criterio 14).
 *   3. Ese export fresco es el respaldo (`backup`) que se devuelve.
 *   4. Aplica las operaciones de padres a hijos (instrumento → sección →
 *      pregunta → opción) y, en una segunda pasada, las condiciones entre
 *      preguntas — puede que una pregunta condición se haya creado en esta
 *      misma transacción.
 *   5. Los borrados van de hijos a padres, siempre después de confirmar que
 *      nadie los respondió (eso ya lo garantizó `buildPlan`).
 */
export async function applyPlan(
  ds: DataSource,
  plan: Plan,
): Promise<ApplyResult> {
  if (plan.conflicts.length > 0) {
    throw new Error(
      `El plan tiene ${plan.conflicts.length} conflicto(s) sin resolver; no se puede aplicar.`,
    );
  }

  const instrumentIds = plan.baseline.instruments.map((i) => i.instrumentId);
  const live = await exportManifest(ds, { instrumentIds });
  assertNoDrift(plan.baseline, live);

  const backup = live;

  await ds.transaction(async (manager) => {
    const desired = flatten(plan.desired);
    const byKind = (entity: PlanOperation['entity']) =>
      plan.operations.filter((op) => op.entity === entity);

    const typeIdByName = await loadTypeIdByName(manager);
    const actorTypeIdByName = await loadActorTypeIdByName(manager);

    for (const op of byKind('instrument')) {
      await applyInstrumentWrite(manager, desired, op, actorTypeIdByName);
    }
    for (const op of byKind('section')) {
      if (op.kind !== 'delete') await applySectionWrite(manager, desired, op);
    }
    for (const op of byKind('question')) {
      if (op.kind !== 'delete') {
        await applyQuestionWrite(manager, desired, op, typeIdByName);
      }
    }
    for (const op of byKind('option')) {
      if (op.kind !== 'delete') await applyOptionWrite(manager, desired, op);
    }

    // Segunda pasada — condition_question_id/Value: la pregunta condición
    // puede haberse creado en esta misma transacción, en cualquier orden.
    for (const op of byKind('question')) {
      if (op.kind === 'delete') continue;
      const question = desired.questions.get(op.id)!.question;
      await manager.query(
        `UPDATE questions SET condition_question_id = $1, condition_value = $2 WHERE question_id = $3`,
        [question.conditionQuestionId, question.conditionValue, op.id],
      );
    }

    // Borrados, de hijos a padres.
    for (const op of byKind('option')) {
      if (op.kind === 'delete') {
        await manager.query(
          `DELETE FROM options_question WHERE option_id = $1`,
          [op.id],
        );
      }
    }
    for (const op of byKind('question')) {
      if (op.kind === 'delete') {
        await manager.query(`DELETE FROM questions WHERE question_id = $1`, [
          op.id,
        ]);
      }
    }
    for (const op of byKind('section')) {
      if (op.kind === 'delete') {
        await manager.query(`DELETE FROM sections WHERE section_id = $1`, [
          op.id,
        ]);
      }
    }
  });

  return { backup, applied: plan.operations };
}

function assertNoDrift(
  baseline: InstrumentManifest,
  live: InstrumentManifest,
): void {
  const b = flatten(baseline);
  const l = flatten(live);
  checkLevel('instrumento', b.instruments, l.instruments, contentOf.instrument);
  checkLevel('sección', b.sections, l.sections, (w) =>
    contentOf.section(w.section),
  );
  checkLevel('pregunta', b.questions, l.questions, (w) =>
    contentOf.question(w.question),
  );
  checkLevel('opción', b.options, l.options, (w) => contentOf.option(w.option));
}

function checkLevel<T>(
  label: string,
  baseMap: Map<string, T>,
  liveMap: Map<string, T>,
  content: (v: T) => unknown,
): void {
  const ids = new Set([...baseMap.keys(), ...liveMap.keys()]);
  for (const id of ids) {
    const base = baseMap.get(id);
    const target = liveMap.get(id);
    if (!base || !target) {
      throw new Error(
        `El destino cambió desde que se generó el plan (${label} ${id} apareció o desapareció ahí). Vuelva a generar el plan.`,
      );
    }
    if (!contentEqual(content(base), content(target))) {
      throw new Error(
        `El destino cambió desde que se generó el plan (${label} ${id} tiene contenido distinto ahí). Vuelva a generar el plan.`,
      );
    }
  }
}

async function loadTypeIdByName(
  manager: EntityManager,
): Promise<Map<string, string>> {
  const rows = await manager.query<{ type_id: string; name: string }[]>(
    `SELECT type_id, name FROM types_of_questions`,
  );
  return new Map(rows.map((r) => [r.name, r.type_id]));
}

async function loadActorTypeIdByName(
  manager: EntityManager,
): Promise<Map<string, string>> {
  const rows = await manager.query<{ actor_type_id: string; name: string }[]>(
    `SELECT actor_type_id, name FROM actor_type`,
  );
  return new Map(rows.map((r) => [r.name, r.actor_type_id]));
}

async function applyInstrumentWrite(
  manager: EntityManager,
  desired: FlatManifest,
  op: PlanOperation,
  actorTypeIdByName: Map<string, string>,
): Promise<void> {
  const instrument = desired.instruments.get(op.id)!;
  await manager.query(
    `INSERT INTO instruments (instrument_id, name, version, publish_date, is_active, is_public, code)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (instrument_id) DO UPDATE SET
       name = $2, version = $3, publish_date = $4, is_active = $5, is_public = $6, code = $7`,
    [
      instrument.instrumentId,
      instrument.name,
      instrument.version,
      instrument.publishDate,
      instrument.isActive,
      instrument.isPublic,
      instrument.code,
    ],
  );

  await manager.query(
    `DELETE FROM instruments_actor_types WHERE instrument_id = $1`,
    [instrument.instrumentId],
  );
  for (const name of instrument.actorTypes) {
    const actorTypeId = actorTypeIdByName.get(name);
    if (!actorTypeId) {
      throw new Error(`Tipo de actor desconocido en el destino: "${name}"`);
    }
    await manager.query(
      `INSERT INTO instruments_actor_types (instrument_id, actor_type_id) VALUES ($1, $2)`,
      [instrument.instrumentId, actorTypeId],
    );
  }
}

async function applySectionWrite(
  manager: EntityManager,
  desired: FlatManifest,
  op: PlanOperation,
): Promise<void> {
  const wrapper = desired.sections.get(op.id)!;
  const section = wrapper.section;
  await manager.query(
    `INSERT INTO sections (section_id, instrument_id, name, "order")
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (section_id) DO UPDATE SET
       instrument_id = $2, name = $3, "order" = $4`,
    [section.sectionId, wrapper.instrumentId, section.name, section.order],
  );
}

async function applyQuestionWrite(
  manager: EntityManager,
  desired: FlatManifest,
  op: PlanOperation,
  typeIdByName: Map<string, string>,
): Promise<void> {
  const wrapper = desired.questions.get(op.id)!;
  const question = wrapper.question;

  if (op.kind === 'archive' || op.kind === 'unarchive') {
    await manager.query(
      `UPDATE questions SET archived_at = $1 WHERE question_id = $2`,
      [question.archivedAt, op.id],
    );
    return;
  }

  const typeId = typeIdByName.get(question.type);
  if (!typeId) {
    throw new Error(
      `Tipo de pregunta desconocido en el destino: "${question.type}"`,
    );
  }

  // Sin condition_question_id/Value en esta pasada: la pregunta de la que
  // depende puede no existir todavía en esta transacción. Se completa en la
  // segunda pasada, cuando todas las preguntas del plan ya existen.
  await manager.query(
    `INSERT INTO questions
       (question_id, section_id, text, type_id, is_required, is_selection_criteria,
        is_key_question, "order", system_field, archived_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     ON CONFLICT (question_id) DO UPDATE SET
       section_id = $2, text = $3, type_id = $4, is_required = $5,
       is_selection_criteria = $6, is_key_question = $7, "order" = $8,
       system_field = $9, archived_at = $10`,
    [
      question.questionId,
      wrapper.sectionId,
      question.text,
      typeId,
      question.isRequired,
      question.isSelectionCriteria,
      question.isKeyQuestion,
      question.order,
      question.systemField,
      question.archivedAt,
    ],
  );
}

async function applyOptionWrite(
  manager: EntityManager,
  desired: FlatManifest,
  op: PlanOperation,
): Promise<void> {
  const wrapper = desired.options.get(op.id)!;
  const option = wrapper.option;

  if (op.kind === 'archive' || op.kind === 'unarchive') {
    await manager.query(
      `UPDATE options_question SET archived_at = $1 WHERE option_id = $2`,
      [option.archivedAt, op.id],
    );
    return;
  }

  const metadataId = option.metadata
    ? await resolveMetadataId(manager, option.metadata)
    : null;

  await manager.query(
    `INSERT INTO options_question (option_id, question_id, text, value, is_other, metadata_id, archived_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (option_id) DO UPDATE SET
       question_id = $2, text = $3, value = $4, is_other = $5, metadata_id = $6, archived_at = $7`,
    [
      option.optionId,
      wrapper.questionId,
      option.text,
      option.value,
      option.isOther,
      metadataId,
      option.archivedAt,
    ],
  );
}
