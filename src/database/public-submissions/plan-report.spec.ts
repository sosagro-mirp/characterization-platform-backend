import { ProcessPreview } from 'src/surveys/public-submission-plan';
import {
  buildDecisionsTemplate,
  buildPlanReport,
  PlanRow,
  renderPlanMarkdown,
} from './plan-report';
import { validateDecisionsFile } from './decisions';

function preview(
  surveyId: string,
  name: string,
  documentId: string,
  over: Partial<ProcessPreview> = {},
): ProcessPreview {
  return {
    surveyId,
    identity: { name, documentId, phone: null },
    document: { status: 'new', farmerId: null, candidates: [] },
    farm: { action: 'create', farmId: null, sharedCandidates: [] },
    crops: { resolved: [{ cropId: 'c', name: 'Café' }], unmapped: ['Caucho'] },
    fieldsToComplete: [],
    warnings: [],
    ...over,
  };
}

const S1 = '11111111-1111-4111-8111-111111111111';
const S2 = '22222222-2222-4222-8222-222222222222';
const S3 = '33333333-3333-4333-8333-333333333333';

function rows(): PlanRow[] {
  return [
    {
      surveyId: S1,
      createdAt: '2026-09-01T10:00:00.000Z',
      responseCount: 10,
      farmName: 'La Esperanza',
      vereda: 'El Roble',
      preview: preview(S1, 'Ana Pérez', '123'),
      previewError: null,
    },
    {
      surveyId: S2,
      createdAt: '2026-09-02T10:00:00.000Z',
      responseCount: 20,
      farmName: 'La Esperanza',
      vereda: 'El Roble',
      preview: preview(S2, 'Ana Perez', '123'),
      previewError: null,
    },
    {
      surveyId: S3,
      createdAt: '2026-09-03T10:00:00.000Z',
      responseCount: 5,
      farmName: null,
      vereda: null,
      preview: null,
      previewError: 'boom',
    },
  ];
}

describe('buildPlanReport', () => {
  const report = buildPlanReport({
    generatedAt: '2026-09-24T00:00:00.000Z',
    target: 'host/db',
    instrumentIds: ['i-1'],
    rows: rows(),
  });

  it('clasifica y resume, incluidos los envíos repetidos y los errores de vista previa', () => {
    expect(report.summary).toMatchObject({
      total: 3,
      repeated_submission_same_person: 2,
      preview_error: 1,
    });
    expect(report.entries[0].repeat?.suggestedSurveyId).toBe(S2);
    expect(report.entries[2].classes).toEqual([]);
  });

  it('el Markdown lista cada envío, sus cultivos y el error', () => {
    const md = renderPlanMarkdown(report);
    expect(md).toContain('Ana Pérez');
    expect(md).toContain('Cultivos no mapeados: Caucho');
    expect(md).toContain('sugerido conservar');
    expect(md).toContain('Sin vista previa');
    expect(md).toContain('datos personales');
  });

  it('la plantilla de decisiones deja todo pendiente y pasa la validación', () => {
    const template = buildDecisionsTemplate(report);
    expect(template.decisions.every((d) => d.action === 'leave_pending')).toBe(
      true,
    );
    expect(validateDecisionsFile(template).errors).toEqual([]);
  });
});
