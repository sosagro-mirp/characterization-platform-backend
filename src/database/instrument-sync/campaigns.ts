import { DataSource, EntityManager } from 'typeorm';
import { Queryable, resolveMetadataId } from './metadata';

/**
 * Spec 84, Fase 7 — copia de campañas entre entornos, **solo para
 * `snapshot()`**.
 *
 * Las campañas no entran en `InstrumentManifest` ni en `buildPlan`: la
 * promoción desarrollo → producción nunca las toca (producción tiene las
 * campañas reales en uso, con sesiones y encuestas colgando de ellas). Pero
 * `snapshot()` sí borra `campaigns`, `campaign_steps` y `step_conditions` del
 * destino, así que sin esta copia desarrollo quedaría con los instrumentos de
 * producción y sin ninguna campaña desde la que aplicarlos — que es justo lo
 * que la Fase 7 necesita probar.
 *
 * Dos cosas no viajan con su UUID de origen, por el mismo motivo que los
 * catálogos del manifiesto (ver `metadata.ts`):
 *
 * - `condition_crop_id` → se exporta como nombre del cultivo y se resuelve
 *   contra `types_of_crops` del destino.
 * - `created_by_id` / `updated_by_id` → se insertan en `NULL`: los usuarios de
 *   producción no existen en desarrollo y la FK es `SET NULL`.
 *
 * `condition_question_id` sí se conserva tal cual: apunta a `questions`, que
 * `snapshot()` repuebla con los UUID de origen.
 */

export interface CampaignSnapshotCondition {
  conditionId: string;
  order: number;
  logicalOperator: string | null;
  conditionType: string;
  conditionQuestionId: string | null;
  conditionValue: string | null;
  /** Nombre del cultivo (`types_of_crops.name`), no su UUID. */
  conditionCrop: string | null;
}

export interface CampaignSnapshotStep {
  stepId: string;
  instrumentId: string;
  order: number;
  conditions: CampaignSnapshotCondition[];
}

export interface CampaignSnapshotCampaign {
  campaignId: string;
  name: string;
  description: string | null;
  isActive: boolean;
  steps: CampaignSnapshotStep[];
}

export async function exportCampaigns(
  ds: Queryable,
): Promise<CampaignSnapshotCampaign[]> {
  const campaigns = await ds.query<
    {
      campaign_id: string;
      name: string;
      description: string | null;
      is_active: boolean;
    }[]
  >(
    `SELECT campaign_id, name, description, is_active
       FROM campaigns
      ORDER BY name`,
  );
  if (campaigns.length === 0) return [];

  const steps = await ds.query<
    {
      step_id: string;
      campaign_id: string;
      instrument_id: string;
      order: number;
    }[]
  >(
    `SELECT step_id, campaign_id, instrument_id, "order"
       FROM campaign_steps
      ORDER BY campaign_id, "order"`,
  );

  const conditions = await ds.query<
    {
      condition_id: string;
      step_id: string;
      order: number;
      logical_operator: string | null;
      condition_type: string;
      condition_question_id: string | null;
      condition_value: string | null;
      crop_name: string | null;
    }[]
  >(
    `SELECT sc.condition_id, sc.step_id, sc."order", sc.logical_operator,
            sc.condition_type, sc.condition_question_id, sc.condition_value,
            crop.name AS crop_name
       FROM step_conditions sc
       LEFT JOIN types_of_crops crop ON crop.crop_id = sc.condition_crop_id
      ORDER BY sc.step_id, sc."order"`,
  );

  const conditionsByStep = new Map<string, CampaignSnapshotCondition[]>();
  for (const row of conditions) {
    const list = conditionsByStep.get(row.step_id) ?? [];
    list.push({
      conditionId: row.condition_id,
      order: row.order,
      logicalOperator: row.logical_operator,
      conditionType: row.condition_type,
      conditionQuestionId: row.condition_question_id,
      conditionValue: row.condition_value,
      conditionCrop: row.crop_name,
    });
    conditionsByStep.set(row.step_id, list);
  }

  const stepsByCampaign = new Map<string, CampaignSnapshotStep[]>();
  for (const row of steps) {
    const list = stepsByCampaign.get(row.campaign_id) ?? [];
    list.push({
      stepId: row.step_id,
      instrumentId: row.instrument_id,
      order: row.order,
      conditions: conditionsByStep.get(row.step_id) ?? [],
    });
    stepsByCampaign.set(row.campaign_id, list);
  }

  return campaigns.map((row) => ({
    campaignId: row.campaign_id,
    name: row.name,
    description: row.description,
    isActive: row.is_active,
    steps: stepsByCampaign.get(row.campaign_id) ?? [],
  }));
}

/**
 * Inserta las campañas conservando sus UUID de origen. Debe correr **después**
 * de que los instrumentos y sus preguntas existan en el destino
 * (`campaign_steps.instrument_id` es `RESTRICT`, y `condition_question_id`
 * apunta a `questions`).
 *
 * Un paso cuyo instrumento no exista en el destino aborta la operación: es
 * señal de que el manifiesto de instrumentos y el de campañas no vienen del
 * mismo origen, y dejar la campaña a medias sería peor que no copiarla.
 */
export async function insertCampaigns(
  manager: EntityManager | DataSource,
  campaigns: CampaignSnapshotCampaign[],
): Promise<void> {
  for (const campaign of campaigns) {
    await manager.query(
      `INSERT INTO campaigns (campaign_id, name, description, is_active, created_by_id, updated_by_id)
       VALUES ($1, $2, $3, $4, NULL, NULL)`,
      [
        campaign.campaignId,
        campaign.name,
        campaign.description,
        campaign.isActive,
      ],
    );

    for (const step of campaign.steps) {
      const instrumentExists = await manager.query<{ ok: string }[]>(
        `SELECT instrument_id AS ok FROM instruments WHERE instrument_id = $1`,
        [step.instrumentId],
      );
      if (!instrumentExists.length) {
        throw new Error(
          `La campaña "${campaign.name}" referencia el instrumento ${step.instrumentId}, ` +
            'que no existe en el destino — el manifiesto de instrumentos y el de campañas no coinciden.',
        );
      }

      await manager.query(
        `INSERT INTO campaign_steps (step_id, campaign_id, instrument_id, "order")
         VALUES ($1, $2, $3, $4)`,
        [step.stepId, campaign.campaignId, step.instrumentId, step.order],
      );

      for (const condition of step.conditions) {
        const cropId = condition.conditionCrop
          ? await resolveMetadataId(manager, {
              kind: 'crop',
              key: condition.conditionCrop,
            })
          : null;

        await manager.query(
          `INSERT INTO step_conditions
             (condition_id, step_id, "order", logical_operator, condition_type,
              condition_question_id, condition_value, condition_crop_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            condition.conditionId,
            step.stepId,
            condition.order,
            condition.logicalOperator,
            condition.conditionType,
            condition.conditionQuestionId,
            condition.conditionValue,
            cropId,
          ],
        );
      }
    }
  }
}
