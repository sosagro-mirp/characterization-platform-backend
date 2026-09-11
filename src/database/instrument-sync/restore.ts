import { DataSource } from 'typeorm';
import { exportManifest } from './export';
import { buildPlan } from './plan';
import { applyPlan } from './apply';
import { ApplyResult, InstrumentManifest } from './types';

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

  return applyPlan(ds, plan);
}
