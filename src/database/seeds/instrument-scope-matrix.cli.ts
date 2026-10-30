import 'reflect-metadata';
import * as dotenv from 'dotenv';

dotenv.config();

import { DataSource } from 'typeorm';
import { applyInstrumentScopeMatrix } from './instrument-scope-matrix.seed';

/**
 * Spec 98 — lanzador de la matriz de alcance (Anexo A). Idempotente: solo
 * escribe donde `scope_level IS NULL`.
 *
 *   pnpm seed:instrument-scope -- --env development
 *   DATABASE_URL=… pnpm seed:instrument-scope -- --env production \
 *     --confirm-production
 *
 * `--env` es obligatorio y debe coincidir con la base a la que apunta la
 * conexión. En desarrollo la `DATABASE_URL` activa del `.env` (Neon
 * `sosagro-dev`); la de producción se pasa en el entorno del comando.
 */

function fail(message: string): never {
  console.error(`\n✖ ${message}\n`);
  process.exit(1);
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main(): Promise<void> {
  const env = arg('env');
  if (env !== 'development' && env !== 'production') {
    fail('Falta --env development | production.');
  }
  const url = process.env.DATABASE_URL;
  if (!url) fail('DATABASE_URL no está definida.');
  if (env === 'production' && !process.argv.includes('--confirm-production')) {
    fail('--env production exige --confirm-production.');
  }
  const host = new URL(url).hostname;
  console.log(`\nBase: ${env} (${host.replace(/^[^.]+/, '***')})`);

  const ds = new DataSource({
    type: 'postgres',
    url,
    ssl: { rejectUnauthorized: false },
  });
  await ds.initialize();
  try {
    const { updated, missing } = await applyInstrumentScopeMatrix(ds);
    console.log(`Instrumentos con alcance escrito: ${updated}`);
    if (missing.length)
      console.log(`Sin instrumento en esta base: ${missing.join(', ')}`);
  } finally {
    await ds.destroy();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
