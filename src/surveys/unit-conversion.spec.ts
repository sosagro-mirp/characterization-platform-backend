import { convertAreaToHectares } from './unit-conversion';

describe('convertAreaToHectares', () => {
  it('ha × 1', () => {
    expect(convertAreaToHectares(3, 'ha')).toEqual({
      hectares: 3,
      converted: false,
      unitUnknown: false,
    });
  });

  it('m² ÷ 10 000', () => {
    const r = convertAreaToHectares(25_000, 'm²');
    expect(r.hectares).toBeCloseTo(2.5, 9);
    expect(r.converted).toBe(true);
  });

  it('km² × 100', () => {
    const r = convertAreaToHectares(0.5, 'km²');
    expect(r.hectares).toBeCloseTo(50, 9);
    expect(r.converted).toBe(true);
  });

  it('reconoce variantes de escritura', () => {
    expect(convertAreaToHectares(10_000, 'm2').hectares).toBeCloseTo(1, 9);
    expect(
      convertAreaToHectares(10_000, ' Metros Cuadrados ').hectares,
    ).toBeCloseTo(1, 9);
    expect(convertAreaToHectares(2, 'Hectáreas').hectares).toBe(2);
    expect(convertAreaToHectares(1, 'KM2').hectares).toBeCloseTo(100, 9);
  });

  it('unidad desconocida → null y señal', () => {
    expect(convertAreaToHectares(2, 'fanegada')).toEqual({
      hectares: null,
      converted: false,
      unitUnknown: true,
    });
  });

  it('sin unidad toma el valor como hectáreas, sin advertencia', () => {
    expect(convertAreaToHectares(4, null)).toEqual({
      hectares: 4,
      converted: false,
      unitUnknown: false,
    });
    expect(convertAreaToHectares(4, '  ').unitUnknown).toBe(false);
  });

  it('valor no finito → null sin señal de unidad', () => {
    expect(convertAreaToHectares(Number.NaN, 'ha').hectares).toBeNull();
  });
});
