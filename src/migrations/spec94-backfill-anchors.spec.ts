import type { QueryRunner } from 'typeorm';
import { Spec94BackfillAnchors1788400000003 } from './1788400000003-Spec94BackfillAnchors';

/**
 * Spec 94, Fase 2 — pruebas SIN base de datos de la migración 4: el orden de
 * los pasos, la auditoría y la prioridad del cultivo de finca (paso c). El
 * comportamiento real contra Postgres (relanzable, `down` exacto) lo cubre
 * `e2e-094` (C2, C3, C4, C10).
 */

const uuid = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const FARM_A = uuid(1);
const FARM_B = uuid(2);
const CAFE = uuid(10);
const CACAO = uuid(11);
const FC_A_CAFE = uuid(20);
const FC_A_CACAO = uuid(21);
const FC_B_CAFE = uuid(22);
const SESSION_1 = uuid(30);

const S_SESSION_CROP = uuid(40); // sesión con un cultivo → Cacao
const S_RESOLVED = uuid(41); // sin sesión; las respuestas resuelven Café
const S_AMBIGUOUS = uuid(42); // finca con 2 cultivos y nada que decida
const S_SINGLE = uuid(43); // finca B con un único cultivo

function fakeRunner(overrides: { auditExists?: boolean } = {}) {
  const calls: { sql: string; params: unknown[] }[] = [];
  const runner = {
    query: jest.fn((sql: string, params: unknown[] = []) => {
      const text = sql.replace(/\s+/g, ' ').trim();
      calls.push({ sql: text, params });
      if (text.startsWith('SELECT survey_id, farm_id, campaign_session_id')) {
        return Promise.resolve([
          {
            survey_id: S_SESSION_CROP,
            farm_id: FARM_A,
            campaign_session_id: SESSION_1,
          },
          { survey_id: S_RESOLVED, farm_id: FARM_A, campaign_session_id: null },
          {
            survey_id: S_AMBIGUOUS,
            farm_id: FARM_A,
            campaign_session_id: null,
          },
          { survey_id: S_SINGLE, farm_id: FARM_B, campaign_session_id: null },
        ]);
      }
      if (
        text.startsWith('SELECT crop_id AS "cropId", name FROM types_of_crops')
      ) {
        return Promise.resolve([
          { cropId: CAFE, name: 'Café' },
          { cropId: CACAO, name: 'Cacao' },
        ]);
      }
      if (
        text.startsWith(
          'SELECT farm_id, farm_crop_id, crop_id FROM farms_crops',
        )
      ) {
        return Promise.resolve([
          { farm_id: FARM_A, farm_crop_id: FC_A_CAFE, crop_id: CAFE },
          { farm_id: FARM_A, farm_crop_id: FC_A_CACAO, crop_id: CACAO },
          { farm_id: FARM_B, farm_crop_id: FC_B_CAFE, crop_id: CAFE },
        ]);
      }
      if (text.includes('FROM campaign_sessions_crops')) {
        return Promise.resolve([{ session_id: SESSION_1, crop_id: CACAO }]);
      }
      if (text.includes('FROM responses r')) {
        return Promise.resolve([
          {
            survey_id: S_RESOLVED,
            systemField: 'farm.mainCrop',
            booleanValue: null,
            optionText: 'Café',
            metadataId: CAFE,
          },
        ]);
      }
      if (text.startsWith("SELECT to_regclass('spec94_backfill_audit')")) {
        return Promise.resolve([
          {
            name:
              overrides.auditExists === false ? null : 'spec94_backfill_audit',
          },
        ]);
      }
      return Promise.resolve([]);
    }),
  };
  return { runner: runner as unknown as QueryRunner, calls };
}

describe('Spec94BackfillAnchors', () => {
  const migration = new Spec94BackfillAnchors1788400000003();

  it('up crea la auditoría con IF NOT EXISTS y la usa en cada paso (ON CONFLICT DO NOTHING)', async () => {
    const { runner, calls } = fakeRunner();
    await migration.up(runner);

    expect(calls[0].sql).toContain(
      'CREATE TABLE IF NOT EXISTS "spec94_backfill_audit"',
    );
    const audited = calls.filter((c) =>
      c.sql.includes('INSERT INTO spec94_backfill_audit'),
    );
    // f, a, b, (c), d, e.farmer_id, e.survey_id
    expect(audited.length).toBeGreaterThanOrEqual(7);
    for (const call of audited) {
      expect(call.sql).toContain('ON CONFLICT DO NOTHING');
    }
  });

  it('el paso f (sesión ← encuestas) va antes que el a (encuesta ← sesión) para que el resultado sea un punto fijo', async () => {
    const { runner, calls } = fakeRunner();
    await migration.up(runner);
    const sql = calls.map((c) => c.sql);
    const f = sql.findIndex((q) =>
      q.includes('UPDATE campaign_sessions cs SET farmer_id'),
    );
    const a = sql.findIndex((q) =>
      q.includes('UPDATE surveys s SET farmer_id = cs.farmer_id'),
    );
    const b = sql.findIndex((q) =>
      q.includes('UPDATE surveys s SET farm_id = ff.farm_id'),
    );
    const d = sql.findIndex((q) =>
      q.includes('UPDATE surveys s SET crop_id = fc.crop_id'),
    );
    expect(f).toBeGreaterThan(0);
    expect(f).toBeLessThan(a);
    expect(a).toBeLessThan(b);
    expect(b).toBeLessThan(d);
  });

  it('paso c: sesión → respuestas → único cultivo activo → NULL (ambiguo)', async () => {
    const { runner, calls } = fakeRunner();
    await migration.up(runner);

    const update = calls.find((c) =>
      c.sql.includes('UPDATE surveys s SET farm_crop_id = v.farm_crop_id'),
    );
    expect(update).toBeDefined();
    const [surveyIds, farmCropIds] = update!.params as [string[], string[]];
    const picked = new Map(surveyIds.map((id, i) => [id, farmCropIds[i]]));

    expect(picked.get(S_SESSION_CROP)).toBe(FC_A_CACAO); // único cultivo de la sesión
    expect(picked.get(S_RESOLVED)).toBe(FC_A_CAFE); // resuelto por las respuestas
    expect(picked.get(S_SINGLE)).toBe(FC_B_CAFE); // único cultivo activo de la finca
    expect(picked.has(S_AMBIGUOUS)).toBe(false); // ambiguo: queda NULL
  });

  it('down restaura desde la auditoría en orden (derivados primero) y la elimina', async () => {
    const { runner, calls } = fakeRunner();
    await migration.down(runner);

    const restores = calls
      .filter((c) => c.sql.startsWith('UPDATE "'))
      .map((c) => `${c.params[0] as string}.${c.params[1] as string}`);
    expect(restores).toEqual([
      'surveys.crop_id',
      'surveys.farm_crop_id',
      'surveys.farm_id',
      'surveys.farmer_id',
      'consent_records.survey_id',
      'consent_records.farmer_id',
      'campaign_sessions.farmer_id',
    ]);
    // Solo se restaura lo que sigue valiendo lo que escribió el backfill.
    for (const c of calls.filter((x) => x.sql.startsWith('UPDATE "'))) {
      expect(c.sql).toContain('IS NOT DISTINCT FROM a.new_value');
    }
    // Devolver farm_id a NULL anula también farm_crop_id (CHK_surveys_farm_crop_requires_farm).
    const farmRestore = calls.find(
      (c) => c.sql.startsWith('UPDATE "') && c.params[1] === 'farm_id',
    );
    expect(farmRestore?.sql).toContain(
      '"farm_crop_id" = CASE WHEN a.previous_value IS NULL THEN NULL ELSE t."farm_crop_id" END',
    );
    expect(calls[calls.length - 1].sql).toBe(
      'DROP TABLE "spec94_backfill_audit"',
    );
  });

  it('down sin tabla de auditoría no hace nada', async () => {
    const { runner, calls } = fakeRunner({ auditExists: false });
    await migration.down(runner);
    expect(calls).toHaveLength(1);
  });
});
