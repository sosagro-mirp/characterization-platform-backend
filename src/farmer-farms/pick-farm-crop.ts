/**
 * Spec 94 — elección pura del cultivo de finca al que se ancla una encuesta.
 * La comparten el backfill (migración 4) y la escritura de transición
 * (`extract-crops`), que solo difieren en el orden de los grupos de candidatos.
 */

export interface FarmCropOption {
  farmCropId: string;
  cropId: string;
}

export type FarmCropPickReason =
  /** Un grupo de candidatos tenía exactamente un cultivo y la finca lo tiene activo. */
  | 'candidate'
  /** Ningún grupo decidió y la finca tiene un único cultivo activo. */
  | 'single_active_farm_crop'
  /** La finca no tiene cultivos activos. */
  | 'farm_without_crops'
  /** Varios cultivos activos y nada que decida cuál. */
  | 'ambiguous';

export interface FarmCropPick {
  farmCropId: string | null;
  cropId: string | null;
  reason: FarmCropPickReason;
}

/**
 * Prioridad: el primer grupo de `candidateGroups` con EXACTAMENTE un cultivo
 * que la finca tenga activo → único cultivo activo de la finca → ninguno.
 *
 * - Backfill (D5): `[cultivos de la sesión, cultivos resueltos por las respuestas]`.
 * - Transición (`extract-crops`): `[cultivos resueltos, cultivos previos de la sesión]`.
 *
 * Un grupo con 0 o con 2+ cultivos no decide; un único cultivo que la finca no
 * tiene activo tampoco (no se inventa un cultivo de finca aquí).
 */
export function pickFarmCrop(
  activeFarmCrops: FarmCropOption[],
  candidateGroups: string[][],
): FarmCropPick {
  const byCrop = new Map(activeFarmCrops.map((fc) => [fc.cropId, fc]));

  for (const group of candidateGroups) {
    const distinct = [...new Set(group)];
    if (distinct.length !== 1) continue;
    const match = byCrop.get(distinct[0]);
    if (match) {
      return {
        farmCropId: match.farmCropId,
        cropId: match.cropId,
        reason: 'candidate',
      };
    }
  }

  if (activeFarmCrops.length === 1) {
    const only = activeFarmCrops[0];
    return {
      farmCropId: only.farmCropId,
      cropId: only.cropId,
      reason: 'single_active_farm_crop',
    };
  }
  return {
    farmCropId: null,
    cropId: null,
    reason: activeFarmCrops.length === 0 ? 'farm_without_crops' : 'ambiguous',
  };
}
