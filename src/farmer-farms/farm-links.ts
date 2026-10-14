import type { EntityManager } from 'typeorm';
import type {
  FarmerFarmRole,
  FarmerFarmSource,
} from './entities/farmer-farm.entity';
import type { FarmCropOption } from './pick-farm-crop';

/**
 * Spec 94 — escritura del modelo N:M productor–finca y del anclaje de la
 * encuesta. Todo recibe un `EntityManager` para participar en la transacción
 * del llamador (`extract-farmer`, `extract-crops`, procesado público, panel).
 *
 * SQL directo y no repositorios: son pocas sentencias, el orden importa (el
 * índice único parcial de la principal exige liberar la anterior ANTES de
 * marcar la nueva) y `Survey.farm_id` es una columna compartida entre dos FK
 * que TypeORM no persiste bien desde la entidad.
 */

/** Finca principal del productor según `farmer_farms`, o `null` si no tiene. */
export async function getPrimaryFarmId(
  manager: EntityManager,
  farmerId: string,
): Promise<string | null> {
  const rows = await manager.query<{ farm_id: string }[]>(
    `SELECT farm_id FROM farmer_farms WHERE farmer_id = $1 AND is_primary = true`,
    [farmerId],
  );
  return rows[0]?.farm_id ?? null;
}

export interface LinkFarmerToFarmParams {
  farmerId: string;
  farmId: string;
  role?: FarmerFarmRole;
  /**
   * `true` desplaza a la principal actual. Sin indicar (o `false`) el vínculo
   * solo queda principal si el productor no tenía ninguna: un productor con
   * fincas siempre tiene exactamente una principal.
   */
  isPrimary?: boolean;
  source: FarmerFarmSource;
}

export interface LinkFarmerToFarmResult {
  /** `false` si el vínculo ya existía (no se modificó nada). */
  created: boolean;
  isPrimary: boolean;
}

/**
 * Crea el vínculo productor–finca si no existe (idempotente). Si queda como
 * principal, actualiza el espejo `farmers.farm_id`.
 */
export async function linkFarmerToFarm(
  manager: EntityManager,
  params: LinkFarmerToFarmParams,
): Promise<LinkFarmerToFarmResult> {
  const { farmerId, farmId, role = 'producer', source } = params;

  // Serializa los cambios de principal del mismo productor.
  await manager.query(`SELECT id FROM farmers WHERE id = $1 FOR UPDATE`, [
    farmerId,
  ]);

  const existing = await manager.query<{ is_primary: boolean }[]>(
    `SELECT is_primary FROM farmer_farms WHERE farmer_id = $1 AND farm_id = $2`,
    [farmerId, farmId],
  );
  if (existing.length > 0) {
    return { created: false, isPrimary: existing[0].is_primary };
  }

  const hasPrimary = (await getPrimaryFarmId(manager, farmerId)) !== null;
  const makePrimary = !hasPrimary || params.isPrimary === true;

  if (makePrimary && hasPrimary) {
    await manager.query(
      `UPDATE farmer_farms SET is_primary = false, updated_at = now()
        WHERE farmer_id = $1 AND is_primary = true`,
      [farmerId],
    );
  }
  await manager.query(
    `INSERT INTO farmer_farms (farmer_id, farm_id, role, is_primary, source)
     VALUES ($1, $2, $3, $4, $5)`,
    [farmerId, farmId, role, makePrimary, source],
  );
  if (makePrimary) {
    await manager.query(`UPDATE farmers SET farm_id = $2 WHERE id = $1`, [
      farmerId,
      farmId,
    ]);
  }
  return { created: true, isPrimary: makePrimary };
}

/**
 * Marca una finca YA vinculada como principal: la anterior pasa a no
 * principal y se actualiza el espejo `farmers.farm_id`.
 */
export async function promoteToPrimary(
  manager: EntityManager,
  farmerId: string,
  farmId: string,
): Promise<void> {
  await manager.query(
    `UPDATE farmer_farms SET is_primary = false, updated_at = now()
      WHERE farmer_id = $1 AND is_primary = true AND farm_id <> $2`,
    [farmerId, farmId],
  );
  await manager.query(
    `UPDATE farmer_farms SET is_primary = true, updated_at = now()
      WHERE farmer_id = $1 AND farm_id = $2`,
    [farmerId, farmId],
  );
  await manager.query(`UPDATE farmers SET farm_id = $2 WHERE id = $1`, [
    farmerId,
    farmId,
  ]);
}

/** Cultivos ACTIVOS de la finca, con el id que referencian las encuestas. */
export async function listActiveFarmCrops(
  manager: EntityManager,
  farmId: string,
): Promise<FarmCropOption[]> {
  const rows = await manager.query<{ farm_crop_id: string; crop_id: string }[]>(
    `SELECT farm_crop_id, crop_id FROM farms_crops
      WHERE farm_id = $1 AND archived_at IS NULL
      ORDER BY created_at, farm_crop_id`,
    [farmId],
  );
  return rows.map((r) => ({ farmCropId: r.farm_crop_id, cropId: r.crop_id }));
}

/**
 * Suma cultivos a la finca SIN quitar ninguno: los que faltan se crean y los
 * archivados se reactivan (`archived_at = NULL`). Devuelve los cultivos
 * pedidos con su `farm_crop_id`.
 */
export async function addFarmCrops(
  manager: EntityManager,
  farmId: string,
  cropIds: string[],
): Promise<FarmCropOption[]> {
  const unique = [...new Set(cropIds)];
  if (unique.length === 0) return [];
  const rows = await manager.query<{ farm_crop_id: string; crop_id: string }[]>(
    `INSERT INTO farms_crops (farm_id, crop_id)
     SELECT $1::uuid, c.crop_id FROM unnest($2::uuid[]) AS c(crop_id)
     ON CONFLICT (farm_id, crop_id) DO UPDATE SET archived_at = NULL
     RETURNING farm_crop_id, crop_id`,
    [farmId, unique],
  );
  return rows.map((r) => ({ farmCropId: r.farm_crop_id, cropId: r.crop_id }));
}

export interface SurveyAnchors {
  /** `undefined` = no tocar. */
  farmerId?: string | null;
  farmId?: string | null;
  /**
   * `undefined` = no tocar. Con un id, la encuesta queda anclada a ese cultivo
   * de finca y `crop_id` se DERIVA de él (D-H3-9: se escribe aquí, sin
   * trigger). Si no se indica `farmId`, se toma el de ese cultivo de finca.
   */
  farmCropId?: string | null;
}

/**
 * Única función que escribe `surveys.farmer_id / farm_id / farm_crop_id` y
 * deriva `crop_id`. La FK compuesta de la base rechaza un cultivo de finca
 * que no sea de la finca de la encuesta.
 */
export async function anchorSurvey(
  manager: EntityManager,
  surveyId: string,
  anchors: SurveyAnchors,
): Promise<void> {
  const sets: string[] = [];
  const params: unknown[] = [surveyId];
  const bind = (value: unknown): string => {
    params.push(value);
    return `$${params.length}::uuid`;
  };

  if (anchors.farmerId !== undefined) {
    sets.push(`farmer_id = ${bind(anchors.farmerId)}`);
  }
  if (anchors.farmId !== undefined) {
    const ref = bind(anchors.farmId);
    sets.push(`farm_id = ${ref}`);
    if (anchors.farmCropId === undefined) {
      // Cambiar de finca con un cultivo de otra finca violaría la FK
      // compuesta: el cultivo anclado solo se conserva si es de la nueva finca.
      sets.push(
        `farm_crop_id = CASE WHEN EXISTS (SELECT 1 FROM farms_crops fc WHERE fc.farm_crop_id = surveys.farm_crop_id AND fc.farm_id = ${ref}) THEN farm_crop_id ELSE NULL END`,
        // `crop_id` se deriva de `farm_crop_id`: si el cultivo se suelta, también.
        `crop_id = CASE WHEN EXISTS (SELECT 1 FROM farms_crops fc WHERE fc.farm_crop_id = surveys.farm_crop_id AND fc.farm_id = ${ref}) THEN crop_id ELSE NULL END`,
      );
    }
  }
  if (anchors.farmCropId !== undefined) {
    if (anchors.farmCropId === null) {
      sets.push('farm_crop_id = NULL', 'crop_id = NULL');
    } else {
      const ref = bind(anchors.farmCropId);
      sets.push(`farm_crop_id = ${ref}`);
      sets.push(
        `crop_id = (SELECT fc.crop_id FROM farms_crops fc WHERE fc.farm_crop_id = ${ref})`,
      );
      if (anchors.farmId === undefined) {
        sets.push(
          `farm_id = (SELECT fc.farm_id FROM farms_crops fc WHERE fc.farm_crop_id = ${ref})`,
        );
      }
    }
  }
  if (sets.length === 0) return;

  await manager.query(
    `UPDATE surveys SET ${sets.join(', ')} WHERE survey_id = $1`,
    params,
  );
}
