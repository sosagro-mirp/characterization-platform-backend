import { createdInstrumentIds } from './apply';
import { blockedCreatedInstruments } from './restore';
import { Plan } from './types';

/**
 * Spec 84 (TC-084-014) — `restore` debe quitar los instrumentos que creó la
 * promoción, pero nunca uno que ya tenga respuestas, encuestas o pasos de
 * campaña: borrar un instrumento arrastra en cascada sus respuestas.
 */
describe('createdInstrumentIds', () => {
  it('toma solo los instrumentos que el plan crea', () => {
    const plan = {
      operations: [
        {
          kind: 'create',
          entity: 'instrument',
          id: 'i-nuevo',
          instrumentId: 'i-nuevo',
        },
        {
          kind: 'update',
          entity: 'instrument',
          id: 'i-viejo',
          instrumentId: 'i-viejo',
        },
        {
          kind: 'create',
          entity: 'section',
          id: 's-1',
          instrumentId: 'i-nuevo',
        },
      ],
    } as unknown as Plan;
    expect(createdInstrumentIds(plan)).toEqual(['i-nuevo']);
  });
});

describe('blockedCreatedInstruments', () => {
  const sinUso = {
    instrumentId: 'i-1',
    name: 'S_REG: Registro del productor',
    responses: 0,
    surveys: 0,
    campaignSteps: 0,
  };

  it('permite quitar un instrumento creado sin uso', () => {
    expect(blockedCreatedInstruments([sinUso])).toEqual([]);
  });

  it.each([
    ['respuestas', { responses: 3 }],
    ['encuestas', { surveys: 1 }],
    ['pasos de campaña', { campaignSteps: 2 }],
  ])('bloquea un instrumento creado que ya tiene %s', (_, uso) => {
    const bloqueados = blockedCreatedInstruments([{ ...sinUso, ...uso }]);
    expect(bloqueados).toHaveLength(1);
    expect(bloqueados[0]).toContain('S_REG: Registro del productor');
  });
});
