import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Question } from 'src/questions/entities/question.entity';
import {
  checkMergeCompatibility,
  getAllowedCharts,
  isSelectableQuestionType,
  validateChartKind,
} from './dashboard-chart-compat';
import { DashboardAggregationService } from './dashboard-aggregation.service';
import { DashboardService, ServingFilterContext } from './dashboard.service';
import { DashboardChart } from './entities/dashboard-chart.entity';
import { DashboardChartSource } from './entities/dashboard-chart-source.entity';
import { findEntityMetric } from './dashboard-entity-metrics.config';
import {
  privateOnlyMetricReason,
  privateOnlyReason,
} from './dashboard-privacy.config';

export const SOURCE_BLOCKED = 'DASHBOARD_SOURCE_BLOCKED';
/** Spec 109 (Fase 6): fuente sensible en un gráfico de audiencia pública. */
export const SOURCE_PRIVATE_ONLY = 'DASHBOARD_SOURCE_PRIVATE_ONLY';
export const CHART_INCOMPATIBLE = 'DASHBOARD_CHART_INCOMPATIBLE';

export interface SeriesConfig {
  seriesKey: string;
  label: string;
  questionIds: string[];
}

/** Configuración completa de un gráfico, guardado o no. */
export interface ChartConfig {
  sourceKind: 'questions' | 'entity_metric';
  chartKind: string;
  combineMode: 'merge' | 'compare';
  settings: Record<string, unknown>;
  metricKey: string | null;
  series: SeriesConfig[];
}

export type Health = 'ok' | 'needs_review';

/** Configuración de un gráfico guardado a partir de su fila y sus fuentes. */
export function chartConfigFrom(
  chart: DashboardChart,
  sources: DashboardChartSource[],
): ChartConfig {
  const bySeries = new Map<string, SeriesConfig>();
  for (const s of sources) {
    const entry = bySeries.get(s.seriesKey) ?? {
      seriesKey: s.seriesKey,
      label: s.seriesLabel,
      questionIds: [],
    };
    entry.questionIds.push(s.questionId);
    bySeries.set(s.seriesKey, entry);
  }
  return {
    sourceKind: chart.sourceKind,
    chartKind: chart.chartKind,
    combineMode: chart.combineMode,
    settings: chart.settings ?? {},
    metricKey: chart.entityMetricKey,
    series: [...bySeries.values()],
  };
}

export interface ExcludedSource {
  questionId: string;
  reason: string;
}

export interface PreviewResult {
  health: Health;
  metricKey?: string;
  ignoredFilters?: string[];
  series: {
    seriesKey: string;
    label: string;
    answeredCount: number;
    suppressed: boolean;
    aggregation: unknown;
    /** Spec 109 — false si la serie se quedó sin fuentes válidas. */
    hasValidSources?: boolean;
    /** Spec 109 — instrumentos de las fuentes válidas (procedencia). */
    instrumentNames?: string[];
  }[];
  excludedSources: ExcludedSource[];
  normalization?: { targetUnit: string; excludedCount: number };
}

interface NumericWithUnitSettings {
  strategy?: 'by_unit' | 'normalize';
  targetUnit?: string;
  factors?: Record<string, number>;
}

/**
 * Spec 108 (P5, P10, P12, P19) — resuelve un gráfico a sus preguntas, valida
 * cada fuente con la elegibilidad del 107 y la matriz, agrega y calcula la
 * salud. La vista previa aplica la misma política en ambas audiencias.
 */
@Injectable()
export class DashboardChartsService {
  constructor(
    @InjectRepository(Question)
    private readonly questionRepo: Repository<Question>,
    private readonly dashboard: DashboardService,
    private readonly aggregation: DashboardAggregationService,
  ) {}

  async loadQuestions(ids: string[]): Promise<Map<string, Question>> {
    if (ids.length === 0) return new Map();
    const rows = await this.questionRepo.find({
      where: { questionId: In(ids) },
      relations: { type: true, options: true, section: { instrument: true } },
    });
    return new Map(rows.map((q) => [q.questionId, q]));
  }

  private optionTexts(q: Question): string[] {
    return (q.options ?? []).map((o) => o.text);
  }

  /**
   * Validación de escritura (crear, editar, publicar, vista previa sin
   * guardar). Lanza 400 con código. Devuelve el tipo común de las preguntas
   * (`null` para métricas). Con `audience: 'public'` rechaza además las
   * fuentes que solo admiten audiencia privada (spec 109, Fase 6).
   */
  async validate(
    config: ChartConfig,
    audience?: string,
  ): Promise<string | null> {
    if (config.sourceKind === 'entity_metric') {
      const metric = config.metricKey
        ? findEntityMetric(config.metricKey)
        : null;
      if (!metric) {
        throw new BadRequestException('metricKey ausente o desconocido.');
      }
      if (config.series.length > 0) {
        throw new BadRequestException(
          'Un gráfico de métrica no admite series ni fuentes.',
        );
      }
      if (!metric.charts.includes(config.chartKind as never)) {
        throw new BadRequestException({
          code: CHART_INCOMPATIBLE,
          message: `La métrica «${metric.metricKey}» no admite el gráfico «${config.chartKind}» (permitidos: ${metric.charts.join(', ')}).`,
        });
      }
      const metricReason =
        audience === 'public'
          ? privateOnlyMetricReason(metric.metricKey)
          : null;
      if (metricReason) {
        throw new BadRequestException({
          code: SOURCE_PRIVATE_ONLY,
          message: `${metricReason} (métrica «${metric.metricKey}»).`,
          blocked: [],
        });
      }
      return null;
    }

    if (config.metricKey) {
      throw new BadRequestException(
        'metricKey solo aplica con sourceKind «entity_metric».',
      );
    }
    if (config.series.length === 0) {
      throw new BadRequestException('El gráfico necesita al menos una serie.');
    }
    if (config.combineMode === 'merge' && config.series.length > 1) {
      throw new BadRequestException(
        'Una fusión (merge) tiene una sola serie; para varias series use combineMode «compare».',
      );
    }
    this.validateSettings(config);
    const keys = config.series.map((s) => s.seriesKey);
    if (new Set(keys).size !== keys.length) {
      throw new BadRequestException('Las series repiten seriesKey.');
    }
    const allIds = config.series.flatMap((s) => s.questionIds);
    if (new Set(allIds).size !== allIds.length) {
      throw new BadRequestException(
        'Una pregunta no puede repetirse en el gráfico.',
      );
    }
    const questions = await this.loadQuestions(allIds);
    const missing = allIds.filter((id) => !questions.has(id));
    if (missing.length > 0) {
      throw new BadRequestException(
        `Preguntas inexistentes: ${missing.join(', ')}`,
      );
    }

    // Privacidad primero: nada bloqueado se guarda ni se publica.
    const blocked = allIds
      .map((id) => ({
        questionId: id,
        reason: this.dashboard.blockedReasonFor(questions.get(id)!),
      }))
      .filter((b) => b.reason !== null);
    if (blocked.length > 0) {
      throw new BadRequestException({
        code: SOURCE_BLOCKED,
        message: 'Hay preguntas bloqueadas por privacidad.',
        blocked,
      });
    }
    if (audience === 'public') {
      const privateOnly = allIds
        .map((id) => ({
          questionId: id,
          reason: privateOnlyReason(questions.get(id)!),
        }))
        .filter((b) => b.reason !== null);
      if (privateOnly.length > 0) {
        throw new BadRequestException({
          code: SOURCE_PRIVATE_ONLY,
          message:
            'Hay preguntas con datos sensibles: el gráfico tiene que ser de audiencia privada.',
          blocked: privateOnly,
        });
      }
    }

    const typeNames = new Set(allIds.map((id) => questions.get(id)!.type.name));
    if (typeNames.size > 1) {
      throw new BadRequestException(
        `Las preguntas son de tipos distintos (${[...typeNames].join(', ')}).`,
      );
    }
    const questionType = [...typeNames][0];
    if (!isSelectableQuestionType(questionType)) {
      throw new BadRequestException({
        code: CHART_INCOMPATIBLE,
        message: `El tipo «${questionType}» no es seleccionable en el constructor.`,
      });
    }

    const ack = config.settings.optionsMismatchAck === true;
    for (const series of config.series) {
      const check = checkMergeCompatibility(
        series.questionIds.map((id) => ({
          questionId: id,
          questionType,
          optionTexts: this.optionTexts(questions.get(id)!),
        })),
        { optionsMismatchAck: ack },
      );
      if (!check.ok) {
        throw new BadRequestException({
          message: check.reason,
          requiresAck: check.requiresAck,
          optionDiff: check.optionDiff,
        });
      }
    }

    const firstId = config.series[0].questionIds[0];
    const chartCheck = validateChartKind({
      questionType,
      chartKind: config.chartKind,
      combineMode: config.combineMode,
      optionTexts: this.optionTexts(questions.get(firstId)!),
    });
    if (!chartCheck.ok) {
      throw new BadRequestException({
        code: CHART_INCOMPATIBLE,
        message: chartCheck.reason,
      });
    }

    if (questionType === 'numeric_with_unit') {
      const nwu = config.settings.numericWithUnit as
        | NumericWithUnitSettings
        | undefined;
      const normalize =
        config.chartKind === 'histogram-normalized' ||
        nwu?.strategy === 'normalize';
      if (normalize && (!nwu?.targetUnit || !nwu.factors)) {
        throw new BadRequestException(
          'La normalización requiere targetUnit y factors.',
        );
      }
    }
    return questionType;
  }

  /** `settings`: solo claves conocidas, con tipos y valores válidos. */
  private validateSettings(config: ChartConfig): void {
    const { optionsMismatchAck, numericWithUnit, ...unknown } = config.settings;
    if (Object.keys(unknown).length > 0) {
      throw new BadRequestException(
        `settings contiene claves desconocidas: ${Object.keys(unknown).join(', ')}.`,
      );
    }
    if (
      optionsMismatchAck !== undefined &&
      typeof optionsMismatchAck !== 'boolean'
    ) {
      throw new BadRequestException('optionsMismatchAck debe ser booleano.');
    }
    if (numericWithUnit === undefined) {
      if (config.chartKind === 'histogram-normalized') {
        throw new BadRequestException(
          'histogram-normalized requiere settings.numericWithUnit con estrategia normalize.',
        );
      }
      return;
    }
    if (typeof numericWithUnit !== 'object' || numericWithUnit === null) {
      throw new BadRequestException('numericWithUnit debe ser un objeto.');
    }
    const { strategy, targetUnit, factors, ...extra } =
      numericWithUnit as Record<string, unknown>;
    if (Object.keys(extra).length > 0) {
      throw new BadRequestException(
        `numericWithUnit contiene claves desconocidas: ${Object.keys(extra).join(', ')}.`,
      );
    }
    if (strategy !== 'by_unit' && strategy !== 'normalize') {
      throw new BadRequestException('strategy debe ser by_unit o normalize.');
    }
    if (strategy === 'normalize') {
      if (typeof targetUnit !== 'string' || targetUnit.length === 0) {
        throw new BadRequestException('normalize requiere targetUnit.');
      }
      if (typeof factors !== 'object' || factors === null) {
        throw new BadRequestException('normalize requiere factors.');
      }
      for (const [unit, factor] of Object.entries(factors)) {
        if (
          typeof factor !== 'number' ||
          !Number.isFinite(factor) ||
          factor <= 0
        ) {
          throw new BadRequestException(
            `El factor de «${unit}» debe ser un número positivo.`,
          );
        }
      }
    }
    if (
      (config.chartKind === 'histogram-normalized') !==
        (strategy === 'normalize') &&
      (config.chartKind === 'histogram-normalized' ||
        config.chartKind === 'histogram-by-unit')
    ) {
      throw new BadRequestException(
        'El gráfico y la estrategia de unidades se contradicen.',
      );
    }
  }

  /** Fuentes que hoy no se pueden usar (bloqueadas o de otro tipo). */
  private excluded(
    config: ChartConfig,
    questions: Map<string, Question>,
    expectedType: string | null,
    audience?: string,
  ): ExcludedSource[] {
    const out: ExcludedSource[] = [];
    for (const id of config.series.flatMap((s) => s.questionIds)) {
      const q = questions.get(id);
      if (!q) continue; // borrada: la fuente ya no existe
      const blocked =
        this.dashboard.blockedReasonFor(q) ??
        (audience === 'public' ? privateOnlyReason(q) : null);
      if (blocked) {
        out.push({ questionId: id, reason: blocked });
      } else if (expectedType && q.type.name !== expectedType) {
        out.push({
          questionId: id,
          reason: `La pregunta cambió a «${q.type.name}», incompatible con el gráfico (${expectedType}).`,
        });
      } else if (!getAllowedCharts(q.type.name).length) {
        out.push({ questionId: id, reason: 'Tipo sin gráfico compatible.' });
      }
    }
    return out;
  }

  /** P5: salud calculada al leer; nunca cambia el estado del gráfico. */
  async healthOf(
    config: ChartConfig,
    expectedType: string | null,
    audience?: string,
  ): Promise<Health> {
    if (config.sourceKind === 'entity_metric') {
      return audience === 'public' && privateOnlyMetricReason(config.metricKey)
        ? 'needs_review'
        : 'ok';
    }
    const ids = config.series.flatMap((s) => s.questionIds);
    if (ids.length === 0) return 'needs_review';
    const questions = await this.loadQuestions(ids);
    if (this.excluded(config, questions, expectedType, audience).length > 0) {
      return 'needs_review';
    }
    return config.series.some((s) => s.questionIds.length === 0)
      ? 'needs_review'
      : 'ok';
  }

  async preview(
    config: ChartConfig,
    expectedType: string | null,
    query: Record<string, string | undefined> = {},
    ctx?: ServingFilterContext,
    audience?: string,
  ): Promise<PreviewResult> {
    if (config.sourceKind === 'entity_metric') {
      const metric = findEntityMetric(config.metricKey!)!;
      if (audience === 'public' && privateOnlyMetricReason(metric.metricKey)) {
        // Spec 109 (Fase 6): dato sensible; en público no se calcula.
        return {
          health: 'needs_review',
          metricKey: metric.metricKey,
          ignoredFilters: [],
          excludedSources: [],
          series: [
            {
              seriesKey: 'metric',
              label: metric.label,
              answeredCount: 0,
              suppressed: true,
              aggregation: null,
            },
          ],
        };
      }
      const result = await this.aggregation.runEntityMetric(
        metric.metricKey,
        query,
      );
      return {
        health: 'ok',
        metricKey: metric.metricKey,
        ignoredFilters: result.ignoredFilters,
        excludedSources: [],
        series: [
          {
            seriesKey: 'metric',
            label: metric.label,
            answeredCount: result.answeredCount,
            suppressed: result.suppressed,
            aggregation: result.aggregation,
          },
        ],
      };
    }

    const ids = config.series.flatMap((s) => s.questionIds);
    const questions = await this.loadQuestions(ids);
    const excludedSources = this.excluded(
      config,
      questions,
      expectedType,
      audience,
    );
    const excludedIds = new Set(excludedSources.map((e) => e.questionId));
    const nwu = config.settings.numericWithUnit as
      | NumericWithUnitSettings
      | undefined;
    const normalize =
      expectedType === 'numeric_with_unit' &&
      (config.chartKind === 'histogram-normalized' ||
        nwu?.strategy === 'normalize');

    let normalization: PreviewResult['normalization'];
    let health: Health = excludedSources.length > 0 ? 'needs_review' : 'ok';
    const series: PreviewResult['series'] = [];
    for (const s of config.series) {
      const validIds = s.questionIds.filter(
        (id) => questions.has(id) && !excludedIds.has(id),
      );
      if (validIds.length === 0) {
        health = 'needs_review';
        series.push({
          seriesKey: s.seriesKey,
          label: s.label,
          answeredCount: 0,
          suppressed: true,
          aggregation: null,
          hasValidSources: false,
          instrumentNames: [],
        });
        continue;
      }
      const instrumentNames = [
        ...new Set(
          validIds
            .map((id) => questions.get(id)!.section?.instrument?.name)
            .filter((n): n is string => !!n),
        ),
      ];
      if (normalize && nwu?.targetUnit) {
        const res = await this.aggregation.aggregateNormalized(
          validIds,
          nwu.targetUnit,
          nwu.factors ?? {},
          ctx,
        );
        normalization = {
          targetUnit: nwu.targetUnit,
          excludedCount:
            (normalization?.excludedCount ?? 0) + res.excludedCount,
        };
        series.push({
          seriesKey: s.seriesKey,
          label: s.label,
          answeredCount: res.answeredCount,
          suppressed: res.suppressed,
          aggregation: res.aggregation,
          hasValidSources: true,
          instrumentNames,
        });
        continue;
      }
      const representative = questions.get(validIds[0])!;
      const res = await this.aggregation.aggregateSeries(
        representative,
        validIds,
        representative.section?.instrument,
        ctx,
      );
      series.push({
        seriesKey: s.seriesKey,
        label: s.label,
        answeredCount: res.answeredCount,
        suppressed: res.suppressed,
        aggregation: res.aggregation,
        hasValidSources: true,
        instrumentNames,
      });
    }
    return {
      health,
      series,
      excludedSources,
      ...(normalization ? { normalization } : {}),
    };
  }
}
