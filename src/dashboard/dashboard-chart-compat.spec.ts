/**
 * Spec 108 — Constructor de dashboard: matriz de compatibilidad (P10) y
 * compatibilidad de fusiones (P12). Criterios de aceptación 6, 7 y 8.
 *
 * Escrito ANTES de la implementación (test-first). Arranca en rojo: el módulo
 * puro `dashboard-chart-compat.ts` todavía no existe.
 *
 * Contrato que fija este archivo para el módulo (la implementación debe
 * exponer estos nombres; si la Fase 3 los cambia, se ajusta este test con
 * aprobación):
 *
 *   getAllowedCharts(questionType): ChartKind[]
 *     Lista estática de la matriz; el primero es el default. Vacía para los
 *     tipos no seleccionables (open_text, image, voice_recording, document,
 *     video).
 *   isSelectableQuestionType(questionType): boolean
 *   validateChartKind({ questionType, chartKind, combineMode, optionTexts })
 *     → { ok: boolean; reason?: string }
 *     Aplica la matriz y las condiciones «solo si» contra las opciones reales.
 *   checkMergeCompatibility(sources, { optionsMismatchAck? })
 *     → { ok: boolean; requiresAck: boolean; reason?: string;
 *         optionDiff?: { questionId: string; missing: string[]; extra: string[] }[] }
 *
 * Nombres de gráfico: los de `frontend/lib/dashboard/chartHint.ts`
 * (`donut`, `bars`, `horizontal-bars`, `diverging`, `histogram`,
 * `histogram-by-unit`, `harvest-calendar`, `map`) más dos nuevos del
 * constructor: `yes-percent-bars` («% Sí») e `histogram-normalized`.
 */
import {
  checkMergeCompatibility,
  getAllowedCharts,
  isSelectableQuestionType,
  validateChartKind,
} from './dashboard-chart-compat';

const MONTHS = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
];

const DEPARTMENTS = ['Antioquia', 'Cauca', 'Huila', 'Nariño', 'Tolima'];

describe('Spec 108 — dashboard-chart-compat', () => {
  describe('P10 — matriz tipo → gráfico (criterio 6)', () => {
    it.each([
      ['yes_no', ['donut', 'yes-percent-bars']],
      ['single_choice', ['bars', 'horizontal-bars', 'donut', 'map']],
      ['multiple_choice', ['horizontal-bars', 'harvest-calendar']],
      ['compliance', ['bars']],
      ['likert', ['diverging']],
      ['numeric', ['histogram']],
      ['numeric_with_unit', ['histogram-by-unit', 'histogram-normalized']],
    ])('%s permite exactamente %j, en ese orden', (type, charts) => {
      expect(getAllowedCharts(type)).toEqual(charts);
    });

    it.each(['open_text', 'image', 'voice_recording', 'document', 'video'])(
      '%s no es seleccionable y no tiene gráficos',
      (type) => {
        expect(isSelectableQuestionType(type)).toBe(false);
        expect(getAllowedCharts(type)).toEqual([]);
      },
    );

    it('los tipos con gráfico son seleccionables', () => {
      for (const type of [
        'yes_no',
        'single_choice',
        'multiple_choice',
        'compliance',
        'likert',
        'numeric',
        'numeric_with_unit',
      ]) {
        expect(isSelectableQuestionType(type)).toBe(true);
      }
    });

    it('criterio 6: dona para multiple_choice se rechaza', () => {
      const res = validateChartKind({
        questionType: 'multiple_choice',
        chartKind: 'donut',
        combineMode: 'merge',
        optionTexts: ['A', 'B', 'C'],
      });
      expect(res.ok).toBe(false);
      expect(res.reason).toEqual(expect.any(String));
    });

    it('un gráfico de otro tipo se rechaza (histograma para yes_no)', () => {
      expect(
        validateChartKind({
          questionType: 'yes_no',
          chartKind: 'histogram',
          combineMode: 'merge',
          optionTexts: [],
        }).ok,
      ).toBe(false);
    });

    it('un tipo no seleccionable no admite ningún gráfico', () => {
      expect(
        validateChartKind({
          questionType: 'open_text',
          chartKind: 'bars',
          combineMode: 'merge',
          optionTexts: [],
        }).ok,
      ).toBe(false);
    });

    it('el default de cada tipo se acepta', () => {
      expect(
        validateChartKind({
          questionType: 'single_choice',
          chartKind: 'bars',
          combineMode: 'merge',
          optionTexts: ['Café', 'Cacao'],
        }).ok,
      ).toBe(true);
    });
  });

  describe('P10 — condiciones «solo si» contra las opciones reales (criterio 6)', () => {
    it('mapa con opciones que no son departamentos se rechaza', () => {
      const res = validateChartKind({
        questionType: 'single_choice',
        chartKind: 'map',
        combineMode: 'merge',
        optionTexts: ['Café', 'Cacao'],
      });
      expect(res.ok).toBe(false);
      expect(res.reason).toEqual(expect.any(String));
    });

    it('mapa con opciones que son departamentos se acepta', () => {
      expect(
        validateChartKind({
          questionType: 'single_choice',
          chartKind: 'map',
          combineMode: 'merge',
          optionTexts: DEPARTMENTS,
        }).ok,
      ).toBe(true);
    });

    it('dona de single_choice con 6 opciones se acepta y con 7 se rechaza', () => {
      const six = ['a', 'b', 'c', 'd', 'e', 'f'];
      expect(
        validateChartKind({
          questionType: 'single_choice',
          chartKind: 'donut',
          combineMode: 'merge',
          optionTexts: six,
        }).ok,
      ).toBe(true);
      expect(
        validateChartKind({
          questionType: 'single_choice',
          chartKind: 'donut',
          combineMode: 'merge',
          optionTexts: [...six, 'g'],
        }).ok,
      ).toBe(false);
    });

    it('calendario de cosecha solo si las opciones son los 12 meses', () => {
      expect(
        validateChartKind({
          questionType: 'multiple_choice',
          chartKind: 'harvest-calendar',
          combineMode: 'merge',
          optionTexts: MONTHS,
        }).ok,
      ).toBe(true);
      expect(
        validateChartKind({
          questionType: 'multiple_choice',
          chartKind: 'harvest-calendar',
          combineMode: 'merge',
          optionTexts: MONTHS.slice(0, 6),
        }).ok,
      ).toBe(false);
    });

    it('spec 109: el calendario ignora opciones de escape como «No aplica»', () => {
      expect(
        validateChartKind({
          questionType: 'multiple_choice',
          chartKind: 'harvest-calendar',
          combineMode: 'merge',
          optionTexts: [...MONTHS, 'No aplica'],
        }).ok,
      ).toBe(true);
      expect(
        validateChartKind({
          questionType: 'multiple_choice',
          chartKind: 'harvest-calendar',
          combineMode: 'merge',
          optionTexts: [...MONTHS.slice(0, 11), 'No aplica'],
        }).ok,
      ).toBe(false);
    });
  });

  describe('P9/P10 — modo de combinación', () => {
    it('yes_no en comparación solo admite barras «% Sí»', () => {
      expect(
        validateChartKind({
          questionType: 'yes_no',
          chartKind: 'yes-percent-bars',
          combineMode: 'compare',
          optionTexts: [],
        }).ok,
      ).toBe(true);
      expect(
        validateChartKind({
          questionType: 'yes_no',
          chartKind: 'donut',
          combineMode: 'compare',
          optionTexts: [],
        }).ok,
      ).toBe(false);
    });

    it('likert en comparación admite la divergente (matriz)', () => {
      expect(
        validateChartKind({
          questionType: 'likert',
          chartKind: 'diverging',
          combineMode: 'compare',
          optionTexts: ['1', '2', '3', '4', '5'],
        }).ok,
      ).toBe(true);
    });

    it.each(['single_choice', 'multiple_choice', 'compliance', 'numeric'])(
      '%s no admite comparación',
      (type) => {
        expect(
          validateChartKind({
            questionType: type,
            chartKind: getAllowedCharts(type)[0],
            combineMode: 'compare',
            optionTexts: ['A', 'B'],
          }).ok,
        ).toBe(false);
      },
    );
  });

  describe('P12 — compatibilidad de fusiones (criterios 7 y 8)', () => {
    it('criterio 7: fusionar tipos distintos se rechaza', () => {
      const res = checkMergeCompatibility([
        {
          questionId: 'q1',
          questionType: 'single_choice',
          optionTexts: ['Sí'],
        },
        { questionId: 'q2', questionType: 'yes_no', optionTexts: [] },
      ]);
      expect(res.ok).toBe(false);
      expect(res.reason).toEqual(expect.any(String));
    });

    it('criterio 7: Likert con distinto número de niveles se rechaza, incluso con confirmación', () => {
      const res = checkMergeCompatibility(
        [
          {
            questionId: 'q1',
            questionType: 'likert',
            optionTexts: ['1', '2', '3', '4', '5'],
          },
          {
            questionId: 'q2',
            questionType: 'likert',
            optionTexts: ['1', '2', '3'],
          },
        ],
        { optionsMismatchAck: true },
      );
      expect(res.ok).toBe(false);
    });

    it('Likert con el mismo número de niveles se fusiona', () => {
      const res = checkMergeCompatibility([
        {
          questionId: 'q1',
          questionType: 'likert',
          optionTexts: ['1', '2', '3'],
        },
        {
          questionId: 'q2',
          questionType: 'likert',
          optionTexts: ['1', '2', '3'],
        },
      ]);
      expect(res.ok).toBe(true);
    });

    it('selecciones con las mismas opciones (texto exacto) se fusionan sin confirmación', () => {
      const res = checkMergeCompatibility([
        {
          questionId: 'q1',
          questionType: 'single_choice',
          optionTexts: ['Café', 'Cacao'],
        },
        {
          questionId: 'q2',
          questionType: 'single_choice',
          optionTexts: ['Cacao', 'Café'],
        },
      ]);
      expect(res.ok).toBe(true);
      expect(res.requiresAck).toBe(false);
    });

    it('criterio 8: opciones distintas sin confirmación se rechazan y devuelven la diferencia', () => {
      const res = checkMergeCompatibility([
        {
          questionId: 'q1',
          questionType: 'single_choice',
          optionTexts: ['Café', 'Cacao'],
        },
        {
          questionId: 'q2',
          questionType: 'single_choice',
          optionTexts: ['Café', 'Cacao', 'Cannabis'],
        },
      ]);
      expect(res.ok).toBe(false);
      expect(res.requiresAck).toBe(true);
      expect(JSON.stringify(res.optionDiff)).toContain('Cannabis');
    });

    it('criterio 8: opciones distintas con confirmación se aceptan', () => {
      const res = checkMergeCompatibility(
        [
          {
            questionId: 'q1',
            questionType: 'multiple_choice',
            optionTexts: ['Café', 'Cacao'],
          },
          {
            questionId: 'q2',
            questionType: 'multiple_choice',
            optionTexts: ['Café', 'cacao'],
          },
        ],
        { optionsMismatchAck: true },
      );
      expect(res.ok).toBe(true);
      expect(res.requiresAck).toBe(true);
    });

    it('el texto se compara exacto: mayúsculas distintas cuentan como diferencia', () => {
      const res = checkMergeCompatibility([
        {
          questionId: 'q1',
          questionType: 'compliance',
          optionTexts: ['Cumple'],
        },
        {
          questionId: 'q2',
          questionType: 'compliance',
          optionTexts: ['cumple'],
        },
      ]);
      expect(res.ok).toBe(false);
      expect(res.requiresAck).toBe(true);
    });

    it('numéricos del mismo tipo se fusionan', () => {
      const res = checkMergeCompatibility([
        { questionId: 'q1', questionType: 'numeric', optionTexts: [] },
        { questionId: 'q2', questionType: 'numeric', optionTexts: [] },
      ]);
      expect(res.ok).toBe(true);
    });

    it('numeric y numeric_with_unit no se fusionan (tipos distintos)', () => {
      const res = checkMergeCompatibility([
        { questionId: 'q1', questionType: 'numeric', optionTexts: [] },
        {
          questionId: 'q2',
          questionType: 'numeric_with_unit',
          optionTexts: ['ha'],
        },
      ]);
      expect(res.ok).toBe(false);
    });

    it('un tipo no seleccionable no se fusiona', () => {
      const res = checkMergeCompatibility([
        { questionId: 'q1', questionType: 'open_text', optionTexts: [] },
        { questionId: 'q2', questionType: 'open_text', optionTexts: [] },
      ]);
      expect(res.ok).toBe(false);
    });
  });
});
