import { contentEqual, contentOf, flatten } from './diff';
import {
  InstrumentManifest,
  ManifestInstrument,
  ManifestOption,
  ManifestQuestion,
  ManifestSection,
} from './types';

/**
 * Spec 84 — `contentOf` decide qué campos cuentan como "contenido". Si
 * incluyera un campo derivado (hash, responseCount) el plan reportaría
 * cambios cada vez que alguien responde una encuesta; si omitiera uno real,
 * una edición pasaría inadvertida a producción.
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
    hash: 'h-opt',
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
    hash: 'h-q',
    options: [option()],
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
    hash: 'h-i',
    sections: [section()],
    ...over,
  };
}

function manifest(instruments: ManifestInstrument[]): InstrumentManifest {
  return {
    formatVersion: 1,
    exportedAt: '2026-09-13T00:00:00.000Z',
    instruments,
  };
}

describe('flatten', () => {
  it('indexa toda la jerarquía por UUID y conserva la ascendencia', () => {
    const flat = flatten(manifest([instrument()]));

    expect([...flat.instruments.keys()]).toEqual(['i-1']);
    expect(flat.sections.get('s-1')?.instrumentId).toBe('i-1');
    expect(flat.questions.get('q-1')).toMatchObject({
      sectionId: 's-1',
      instrumentId: 'i-1',
    });
    expect(flat.options.get('opt-1')).toMatchObject({
      questionId: 'q-1',
      instrumentId: 'i-1',
    });
  });

  it('devuelve mapas vacíos para un manifiesto sin instrumentos', () => {
    const flat = flatten(manifest([]));
    expect(flat.instruments.size).toBe(0);
    expect(flat.options.size).toBe(0);
  });

  it('mantiene separadas las entidades de instrumentos distintos', () => {
    const otro = instrument({
      instrumentId: 'i-2',
      code: 'S1a',
      sections: [
        section({
          sectionId: 's-2',
          questions: [question({ questionId: 'q-2', options: [] })],
        }),
      ],
    });
    const flat = flatten(manifest([instrument(), otro]));
    expect(flat.questions.get('q-2')?.instrumentId).toBe('i-2');
    expect(flat.questions.size).toBe(2);
  });
});

describe('contentOf', () => {
  it('ignora el hash y el conteo de respuestas de una pregunta', () => {
    const a = question({ hash: 'uno', responseCount: 0 });
    const b = question({ hash: 'otro', responseCount: 4213 });
    expect(contentEqual(contentOf.question(a), contentOf.question(b))).toBe(
      true,
    );
  });

  it('ignora las opciones al comparar la pregunta (se comparan aparte)', () => {
    const a = question({ options: [option()] });
    const b = question({ options: [] });
    expect(contentEqual(contentOf.question(a), contentOf.question(b))).toBe(
      true,
    );
  });

  it.each([
    ['text', { text: 'Cultivo principal del predio' }],
    ['type', { type: 'multiple_choice' }],
    ['isRequired', { isRequired: false }],
    ['order', { order: 9 }],
    ['systemField', { systemField: null }],
    ['archivedAt', { archivedAt: '2026-09-13T00:00:00.000Z' }],
    ['conditionValue', { conditionValue: 'true' }],
  ])('detecta el cambio de %s', (_campo, over: Partial<ManifestQuestion>) => {
    const cambiada = question(over);
    expect(
      contentEqual(
        contentOf.question(question()),
        contentOf.question(cambiada),
      ),
    ).toBe(false);
  });

  it('ignora el hash de una opción pero detecta su metadata', () => {
    expect(
      contentEqual(
        contentOf.option(option({ hash: 'uno' })),
        contentOf.option(option({ hash: 'dos' })),
      ),
    ).toBe(true);
    expect(
      contentEqual(
        contentOf.option(option()),
        contentOf.option(option({ metadata: { kind: 'crop', key: 'Cacao' } })),
      ),
    ).toBe(false);
  });

  it('ignora las secciones al comparar el instrumento, pero detecta isActive y code', () => {
    expect(
      contentEqual(
        contentOf.instrument(instrument()),
        contentOf.instrument(instrument({ sections: [] })),
      ),
    ).toBe(true);
    expect(
      contentEqual(
        contentOf.instrument(instrument()),
        contentOf.instrument(instrument({ isActive: false })),
      ),
    ).toBe(false);
  });

  it('ignora las preguntas al comparar la sección, pero detecta nombre y orden', () => {
    expect(
      contentEqual(
        contentOf.section(section()),
        contentOf.section(section({ questions: [] })),
      ),
    ).toBe(true);
    expect(
      contentEqual(
        contentOf.section(section()),
        contentOf.section(section({ name: 'Ubicación' })),
      ),
    ).toBe(false);
  });
});
