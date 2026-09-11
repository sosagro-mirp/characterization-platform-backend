import { contentEqual, contentOf, flatten } from './diff';
import {
  InstrumentManifest,
  ManifestOption,
  ManifestQuestion,
  Plan,
  PlanConflict,
  PlanEntityKind,
  PlanOperation,
  PlanOperationKind,
} from './types';

interface EntityView {
  instrumentId: string;
  content: unknown;
  responseCount: number;
}

/**
 * Spec 84, Fase 3 — compara tres versiones del mismo conjunto de
 * instrumentos y devuelve qué operaciones haría falta aplicar en el
 * destino, y qué conflictos lo impiden:
 *
 *   - `base`:    manifiesto de producción tomado en el snapshot a desarrollo.
 *   - `desired`: manifiesto de desarrollo, ya depurado.
 *   - `current`: manifiesto de producción en este momento (puede haber
 *                cambiado desde `base` — talleres en curso, envíos nuevos).
 *
 * No escribe nada — es la simulación. `applyPlan` es quien aplica.
 */
export function buildPlan(params: {
  base: InstrumentManifest;
  desired: InstrumentManifest;
  current: InstrumentManifest;
}): Plan {
  const base = flatten(params.base);
  const desired = flatten(params.desired);
  const current = flatten(params.current);

  const operations: PlanOperation[] = [];
  const conflicts: PlanConflict[] = [];

  // ── Instrumentos: crear/actualizar, nunca borrar automáticamente. Un
  //    instrumento que desaparece de `desired` requiere una decisión manual
  //    (¿tiene encuestas? ¿pasos de campaña?) — fuera del alcance de un plan
  //    generado sin supervisión. ─────────────────────────────────────────
  for (const [id, desiredInstrument] of desired.instruments) {
    const baseInstrument = base.instruments.get(id);
    const currentInstrument = current.instruments.get(id);
    if (!baseInstrument) {
      operations.push({
        kind: 'create',
        entity: 'instrument',
        id,
        instrumentId: id,
      });
      continue;
    }
    if (!currentInstrument) continue; // se recreó a mano fuera de este flujo — no lo tocamos.

    const desiredChanged = !contentEqual(
      contentOf.instrument(baseInstrument),
      contentOf.instrument(desiredInstrument),
    );
    const currentChanged = !contentEqual(
      contentOf.instrument(baseInstrument),
      contentOf.instrument(currentInstrument),
    );
    if (desiredChanged && currentChanged) {
      conflicts.push({
        type: 'changed_in_target',
        entity: 'instrument',
        id,
        instrumentId: id,
        message: `El instrumento ${id} cambió en el destino después del snapshot y también en desarrollo.`,
      });
      continue;
    }
    if (desiredChanged) {
      operations.push({
        kind: 'update',
        entity: 'instrument',
        id,
        instrumentId: id,
      });
    }
  }

  // ── Secciones ────────────────────────────────────────────────────────
  diffLevel({
    entity: 'section',
    ids: unionKeys(base.sections, desired.sections, current.sections),
    getBase: (id) =>
      toView(base.sections.get(id), (w) => contentOf.section(w.section)),
    getDesired: (id) =>
      toView(desired.sections.get(id), (w) => contentOf.section(w.section)),
    getCurrent: (id) =>
      toView(current.sections.get(id), (w) => contentOf.section(w.section)),
    operations,
    conflicts,
  });

  // ── Preguntas — con la conflictividad de responder/cambiar tipo ─────
  diffLevel({
    entity: 'question',
    ids: unionKeys(base.questions, desired.questions, current.questions),
    getBase: (id) =>
      toView(
        base.questions.get(id),
        (w) => contentOf.question(w.question),
        (w) => w.question.responseCount,
      ),
    getDesired: (id) =>
      toView(desired.questions.get(id), (w) => contentOf.question(w.question)),
    getCurrent: (id) =>
      toView(
        current.questions.get(id),
        (w) => contentOf.question(w.question),
        (w) => w.question.responseCount,
      ),
    operations,
    conflicts,
    typeOf: (id) => ({
      base: base.questions.get(id)?.question.type,
      desired: desired.questions.get(id)?.question.type,
    }),
    archivedAtOf: (content) =>
      (content as Pick<ManifestQuestion, 'archivedAt'>).archivedAt,
  });

  // ── Opciones ──────────────────────────────────────────────────────────
  diffLevel({
    entity: 'option',
    ids: unionKeys(base.options, desired.options, current.options),
    getBase: (id) =>
      toView(
        base.options.get(id),
        (w) => contentOf.option(w.option),
        (w) => w.option.responseCount,
      ),
    getDesired: (id) =>
      toView(desired.options.get(id), (w) => contentOf.option(w.option)),
    getCurrent: (id) =>
      toView(
        current.options.get(id),
        (w) => contentOf.option(w.option),
        (w) => w.option.responseCount,
      ),
    operations,
    conflicts,
    archivedAtOf: (content) =>
      (content as Pick<ManifestOption, 'archivedAt'>).archivedAt,
  });

  return {
    operations,
    conflicts,
    baseline: params.current,
    desired: params.desired,
  };
}

function unionKeys<T>(...maps: Map<string, T>[]): string[] {
  const ids = new Set<string>();
  for (const map of maps) for (const id of map.keys()) ids.add(id);
  return [...ids];
}

function toView<T>(
  wrapper: (T & { instrumentId: string }) | undefined,
  content: (w: T & { instrumentId: string }) => unknown,
  responseCount?: (w: T & { instrumentId: string }) => number,
): EntityView | undefined {
  if (!wrapper) return undefined;
  return {
    instrumentId: wrapper.instrumentId,
    content: content(wrapper),
    responseCount: responseCount ? responseCount(wrapper) : 0,
  };
}

/**
 * Diseñado para secciones, preguntas y opciones (todas soportan create/
 * update/delete). Un `id` ausente en `desired` que exista en `base` o
 * `current` significa "desarrollo quiere que deje de existir": se convierte
 * en `delete` si nadie la respondió, o en conflicto si sí.
 */
function diffLevel(params: {
  entity: PlanEntityKind;
  ids: string[];
  getBase: (id: string) => EntityView | undefined;
  getDesired: (id: string) => EntityView | undefined;
  getCurrent: (id: string) => EntityView | undefined;
  operations: PlanOperation[];
  conflicts: PlanConflict[];
  /** Solo preguntas: nombres de tipo en base/desired, para detectar cambio de tipo. */
  typeOf?: (id: string) => { base?: string; desired?: string };
  /** Solo preguntas/opciones: extrae `archivedAt` del contenido, para distinguir archive/unarchive de un update genérico. */
  archivedAtOf?: (content: unknown) => string | null;
}) {
  for (const id of params.ids) {
    const base = params.getBase(id);
    const desired = params.getDesired(id);
    const current = params.getCurrent(id);
    const instrumentId = (desired ?? current ?? base)?.instrumentId ?? id;

    if (!base && desired && !current) {
      params.operations.push({
        kind: 'create',
        entity: params.entity,
        id,
        instrumentId,
      });
      continue;
    }

    if (!desired && (base || current)) {
      const responseCount = (current ?? base)?.responseCount ?? 0;
      if (responseCount > 0) {
        params.conflicts.push({
          type: 'delete_with_responses',
          entity: params.entity,
          id,
          instrumentId,
          message: `${params.entity} ${id} tiene ${responseCount} respuesta(s) y no se puede borrar. Archívela en su lugar.`,
        });
      } else {
        params.operations.push({
          kind: 'delete',
          entity: params.entity,
          id,
          instrumentId,
        });
      }
      continue;
    }

    if (base && desired && current) {
      const types = params.typeOf?.(id);
      const typeChanged =
        !!types && types.base !== undefined && types.base !== types.desired;
      if (typeChanged && current.responseCount > 0) {
        params.conflicts.push({
          type: 'type_change_with_responses',
          entity: params.entity,
          id,
          instrumentId,
          message: `${params.entity} ${id} tiene respuestas y no puede cambiar de tipo. Cree una pregunta nueva y archive esta.`,
        });
        continue;
      }

      const desiredChanged = !contentEqual(base.content, desired.content);
      const currentChanged = !contentEqual(base.content, current.content);

      if (desiredChanged && currentChanged) {
        params.conflicts.push({
          type: 'changed_in_target',
          entity: params.entity,
          id,
          instrumentId,
          message: `${params.entity} ${id} cambió en el destino después del snapshot y también en desarrollo.`,
        });
        continue;
      }

      if (desiredChanged) {
        params.operations.push({
          kind: classifyUpdate(
            base.content,
            desired.content,
            params.archivedAtOf,
          ),
          entity: params.entity,
          id,
          instrumentId,
        });
      }
    }
  }
}

function classifyUpdate(
  baseContent: unknown,
  desiredContent: unknown,
  archivedAtOf?: (content: unknown) => string | null,
): PlanOperationKind {
  if (!archivedAtOf) return 'update';
  const baseArchived = archivedAtOf(baseContent);
  const desiredArchived = archivedAtOf(desiredContent);
  if (baseArchived === desiredArchived) return 'update';

  const stripArchived = (c: unknown) => ({
    ...(c as object),
    archivedAt: null,
  });
  if (
    !contentEqual(stripArchived(baseContent), stripArchived(desiredContent))
  ) {
    return 'update';
  }
  return desiredArchived ? 'archive' : 'unarchive';
}
