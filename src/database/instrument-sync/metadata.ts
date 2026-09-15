import { DataSource, EntityManager } from 'typeorm';
import { ManifestMetadata, ManifestMetadataKind } from './types';

/** `DataSource` o `EntityManager` (dentro de una transacción) — ambos exponen `.query()`. */
export type Queryable = Pick<DataSource | EntityManager, 'query'>;

/**
 * Spec 84, Fase 3 — resolución de `options_question.metadata_id` a una clave
 * natural (nombre) y viceversa. `metadata_id` guarda el UUID de una fila de
 * `departments`, `towns`, `types_of_crops` o `actor_type`, y esos UUID NO
 * coinciden entre entornos (verificado en la Fase 0). El manifiesto nunca
 * viaja con el UUID de origen: siempre con `{ kind, key: nombre }`.
 *
 * La resolución de exportación no depende de `systemField` (frágil, texto
 * libre): prueba el id contra las cuatro tablas de catálogo y se queda con
 * la primera que lo reconozca.
 */

const CATALOGS: {
  kind: ManifestMetadataKind;
  table: string;
  idColumn: string;
}[] = [
  { kind: 'department', table: 'departments', idColumn: 'department_id' },
  { kind: 'town', table: 'towns', idColumn: 'town_id' },
  { kind: 'crop', table: 'types_of_crops', idColumn: 'crop_id' },
  { kind: 'actorType', table: 'actor_type', idColumn: 'actor_type_id' },
];

/** UUID de catálogo (origen) → `{ kind, key }`. Ids que no resuelven en ninguna tabla se omiten. */
export async function resolveMetadataByIds(
  ds: Queryable,
  metadataIds: string[],
): Promise<Map<string, ManifestMetadata>> {
  const result = new Map<string, ManifestMetadata>();
  const pending = new Set(metadataIds);
  if (pending.size === 0) return result;

  for (const catalog of CATALOGS) {
    if (pending.size === 0) break;
    const rows = await ds.query<{ id: string; name: string }[]>(
      `SELECT ${catalog.idColumn} AS id, name FROM ${catalog.table} WHERE ${catalog.idColumn} = ANY($1::uuid[])`,
      [[...pending]],
    );
    for (const row of rows) {
      result.set(row.id, { kind: catalog.kind, key: row.name });
      pending.delete(row.id);
    }
  }
  return result;
}

/**
 * `{ kind, key }` → UUID de catálogo en el entorno DESTINO. Se usa al
 * aplicar un plan: cada opción trae la clave natural del origen y hay que
 * traducirla al UUID que esa misma fila tiene en el destino.
 *
 * Lanza si una clave no resuelve — el llamador debe haberlo detectado antes
 * como conflicto `unresolved_metadata` (ver `plan.ts`) y nunca debería llegar
 * aquí sin resolver.
 */
export async function resolveMetadataId(
  ds: Queryable,
  metadata: ManifestMetadata,
): Promise<string> {
  const catalog = CATALOGS.find((c) => c.kind === metadata.kind);
  if (!catalog) throw new Error(`Catálogo desconocido: ${metadata.kind}`);
  const rows = await ds.query<{ id: string }[]>(
    `SELECT ${catalog.idColumn} AS id FROM ${catalog.table} WHERE name = $1 LIMIT 1`,
    [metadata.key],
  );
  if (!rows.length) {
    throw new Error(
      `No se pudo resolver "${metadata.key}" en el catálogo ${metadata.kind} del entorno destino`,
    );
  }
  return rows[0].id;
}

/**
 * Verifica que todas las claves de metadata de un manifiesto resuelvan en el
 * entorno destino, sin lanzar. Para que `buildPlan` pueda reportar
 * `unresolved_metadata` como conflicto en vez de que `applyPlan` reviente a
 * mitad de camino.
 */
export async function findUnresolvedMetadata(
  ds: Queryable,
  metadataList: ManifestMetadata[],
): Promise<ManifestMetadata[]> {
  const unresolved: ManifestMetadata[] = [];
  for (const metadata of metadataList) {
    try {
      await resolveMetadataId(ds, metadata);
    } catch {
      unresolved.push(metadata);
    }
  }
  return unresolved;
}
