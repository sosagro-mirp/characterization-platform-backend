/**
 * Spec 68, Fase 1 — cobertura completa de la § "Batería de casos de nombres".
 * Fuente de verdad: `spec/68_colision_documentid_entre_agricultores.md`.
 * Esta misma tabla se replica en `mobile/src/__tests__/nameMatching.test.ts`
 * (el móvil reimplementa `isSameFarmerName` sin paquete compartido).
 */
import { isSameFarmerName } from './name-matching';

const REGISTERED = 'Santiago Suarez Cortes';

describe('isSameFarmerName — batería de casos de nombres (spec 68)', () => {
  const cases: { label: string; submitted: string; sameName: boolean }[] = [
    { label: '1. persona distinta', submitted: 'Karol Vanessa Quintero Marin', sameName: false },
    { label: '2. idéntico', submitted: 'Santiago Suarez Cortes', sameName: true },
    { label: '3. tildes y mayúsculas', submitted: 'SANTIAGO SUAREZ CORTES', sameName: true },
    { label: '4. espacios repetidos', submitted: 'Santiago  Suarez   Cortes', sameName: true },
    { label: '5. subconjunto (apellido omitido)', submitted: 'Santiago Suarez', sameName: true },
    { label: '7. error de tipeo dentro del umbral', submitted: 'Santigo Suarez Cortes', sameName: true },
    { label: '8. otro primer nombre', submitted: 'Maria Suarez Cortes', sameName: false },
    { label: '9. ningún apellido en común', submitted: 'Santiago Quintero Marin', sameName: false },
    { label: '10. primer nombre + un apellido en común', submitted: 'Santiago Suarez Marin', sameName: true },
    { label: '11. puntuación', submitted: 'Santiago Suarez Cortes.', sameName: true },
    { label: '14. nombres cortos idénticos', submitted: 'Santiago Suarez Cortes', sameName: true },
  ];

  it.each(cases)('$label → $submitted', ({ submitted, sameName }) => {
    expect(isSameFarmerName(REGISTERED, submitted)).toBe(sameName);
  });

  it('6. subconjunto en el sentido inverso', () => {
    expect(isSameFarmerName('Santiago Suarez', REGISTERED)).toBe(true);
  });

  it('12. abreviatura tras normalizar puntuación', () => {
    expect(isSameFarmerName('Ana Maria Lopez', 'Ana M. Lopez')).toBe(true);
  });

  it('13. sin nombre registrado no hay con qué comparar → conservador', () => {
    expect(isSameFarmerName('', 'Karol Vanessa Quintero Marin')).toBe(false);
    expect(isSameFarmerName(null, 'Karol Vanessa Quintero Marin')).toBe(false);
    expect(isSameFarmerName(undefined, 'Karol Vanessa Quintero Marin')).toBe(false);
    expect(isSameFarmerName(REGISTERED, '')).toBe(false);
  });

  it('14. nombres cortos idénticos', () => {
    expect(isSameFarmerName('Juan Perez', 'Juan Perez')).toBe(true);
  });

  it('15. "Juan" vs "Juana" — nombres distintos, no una errata (confirmado por el usuario)', () => {
    expect(isSameFarmerName('Juan Perez', 'Juana Perez')).toBe(false);
  });

  it('es simétrica: el orden de los argumentos no cambia el resultado', () => {
    const pairs: [string, string][] = [
      [REGISTERED, 'Karol Vanessa Quintero Marin'],
      [REGISTERED, 'Santiago Suarez'],
      [REGISTERED, 'Santigo Suarez Cortes'],
      [REGISTERED, 'Maria Suarez Cortes'],
      ['Ana Maria Lopez', 'Ana M. Lopez'],
      ['Juan Perez', 'Juana Perez'],
    ];
    for (const [a, b] of pairs) {
      expect(isSameFarmerName(a, b)).toBe(isSameFarmerName(b, a));
    }
  });
});
