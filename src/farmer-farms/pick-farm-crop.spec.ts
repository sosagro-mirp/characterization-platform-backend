import { FarmCropOption, pickFarmCrop } from './pick-farm-crop';

const cafe: FarmCropOption = { farmCropId: 'fc-cafe', cropId: 'cafe' };
const cacao: FarmCropOption = { farmCropId: 'fc-cacao', cropId: 'cacao' };
const cannabis: FarmCropOption = {
  farmCropId: 'fc-cannabis',
  cropId: 'cannabis',
};

describe('pickFarmCrop (spec 94, prioridad del cultivo de finca)', () => {
  it('el primer grupo con exactamente un cultivo de la finca decide', () => {
    const pick = pickFarmCrop([cafe, cacao], [['cacao'], ['cafe']]);
    expect(pick).toEqual({
      farmCropId: 'fc-cacao',
      cropId: 'cacao',
      reason: 'candidate',
    });
  });

  it('un grupo vacío o con varios cultivos no decide: pasa al siguiente', () => {
    expect(pickFarmCrop([cafe, cacao], [[], ['cafe']]).farmCropId).toBe(
      'fc-cafe',
    );
    expect(
      pickFarmCrop([cafe, cacao], [['cafe', 'cacao'], ['cacao']]).farmCropId,
    ).toBe('fc-cacao');
  });

  it('duplicados dentro de un grupo cuentan como uno', () => {
    expect(pickFarmCrop([cafe, cacao], [['cafe', 'cafe']]).farmCropId).toBe(
      'fc-cafe',
    );
  });

  it('un cultivo candidato que la finca no tiene activo no decide', () => {
    const pick = pickFarmCrop([cafe, cacao], [['cannabis']]);
    expect(pick.farmCropId).toBeNull();
    expect(pick.reason).toBe('ambiguous');
  });

  it('sin candidatos, un único cultivo activo de la finca decide', () => {
    expect(pickFarmCrop([cafe], [[], []])).toEqual({
      farmCropId: 'fc-cafe',
      cropId: 'cafe',
      reason: 'single_active_farm_crop',
    });
  });

  it('un candidato que la finca no tiene cae al único cultivo de la finca', () => {
    expect(pickFarmCrop([cafe], [['cannabis']]).farmCropId).toBe('fc-cafe');
  });

  it('varios cultivos y nada que decida → NULL ambiguo', () => {
    expect(pickFarmCrop([cafe, cacao, cannabis], [[], []])).toEqual({
      farmCropId: null,
      cropId: null,
      reason: 'ambiguous',
    });
  });

  it('finca sin cultivos activos → NULL por finca sin cultivos', () => {
    expect(pickFarmCrop([], [['cafe']])).toEqual({
      farmCropId: null,
      cropId: null,
      reason: 'farm_without_crops',
    });
  });

  it('el orden de los grupos cambia el resultado (backfill vs transición)', () => {
    const farm = [cafe, cacao];
    // Backfill: primero la sesión; transición: primero lo resuelto.
    expect(pickFarmCrop(farm, [['cacao'], ['cafe']]).cropId).toBe('cacao');
    expect(pickFarmCrop(farm, [['cafe'], ['cacao']]).cropId).toBe('cafe');
  });
});
