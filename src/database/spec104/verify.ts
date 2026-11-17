import * as dotenv from 'dotenv';
import { DataSource } from 'typeorm';

/**
 * Spec 104 — verificación de SOLO LECTURA de la etapa A (`pnpm spec104:verify`).
 * Imprime los conteos de `surveys`, `responses` y de las cinco tablas de
 * campañas. Se corre ANTES y DESPUÉS de la migración `Spec104ArchiveCampaigns`
 * y los conteos deben ser idénticos. Tras migrar, comprueba además que ninguna
 * encuesta con sesión quede sin `legacy_campaign_name`.
 */
const TABLES = [
  'surveys',
  'responses',
  'campaigns',
  'campaign_steps',
  'step_conditions',
  'campaign_sessions',
  'campaign_sessions_crops',
];

async function main(): Promise<void> {
  dotenv.config();
  const url = process.env.SPEC104_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!url) throw new Error('Falta SPEC104_DATABASE_URL o DATABASE_URL.');
  const parsed = new URL(url);
  console.log(
    `spec104:verify (solo lectura) → ${parsed.hostname}${parsed.pathname}\n`,
  );

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
    for (const t of TABLES) {
      // Un error dentro de la transacción abortaría las consultas siguientes:
      // se comprueba la existencia antes de contar.
      const [exists] = (await runner.query(
        `SELECT to_regclass($1) IS NOT NULL AS ok`,
        [`public."${t}"`],
      )) as { ok: boolean }[];
      const rows = exists.ok
        ? ((await runner.query(`SELECT count(*)::text AS n FROM "${t}"`)) as {
            n: string;
          }[])
        : null;
      console.log(`${t.padEnd(26)} ${rows ? rows[0].n : 'no existe'}`);
    }
    const col = (await runner.query(
      `SELECT count(*)::text AS c FROM information_schema.columns
        WHERE table_name = 'surveys' AND column_name = 'legacy_campaign_name'`,
    )) as { c: string }[];
    if (col[0].c === '1') {
      const [r] = (await runner.query(
        `SELECT count(*)::text AS n FROM surveys
          WHERE campaign_session_id IS NOT NULL AND legacy_campaign_name IS NULL`,
      )) as { n: string }[];
      console.log(`\nsin legacy_campaign_name con sesión: ${r.n}`);
      if (r.n !== '0') process.exitCode = 1;
    } else {
      console.log('\nschemaReady: false (migración aún no aplicada)');
    }
  } finally {
    await runner.rollbackTransaction();
    await runner.release();
    await ds.destroy();
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
