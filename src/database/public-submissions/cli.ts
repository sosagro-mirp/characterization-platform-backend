/**
 * Spec 93, Fase 3 — CLI de la operación sobre los envíos públicos pendientes.
 * Ver `backend/docs/public-submissions-ops.md` para el procedimiento completo.
 *
 * La conexión es SIEMPRE explícita, nunca `DATABASE_URL` del `.env`:
 *
 *   SYNC_TARGET_DATABASE_URL   — base sobre la que se planea / aplica / revierte
 *
 * Uso:
 *   ts-node -r tsconfig-paths/register src/database/public-submissions/cli.ts plan [--instruments id1,id2] [--out-dir <dir>]
 *   ts-node ... cli.ts apply --decisions <archivo.json> --reviewed-by <userId> [--production-target-confirm] [--confirm-count <n>] [--log-dir <dir>]
 *   ts-node ... cli.ts revert --log <archivo|directorio> [--survey <surveyId>] [--production-target-confirm] [--confirm-count <n>]
 *
 * `plan` es de solo lectura. `apply` y `revert` escriben y contra producción
 * exigen `--production-target-confirm` y escribir el número de envíos.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { createInterface } from 'readline/promises';
import { runApply } from './apply';
import {
  assertWriteAllowed,
  CliFlags,
  connect,
  createSurveysService,
  describeTarget,
  looksLikeProduction,
  parseArgs,
  requireEnv,
} from './connection';
import {
  buildDecisionsTemplate,
  generatePlanReport,
  renderPlanMarkdown,
  WORKSHOP_INSTRUMENT_ID,
} from './plan-report';
import { runRevert } from './revert';

const DEFAULT_DIR = '.public-submissions';

function stringFlag(flags: CliFlags, name: string): string | undefined {
  const value = flags[name];
  return typeof value === 'string' ? value : undefined;
}

function requireFlag(flags: CliFlags, name: string): string {
  const value = stringFlag(flags, name);
  if (!value) throw new Error(`Falta el argumento --${name}`);
  return value;
}

/**
 * Número de envíos escrito por quien opera. Con `--confirm-count` (para
 * ejecuciones sin terminal) se toma de ahí; de lo contrario se pregunta.
 */
async function askCount(
  flags: CliFlags,
  question: string,
): Promise<string | null> {
  const given = stringFlag(flags, 'confirm-count');
  if (given !== undefined) return given;
  if (!process.stdin.isTTY) return null;
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return await rl.question(question);
  } finally {
    rl.close();
  }
}

async function main() {
  const { command, flags } = parseArgs(process.argv.slice(2));
  const url = requireEnv('SYNC_TARGET_DATABASE_URL');
  const target = describeTarget(url);

  switch (command) {
    case 'plan': {
      const instrumentIds = stringFlag(flags, 'instruments')?.split(',') ?? [
        WORKSHOP_INSTRUMENT_ID,
      ];
      const ds = connect(url);
      await ds.initialize();
      try {
        const report = await generatePlanReport({
          ds,
          surveys: createSurveysService(ds),
          instrumentIds,
          target,
        });
        const dir =
          stringFlag(flags, 'out-dir') ?? join(DEFAULT_DIR, 'reports');
        mkdirSync(dir, { recursive: true });
        const stamp = report.generatedAt.replace(/[:.]/g, '-');
        const base = join(dir, `plan-${stamp}`);
        writeFileSync(`${base}.json`, JSON.stringify(report, null, 2), 'utf-8');
        writeFileSync(`${base}.md`, renderPlanMarkdown(report), 'utf-8');
        writeFileSync(
          `${base}.decisions.template.json`,
          JSON.stringify(buildDecisionsTemplate(report), null, 2),
          'utf-8',
        );
        console.log(`Destino: ${target}`);
        console.log(`Escrito: ${base}.json | .md | .decisions.template.json`);
        console.log(JSON.stringify(report.summary));
      } finally {
        await ds.destroy();
      }
      break;
    }

    case 'apply': {
      const decisionsPath = requireFlag(flags, 'decisions');
      const reviewedBy = requireFlag(flags, 'reviewed-by');
      const decisionsRaw: unknown = JSON.parse(
        readFileSync(decisionsPath, 'utf-8'),
      );
      const ds = connect(url);
      await ds.initialize();
      try {
        const result = await runApply({
          ds,
          surveys: createSurveysService(ds),
          decisionsRaw,
          reviewedBy,
          logDir: stringFlag(flags, 'log-dir') ?? join(DEFAULT_DIR, 'logs'),
          log: (message) => console.log(message),
          confirmBeforeWrite: async ({ toProcess, toDiscard }) => {
            console.log(
              `Destino: ${target}${looksLikeProduction(url) ? ' (parece producción)' : ''}`,
            );
            console.log(
              `Alcance: ${toProcess} envío(s) a procesar, ${toDiscard} a descartar.`,
            );
            const typedCount = looksLikeProduction(url)
              ? await askCount(
                  flags,
                  `Escriba el número de envíos a procesar (${toProcess}) para continuar: `,
                )
              : null;
            assertWriteAllowed({
              url,
              flags,
              expectedCount: toProcess,
              typedCount,
            });
          },
        });
        console.log(
          `Procesados: ${result.processed.length} — Descartados: ${result.discarded.length} — ` +
            `Ya aplicados (saltados): ${result.alreadyApplied.length} — Se dejan pendientes: ${result.leftPending.length}`,
        );
        if (result.runDir) console.log(`Logs en ${result.runDir}`);
        if (result.failed) {
          console.error(
            `DETENIDO en el envío ${result.failed.surveyId}: ${result.failed.message}`,
          );
          process.exitCode = 1;
        }
      } finally {
        await ds.destroy();
      }
      break;
    }

    case 'revert': {
      const ds = connect(url);
      await ds.initialize();
      try {
        const outcomes = await runRevert({
          ds,
          logPath: requireFlag(flags, 'log'),
          onlySurveyId: stringFlag(flags, 'survey'),
          log: (message) => console.log(message),
          confirmBeforeWrite: async (count) => {
            console.log(
              `Destino: ${target}${looksLikeProduction(url) ? ' (parece producción)' : ''}`,
            );
            console.log(`Alcance: ${count} envío(s) a revertir.`);
            const typedCount = looksLikeProduction(url)
              ? await askCount(
                  flags,
                  `Escriba el número de envíos a revertir (${count}) para continuar: `,
                )
              : null;
            assertWriteAllowed({
              url,
              flags,
              expectedCount: count,
              typedCount,
              verb: 'revertir',
            });
          },
        });
        console.log(
          `Revertidos: ${outcomes.filter((o) => o.status === 'reverted').length} — Omitidos: ${outcomes.filter((o) => o.status === 'skipped').length}`,
        );
      } finally {
        await ds.destroy();
      }
      break;
    }

    default:
      console.error('Comando desconocido. Use: plan | apply | revert');
      process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
