import { contentHash, stableStringify } from './hash';

/**
 * Spec 84 — el hash identifica el contenido de una entidad entre entornos.
 * Si dependiera del orden de las claves, dos entornos con el mismo contenido
 * darían hashes distintos y el plan reportaría cambios inexistentes.
 */
describe('stableStringify', () => {
  it('no depende del orden de las claves', () => {
    expect(stableStringify({ a: 1, b: 2 })).toBe(
      stableStringify({ b: 2, a: 1 }),
    );
  });

  it('sí depende del orden de los elementos de un array', () => {
    expect(stableStringify([1, 2])).not.toBe(stableStringify([2, 1]));
  });

  it('ordena claves de forma recursiva', () => {
    const a = { outer: { z: 1, a: { y: 2, b: 3 } } };
    const b = { outer: { a: { b: 3, y: 2 }, z: 1 } };
    expect(stableStringify(a)).toBe(stableStringify(b));
  });

  it('distingue null de undefined y de la ausencia de la clave', () => {
    expect(stableStringify({ a: null })).not.toBe(stableStringify({}));
  });

  it('distingue tipos que se ven iguales al imprimirlos', () => {
    expect(stableStringify({ a: 1 })).not.toBe(stableStringify({ a: '1' }));
  });
});

describe('contentHash', () => {
  it('es estable entre llamadas', () => {
    const value = { text: 'Nombre completo', order: 1 };
    expect(contentHash(value)).toBe(contentHash(value));
  });

  it('coincide para objetos equivalentes con distinto orden de claves', () => {
    expect(contentHash({ a: 1, b: 'x' })).toBe(contentHash({ b: 'x', a: 1 }));
  });

  it('cambia si cambia cualquier valor', () => {
    expect(contentHash({ text: 'Municipio' })).not.toBe(
      contentHash({ text: 'Municipios' }),
    );
  });
});
