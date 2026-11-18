/**
 * e2e-066 — Privacidad del dashboard público: PII y supresión de celda.
 *
 * Escrito junto con `spec/66_curaduria_preguntas_dashboard_publico.md`, antes
 * de la implementación (enfoque test-first). Arranca EN ROJO: el módulo
 * `src/dashboard/dashboard-privacy.config.ts` todavía no existe, ni el campo
 * de supresión de celda en los desgloses.
 *
 * Cubre los criterios de aceptación 2, 3, 4 y 5 del spec. La verificación
 * visual vive en `docs/testing/test-066-curaduria-preguntas-dashboard.md`.
 */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import {
  DENIED_SYSTEM_FIELDS,
  EXCLUDED_QUESTION_TYPES,
  MIN_CELL_SIZE,
  MIN_SAMPLE_THRESHOLD,
  PII_QUESTION_DENYLIST,
  isIdentifyingQuestionText,
} from '../src/dashboard/dashboard-privacy.config';

// ─── helpers ────────────────────────────────────────────────────────────────

interface DashboardCategory {
  id: string;
  code: string;
  name: string;
  questionCount: number;
}

interface DashboardOption {
  text: string;
  count: number | null;
  suppressed?: boolean;
}

interface DashboardQuestion {
  questionId: string;
  questionText: string;
  questionType: string;
  systemField: string | null;
  sectionName: string;
  suppressed: boolean;
  chartHint?: string | null;
  aggregation: { options?: DashboardOption[] } | null;
}

/** Spec 109: cuerpo de `GET /dashboard/charts`. */
interface ServedChartsBody {
  suppressed: boolean;
  charts: {
    chartId: string;
    title: string;
    sourceKind: string;
    chartKind: string;
    questionType: string | null;
    series: {
      suppressed: boolean;
      aggregation: { options?: DashboardOption[] } | null;
    }[];
  }[];
}

/**
 * Patrones de PII directa presentes en los instrumentos S1a/S1b de producción
 * (ver `docs/reports/inventario_preguntas_produccion.md`). Ninguno debe
 * aparecer en el enunciado de una pregunta servida por el endpoint público.
 */
const PII_TEXT_PATTERNS = [
  /nombre completo/i,
  /c[eé]dula/i,
  /n[uú]mero de documento/i,
  /documento de identidad/i,
  /correo electr[oó]nico/i,
  /n[uú]mero de celular/i,
  /nombre de la finca/i,
  /vereda/i,
  /coordenada/i,
  /latitud/i,
  /longitud/i,
];

async function fetchAllCategoryQuestions(
  server: App,
): Promise<DashboardQuestion[]> {
  const categoriesRes = await request(server)
    .get('/api/dashboard/categories')
    .expect(200);
  const categories = categoriesRes.body as DashboardCategory[];

  // Spec 109: el público sirve gráficos configurados; cada serie se trata
  // como una «pregunta servida» (título del gráfico como enunciado).
  const questions: DashboardQuestion[] = [];
  for (const category of categories) {
    const res = await request(server)
      .get('/api/dashboard/charts')
      .query({ categoryId: category.code })
      .expect(200);
    for (const chart of (res.body as ServedChartsBody).charts) {
      for (const series of chart.series) {
        questions.push({
          questionId: chart.chartId,
          questionText: chart.title,
          questionType: chart.questionType ?? '',
          systemField: null,
          sectionName: '',
          suppressed: series.suppressed,
          aggregation: series.aggregation,
        });
      }
    }
  }
  return questions;
}

// ─── suite ──────────────────────────────────────────────────────────────────

describe('e2e-066 — Privacidad del dashboard público', () => {
  let app: INestApplication<App>;
  let server: App;
  // Las 15 categorías se traen UNA sola vez para todo el archivo — el
  // throttler global (60 req/min por IP, backend/CLAUDE.md) no alcanza para
  // que cada `it()` repita las 15 llamadas de `fetchAllCategoryQuestions`.
  let allQuestions: DashboardQuestion[];

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();
    server = app.getHttpServer();
    allQuestions = await fetchAllCategoryQuestions(server);
  }, 30000);

  afterAll(async () => {
    await app.close();
  });

  describe('Política de privacidad centralizada (criterio 2)', () => {
    it('la denylist de tipos cubre todo lo no visualizable', () => {
      expect(EXCLUDED_QUESTION_TYPES).toEqual(
        expect.arrayContaining([
          'open_text',
          'image',
          'voice_recording',
          'document',
          'video',
        ]),
      );
    });

    it('la denylist de systemField cubre los campos identificantes de finca', () => {
      expect(DENIED_SYSTEM_FIELDS).toEqual(
        expect.arrayContaining([
          'farm.latitude',
          'farm.longitude',
          'farm.name',
          'farm.vereda',
          'farm.corregimiento',
          'farmer.name',
          'farmer.documentId',
          'farmer.phone',
          'farmer.email',
          'farmer.producerName',
          'farmer.producerDocumentId',
          'farmer.producerPhone',
          'farmer.producerEmail',
        ]),
      );
    });

    it('existe una denylist explícita de preguntas identificantes por locator', () => {
      expect(Array.isArray(PII_QUESTION_DENYLIST)).toBe(true);
      expect(PII_QUESTION_DENYLIST.length).toBeGreaterThan(0);
      for (const entry of PII_QUESTION_DENYLIST) {
        expect(entry.instrumentCode).toBeTruthy();
        expect(entry.questionText).toBeTruthy();
        expect(entry.reason).toBeTruthy();
      }
    });

    it('el clasificador reconoce enunciados identificantes', () => {
      expect(isIdentifyingQuestionText('Nombre completo del encuestado')).toBe(
        true,
      );
      expect(
        isIdentifyingQuestionText('Número de cédula / documento de identidad'),
      ).toBe(true);
      expect(
        isIdentifyingQuestionText('Correo electrónico del productor'),
      ).toBe(true);
      expect(isIdentifyingQuestionText('Edad del productor(a)')).toBe(false);
      expect(
        isIdentifyingQuestionText('Hectáreas totales del predio (ha)'),
      ).toBe(false);
    });

    it('el umbral de celda es coherente con el umbral de muestra', () => {
      expect(MIN_SAMPLE_THRESHOLD).toBeGreaterThanOrEqual(5);
      expect(MIN_CELL_SIZE).toBeGreaterThanOrEqual(1);
      expect(MIN_CELL_SIZE).toBeLessThanOrEqual(MIN_SAMPLE_THRESHOLD);
    });
  });

  describe('El endpoint público no expone PII (criterio 2)', () => {
    it('ninguna pregunta servida tiene un enunciado identificante', () => {
      const questions = allQuestions;

      const offenders = questions.filter((q) =>
        PII_TEXT_PATTERNS.some((pattern) => pattern.test(q.questionText)),
      );

      expect(offenders.map((q) => q.questionText)).toEqual([]);
    });

    it('ninguna pregunta servida es de un tipo excluido', () => {
      const questions = allQuestions;

      for (const question of questions) {
        expect(EXCLUDED_QUESTION_TYPES).not.toContain(question.questionType);
      }
    });

    it('ninguna pregunta servida usa un systemField de la denylist', () => {
      const questions = allQuestions;

      for (const question of questions) {
        if (question.systemField) {
          expect(DENIED_SYSTEM_FIELDS).not.toContain(question.systemField);
        }
      }
    });

    it('ninguna opción agregada expone el texto libre de "Otros"', () => {
      const questions = allQuestions;

      for (const question of questions) {
        for (const option of question.aggregation?.options ?? []) {
          expect(
            PII_TEXT_PATTERNS.some((pattern) => pattern.test(option.text)),
          ).toBe(false);
        }
      }
    });
  });

  describe('Supresión por muestra insuficiente (criterio 3)', () => {
    it('un filtro sin muestra suficiente suprime la respuesta entera', async () => {
      // Spec 109: con la ruta por categoría retirada, se usa `/charts` de la
      // primera categoría pública con un rango de fechas sin encuestas.
      const categoriesRes = await request(server)
        .get('/api/dashboard/categories')
        .expect(200);
      const [first] = categoriesRes.body as DashboardCategory[];
      expect(first).toBeDefined();
      const res = await request(server)
        .get('/api/dashboard/charts')
        .query({ categoryId: first.code, dateFrom: '2099-01-01' })
        .expect(200);

      const body = res.body as ServedChartsBody;
      expect(body.suppressed).toBe(true);
      for (const chart of body.charts) {
        // Las métricas de entidad no aceptan filtros de respuestas (P13 del
        // 108): los declaran en `ignoredFilters` y no se suprimen por ellos.
        if (chart.sourceKind === 'entity_metric') continue;
        for (const series of chart.series) {
          expect(series.suppressed).toBe(true);
          expect(series.aggregation).toBeNull();
        }
      }
    });

    it('una celda por debajo del umbral se marca suprimida, nunca como cero', () => {
      const questions = allQuestions;

      for (const question of questions) {
        for (const option of question.aggregation?.options ?? []) {
          if (option.suppressed) {
            // Una celda suprimida no revela su conteo real…
            expect(option.count).toBeNull();
          } else {
            // …y una celda visible nunca queda por debajo del umbral.
            expect(option.count).toBeGreaterThanOrEqual(MIN_CELL_SIZE);
          }
        }
      }
    });
  });

  describe('Curaduría: preguntas ocultas y gráfica declarada (criterios 4 y 5)', () => {
    it('ninguna pregunta de la denylist de curaduría llega al endpoint', () => {
      const questions = allQuestions;
      const servedTexts = new Set(questions.map((q) => q.questionText));

      for (const entry of PII_QUESTION_DENYLIST) {
        expect(servedTexts.has(entry.questionText)).toBe(false);
      }
    });

    // Spec 109: la gráfica la declara el gráfico configurado (`chartKind`),
    // no una curaduría por pregunta (`chartHint`).
    it('cada gráfico servido declara su chartKind', async () => {
      const categoriesRes = await request(server)
        .get('/api/dashboard/categories')
        .expect(200);
      for (const category of categoriesRes.body as DashboardCategory[]) {
        const res = await request(server)
          .get('/api/dashboard/charts')
          .query({ categoryId: category.code })
          .expect(200);
        for (const chart of (res.body as ServedChartsBody).charts) {
          expect(typeof chart.chartKind).toBe('string');
          expect(chart.chartKind.length).toBeGreaterThan(0);
        }
      }
    });
  });
});
