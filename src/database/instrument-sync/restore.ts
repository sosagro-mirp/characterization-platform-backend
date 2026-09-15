import { DataSource } from 'typeorm';
import { exportManifest } from './export';
import { buildPlan } from './plan';
import { applyPlan } from './apply';
import { ApplyResult, InstrumentManifest } from './types';

/** Uso real de un instrumento que `apply` creó, medido en el destino. */
export interface CreatedInstrumentUsage {
  instrumentId: string;
  name: string;
  responses: number;
  surveys: number;
  campaignSteps: number;
}

/**
 * Spec 84, Fase 3 — restaura un manifiesto de respaldo (el `backup` que
 * devuelve `applyPlan`) por el mismo motor de plan/aplicación: calcula qué
 * hace falta cambiar en el destino para volver exactamente al estado del
 * respaldo, y lo aplica.
 *
 * Si algo recibió respuestas después de tomarse el respaldo (por ejemplo, un
 * envío del taller llegó durante la promoción), la restauración se detiene
 * con el mismo conflicto `delete_with_responses` que vería un plan normal —
 * nunca descarta datos nuevos en silencio.
 *
 * Spec 84 (TC-084-014, 2026-09-15) — además quita los instrumentos que ese
 * `apply` creó (`backup.createdInstrumentIds`): el respaldo no los contiene y
 * `buildPlan` nunca borra instrumentos, así que antes quedaban vivos tras la
 * restauración. Como borrar un instrumento arrastra en cascada sus preguntas
 * y respuestas, se comprueba **antes de escribir nada** que ninguno tenga
 * respuestas, encuestas ni pasos de campaña; si alguno los tiene, se detiene.
 */
export async function restoreFromBackup(
  ds: DataSource,
  backup: InstrumentManifest,
): Promise<ApplyResult> {
  const instrumentIds = backup.instruments.map((i) => i.instrumentId);
  const live = await exportManifest(ds, { instrumentIds });
  const plan = buildPlan({ base: live, desired: backup, current: live });

  if (plan.conflicts.length > 0) {
    throw new Error(
      `No se puede restaurar automáticamente: ${plan.conflicts.length} conflicto(s) ` +
        '(algo recibió respuestas después del respaldo). Revise manualmente.',
    );
  }

  const created = await loadCreatedInstrumentUsage(
    ds,
    backup.createdInstrumentIds ?? [],
  );
  const blocked = blockedCreatedInstruments(created);
  if (blocked.length > 0) {
    throw new Error(
      'No se puede restaurar automáticamente: instrumentos creados por la ' +
        `promoción que ya tienen uso — ${blocked.join('; ')}. Revise manualmente.`,
    );
  }

  const result = await applyPlan(ds, plan);

  const removedInstrumentIds = created.map((c) => c.instrumentId);
  if (removedInstrumentIds.length > 0) {
    await ds.transaction(async (manager) => {
      // `sections`, `questions`, `options_question` e `instruments_actor_types`
      // caen en cascada; ya se comprobó que no hay respuestas ni encuestas.
      await manager.query(
        `DELETE FROM instruments WHERE instrument_id = ANY($1::uuid[])`,
        [removedInstrumentIds],
      );
    });
  }

  return { ...result, removedInstrumentIds };
}

/** Mensajes de los instrumentos creados que no se pueden quitar sin perder datos. */
export function blockedCreatedInstruments(
  usages: CreatedInstrumentUsage[],
): string[] {
  return usages
    .filter((u) => u.responses > 0 || u.surveys > 0 || u.campaignSteps > 0)
    .map(
      (u) =>
        `«${u.name}» (${u.instrumentId}): ${u.responses} respuesta(s), ` +
        `${u.surveys} encuesta(s), ${u.campaignSteps} paso(s) de campaña`,
    );
}

async function loadCreatedInstrumentUsage(
  ds: DataSource,
  ids: string[],
): Promise<CreatedInstrumentUsage[]> {
  if (ids.length === 0) return [];
  const rows = await ds.query<
    {
      instrument_id: string;
      name: string;
      responses: number;
      surveys: number;
      steps: number;
    }[]
  >(
    `SELECT i.instrument_id, i.name,
       (SELECT COUNT(*) FROM responses r
          JOIN questions q ON q.question_id = r.question_id
          JOIN sections s ON s.section_id = q.section_id
         WHERE s.instrument_id = i.instrument_id)::int AS responses,
       (SELECT COUNT(*) FROM surveys_instruments si
         WHERE si.instrument_id = i.instrument_id)::int AS surveys,
       (SELECT COUNT(*) FROM campaign_steps cs
         WHERE cs.instrument_id = i.instrument_id)::int AS steps
     FROM instruments i WHERE i.instrument_id = ANY($1::uuid[])`,
    [ids],
  );
  return rows.map((r) => ({
    instrumentId: r.instrument_id,
    name: r.name,
    responses: Number(r.responses),
    surveys: Number(r.surveys),
    campaignSteps: Number(r.steps),
  }));
}
