import {
  diffSnapshots,
  parseSubmissionLog,
  planFieldReverts,
  StateSnapshot,
} from './log';
import { SubmissionDecision } from './types';

const survey = {
  reviewStatus: 'pending',
  farmerId: null,
  reviewedBy: null,
  reviewedAt: null,
  respondent: { name: null, phone: null, documentId: null, email: null },
};

function snapshot(over: Partial<StateSnapshot> = {}): StateSnapshot {
  return {
    survey,
    farmer: null,
    farm: null,
    consent: [],
    collisions: [],
    ...over,
  };
}

const decision: SubmissionDecision = { surveyId: 's-1', action: 'process' };
const names = new Map([
  ['c1', 'Café'],
  ['c2', 'Cacao'],
]);

describe('diffSnapshots', () => {
  it('productor y finca nuevos: todo lo que hay se agregó, nada se completó', () => {
    const parts = diffSnapshots(
      snapshot({ consent: [{ consentRecordId: 'k1', farmerId: null }] }),
      snapshot({
        farmer: { farmerId: 'p1', farmId: 'f1', values: { phone: '3' } },
        farm: { farmId: 'f1', values: { area: 2 }, cropIds: ['c1', 'c2'] },
        consent: [{ consentRecordId: 'k1', farmerId: 'p1' }],
      }),
      { decision, farmerExisted: false, cropNames: names },
    );
    expect(parts.farmer).toEqual({ farmerId: 'p1', created: true });
    expect(parts.farm).toEqual({
      farmId: 'f1',
      mode: 'created',
      assignedToFarmer: true,
    });
    expect(parts.cropsAdded.map((c) => c.name)).toEqual(['Café', 'Cacao']);
    expect(parts.fieldsCompleted).toEqual([]);
    expect(parts.consentRecordsRelinked).toEqual(['k1']);
    expect(parts.collision).toBeNull();
  });

  it('misma persona con finca: registra campos completados con su valor anterior NULL y solo los cultivos nuevos', () => {
    const parts = diffSnapshots(
      snapshot({
        farmer: {
          farmerId: 'p1',
          farmId: 'f1',
          values: { phone: null, age: 40 },
        },
        farm: { farmId: 'f1', values: { area: null }, cropIds: ['c1'] },
      }),
      snapshot({
        farmer: {
          farmerId: 'p1',
          farmId: 'f1',
          values: { phone: '300', age: 40 },
        },
        farm: { farmId: 'f1', values: { area: 3 }, cropIds: ['c1', 'c2'] },
      }),
      { decision, farmerExisted: true, cropNames: names },
    );
    expect(parts.farmer?.created).toBe(false);
    expect(parts.farm?.mode).toBe('existing');
    expect(parts.fieldsCompleted).toEqual([
      { entity: 'farmer', field: 'phone', before: null, after: '300' },
      { entity: 'farm', field: 'area', before: null, after: 3 },
    ]);
    expect(parts.cropsAdded).toEqual([{ cropId: 'c2', name: 'Cacao' }]);
    expect(parts.anomalies).toEqual([]);
  });

  it('finca vinculada a un productor sin finca; suma cultivos a la finca existente', () => {
    const parts = diffSnapshots(
      snapshot({
        farmer: { farmerId: 'p1', farmId: null, values: {} },
        farm: { farmId: 'f9', values: {}, cropIds: ['c1'] },
      }),
      snapshot({
        farmer: { farmerId: 'p1', farmId: 'f9', values: {} },
        farm: { farmId: 'f9', values: {}, cropIds: ['c1', 'c2'] },
      }),
      {
        decision: { ...decision, farm: { mode: 'link', farmId: 'f9' } },
        farmerExisted: true,
        cropNames: names,
      },
    );
    expect(parts.farm).toEqual({
      farmId: 'f9',
      mode: 'linked',
      assignedToFarmer: true,
    });
    expect(parts.cropsAdded).toEqual([{ cropId: 'c2', name: 'Cacao' }]);
  });

  it('marca como anomalía un valor no nulo que cambió', () => {
    const parts = diffSnapshots(
      snapshot({
        farmer: { farmerId: 'p1', farmId: null, values: { age: 40 } },
      }),
      snapshot({
        farmer: { farmerId: 'p1', farmId: null, values: { age: 41 } },
      }),
      { decision, farmerExisted: true, cropNames: names },
    );
    expect(parts.anomalies).toHaveLength(1);
    expect(parts.fieldsCompleted).toEqual([]);
  });

  it('captura la fila de colisión nueva o cambiada, con su estado previo', () => {
    const row = {
      collisionId: 'x',
      documentId: '1',
      submittedName: 'Ana',
      surveyId: 's-1',
      existingFarmerId: 'p1',
      resolution: 'same_person',
      resolvedAt: '2026-09-24',
    };
    const pending = {
      ...row,
      resolution: null,
      resolvedAt: null,
      surveyId: 's-0',
    };
    const nueva = diffSnapshots(snapshot(), snapshot({ collisions: [row] }), {
      decision,
      farmerExisted: true,
      cropNames: names,
    });
    expect(nueva.collision).toEqual({ before: null, after: row });
    const cambiada = diffSnapshots(
      snapshot({ collisions: [pending] }),
      snapshot({ collisions: [row] }),
      { decision, farmerExisted: true, cropNames: names },
    );
    expect(cambiada.collision?.before).toEqual(pending);
  });
});

describe('planFieldReverts', () => {
  it('solo deshace lo que sigue valiendo lo escrito por apply', () => {
    const { revert, skipped } = planFieldReverts(
      [
        { entity: 'farmer', field: 'phone', before: null, after: '300' },
        { entity: 'farm', field: 'area', before: null, after: 3 },
      ],
      { farmer: { phone: '300' }, farm: { area: '5.00' } },
    );
    expect(revert.map((c) => c.field)).toEqual(['phone']);
    expect(skipped[0].currentValue).toBe('5.00');
  });
});

describe('parseSubmissionLog', () => {
  const valid = {
    formatVersion: 1,
    surveyId: '11111111-1111-4111-8111-111111111111',
    action: 'process',
    previousState: survey,
    farmer: { farmerId: '22222222-2222-4222-8222-222222222222', created: true },
    cropsAdded: [],
    fieldsCompleted: [],
    consentRecordsRelinked: [],
  };

  it('acepta un log válido', () => {
    expect(parseSubmissionLog(valid).surveyId).toBe(valid.surveyId);
  });

  it('rechaza logs mal formados con el detalle', () => {
    expect(() => parseSubmissionLog(null)).toThrow('no es un objeto');
    expect(() =>
      parseSubmissionLog({ ...valid, formatVersion: 2, farmer: null }),
    ).toThrow(/formatVersion.*farmer/);
  });
});
