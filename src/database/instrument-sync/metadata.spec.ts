import {
  findUnresolvedMetadata,
  Queryable,
  resolveMetadataByIds,
  resolveMetadataId,
} from './metadata';

/**
 * Spec 84 — los UUID de catálogo NO coinciden entre entornos, así que el
 * manifiesto viaja con la clave natural (el nombre). Si esta traducción
 * fallara en silencio, una opción de municipio aterrizaría en producción
 * apuntando a un municipio distinto o a nada.
 */

/** `Queryable` falso: cada tabla de catálogo con sus filas. */
function fakeDb(
  catalogs: Record<string, { id: string; name: string }[]>,
): Queryable & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    // eslint-disable-next-line @typescript-eslint/require-await
    query: (async (sql: string, params: unknown[]) => {
      calls.push(sql);
      const table = Object.keys(catalogs).find((t) =>
        new RegExp(`FROM ${t}\\b`).test(sql),
      );
      const rows = table ? catalogs[table] : [];

      if (sql.includes('= ANY(')) {
        const wanted = new Set((params[0] as string[]) ?? []);
        return rows.filter((r) => wanted.has(r.id));
      }
      return rows
        .filter((r) => r.name === params[0])
        .map((r) => ({ id: r.id }));
    }) as Queryable['query'],
  };
}

const CATALOGOS = {
  departments: [{ id: 'dep-origen', name: 'Antioquia' }],
  towns: [{ id: 'town-origen', name: 'Apartadó' }],
  types_of_crops: [{ id: 'crop-origen', name: 'Cacao' }],
  actor_type: [{ id: 'actor-origen', name: 'productor' }],
};

describe('resolveMetadataByIds', () => {
  it('traduce cada UUID a su clave natural con el tipo correcto', async () => {
    const db = fakeDb(CATALOGOS);
    const result = await resolveMetadataByIds(db, [
      'town-origen',
      'crop-origen',
      'actor-origen',
    ]);
    expect(result.get('town-origen')).toEqual({
      kind: 'town',
      key: 'Apartadó',
    });
    expect(result.get('crop-origen')).toEqual({ kind: 'crop', key: 'Cacao' });
    expect(result.get('actor-origen')).toEqual({
      kind: 'actorType',
      key: 'productor',
    });
  });

  it('omite los ids que no existen en ningún catálogo', async () => {
    const result = await resolveMetadataByIds(fakeDb(CATALOGOS), ['fantasma']);
    expect(result.size).toBe(0);
  });

  it('no consulta nada si no hay ids', async () => {
    const db = fakeDb(CATALOGOS);
    await resolveMetadataByIds(db, []);
    expect(db.calls).toHaveLength(0);
  });

  it('deja de consultar catálogos en cuanto resolvió todos los ids', async () => {
    const db = fakeDb(CATALOGOS);
    await resolveMetadataByIds(db, ['dep-origen']);
    // `departments` es el primer catálogo: no debería recorrer los otros tres.
    expect(db.calls).toHaveLength(1);
  });
});

describe('resolveMetadataId', () => {
  it('traduce la clave natural al UUID del entorno destino', async () => {
    const destino = fakeDb({
      ...CATALOGOS,
      towns: [{ id: 'town-destino', name: 'Apartadó' }],
    });
    await expect(
      resolveMetadataId(destino, { kind: 'town', key: 'Apartadó' }),
    ).resolves.toBe('town-destino');
  });

  it('lanza si la clave no existe en el destino', async () => {
    await expect(
      resolveMetadataId(fakeDb(CATALOGOS), { kind: 'town', key: 'Pamplona' }),
    ).rejects.toThrow(/Pamplona/);
  });

  it('busca en el catálogo del `kind` indicado y no en otro', async () => {
    // 'Cacao' existe como cultivo, no como municipio.
    await expect(
      resolveMetadataId(fakeDb(CATALOGOS), { kind: 'town', key: 'Cacao' }),
    ).rejects.toThrow();
  });
});

describe('findUnresolvedMetadata', () => {
  it('devuelve solo las claves que no resuelven', async () => {
    const db = fakeDb(CATALOGOS);
    const unresolved = await findUnresolvedMetadata(db, [
      { kind: 'town', key: 'Apartadó' },
      { kind: 'town', key: 'Tibú' },
      { kind: 'crop', key: 'Cacao' },
    ]);
    expect(unresolved).toEqual([{ kind: 'town', key: 'Tibú' }]);
  });

  it('devuelve vacío cuando todo resuelve', async () => {
    const unresolved = await findUnresolvedMetadata(fakeDb(CATALOGOS), [
      { kind: 'crop', key: 'Cacao' },
      { kind: 'actorType', key: 'productor' },
    ]);
    expect(unresolved).toEqual([]);
  });
});
