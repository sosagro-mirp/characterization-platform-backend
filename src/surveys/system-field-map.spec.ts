import { Response } from 'src/responses/entities/response.entity';
import {
  buildSystemFieldMap,
  buildSystemFieldMapWithWarnings,
} from './system-field-map';

/**
 * Spec 84 (Fase 8, 4.ª ronda de test-084) — el género del Registro se
 * respondía pero no llegaba a `farmers.gender`: la pregunta es de selección y
 * guarda la opción, no un valor escalar.
 */
const response = (systemField: string | undefined, fields: object): Response =>
  ({ question: { systemField }, ...fields }) as unknown as Response;

describe('buildSystemFieldMap', () => {
  it('usa el texto de la opción en preguntas de selección (farmer.gender)', () => {
    const map = buildSystemFieldMap([
      response('farmer.gender', { option: { text: 'Hombre' } }),
    ]);
    expect(map['farmer.gender']).toBe('Hombre');
  });

  it('conserva los valores escalares de texto, número y sí/no', () => {
    const map = buildSystemFieldMap([
      response('farmer.name', { textValue: 'Pedro Leon Jaramillo' }),
      response('farmer.age', { numericValue: 60 }),
      response('farmer.isRespondent', { booleanValue: false }),
    ]);
    expect(map).toEqual({
      'farmer.name': 'Pedro Leon Jaramillo',
      'farmer.age': 60,
      'farmer.isRespondent': false,
    });
  });

  it('no mete farm.town ni respuestas sin systemField', () => {
    const map = buildSystemFieldMap([
      response('farm.town', { option: { text: 'Jardín' } }),
      response(undefined, { option: { text: 'Productor' } }),
    ]);
    expect(map).toEqual({});
  });
});

describe('buildSystemFieldMapWithWarnings (spec 93)', () => {
  it('concatena las opciones múltiples ordenadas con «; »', () => {
    const { fieldMap, warnings } = buildSystemFieldMapWithWarnings([
      response('farm.waterSourceType', { option: { text: 'Nacimiento' } }),
      response('farm.waterSourceType', {
        option: { text: 'Acueducto veredal' },
      }),
    ]);
    expect(fieldMap['farm.waterSourceType']).toBe(
      'Acueducto veredal; Nacimiento',
    );
    expect(warnings).toEqual([]);
  });

  it('recorta a 100 caracteres y advierte multi_value_truncated', () => {
    const long = ['A'.repeat(60), 'B'.repeat(60)];
    const { fieldMap, warnings } = buildSystemFieldMapWithWarnings(
      long.map((text) => response('farm.mainAccessType', { option: { text } })),
    );
    expect(String(fieldMap['farm.mainAccessType']).length).toBeLessThanOrEqual(
      100,
    );
    expect(
      String(fieldMap['farm.mainAccessType']).startsWith('A'.repeat(60)),
    ).toBe(true);
    expect(warnings.map((w) => w.code)).toEqual(['multi_value_truncated']);
  });

  it('una sola opción queda igual que antes', () => {
    const map = buildSystemFieldMap([
      response('farm.mainAccessType', { option: { text: 'Carretera' } }),
    ]);
    expect(map['farm.mainAccessType']).toBe('Carretera');
  });

  it('no concatena el resto de los campos (el último gana, como antes)', () => {
    const map = buildSystemFieldMap([
      response('farm.vereda', { textValue: 'Uno' }),
      response('farm.vereda', { textValue: 'Dos' }),
    ]);
    expect(map['farm.vereda']).toBe('Dos');
  });

  it('convierte farm.area según la unidad y advierte', () => {
    const m2 = buildSystemFieldMapWithWarnings([
      response('farm.area', { numericValue: 25_000, option: { text: 'm²' } }),
    ]);
    expect(m2.fieldMap['farm.area']).toBeCloseTo(2.5, 9);
    expect(m2.warnings.map((w) => w.code)).toEqual(['area_converted']);

    const ha = buildSystemFieldMapWithWarnings([
      response('farm.area', { numericValue: 3, option: { text: 'ha' } }),
    ]);
    expect(ha.fieldMap['farm.area']).toBe(3);
    expect(ha.warnings).toEqual([]);
  });

  it('unidad desconocida deja el área fuera del mapa y advierte', () => {
    const r = buildSystemFieldMapWithWarnings([
      response('farm.area', { numericValue: 2, option: { text: 'fanegada' } }),
    ]);
    expect(r.fieldMap['farm.area']).toBeUndefined();
    expect(r.warnings.map((w) => w.code)).toEqual(['area_unit_unknown']);
  });

  it('área sin opción de unidad se toma tal cual', () => {
    const map = buildSystemFieldMap([
      response('farm.area', { numericValue: 7 }),
    ]);
    expect(map['farm.area']).toBe(7);
  });
});
