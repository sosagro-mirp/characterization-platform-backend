import { DataSource } from 'typeorm';
import { InstrumentManifest } from './types';
import { buildPlan } from './plan';
import { applyPlan } from './apply';
import { exportManifest } from './export';

/**
 * Spec 84, Fase 3 — reemplaza TODO el contenido de instrumentos de un
 * destino por el de un manifiesto, conservando los UUID de origen. Pensado
 * para copiar producción a desarrollo (Fase 7): antes de insertar, borra en
 * el destino las encuestas de prueba y todo lo que depende de ellas.
 *
 * **Nunca contra producción** — `guard.isProduction` lo bloquea de plano,
 * sin excepción de flag: esta operación reemplaza contenido a ciegas, no es
 * la promoción cuidadosa de `buildPlan`/`applyPlan`.
 *
 * Tablas que se vacían, en orden (hijo → padre), y solo esas — si Postgres
 * reporta una tabla con una FK hacia `surveys`/`instruments`/`campaigns` que
 * no está en esta lista, se aborta sin borrar nada (columna nueva que este
 * script todavía no conoce, más segura de revisar a mano que de adivinar).
 */
const TABLES_TO_CLEAR = [
  'media_attachments',
  'responses',
  'consent_records',
  'farmer_document_collisions',
  'surveys_instruments',
  'campaign_sessions_crops',
  'step_conditions',
  'surveys',
  'campaign_sessions',
  'campaign_steps',
  'campaigns',
  'options_question',
  'questions',
  'instruments_actor_types',
  'sections',
  'instruments',
] as const;

/** Nunca se tocan: agricultores y fincas de prueba se conservan (decisión del usuario, spec 84). */
const PRESERVED_TABLES = ['farmers', 'farms', 'farms_crops', 'farm_plots'];

export interface SnapshotGuard {
  /** El propio llamador certifica explícitamente que el destino NO es producción. */
  isProduction: boolean;
}

export async function snapshot(
  ds: DataSource,
  manifest: InstrumentManifest,
  guard: SnapshotGuard,
): Promise<void> {
  if (guard.isProduction) {
    throw new Error(
      'snapshot() nunca se ejecuta contra producción — reemplaza contenido a ciegas.',
    );
  }

  await assertNoUnknownDependents(ds);

  await ds.transaction(async (manager) => {
    for (const table of TABLES_TO_CLEAR) {
      await manager.query(`DELETE FROM ${table}`);
    }
  });

  // Insertar en orden padre → hijo, conservando los UUID de origen. Reutiliza
  // el motor de plan/aplicación: comparar "nada" (base vacío) contra el
  // manifiesto deseado produce exactamente los `create` que hacen falta, en
  // el orden correcto, sin duplicar la lógica de escritura de `apply.ts`.
  const empty: InstrumentManifest = {
    formatVersion: 1,
    exportedAt: new Date().toISOString(),
    instruments: [],
  };
  const plan = buildPlan({ base: empty, desired: manifest, current: empty });
  await applyPlan(ds, plan);

  // Verificación final: el destino debe coincidir con el manifiesto pedido.
  const after = await exportManifest(ds, {
    instrumentIds: manifest.instruments.map((i) => i.instrumentId),
  });
  const verifyPlan = buildPlan({
    base: manifest,
    desired: manifest,
    current: after,
  });
  if (verifyPlan.operations.length > 0 || verifyPlan.conflicts.length > 0) {
    throw new Error(
      'El snapshot no quedó idéntico al manifiesto de origen — revisar manualmente antes de continuar.',
    );
  }
}

/**
 * Antes de borrar, confirma que no hay ninguna tabla con una FK hacia
 * `surveys`, `instruments`, `sections`, `questions`, `options_question` o
 * `campaigns` que no esté en `TABLES_TO_CLEAR` o `PRESERVED_TABLES`.
 */
async function assertNoUnknownDependents(ds: DataSource): Promise<void> {
  const rows = await ds.query<{ dependent_table: string }[]>(
    `SELECT DISTINCT tc.table_name AS dependent_table
     FROM information_schema.table_constraints tc
     JOIN information_schema.constraint_column_usage ccu
       ON ccu.constraint_name = tc.constraint_name
     WHERE tc.constraint_type = 'FOREIGN KEY'
       AND ccu.table_name = ANY($1)`,
    [
      [
        'surveys',
        'instruments',
        'sections',
        'questions',
        'options_question',
        'campaigns',
        'campaign_sessions',
      ],
    ],
  );
  const known = new Set([...TABLES_TO_CLEAR, ...PRESERVED_TABLES]);
  const unknown = rows
    .map((r) => r.dependent_table)
    .filter((table) => !known.has(table as (typeof TABLES_TO_CLEAR)[number]));
  if (unknown.length > 0) {
    throw new Error(
      `snapshot() no reconoce estas tablas dependientes: ${[...new Set(unknown)].join(', ')}. ` +
        'Revisar y agregarlas a TABLES_TO_CLEAR o PRESERVED_TABLES antes de continuar.',
    );
  }
}
