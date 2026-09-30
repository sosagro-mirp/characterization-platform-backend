import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { DataSource } from 'typeorm';
import { Farm } from 'src/farms/entities/farm.entity';
import { Farmer } from 'src/farmers/entities/farmer.entity';
import { normalizeDocumentId } from 'src/farmers/document-id';
import {
  FARM_COMPLETABLE_FIELDS,
  FARMER_COMPLETABLE_FIELDS,
  ProcessPreview,
} from 'src/surveys/public-submission-plan';
import { SurveysService } from 'src/surveys/surveys.service';
import {
  checkDecisionAgainstPreview,
  crossCheckDecisions,
  isUuid,
  SurveyState,
  validateDecisionsFile,
} from './decisions';
import { diffSnapshots, StateSnapshot } from './log';
import {
  CollisionRowSnapshot,
  SubmissionDecision,
  SubmissionLog,
} from './types';

/**
 * Spec 93, Fase 3 — `public-submissions:apply`. Un envío por transacción, con
 * la MISMA lógica que la API: llama a `SurveysService.processPublicSubmission`
 * (y `discardPublicSubmission`), no reimplementa nada. Lo propio de la CLI es
 * validar antes de tocar, fotografiar el estado antes y después para el log, y
 * detenerse en el primer error.
 */

export interface ApplyParams {
  ds: DataSource;
  surveys: SurveysService;
  decisionsRaw: unknown;
  reviewedBy: string;
  /** Directorio donde se crea la carpeta de esta corrida con un log por envío. */
  logDir: string;
  /** Se invoca tras validar y antes de la primera escritura (guarda de producción). */
  confirmBeforeWrite: (scope: {
    toProcess: number;
    toDiscard: number;
  }) => Promise<void>;
  log: (message: string) => void;
}

export interface ApplyResult {
  runDir: string | null;
  processed: string[];
  discarded: string[];
  alreadyApplied: string[];
  leftPending: string[];
  failed: { surveyId: string; message: string } | null;
  warnings: string[];
}

function pick(
  source: object,
  fields: readonly string[],
): Record<string, unknown> {
  const record = source as Record<string, unknown>;
  return Object.fromEntries(fields.map((f) => [f, record[f] ?? null]));
}

function iso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : String(value);
}

export async function captureState(
  ds: DataSource,
  surveyId: string,
  opts: {
    farmerId: string | null;
    /** Finca a fotografiar aunque el productor aún no la tenga (modo `link`). */
    farmIdHint: string | null;
    documentKey: string | null;
  },
): Promise<StateSnapshot> {
  const [row] = await ds.query<
    {
      review_status: string | null;
      farmer_id: string | null;
      reviewed_by: string | null;
      reviewed_at: Date | null;
      respondent_name: string | null;
      respondent_phone: string | null;
      respondent_document_id: string | null;
      respondent_email: string | null;
    }[]
  >(
    `SELECT review_status, farmer_id, reviewed_by, reviewed_at, respondent_name,
            respondent_phone, respondent_document_id, respondent_email
       FROM surveys WHERE survey_id = $1`,
    [surveyId],
  );

  const farmerEntity = opts.farmerId
    ? await ds.getRepository(Farmer).findOne({
        where: { id: opts.farmerId },
        relations: ['farm'],
      })
    : null;
  const farmId = farmerEntity?.farm?.farmId ?? opts.farmIdHint;
  const farmEntity = farmId
    ? await ds.getRepository(Farm).findOne({
        where: { farmId },
        relations: ['town'],
      })
    : null;
  const cropRows = farmEntity
    ? await ds.query<{ crop_id: string }[]>(
        'SELECT crop_id FROM farms_crops WHERE farm_id = $1',
        [farmEntity.farmId],
      )
    : [];

  const consent = await ds.query<
    { consent_record_id: string; farmer_id: string | null }[]
  >(
    'SELECT consent_record_id, farmer_id FROM consent_records WHERE survey_id = $1',
    [surveyId],
  );

  const collisions = opts.documentKey
    ? await ds.query<
        {
          collision_id: string;
          document_id: string;
          submitted_name: string;
          survey_id: string | null;
          existing_farmer_id: string;
          resolution: string | null;
          resolved_at: Date | null;
        }[]
      >(
        `SELECT collision_id, document_id, submitted_name, survey_id,
                existing_farmer_id, resolution, resolved_at
           FROM farmer_document_collisions
          WHERE regexp_replace(document_id, '[.\\s-]', '', 'g') = $1`,
        [opts.documentKey],
      )
    : [];

  return {
    survey: {
      reviewStatus: row?.review_status ?? null,
      farmerId: row?.farmer_id ?? null,
      reviewedBy: row?.reviewed_by ?? null,
      reviewedAt: iso(row?.reviewed_at),
      respondent: {
        name: row?.respondent_name ?? null,
        phone: row?.respondent_phone ?? null,
        documentId: row?.respondent_document_id ?? null,
        email: row?.respondent_email ?? null,
      },
    },
    farmer: farmerEntity
      ? {
          farmerId: farmerEntity.id,
          farmId: farmerEntity.farm?.farmId ?? null,
          values: pick(farmerEntity, FARMER_COMPLETABLE_FIELDS),
        }
      : null,
    farm: farmEntity
      ? {
          farmId: farmEntity.farmId,
          values: {
            ...pick(farmEntity, FARM_COMPLETABLE_FIELDS),
            townId: farmEntity.town?.townId ?? null,
          },
          cropIds: cropRows.map((c) => c.crop_id).sort(),
        }
      : null,
    consent: consent.map((c) => ({
      consentRecordId: c.consent_record_id,
      farmerId: c.farmer_id,
    })),
    collisions: collisions.map(
      (c): CollisionRowSnapshot => ({
        collisionId: c.collision_id,
        documentId: c.document_id,
        submittedName: c.submitted_name,
        surveyId: c.survey_id,
        existingFarmerId: c.existing_farmer_id,
        resolution: c.resolution,
        resolvedAt: iso(c.resolved_at),
      }),
    ),
  };
}

async function loadFarmName(
  ds: DataSource,
  surveyId: string,
): Promise<string | null> {
  const [row] = await ds.query<{ textValue: string | null }[]>(
    `SELECT r.text_value AS "textValue"
       FROM responses r JOIN questions q ON q.question_id = r.question_id
      WHERE r.survey_id = $1 AND q.system_field = 'farm.name' LIMIT 1`,
    [surveyId],
  );
  return row?.textValue ?? null;
}

async function loadExistingIds(
  ds: DataSource,
  table: 'farms' | 'towns',
  column: 'farm_id' | 'town_id',
  ids: string[],
): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const rows = await ds.query<Record<string, string>[]>(
    `SELECT ${column} FROM ${table} WHERE ${column} = ANY($1::uuid[])`,
    [ids],
  );
  return new Set(rows.map((r) => r[column]));
}

/** Productor que la API va a reutilizar según la vista previa, si hay uno. */
function expectedFarmerId(
  preview: ProcessPreview,
  decision: SubmissionDecision,
): string | null {
  if (preview.document.farmerId) return preview.document.farmerId;
  if (
    preview.document.status === 'collision' &&
    decision.resolution === 'same_person'
  ) {
    return preview.document.candidates[0]?.farmerId ?? null;
  }
  return null;
}

async function processOne(
  params: ApplyParams,
  decision: SubmissionDecision,
  preview: ProcessPreview,
): Promise<SubmissionLog> {
  const { ds, surveys } = params;
  const documentKey = normalizeDocumentId(preview.identity.documentId);
  const beforeFarmerId = expectedFarmerId(preview, decision);
  const before = await captureState(ds, decision.surveyId, {
    farmerId: beforeFarmerId,
    farmIdHint:
      decision.farm?.mode === 'link' ? (decision.farm.farmId ?? null) : null,
    documentKey: preview.document.status === 'collision' ? documentKey : null,
  });

  const result = await surveys.processPublicSubmission(
    decision.surveyId,
    {
      ...(decision.resolution ? { resolution: decision.resolution } : {}),
      ...(decision.farm ? { farm: decision.farm } : {}),
      ...(decision.townId ? { townId: decision.townId } : {}),
    },
    params.reviewedBy,
  );

  const after = await captureState(ds, decision.surveyId, {
    farmerId: result.farmer.id,
    farmIdHint: null,
    documentKey: preview.document.status === 'collision' ? documentKey : null,
  });

  const cropNames = new Map(
    preview.crops.resolved.map((c) => [c.cropId, c.name]),
  );
  const parts = diffSnapshots(before, after, {
    decision,
    farmerExisted: result.existed,
    cropNames,
  });

  // La vista previa se calculó justo antes y es determinista; si aun así la
  // API reutilizó a otro productor, no se puede afirmar qué finca era nueva:
  // el log queda conservador para que `revert` no desvincule nada por error.
  if (result.existed && before.farmer?.farmerId !== result.farmer.id) {
    parts.anomalies.push(
      'el productor reutilizado no coincide con la vista previa; el log es conservador',
    );
    if (parts.farm) {
      parts.farm = { ...parts.farm, mode: 'existing', assignedToFarmer: false };
    }
  }

  return {
    formatVersion: 1,
    surveyId: decision.surveyId,
    action: 'process',
    appliedAt: new Date().toISOString(),
    reviewedBy: params.reviewedBy,
    decision,
    previousState: before.survey,
    ...parts,
  };
}

async function discardOne(
  params: ApplyParams,
  decision: SubmissionDecision,
): Promise<SubmissionLog> {
  const before = await captureState(params.ds, decision.surveyId, {
    farmerId: null,
    farmIdHint: null,
    documentKey: null,
  });
  await params.surveys.discardPublicSubmission(
    decision.surveyId,
    params.reviewedBy,
  );
  return {
    formatVersion: 1,
    surveyId: decision.surveyId,
    action: 'discard',
    appliedAt: new Date().toISOString(),
    reviewedBy: params.reviewedBy,
    decision,
    previousState: before.survey,
    farmer: null,
    farm: null,
    cropsAdded: [],
    fieldsCompleted: [],
    anomalies: [],
    consentRecordsRelinked: [],
    collision: null,
  };
}

export async function runApply(params: ApplyParams): Promise<ApplyResult> {
  const { ds, surveys, log } = params;
  const result: ApplyResult = {
    runDir: null,
    processed: [],
    discarded: [],
    alreadyApplied: [],
    leftPending: [],
    failed: null,
    warnings: [],
  };

  // 1. Validación estricta, antes de tocar nada.
  const { file, errors: fileErrors } = validateDecisionsFile(
    params.decisionsRaw,
  );
  if (!file)
    throw new Error(
      `Archivo de decisiones inválido:\n- ${fileErrors.join('\n- ')}`,
    );
  if (!isUuid(params.reviewedBy)) {
    throw new Error('--reviewed-by debe ser el UUID de un usuario.');
  }
  const [reviewer] = await ds.query<{ user_id: string }[]>(
    'SELECT user_id FROM users WHERE user_id = $1',
    [params.reviewedBy],
  );
  if (!reviewer) throw new Error(`El usuario ${params.reviewedBy} no existe.`);

  const ids = file.decisions.map((d) => d.surveyId);
  const stateRows = await ds.query<
    { survey_id: string; origin: string; review_status: string | null }[]
  >(
    'SELECT survey_id, origin, review_status FROM surveys WHERE survey_id = ANY($1::uuid[])',
    [ids],
  );
  const states = new Map<string, SurveyState>(
    stateRows.map((r) => [
      r.survey_id,
      { origin: r.origin, reviewStatus: r.review_status },
    ]),
  );
  const farmIds = await loadExistingIds(
    ds,
    'farms',
    'farm_id',
    file.decisions.flatMap((d) => (d.farm?.farmId ? [d.farm.farmId] : [])),
  );
  const townIds = await loadExistingIds(
    ds,
    'towns',
    'town_id',
    file.decisions.flatMap((d) => (d.townId ? [d.townId] : [])),
  );
  const check = crossCheckDecisions(file.decisions, states, {
    farmIds,
    townIds,
  });

  // Vista previa de cada envío a procesar: mismas reglas que la API aplicará.
  const previewErrors: string[] = [];
  for (const decision of check.toProcess) {
    try {
      const preview = await surveys.previewPublicSubmission(decision.surveyId, {
        townId: decision.townId,
      });
      const farmName = await loadFarmName(ds, decision.surveyId);
      const verdict = checkDecisionAgainstPreview(decision, preview, farmName);
      previewErrors.push(
        ...verdict.errors.map((e) => `Envío ${decision.surveyId}: ${e}`),
      );
      result.warnings.push(
        ...verdict.warnings.map((w) => `Envío ${decision.surveyId}: ${w}`),
      );
    } catch (err) {
      previewErrors.push(
        `Envío ${decision.surveyId}: la vista previa falló (${err instanceof Error ? err.message : String(err)}).`,
      );
    }
  }
  const allErrors = [...check.errors, ...previewErrors];
  if (allErrors.length > 0) {
    throw new Error(`Decisiones no aplicables:\n- ${allErrors.join('\n- ')}`);
  }

  result.alreadyApplied = check.alreadyApplied.map((d) => d.surveyId);
  result.leftPending = check.leavePending.map((d) => d.surveyId);
  for (const warning of result.warnings) log(`ADVERTENCIA ${warning}`);

  const toWrite = [...check.toProcess, ...check.toDiscard];
  if (toWrite.length === 0) {
    log(
      '0 cambios: no hay envíos pendientes con decisión de procesar o descartar.',
    );
    return result;
  }

  await params.confirmBeforeWrite({
    toProcess: check.toProcess.length,
    toDiscard: check.toDiscard.length,
  });

  // 2. Un envío por transacción, en el orden del archivo; se detiene al primer error.
  const runDir = join(
    params.logDir,
    `apply-${new Date().toISOString().replace(/[:.]/g, '-')}`,
  );
  mkdirSync(runDir, { recursive: true });
  result.runDir = runDir;

  let sequence = 0;
  for (const decision of file.decisions) {
    if (decision.action === 'leave_pending') continue;
    const isTarget = toWrite.some((d) => d.surveyId === decision.surveyId);
    if (!isTarget) continue;
    try {
      let entry: SubmissionLog;
      if (decision.action === 'process') {
        // Se recalcula ahora: un envío anterior de esta corrida pudo cambiar el resultado.
        const preview = await surveys.previewPublicSubmission(
          decision.surveyId,
          { townId: decision.townId },
        );
        const verdict = checkDecisionAgainstPreview(
          decision,
          preview,
          await loadFarmName(ds, decision.surveyId),
        );
        if (verdict.errors.length > 0)
          throw new Error(verdict.errors.join('; '));
        entry = await processOne(params, decision, preview);
        result.processed.push(decision.surveyId);
      } else {
        entry = await discardOne(params, decision);
        result.discarded.push(decision.surveyId);
      }
      sequence += 1;
      const logPath = join(
        runDir,
        `${String(sequence).padStart(3, '0')}-${decision.surveyId}.json`,
      );
      try {
        writeFileSync(logPath, JSON.stringify(entry, null, 2), 'utf-8');
      } catch (writeErr) {
        // El envío ya quedó confirmado en la base: sin el log no se podría revertir.
        log(
          `NO SE PUDO ESCRIBIR EL LOG de ${decision.surveyId}; guárdelo a mano:`,
        );
        log(JSON.stringify(entry));
        throw writeErr;
      }
      log(`OK ${decision.action} ${decision.surveyId}`);
      for (const anomaly of entry.anomalies) log(`  ANOMALÍA: ${anomaly}`);
    } catch (err) {
      result.failed = {
        surveyId: decision.surveyId,
        message: err instanceof Error ? err.message : String(err),
      };
      break;
    }
  }

  writeFileSync(
    join(runDir, 'run.json'),
    JSON.stringify(
      { finishedAt: new Date().toISOString(), ...result },
      null,
      2,
    ),
    'utf-8',
  );
  return result;
}
