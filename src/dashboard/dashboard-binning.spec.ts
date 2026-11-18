import {
  buildBins,
  complementaryHidden,
  positionStatsAllowed,
} from './dashboard-binning';
import { isQuestionEligible } from './dashboard-privacy.config';

describe('buildBins (spec 107)', () => {
  it('abre los extremos y no expone mínimo ni máximo', () => {
    const values = [1.37, 41, 43, 44, 46, 47, 48, 49, 51, 52, 54, 987.65];
    const bins = buildBins(values, values.length);
    expect(bins[0].from).toBeNull();
    expect(bins[bins.length - 1].to).toBeNull();
    const numbers = bins.flatMap((b) => [b.from, b.to, b.count, b.percentage]);
    expect(numbers).not.toContain(1.37);
    expect(numbers).not.toContain(987.65);
  });

  it('con IQR = 0 devuelve intervalos válidos', () => {
    const bins = buildBins(Array<number>(8).fill(10), 8);
    expect(bins.length).toBeGreaterThan(0);
    expect(bins.some((b) => !b.suppressed)).toBe(true);
  });

  it('nunca deja exactamente un intervalo suprimido con el total visible', () => {
    const values = [
      ...Array<number>(10).fill(10),
      ...Array<number>(10).fill(20),
      30,
      ...Array<number>(10).fill(40),
      ...Array<number>(10).fill(50),
    ];
    const bins = buildBins(values, values.length);
    expect(bins.filter((b) => b.suppressed).length).not.toBe(1);
  });

  it('fusiona un extremo con pocas respuestas hasta reunir el mínimo', () => {
    const bins = buildBins([1, 50, 51, 52, 53, 54, 55, 56, 57, 58], 10);
    for (const bin of bins) {
      if (!bin.suppressed) expect(bin.count).toBeGreaterThanOrEqual(5);
    }
    expect(bins[0].from).toBeNull();
  });
});

describe('complementaryHidden', () => {
  it('suprime también la siguiente más pequeña si solo una cae bajo el umbral', () => {
    expect(complementaryHidden([20, 3, 11, 9])).toEqual([
      false,
      true,
      false,
      true,
    ]);
  });
  it('no toca nada si ninguna o varias están bajo el umbral', () => {
    expect(complementaryHidden([20, 10])).toEqual([false, false]);
    expect(complementaryHidden([20, 3, 2])).toEqual([false, true, true]);
  });
});

describe('positionStatsAllowed / isQuestionEligible', () => {
  it('exige 2 × umbral', () => {
    expect(positionStatsAllowed(9, 5)).toBe(false);
    expect(positionStatsAllowed(10, 5)).toBe(true);
  });
  it('rechaza texto identificante aunque no tenga systemField', () => {
    expect(
      isQuestionEligible({ text: 'Número de celular', typeName: 'numeric' }),
    ).toBe(false);
    expect(
      isQuestionEligible({ text: 'Hectáreas cultivadas', typeName: 'numeric' }),
    ).toBe(true);
  });
});
