import { createHash } from 'crypto';

/** JSON.stringify determinista: ordena las claves de cualquier objeto anidado. */
export function stableStringify(value: unknown): string {
  return JSON.stringify(sortKeysDeep(value));
}

function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value !== null && typeof value === 'object') {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      sorted[key] = sortKeysDeep((value as Record<string, unknown>)[key]);
    }
    return sorted;
  }
  return value;
}

/** Huella de contenido — solo para inspección/verificación externa (ej. `instruments:verify`). */
export function contentHash(value: unknown): string {
  return createHash('sha256').update(stableStringify(value)).digest('hex');
}
