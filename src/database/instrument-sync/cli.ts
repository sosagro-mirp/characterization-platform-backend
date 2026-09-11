/**
 * Spec 84, Fase 3 — CLI de `instrument-sync`. Ver `backend/docs/instrument-sync.md`
 * para el procedimiento operativo completo.
 *
 * Conexiones **siempre explícitas** por variable de entorno — nunca se toma
 * `DATABASE_URL` de forma implícita, para que sea imposible confundir origen
 * y destino por accidente:
 *
 *   SYNC_SOURCE_DATABASE_URL   — de dónde se exporta / compara
 *   SYNC_TARGET_DATABASE_URL   — a dónde se aplica / se hace snapshot
 *
 * Uso:
 *   ts-node -r tsconfig-paths/register src/database/instrument-sync/cli.ts export --out <archivo> [--instruments id1,id2]
 *   ts-node ... cli.ts snapshot --to-target [--production-target-confirm]
 *   ts-node ... cli.ts plan --base <archivo> --desired <archivo> --current <archivo> --out <archivo>
 *   ts-node ... cli.ts apply --plan <archivo> [--production-target-confirm] --out-backup <archivo>
 *   ts-node ... cli.ts restore --backup <archivo> [--production-target-confirm]
 *   ts-node ... cli.ts verify --manifest <archivo>
 *   ts-node ... cli.ts inventory --manifest <archivo> --out <archivo.md>
 */
import { readFileSync, writeFileSync } from 'fs';
import { DataSource } from 'typeorm';
import {
  applyPlan,
  buildPlan,
  exportManifest,
  generateInventory,
  InstrumentManifest,
  Plan,
  restoreFromBackup,
  snapshot,
} from './index';

function parseArgs(argv: string[]): {
  command: string;
  flags: Record<string, string | boolean>;
} {
  const [command, ...rest] = argv;
  const flags: Record<string, string | boolean> = {};
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    const next = rest[i + 1];
    if (next !== undefined && !next.startsWith('--')) {
      flags[key] = next;
      i++;
    } else {
      flags[key] = true;
    }
  }
  return { command, flags };
}

function connect(url: string): DataSource {
  return new DataSource({
    type: 'postgres',
    url,
    ssl: url.includes('neon.tech') ? { rejectUnauthorized: false } : false,
    // Solo lectura/escritura por SQL crudo — sin entidades registradas.
    entities: [],
  });
}

function readManifest(path: string): InstrumentManifest {
  return JSON.parse(readFileSync(path, 'utf-8')) as InstrumentManifest;
}

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, JSON.stringify(value, null, 2), 'utf-8');
  console.log(`Escrito: ${path}`);
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Falta la variable de entorno ${name}`);
  return value;
}

/** Bloquea escrituras contra producción salvo confirmación explícita del flag. */
function assertTargetAllowed(
  url: string,
  flags: Record<string, string | boolean>,
): void {
  const looksLikeProduction =
    url.includes('neon.tech') || url.includes('railway');
  if (looksLikeProduction && !flags['production-target-confirm']) {
    throw new Error(
      'El destino parece producción. Repita el comando con --production-target-confirm ' +
        'solo después de confirmarlo explícitamente con el usuario.',
    );
  }
}

async function main() {
  const { command, flags } = parseArgs(process.argv.slice(2));

  switch (command) {
    case 'export': {
      const ds = connect(requireEnv('SYNC_SOURCE_DATABASE_URL'));
      await ds.initialize();
      const instrumentIds =
        typeof flags.instruments === 'string'
          ? flags.instruments.split(',')
          : undefined;
      const manifest = await exportManifest(ds, { instrumentIds });
      writeJson(String(flags.out ?? 'manifest.json'), manifest);
      await ds.destroy();
      break;
    }

    case 'snapshot': {
      const source = connect(requireEnv('SYNC_SOURCE_DATABASE_URL'));
      const targetUrl = requireEnv('SYNC_TARGET_DATABASE_URL');
      if (targetUrl.includes('neon.tech') || targetUrl.includes('railway')) {
        throw new Error(
          'snapshot nunca corre contra un destino que parece producción.',
        );
      }
      await source.initialize();
      const manifest = await exportManifest(source);
      await source.destroy();

      const target = connect(targetUrl);
      await target.initialize();
      await snapshot(target, manifest, { isProduction: false });
      await target.destroy();
      console.log(
        `Snapshot aplicado: ${manifest.instruments.length} instrumentos.`,
      );
      break;
    }

    case 'plan': {
      const base = readManifest(String(flags.base));
      const desired = readManifest(String(flags.desired));
      const current = readManifest(String(flags.current));
      const plan = buildPlan({ base, desired, current });
      writeJson(String(flags.out ?? 'plan.json'), plan);
      console.log(
        `Operaciones: ${plan.operations.length} — Conflictos: ${plan.conflicts.length}`,
      );
      for (const op of plan.operations) {
        console.log(`  ${op.kind.padEnd(10)} ${op.entity.padEnd(10)} ${op.id}`);
      }
      for (const conflict of plan.conflicts) {
        console.log(
          `  CONFLICTO [${conflict.type}] ${conflict.entity} ${conflict.id}: ${conflict.message}`,
        );
      }
      break;
    }

    case 'apply': {
      const plan = JSON.parse(
        readFileSync(String(flags.plan), 'utf-8'),
      ) as Plan;
      const targetUrl = requireEnv('SYNC_TARGET_DATABASE_URL');
      assertTargetAllowed(targetUrl, flags);
      const ds = connect(targetUrl);
      await ds.initialize();
      const result = await applyPlan(ds, plan);
      await ds.destroy();
      if (flags['out-backup'])
        writeJson(String(flags['out-backup']), result.backup);
      console.log(`Aplicado: ${result.applied.length} operación(es).`);
      break;
    }

    case 'restore': {
      const backup = readManifest(String(flags.backup));
      const targetUrl = requireEnv('SYNC_TARGET_DATABASE_URL');
      assertTargetAllowed(targetUrl, flags);
      const ds = connect(targetUrl);
      await ds.initialize();
      const result = await restoreFromBackup(ds, backup);
      await ds.destroy();
      console.log(`Restaurado: ${result.applied.length} operación(es).`);
      break;
    }

    case 'verify': {
      const manifest = readManifest(String(flags.manifest));
      const targetUrl = requireEnv('SYNC_TARGET_DATABASE_URL');
      const ds = connect(targetUrl);
      await ds.initialize();
      const current = await exportManifest(ds, {
        instrumentIds: manifest.instruments.map((i) => i.instrumentId),
      });
      await ds.destroy();
      const plan = buildPlan({ base: manifest, desired: manifest, current });
      if (plan.operations.length === 0 && plan.conflicts.length === 0) {
        console.log('OK — el destino coincide con el manifiesto.');
      } else {
        console.log(
          `DIFERENCIAS — operaciones: ${plan.operations.length}, conflictos: ${plan.conflicts.length}`,
        );
        process.exitCode = 1;
      }
      break;
    }

    case 'inventory': {
      const manifest = readManifest(String(flags.manifest));
      const markdown = generateInventory(manifest);
      writeFileSync(String(flags.out ?? 'inventario.md'), markdown, 'utf-8');
      console.log(`Escrito: ${flags.out ?? 'inventario.md'}`);
      break;
    }

    default:
      console.error(
        'Comando desconocido. Use: export | snapshot | plan | apply | restore | verify | inventory',
      );
      process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
