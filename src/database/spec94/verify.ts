import * as dotenv from 'dotenv';
import type { EntityManager } from 'typeorm';
import { DataSource } from 'typeorm';

/**
 * Spec 94 — verificación de SOLO LECTURA del modelo centrado en el productor
 * y del backfill (`Spec94BackfillAnchors`). `pnpm spec94:verify`.
 *
 * Se corre ANTES y DESPUÉS de migrar: el informe trae los conteos que el spec
 * compara (respuestas, `farms_crops`, constancias, `farmer_id` NULL…) y los
 * invariantes que NUNCA deben romperse tras el backfill. Sale con código ≠ 0
 * si un invariante se rompe. Antes de la migración las tablas/columnas nuevas
 * no existen: el informe lo dice (`schemaReady: false`) y no evalúa nada más.
 *
 * Lo que NO puede comprobar una función de solo lectura —que una segunda
 * ejecución de `up()` no cambie nada y que `down()` restaure— lo cubre
 * `e2e-094` (C4). Los conteos se imprimen para compararlos con la línea base.
 */

export interface Spec94Invariant {
  id: string;
  description: string;
  /** Filas que rompen el invariante (0 = cumple). */
  violations: number;
  ok: boolean;
}

export interface UnanchoredConsent {
  consentRecordId: string;
  sessionId: string | null;
  surveyId: string | null;
  /** Por qué no se puede anclar a un productor. */
  reason: 'abandoned_session' | 'public_unprocessed' | 'no_path';
}

export interface Spec94Report {
  schemaReady: boolean;
  /** `true` si el esquema está listo y todos los invariantes se cumplen. */
  ok: boolean;
  counts: Record<string, number>;
  invariants: Spec94Invariant[];
  /** `farm_crop_id` NULL de encuestas con finca, por motivo. */
  farmCropNullBreakdown: {
    farmWithoutCrops: number;
    ambiguous: number;
    /** La finca tiene un único cultivo activo y aun así no está anclado (no es error: `extract-crops` aún no corrió). */
    singleActiveCrop: number;
  };
  /** Encuestas con productor ausente (`farmer_id` NULL), por motivo. */
  surveysWithoutFarmer: {
    total: number;
    recoverableFromSession: number;
    publicUnprocessed: number;
    fieldWithoutPath: number;
    fieldWithoutPathIds: string[];
  };
  /** Constancias sin productor y no anclables: se listan y no se borran. */
  unanchoredConsents: UnanchoredConsent[];
}

const SCHEMA_CHECK = `
  SELECT
    to_regclass('public.farmer_farms') IS NOT NULL AS "farmerFarms",
    EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'surveys' AND column_name = 'farm_crop_id') AS "surveyAnchors",
    EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'farms_crops' AND column_name = 'farm_crop_id') AS "farmCrops"`;

async function scalar(
  manager: EntityManager,
  sql: string,
  params: unknown[] = [],
): Promise<number> {
  const rows = await manager.query<{ n: string | number }[]>(sql, params);
  return Number(rows[0]?.n ?? 0);
}

function invariant(
  id: string,
  description: string,
  violations: number,
): Spec94Invariant {
  return { id, description, violations, ok: violations === 0 };
}

const EMPTY_REPORT: Spec94Report = {
  schemaReady: false,
  ok: false,
  counts: {},
  invariants: [],
  farmCropNullBreakdown: {
    farmWithoutCrops: 0,
    ambiguous: 0,
    singleActiveCrop: 0,
  },
  surveysWithoutFarmer: {
    total: 0,
    recoverableFromSession: 0,
    publicUnprocessed: 0,
    fieldWithoutPath: 0,
    fieldWithoutPathIds: [],
  },
  unanchoredConsents: [],
};

export async function verifySpec94(
  manager: EntityManager,
): Promise<Spec94Report> {
  const [schema] =
    await manager.query<
      { farmerFarms: boolean; surveyAnchors: boolean; farmCrops: boolean }[]
    >(SCHEMA_CHECK);
  const schemaReady =
    schema.farmerFarms && schema.surveyAnchors && schema.farmCrops;

  // Antes de las migraciones 1–3 solo se pueden contar los datos de origen.
  const counts: Record<string, number> = {
    surveys: await scalar(manager, `SELECT count(*) AS n FROM surveys`),
    responses: await scalar(manager, `SELECT count(*) AS n FROM responses`),
    farmers: await scalar(manager, `SELECT count(*) AS n FROM farmers`),
    farmersWithFarm: await scalar(
      manager,
      `SELECT count(*) AS n FROM farmers WHERE farm_id IS NOT NULL`,
    ),
    farms: await scalar(manager, `SELECT count(*) AS n FROM farms`),
    farmsCrops: await scalar(manager, `SELECT count(*) AS n FROM farms_crops`),
    consentRecords: await scalar(
      manager,
      `SELECT count(*) AS n FROM consent_records`,
    ),
    consentRecordsWithoutFarmer: await scalar(
      manager,
      `SELECT count(*) AS n FROM consent_records WHERE farmer_id IS NULL`,
    ),
    surveysWithoutFarmer: await scalar(
      manager,
      `SELECT count(*) AS n FROM surveys WHERE farmer_id IS NULL`,
    ),
  };
  if (!schemaReady) {
    return { ...EMPTY_REPORT, counts };
  }

  Object.assign(counts, {
    farmerFarms: await scalar(
      manager,
      `SELECT count(*) AS n FROM farmer_farms`,
    ),
    farmerFarmsPrimary: await scalar(
      manager,
      `SELECT count(*) AS n FROM farmer_farms WHERE is_primary`,
    ),
    farmsCropsArchived: await scalar(
      manager,
      `SELECT count(*) AS n FROM farms_crops WHERE archived_at IS NOT NULL`,
    ),
    surveysWithFarm: await scalar(
      manager,
      `SELECT count(*) AS n FROM surveys WHERE farm_id IS NOT NULL`,
    ),
    surveysWithFarmCrop: await scalar(
      manager,
      `SELECT count(*) AS n FROM surveys WHERE farm_crop_id IS NOT NULL`,
    ),
    surveysWithCrop: await scalar(
      manager,
      `SELECT count(*) AS n FROM surveys WHERE crop_id IS NOT NULL`,
    ),
  });

  const invariants: Spec94Invariant[] = [
    // C1 — farmers.farm_id ⇄ farmer_farms (espejo coherente).
    invariant(
      'C1-mirror',
      'Todo agricultor con farm_id tiene su finca como vínculo principal en farmer_farms',
      await scalar(
        manager,
        `SELECT count(*) AS n FROM farmers f
          WHERE f.farm_id IS NOT NULL
            AND NOT EXISTS (SELECT 1 FROM farmer_farms ff
                             WHERE ff.farmer_id = f.id AND ff.farm_id = f.farm_id
                               AND ff.is_primary)`,
      ),
    ),
    invariant(
      'C1-single-primary',
      'Ningún agricultor tiene más de una finca principal',
      await scalar(
        manager,
        `SELECT count(*) AS n FROM (
           SELECT farmer_id FROM farmer_farms WHERE is_primary
            GROUP BY farmer_id HAVING count(*) > 1) x`,
      ),
    ),
    invariant(
      'C1-primary-mirrored',
      'Toda finca principal de farmer_farms es la de farmers.farm_id',
      await scalar(
        manager,
        `SELECT count(*) AS n FROM farmer_farms ff
           JOIN farmers f ON f.id = ff.farmer_id
          WHERE ff.is_primary AND f.farm_id IS DISTINCT FROM ff.farm_id`,
      ),
    ),
    // C2 — la encuesta de una sesión con productor tiene farmer_id.
    invariant(
      'C2-session-farmer',
      'Ninguna encuesta con campaign_session.farmer_id queda con farmer_id NULL',
      await scalar(
        manager,
        `SELECT count(*) AS n FROM surveys s
           JOIN campaign_sessions cs ON cs.session_id = s.campaign_session_id
          WHERE cs.farmer_id IS NOT NULL AND s.farmer_id IS NULL`,
      ),
    ),
    // C3 — finca y cultivo de finca coherentes.
    invariant(
      'C3-farm',
      'Toda encuesta con productor que tiene finca principal tiene farm_id',
      await scalar(
        manager,
        `SELECT count(*) AS n FROM surveys s
          WHERE s.farmer_id IS NOT NULL AND s.farm_id IS NULL
            AND EXISTS (SELECT 1 FROM farmer_farms ff
                         WHERE ff.farmer_id = s.farmer_id AND ff.is_primary)`,
      ),
    ),
    invariant(
      'C3-crop-derived',
      'Toda encuesta con farm_crop_id tiene crop_id = farms_crops.crop_id',
      await scalar(
        manager,
        `SELECT count(*) AS n FROM surveys s
           JOIN farms_crops fc ON fc.farm_crop_id = s.farm_crop_id
          WHERE s.crop_id IS DISTINCT FROM fc.crop_id`,
      ),
    ),
    invariant(
      'C3-crop-of-farm',
      'El cultivo de finca de una encuesta pertenece a la finca de la encuesta',
      await scalar(
        manager,
        `SELECT count(*) AS n FROM surveys s
           JOIN farms_crops fc ON fc.farm_crop_id = s.farm_crop_id
          WHERE fc.farm_id IS DISTINCT FROM s.farm_id`,
      ),
    ),
    // C10 — constancias con camino al productor.
    invariant(
      'C10-consent-farmer',
      'Toda constancia cuya sesión o encuesta tiene productor tiene farmer_id',
      await scalar(
        manager,
        `SELECT count(*) AS n FROM consent_records cr
          WHERE cr.farmer_id IS NULL AND (
                EXISTS (SELECT 1 FROM campaign_sessions cs
                         WHERE cs.session_id = cr.session_id AND cs.farmer_id IS NOT NULL)
             OR EXISTS (SELECT 1 FROM surveys s
                         WHERE s.survey_id = cr.survey_id AND s.farmer_id IS NOT NULL)
             OR EXISTS (SELECT 1 FROM surveys s
                         WHERE s.campaign_session_id = cr.session_id
                           AND s.farmer_id IS NOT NULL))`,
      ),
    ),
  ];

  const farmCropNullBreakdown = {
    farmWithoutCrops: await scalar(
      manager,
      `SELECT count(*) AS n FROM surveys s
        WHERE s.farm_id IS NOT NULL AND s.farm_crop_id IS NULL
          AND NOT EXISTS (SELECT 1 FROM farms_crops fc
                           WHERE fc.farm_id = s.farm_id AND fc.archived_at IS NULL)`,
    ),
    ambiguous: await scalar(
      manager,
      `SELECT count(*) AS n FROM surveys s
        WHERE s.farm_id IS NOT NULL AND s.farm_crop_id IS NULL
          AND (SELECT count(*) FROM farms_crops fc
                WHERE fc.farm_id = s.farm_id AND fc.archived_at IS NULL) > 1`,
    ),
    singleActiveCrop: await scalar(
      manager,
      `SELECT count(*) AS n FROM surveys s
        WHERE s.farm_id IS NOT NULL AND s.farm_crop_id IS NULL
          AND (SELECT count(*) FROM farms_crops fc
                WHERE fc.farm_id = s.farm_id AND fc.archived_at IS NULL) = 1`,
    ),
  };

  const withoutPath = await manager.query<{ survey_id: string }[]>(
    `SELECT s.survey_id FROM surveys s
       LEFT JOIN campaign_sessions cs ON cs.session_id = s.campaign_session_id
      WHERE s.farmer_id IS NULL AND s.origin = 'field' AND cs.farmer_id IS NULL
      ORDER BY s.created_at, s.survey_id
      LIMIT 500`,
  );
  const surveysWithoutFarmer = {
    total: counts.surveysWithoutFarmer,
    recoverableFromSession: await scalar(
      manager,
      `SELECT count(*) AS n FROM surveys s
         JOIN campaign_sessions cs ON cs.session_id = s.campaign_session_id
        WHERE s.farmer_id IS NULL AND cs.farmer_id IS NOT NULL`,
    ),
    publicUnprocessed: await scalar(
      manager,
      `SELECT count(*) AS n FROM surveys s
        WHERE s.farmer_id IS NULL AND s.origin = 'public'`,
    ),
    fieldWithoutPath: withoutPath.length,
    fieldWithoutPathIds: withoutPath.map((r) => r.survey_id),
  };

  const consents = await manager.query<
    {
      consent_record_id: string;
      session_id: string | null;
      survey_id: string | null;
      public_survey: boolean;
    }[]
  >(
    `SELECT cr.consent_record_id, cr.session_id, cr.survey_id,
            COALESCE(s.origin = 'public', false) AS public_survey
       FROM consent_records cr
       LEFT JOIN surveys s ON s.survey_id = cr.survey_id
      WHERE cr.farmer_id IS NULL
      ORDER BY cr.created_at, cr.consent_record_id`,
  );
  const unanchoredConsents: UnanchoredConsent[] = consents.map((row) => ({
    consentRecordId: row.consent_record_id,
    sessionId: row.session_id,
    surveyId: row.survey_id,
    reason: row.public_survey
      ? 'public_unprocessed'
      : row.session_id
        ? 'abandoned_session'
        : 'no_path',
  }));

  return {
    schemaReady: true,
    ok: invariants.every((i) => i.ok),
    counts,
    invariants,
    farmCropNullBreakdown,
    surveysWithoutFarmer,
    unanchoredConsents,
  };
}

/** Texto legible del informe, para la CLI. */
export function formatReport(report: Spec94Report): string {
  const lines: string[] = [];
  lines.push('== Conteos ==');
  for (const [key, value] of Object.entries(report.counts)) {
    lines.push(`  ${key}: ${value}`);
  }
  if (!report.schemaReady) {
    lines.push(
      '',
      'Esquema del spec 94 aún no aplicado (farmer_farms / anclajes de surveys / farm_crop_id): solo se muestran los conteos de origen.',
    );
    return lines.join('\n');
  }
  lines.push('', '== Invariantes ==');
  for (const inv of report.invariants) {
    lines.push(
      `  [${inv.ok ? 'OK' : 'FALLA'}] ${inv.id}: ${inv.description} (${inv.violations})`,
    );
  }
  const b = report.farmCropNullBreakdown;
  lines.push(
    '',
    '== farm_crop_id NULL (encuestas con finca) ==',
    `  finca sin cultivos activos: ${b.farmWithoutCrops}`,
    `  ambiguo (varios cultivos activos): ${b.ambiguous}`,
    `  finca con un único cultivo activo (aún sin extract-crops): ${b.singleActiveCrop}`,
  );
  const w = report.surveysWithoutFarmer;
  lines.push(
    '',
    '== Encuestas sin productor ==',
    `  total: ${w.total}`,
    `  recuperables desde la sesión (deberían ser 0 tras el backfill): ${w.recoverableFromSession}`,
    `  públicas sin procesar: ${w.publicUnprocessed}`,
    `  de campo sin camino al productor: ${w.fieldWithoutPath}`,
  );
  for (const id of w.fieldWithoutPathIds) lines.push(`    - ${id}`);
  lines.push(
    '',
    `== Constancias no anclables (se conservan): ${report.unanchoredConsents.length} ==`,
  );
  for (const c of report.unanchoredConsents) {
    lines.push(
      `  - ${c.consentRecordId} (${c.reason}; sesión ${c.sessionId ?? '—'}; encuesta ${c.surveyId ?? '—'})`,
    );
  }
  lines.push('', report.ok ? 'RESULTADO: OK' : 'RESULTADO: FALLA');
  return lines.join('\n');
}

/**
 * CLI. Destino: `SPEC94_DATABASE_URL` si existe, si no `DATABASE_URL` (la
 * activa del `.env`). Todo corre en una transacción READ ONLY que se revierte.
 */
async function main(): Promise<void> {
  dotenv.config();
  const url = process.env.SPEC94_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!url) {
    throw new Error('Falta SPEC94_DATABASE_URL o DATABASE_URL.');
  }
  let target = 'destino no interpretable';
  try {
    const parsed = new URL(url);
    target = `${parsed.hostname}${parsed.pathname}`;
  } catch {
    /* se deja el texto genérico: nunca se imprime la URL con credenciales */
  }
  console.log(`spec94:verify (solo lectura) → ${target}\n`);

  const ds = new DataSource({
    type: 'postgres',
    url,
    ssl: url.includes('neon.tech') ? { rejectUnauthorized: false } : false,
    synchronize: false,
    logging: false,
  });
  await ds.initialize();
  const runner = ds.createQueryRunner();
  try {
    await runner.startTransaction();
    await runner.query('SET TRANSACTION READ ONLY');
    const report = await verifySpec94(runner.manager);
    console.log(formatReport(report));
    if (report.schemaReady && !report.ok) process.exitCode = 1;
  } finally {
    await runner.rollbackTransaction();
    await runner.release();
    await ds.destroy();
  }
}

if (require.main === module) {
  main().catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
