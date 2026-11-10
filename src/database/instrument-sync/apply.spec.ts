import { appliedMismatches, destructiveTargets } from './apply';
import { flatten, normalizeArchivedAt } from './diff';
import {
  InstrumentManifest,
  ManifestInstrument,
  ManifestQuestion,
  Plan,
  PlanOperation,
} from './types';

/**
 * Spec 84 (auditoría 40) — piezas puras de `applyPlan`: qué borra el plan
 * (lo que se vuelve a contar dentro de la transacción) y la verificación de
 * que lo aplicado coincide con lo deseado antes del commit.
 */

function question(over: Partial<ManifestQuestion> = {}): ManifestQuestion {
  return {
    questionId: 'q-1',
    text: 'Cultivo principal',
    type: 'single_choice',
    isRequired: true,
    isSelectionCriteria: false,
    isKeyQuestion: false,
    order: 1,
    systemField: null,
    conditionQuestionId: null,
    conditionValue: null,
    archivedAt: null,
    responseCount: 0,
    hash: 'h',
    options: [],
    ...over,
  };
}

function manifest(questions: ManifestQuestion[]): InstrumentManifest {
  const instrument: ManifestInstrument = {
    instrumentId: 'i-1',
    name: 'Instrumento',
    version: 1,
    publishDate: '2026-09-15',
    isActive: true,
    isPublic: false,
    code: null,
    actorTypes: [],
    hash: 'h',
    sections: [{ sectionId: 's-1', name: 'Sección', order: 1, questions }],
  };
  return {
    formatVersion: 1,
    exportedAt: '2026-09-15T00:00:00Z',
    instruments: [instrument],
  };
}

function op(over: Partial<PlanOperation>): PlanOperation {
  return {
    kind: 'update',
    entity: 'question',
    id: 'q-1',
    instrumentId: 'i-1',
    ...over,
  } as PlanOperation;
}

function plan(operations: PlanOperation[]): Plan {
  return { operations } as unknown as Plan;
}

describe('destructiveTargets', () => {
  it('agrupa por entidad solo lo que se borra', () => {
    const targets = destructiveTargets(
      plan([
        op({ kind: 'delete', entity: 'question', id: 'q-borrar' }),
        op({ kind: 'delete', entity: 'option', id: 'o-borrar' }),
        op({ kind: 'delete', entity: 'section', id: 's-borrar' }),
        op({ kind: 'archive', entity: 'question', id: 'q-archivar' }),
      ]),
    );
    expect(targets).toEqual({
      section: ['s-borrar'],
      question: ['q-borrar'],
      option: ['o-borrar'],
    });
  });
});

describe('appliedMismatches', () => {
  it('no reporta nada cuando el destino quedó como se pedía', () => {
    const desired = flatten(manifest([question({ text: 'Nuevo texto' })]));
    const after = flatten(manifest([question({ text: 'Nuevo texto' })]));
    expect(appliedMismatches(plan([op({})]), desired, after)).toEqual([]);
  });

  it('reporta lo que quedó distinto, lo que falta y lo que debía borrarse', () => {
    const desired = flatten(
      manifest([
        question({ text: 'Nuevo texto' }),
        question({ questionId: 'q-2', text: 'Creada' }),
      ]),
    );
    const after = flatten(
      manifest([
        question({ text: 'Texto viejo' }),
        question({ questionId: 'q-3', text: 'Debía borrarse' }),
      ]),
    );
    const result = appliedMismatches(
      plan([
        op({ id: 'q-1' }),
        op({ kind: 'create', id: 'q-2' }),
        op({ kind: 'delete', id: 'q-3' }),
      ]),
      desired,
      after,
    );
    expect(result).toHaveLength(3);
    expect(result.join(' ')).toContain('q-1');
    expect(result.join(' ')).toContain('q-2');
    expect(result.join(' ')).toContain('q-3');
  });

  it('considera iguales las dos formas de archivedAt (con Z y sin zona)', () => {
    const desired = flatten(
      manifest([question({ archivedAt: '2026-09-14T12:23:04.886Z' })]),
    );
    const after = flatten(
      manifest([question({ archivedAt: '2026-09-14T12:23:04.886000' })]),
    );
    expect(
      appliedMismatches(plan([op({ kind: 'archive' })]), desired, after),
    ).toEqual([]);
  });
});

describe('normalizeArchivedAt', () => {
  it.each([
    ['2026-09-14T12:23:04.886Z', '2026-09-14T12:23:04.886000'],
    ['2026-09-14T12:23:04.886000', '2026-09-14T12:23:04.886000'],
    ['2026-09-14 12:23:04', '2026-09-14T12:23:04.000000'],
  ])('%s → %s', (input, expected) => {
    expect(normalizeArchivedAt(input)).toBe(expected);
  });

  it('deja null como null', () => {
    expect(normalizeArchivedAt(null)).toBeNull();
  });
});
