import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Instrument } from 'src/instruments/entities/instrument.entity';
import { Question } from 'src/questions/entities/question.entity';
import { DashboardService } from './dashboard.service';
import { DashboardFiltersDto } from './dto/dashboard-filters.dto';
import {
  buildBins,
  complementaryHidden,
  positionStatsAllowed,
} from './dashboard-binning';
import {
  MIN_CELL_SIZE,
  MIN_SAMPLE_THRESHOLD,
  suppressCell,
} from './dashboard-privacy.config';
import {
  RESPONSE_DERIVED_FILTERS,
  findEntityMetric,
} from './dashboard-entity-metrics.config';

export interface SeriesAggregation {
  answeredCount: number;
  suppressed: boolean;
  aggregation: unknown;
}

export interface NormalizedAggregation extends SeriesAggregation {
  excludedCount: number;
}

export interface EntityMetricAggregation extends SeriesAggregation {
  ignoredFilters: string[];
}

const round2 = (v: number): number => Math.round(v * 100) / 100;

function quantile(sorted: number[], p: number): number {
  const pos = (sorted.length - 1) * p;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

/**
 * Spec 108 (P9, P11, P13) — agregación por serie, normalización de unidades y
 * métricas de entidad. La agregación de una pregunta (o de varias contadas por
 * encuesta distinta) se delega en `DashboardService`, para que la supresión y
 * las barreras del 107 sean exactamente las mismas.
 */
@Injectable()
export class DashboardAggregationService {
  constructor(
    private readonly dashboard: DashboardService,
    @InjectDataSource() private readonly ds: DataSource,
  ) {}

  /** Una serie: las preguntas se fusionan y cuentan cada encuesta una sola vez. */
  async aggregateSeries(
    representative: Question,
    questionIds: string[],
    instrument?: Instrument,
  ): Promise<SeriesAggregation> {
    const dto = await this.dashboard.aggregateDestination(
      representative,
      questionIds,
      {} as DashboardFiltersDto,
      instrument,
    );
    if (!dto) return { answeredCount: 0, suppressed: true, aggregation: null };
    return {
      answeredCount: dto.answeredCount,
      suppressed: dto.suppressed,
      aggregation: dto.aggregation,
    };
  }

  /** P11: convierte cada respuesta a la unidad destino; sin factor, se excluye. */
  async aggregateNormalized(
    questionIds: string[],
    targetUnit: string,
    factors: Record<string, number>,
  ): Promise<NormalizedAggregation> {
    const rows = await this.dashboard.fetchUnitValues(
      questionIds,
      {} as DashboardFiltersDto,
    );
    // Una encuesta cuenta una sola vez aunque responda a varias fuentes de la
    // fusión (criterio 15): se toma su primer valor con factor.
    const values: number[] = [];
    let excludedCount = 0;
    const surveyRows = new Map<string, typeof rows>();
    for (const row of rows) {
      const list = surveyRows.get(row.surveyId) ?? [];
      list.push(row);
      surveyRows.set(row.surveyId, list);
    }
    for (const list of surveyRows.values()) {
      let picked: number | null = null;
      for (const row of list) {
        const factor =
          row.unit === targetUnit
            ? (factors[row.unit] ?? 1)
            : factors[row.unit];
        if (factor !== undefined && Number.isFinite(factor)) {
          picked = row.value * factor;
          break;
        }
      }
      if (picked === null) excludedCount++;
      else values.push(picked);
    }
    const answeredCount = values.length;
    if (answeredCount < MIN_SAMPLE_THRESHOLD) {
      return {
        answeredCount,
        suppressed: true,
        aggregation: null,
        excludedCount,
      };
    }
    return {
      answeredCount,
      suppressed: false,
      excludedCount,
      aggregation: this.numericAggregation(values),
    };
  }

  private numericAggregation(values: number[]) {
    const sorted = [...values].sort((a, b) => a - b);
    const count = sorted.length;
    const positional = positionStatsAllowed(count, MIN_SAMPLE_THRESHOLD);
    const average = sorted.reduce((a, b) => a + b, 0) / count;
    return {
      type: 'numeric' as const,
      count,
      average: round2(average),
      median: positional ? round2(quantile(sorted, 0.5)) : null,
      q1: positional ? round2(quantile(sorted, 0.25)) : null,
      q3: positional ? round2(quantile(sorted, 0.75)) : null,
      bins: buildBins(sorted, count),
    };
  }

  /** P13: ejecuta una métrica de entidad con los filtros que acepta. */
  async runEntityMetric(
    metricKey: string,
    query: Record<string, string | undefined>,
  ): Promise<EntityMetricAggregation> {
    const metric = findEntityMetric(metricKey);
    if (!metric) throw new Error(`Métrica desconocida: ${metricKey}`);

    const ignoredFilters = RESPONSE_DERIVED_FILTERS.filter(
      (k) => query[k] !== undefined && query[k] !== '',
    );

    // Filtros sobre la finca `f` (departamento, municipio, cultivo activo).
    const params: unknown[] = [];
    const where: string[] = [];
    if (query.departmentId) {
      params.push(query.departmentId);
      where.push(`t.department_id = $${params.length}`);
    }
    if (query.townId) {
      params.push(query.townId);
      where.push(`f.town_id = $${params.length}`);
    }
    if (query.cropId) {
      params.push(query.cropId);
      where.push(
        `EXISTS (SELECT 1 FROM farms_crops fx WHERE fx.farm_id = f.farm_id AND fx.crop_id = $${params.length} AND fx.archived_at IS NULL)`,
      );
    }
    const extra = where.length ? ` AND ${where.join(' AND ')}` : '';

    if (metricKey === 'farm_area_distribution') {
      const rows = await this.ds.query<{ area: string }[]>(
        `SELECT f.area FROM farms f LEFT JOIN towns t ON t.town_id = f.town_id
          WHERE f.area IS NOT NULL${extra}`,
        params,
      );
      const values = rows.map((r) => Number(r.area));
      if (values.length < MIN_SAMPLE_THRESHOLD) {
        return {
          answeredCount: values.length,
          suppressed: true,
          aggregation: null,
          ignoredFilters,
        };
      }
      return {
        answeredCount: values.length,
        suppressed: false,
        aggregation: this.numericAggregation(values),
        ignoredFilters,
      };
    }

    let sql: string;
    switch (metricKey) {
      case 'farmers_by_department':
        sql = `SELECT d.department_id AS id, d.name AS name,
                      COUNT(DISTINCT ff.farmer_id) AS count
                 FROM farmer_farms ff
                 JOIN farms f ON f.farm_id = ff.farm_id
                 JOIN towns t ON t.town_id = f.town_id
                 JOIN departments d ON d.department_id = t.department_id
                WHERE TRUE${extra}
                GROUP BY d.department_id, d.name`;
        break;
      case 'farms_by_department':
        sql = `SELECT d.department_id AS id, d.name AS name,
                      COUNT(DISTINCT f.farm_id) AS count
                 FROM farms f
                 JOIN towns t ON t.town_id = f.town_id
                 JOIN departments d ON d.department_id = t.department_id
                WHERE TRUE${extra}
                GROUP BY d.department_id, d.name`;
        break;
      case 'farms_by_crop':
        sql = `SELECT c.crop_id AS id, c.name AS name,
                      COUNT(DISTINCT f.farm_id) AS count
                 FROM farms f
                 LEFT JOIN towns t ON t.town_id = f.town_id
                 JOIN farms_crops fc ON fc.farm_id = f.farm_id AND fc.archived_at IS NULL
                 JOIN types_of_crops c ON c.crop_id = fc.crop_id
                WHERE TRUE${extra}
                GROUP BY c.crop_id, c.name`;
        break;
      case 'production_units_by_crop':
        sql = `SELECT c.crop_id AS id, c.name AS name,
                      COUNT(fc.farm_crop_id) AS count
                 FROM farms f
                 LEFT JOIN towns t ON t.town_id = f.town_id
                 JOIN farms_crops fc ON fc.farm_id = f.farm_id AND fc.archived_at IS NULL
                 JOIN types_of_crops c ON c.crop_id = fc.crop_id
                WHERE TRUE${extra}
                GROUP BY c.crop_id, c.name`;
        break;
      default:
        throw new Error(`Métrica sin implementación: ${metricKey}`);
    }

    // Entidades distintas contadas (denominador y umbral de muestra).
    let totalSql: string;
    if (metricKey === 'farmers_by_department') {
      totalSql = `SELECT COUNT(DISTINCT ff.farmer_id) AS n FROM farmer_farms ff
                   JOIN farms f ON f.farm_id = ff.farm_id
                   JOIN towns t ON t.town_id = f.town_id WHERE TRUE${extra}`;
    } else if (metricKey === 'farms_by_department') {
      totalSql = `SELECT COUNT(DISTINCT f.farm_id) AS n FROM farms f
                   JOIN towns t ON t.town_id = f.town_id WHERE TRUE${extra}`;
    } else if (metricKey === 'farms_by_crop') {
      totalSql = `SELECT COUNT(DISTINCT f.farm_id) AS n FROM farms f
                   LEFT JOIN towns t ON t.town_id = f.town_id
                   JOIN farms_crops fc ON fc.farm_id = f.farm_id AND fc.archived_at IS NULL
                  WHERE TRUE${extra}`;
    } else {
      totalSql = `SELECT COUNT(fc.farm_crop_id) AS n FROM farms f
                   LEFT JOIN towns t ON t.town_id = f.town_id
                   JOIN farms_crops fc ON fc.farm_id = f.farm_id AND fc.archived_at IS NULL
                  WHERE TRUE${extra}`;
    }

    const [rows, totalRows] = await Promise.all([
      this.ds.query<{ id: string; name: string; count: string }[]>(sql, params),
      this.ds.query<{ n: string }[]>(totalSql, params),
    ]);
    const total = Number(totalRows[0]?.n ?? 0);
    if (total < MIN_SAMPLE_THRESHOLD) {
      return {
        answeredCount: total,
        suppressed: true,
        aggregation: null,
        ignoredFilters,
      };
    }
    const sorted = rows
      .map((r) => ({ id: r.id, name: r.name, raw: Number(r.count) }))
      .sort((a, b) => b.raw - a.raw || a.name.localeCompare(b.name));
    // P18-e: en las métricas de conteo por categoría (cada entidad cae casi
    // siempre en una sola celda) los buckets suman o casi suman el total: con
    // una única celda suprimida, total − visibles la revelaría.
    const hidden = complementaryHidden(sorted.map((b) => b.raw));
    const buckets = sorted.map(({ raw, ...b }, i) =>
      hidden[i]
        ? { ...b, count: null, percentage: null, suppressed: true }
        : { ...b, ...suppressCell(raw, round2((raw / total) * 100)) },
    );
    return {
      answeredCount: total,
      suppressed: false,
      aggregation: { buckets },
      ignoredFilters,
    };
  }
}
