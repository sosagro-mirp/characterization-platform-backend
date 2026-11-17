import {
  collapseMergeGroups,
  attachExternalIds,
} from './dashboard-question-merge';
import {
  QUESTION_MERGE_GROUPS,
  QuestionMergeGroup,
} from './dashboard-question-merge.config';

const group: QuestionMergeGroup = {
  categoryId: 'C1',
  key: 'g',
  note: '',
  members: [
    { instrumentCode: 'A', questionText: 'Q' },
    { instrumentCode: 'B', questionText: 'Q2' },
    { instrumentCode: 'EXT', questionText: 'Q', external: true },
  ],
};
const q = (questionId: string, text: string) => ({ questionId, text });
const codes: Record<string, string> = { a1: 'A', b1: 'B', c1: 'C' };
const codeOf = (x: { questionId: string }) => codes[x.questionId];

describe('collapseMergeGroups (spec 66, D15)', () => {
  it('junta los miembros en la primera pregunta y quita los demás', () => {
    const r = collapseMergeGroups(
      [group],
      [q('a1', 'Q'), q('c1', 'otra'), q('b1', 'Q2')],
      codeOf,
    );
    expect(r.questions.map((x) => x.questionId)).toEqual(['a1', 'c1']);
    expect(r.questions[0].destinationQuestionIds).toEqual(['a1', 'b1']);
    expect(r.externalToFetch).toHaveLength(1);
    expect(r.externalToFetch[0].representative.questionId).toBe('a1');
  });

  it('usa como representante el miembro declarado, aunque no sea el primero', () => {
    const g: QuestionMergeGroup = {
      ...group,
      members: [
        { instrumentCode: 'A', questionText: 'Q' },
        { instrumentCode: 'B', questionText: 'Q2', representative: true },
      ],
    };
    const r = collapseMergeGroups([g], [q('a1', 'Q'), q('b1', 'Q2')], codeOf);
    expect(r.questions.map((x) => x.questionId)).toEqual(['b1']);
    expect(r.questions[0].destinationQuestionIds).toEqual(['a1', 'b1']);
  });

  it('cada grupo declara exactamente un representante interno', () => {
    for (const g of QUESTION_MERGE_GROUPS) {
      const reps = g.members.filter((m) => m.representative);
      expect(reps).toHaveLength(1);
      expect(reps[0].external).toBeFalsy();
    }
  });

  it('no usa el texto solo: exige instrumento y texto exactos', () => {
    const r = collapseMergeGroups([group], [q('c1', 'Q')], codeOf);
    expect(r.questions).toHaveLength(1);
    expect(r.questions[0].destinationQuestionIds).toBeUndefined();
    expect(r.externalToFetch).toHaveLength(0);
  });

  it('un grupo sin representante en la categoría no trae su miembro externo', () => {
    const r = collapseMergeGroups([group], [], codeOf);
    expect(r.externalToFetch).toHaveLength(0);
  });

  it('attachExternalIds suma el id una sola vez', () => {
    const rep = { ...q('a1', 'Q'), destinationQuestionIds: ['a1'] };
    attachExternalIds(rep, 'x9');
    attachExternalIds(rep, 'x9');
    expect(rep.destinationQuestionIds).toEqual(['a1', 'x9']);
  });

  it('la configuración no repite miembros entre grupos', () => {
    const keys = QUESTION_MERGE_GROUPS.flatMap((g) =>
      g.members.map((m) => `${m.instrumentCode}|${m.questionText}`),
    );
    expect(new Set(keys).size).toBe(keys.length);
  });
});
