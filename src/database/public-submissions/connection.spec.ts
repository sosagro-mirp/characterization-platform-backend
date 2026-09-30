import {
  assertWriteAllowed,
  describeTarget,
  looksLikeProduction,
  parseArgs,
} from './connection';

describe('parseArgs', () => {
  it('separa el subcomando de las banderas y los valores', () => {
    const { command, flags } = parseArgs([
      'apply',
      '--decisions',
      'd.json',
      '--production-target-confirm',
      '--reviewed-by',
      'u-1',
    ]);
    expect(command).toBe('apply');
    expect(flags).toEqual({
      decisions: 'd.json',
      'production-target-confirm': true,
      'reviewed-by': 'u-1',
    });
  });
});

describe('looksLikeProduction / describeTarget', () => {
  it('reconoce Neon y Railway, también las ramas de Neon', () => {
    expect(looksLikeProduction('postgres://u:p@ep-x.neon.tech/db')).toBe(true);
    expect(looksLikeProduction('postgres://u:p@x.railway.app/db')).toBe(true);
    expect(looksLikeProduction('postgres://u:p@localhost:5433/db')).toBe(false);
  });

  it('no filtra credenciales al describir el destino', () => {
    const described = describeTarget(
      'postgres://user:secret@host.neon.tech/db',
    );
    expect(described).toBe('host.neon.tech/db');
    expect(described).not.toContain('secret');
  });
});

describe('assertWriteAllowed', () => {
  const prod = 'postgres://u:p@ep-x.neon.tech/db';

  it('no exige nada en un destino que no parece producción', () => {
    expect(() =>
      assertWriteAllowed({
        url: 'postgres://localhost/db',
        flags: {},
        expectedCount: 3,
        typedCount: null,
      }),
    ).not.toThrow();
  });

  it('exige el flag de confirmación contra producción', () => {
    expect(() =>
      assertWriteAllowed({
        url: prod,
        flags: {},
        expectedCount: 3,
        typedCount: '3',
      }),
    ).toThrow('--production-target-confirm');
  });

  it('exige escribir el número de envíos y que coincida', () => {
    const flags = { 'production-target-confirm': true };
    expect(() =>
      assertWriteAllowed({
        url: prod,
        flags,
        expectedCount: 3,
        typedCount: null,
      }),
    ).toThrow('número de envíos');
    expect(() =>
      assertWriteAllowed({
        url: prod,
        flags,
        expectedCount: 3,
        typedCount: '4',
      }),
    ).toThrow('no coincide');
    expect(() =>
      assertWriteAllowed({
        url: prod,
        flags,
        expectedCount: 3,
        typedCount: ' 3 ',
      }),
    ).not.toThrow();
  });
});
