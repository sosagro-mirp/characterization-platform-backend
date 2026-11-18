import 'reflect-metadata';
import * as dotenv from 'dotenv';

dotenv.config();

import { NestFactory } from '@nestjs/core';
import { DataSource } from 'typeorm';
import { AppModule } from '../../app.module';
import { DashboardService } from '../../dashboard/dashboard.service';
import { DashboardBuilderService } from '../../dashboard/dashboard-builder.service';
import { applyDashboardCharts } from './dashboard-charts.seed';

/**
 * Spec 108 (P16) — semilla de C1, C2 y Resumen general.
 *
 *   pnpm seed:dashboard-charts -- --env development [--dry-run]
 *   DATABASE_URL=… pnpm seed:dashboard-charts -- --env production --confirm-production
 *
 * `--dry-run` imprime el plan sin escribir (es la lista que el usuario aprueba).
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
  const dryRun = process.argv.includes('--dry-run');
  console.log(
    `\nBase: ${env} (${new URL(url).hostname.replace(/^[^.]+/, '***')})${dryRun ? ' — dry-run' : ''}`,
  );

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error'],
  });
  try {
    const ds = app.get(DataSource);
    const admin = await ds.query<{ user_id: string }[]>(
      `SELECT u.user_id FROM users u WHERE u.email = $1 LIMIT 1`,
      [process.env.ADMIN_EMAIL ?? ''],
    );
    if (!admin[0]) fail('No se encontró el usuario admin (ADMIN_EMAIL).');
    const report = await applyDashboardCharts(
      ds,
      app.get(DashboardService),
      app.get(DashboardBuilderService),
      admin[0].user_id,
      dryRun,
    );
    console.log(`\nPlan: ${report.planned.length} gráficos`);
    for (const p of report.planned) {
      console.log(
        `  [${p.categoryCode}] ${p.chartKind.padEnd(16)} ${p.title}${p.note ? ` (${p.note})` : ''}`,
      );
    }
    if (!dryRun) {
      console.log(`\nCreados y publicados: ${report.created.length}`);
      console.log(`Ya existían: ${report.skippedExisting.length}`);
    }
    console.log(`Sin resolver (unresolved): ${report.unresolved.length}`);
    for (const u of report.unresolved)
      console.log(`  - ${u.title}: ${u.reason}`);
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
