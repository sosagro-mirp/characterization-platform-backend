import { ProcessPreview } from 'src/surveys/public-submission-plan';
import { classifySubmission, findRepeatedSubmissions } from './classify';

function preview(over: Partial<ProcessPreview> = {}): ProcessPreview {
  return {
    surveyId: 's-1',
    identity: { name: 'Ana Pérez', documentId: '123', phone: null },
    document: { status: 'new', farmerId: null, candidates: [] },
    farm: { action: 'create', farmId: null, sharedCandidates: [] },
    crops: { resolved: [], unmapped: [] },
    fieldsToComplete: [],
    warnings: [],
    ...over,
  };
}

describe('classifySubmission', () => {
  it('marca limpio un envío sin nada que decidir', () => {
    expect(
      classifySubmission({
        preview: preview(),
        farmName: 'La Esperanza',
        repeat: null,
      }),
    ).toEqual(['clean']);
  });

  it('acumula todas las clasificaciones que aplican', () => {
    const classes = classifySubmission({
      preview: preview({
        document: { status: 'collision', farmerId: null, candidates: [] },
        farm: {
          action: 'create',
          farmId: null,
          sharedCandidates: [
            {
              source: 'farm',
              farmId: 'f',
              surveyId: null,
              name: 'x',
              vereda: 'v',
            },
          ],
        },
        warnings: [
          { code: 'respondent_not_producer' },
          { code: 'missing_town' },
          { code: 'duplicate_document_in_pending' },
        ],
      }),
      farmName: 'x'.repeat(51),
      repeat: { groupKey: 'g', memberSurveyIds: [], suggestedSurveyId: 's-1' },
    });
    expect(classes).toEqual([
      'collision',
      'shared_farm_candidate',
      'non_producer',
      'missing_town',
      'duplicate_document_in_pending',
      'repeated_submission_same_person',
      'farm_name_too_long',
    ]);
  });

  it('distingue misma persona existente', () => {
    expect(
      classifySubmission({
        preview: preview({
          document: {
            status: 'same_person_match',
            farmerId: 'p',
            candidates: [],
          },
        }),
        farmName: null,
        repeat: null,
      }),
    ).toEqual(['existing_same_person']);
  });
});

describe('findRepeatedSubmissions', () => {
  const item = (
    surveyId: string,
    documentId: string | null,
    name: string | null,
    responseCount: number,
    createdAt: string,
  ) => ({ surveyId, documentId, name, responseCount, createdAt });

  it('agrupa mismo documento y mismo nombre y sugiere el más completo', () => {
    const result = findRepeatedSubmissions([
      item('a', '123', 'Ana Pérez', 10, '2026-09-01T10:00:00Z'),
      item('b', '123', 'ana perez', 30, '2026-09-01T09:00:00Z'),
      item('c', '123', 'Ana Perez', 30, '2026-09-02T09:00:00Z'),
      item('d', '999', 'Luis Gómez', 5, '2026-09-01T09:00:00Z'),
    ]);
    expect([...result.keys()].sort()).toEqual(['a', 'b', 'c']);
    expect(result.get('a')?.suggestedSurveyId).toBe('c');
    expect(result.get('a')?.memberSurveyIds).toEqual(['a', 'b', 'c']);
  });

  it('no agrupa el mismo documento con nombres de personas distintas', () => {
    const result = findRepeatedSubmissions([
      item('a', '123', 'Ana Pérez', 10, '2026-09-01T10:00:00Z'),
      item('b', '123', 'Carlos Ruiz', 10, '2026-09-01T10:00:00Z'),
    ]);
    expect(result.size).toBe(0);
  });

  it('ignora envíos sin documento o sin nombre', () => {
    expect(
      findRepeatedSubmissions([
        item('a', null, 'Ana', 1, '2026-09-01T10:00:00Z'),
        item('b', null, 'Ana', 1, '2026-09-01T10:00:00Z'),
      ]).size,
    ).toBe(0);
  });
});
