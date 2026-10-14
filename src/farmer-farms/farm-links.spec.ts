import type { EntityManager } from 'typeorm';
import {
  addFarmCrops,
  anchorSurvey,
  getPrimaryFarmId,
  linkFarmerToFarm,
  resolveFarmerFarmId,
  promoteToPrimary,
} from './farm-links';

type Call = { sql: string; params: unknown[] };

/** `EntityManager` mínimo: registra el SQL y responde con filas preparadas. */
function fakeManager(
  respond: (sql: string, params: unknown[]) => unknown[] = () => [],
) {
  const calls: Call[] = [];
  const manager = {
    query: jest.fn((sql: string, params: unknown[] = []) => {
      calls.push({ sql: sql.replace(/\s+/g, ' ').trim(), params });
      return Promise.resolve(respond(sql, params));
    }),
  } as unknown as EntityManager;
  return { manager, calls };
}

describe('anchorSurvey (spec 94, D-H3-9)', () => {
  it('con un cultivo de finca deriva crop_id y, sin farmId, también farm_id', async () => {
    const { manager, calls } = fakeManager();
    await anchorSurvey(manager, 's-1', { farmCropId: 'fc-1' });
    expect(calls).toHaveLength(1);
    expect(calls[0].sql).toContain('farm_crop_id = $2::uuid');
    expect(calls[0].sql).toContain(
      '(SELECT fc.crop_id FROM farms_crops fc WHERE fc.farm_crop_id = $2::uuid)',
    );
    expect(calls[0].sql).toContain(
      'farm_id = (SELECT fc.farm_id FROM farms_crops fc',
    );
    expect(calls[0].params).toEqual(['s-1', 'fc-1']);
  });

  it('con farmId y cultivo, respeta la finca indicada (la FK compuesta valida)', async () => {
    const { manager, calls } = fakeManager();
    await anchorSurvey(manager, 's-1', {
      farmerId: 'p-1',
      farmId: 'f-1',
      farmCropId: 'fc-1',
    });
    expect(calls[0].sql).toContain('farmer_id = $2::uuid');
    expect(calls[0].sql).toContain('farm_id = $3::uuid');
    expect(calls[0].sql).not.toContain('farm_id = (SELECT');
    expect(calls[0].params).toEqual(['s-1', 'p-1', 'f-1', 'fc-1']);
  });

  it('solo escribe lo indicado; undefined no toca la columna', async () => {
    const { manager, calls } = fakeManager();
    await anchorSurvey(manager, 's-1', { farmerId: 'p-1' });
    expect(calls[0].sql).toBe(
      'UPDATE surveys SET farmer_id = $2::uuid WHERE survey_id = $1',
    );
  });

  it('cambiar de finca sin indicar cultivo conserva el cultivo solo si es de la nueva finca', async () => {
    const { manager, calls } = fakeManager();
    await anchorSurvey(manager, 's-1', { farmId: 'f-1' });
    expect(calls[0].sql).toContain('farm_id = $2::uuid');
    expect(calls[0].sql).toContain(
      'farm_crop_id = CASE WHEN EXISTS (SELECT 1 FROM farms_crops fc WHERE fc.farm_crop_id = surveys.farm_crop_id AND fc.farm_id = $2::uuid) THEN farm_crop_id ELSE NULL END',
    );
    expect(calls[0].sql).toContain(
      'crop_id = CASE WHEN surveys.farm_crop_id IS NULL OR EXISTS (SELECT 1 FROM farms_crops fc WHERE fc.farm_crop_id = surveys.farm_crop_id AND fc.farm_id = $2::uuid) THEN crop_id ELSE NULL END',
    );
  });

  it('sin nada que escribir no consulta la base', async () => {
    const { manager, calls } = fakeManager();
    await anchorSurvey(manager, 's-1', {});
    expect(calls).toHaveLength(0);
  });

  it('farmCropId null limpia el cultivo y crop_id (derivado)', async () => {
    const { manager, calls } = fakeManager();
    await anchorSurvey(manager, 's-1', { farmCropId: null });
    expect(calls[0].sql).toBe(
      'UPDATE surveys SET farm_crop_id = NULL, crop_id = NULL WHERE survey_id = $1',
    );
  });
});

describe('linkFarmerToFarm (spec 94, D1)', () => {
  /** Responde a las consultas del helper según el estado simulado. */
  function stateful(opts: { existing?: boolean; primaryFarmId?: string }) {
    return fakeManager((sql) => {
      if (/SELECT is_primary FROM farmer_farms/.test(sql)) {
        return opts.existing ? [{ is_primary: false }] : [];
      }
      if (/SELECT farm_id FROM farmer_farms/.test(sql)) {
        return opts.primaryFarmId ? [{ farm_id: opts.primaryFarmId }] : [];
      }
      return [];
    });
  }
  const sqls = (calls: Call[]) => calls.map((c) => c.sql);

  it('el primer vínculo queda principal aunque no se indique y actualiza el espejo', async () => {
    const { manager, calls } = stateful({});
    const result = await linkFarmerToFarm(manager, {
      farmerId: 'p-1',
      farmId: 'f-1',
      source: 'extraction',
    });
    expect(result).toEqual({ created: true, isPrimary: true });
    const all = sqls(calls);
    expect(all.some((s) => s.startsWith('INSERT INTO farmer_farms'))).toBe(
      true,
    );
    expect(all).toContain('UPDATE farmers SET farm_id = $2 WHERE id = $1');
    // No había principal que desplazar.
    expect(all.some((s) => s.includes('SET is_primary = false'))).toBe(false);
    const insert = calls.find((c) => c.sql.startsWith('INSERT INTO'));
    expect(insert?.params).toEqual([
      'p-1',
      'f-1',
      'producer',
      true,
      'extraction',
    ]);
  });

  it('isPrimary:true desplaza a la principal ANTES de insertar (índice único parcial)', async () => {
    const { manager, calls } = stateful({ primaryFarmId: 'f-old' });
    const result = await linkFarmerToFarm(manager, {
      farmerId: 'p-1',
      farmId: 'f-2',
      isPrimary: true,
      source: 'admin',
    });
    expect(result.isPrimary).toBe(true);
    const all = sqls(calls);
    const displace = all.findIndex((s) => s.includes('SET is_primary = false'));
    const insert = all.findIndex((s) => s.startsWith('INSERT INTO'));
    expect(displace).toBeGreaterThanOrEqual(0);
    expect(displace).toBeLessThan(insert);
    expect(all).toContain('UPDATE farmers SET farm_id = $2 WHERE id = $1');
  });

  it('con otra principal y sin isPrimary, el vínculo nuevo NO es principal y no toca el espejo', async () => {
    const { manager, calls } = stateful({ primaryFarmId: 'f-old' });
    const result = await linkFarmerToFarm(manager, {
      farmerId: 'p-1',
      farmId: 'f-2',
      role: 'worker',
      source: 'admin',
    });
    expect(result).toEqual({ created: true, isPrimary: false });
    expect(sqls(calls).some((s) => s.startsWith('UPDATE farmers'))).toBe(false);
  });

  it('un vínculo que ya existe no se modifica (idempotente)', async () => {
    const { manager, calls } = stateful({ existing: true });
    const result = await linkFarmerToFarm(manager, {
      farmerId: 'p-1',
      farmId: 'f-1',
      source: 'extraction',
    });
    expect(result.created).toBe(false);
    expect(sqls(calls).some((s) => s.startsWith('INSERT'))).toBe(false);
  });
});

describe('promoteToPrimary / addFarmCrops', () => {
  it('promoteToPrimary libera la anterior, marca la nueva y actualiza el espejo', async () => {
    const { manager, calls } = fakeManager();
    await promoteToPrimary(manager, 'p-1', 'f-2');
    expect(calls.map((c) => c.sql)).toEqual([
      expect.stringContaining('SET is_primary = false'),
      expect.stringContaining('SET is_primary = true'),
      'UPDATE farmers SET farm_id = $2 WHERE id = $1',
    ]);
  });

  it('addFarmCrops es aditivo: reactiva con ON CONFLICT y deduplica', async () => {
    const { manager, calls } = fakeManager(() => [
      { farm_crop_id: 'fc-1', crop_id: 'c-1' },
    ]);
    const result = await addFarmCrops(manager, 'f-1', ['c-1', 'c-1']);
    expect(result).toEqual([{ farmCropId: 'fc-1', cropId: 'c-1' }]);
    expect(calls[0].sql).toContain(
      'ON CONFLICT (farm_id, crop_id) DO UPDATE SET archived_at = NULL',
    );
    expect(calls[0].sql).not.toMatch(/DELETE/i);
    expect(calls[0].params).toEqual(['f-1', ['c-1']]);
  });

  it('addFarmCrops sin cultivos no consulta la base', async () => {
    const { manager, calls } = fakeManager();
    expect(await addFarmCrops(manager, 'f-1', [])).toEqual([]);
    expect(calls).toHaveLength(0);
  });
});

describe('getPrimaryFarmId (spec 94)', () => {
  it('devuelve la finca principal de farmer_farms', async () => {
    const { manager } = fakeManager((sql) =>
      sql.includes('FROM farmer_farms') ? [{ farm_id: 'farm-1' }] : [],
    );
    await expect(getPrimaryFarmId(manager, 'f-1')).resolves.toBe('farm-1');
  });

  it('es estricta: sin vínculo principal NO usa el espejo farmers.farm_id', async () => {
    const { manager, calls } = fakeManager((sql) =>
      sql.includes('FROM farmers') ? [{ farm_id: 'farm-legacy' }] : [],
    );
    await expect(getPrimaryFarmId(manager, 'f-1')).resolves.toBeNull();
    expect(calls).toHaveLength(1);
  });
});

describe('resolveFarmerFarmId (spec 94)', () => {
  it('prefiere la principal de farmer_farms', async () => {
    const { manager, calls } = fakeManager((sql) =>
      sql.includes('FROM farmer_farms') ? [{ farm_id: 'farm-1' }] : [],
    );
    await expect(resolveFarmerFarmId(manager, 'f-1')).resolves.toBe('farm-1');
    expect(calls).toHaveLength(1);
  });

  it('sin vínculo principal, usa el espejo farmers.farm_id', async () => {
    const { manager, calls } = fakeManager((sql) =>
      sql.includes('FROM farmers') ? [{ farm_id: 'farm-legacy' }] : [],
    );
    await expect(resolveFarmerFarmId(manager, 'f-1')).resolves.toBe(
      'farm-legacy',
    );
    expect(calls).toHaveLength(2);
  });

  it('sin vínculo ni espejo, devuelve null', async () => {
    const { manager } = fakeManager(() => []);
    await expect(resolveFarmerFarmId(manager, 'f-1')).resolves.toBeNull();
  });
});
