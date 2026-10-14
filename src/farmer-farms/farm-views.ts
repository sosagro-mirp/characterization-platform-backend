import type { Farm } from 'src/farms/entities/farm.entity';
import type { FarmCrop } from 'src/farms/entities/farm-crop.entity';
import type { Farmer } from 'src/farmers/entities/farmer.entity';
import type { FarmerFarm, FarmerFarmRole } from './entities/farmer-farm.entity';

/**
 * Spec 94 — serialización compatible del modelo N:M. Funciones puras: derivan
 * del modelo nuevo (`FarmCrop`, `FarmerFarm`) las formas que el contrato de la
 * API ya exponía (`farm`, `farm.crops`) y las aditivas (`farms[]`,
 * `farmers[]`, `farmCrops`).
 */

/** `farm.crops[]` histórico: solo cultivos ACTIVOS. */
export interface CropSummary {
  cropId: string;
  name: string;
}

/** Cultivo de finca con su id propio (el que referencian las encuestas). */
export interface FarmCropRef {
  farmCropId: string;
  cropId: string;
  name: string;
}

/** Elemento de `farms[]` en las respuestas de productores. */
export interface FarmerFarmView {
  farmId: string;
  name: string;
  /** Ausente en `GET /farmers/search` (público): no expone la vereda. */
  vereda?: string | null;
  town: { townId: string; name: string } | null;
  role: FarmerFarmRole;
  isPrimary: boolean;
  crops: FarmCropRef[];
}

/** Elemento de `farmers[]` en `GET /farms/:id`. */
export interface FarmFarmerView {
  farmerId: string;
  name: string;
  role: FarmerFarmRole;
  isPrimary: boolean;
}

/** Relaciones que hay que cargar para serializar un productor. */
export const FARMER_VIEW_RELATIONS = [
  'farm',
  'farm.town',
  'farm.farmCrops',
  'farm.farmCrops.crop',
  'farmLinks',
  'farmLinks.farm',
  'farmLinks.farm.town',
  'farmLinks.farm.farmCrops',
  'farmLinks.farm.farmCrops.crop',
] as const;

type FarmCropLike = Pick<FarmCrop, 'farmCropId' | 'cropId' | 'archivedAt'> & {
  crop?: { cropId: string; name: string } | null;
};

/** Cultivos activos, con nombre, ordenados por nombre y luego por id. */
export function activeFarmCropRefs(
  farmCrops: FarmCropLike[] | undefined | null,
): FarmCropRef[] {
  return (farmCrops ?? [])
    .filter((fc) => fc.archivedAt === null || fc.archivedAt === undefined)
    .map((fc) => ({
      farmCropId: fc.farmCropId,
      cropId: fc.cropId ?? fc.crop?.cropId ?? '',
      name: fc.crop?.name ?? '',
    }))
    .sort(
      (a, b) =>
        a.name.localeCompare(b.name, 'es') ||
        a.farmCropId.localeCompare(b.farmCropId),
    );
}

export function toCropSummaries(
  farmCrops: FarmCropLike[] | undefined | null,
): CropSummary[] {
  return activeFarmCropRefs(farmCrops).map(({ cropId, name }) => ({
    cropId,
    name,
  }));
}

/**
 * Deja la finca con la forma histórica: `crops` derivado de los cultivos
 * activos y sin exponer la relación cruda `farmCrops` ni `farmerLinks`.
 * Devuelve el mismo objeto (mutado) para no copiar entidades completas.
 */
export function withDerivedCrops<T extends Farm | null | undefined>(
  farm: T,
): T {
  if (!farm) return farm;
  farm.crops = toCropSummaries(farm.farmCrops);
  delete (farm as Partial<Farm>).farmCrops;
  delete (farm as Partial<Farm>).farmerLinks;
  return farm;
}

/** Orden estable de los vínculos: la principal primero, luego por antigüedad. */
export function sortLinks<
  T extends Pick<FarmerFarm, 'isPrimary' | 'createdAt'>,
>(links: T[]): T[] {
  return [...links].sort((a, b) => {
    if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
    return (
      new Date(a.createdAt ?? 0).getTime() -
      new Date(b.createdAt ?? 0).getTime()
    );
  });
}

export function toFarmerFarmViews(
  links: FarmerFarm[] | undefined | null,
  options: { includeVereda?: boolean } = {},
): FarmerFarmView[] {
  const includeVereda = options.includeVereda ?? true;
  return sortLinks(links ?? [])
    .filter((link) => link.farm)
    .map((link) => ({
      farmId: link.farm.farmId,
      name: link.farm.name,
      ...(includeVereda ? { vereda: link.farm.vereda ?? null } : {}),
      town: link.farm.town
        ? { townId: link.farm.town.townId, name: link.farm.town.name }
        : null,
      role: link.role,
      isPrimary: link.isPrimary,
      crops: activeFarmCropRefs(link.farm.farmCrops),
    }));
}

/**
 * Productor listo para responder: `farm` (la principal, con `crops` derivado)
 * y `farms[]`. Muta y devuelve el mismo objeto.
 */
export function toFarmerView<T extends Farmer>(
  farmer: T,
  options: { includeVereda?: boolean } = {},
): T {
  farmer.farms = toFarmerFarmViews(farmer.farmLinks, options);
  withDerivedCrops(farmer.farm);
  delete (farmer as Partial<Farmer>).farmLinks;
  return farmer;
}

/** `farmers[]` de `GET /farms/:id`, con la principal primero. */
export function toFarmFarmerViews(
  links: FarmerFarm[] | undefined | null,
): FarmFarmerView[] {
  return sortLinks(links ?? [])
    .filter((link) => link.farmer)
    .map((link) => ({
      farmerId: link.farmer.id,
      name: link.farmer.name,
      role: link.role,
      isPrimary: link.isPrimary,
    }));
}
