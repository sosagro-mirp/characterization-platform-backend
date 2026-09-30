import { isSameFarmerName } from './name-matching';

/**
 * Spec 93 (D-H2-8) — forma normalizada de un documento de identidad, solo
 * para COMPARAR: sin puntos, espacios ni guiones. Lo guardado no se reescribe.
 */
export function normalizeDocumentId(
  value: string | number | null | undefined,
): string | null {
  if (value === null || value === undefined) return null;
  const normalized = String(value).replace(/[.\s-]/g, '');
  return normalized === '' ? null : normalized;
}

export interface DocumentSelection<T> {
  /** Productor que se reutiliza: el más antiguo cuyo nombre es compatible. */
  match: T | null;
  /** Sin coincidencia de nombre: el más antiguo con ese documento (colisión). */
  collisionWith: T | null;
}

/**
 * Elige entre los productores que comparten un documento. `candidates` debe
 * venir ordenado por `created_at ASC`; la elección es determinista y prefiere
 * al que coincide en nombre (spec 68) sobre el simplemente más antiguo.
 */
export function selectFarmerByDocument<T extends { name: string }>(
  candidates: T[],
  submittedName: string,
): DocumentSelection<T> {
  const match =
    candidates.find((c) => isSameFarmerName(c.name, submittedName)) ?? null;
  return {
    match,
    collisionWith: match ? null : (candidates[0] ?? null),
  };
}
