import {
  QuestionMergeGroup,
  QuestionMergeMember,
} from './dashboard-question-merge.config';

/** Lo mínimo que la fusión necesita saber de una pregunta. */
export interface MergeableQuestion {
  questionId: string;
  text: string;
}

export interface MergeResult<Q extends MergeableQuestion> {
  /** Preguntas de la categoría, con cada grupo colapsado en su representante. */
  questions: Array<Q & { destinationQuestionIds?: string[] }>;
  /** Miembros `external` que faltaron en la lista y hay que traer aparte. */
  externalToFetch: Array<{
    groupKey: string;
    member: QuestionMergeMember;
    representative: Q & { destinationQuestionIds?: string[] };
  }>;
}

/**
 * Paso 1 (puro): dentro de `questions`, junta los miembros de cada grupo en
 * la primera pregunta que aparezca (la representante, que aporta tipo y
 * opciones). Los demás miembros salen de la lista. Devuelve además qué
 * miembros `external` hay que ir a buscar.
 */
export function collapseMergeGroups<Q extends MergeableQuestion>(
  groups: QuestionMergeGroup[],
  questions: Q[],
  instrumentCodeOf: (question: Q) => string | undefined,
): MergeResult<Q> {
  let current: Array<Q & { destinationQuestionIds?: string[] }> = [
    ...questions,
  ];
  const externalToFetch: MergeResult<Q>['externalToFetch'] = [];

  for (const group of groups) {
    const isMember = (q: Q) =>
      group.members.some(
        (m) =>
          !m.external &&
          m.instrumentCode === instrumentCodeOf(q) &&
          m.questionText === q.text,
      );
    const found = current.filter(isMember);
    if (found.length === 0) continue; // sin representante no hay grupo
    const preferred = found.find((q) =>
      group.members.some(
        (m) =>
          m.representative &&
          m.instrumentCode === instrumentCodeOf(q) &&
          m.questionText === q.text,
      ),
    );
    const representative = preferred ?? found[0];
    const rest = found.filter((q) => q !== representative);
    const ids = [
      ...new Set(
        found.flatMap((q) => q.destinationQuestionIds ?? [q.questionId]),
      ),
    ];
    representative.destinationQuestionIds = ids;
    const drop = new Set(rest);
    current = current.filter((q) => !drop.has(q));
    for (const member of group.members) {
      if (member.external) {
        externalToFetch.push({ groupKey: group.key, member, representative });
      }
    }
  }
  return { questions: current, externalToFetch };
}

/** Paso 2 (puro): suma los ids de un miembro externo al representante. */
export function attachExternalIds<Q extends MergeableQuestion>(
  representative: Q & { destinationQuestionIds?: string[] },
  externalQuestionId: string,
): void {
  const ids = representative.destinationQuestionIds ?? [
    representative.questionId,
  ];
  if (!ids.includes(externalQuestionId)) ids.push(externalQuestionId);
  representative.destinationQuestionIds = ids;
}
