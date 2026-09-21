/**
 * Spec 85, Fase 8 — auditoría de objetos huérfanos en R2.
 *
 * SOLO LECTURA por defecto. Cruza `ListObjectsV2` (bucket) contra
 * `media_attachments` (base de datos) y reporta tres conjuntos:
 *
 *   (a) objetos en el bucket SIN fila en `media_attachments` — huérfanos reales.
 *       Excluye las claves que ya están pendientes en `media_deletion_queue`
 *       (esas se limpian con `POST /api/media-attachments/purge-pending`).
 *   (b) filas `pending` de más de N días — subidas que nunca se confirmaron.
 *   (c) filas `uploaded` cuyo objeto NO existe en el bucket — evidencia perdida.
 *
 * Uso (desde `backend/`, con el `.env` del entorno que se quiere auditar):
 *
 *   pnpm audit:orphan-media                       # informe en consola
 *   pnpm audit:orphan-media --out=informe.json    # además guarda el JSON
 *   pnpm audit:orphan-media --pending-days=14     # umbral de la clase (b)
 *
 * Borrado (acción SEPARADA, solo sobre un informe ya revisado):
 *
 *   pnpm audit:orphan-media --delete --from-report=informe.json
 *
 * `--delete` solo elimina del bucket las claves de la clase (a) listadas en el
 * informe, pide reescribir el nombre del bucket como confirmación, y nunca toca
 * la base de datos. Contra producción requiere confirmación explícita del
 * usuario en la sesión de trabajo (ver spec 85, «Puntos que exigen
 * confirmación»).
 */
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as readline from 'readline';
import { Client } from 'pg';
import {
  DeleteObjectsCommand,
  ListObjectsV2Command,
  S3Client,
} from '@aws-sdk/client-s3';

dotenv.config();

const KEY_PREFIX = 'surveys/';
const DELETE_BATCH_SIZE = 1000;

interface Report {
  generatedAt: string;
  bucket: string;
  database: string;
  pendingDays: number;
  totals: { bucketObjects: number; attachmentRows: number };
  /** (a) objetos sin fila. */
  orphanObjects: string[];
  /** Objetos sin fila que ya están en la cola de borrado (no se listan en (a)). */
  queuedObjects: string[];
  /** (b) filas pending viejas. */
  stalePending: {
    attachmentId: string;
    storageKey: string;
    createdAt: string;
  }[];
  /** (c) filas uploaded sin objeto. */
  missingObjects: { attachmentId: string; storageKey: string }[];
}

function arg(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((a) => a.startsWith(prefix))?.slice(prefix.length);
}

const flag = (name: string): boolean => process.argv.includes(`--${name}`);

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Falta la variable de entorno ${name}`);
  return value;
}

function buildS3(): { client: S3Client; bucket: string } {
  const accountId = requireEnv('R2_ACCOUNT_ID');
  return {
    bucket: requireEnv('R2_BUCKET_NAME'),
    client: new S3Client({
      region: 'auto',
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: requireEnv('R2_ACCESS_KEY_ID'),
        secretAccessKey: requireEnv('R2_SECRET_ACCESS_KEY'),
      },
    }),
  };
}

function buildPg(): { client: Client; label: string } {
  const url = process.env.DATABASE_URL;
  if (url) {
    return {
      client: new Client({
        connectionString: url,
        ssl:
          process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
      }),
      label: new URL(url).host,
    };
  }
  const host = requireEnv('DB_HOST');
  return {
    client: new Client({
      host,
      port: parseInt(process.env.DB_PORT ?? '5432', 10),
      user: requireEnv('DB_USER'),
      password: requireEnv('DB_PASSWORD'),
      database: requireEnv('DB_NAME'),
      ssl:
        process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
    }),
    label: `${host}:${process.env.DB_PORT ?? '5432'}/${requireEnv('DB_NAME')}`,
  };
}

async function listBucketKeys(
  client: S3Client,
  bucket: string,
): Promise<string[]> {
  const keys: string[] = [];
  let token: string | undefined;
  do {
    const page = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: KEY_PREFIX,
        ContinuationToken: token,
      }),
    );
    for (const object of page.Contents ?? []) {
      if (object.Key) keys.push(object.Key);
    }
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (token);
  return keys;
}

async function ask(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) =>
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    }),
  );
}

async function audit(): Promise<Report> {
  const pendingDays = parseInt(arg('pending-days') ?? '7', 10);
  const { client: s3, bucket } = buildS3();
  const { client: pg, label } = buildPg();
  await pg.connect();

  try {
    console.log(`Bucket: ${bucket}`);
    console.log(`Base de datos: ${label}`);
    console.log('Modo: SOLO LECTURA\n');

    const bucketKeys = await listBucketKeys(s3, bucket);

    const attachments = await pg.query<{
      attachment_id: string;
      storage_key: string;
      status: string;
      created_at: Date;
    }>(
      `SELECT attachment_id, storage_key, status, created_at FROM media_attachments`,
    );

    // La cola solo existe desde la migración de la Fase 7: si aún no se
    // aplicó, se audita igual sin ella.
    let queued = new Set<string>();
    try {
      const queue = await pg.query<{ storage_key: string }>(
        `SELECT storage_key FROM media_deletion_queue WHERE deleted_at IS NULL`,
      );
      queued = new Set(queue.rows.map((r) => r.storage_key));
    } catch {
      console.log(
        '(aviso) media_deletion_queue no existe todavía; se omite.\n',
      );
    }

    const knownKeys = new Set(attachments.rows.map((r) => r.storage_key));
    const bucketSet = new Set(bucketKeys);
    const cutoff = Date.now() - pendingDays * 24 * 60 * 60 * 1000;

    const withoutRow = bucketKeys.filter((k) => !knownKeys.has(k));

    return {
      generatedAt: new Date().toISOString(),
      bucket,
      database: label,
      pendingDays,
      totals: {
        bucketObjects: bucketKeys.length,
        attachmentRows: attachments.rowCount ?? 0,
      },
      orphanObjects: withoutRow.filter((k) => !queued.has(k)),
      queuedObjects: withoutRow.filter((k) => queued.has(k)),
      stalePending: attachments.rows
        .filter(
          (r) => r.status === 'pending' && r.created_at.getTime() < cutoff,
        )
        .map((r) => ({
          attachmentId: r.attachment_id,
          storageKey: r.storage_key,
          createdAt: r.created_at.toISOString(),
        })),
      missingObjects: attachments.rows
        .filter((r) => r.status === 'uploaded' && !bucketSet.has(r.storage_key))
        .map((r) => ({
          attachmentId: r.attachment_id,
          storageKey: r.storage_key,
        })),
    };
  } finally {
    await pg.end();
  }
}

function printReport(report: Report): void {
  console.log(
    `Objetos en el bucket (${KEY_PREFIX}*): ${report.totals.bucketObjects}`,
  );
  console.log(
    `Filas en media_attachments:           ${report.totals.attachmentRows}\n`,
  );
  console.log(
    `(a) Objetos sin fila (huérfanos):     ${report.orphanObjects.length}`,
  );
  console.log(
    `    ya en la cola de borrado:         ${report.queuedObjects.length}`,
  );
  console.log(
    `(b) Filas pending de más de ${report.pendingDays} días: ${report.stalePending.length}`,
  );
  console.log(
    `(c) Filas uploaded sin objeto:        ${report.missingObjects.length}`,
  );
}

async function deleteFromReport(path: string): Promise<void> {
  const report = JSON.parse(fs.readFileSync(path, 'utf8')) as Report;
  const { client: s3, bucket } = buildS3();

  if (report.bucket !== bucket) {
    throw new Error(
      `El informe es del bucket «${report.bucket}» pero el .env apunta a «${bucket}». Se aborta.`,
    );
  }
  if (!report.orphanObjects.length) {
    console.log(
      'El informe no lista objetos huérfanos (clase a). Nada que borrar.',
    );
    return;
  }

  console.log(
    `Se borrarán ${report.orphanObjects.length} objetos del bucket «${bucket}» ` +
      `listados en la clase (a) del informe del ${report.generatedAt}.`,
  );
  console.log(
    'La base de datos NO se modifica. El borrado en R2 es irreversible.',
  );
  const typed = await ask(
    `Escriba el nombre del bucket («${bucket}») para confirmar: `,
  );
  if (typed !== bucket) {
    console.log('Confirmación incorrecta. No se borró nada.');
    return;
  }

  let deleted = 0;
  const failed: string[] = [];
  for (let i = 0; i < report.orphanObjects.length; i += DELETE_BATCH_SIZE) {
    const batch = report.orphanObjects.slice(i, i + DELETE_BATCH_SIZE);
    const result = await s3.send(
      new DeleteObjectsCommand({
        Bucket: bucket,
        Delete: { Objects: batch.map((Key) => ({ Key })), Quiet: false },
      }),
    );
    deleted += result.Deleted?.length ?? 0;
    for (const error of result.Errors ?? [])
      if (error.Key) failed.push(error.Key);
  }
  console.log(`Borrados: ${deleted}. Fallidos: ${failed.length}.`);
  if (failed.length) console.log(failed.join('\n'));
}

async function main(): Promise<void> {
  if (flag('delete')) {
    const from = arg('from-report');
    if (!from) {
      throw new Error(
        '--delete exige --from-report=<informe.json> (un informe ya revisado).',
      );
    }
    await deleteFromReport(from);
    return;
  }

  const report = await audit();
  printReport(report);

  const out = arg('out');
  if (out) {
    fs.writeFileSync(out, JSON.stringify(report, null, 2));
    console.log(`\nInforme guardado en ${out}`);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
