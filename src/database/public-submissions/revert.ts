import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import { DataSource, EntityManager } from 'typeorm';
import { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';
import { Farm } from 'src/farms/entities/farm.entity';
import { Farmer } from 'src/farmers/entities/farmer.entity';
import {
  FARM_COMPLETABLE_FIELDS,
  FARMER_COMPLETABLE_FIELDS,
} from 'src/surveys/public-submission-plan';
import { parseSubmissionLog, planFieldReverts } from './log';
import { SubmissionLog } from './types';

/**
 * Spec 93, Fase 3 — `public-submissions:revert`. Deshace envío por envío, a
 * partir del log que escribió `apply`, y solo con autorización del usuario.
 * Nunca borra un productor o una finca que otra cosa referencie, ni pisa un
 * valor que alguien editó después de `apply`.
 */

/** Logs de una corrida en orden inverso: lo último aplicado se deshace primero. */
export function orderLogFiles(names: string[]): string[] {
  return names
    .filter((n) => /^\d{3,}-.+\.json$/.test(n))
    .sort()
    .reverse();
}

/** El envío solo se revierte si sigue como lo dejó `apply`. */
export function canRevert(
  state: { reviewStatus: string | null; farmerId: string | null },
  log: SubmissionLog,
): { ok: true } | { ok: false; reason: string } {
  const expected = log.action === 'process' ? 'processed' : 'discarded';
  if (state.reviewStatus === 'pending') {
    return { ok: false, reason: 'ya está pendiente (revertido antes)' };
  }
  if (state.reviewStatus !== expected) {
    return {
      ok: false,
      reason: `su estado es "${state.reviewStatus}" y el log esperaba "${expected}"`,
    };
  }
  if (log.action === 'process' && state.farmerId !== log.farmer?.farmerId) {
    return {
      ok: false,
      reason: 'ahora está vinculado a otro productor que el del log',
    };
  }
  return { ok: true };
}

export interface RevertOutcome {
  surveyId: string;
  status: 'reverted' | 'skipped';
  actions: string[];
  notes: string[];
}

export interface RevertParams {
  ds: DataSource;
  /** Un log de envío, o el directorio de una corrida de `apply`. */
  logPath: string;
  /** Con un directorio, revertir solo este envío. */
  onlySurveyId?: string;
  confirmBeforeWrite: (count: number) => Promise<void>;
  log: (message: string) => void;
}

export function readLogs(
  logPath: string,
  onlySurveyId?: string,
): SubmissionLog[] {
  const read = (path: string): SubmissionLog =>
    parseSubmissionLog(JSON.parse(readFileSync(path, 'utf-8')) as unknown);
  const logs = statSync(logPath).isDirectory()
    ? orderLogFiles(readdirSync(logPath)).map((name) =>
        read(join(logPath, name)),
      )
    : [read(logPath)];
  return onlySurveyId ? logs.filter((l) => l.surveyId === onlySurveyId) : logs;
}

function pickCurrent(
  entity: object | null,
  fields: readonly string[],
): Record<string, unknown> {
  const record = (entity ?? {}) as Record<string, unknown>;
  return Object.fromEntries(fields.map((f) => [f, record[f] ?? null]));
}

async function count(
  manager: EntityManager,
  sql: string,
  params: unknown[],
): Promise<number> {
  const [row] = await manager.query<{ n: string }[]>(sql, params);
  return Number(row?.n ?? 0);
}

async function revertOne(
  manager: EntityManager,
  entry: SubmissionLog,
): Promise<RevertOutcome> {
  const outcome: RevertOutcome = {
    surveyId: entry.surveyId,
    status: 'reverted',
    actions: [],
    notes: [],
  };
  // Mismo lock que el procesado, para no cruzarse con una operación desde la UI.
  await manager.query("SET LOCAL lock_timeout = '10s'");
  await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
    `extract-farmer:${entry.surveyId}`,
  ]);

  const [state] = await manager.query<
    { review_status: string | null; farmer_id: string | null }[]
  >('SELECT review_status, farmer_id FROM surveys WHERE survey_id = $1', [
    entry.surveyId,
  ]);
  if (!state) {
    return { ...outcome, status: 'skipped', notes: ['el envío ya no existe'] };
  }
  const verdict = canRevert(
    { reviewStatus: state.review_status, farmerId: state.farmer_id },
    entry,
  );
  if (!verdict.ok) {
    return { ...outcome, status: 'skipped', notes: [verdict.reason] };
  }

  if (entry.action === 'process' && entry.farmer) {
    const farmerId = entry.farmer.farmerId;

    if (entry.consentRecordsRelinked.length > 0) {
      await manager.query(
        `UPDATE consent_records SET farmer_id = NULL
          WHERE survey_id = $1 AND consent_record_id = ANY($2::uuid[]) AND farmer_id = $3`,
        [entry.surveyId, entry.consentRecordsRelinked, farmerId],
      );
      outcome.actions.push(
        `${entry.consentRecordsRelinked.length} constancia(s) desanclada(s)`,
      );
    }

    if (entry.farm && entry.cropsAdded.length > 0) {
      await manager.query(
        'DELETE FROM farms_crops WHERE farm_id = $1 AND crop_id = ANY($2::uuid[])',
        [entry.farm.farmId, entry.cropsAdded.map((c) => c.cropId)],
      );
      outcome.actions.push(`${entry.cropsAdded.length} cultivo(s) quitado(s)`);
    }

    if (entry.fieldsCompleted.length > 0 && !entry.farmer.created) {
      const farmer = await manager.findOne(Farmer, { where: { id: farmerId } });
      const farm = entry.farm
        ? await manager.findOne(Farm, {
            where: { farmId: entry.farm.farmId },
            relations: ['town'],
          })
        : null;
      const current = {
        farmer: pickCurrent(farmer, FARMER_COMPLETABLE_FIELDS),
        farm: {
          ...pickCurrent(farm, FARM_COMPLETABLE_FIELDS),
          townId: farm?.town?.townId ?? null,
        },
      };
      const { revert, skipped } = planFieldReverts(
        entry.fieldsCompleted,
        current,
      );
      for (const change of revert) {
        if (change.entity === 'farmer') {
          await manager.update(Farmer, farmerId, {
            [change.field]: null,
          } as QueryDeepPartialEntity<Farmer>);
        } else if (entry.farm) {
          await manager.update(
            Farm,
            entry.farm.farmId,
            (change.field === 'townId'
              ? { town: null }
              : { [change.field]: null }) as QueryDeepPartialEntity<Farm>,
          );
        }
      }
      if (revert.length > 0) {
        outcome.actions.push(`${revert.length} campo(s) devuelto(s) a NULL`);
      }
      for (const { change, currentValue } of skipped) {
        outcome.notes.push(
          `${change.entity}.${change.field} se dejó: ahora vale ${String(currentValue)}, no lo que escribió apply`,
        );
      }
    }

    if (entry.collision) {
      const { before, after } = entry.collision;
      if (before === null) {
        await manager.query(
          'DELETE FROM farmer_document_collisions WHERE collision_id = $1',
          [after.collisionId],
        );
        outcome.actions.push('fila de colisión creada por el envío, borrada');
      } else {
        await manager.query(
          `UPDATE farmer_document_collisions
              SET survey_id = $2, resolution = $3, resolved_at = $4
            WHERE collision_id = $1`,
          [
            before.collisionId,
            before.surveyId,
            before.resolution,
            before.resolvedAt,
          ],
        );
        outcome.actions.push('fila de colisión devuelta a su estado previo');
      }
    }
  }

  const prev = entry.previousState;
  await manager.query(
    `UPDATE surveys
        SET review_status = 'pending', farmer_id = NULL, reviewed_by = NULL,
            reviewed_at = NULL, respondent_name = $2, respondent_phone = $3,
            respondent_document_id = $4, respondent_email = $5
      WHERE survey_id = $1`,
    [
      entry.surveyId,
      prev.respondent.name,
      prev.respondent.phone,
      prev.respondent.documentId,
      prev.respondent.email,
    ],
  );
  outcome.actions.push('envío devuelto a pendiente');

  if (entry.action === 'process' && entry.farmer) {
    const farmerId = entry.farmer.farmerId;

    if (entry.farm?.assignedToFarmer && !entry.farmer.created) {
      await manager.query(
        'UPDATE farmers SET farm_id = NULL WHERE id = $1 AND farm_id = $2',
        [farmerId, entry.farm.farmId],
      );
      outcome.actions.push('finca desvinculada del productor existente');
    }

    let farmerDeleted = !entry.farmer.created;
    if (entry.farmer.created) {
      const references =
        (await count(
          manager,
          'SELECT count(*) AS n FROM surveys WHERE farmer_id = $1',
          [farmerId],
        )) +
        (await count(
          manager,
          'SELECT count(*) AS n FROM consent_records WHERE farmer_id = $1',
          [farmerId],
        )) +
        (await count(
          manager,
          'SELECT count(*) AS n FROM farmer_document_collisions WHERE existing_farmer_id = $1',
          [farmerId],
        ));
      if (references > 0) {
        outcome.notes.push(
          `productor ${farmerId} conservado: ${references} registro(s) más lo referencian`,
        );
      } else {
        try {
          // Punto de guardado: si otra tabla lo referencia, el error no aborta el resto.
          await manager.transaction((m) => m.delete(Farmer, farmerId));
          farmerDeleted = true;
          outcome.actions.push(
            `productor ${farmerId} creado por el envío, borrado`,
          );
        } catch (err) {
          outcome.notes.push(
            `productor ${farmerId} conservado: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
    }

    if (entry.farm?.mode === 'created') {
      const farmId = entry.farm.farmId;
      const users = await count(
        manager,
        'SELECT count(*) AS n FROM farmers WHERE farm_id = $1',
        [farmId],
      );
      if (users > 0) {
        outcome.notes.push(
          `finca ${farmId} conservada: ${users} productor(es) la usan${farmerDeleted ? '' : ' (incluido el conservado de este envío)'}`,
        );
      } else {
        try {
          await manager.transaction((m) => m.delete(Farm, farmId));
          outcome.actions.push(`finca ${farmId} creada por el envío, borrada`);
        } catch (err) {
          outcome.notes.push(
            `finca ${farmId} conservada: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
    }
  }

  return outcome;
}

export async function runRevert(
  params: RevertParams,
): Promise<RevertOutcome[]> {
  const logs = readLogs(params.logPath, params.onlySurveyId);
  if (logs.length === 0)
    throw new Error('No hay logs para revertir en esa ruta.');

  await params.confirmBeforeWrite(logs.length);

  const outcomes: RevertOutcome[] = [];
  for (const entry of logs) {
    // Una transacción por envío; si falla, se detiene y lo anterior queda revertido.
    const outcome = await params.ds.transaction((manager) =>
      revertOne(manager, entry),
    );
    outcomes.push(outcome);
    params.log(
      `${outcome.status === 'reverted' ? 'REVERTIDO' : 'OMITIDO'} ${entry.surveyId}`,
    );
    for (const action of outcome.actions) params.log(`  - ${action}`);
    for (const note of outcome.notes) params.log(`  ! ${note}`);
  }
  return outcomes;
}
