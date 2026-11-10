import { archivedAtSelect } from './export';

/**
 * Spec 84 (TC-084-014) — `archived_at` debe viajar entre bases sin zona
 * horaria para que un plan tras `apply` dé 0 operaciones.
 */
describe('archivedAtSelect', () => {
  it('exporta la columna como texto sin zona horaria', () => {
    const sql = archivedAtSelect('q.archived_at');
    expect(sql).toBe(
      `to_char(q.archived_at, 'YYYY-MM-DD"T"HH24:MI:SS.US') AS archived_at`,
    );
    expect(sql).not.toMatch(/TZ|OF|Z"/);
  });
});
