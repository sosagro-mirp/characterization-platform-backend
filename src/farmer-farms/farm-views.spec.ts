import type { Farm } from 'src/farms/entities/farm.entity';
import type { Farmer } from 'src/farmers/entities/farmer.entity';
import type { FarmerFarm } from './entities/farmer-farm.entity';
import {
  activeFarmCropRefs,
  toCropSummaries,
  toFarmerFarmViews,
  toFarmerView,
  toFarmFarmerViews,
  withDerivedCrops,
} from './farm-views';

const crop = (cropId: string, name: string) => ({ cropId, name });

describe('farm-views (spec 94, serialización compatible)', () => {
  const farmCrops = [
    {
      farmCropId: 'fc-2',
      cropId: 'c-2',
      archivedAt: null,
      crop: crop('c-2', 'Cacao'),
    },
    {
      farmCropId: 'fc-1',
      cropId: 'c-1',
      archivedAt: null,
      crop: crop('c-1', 'Café'),
    },
    {
      farmCropId: 'fc-3',
      cropId: 'c-3',
      archivedAt: new Date('2026-01-01'),
      crop: crop('c-3', 'Cannabis'),
    },
  ];

  it('farm.crops se deriva solo de los cultivos activos, ordenados por nombre', () => {
    expect(toCropSummaries(farmCrops)).toEqual([
      { cropId: 'c-2', name: 'Cacao' },
      { cropId: 'c-1', name: 'Café' },
    ]);
    expect(activeFarmCropRefs(farmCrops).map((r) => r.farmCropId)).toEqual([
      'fc-2',
      'fc-1',
    ]);
  });

  it('tolera una finca sin cultivos cargados', () => {
    expect(toCropSummaries(undefined)).toEqual([]);
    expect(toCropSummaries(null)).toEqual([]);
  });

  it('withDerivedCrops deja `crops` y oculta las relaciones crudas', () => {
    const farm = {
      farmId: 'f-1',
      name: 'Finca',
      farmCrops,
      farmerLinks: [],
    } as unknown as Farm;
    const result = withDerivedCrops(farm);
    expect(result.crops).toEqual([
      { cropId: 'c-2', name: 'Cacao' },
      { cropId: 'c-1', name: 'Café' },
    ]);
    expect('farmCrops' in result).toBe(false);
    expect('farmerLinks' in result).toBe(false);
    expect(withDerivedCrops(undefined)).toBeUndefined();
  });

  const link = (
    farmId: string,
    isPrimary: boolean,
    createdAt: string,
    role = 'producer',
  ) =>
    ({
      role,
      isPrimary,
      createdAt: new Date(createdAt),
      farm: {
        farmId,
        name: `Finca ${farmId}`,
        vereda: null,
        town: null,
        farmCrops,
      },
    }) as unknown as FarmerFarm;

  it('farms[] pone primero a la principal y luego por antigüedad', () => {
    const views = toFarmerFarmViews([
      link('b', false, '2026-02-01'),
      link('a', true, '2026-03-01', 'owner'),
      link('c', false, '2026-01-01'),
    ]);
    expect(views.map((v) => v.farmId)).toEqual(['a', 'c', 'b']);
    expect(views[0]).toMatchObject({ role: 'owner', isPrimary: true });
    expect(views[0].crops.map((c) => c.cropId)).toEqual(['c-2', 'c-1']);
  });

  it('toFarmerView agrega farms[], deriva farm.crops y oculta farmLinks', () => {
    const farmer = {
      id: 'p-1',
      farm: { farmId: 'a', name: 'Finca a', farmCrops },
      farmLinks: [link('a', true, '2026-03-01')],
    } as unknown as Farmer;
    const view = toFarmerView(farmer);
    expect(view.farm?.crops).toHaveLength(2);
    expect(view.farms).toHaveLength(1);
    expect('farmLinks' in view).toBe(false);
  });

  it('includeVereda: false omite la vereda de farms[]; por defecto la conserva', () => {
    const l = link('a', true, '2026-03-01');
    l.farm.vereda = 'La Palma';
    expect(toFarmerFarmViews([l])[0].vereda).toBe('La Palma');
    const [view] = toFarmerFarmViews([l], { includeVereda: false });
    expect('vereda' in view).toBe(false);
    expect(view).toMatchObject({
      farmId: 'a',
      role: 'producer',
      isPrimary: true,
    });
  });

  it('toFarmerView sin vínculos devuelve farms vacío (productor sin finca)', () => {
    const view = toFarmerView({ id: 'p-2' } as unknown as Farmer);
    expect(view.farms).toEqual([]);
    expect(view.farm).toBeUndefined();
  });

  it('farmers[] de la finca trae rol y principal', () => {
    const views = toFarmFarmerViews([
      {
        role: 'worker',
        isPrimary: false,
        createdAt: new Date('2026-02-01'),
        farmer: { id: 'p-2', name: 'Otro' },
      },
      {
        role: 'producer',
        isPrimary: true,
        createdAt: new Date('2026-01-01'),
        farmer: { id: 'p-1', name: 'Uno' },
      },
    ] as unknown as FarmerFarm[]);
    expect(views).toEqual([
      { farmerId: 'p-1', name: 'Uno', role: 'producer', isPrimary: true },
      { farmerId: 'p-2', name: 'Otro', role: 'worker', isPrimary: false },
    ]);
  });
});
