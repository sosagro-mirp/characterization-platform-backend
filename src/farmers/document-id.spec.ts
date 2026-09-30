import { normalizeDocumentId, selectFarmerByDocument } from './document-id';

describe('normalizeDocumentId', () => {
  it('quita puntos, espacios y guiones', () => {
    expect(normalizeDocumentId('1.234.567-8')).toBe('12345678');
    expect(normalizeDocumentId(' 123 456 789 ')).toBe('123456789');
    expect(normalizeDocumentId('123 456-789')).toBe('123456789');
  });

  it('acepta números', () => {
    expect(normalizeDocumentId(93123401)).toBe('93123401');
  });

  it('devuelve null si no queda nada', () => {
    expect(normalizeDocumentId(null)).toBeNull();
    expect(normalizeDocumentId(undefined)).toBeNull();
    expect(normalizeDocumentId(' - . ')).toBeNull();
  });

  it('conserva letras (pasaportes, NIT con dígito)', () => {
    expect(normalizeDocumentId('AB-123.4')).toBe('AB1234');
  });
});

describe('selectFarmerByDocument', () => {
  const oldest = { id: 'a', name: 'Otro Nombre Distinto' };
  const matching = { id: 'b', name: 'Carmen Rojas Vega' };
  const matchingLater = { id: 'c', name: 'Carmen Rojas Vega' };

  it('prefiere al que coincide en nombre sobre el más antiguo', () => {
    const r = selectFarmerByDocument([oldest, matching], 'Carmen Rojas Vega');
    expect(r.match).toBe(matching);
    expect(r.collisionWith).toBeNull();
  });

  it('entre varios que coinciden elige el primero (más antiguo)', () => {
    const r = selectFarmerByDocument(
      [oldest, matching, matchingLater],
      'Carmen Rojas Vega',
    );
    expect(r.match).toBe(matching);
  });

  it('sin coincidencia de nombre marca colisión con el más antiguo', () => {
    const r = selectFarmerByDocument(
      [oldest, matching],
      'Lucia Fernandez Rios',
    );
    expect(r.match).toBeNull();
    expect(r.collisionWith).toBe(oldest);
  });

  it('sin candidatos no hay coincidencia ni colisión', () => {
    expect(selectFarmerByDocument([], 'Ana Ruiz')).toEqual({
      match: null,
      collisionWith: null,
    });
  });
});
