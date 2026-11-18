import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository } from 'typeorm';
import { DashboardService } from './dashboard.service';
import {
  chartConfigFrom,
  DashboardChartsService,
} from './dashboard-charts.service';
import { DashboardCategory } from './entities/dashboard-category.entity';
import {
  DashboardAudience,
  DashboardChart,
} from './entities/dashboard-chart.entity';
import { DashboardChartSource } from './entities/dashboard-chart-source.entity';
import { DashboardFiltersDto } from './dto/dashboard-filters.dto';
import {
  ServedCategoryDto,
  ServedChartDto,
  ServedChartsResponseDto,
} from './dto/dashboard-served-chart.dto';
import { MIN_SAMPLE_THRESHOLD } from './dashboard-privacy.config';

interface YesNoAggregation {
  type: 'yes_no';
  yesCount: number | null;
  noCount: number | null;
  yesPercentage: number | null;
  noPercentage: number | null;
  yesSuppressed: boolean;
  noSuppressed: boolean;
}

/**
 * Spec 109 — a la agregación Sí/No del 107 le suma `cells`, la misma lectura
 * con forma de celdas (`suppressed` por celda) como en las de opciones, para
 * que la fábrica por `chartKind` dibuje una sola forma. No cambia valores.
 */
export function withYesNoCells(aggregation: unknown): unknown {
  const agg = aggregation as YesNoAggregation | null;
  if (!agg || agg.type !== 'yes_no') return aggregation;
  return {
    ...agg,
    cells: [
      {
        key: 'yes',
        label: 'Sí',
        count: agg.yesCount,
        percentage: agg.yesPercentage,
        suppressed: agg.yesSuppressed,
      },
      {
        key: 'no',
        label: 'No',
        count: agg.noCount,
        percentage: agg.noPercentage,
        suppressed: agg.noSuppressed,
      },
    ],
  };
}

/**
 * «Demanda digital» tiene un bloque consolidado fijo en código
 * (`/dashboard/digital-demand`): se lista mientras esté activa, aunque no
 * tenga gráficos en el constructor (decisión del usuario, 2026-11-18).
 */
export const DIGITAL_DEMAND_CATEGORY_CODE = 'C14';

/** Audiencias que ve cada dashboard (P8, P19, P20). */
export const PUBLIC_AUDIENCES: DashboardAudience[] = ['public'];
export const PRIVATE_AUDIENCES: DashboardAudience[] = ['public', 'private'];

/**
 * Spec 109 — sirve los gráficos publicados del constructor (spec 108) al
 * dashboard público y al privado. Solo gráficos `published`, no archivados,
 * de categorías activas y de las audiencias pedidas, en el orden configurado.
 * La agregación, las barreras y la supresión son las del 107/108 (P19).
 */
@Injectable()
export class DashboardServingService {
  constructor(
    @InjectRepository(DashboardCategory)
    private readonly categoryRepo: Repository<DashboardCategory>,
    @InjectRepository(DashboardChart)
    private readonly chartRepo: Repository<DashboardChart>,
    @InjectRepository(DashboardChartSource)
    private readonly sourceRepo: Repository<DashboardChartSource>,
    private readonly dashboard: DashboardService,
    private readonly charts: DashboardChartsService,
  ) {}

  /**
   * Categorías activas con al menos un gráfico publicado de las audiencias
   * pedidas (más C14, por su bloque fijo), en su orden. Incluye `OVERVIEW` si cumple; el frontend la quita
   * de la navegación.
   */
  async listCategories(
    audiences: DashboardAudience[],
  ): Promise<ServedCategoryDto[]> {
    const rows = await this.categoryRepo
      .createQueryBuilder('cat')
      .where('cat.is_active = true')
      .andWhere(
        `(cat.code = :fixedBlock OR EXISTS (SELECT 1 FROM dashboard_charts ch
                  WHERE ch.category_id = cat.category_id
                    AND ch.status = 'published'
                    AND ch.archived_at IS NULL
                    AND ch.audience IN (:...audiences)))`,
        { audiences, fixedBlock: DIGITAL_DEMAND_CATEGORY_CODE },
      )
      .orderBy('cat.position', 'ASC')
      .addOrderBy('cat.code', 'ASC')
      .getMany();
    return rows.map((c) => ({
      code: c.code,
      name: c.name,
      description: c.description,
    }));
  }

  async serveCharts(
    categoryCode: string | undefined,
    audiences: DashboardAudience[],
    filters: DashboardFiltersDto,
  ): Promise<ServedChartsResponseDto> {
    if (!categoryCode) {
      throw new NotFoundException('Categoría no encontrada.');
    }
    const category = await this.categoryRepo.findOne({
      where: { code: categoryCode, isActive: true },
    });
    if (!category) throw new NotFoundException('Categoría no encontrada.');

    const ctx = await this.dashboard.resolveServingContext(filters);
    const rows = await this.chartRepo.find({
      where: {
        categoryId: category.categoryId,
        status: 'published',
        archivedAt: IsNull(),
        audience: In(audiences),
      },
      order: { position: 'ASC', createdAt: 'ASC' },
    });
    const sources = rows.length
      ? await this.sourceRepo.find({
          where: { chartId: In(rows.map((r) => r.chartId)) },
          order: { seriesPosition: 'ASC', sourceId: 'ASC' },
        })
      : [];

    // Filtros globales recibidos (sin la categoría) para las métricas de entidad.
    const query: Record<string, string | undefined> = {};
    for (const [k, v] of Object.entries(ctx.filters)) {
      if (v !== undefined && v !== null && v !== '') query[k] = String(v);
    }

    const served: ServedChartDto[] = [];
    for (const chart of rows) {
      const config = chartConfigFrom(
        chart,
        sources.filter((s) => s.chartId === chart.chartId),
      );
      const result = await this.charts.preview(
        config,
        chart.questionType,
        query,
        ctx,
      );

      const base = {
        chartId: chart.chartId,
        title: chart.title,
        subtitle: chart.subtitle,
        sourceKind: chart.sourceKind,
        questionType: chart.questionType,
        chartKind: chart.chartKind,
        combineMode: chart.combineMode,
        layout: chart.layout,
        audience: chart.audience,
        settings: this.publicSettings(chart.settings),
      };

      if (chart.sourceKind === 'entity_metric') {
        const s = result.series[0];
        served.push({
          ...base,
          metricKey: result.metricKey,
          ignoredFilters: result.ignoredFilters ?? [],
          suppressed: s?.suppressed ?? true,
          answeredCount: s?.answeredCount ?? 0,
          instrumentNames: [],
          series: result.series.map((x) => ({
            seriesKey: x.seriesKey,
            label: x.label,
            answeredCount: x.answeredCount,
            suppressed: x.suppressed,
            aggregation: x.aggregation,
          })),
        });
        continue;
      }

      // Criterio 4: fuentes bloqueadas fuera; sin fuentes válidas, no se sirve.
      const valid = result.series.filter((s) => s.hasValidSources !== false);
      if (valid.length === 0) continue;

      const answeredCount =
        chart.combineMode === 'merge'
          ? valid[0].answeredCount
          : Math.max(...valid.map((s) => s.answeredCount));
      served.push({
        ...base,
        suppressed: valid.every((s) => s.suppressed),
        answeredCount,
        instrumentNames: [
          ...new Set(valid.flatMap((s) => s.instrumentNames ?? [])),
        ],
        ...(result.normalization
          ? { normalization: result.normalization }
          : {}),
        series: valid.map((s) => ({
          seriesKey: s.seriesKey,
          label: s.label,
          answeredCount: s.answeredCount,
          suppressed: s.suppressed,
          aggregation: withYesNoCells(s.aggregation),
        })),
      });
    }

    const suppressed = ctx.totalCount < MIN_SAMPLE_THRESHOLD;
    return {
      category: {
        code: category.code,
        name: category.name,
        description: category.description,
      },
      totalCount: suppressed ? null : ctx.totalCount,
      suppressed,
      charts: served,
    };
  }

  /** Solo lo que el frontend necesita para dibujar; nunca factores ni acuses internos. */
  private publicSettings(
    settings: Record<string, unknown> | null,
  ): Record<string, unknown> {
    const nwu = settings?.numericWithUnit as
      | { strategy?: string; targetUnit?: string }
      | undefined;
    return nwu
      ? {
          numericWithUnit: {
            strategy: nwu.strategy,
            targetUnit: nwu.targetUnit,
          },
        }
      : {};
  }
}
