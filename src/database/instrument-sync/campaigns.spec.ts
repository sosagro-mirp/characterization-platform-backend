import { exportCampaigns, insertCampaigns } from './campaigns';
import type { Queryable } from './metadata';

/**
 * Spec 84, Fase 7 — la copia de campañas del snapshot. Dos reglas se prueban
 * aquí porque romperlas no da error, solo datos equivocados: el cultivo de una
 * condición viaja por nombre (los UUID de catálogo difieren entre entornos) y
 * los usuarios de producción no existen en desarrollo, así que las columnas de
 * auditoría se insertan en NULL.
 */

interface Recorded {
  sql: string;
  params: unknown[];
}

function fakeSource(rows: {
  campaigns: unknown[];
  steps: unknown[];
  conditions: unknown[];
}): Queryable {
  return {
    // eslint-disable-next-line @typescript-eslint/require-await
    query: (async (sql: string) => {
      if (/FROM campaigns/.test(sql)) return rows.campaigns;
      if (/FROM campaign_steps/.test(sql)) return rows.steps;
      if (/FROM step_conditions/.test(sql)) return rows.conditions;
      return [];
    }) as Queryable['query'],
  };
}

function fakeTarget(options: { instrumentExists?: boolean; cropId?: string }) {
  const recorded: Recorded[] = [];
  const manager = {
    // eslint-disable-next-line @typescript-eslint/require-await
    query: (async (sql: string, params: unknown[] = []) => {
      recorded.push({ sql, params });
      if (/FROM instruments/.test(sql)) {
        return options.instrumentExists === false ? [] : [{ ok: 'i-1' }];
      }
      if (/FROM types_of_crops/.test(sql)) {
        return options.cropId ? [{ id: options.cropId }] : [];
      }
      return [];
    }) as Queryable['query'],
  };
  return { manager, recorded };
}

const SOURCE_ROWS = {
  campaigns: [
    {
      campaign_id: 'c-1',
      name: 'Campaña Cacao',
      description: 'desc',
      is_active: true,
    },
  ],
  steps: [
    { step_id: 'st-1', campaign_id: 'c-1', instrument_id: 'i-1', order: 1 },
  ],
  conditions: [
    {
      condition_id: 'cond-1',
      step_id: 'st-1',
      order: 1,
      logical_operator: null,
      condition_type: 'crop',
      condition_question_id: null,
      condition_value: null,
      crop_name: 'Cacao',
    },
  ],
};

describe('exportCampaigns', () => {
  it('arma la jerarquía campaña → pasos → condiciones', async () => {
    const [campaign] = await exportCampaigns(fakeSource(SOURCE_ROWS));
    expect(campaign).toMatchObject({
      campaignId: 'c-1',
      name: 'Campaña Cacao',
    });
    expect(campaign.steps).toHaveLength(1);
    expect(campaign.steps[0].conditions[0]).toMatchObject({
      conditionId: 'cond-1',
      conditionCrop: 'Cacao',
    });
  });

  it('exporta el cultivo por nombre, nunca por UUID', async () => {
    const [campaign] = await exportCampaigns(fakeSource(SOURCE_ROWS));
    expect(campaign.steps[0].conditions[0].conditionCrop).toBe('Cacao');
    expect(JSON.stringify(campaign)).not.toContain('crop_id');
  });

  it('una campaña sin pasos queda con la lista vacía, no undefined', async () => {
    const [campaign] = await exportCampaigns(
      fakeSource({ ...SOURCE_ROWS, steps: [], conditions: [] }),
    );
    expect(campaign.steps).toEqual([]);
  });

  it('no consulta pasos si no hay campañas', async () => {
    const result = await exportCampaigns(
      fakeSource({ campaigns: [], steps: [], conditions: [] }),
    );
    expect(result).toEqual([]);
  });
});

describe('insertCampaigns', () => {
  const campaigns = [
    {
      campaignId: 'c-1',
      name: 'Campaña Cacao',
      description: null,
      isActive: true,
      steps: [
        {
          stepId: 'st-1',
          instrumentId: 'i-1',
          order: 1,
          conditions: [
            {
              conditionId: 'cond-1',
              order: 1,
              logicalOperator: null,
              conditionType: 'crop',
              conditionQuestionId: null,
              conditionValue: null,
              conditionCrop: 'Cacao',
            },
          ],
        },
      ],
    },
  ];

  it('conserva los UUID de origen e inserta las auditorías en NULL', async () => {
    const { manager, recorded } = fakeTarget({ cropId: 'crop-destino' });
    await insertCampaigns(manager as never, campaigns);

    const insertCampaign = recorded.find((r) =>
      /INSERT INTO campaigns/.test(r.sql),
    );
    expect(insertCampaign?.params[0]).toBe('c-1');
    expect(insertCampaign?.sql).toMatch(/NULL, NULL/);
  });

  it('traduce el cultivo de la condición al UUID del destino', async () => {
    const { manager, recorded } = fakeTarget({ cropId: 'crop-destino' });
    await insertCampaigns(manager as never, campaigns);

    const insertCondition = recorded.find((r) =>
      /INSERT INTO step_conditions/.test(r.sql),
    );
    expect(insertCondition?.params.at(-1)).toBe('crop-destino');
  });

  it('deja el cultivo en null cuando la condición no es de cultivo', async () => {
    const { manager, recorded } = fakeTarget({});
    await insertCampaigns(manager as never, [
      {
        ...campaigns[0],
        steps: [
          {
            ...campaigns[0].steps[0],
            conditions: [
              { ...campaigns[0].steps[0].conditions[0], conditionCrop: null },
            ],
          },
        ],
      },
    ]);
    const insertCondition = recorded.find((r) =>
      /INSERT INTO step_conditions/.test(r.sql),
    );
    expect(insertCondition?.params.at(-1)).toBeNull();
  });

  it('aborta si el instrumento de un paso no existe en el destino', async () => {
    const { manager } = fakeTarget({ instrumentExists: false });
    await expect(insertCampaigns(manager as never, campaigns)).rejects.toThrow(
      /no existe en el destino/,
    );
  });

  it('no escribe nada si no hay campañas', async () => {
    const { manager, recorded } = fakeTarget({});
    await insertCampaigns(manager as never, []);
    expect(recorded).toEqual([]);
  });
});
