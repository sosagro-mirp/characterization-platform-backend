import {
  buildPublicSubmissionPlan,
  completeFields,
  normalizeFarmKey,
  PlanFarmerRecord,
  PublicSubmissionPlanInput,
} from './public-submission-plan';

const base = (
  overrides: Partial<PublicSubmissionPlanInput> = {},
): PublicSubmissionPlanInput => ({
  surveyId: 'survey-1',
  identity: { name: 'Ana Ruiz', documentId: '123', phone: '300' },
  documentCandidates: [],
  phoneMatch: null,
  linkedFarmer: null,
  submission: {
    farmerValues: { phone: '300' },
    farm: {
      name: 'La Esperanza',
      vereda: 'El Retiro',
      townId: 'town-a',
      values: { vereda: 'El Retiro', townId: 'town-a' },
    },
  },
  crops: { resolved: [], unmapped: [] },
  respondentProfiles: [],
  fieldWarnings: [],
  existingFarmCandidates: [],
  pendingPeers: [],
  ...overrides,
});

const farmer = (
  overrides: Partial<PlanFarmerRecord> = {},
): PlanFarmerRecord => ({
  farmerId: 'f1',
  name: 'Ana Ruiz Mora',
  values: {},
  farm: null,
  ...overrides,
});

const codes = (p: { warnings: { code: string }[] }) =>
  p.warnings.map((w) => w.code);

describe('completeFields', () => {
  it('solo propone columnas vacías con valor en el envío', () => {
    const r = completeFields(
      'farmer',
      { phone: null, email: 'a@b.c', gender: undefined },
      { phone: '300', email: 'x@y.z', gender: 'Mujer', age: null },
    );
    expect(r).toEqual([
      { entity: 'farmer', field: 'phone', value: '300' },
      { entity: 'farmer', field: 'gender', value: 'Mujer' },
    ]);
  });

  it('un cero o false del envío cuenta como valor', () => {
    const r = completeFields(
      'farm',
      { area: null },
      { area: 0, waterAccess: false },
    );
    expect(r.map((f) => f.field)).toEqual(['area', 'waterAccess']);
  });
});

describe('normalizeFarmKey', () => {
  it('ignora tildes, mayúsculas, signos y espacios repetidos', () => {
    expect(normalizeFarmKey('  Hacienda  La ARBOLEDA. ')).toBe(
      'hacienda la arboleda',
    );
    expect(normalizeFarmKey('Peñón')).toBe('penon');
    expect(normalizeFarmKey(null)).toBe('');
  });
});

describe('buildPublicSubmissionPlan', () => {
  it('documento nuevo: finca a crear, sin campos por completar', () => {
    const p = buildPublicSubmissionPlan(base());
    expect(p.document).toEqual({
      status: 'new',
      farmerId: null,
      candidates: [],
    });
    expect(p.farm).toEqual({
      action: 'create',
      farmId: null,
      sharedCandidates: [],
    });
    expect(p.fieldsToComplete).toEqual([]);
    expect(p.warnings).toEqual([]);
  });

  it('sin nombre de finca: action none', () => {
    const p = buildPublicSubmissionPlan(
      base({
        submission: {
          farmerValues: {},
          farm: { name: null, vereda: null, townId: 'town-a', values: {} },
        },
      }),
    );
    expect(p.farm.action).toBe('none');
  });

  it('coincidencia por nombre: same_person_match con campos por completar', () => {
    const p = buildPublicSubmissionPlan(
      base({
        documentCandidates: [
          farmer({
            values: { phone: null },
            farm: {
              farmId: 'farm-1',
              name: 'La Esperanza',
              values: { vereda: 'Otra', townId: null },
            },
          }),
        ],
      }),
    );
    expect(p.document.status).toBe('same_person_match');
    expect(p.document.farmerId).toBe('f1');
    expect(p.farm).toMatchObject({ action: 'complete', farmId: 'farm-1' });
    expect(p.fieldsToComplete).toEqual([
      { entity: 'farmer', field: 'phone', value: '300' },
      { entity: 'farm', field: 'townId', value: 'town-a' },
    ]);
    expect(codes(p)).not.toContain('different_farm_name_existing_farmer');
  });

  it('elige el que coincide en nombre aunque no sea el más antiguo', () => {
    const p = buildPublicSubmissionPlan(
      base({
        documentCandidates: [
          farmer({ farmerId: 'viejo', name: 'Otro Nombre Distinto' }),
          farmer({ farmerId: 'match', name: 'Ana Ruiz' }),
        ],
      }),
    );
    expect(p.document.farmerId).toBe('match');
  });

  it('nombre distinto con el mismo documento: colisión con candidatos', () => {
    const p = buildPublicSubmissionPlan(
      base({
        identity: {
          name: 'Lucia Fernandez Rios',
          documentId: '123',
          phone: null,
        },
        documentCandidates: [farmer({ name: 'Pedro Gomez Lara' })],
      }),
    );
    expect(p.document.status).toBe('collision');
    expect(p.document.farmerId).toBeNull();
    expect(p.document.candidates).toEqual([
      { farmerId: 'f1', name: 'Pedro Gomez Lara' },
    ]);
    expect(p.fieldsToComplete).toEqual([]);
  });

  it('sin candidatos por documento usa la coincidencia por nombre + teléfono', () => {
    const p = buildPublicSubmissionPlan(base({ phoneMatch: farmer() }));
    expect(p.document.status).toBe('same_person_match');
  });

  it('productor con otra finca de otro nombre: advierte y no crea', () => {
    const p = buildPublicSubmissionPlan(
      base({
        documentCandidates: [
          farmer({
            farm: { farmId: 'farm-1', name: 'Finca Original', values: {} },
          }),
        ],
      }),
    );
    expect(p.farm.action).toBe('complete');
    expect(codes(p)).toContain('different_farm_name_existing_farmer');
  });

  it('productor sin finca: crea', () => {
    const p = buildPublicSubmissionPlan(
      base({ documentCandidates: [farmer()] }),
    );
    expect(p.farm.action).toBe('create');
  });

  it('marca fincas y envíos pendientes candidatos a compartida', () => {
    const p = buildPublicSubmissionPlan(
      base({
        submission: {
          farmerValues: {},
          farm: {
            name: 'SPEC hacienda  la ARBOLEDA',
            vereda: 'la palma',
            townId: 'town-a',
            values: {},
          },
        },
        existingFarmCandidates: [
          {
            farmId: 'farm-9',
            name: 'Spec Hacienda La Arboleda',
            vereda: 'La Palma',
            townId: 'town-a',
          },
          {
            farmId: 'farm-8',
            name: 'Spec Hacienda La Arboleda',
            vereda: 'Otra',
            townId: 'town-a',
          },
          {
            farmId: 'farm-7',
            name: 'Spec Hacienda La Arboleda',
            vereda: 'La Palma',
            townId: 'town-b',
          },
        ],
        pendingPeers: [
          {
            surveyId: 's2',
            documentId: '999',
            name: 'spec hacienda la arboleda',
            vereda: 'LA PALMA',
            townId: null,
          },
          {
            surveyId: 's3',
            documentId: '123',
            name: 'spec hacienda la arboleda',
            vereda: 'La Palma',
            townId: null,
          },
        ],
      }),
    );
    expect(p.farm.sharedCandidates.map((c) => c.farmId ?? c.surveyId)).toEqual([
      'farm-9',
      's2',
    ]);
    expect(codes(p)).toContain('duplicate_document_in_pending');
  });

  it('sin vereda no hay candidatas a compartida', () => {
    const p = buildPublicSubmissionPlan(
      base({
        submission: {
          farmerValues: {},
          farm: {
            name: 'La Esperanza',
            vereda: null,
            townId: null,
            values: {},
          },
        },
        existingFarmCandidates: [
          { farmId: 'x', name: 'La Esperanza', vereda: null, townId: null },
        ],
      }),
    );
    expect(p.farm.sharedCandidates).toEqual([]);
  });

  it('advierte perfil no productor, pero no para propietario ni productor', () => {
    const ext = buildPublicSubmissionPlan(
      base({
        respondentProfiles: [
          { optionText: 'Extensionista/Técnico', actorType: 'extensionista' },
        ],
      }),
    );
    expect(codes(ext)).toContain('respondent_not_producer');

    const own = buildPublicSubmissionPlan(
      base({
        respondentProfiles: [
          { optionText: 'Propietario', actorType: 'propietario' },
          { optionText: 'Encargado', actorType: 'productor' },
        ],
      }),
    );
    expect(codes(own)).not.toContain('respondent_not_producer');
  });

  it('advierte missing_town y arrastra las advertencias de normalización', () => {
    const p = buildPublicSubmissionPlan(
      base({
        submission: {
          farmerValues: {},
          farm: { name: 'F', vereda: null, townId: null, values: {} },
        },
        fieldWarnings: [
          { code: 'area_converted' },
          { code: 'multi_value_truncated' },
        ],
      }),
    );
    expect(codes(p)).toEqual([
      'missing_town',
      'area_converted',
      'multi_value_truncated',
    ]);
  });
});
