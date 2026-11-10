import { ProcessPreview } from 'src/surveys/public-submission-plan';
import {
  checkDecisionAgainstPreview,
  crossCheckDecisions,
  validateDecisionsFile,
} from './decisions';
import { SubmissionDecision } from './types';

const S1 = '11111111-1111-4111-8111-111111111111';
const S2 = '22222222-2222-4222-8222-222222222222';
const F1 = '33333333-3333-4333-8333-333333333333';
const T1 = '44444444-4444-4444-8444-444444444444';

describe('validateDecisionsFile', () => {
  it('acepta un archivo válido y conserva los campos', () => {
    const { file, errors } = validateDecisionsFile({
      decisions: [
        {
          surveyId: S1,
          action: 'process',
          resolution: 'same_person',
          farm: { mode: 'link', farmId: F1 },
          townId: T1,
        },
        { surveyId: S2, action: 'leave_pending', note: 'extensionista' },
      ],
    });
    expect(errors).toEqual([]);
    expect(file?.decisions).toHaveLength(2);
    expect(file?.decisions[0].farm).toEqual({ mode: 'link', farmId: F1 });
  });

  it('rechaza una estructura que no es el archivo esperado', () => {
    expect(validateDecisionsFile([]).errors).toHaveLength(1);
    expect(validateDecisionsFile({ decisions: [] }).errors).toHaveLength(1);
  });

  it('acumula todos los errores en vez de detenerse en el primero', () => {
    const { file, errors } = validateDecisionsFile({
      decisions: [
        { surveyId: 'no-uuid', action: 'process' },
        { surveyId: S1, action: 'borrar' },
        { surveyId: S2, action: 'process', farm: { mode: 'link' } },
        { surveyId: S2, action: 'discard', townId: T1 },
        { surveyId: S1, action: 'process', extra: 1 },
      ],
    });
    expect(file).toBeNull();
    expect(errors.join('\n')).toEqual(
      expect.stringContaining('"surveyId" debe ser un UUID'),
    );
    expect(errors.join('\n')).toEqual(expect.stringContaining('"action"'));
    expect(errors.join('\n')).toEqual(expect.stringContaining('farm.farmId'));
    expect(errors.join('\n')).toEqual(
      expect.stringContaining('solo aplican a action = process'),
    );
    expect(errors.join('\n')).toEqual(expect.stringContaining('repetido'));
    expect(errors.join('\n')).toEqual(
      expect.stringContaining('campo desconocido "extra"'),
    );
  });

  it('rechaza farm.mode = create con farmId', () => {
    const { errors } = validateDecisionsFile({
      decisions: [
        {
          surveyId: S1,
          action: 'process',
          farm: { mode: 'create', farmId: F1 },
        },
      ],
    });
    expect(errors.join()).toContain('no admite');
  });
});

describe('crossCheckDecisions', () => {
  const refs = { farmIds: new Set([F1]), townIds: new Set([T1]) };
  const d = (over: Partial<SubmissionDecision>): SubmissionDecision => ({
    surveyId: S1,
    action: 'process',
    ...over,
  });

  it('clasifica por estado y salta lo ya aplicado (idempotencia)', () => {
    const result = crossCheckDecisions(
      [
        d({ surveyId: S1 }),
        d({ surveyId: S2, action: 'discard' }),
        d({ surveyId: 'a', action: 'leave_pending' }),
        d({ surveyId: 'b' }),
        d({ surveyId: 'c', action: 'discard' }),
      ],
      new Map([
        [S1, { origin: 'public', reviewStatus: 'pending' }],
        [S2, { origin: 'public', reviewStatus: 'pending' }],
        ['a', { origin: 'public', reviewStatus: 'pending' }],
        ['b', { origin: 'public', reviewStatus: 'processed' }],
        ['c', { origin: 'public', reviewStatus: 'discarded' }],
      ]),
      refs,
    );
    expect(result.errors).toEqual([]);
    expect(result.toProcess.map((x) => x.surveyId)).toEqual([S1]);
    expect(result.toDiscard.map((x) => x.surveyId)).toEqual([S2]);
    expect(result.leavePending).toHaveLength(1);
    expect(result.alreadyApplied.map((x) => x.surveyId)).toEqual(['b', 'c']);
  });

  it('marca envíos inexistentes, de campo, no pendientes incompatibles y referencias falsas', () => {
    const result = crossCheckDecisions(
      [
        d({ surveyId: 'x' }),
        d({ surveyId: 'campo' }),
        d({ surveyId: 'desc', action: 'process' }),
        d({
          surveyId: S1,
          farm: { mode: 'link', farmId: 'otra' },
          townId: 'zz',
        }),
      ],
      new Map([
        ['campo', { origin: 'field', reviewStatus: null }],
        ['desc', { origin: 'public', reviewStatus: 'discarded' }],
        [S1, { origin: 'public', reviewStatus: 'pending' }],
      ]),
      refs,
    );
    const text = result.errors.join('\n');
    expect(text).toContain('Envío x: no existe');
    expect(text).toContain('no es un envío del canal público');
    expect(text).toContain('no pendiente');
    expect(text).toContain('la finca otra no existe');
    expect(text).toContain('el municipio zz no existe');
  });
});

describe('checkDecisionAgainstPreview', () => {
  function preview(over: Partial<ProcessPreview> = {}): ProcessPreview {
    return {
      surveyId: S1,
      identity: { name: 'Ana', documentId: '123', phone: null },
      document: { status: 'new', farmerId: null, candidates: [] },
      farm: { action: 'create', farmId: null, sharedCandidates: [] },
      crops: { resolved: [], unmapped: [] },
      fieldsToComplete: [],
      warnings: [],
      ...over,
    };
  }
  const process: SubmissionDecision = { surveyId: S1, action: 'process' };

  it('exige resolution ante una colisión', () => {
    const p = preview({
      document: { status: 'collision', farmerId: null, candidates: [] },
    });
    expect(checkDecisionAgainstPreview(process, p, null).errors).toHaveLength(
      1,
    );
    expect(
      checkDecisionAgainstPreview(
        { ...process, resolution: 'separate_person' },
        p,
        null,
      ).errors,
    ).toEqual([]);
  });

  it('rechaza crear una finca con nombre de más de 50 caracteres, pero no al vincular', () => {
    const long = 'x'.repeat(51);
    expect(
      checkDecisionAgainstPreview(process, preview(), long).errors,
    ).toHaveLength(1);
    expect(
      checkDecisionAgainstPreview(
        { ...process, farm: { mode: 'link', farmId: F1 } },
        preview(),
        long,
      ).errors,
    ).toEqual([]);
  });

  it('advierte de no productor, sin municipio y vínculo ignorado', () => {
    const p = preview({
      farm: { action: 'complete', farmId: F1, sharedCandidates: [] },
      warnings: [{ code: 'respondent_not_producer' }, { code: 'missing_town' }],
    });
    const { errors, warnings } = checkDecisionAgainstPreview(
      {
        ...process,
        resolution: 'same_person',
        farm: { mode: 'link', farmId: F1 },
      },
      p,
      null,
    );
    expect(errors).toEqual([]);
    expect(warnings).toHaveLength(4);
  });
});
