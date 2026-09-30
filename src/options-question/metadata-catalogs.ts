/**
 * Spec 93, Fase 1 — catálogos a los que puede apuntar
 * `options_question.metadata_id`.
 *
 * El campo guarda el UUID de una fila de `departments`, `towns`,
 * `types_of_crops` o `actor_type` (ver `instrument-sync/metadata.ts`). Qué
 * catálogo corresponde lo decide el `systemField` de la pregunta; una
 * pregunta sin `systemField` (o con uno que no fija catálogo) admite
 * cualquiera de los cuatro, como el «Perfil» del taller, que apunta a
 * `actor_type` sin escribir en ninguna entidad.
 */

export type MetadataCatalogKind = 'department' | 'town' | 'crop' | 'actorType';

export const METADATA_CATALOGS: Record<
  MetadataCatalogKind,
  { table: string; idColumn: string; label: string }
> = {
  department: {
    table: 'departments',
    idColumn: 'department_id',
    label: 'departamentos',
  },
  town: { table: 'towns', idColumn: 'town_id', label: 'municipios' },
  crop: {
    table: 'types_of_crops',
    idColumn: 'crop_id',
    label: 'tipos de cultivo',
  },
  actorType: {
    table: 'actor_type',
    idColumn: 'actor_type_id',
    label: 'tipos de actor',
  },
};

const ALL_KINDS: MetadataCatalogKind[] = [
  'department',
  'town',
  'crop',
  'actorType',
];

/** Catálogos válidos para el `metadataId` de una opción según el `systemField` de su pregunta. */
export function catalogsForSystemField(
  systemField?: string | null,
): MetadataCatalogKind[] {
  const field = systemField?.trim();
  if (!field) return ALL_KINDS;
  if (field === 'farm.town') return ['town'];
  if (field === 'farm.department') return ['department'];
  if (field === 'farm.mainCrop' || field.startsWith('crop.')) return ['crop'];
  return ALL_KINDS;
}
