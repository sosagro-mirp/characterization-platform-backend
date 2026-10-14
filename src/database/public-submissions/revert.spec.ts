import { assertRevertibleLog, canRevert, orderLogFiles } from './revert';
import { SubmissionLog } from './types';

function log(over: Partial<SubmissionLog> = {}): SubmissionLog {
  return {
    formatVersion: 1,
    modelVersion: 94,
    surveyId: 's-1',
    action: 'process',
    appliedAt: '2026-09-24T00:00:00.000Z',
    reviewedBy: 'u-1',
    decision: { surveyId: 's-1', action: 'process' },
    previousState: {
      reviewStatus: 'pending',
      farmerId: null,
      reviewedBy: null,
      reviewedAt: null,
      respondent: { name: null, phone: null, documentId: null, email: null },
    },
    farmer: { farmerId: 'p-1', created: true },
    farm: null,
    cropsAdded: [],
    fieldsCompleted: [],
    anomalies: [],
    consentRecordsRelinked: [],
    collision: null,
    ...over,
  };
}

describe('orderLogFiles', () => {
  it('ordena los logs de una corrida del último al primero y descarta el resto', () => {
    expect(
      orderLogFiles([
        '002-b.json',
        'run.json',
        '001-a.json',
        '003-c.json',
        'notas.txt',
      ]),
    ).toEqual(['003-c.json', '002-b.json', '001-a.json']);
  });
});

describe('canRevert', () => {
  it('permite revertir un envío que sigue como lo dejó apply', () => {
    expect(
      canRevert({ reviewStatus: 'processed', farmerId: 'p-1' }, log()),
    ).toEqual({ ok: true });
    expect(
      canRevert(
        { reviewStatus: 'discarded', farmerId: null },
        log({ action: 'discard', farmer: null }),
      ),
    ).toEqual({ ok: true });
  });

  it('omite un envío ya pendiente (revertir dos veces no rompe nada)', () => {
    const verdict = canRevert(
      { reviewStatus: 'pending', farmerId: null },
      log(),
    );
    expect(verdict.ok).toBe(false);
  });

  it('omite si el estado o el productor ya no son los del log', () => {
    expect(
      canRevert({ reviewStatus: 'discarded', farmerId: null }, log()).ok,
    ).toBe(false);
    expect(
      canRevert({ reviewStatus: 'processed', farmerId: 'otro' }, log()).ok,
    ).toBe(false);
  });
});

describe('assertRevertibleLog (spec 94, D-H3-11)', () => {
  it('acepta un log escrito con el modelo del spec 94', () => {
    expect(() => assertRevertibleLog(log())).not.toThrow();
  });

  it('rechaza un log anterior al spec 94 (sin modelVersion) con un mensaje claro', () => {
    const legacy = log();
    delete legacy.modelVersion;
    expect(() => assertRevertibleLog(legacy)).toThrow(
      /antes del spec 94.*no se puede revertir/s,
    );
  });

  it('rechaza una versión de modelo distinta', () => {
    expect(() => assertRevertibleLog(log({ modelVersion: 93 }))).toThrow(
      /spec 94/,
    );
  });
});
