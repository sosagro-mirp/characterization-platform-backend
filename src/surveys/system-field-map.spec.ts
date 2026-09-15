import { Response } from 'src/responses/entities/response.entity';
import { buildSystemFieldMap } from './system-field-map';

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
