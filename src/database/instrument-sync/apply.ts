import { DataSource, EntityManager } from 'typeorm';
import { exportManifest } from './export';
import { contentEqual, contentOf, flatten, FlatManifest } from './diff';
import { resolveMetadataId } from './metadata';
import {
  ApplyResult,
  InstrumentManifest,
  Plan,
  PlanEntityKind,
  PlanOperation,
} from './types';

/**
 * Spec 84, Fase 3 — aplica un plan generado por `buildPlan` contra el
 * entorno destino, en una sola transacción:
 *
 *   1. Rechaza de plano si el plan trae conflictos sin resolver.
 *   2. Vuelve a exportar el destino y lo compara contra `plan.baseline`
 *      (el estado con el que se calculó el plan) — si algo cambió desde
 *      entonces, aborta sin escribir nada (criterio 14).
 *   3. Ese export fresco es el respaldo (`backup`). Antes de abrir la
 *      transacción se entrega a `onBackup`, para que el llamador pueda
 *      persistirlo: si el respaldo no se puede guardar, no se aplica nada.
 *      Devolverlo al final no basta — si el proceso muere a mitad, el único
 *      estado previo conocido se pierde con él.
 *   4. Aplica las operaciones de padres a hijos (instrumento → sección →
 *      pregunta → opción) y, en una segunda pasada, las condiciones entre
 *      preguntas — puede que una pregunta condición se haya creado en esta
 *      misma transacción.
 *   5. Los borrados van de hijos a padres, siempre después de confirmar que
 *      nadie los respondió (eso ya lo garantizó `buildPlan`).
 */
export interface ApplyOptions {
  /**
   * Recibe el respaldo del destino **antes** de que se escriba nada. Si lanza,
   * `applyPlan` aborta sin aplicar: un respaldo que no se pudo guardar es
   * indistinguible de no tener respaldo.
   */
  onBackup?: (backup: InstrumentManifest) => Promise<void> | void;
  /**
   * Se ejecuta dentro de la misma transacción, después de aplicar y verificar
   * el plan y antes del commit. Si lanza, se revierte todo (lo usa `restore`
   * para quitar los instrumentos creados de forma atómica).
   */
  beforeCommit?: (manager: EntityManager) => Promise<void>;
}

export async function applyPlan(
  ds: DataSource,
  plan: Plan,
  options: ApplyOptions = {},
): Promise<ApplyResult> {
  if (plan.conflicts.length > 0) {
    throw new Error(
      `El plan tiene ${plan.conflicts.length} conflicto(s) sin resolver; no se puede aplicar.`,
    );
  }

  const instrumentIds = plan.baseline.instruments.map((i) => i.instrumentId);
  const live = await exportManifest(ds, { instrumentIds });
  assertNoDrift(plan.baseline, live);

  const backup: InstrumentManifest = {
    ...live,
    createdInstrumentIds: createdInstrumentIds(plan),
  };
  if (options.onBackup) {
    await options.onBackup(backup);
  }

  await ds.transaction(async (manager) => {
    const desired = flatten(plan.desired);
    const byKind = (entity: PlanOperation['entity']) =>
      plan.operations.filter((op) => op.entity === entity);

    const typeIdByName = await loadTypeIdByName(manager);
    const actorTypeIdByName = await loadActorTypeIdByName(manager);

    // Spec 84 (auditoría 40, bloqueante) — `assertNoDrift` compara contenido
    // e ignora `responseCount`: una respuesta que llegue entre el plan y el
    // apply a algo que se borra desaparecería en cascada. Se bloquean las
    // escrituras en `responses` hasta el commit y se vuelven a contar aquí.
    await manager.query('LOCK TABLE responses IN SHARE MODE');
    await assertNoResponsesOnDestructiveOps(
      manager,
      plan,
      desired,
      typeIdByName,
    );

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

    // Spec 84 (auditoría 40, Alcance C) — antes del commit, lo aplicado debe
    // coincidir con lo deseado en cada entidad que tocó el plan; si no, se
    // revierte todo.
    const touched = [...new Set(plan.operations.map((op) => op.instrumentId))];
    const after = flatten(
      await exportManifest(manager, { instrumentIds: touched }),
    );
    const mismatches = appliedMismatches(plan, desired, after);
    if (mismatches.length > 0) {
      throw new Error(
        `Lo aplicado no coincide con el plan (${mismatches.length}): ${mismatches
          .slice(0, 5)
          .join('; ')}. Se revirtió todo.`,
      );
    }

    if (options.beforeCommit) {
      await options.beforeCommit(manager);
    }
  });

  return { backup, applied: plan.operations };
}

/** UUID que el plan borra, por entidad. */
export function destructiveTargets(
  plan: Plan,
): Record<'section' | 'question' | 'option', string[]> {
  const ids = (entity: PlanEntityKind) =>
    plan.operations
      .filter((op) => op.entity === entity && op.kind === 'delete')
      .map((op) => op.id);
  return {
    section: ids('section'),
    question: ids('question'),
    option: ids('option'),
  };
}

/**
 * Compara, entidad por entidad, lo que quedó en el destino con lo que pedía el
 * plan: lo borrado ya no existe y lo creado/actualizado/archivado tiene el
 * contenido deseado. Devuelve una descripción por cada diferencia.
 */
export function appliedMismatches(
  plan: Plan,
  desired: FlatManifest,
  after: FlatManifest,
): string[] {
  const out: string[] = [];
  for (const op of plan.operations) {
    const pair = (() => {
      switch (op.entity) {
        case 'instrument':
          return [
            desired.instruments.get(op.id),
            after.instruments.get(op.id),
            (v: unknown) =>
              contentOf.instrument(
                v as Parameters<typeof contentOf.instrument>[0],
              ),
          ] as const;
        case 'section':
          return [
            desired.sections.get(op.id)?.section,
            after.sections.get(op.id)?.section,
            (v: unknown) =>
              contentOf.section(v as Parameters<typeof contentOf.section>[0]),
          ] as const;
        case 'question':
          return [
            desired.questions.get(op.id)?.question,
            after.questions.get(op.id)?.question,
            (v: unknown) =>
              contentOf.question(v as Parameters<typeof contentOf.question>[0]),
          ] as const;
        default:
          return [
            desired.options.get(op.id)?.option,
            after.options.get(op.id)?.option,
            (v: unknown) =>
              contentOf.option(v as Parameters<typeof contentOf.option>[0]),
          ] as const;
      }
    })();
    const [want, got, content] = pair;
    if (op.kind === 'delete') {
      if (got) out.push(`${op.entity} ${op.id} debía borrarse y sigue`);
      continue;
    }
    if (!got) {
      out.push(`${op.entity} ${op.id} no quedó en el destino`);
    } else if (!want || !contentEqual(content(want), content(got))) {
      out.push(`${op.entity} ${op.id} quedó distinto de lo deseado`);
    }
  }
  return out;
}

async function assertNoResponsesOnDestructiveOps(
  manager: EntityManager,
  plan: Plan,
  desired: FlatManifest,
  typeIdByName: Map<string, string>,
): Promise<void> {
  const targets = destructiveTargets(plan);
  const problems: string[] = [];
  const count = async (sql: string, ids: string[]) =>
    ids.length === 0
      ? 0
      : Number((await manager.query<{ n: string }[]>(sql, [ids]))[0]?.n ?? 0);

  const onQuestions = await count(
    `SELECT COUNT(*)::text AS n FROM responses WHERE question_id = ANY($1::uuid[])`,
    targets.question,
  );
  if (onQuestions > 0)
    problems.push(`${onQuestions} respuesta(s) en preguntas a borrar`);

  const onOptions = await count(
    `SELECT COUNT(*)::text AS n FROM responses WHERE option_id = ANY($1::uuid[])`,
    targets.option,
  );
  if (onOptions > 0)
    problems.push(`${onOptions} respuesta(s) en opciones a borrar`);

  const onSections = await count(
    `SELECT COUNT(*)::text AS n FROM responses r
       JOIN questions q ON q.question_id = r.question_id
      WHERE q.section_id = ANY($1::uuid[])`,
    targets.section,
  );
  if (onSections > 0)
    problems.push(`${onSections} respuesta(s) en secciones a borrar`);

  const typeChanges: string[] = [];
  const updates = plan.operations.filter(
    (op) => op.entity === 'question' && op.kind === 'update',
  );
  if (updates.length > 0) {
    const rows = await manager.query<
      { question_id: string; type_id: string }[]
    >(
      `SELECT question_id, type_id FROM questions WHERE question_id = ANY($1::uuid[])`,
      [updates.map((op) => op.id)],
    );
    for (const row of rows) {
      const wanted = desired.questions.get(row.question_id)?.question.type;
      const wantedId = wanted ? typeIdByName.get(wanted) : undefined;
      if (wantedId && wantedId !== row.type_id)
        typeChanges.push(row.question_id);
    }
  }
  const onTypeChanges = await count(
    `SELECT COUNT(*)::text AS n FROM responses WHERE question_id = ANY($1::uuid[])`,
    typeChanges,
  );
  if (onTypeChanges > 0)
    problems.push(
      `${onTypeChanges} respuesta(s) en preguntas que cambian de tipo`,
    );

  if (problems.length > 0) {
    throw new Error(
      `El destino recibió respuestas después del plan: ${problems.join('; ')}. No se aplicó nada; vuelva a generar el plan.`,
    );
  }
}

/** Instrumentos que el plan crea: `restore` los quita al volver al respaldo. */
export function createdInstrumentIds(plan: Plan): string[] {
  return plan.operations
    .filter((op) => op.entity === 'instrument' && op.kind === 'create')
    .map((op) => op.id);
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
