/**
 * Spec 107 (P18-c, P18-e, P24): intervalos del dashboard calculados en el
 * backend. Los valores individuales nunca salen del servidor: solo conteos por
 * intervalo, con extremos abiertos y celda mínima.
 */

import { MIN_CELL_SIZE } from './dashboard-privacy.config';

export interface NumericBin {
  /** `null` = extremo abierto inferior («menos de `to`»). */
  from: number | null;
  /** `null` = extremo abierto superior («`from` o más»). */
  to: number | null;
  count: number | null;
  percentage: number | null;
  suppressed: boolean;
}

const MIN_BINS = 5;
const MAX_BINS = 12;
const NICE_MULTIPLIERS = [1, 2, 5];

function roundEdge(value: number): number {
  return Number(value.toFixed(10));
}

function quantile(sorted: number[], p: number): number {
  const position = (sorted.length - 1) * p;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
}

/** Menor ancho «redondo» (1, 2, 5 × 10ⁿ) con a lo sumo `MAX_BINS` intervalos. */
function niceWidth(range: number): number {
  const exponent = Math.floor(Math.log10(range / MAX_BINS));
  for (let e = exponent - 1; e < exponent + 4; e++) {
    for (const multiplier of NICE_MULTIPLIERS) {
      const width = multiplier * 10 ** e;
      if (Math.ceil(range / width) <= MAX_BINS) return width;
    }
  }
  return range;
}

/**
 * Bordes internos de los intervalos (los extremos del rango no se exponen).
 * Rango intercuartílico extendido: [Q1 − 1.5·IQR, Q3 + 1.5·IQR].
 */
function interiorEdges(sorted: number[]): number[] {
  const q1 = quantile(sorted, 0.25);
  const q3 = quantile(sorted, 0.75);
  const iqr = q3 - q1;
  let low = q1 - 1.5 * iqr;
  let high = q3 + 1.5 * iqr;
  if (!(high > low)) {
    // Sin dispersión (IQR = 0): se abre un rango alrededor del valor central.
    const center = quantile(sorted, 0.5);
    const spread = Math.max(Math.abs(center) * 0.1, 1);
    low = center - spread;
    high = center + spread;
  }
  const width = niceWidth(high - low);
  const start = Math.floor(low / width) * width;
  let binCount = Math.ceil((high - start) / width);
  binCount = Math.min(MAX_BINS, Math.max(MIN_BINS, binCount));
  const edges: number[] = [];
  for (let i = 1; i < binCount; i++) edges.push(roundEdge(start + i * width));
  return edges;
}

function binIndex(value: number, edges: number[]): number {
  let index = 0;
  while (index < edges.length && value >= edges[index]) index++;
  return index;
}

/**
 * Agrupa `values` en intervalos de ancho redondo con extremos abiertos.
 * Un extremo con menos de `MIN_CELL_SIZE` respuestas se ensancha (se fusiona
 * con su vecino) hasta reunir el mínimo. Después se suprime todo intervalo
 * bajo el umbral y, si queda exactamente uno suprimido, también el siguiente
 * más pequeño (P18-e): total − visibles no puede revelar un intervalo oculto.
 * `total` es el denominador de los porcentajes.
 */
export function buildBins(values: number[], total: number): NumericBin[] {
  if (values.length === 0) return [];
  const sorted = [...values].sort((a, b) => a - b);
  const edges = interiorEdges(sorted);

  let counts = new Array<number>(edges.length + 1).fill(0);
  for (const value of sorted) counts[binIndex(value, edges)]++;

  // Ensanchar los extremos abiertos hasta reunir MIN_CELL_SIZE.
  while (counts.length > 1 && counts[0] < MIN_CELL_SIZE) {
    counts = [counts[0] + counts[1], ...counts.slice(2)];
    edges.shift();
  }
  while (counts.length > 1 && counts[counts.length - 1] < MIN_CELL_SIZE) {
    counts = [
      ...counts.slice(0, -2),
      counts[counts.length - 2] + counts[counts.length - 1],
    ];
    edges.pop();
  }

  const hidden = complementaryHidden(counts);

  return counts.map((count, index) => ({
    from: index === 0 ? null : edges[index - 1],
    to: index === counts.length - 1 ? null : edges[index],
    count: hidden[index] ? null : count,
    percentage: hidden[index]
      ? null
      : Math.round((count / total) * 10000) / 100,
    suppressed: hidden[index],
  }));
}

/** P24: mediana y cuartiles solo con al menos `2 × MIN_SAMPLE_THRESHOLD` respuestas. */
export function positionStatsAllowed(
  count: number,
  minSampleThreshold: number,
): boolean {
  return count >= 2 * minSampleThreshold;
}

/**
 * Supresión complementaria en celdas que suman el total (P18-d / auditoría
 * 95): si exactamente una celda queda suprimida, se suprime también la
 * siguiente más pequeña. Devuelve los índices a suprimir.
 */
export function complementaryHidden(counts: number[]): boolean[] {
  const hidden = counts.map((count) => count < MIN_CELL_SIZE);
  if (hidden.filter(Boolean).length === 1) {
    let smallest = -1;
    counts.forEach((count, index) => {
      if (hidden[index]) return;
      if (smallest === -1 || count < counts[smallest]) smallest = index;
    });
    if (smallest !== -1) hidden[smallest] = true;
  }
  return hidden;
}
