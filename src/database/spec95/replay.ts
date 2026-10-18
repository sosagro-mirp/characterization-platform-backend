import * as dotenv from 'dotenv';
import { DataSource, EntityManager } from 'typeorm';
import { ConsentDocument } from 'src/consents/entities/consent-document.entity';
import { ConsentRecord } from 'src/consents/entities/consent-record.entity';
import { ConsentDocumentsService } from 'src/consents/consent-documents.service';
import { ConsentRecordsService } from 'src/consents/consent-records.service';
import { DocumentCollisionError } from 'src/farmer-extraction/document-collision';
import {
  ExtractionChanges,
  FarmerExtractionService,
} from 'src/farmer-extraction/farmer-extraction.service';

/**
 * Spec 95 (D-H3-5) — reprocesado histórico: corre la extracción unificada sobre
 * las encuestas de campo que nadie extrajo con las reglas nuevas
 * (`extraction_status` NULL, `backfilled` o `error`). Solo completa vacíos y
 * registra discrepancias; nunca pisa un valor.
 *
 *   pnpm extraction:replay --dry-run     # informe; no escribe nada
 *   pnpm extraction:replay --apply       # aplica (con aprobación, sin taller)
 *
 * Por seguridad la CLI NO usa `DATABASE_URL`: lee `EXTRACTION_REPLAY_DATABASE_URL`,
 * para que apuntar a producción sea una decisión explícita.
 */

export interface ReplayOptions {
  mode: 'dry-run' | 'apply';
  /** Acota el reprocesado a estas encuestas (imprescindible en pruebas). */
  surveyIds?: string[];
}

export interface ReplaySurveyReport {
  surveyId: string;
  /** Estado en que quedaría (dry-run) o quedó (apply) la encuesta. */
  status: string | null;
  farmerId: string | null;
  changes: ExtractionChanges | null;
  error?: string;
}

export interface ReplayReport {
  mode: 'dry-run' | 'apply';
  total: number;
  byStatus: Record<string, number>;
  totals: {
    farmersCreated: number;
    farmsCreated: number;
    fieldsCompleted: number;
    discrepanciesCreated: number;
    cropsAdded: number;
  };
  surveys: ReplaySurveyReport[];
}

const SELECT_SURVEYS = `
  SELECT s.survey_id AS "surveyId"
    FROM surveys s
   WHERE s.origin = 'field'
     AND (s.extraction_status IS NULL OR s.extraction_status IN ('backfilled', 'error', 'no_identity', 'pending_alias'))
     AND EXISTS (SELECT 1 FROM responses r WHERE r.survey_id = s.survey_id)
     AND ($1::uuid[] IS NULL OR s.survey_id = ANY($1::uuid[]))
   ORDER BY s.created_at ASC, s.survey_id ASC`;

function buildService(ds: DataSource): FarmerExtractionService {
  const consentRecords = new ConsentRecordsService(
    ds.getRepository(ConsentRecord),
    new ConsentDocumentsService(ds.getRepository(ConsentDocument)),
  );
  return new FarmerExtractionService(ds, consentRecords);
}

async function replayOne(
  service: FarmerExtractionService,
  manager: EntityManager,
  surveyId: string,
): Promise<ReplaySurveyReport> {
  await manager.query('SAVEPOINT replay_survey');
  try {
    const result = await service.extract(manager, surveyId, {
      trigger: 'replay',
    });
    await manager.query('RELEASE SAVEPOINT replay_survey');
    return {
      surveyId,
      status: result.status,
      farmerId: result.farmer?.id ?? null,
      changes: result.changes,
    };
  } catch (err) {
    await manager.query('ROLLBACK TO SAVEPOINT replay_survey');
    if (err instanceof DocumentCollisionError) {
      await service.recordPendingCollision(manager, err);
      return {
        surveyId,
        status: 'collision',
        farmerId: null,
        changes: null,
      };
    }
    const message = err instanceof Error ? err.message : String(err);
    await manager.query(
      `UPDATE surveys SET extraction_status = 'error', extraction_error = $2, extracted_at = NULL WHERE survey_id = $1`,
      [surveyId, message.slice(0, 2000)],
    );
    return {
      surveyId,
      status: 'error',
      farmerId: null,
      changes: null,
      error: message,
    };
  }
}

export async function runExtractionReplay(
  ds: DataSource,
  options: ReplayOptions,
): Promise<ReplayReport> {
  const service = buildService(ds);
  const ids = await ds.query<{ surveyId: string }[]>(SELECT_SURVEYS, [
    options.surveyIds?.length ? options.surveyIds : null,
  ]);

  const surveys: ReplaySurveyReport[] = [];
  const queryRunner = ds.createQueryRunner();
  await queryRunner.connect();
  try {
    if (options.mode === 'dry-run') {
      // Todo en UNA transacción que siempre se revierte: el informe sale de lo
      // que la extracción habría hecho, sin dejar nada.
      await queryRunner.startTransaction();
      try {
        for (const { surveyId } of ids) {
          surveys.push(await replayOne(service, queryRunner.manager, surveyId));
        }
      } finally {
        await queryRunner.rollbackTransaction();
      }
    } else {
      // Una transacción por encuesta: un fallo no tumba el resto del lote.
      for (const { surveyId } of ids) {
        await queryRunner.startTransaction();
        try {
          surveys.push(await replayOne(service, queryRunner.manager, surveyId));
          await queryRunner.commitTransaction();
        } catch (err) {
          await queryRunner.rollbackTransaction();
          surveys.push({
            surveyId,
            status: 'error',
            farmerId: null,
            changes: null,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
    }
  } finally {
    await queryRunner.release();
  }

  const report: ReplayReport = {
    mode: options.mode,
    total: surveys.length,
    byStatus: {},
    totals: {
      farmersCreated: 0,
      farmsCreated: 0,
      fieldsCompleted: 0,
      discrepanciesCreated: 0,
      cropsAdded: 0,
    },
    surveys,
  };
  for (const s of surveys) {
    const key = s.status ?? 'skipped';
    report.byStatus[key] = (report.byStatus[key] ?? 0) + 1;
    if (!s.changes) continue;
    report.totals.farmersCreated += s.changes.farmerCreated ? 1 : 0;
    report.totals.farmsCreated += s.changes.farmCreated ? 1 : 0;
    report.totals.fieldsCompleted +=
      s.changes.farmerFieldsCompleted.length +
      s.changes.farmFieldsCompleted.length;
    report.totals.discrepanciesCreated += s.changes.discrepanciesCreated;
    report.totals.cropsAdded += s.changes.cropsAdded.length;
  }
  return report;
}

async function main(): Promise<void> {
  dotenv.config();
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const apply = args.includes('--apply');
  if (dryRun === apply) {
    throw new Error('Indique exactamente una opción: --dry-run o --apply.');
  }
  const url = process.env.EXTRACTION_REPLAY_DATABASE_URL;
  if (!url) {
    throw new Error(
      'Falta EXTRACTION_REPLAY_DATABASE_URL: la CLI nunca usa DATABASE_URL por defecto.',
    );
  }
  const idsArg = args.find((a) => a.startsWith('--survey-ids='));
  const surveyIds = idsArg
    ? idsArg
        .slice('--survey-ids='.length)
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean)
    : undefined;

  const ds = new DataSource({
    type: 'postgres',
    url,
    ssl: url.includes('neon.tech') ? { rejectUnauthorized: false } : false,
    entities: [__dirname + '/../../**/*.entity.{ts,js}'],
    synchronize: false,
    logging: false,
  });
  await ds.initialize();
  try {
    const report = await runExtractionReplay(ds, {
      mode: apply ? 'apply' : 'dry-run',
      surveyIds,
    });
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await ds.destroy();
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
