import {
  chooseFarm,
  isExtractable,
  planFieldChanges,
  roleFromActorType,
  roleFromProfiles,
  valuesDiffer,
} from './extraction-plan';

describe('valuesDiffer', () => {
  it('ignora mayúsculas, tildes y espacios en texto', () => {
    expect(valuesDiffer('vereda', 'El Manzanillo', ' el  manzanillo ')).toBe(
      false,
    );
    expect(valuesDiffer('vereda', 'Vereda Árbol', 'vereda arbol')).toBe(false);
    expect(valuesDiffer('vereda', 'Vereda A', 'Vereda B')).toBe(true);
  });

  it('compara teléfonos sin separadores', () => {
    expect(valuesDiffer('phone', '300 111 0007', '3001110007')).toBe(false);
    expect(valuesDiffer('phone', '3001110007', '3009990007')).toBe(true);
  });

  it('aplica tolerancia a las coordenadas', () => {
    expect(valuesDiffer('latitude', 4.5, 4.50005)).toBe(false);
    expect(valuesDiffer('latitude', 4.5, 4.6)).toBe(true);
  });

  it('compara números de texto y booleanos de forma exacta', () => {
    expect(valuesDiffer('age', 35, '35')).toBe(false);
    expect(valuesDiffer('age', 35, 36)).toBe(true);
    expect(valuesDiffer('waterAccess', true, false)).toBe(true);
    expect(valuesDiffer('waterAccess', true, true)).toBe(false);
  });
});

describe('planFieldChanges', () => {
  it('completa vacíos y registra diferencias sin pisar nada', () => {
    const plan = planFieldChanges(
      'farm',
      { vereda: null, corregimiento: 'Original', latitude: 4.5 },
      { vereda: 'Nueva', corregimiento: 'Distinto', latitude: 4.50001 },
    );
    expect(plan.complete).toEqual([
      { entity: 'farm', field: 'vereda', value: 'Nueva' },
    ]);
    expect(plan.discrepancies).toEqual([
      {
        entity: 'farm',
        field: 'corregimiento',
        systemField: 'farm.corregimiento',
        currentValue: 'Original',
        submittedValue: 'Distinto',
      },
    ]);
  });

  it('ignora lo que el envío no trae', () => {
    const plan = planFieldChanges('farmer', { phone: '1' }, { phone: null });
    expect(plan).toEqual({ complete: [], discrepancies: [] });
  });

  it('el municipio vacío se completa y su systemField es farm.town', () => {
    const plan = planFieldChanges('farm', { townId: 'a' }, { townId: 'b' });
    expect(plan.discrepancies[0]).toMatchObject({
      field: 'townId',
      systemField: 'farm.town',
    });
  });
});

describe('chooseFarm', () => {
  const farms = [
    { farmId: 'f1', name: 'La Esperanza', isPrimary: true },
    { farmId: 'f2', name: 'El Mirador', isPrimary: false },
  ];

  it('respeta la finca a la que la encuesta ya está anclada', () => {
    expect(
      chooseFarm({
        anchoredFarmId: 'f2',
        farms,
        submittedName: 'Otra',
        origin: 'field',
      }),
    ).toEqual({ action: 'anchored', farmId: 'f2', nameDiffers: true });
  });

  it('elige la finca del productor cuyo nombre coincide', () => {
    expect(
      chooseFarm({
        anchoredFarmId: null,
        farms,
        submittedName: 'el mirador',
        origin: 'field',
      }),
    ).toEqual({ action: 'match', farmId: 'f2', nameDiffers: false });
  });

  it('sin nombre usa la principal; con otro nombre también y marca la diferencia', () => {
    expect(
      chooseFarm({
        anchoredFarmId: null,
        farms,
        submittedName: null,
        origin: 'field',
      }),
    ).toEqual({ action: 'principal', farmId: 'f1', nameDiffers: false });
    expect(
      chooseFarm({
        anchoredFarmId: null,
        farms,
        submittedName: 'Finca Nueva',
        origin: 'field',
      }),
    ).toEqual({ action: 'principal', farmId: 'f1', nameDiffers: true });
  });

  it('sin fincas: en campo crea si hay nombre y nunca vincula', () => {
    expect(
      chooseFarm({
        anchoredFarmId: null,
        farms: [],
        submittedName: 'Nueva',
        origin: 'field',
        decision: { mode: 'link', farmId: 'x' },
      }),
    ).toEqual({ action: 'create', farmId: null, nameDiffers: false });
    expect(
      chooseFarm({
        anchoredFarmId: null,
        farms: [],
        submittedName: null,
        origin: 'field',
      }).action,
    ).toBe('none');
  });

  it('sin fincas: en público respeta la decisión de vincular', () => {
    expect(
      chooseFarm({
        anchoredFarmId: null,
        farms: [],
        submittedName: 'Hacienda',
        origin: 'public',
        decision: { mode: 'link', farmId: 'x' },
      }),
    ).toEqual({ action: 'link', farmId: 'x', nameDiffers: false });
  });
});

describe('roles', () => {
  it('mapea el perfil declarado y por defecto es producer', () => {
    expect(roleFromActorType('Propietario')).toBe('owner');
    expect(roleFromActorType('productor')).toBe('producer');
    expect(roleFromActorType(undefined)).toBe('producer');
    expect(roleFromActorType('desconocido')).toBe('producer');
    expect(roleFromProfiles([{ actorType: 'propietario' }])).toBe('owner');
    expect(roleFromProfiles([])).toBe('producer');
  });
});

describe('isExtractable', () => {
  it('detecta farmer.*, farm.* y crop.*', () => {
    const r = (sf: string | null) => ({ question: { systemField: sf } });
    expect(isExtractable([r('farmer.name')])).toBe(true);
    expect(isExtractable([r('farm.mainCrop')])).toBe(true);
    expect(isExtractable([r('crop.cafe')])).toBe(true);
    expect(isExtractable([r(null), r('other.x')])).toBe(false);
  });
});
