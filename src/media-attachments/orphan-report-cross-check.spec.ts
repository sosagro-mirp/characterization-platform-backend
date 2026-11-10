/**
 * Spec 85, Fase 8 — guarda de `audit-orphan-media --delete` (revisión del
 * @reviewer, 2026-09-30).
 *
 * El bucket de R2 es compartido entre desarrollo y producción. Un informe
 * calculado contra UNA base marca como huérfano todo lo que vive en la otra,
 * así que borrar desde un solo informe puede arrasar con evidencia real. La
 * regla: solo se borra lo que es huérfano en DOS informes del mismo bucket,
 * generados contra bases distintas y recientes.
 */
import {
  OrphanReportSummary,
  selectCrossCheckedOrphans,
} from './orphan-report-cross-check';

const NOW = new Date('2026-09-30T23:00:00.000Z');
const BUCKET = 'sosagro-media';
const PROD = 'ep-prod.neon.tech';
const DEV = 'localhost:5433/sos-agro';

function report(
  database: string,
  orphanObjects: string[],
  overrides: Partial<OrphanReportSummary> = {},
): OrphanReportSummary {
  return {
    bucket: BUCKET,
    database,
    generatedAt: '2026-09-30T22:30:00.000Z',
    orphanObjects,
    ...overrides,
  };
}

const run = (
  primary: OrphanReportSummary,
  cross: OrphanReportSummary,
  env: { bucket?: string; database?: string } = {},
) =>
  selectCrossCheckedOrphans({
    primary,
    cross,
    envBucket: env.bucket ?? BUCKET,
    envDatabase: env.database ?? PROD,
    now: NOW,
  });

describe('selectCrossCheckedOrphans', () => {
  it('borra solo las claves huérfanas en ambos informes', () => {
    // `b` vive en desarrollo (no es huérfano allí): no se toca.
    const keys = run(
      report(PROD, ['a', 'b', 'c']),
      report(DEV, ['a', 'c', 'd']),
    );
    expect(keys.sort()).toEqual(['a', 'c']);
  });

  it('admite dos bases sin filas cuando ambas coinciden en los huérfanos', () => {
    expect(run(report(PROD, ['a']), report(DEV, ['a']))).toEqual(['a']);
  });

  it('aborta si los dos informes son de la misma base', () => {
    expect(() => run(report(PROD, ['a']), report(PROD, ['a']))).toThrow(
      /misma base/,
    );
  });

  it('aborta si algún informe es de otro bucket', () => {
    expect(() =>
      run(report(PROD, ['a']), report(DEV, ['a'], { bucket: 'otro' })),
    ).toThrow(/bucket/);
  });

  it('aborta si el .env no apunta al bucket de los informes', () => {
    expect(() =>
      run(report(PROD, ['a']), report(DEV, ['a']), { bucket: 'otro' }),
    ).toThrow(/bucket/);
  });

  it('aborta si el informe principal no es de la base del .env', () => {
    expect(() =>
      run(report(PROD, ['a']), report(DEV, ['a']), { database: DEV }),
    ).toThrow(/\.env/);
  });

  it('aborta si algún informe tiene más de 24 horas', () => {
    expect(() =>
      run(
        report(PROD, ['a']),
        report(DEV, ['a'], { generatedAt: '2026-09-29T20:00:00.000Z' }),
      ),
    ).toThrow(/24 horas/);
  });

  it('devuelve una lista vacía si no hay huérfanos comunes', () => {
    expect(run(report(PROD, ['a']), report(DEV, ['b']))).toEqual([]);
  });
});
