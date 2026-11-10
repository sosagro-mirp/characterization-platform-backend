import { DOCUMENT_TYPES, resolveDocumentType } from './document-type';

describe('resolveDocumentType', () => {
  it('acepta el código mismo, sin importar mayúsculas ni espacios', () => {
    for (const code of DOCUMENT_TYPES) {
      expect(resolveDocumentType(code)).toBe(code);
      expect(resolveDocumentType(` ${code.toLowerCase()} `)).toBe(code);
    }
  });

  it('resuelve el texto de la opción, con o sin tildes', () => {
    expect(resolveDocumentType('Cédula de ciudadanía')).toBe('CC');
    expect(resolveDocumentType('Cedula')).toBe('CC');
    expect(resolveDocumentType('Tarjeta de identidad')).toBe('TI');
    expect(resolveDocumentType('Cédula de extranjería')).toBe('CE');
    expect(resolveDocumentType('Permiso por protección temporal')).toBe('PPT');
    expect(resolveDocumentType('Permiso especial de permanencia')).toBe('PEP');
    expect(resolveDocumentType('Número de identificación tributaria')).toBe(
      'NIT',
    );
    expect(resolveDocumentType('Otro')).toBe('OTRO');
  });

  it('respeta el orden de las reglas: extranjería no cae en CC', () => {
    expect(resolveDocumentType('Cédula de extranjería')).toBe('CE');
  });

  it('devuelve null si no lo reconoce o no es texto', () => {
    expect(resolveDocumentType('Pasaporte')).toBeNull();
    expect(resolveDocumentType('')).toBeNull();
    expect(resolveDocumentType('   ')).toBeNull();
    expect(resolveDocumentType(42)).toBeNull();
    expect(resolveDocumentType(null)).toBeNull();
  });
});
