/**
 * Spec 93 — resolución pura de los cultivos de un envío.
 *
 * Junta las dos formas en que un instrumento declara cultivos y las cruza con
 * el catálogo `types_of_crops`:
 *  - `crop.<clave>` (sí/no): suma el cultivo si la respuesta es afirmativa.
 *  - `farm.mainCrop` (selección): suma el cultivo al que apunta el
 *    `metadataId` de la opción elegida; una opción sin `metadataId` (por
 *    ejemplo «Caucho» u «Otro») no crea cultivos y se informa como no mapeada.
 */

/** Claves ASCII de `crop.*` → nombre en `types_of_crops`. */
export const CROP_FIELD_MAP: Record<string, string> = {
  cacao: 'Cacao',
  cafe: 'Café',
  cannabis: 'Cannabis',
  canamo: 'Cáñamo',
};

export interface CropResponseLike {
  booleanValue?: boolean | null;
  question?: { systemField?: string | null } | null;
  option?: { text?: string | null; metadataId?: string | null } | null;
}

export interface CropCatalogEntry {
  cropId: string;
  name: string;
}

export interface ResolvedCrops<T extends CropCatalogEntry> {
  /** Cultivos del catálogo, sin duplicados; primero los `crop.*`. */
  crops: T[];
  /** Textos de opciones de `farm.mainCrop` sin cultivo asociado. */
  unmapped: string[];
}

export function resolveCropsFromResponses<T extends CropCatalogEntry>(
  responses: CropResponseLike[],
  catalog: T[],
): ResolvedCrops<T> {
  const byName = new Map(catalog.map((c) => [c.name, c]));
  const byId = new Map(catalog.map((c) => [c.cropId, c]));

  const resolved = new Map<string, T>();
  const fromMainCrop: T[] = [];
  const unmapped: string[] = [];

  for (const response of responses) {
    const sf = response.question?.systemField;
    if (!sf) continue;

    if (sf.startsWith('crop.')) {
      if (response.booleanValue !== true) continue;
      const key = sf.split('.')[1];
      const crop = byName.get(CROP_FIELD_MAP[key] ?? key);
      if (crop) resolved.set(crop.cropId, crop);
    } else if (sf === 'farm.mainCrop' && response.option) {
      const crop = response.option.metadataId
        ? byId.get(response.option.metadataId)
        : undefined;
      if (crop) {
        fromMainCrop.push(crop);
      } else if (
        response.option.text &&
        !unmapped.includes(response.option.text)
      ) {
        unmapped.push(response.option.text);
      }
    }
  }

  for (const crop of fromMainCrop) {
    if (!resolved.has(crop.cropId)) resolved.set(crop.cropId, crop);
  }
  return { crops: [...resolved.values()], unmapped };
}
