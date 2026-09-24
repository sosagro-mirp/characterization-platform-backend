import { DataSource } from 'typeorm';
import { normalizeDocumentId } from 'src/farmers/document-id';
import { ProcessPreview } from 'src/surveys/public-submission-plan';
import { SurveysService } from 'src/surveys/surveys.service';
import { classifySubmission, findRepeatedSubmissions } from './classify';
import { PlanEntry, PlanReport, DecisionsFile } from './types';

/**
 * Spec 93, Fase 3 — `public-submissions:plan`. SOLO LECTURA: solo llama a
 * `previewPublicSubmission` (que no escribe ni la fila de colisión) y a
 * consultas SELECT. El reporte contiene datos personales: va a un directorio
 * ignorado por git.
 */

/** Instrumento del taller de productores (spec 93). */
export const WORKSHOP_INSTRUMENT_ID = 'f24739ee-9617-46e3-a2e4-9424b6aced82';

export interface PlanRow {
  surveyId: string;
  createdAt: string;
  responseCount: number;
  farmName: string | null;
  vereda: string | null;
  preview: ProcessPreview | null;
  previewError: string | null;
}

export function buildPlanReport(input: {
  generatedAt: string;
  target: string;
  instrumentIds: string[];
  rows: PlanRow[];
}): PlanReport {
  const repeats = findRepeatedSubmissions(
    input.rows.map((row) => ({
      surveyId: row.surveyId,
      documentId: normalizeDocumentId(row.preview?.identity.documentId),
      name: row.preview?.identity.name ?? null,
      responseCount: row.responseCount,
      createdAt: row.createdAt,
    })),
  );

  const entries: PlanEntry[] = input.rows.map((row) => {
    const repeat = repeats.get(row.surveyId) ?? null;
    return {
      surveyId: row.surveyId,
      createdAt: row.createdAt,
      responseCount: row.responseCount,
      farmName: row.farmName,
      vereda: row.vereda,
      preview: row.preview,
      previewError: row.previewError,
      repeat,
      classes: row.preview
        ? classifySubmission({
            preview: row.preview,
            farmName: row.farmName,
            repeat,
          })
        : [],
    };
  });

  const summary: Record<string, number> = { total: entries.length };
  for (const entry of entries) {
    for (const cls of entry.classes) summary[cls] = (summary[cls] ?? 0) + 1;
    if (entry.previewError)
      summary.preview_error = (summary.preview_error ?? 0) + 1;
  }

  return {
    generatedAt: input.generatedAt,
    target: input.target,
    instrumentIds: input.instrumentIds,
    summary,
    entries,
  };
}

/**
 * Plantilla de decisiones: todo en `leave_pending` para que ningún envío se
 * procese sin que alguien lo decida; la nota resume por qué merece atención.
 */
export function buildDecisionsTemplate(report: PlanReport): DecisionsFile {
  return {
    decisions: report.entries.map((entry) => ({
      surveyId: entry.surveyId,
      action: 'leave_pending' as const,
      note: `${entry.preview?.identity.name ?? 'sin nombre'} — ${entry.classes.join(', ') || 'sin vista previa'}`,
    })),
  };
}

function cell(value: string | number | null | undefined): string {
  return String(value ?? '—').replace(/\|/g, '\\|');
}

export function renderPlanMarkdown(report: PlanReport): string {
  const lines: string[] = [
    '# Reporte de envíos pendientes (spec 93)',
    '',
    '> Contiene datos personales: no se sube a git ni se comparte fuera del equipo.',
    '',
    `- Generado: ${report.generatedAt}`,
    `- Destino: ${report.target}`,
    `- Instrumentos: ${report.instrumentIds.join(', ')}`,
    '',
    '## Resumen',
    '',
    '| Clasificación | Envíos |',
    '|---|---|',
    ...Object.entries(report.summary).map(([k, v]) => `| ${k} | ${v} |`),
    '',
    'Un envío puede tener varias clasificaciones; `clean` solo aparece cuando no tiene ninguna otra.',
    '',
    '## Envíos',
  ];

  for (const entry of report.entries) {
    const { preview } = entry;
    lines.push(
      '',
      `### ${preview?.identity.name ?? 'Sin nombre'} — \`${entry.surveyId}\``,
      '',
      `- Recibido: ${entry.createdAt} — ${entry.responseCount} respuestas`,
      `- Clasificación: ${entry.classes.join(', ') || '—'}`,
    );
    if (entry.previewError || !preview) {
      lines.push(
        `- **Sin vista previa:** ${entry.previewError ?? 'desconocido'}`,
      );
      continue;
    }
    lines.push(
      `- Documento: ${cell(preview.identity.documentId)} — teléfono ${cell(preview.identity.phone)}`,
      `- Estado del documento: ${preview.document.status}${preview.document.farmerId ? ` (productor \`${preview.document.farmerId}\`)` : ''}`,
    );
    if (preview.document.candidates.length > 0) {
      lines.push(
        `- Productores con ese documento: ${preview.document.candidates.map((c) => `${c.name} (\`${c.farmerId}\`)`).join('; ')}`,
      );
    }
    lines.push(
      `- Finca: ${preview.farm.action}${preview.farm.farmId ? ` (\`${preview.farm.farmId}\`)` : ''} — nombre «${cell(entry.farmName)}»${entry.farmName ? ` (${entry.farmName.length} caracteres)` : ''}, vereda ${cell(entry.vereda)}`,
    );
    for (const shared of preview.farm.sharedCandidates) {
      lines.push(
        `  - Posible finca compartida: ${shared.source === 'farm' ? `finca \`${shared.farmId}\`` : `envío pendiente \`${shared.surveyId}\``} «${shared.name}», vereda ${cell(shared.vereda)}`,
      );
    }
    lines.push(
      `- Cultivos resueltos: ${preview.crops.resolved.map((c) => c.name).join(', ') || 'ninguno'}`,
      `- Cultivos no mapeados: ${preview.crops.unmapped.join(', ') || 'ninguno'}`,
    );
    if (preview.fieldsToComplete.length > 0) {
      lines.push(
        `- Campos que se completarían: ${preview.fieldsToComplete.map((f) => `${f.entity}.${f.field}`).join(', ')}`,
      );
    }
    if (entry.repeat) {
      lines.push(
        `- Envío repetido de la misma persona (grupo ${entry.repeat.groupKey}): ${entry.repeat.memberSurveyIds.length} envíos; sugerido conservar \`${entry.repeat.suggestedSurveyId}\`${entry.repeat.suggestedSurveyId === entry.surveyId ? ' (este)' : ''}`,
      );
    }
    for (const warning of preview.warnings) {
      lines.push(
        `- Advertencia \`${warning.code}\`: ${warning.message ?? ''}`.trimEnd(),
      );
    }
  }
  return `${lines.join('\n')}\n`;
}

/** Nombre y vereda que declaró cada envío: la vista previa no los expone. */
async function loadFarmTexts(
  ds: DataSource,
  surveyIds: string[],
): Promise<Map<string, { farmName: string | null; vereda: string | null }>> {
  const result = new Map<
    string,
    { farmName: string | null; vereda: string | null }
  >();
  if (surveyIds.length === 0) return result;
  const rows = await ds.query<
    { surveyId: string; systemField: string; textValue: string | null }[]
  >(
    `SELECT r.survey_id AS "surveyId", q.system_field AS "systemField",
            r.text_value AS "textValue"
       FROM responses r
       JOIN questions q ON q.question_id = r.question_id
      WHERE r.survey_id = ANY($1::uuid[])
        AND q.system_field IN ('farm.name', 'farm.vereda')`,
    [surveyIds],
  );
  for (const row of rows) {
    const entry = result.get(row.surveyId) ?? { farmName: null, vereda: null };
    if (row.systemField === 'farm.name') entry.farmName = row.textValue;
    else entry.vereda = row.textValue;
    result.set(row.surveyId, entry);
  }
  return result;
}

export async function generatePlanReport(params: {
  ds: DataSource;
  surveys: SurveysService;
  instrumentIds: string[];
  target: string;
}): Promise<PlanReport> {
  const { ds, surveys, instrumentIds } = params;
  const pending = (
    await Promise.all(
      instrumentIds.map((instrumentId) =>
        surveys.findPublicSubmissions({
          instrumentId,
          reviewStatus: 'pending',
        }),
      ),
    )
  ).flat();
  pending.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

  const texts = await loadFarmTexts(
    ds,
    pending.map((p) => p.surveyId),
  );

  const rows: PlanRow[] = [];
  for (const submission of pending) {
    let preview: ProcessPreview | null = null;
    let previewError: string | null = null;
    try {
      preview = await surveys.previewPublicSubmission(submission.surveyId);
    } catch (err) {
      previewError = err instanceof Error ? err.message : String(err);
    }
    rows.push({
      surveyId: submission.surveyId,
      createdAt: submission.createdAt.toISOString(),
      responseCount: submission.responseCount,
      farmName: texts.get(submission.surveyId)?.farmName ?? null,
      vereda: texts.get(submission.surveyId)?.vereda ?? null,
      preview,
      previewError,
    });
  }

  return buildPlanReport({
    generatedAt: new Date().toISOString(),
    target: params.target,
    instrumentIds,
    rows,
  });
}
