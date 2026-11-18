import { DashboardService } from 'src/dashboard/dashboard.service';
import { DashboardBuilderService } from 'src/dashboard/dashboard-builder.service';
import { DashboardCategory } from 'src/dashboard/entities/dashboard-category.entity';
import { DashboardChart } from 'src/dashboard/entities/dashboard-chart.entity';
import {
  getAllowedCharts,
  validateChartKind,
} from 'src/dashboard/dashboard-chart-compat';
import { DataSource } from 'typeorm';

/**
 * Spec 108 (P16) — traduce la curaduría y las fusiones del 66 (C1, C2) y el
 * Resumen general a gráficos publicados de audiencia pública. Idempotente: un
 * gráfico ya existente (misma categoría y título) no se vuelve a crear.
 */
export interface PlannedChart {
  categoryCode: string;
  title: string;
  kind: 'question' | 'metric';
  chartKind: string;
  questionIds?: string[];
  metricKey?: string;
  questionType?: string;
  layout?: 'normal' | 'wide';
  note?: string;
}

export interface SeedReport {
  planned: PlannedChart[];
  created: string[];
  skippedExisting: string[];
  unresolved: { title: string; reason: string }[];
}

const SEED_CODES = ['C1', 'C2'];

/**
 * Spec 109 (P3, criterio 14) — Resumen general: las tarjetas que el 66 armaba
 * buscando preguntas por texto en `OverviewView`. La dona de cultivos, el mapa
 * y la edad siguen como bloques fijos del frontend (decisión del usuario del
 * 2026-11-18), así que no se siembran como métricas.
 */
const OVERVIEW_FROM_CURATION: {
  sourceCode: string;
  title: string;
  chartKind: string;
  layout: 'normal' | 'wide';
  match: (q: { text: string; systemField?: string | null }) => boolean;
}[] = [
  {
    sourceCode: 'C1',
    title: 'Género del productor',
    chartKind: 'bars',
    layout: 'normal',
    match: (q) => q.systemField === 'farmer.gender',
  },
  {
    sourceCode: 'C1',
    title: 'Etapas de la cadena',
    chartKind: 'horizontal-bars',
    layout: 'normal',
    match: (q) => q.text.startsWith('¿En qué etapas de la cadena productiva'),
  },
  {
    sourceCode: 'C3',
    title: 'Meses de cosecha principal',
    chartKind: 'harvest-calendar',
    layout: 'wide',
    match: (q) =>
      q.text.startsWith('¿En qué meses se presenta la cosecha principal'),
  },
];

const HINT_TO_CHART: Record<string, string> = {
  donut: 'donut',
  map: 'map',
  bars: 'bars',
  'horizontal-bars': 'horizontal-bars',
};

/**
 * Decisiones del 66 declaradas sobre un miembro histórico de una fusión (no
 * sobre el representante): D6 pidió mapa para «Departamento» en C2.
 */
const HINT_OVERRIDES: Record<string, string> = {
  'C2|Departamento': 'map',
};

export async function planDashboardCharts(
  dashboard: DashboardService,
): Promise<{ planned: PlannedChart[]; unresolved: SeedReport['unresolved'] }> {
  const planned: PlannedChart[] = [];
  const unresolved: SeedReport['unresolved'] = [];
  for (const code of SEED_CODES) {
    for (const d of await dashboard.listCuratedDestinations(code)) {
      const type = d.question.type?.name;
      const allowed = getAllowedCharts(type);
      if (allowed.length === 0) {
        unresolved.push({
          title: d.question.text,
          reason: `Tipo «${type}» sin gráfico en la matriz.`,
        });
        continue;
      }
      const optionTexts = (d.question.options ?? []).map((o) => o.text);
      const hint = HINT_OVERRIDES[`${code}|${d.question.text}`] ?? d.chartHint;
      const hinted = hint ? (HINT_TO_CHART[hint] ?? hint) : undefined;
      const candidates = [hinted, ...allowed].filter(Boolean) as string[];
      const chartKind = candidates.find(
        (k) =>
          validateChartKind({
            questionType: type,
            chartKind: k,
            combineMode: 'merge',
            optionTexts,
          }).ok,
      );
      if (!chartKind) {
        unresolved.push({
          title: d.question.text,
          reason: 'Ningún gráfico de la matriz aplica a sus opciones.',
        });
        continue;
      }
      planned.push({
        categoryCode: code,
        title: d.question.text,
        kind: 'question',
        chartKind,
        questionIds: d.questionIds,
        questionType: type,
        note:
          d.questionIds.length > 1
            ? `fusión de ${d.questionIds.length}`
            : undefined,
      });
    }
  }
  for (const card of OVERVIEW_FROM_CURATION) {
    const d = (await dashboard.listCuratedDestinations(card.sourceCode)).find(
      (dest) => card.match(dest.question),
    );
    if (!d) {
      unresolved.push({
        title: `[OVERVIEW] ${card.title}`,
        reason: `No se encontró su pregunta en ${card.sourceCode}.`,
      });
      continue;
    }
    const type = d.question.type?.name;
    const check = validateChartKind({
      questionType: type,
      chartKind: card.chartKind,
      combineMode: 'merge',
      optionTexts: (d.question.options ?? []).map((o) => o.text),
    });
    if (!check.ok) {
      unresolved.push({
        title: `[OVERVIEW] ${card.title}`,
        reason: check.reason ?? 'Gráfico no permitido.',
      });
      continue;
    }
    planned.push({
      categoryCode: 'OVERVIEW',
      title: card.title,
      kind: 'question',
      chartKind: card.chartKind,
      questionIds: d.questionIds,
      questionType: type,
      layout: card.layout,
      note:
        d.questionIds.length > 1
          ? `fusión de ${d.questionIds.length}`
          : undefined,
    });
  }
  return { planned, unresolved };
}

export async function applyDashboardCharts(
  ds: DataSource,
  dashboard: DashboardService,
  builder: DashboardBuilderService,
  userId: string,
  dryRun: boolean,
): Promise<SeedReport> {
  const { planned, unresolved } = await planDashboardCharts(dashboard);
  const report: SeedReport = {
    planned,
    created: [],
    skippedExisting: [],
    unresolved: [...unresolved],
  };
  if (dryRun) return report;

  const categories = await ds.getRepository(DashboardCategory).find();
  const byCode = new Map(categories.map((c) => [c.code, c]));
  for (const p of planned) {
    const category = byCode.get(p.categoryCode);
    if (!category) {
      report.unresolved.push({
        title: p.title,
        reason: `Falta la categoría ${p.categoryCode}.`,
      });
      continue;
    }
    const exists = await ds.getRepository(DashboardChart).findOne({
      where: { categoryId: category.categoryId, title: p.title.slice(0, 255) },
    });
    if (exists) {
      report.skippedExisting.push(p.title);
      continue;
    }
    try {
      const body =
        p.kind === 'metric'
          ? {
              categoryId: category.categoryId,
              title: p.title,
              sourceKind: 'entity_metric' as const,
              metricKey: p.metricKey,
              chartKind: p.chartKind,
              audience: 'public' as const,
            }
          : {
              categoryId: category.categoryId,
              title: p.title.slice(0, 255),
              sourceKind: 'questions' as const,
              chartKind: p.chartKind,
              combineMode: 'merge' as const,
              audience: 'public' as const,
              layout: p.layout ?? ('normal' as const),
              series: [
                {
                  seriesKey: 's1',
                  label: p.title.slice(0, 255),
                  questionIds: p.questionIds!,
                },
              ],
            };
      const chart = await builder.createChart(body, userId);
      await builder.publish(chart.chartId, userId);
      report.created.push(p.title);
    } catch (error) {
      report.unresolved.push({
        title: p.title,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return report;
}
