import { isSameFarmerName } from 'src/farmers/name-matching';
import { ProcessPreview } from 'src/surveys/public-submission-plan';
import { FARM_NAME_MAX_LENGTH } from './decisions';
import { RepeatInfo, SubmissionClass } from './types';

/**
 * Spec 93, Fase 3 — clasificación de cada envío pendiente para el reporte.
 * Pura: recibe la vista previa ya calculada por la API (`previewPublicSubmission`).
 */

export function classifySubmission(params: {
  preview: ProcessPreview;
  farmName: string | null;
  repeat: RepeatInfo | null;
}): SubmissionClass[] {
  const { preview, farmName, repeat } = params;
  const classes: SubmissionClass[] = [];
  const has = (code: string) => preview.warnings.some((w) => w.code === code);

  if (preview.document.status === 'same_person_match') {
    classes.push('existing_same_person');
  }
  if (preview.document.status === 'collision') classes.push('collision');
  if (preview.farm.sharedCandidates.length > 0) {
    classes.push('shared_farm_candidate');
  }
  if (has('respondent_not_producer')) classes.push('non_producer');
  if (has('missing_town')) classes.push('missing_town');
  if (has('duplicate_document_in_pending')) {
    classes.push('duplicate_document_in_pending');
  }
  if (repeat) classes.push('repeated_submission_same_person');
  if (farmName && farmName.length > FARM_NAME_MAX_LENGTH) {
    classes.push('farm_name_too_long');
  }

  return classes.length === 0 ? ['clean'] : classes;
}

export interface RepeatCandidate {
  surveyId: string;
  /** Documento ya normalizado. */
  documentId: string | null;
  name: string | null;
  responseCount: number;
  createdAt: string;
}

/**
 * Envíos pendientes con el mismo documento Y el mismo nombre (mismo criterio
 * que el spec 68): la misma persona que envió varias veces. Un mismo documento
 * con nombres distintos no entra aquí: es una colisión y la marca
 * `duplicate_document_in_pending`. Sugiere el más completo o, a igualdad, el
 * más reciente (D-H2-11).
 */
export function findRepeatedSubmissions(
  items: RepeatCandidate[],
): Map<string, RepeatInfo> {
  const byDocument = new Map<string, RepeatCandidate[]>();
  for (const item of items) {
    if (!item.documentId || !item.name) continue;
    byDocument.set(item.documentId, [
      ...(byDocument.get(item.documentId) ?? []),
      item,
    ]);
  }

  const result = new Map<string, RepeatInfo>();
  for (const [documentId, group] of byDocument) {
    const clusters: RepeatCandidate[][] = [];
    for (const item of group) {
      const cluster = clusters.find((c) =>
        isSameFarmerName(c[0].name, item.name),
      );
      if (cluster) cluster.push(item);
      else clusters.push([item]);
    }
    clusters.forEach((cluster, index) => {
      if (cluster.length < 2) return;
      const suggested = [...cluster].sort(
        (a, b) =>
          b.responseCount - a.responseCount ||
          b.createdAt.localeCompare(a.createdAt) ||
          a.surveyId.localeCompare(b.surveyId),
      )[0];
      const info: RepeatInfo = {
        groupKey: `${documentId}#${index + 1}`,
        memberSurveyIds: cluster.map((c) => c.surveyId),
        suggestedSurveyId: suggested.surveyId,
      };
      for (const member of cluster) result.set(member.surveyId, info);
    });
  }
  return result;
}
