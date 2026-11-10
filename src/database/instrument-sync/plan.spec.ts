import { buildPlan, verifyAgainstTarget } from './plan';
import {
  InstrumentManifest,
  ManifestInstrument,
  ManifestOption,
  ManifestQuestion,
  ManifestSection,
} from './types';

/**
 * Spec 84 — `buildPlan` es la guarda que impide destruir datos al promover
 * desarrollo a producción: decide qué se crea, actualiza, archiva o borra, y
 * qué se rechaza de plano. Estas pruebas la ejercitan sin base de datos,
 * porque es una función pura sobre tres manifiestos.
 */

function option(over: Partial<ManifestOption> = {}): ManifestOption {
  return {
    optionId: 'opt-1',
    text: 'Cacao',
    value: null,
    isOther: false,
    metadata: null,
    archivedAt: null,
    responseCount: 0,
    hash: 'h',
    ...over,
  };
}

function question(over: Partial<ManifestQuestion> = {}): ManifestQuestion {
  return {
    questionId: 'q-1',
    text: 'Cultivo principal',
    type: 'single_choice',
    isRequired: true,
    isSelectionCriteria: false,
    isKeyQuestion: false,
    order: 1,
    systemField: 'farm.mainCrop',
    conditionQuestionId: null,
    conditionValue: null,
    archivedAt: null,
    responseCount: 0,
    hash: 'h',
    options: [],
    ...over,
  };
}

function section(over: Partial<ManifestSection> = {}): ManifestSection {
  return {
    sectionId: 's-1',
    name: 'Finca y cultivo',
    order: 1,
    questions: [question()],
    ...over,
  };
}

function instrument(
  over: Partial<ManifestInstrument> = {},
): ManifestInstrument {
  return {
    instrumentId: 'i-1',
    name: 'S_REG: Registro del productor',
    version: 1,
    publishDate: '2026-09-13',
    isActive: true,
    isPublic: false,
    code: 'S_REG',
    actorTypes: ['productor'],
    hash: 'h',
    sections: [section()],
    ...over,
  };
}

function manifest(instruments: ManifestInstrument[]): InstrumentManifest {
  return { formatVersion: 1, exportedAt: '2026-09-13T00:00:00Z', instruments };
}

/** Atajo: el caso normal es base === current (producción intacta desde el snapshot). */
function plan(
  base: InstrumentManifest,
  desired: InstrumentManifest,
  current: InstrumentManifest = base,
) {
  return buildPlan({ base, desired, current });
}

describe('buildPlan — sin cambios', () => {
  it('con base, deseado y actual iguales no propone nada', () => {
    const m = manifest([instrument()]);
    const result = plan(m, m);
    expect(result.operations).toEqual([]);
    expect(result.conflicts).toEqual([]);
  });

  it('ignora diferencias de hash y de responseCount', () => {
    const base = manifest([instrument()]);
    const desired = manifest([
      instrument({
        hash: 'otro',
        sections: [
          section({
            questions: [question({ hash: 'otro', responseCount: 99 })],
          }),
        ],
      }),
    ]);
    expect(plan(base, desired).operations).toEqual([]);
  });

  it('deja el baseline en `current`, no en `base`', () => {
    const base = manifest([instrument()]);
    const current = manifest([instrument({ name: 'Otro nombre' })]);
    expect(plan(base, base, current).baseline).toBe(current);
  });
});

describe('buildPlan — creación y actualización', () => {
  it('propone crear lo que solo existe en desarrollo', () => {
    const base = manifest([]);
    const desired = manifest([instrument()]);
    const kinds = plan(base, desired).operations.map((o) => [o.entity, o.kind]);
    expect(kinds).toContainEqual(['instrument', 'create']);
    expect(kinds).toContainEqual(['section', 'create']);
    expect(kinds).toContainEqual(['question', 'create']);
  });

  it('propone actualizar una pregunta con el texto corregido', () => {
    const base = manifest([instrument()]);
    const desired = manifest([
      instrument({
        sections: [
          section({
            questions: [question({ text: 'Cultivo principal del predio' })],
          }),
        ],
      }),
    ]);
    expect(plan(base, desired).operations).toEqual([
      { kind: 'update', entity: 'question', id: 'q-1', instrumentId: 'i-1' },
    ]);
  });

  it('nunca propone borrar un instrumento que desaparece de desarrollo', () => {
    const base = manifest([instrument()]);
    const result = plan(base, manifest([]));
    expect(result.operations.filter((o) => o.entity === 'instrument')).toEqual(
      [],
    );
  });
});

describe('buildPlan — borrado y respuestas', () => {
  it('borra una pregunta sin respuestas que desaparece de desarrollo', () => {
    const base = manifest([instrument()]);
    const desired = manifest([
      instrument({ sections: [section({ questions: [] })] }),
    ]);
    const result = plan(base, desired);
    expect(result.conflicts).toEqual([]);
    expect(result.operations).toContainEqual({
      kind: 'delete',
      entity: 'question',
      id: 'q-1',
      instrumentId: 'i-1',
    });
  });

  it('rechaza borrar una pregunta con respuestas y sugiere archivar', () => {
    const conRespuestas = instrument({
      sections: [section({ questions: [question({ responseCount: 12 })] })],
    });
    const base = manifest([conRespuestas]);
    const desired = manifest([
      instrument({ sections: [section({ questions: [] })] }),
    ]);
    const result = plan(base, desired);

    expect(result.operations.some((o) => o.kind === 'delete')).toBe(false);
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0]).toMatchObject({
      type: 'delete_with_responses',
      entity: 'question',
      id: 'q-1',
    });
    expect(result.conflicts[0].message).toMatch(/Archívela/);
  });

  it('cuenta las respuestas del destino, no las del snapshot', () => {
    // Sin respuestas cuando se tomó la base, pero respondida desde entonces:
    // el borrado debe rechazarse igual.
    const base = manifest([instrument()]);
    const current = manifest([
      instrument({
        sections: [section({ questions: [question({ responseCount: 3 })] })],
      }),
    ]);
    const desired = manifest([
      instrument({ sections: [section({ questions: [] })] }),
    ]);
    const result = plan(base, desired, current);
    expect(result.conflicts[0]).toMatchObject({
      type: 'delete_with_responses',
    });
  });
});

describe('buildPlan — cambio de tipo', () => {
  it('rechaza cambiar el tipo de una pregunta con respuestas', () => {
    const respondida = instrument({
      sections: [section({ questions: [question({ responseCount: 5 })] })],
    });
    const desired = manifest([
      instrument({
        sections: [
          section({ questions: [question({ type: 'multiple_choice' })] }),
        ],
      }),
    ]);
    const result = buildPlan({
      base: manifest([respondida]),
      desired,
      current: manifest([respondida]),
    });
    expect(result.conflicts[0]).toMatchObject({
      type: 'type_change_with_responses',
    });
    expect(result.operations.some((o) => o.entity === 'question')).toBe(false);
  });

  it('permite cambiar el tipo si nadie respondió', () => {
    const base = manifest([instrument()]);
    const desired = manifest([
      instrument({
        sections: [
          section({ questions: [question({ type: 'multiple_choice' })] }),
        ],
      }),
    ]);
    const result = plan(base, desired);
    expect(result.conflicts).toEqual([]);
    expect(result.operations).toContainEqual({
      kind: 'update',
      entity: 'question',
      id: 'q-1',
      instrumentId: 'i-1',
    });
  });
});

describe('buildPlan — cambios concurrentes en el destino', () => {
  it('reporta conflicto si la misma pregunta cambió en ambos lados', () => {
    const base = manifest([instrument()]);
    const desired = manifest([
      instrument({
        sections: [
          section({ questions: [question({ text: 'Texto de desarrollo' })] }),
        ],
      }),
    ]);
    const current = manifest([
      instrument({
        sections: [
          section({ questions: [question({ text: 'Texto de producción' })] }),
        ],
      }),
    ]);
    const result = plan(base, desired, current);
    expect(result.conflicts[0]).toMatchObject({
      type: 'changed_in_target',
      id: 'q-1',
    });
    expect(result.operations).toEqual([]);
  });

  it('no reporta conflicto si solo cambió el destino (desarrollo no la tocó)', () => {
    const base = manifest([instrument()]);
    const current = manifest([
      instrument({
        sections: [
          section({ questions: [question({ text: 'Texto de producción' })] }),
        ],
      }),
    ]);
    const result = plan(base, base, current);
    expect(result.conflicts).toEqual([]);
    expect(result.operations).toEqual([]);
  });

  it('detecta el cambio concurrente también a nivel de instrumento', () => {
    const base = manifest([instrument()]);
    const desired = manifest([instrument({ name: 'Registro (desarrollo)' })]);
    const current = manifest([instrument({ name: 'Registro (producción)' })]);
    const result = plan(base, desired, current);
    expect(result.conflicts[0]).toMatchObject({
      type: 'changed_in_target',
      entity: 'instrument',
    });
  });
});

describe('buildPlan — archivado', () => {
  it('clasifica como `archive` cuando lo único que cambia es archivedAt', () => {
    const base = manifest([instrument()]);
    const desired = manifest([
      instrument({
        sections: [
          section({
            questions: [question({ archivedAt: '2026-09-13T00:00:00.000Z' })],
          }),
        ],
      }),
    ]);
    expect(plan(base, desired).operations).toEqual([
      { kind: 'archive', entity: 'question', id: 'q-1', instrumentId: 'i-1' },
    ]);
  });

  it('clasifica como `unarchive` al quitar la fecha', () => {
    const archivada = instrument({
      sections: [
        section({
          questions: [question({ archivedAt: '2026-09-13T00:00:00.000Z' })],
        }),
      ],
    });
    const result = plan(manifest([archivada]), manifest([instrument()]));
    expect(result.operations).toEqual([
      { kind: 'unarchive', entity: 'question', id: 'q-1', instrumentId: 'i-1' },
    ]);
  });

  it('si además cambia el texto, es un update y no un archive', () => {
    const base = manifest([instrument()]);
    const desired = manifest([
      instrument({
        sections: [
          section({
            questions: [
              question({
                archivedAt: '2026-09-13T00:00:00.000Z',
                text: 'Texto distinto',
              }),
            ],
          }),
        ],
      }),
    ]);
    expect(plan(base, desired).operations).toEqual([
      { kind: 'update', entity: 'question', id: 'q-1', instrumentId: 'i-1' },
    ]);
  });

  it('archiva opciones igual que preguntas', () => {
    const conOpcion = instrument({
      sections: [section({ questions: [question({ options: [option()] })] })],
    });
    const desired = manifest([
      instrument({
        sections: [
          section({
            questions: [
              question({
                options: [option({ archivedAt: '2026-09-13T00:00:00.000Z' })],
              }),
            ],
          }),
        ],
      }),
    ]);
    expect(plan(manifest([conOpcion]), desired).operations).toEqual([
      { kind: 'archive', entity: 'option', id: 'opt-1', instrumentId: 'i-1' },
    ]);
  });
});

describe('verifyAgainstTarget', () => {
  it('no reporta nada cuando el destino coincide con el manifiesto', () => {
    const m = manifest([instrument()]);
    const result = verifyAgainstTarget({ manifest: m, current: m });
    expect(result.operations).toEqual([]);
    expect(result.conflicts).toEqual([]);
  });

  it('detecta una pregunta distinta, una que falta y una que sobra en el destino', () => {
    const manifestado = manifest([
      instrument({
        sections: [
          section({
            questions: [
              question({ archivedAt: '2026-09-14T12:23:04.886000' }),
              question({ questionId: 'q-2', text: 'Solo en el manifiesto' }),
            ],
          }),
        ],
      }),
    ]);
    const destino = manifest([
      instrument({
        sections: [
          section({
            questions: [
              question({ archivedAt: '2026-09-14T17:23:04.886000' }),
              question({ questionId: 'q-3', text: 'Solo en el destino' }),
            ],
          }),
        ],
      }),
    ]);
    const { operations } = verifyAgainstTarget({
      manifest: manifestado,
      current: destino,
    });
    expect(operations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ entity: 'question', id: 'q-1' }),
        expect.objectContaining({ kind: 'create', id: 'q-2' }),
        expect.objectContaining({ kind: 'delete', id: 'q-3' }),
      ]),
    );
  });
});
