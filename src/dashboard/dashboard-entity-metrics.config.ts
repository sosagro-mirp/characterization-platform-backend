import type { ChartKind } from './dashboard-chart-compat';

/**
 * Spec 108 (P13) — catálogo fijo de métricas de entidad del constructor.
 * Los KPIs quedan fuera: siguen en `dashboard-kpis.config.ts`.
 */
export type EntityMetricEntity = 'farmer' | 'farm' | 'production_unit';

export interface EntityMetricDefinition {
  metricKey: string;
  label: string;
  entity: EntityMetricEntity;
  /** Gráficos permitidos; el primero es el default. */
  charts: ChartKind[];
}

/** Filtros globales que aplican a las métricas (sobre la finca). */
export const ENTITY_METRIC_FILTERS = ['departmentId', 'townId', 'cropId'];

/** Filtros globales derivados de respuestas: no aplican a las métricas. */
export const RESPONSE_DERIVED_FILTERS = [
  'gender',
  'ageRange',
  'educationLevel',
  'connectivity',
  'profile',
  'tenure',
  'chainStage',
  'actorTypeId',
  'campaignId',
  'dateFrom',
  'dateTo',
];

export const ENTITY_METRICS: EntityMetricDefinition[] = [
  {
    metricKey: 'farmers_by_department',
    label: 'Productores por departamento',
    entity: 'farmer',
    charts: ['map', 'bars', 'horizontal-bars'],
  },
  {
    metricKey: 'farms_by_department',
    label: 'Fincas por departamento',
    entity: 'farm',
    charts: ['map', 'bars', 'horizontal-bars'],
  },
  {
    metricKey: 'farms_by_crop',
    label: 'Fincas por cultivo',
    entity: 'farm',
    charts: ['bars', 'horizontal-bars', 'donut'],
  },
  {
    metricKey: 'production_units_by_crop',
    label: 'Unidades productivas por cultivo',
    entity: 'production_unit',
    charts: ['bars', 'horizontal-bars', 'donut'],
  },
  {
    metricKey: 'farm_area_distribution',
    label: 'Distribución del área de las fincas',
    entity: 'farm',
    charts: ['histogram'],
  },
];

export function findEntityMetric(
  metricKey: string,
): EntityMetricDefinition | undefined {
  return ENTITY_METRICS.find((m) => m.metricKey === metricKey);
}
