import { CropResponseLike, resolveCropsFromResponses } from './crop-extraction';

const catalog = [
  { cropId: 'id-cafe', name: 'Café' },
  { cropId: 'id-cacao', name: 'Cacao' },
  { cropId: 'id-cannabis', name: 'Cannabis' },
  { cropId: 'id-canamo', name: 'Cáñamo' },
];

const yesNo = (sf: string, value: boolean): CropResponseLike => ({
  question: { systemField: sf },
  booleanValue: value,
});
const choice = (
  text: string,
  metadataId: string | null = null,
): CropResponseLike => ({
  question: { systemField: 'farm.mainCrop' },
  option: { text, metadataId },
});

describe('resolveCropsFromResponses', () => {
  it('une crop.* afirmativos y farm.mainCrop sin duplicar', () => {
    const r = resolveCropsFromResponses(
      [
        choice('Café', 'id-cafe'),
        yesNo('crop.canamo', true),
        choice('Cacao', 'id-cacao'),
        choice('Cafe', 'id-cafe'),
      ],
      catalog,
    );
    expect(r.crops.map((c) => c.cropId)).toEqual([
      'id-canamo',
      'id-cafe',
      'id-cacao',
    ]);
    expect(r.unmapped).toEqual([]);
  });

  it('crop.* en falso no suma', () => {
    const r = resolveCropsFromResponses([yesNo('crop.cacao', false)], catalog);
    expect(r.crops).toEqual([]);
  });

  it('opciones sin metadataId no crean cultivos y quedan como no mapeadas', () => {
    const r = resolveCropsFromResponses(
      [
        choice('Caucho'),
        choice('Otro'),
        choice('Caucho'),
        choice('Café', 'id-cafe'),
      ],
      catalog,
    );
    expect(r.crops.map((c) => c.name)).toEqual(['Café']);
    expect(r.unmapped).toEqual(['Caucho', 'Otro']);
  });

  it('un metadataId fuera del catálogo se trata como no mapeado', () => {
    const r = resolveCropsFromResponses(
      [choice('Raro', 'id-inexistente')],
      catalog,
    );
    expect(r.crops).toEqual([]);
    expect(r.unmapped).toEqual(['Raro']);
  });

  it('ignora respuestas sin systemField o de otros campos', () => {
    const r = resolveCropsFromResponses(
      [
        { booleanValue: true },
        { question: { systemField: 'farm.name' }, option: { text: 'x' } },
      ],
      catalog,
    );
    expect(r).toEqual({ crops: [], unmapped: [] });
  });
});
