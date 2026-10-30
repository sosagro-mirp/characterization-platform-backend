import { Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  computeFarmCoverage,
  isCountableSurvey,
} from '../coverage/coverage-calculator';
import type {
  CoverageCell,
  FarmInput,
  ScopedInstrument,
  SurveyInput,
} from '../coverage/coverage-calculator';

// Spec 98 — vista de unidades productivas: una fila por finca con su cobertura
// por instrumento. Solo lectura; la cobertura se calcula, nunca se guarda.

export interface CoverageColumn {
  instrumentId: string;
  name: string;
  code: string | null;
  scopeLevel: ScopedInstrument['scopeLevel'];
  cropIds: string[];
  coverageGroup: string | null;
  /** Instrumentos que cuentan en esta columna (el grupo completo). */
  memberIds: string[];
}

export interface ProductionUnitRow {
  farmId: string;
  name: string;
  department: { departmentId: string; name: string } | null;
  town: { townId: string; name: string } | null;
  crops: { farmCropId: string; cropId: string; name: string }[];
  farmers: {
    farmerId: string;
    name: string;
    documentId: string | null;
    phone: string | null;
    role: string | null;
    isPrimary: boolean;
  }[];
  totalSurveys: number;
  unsyncedWithResponses: number;
  coverage: Record<string, CoverageCell>;
  warnings: string[];
}

export interface UnlocatedSurvey {
  surveyId: string;
  origin: string;
  createdAt: string;
  farmerId: string | null;
  respondentName: string | null;
  responseCount: number;
  instrumentIds: string[];
  reason: 'sin_productor' | 'productor_sin_finca' | 'productor_varias_fincas';
}

export interface ProductionUnitsResult {
  instruments: CoverageColumn[];
  rows: ProductionUnitRow[];
  summary: {
    farms: number;
    instrumentsWithoutScope: number;
    unlocated: number;
    totalSurveys: number;
  };
  unlocated: UnlocatedSurvey[];
}

export interface FarmCoverageDetail {
  farmId: string;
  farmName: string;
  instruments: (CoverageColumn & { cell: CoverageCell })[];
}

interface RawSurvey {
  survey_id: string;
  farmer_id: string | null;
  farm_id: string | null;
  farm_crop_id: string | null;
  sincronized: boolean;
  origin: 'field' | 'public';
  review_status: string | null;
  respondent_name: string | null;
  created_at: Date;
  response_count: number;
  instrument_ids: string[] | null;
}

@Injectable()
export class ProductionUnitsService {
  constructor(private readonly dataSource: DataSource) {}

  async getOverview(): Promise<ProductionUnitsResult> {
    const data = await this.load();
    const rows = data.farms.map((farm) => this.buildRow(farm, data));
    const unlocated = this.findUnlocated(data);
    return {
      instruments: data.columns,
      rows,
      summary: {
        farms: rows.length,
        instrumentsWithoutScope: data.withoutScope,
        unlocated: unlocated.length,
        totalSurveys: data.rawSurveys.length,
      },
      unlocated,
    };
  }

  async getFarmCoverage(farmId: string): Promise<FarmCoverageDetail> {
    const data = await this.load();
    const farm = data.farms.find((f) => f.farmId === farmId);
    if (!farm) throw new NotFoundException('Farm not found');
    return {
      farmId,
      farmName: farm.farmName,
      instruments: data.columns.map((column) => ({
        ...column,
        cell: this.cell(farm, column, data),
      })),
    };
  }

  private cell(
    farm: LoadedFarm,
    column: CoverageColumn,
    data: LoadedData,
  ): CoverageCell {
    const instrument = data.scoped.find(
      (i) => i.instrumentId === column.instrumentId,
    )!;
    return computeFarmCoverage(
      farm.input,
      instrument,
      data.surveys,
      data.scoped,
      data.farmerFarmCounts,
    );
  }

  private buildRow(farm: LoadedFarm, data: LoadedData): ProductionUnitRow {
    const coverage: Record<string, CoverageCell> = {};
    for (const column of data.columns) {
      coverage[column.instrumentId] = this.cell(farm, column, data);
    }
    const mine = data.rawSurveys.filter((s) => this.belongsTo(s, farm, data));
    const warnings: string[] = [];
    if (farm.input.farmCrops.length === 0) warnings.push('sin_cultivo');
    if (farm.farmers.length === 0) warnings.push('sin_productor');
    return {
      farmId: farm.farmId,
      name: farm.farmName,
      department: farm.department,
      town: farm.town,
      crops: farm.crops,
      farmers: farm.farmers,
      totalSurveys: mine.filter((s) => isCountableSurvey(this.toInput(s, '')))
        .length,
      unsyncedWithResponses: mine.filter(
        (s) => !s.sincronized && s.response_count > 0,
      ).length,
      coverage,
      warnings,
    };
  }

  /** Encuesta atribuible a la finca, directa o por productor de una sola finca. */
  private belongsTo(s: RawSurvey, farm: LoadedFarm, data: LoadedData): boolean {
    if (s.farm_id) return s.farm_id === farm.farmId;
    return (
      s.farmer_id !== null &&
      farm.input.farmerIds.includes(s.farmer_id) &&
      data.farmerFarmCounts[s.farmer_id] === 1
    );
  }

  private findUnlocated(data: LoadedData): UnlocatedSurvey[] {
    const out: UnlocatedSurvey[] = [];
    for (const s of data.rawSurveys) {
      if (!s.sincronized) continue;
      if (s.origin === 'public' && s.review_status !== 'processed') continue;
      if (s.farm_id) continue;
      const farms = s.farmer_id
        ? (data.farmerFarmCounts[s.farmer_id] ?? 0)
        : -1;
      if (farms === 1) continue;
      out.push({
        surveyId: s.survey_id,
        origin: s.origin,
        createdAt: s.created_at.toISOString(),
        farmerId: s.farmer_id,
        respondentName: s.respondent_name,
        responseCount: s.response_count,
        instrumentIds: s.instrument_ids ?? [],
        reason:
          farms === -1
            ? 'sin_productor'
            : farms === 0
              ? 'productor_sin_finca'
              : 'productor_varias_fincas',
      });
    }
    return out;
  }

  private toInput(s: RawSurvey, instrumentId: string): SurveyInput {
    return {
      surveyId: s.survey_id,
      instrumentId,
      farmerId: s.farmer_id,
      farmId: s.farm_id,
      farmCropId: s.farm_crop_id,
      sincronized: s.sincronized,
      origin: s.origin,
      reviewStatus: s.review_status,
      responseCount: Number(s.response_count),
      createdAt: s.created_at.toISOString(),
    };
  }

  private async load(): Promise<LoadedData> {
    const q = <T>(sql: string) => this.dataSource.query<T[]>(sql);

    const [farmRows, farmerRows, cropRows, surveyRows, instrumentRows] =
      await Promise.all([
        q<{
          farm_id: string;
          name: string;
          town_id: string | null;
          town_name: string | null;
          department_id: string | null;
          department_name: string | null;
        }>(`SELECT f.farm_id, f.name, t.town_id, t.name AS town_name,
                   d.department_id, d.name AS department_name
              FROM farms f
              LEFT JOIN towns t ON t.town_id = f.town_id
              LEFT JOIN departments d ON d.department_id = t.department_id
             ORDER BY f.name`),
        q<{
          farm_id: string;
          farmer_id: string;
          name: string;
          document_id: string | null;
          phone: string | null;
          role: string | null;
          is_primary: boolean;
        }>(`SELECT ff.farm_id, ff.farmer_id, fr.name, fr.document_id, fr.phone,
                   ff.role, ff.is_primary
              FROM farmer_farms ff
              JOIN farmers fr ON fr.id = ff.farmer_id
             ORDER BY ff.is_primary DESC, fr.name`),
        q<{
          farm_id: string;
          farm_crop_id: string;
          crop_id: string;
          name: string;
        }>(`SELECT fc.farm_id, fc.farm_crop_id, fc.crop_id, c.name
              FROM farms_crops fc
              JOIN types_of_crops c ON c.crop_id = fc.crop_id
             WHERE fc.archived_at IS NULL
             ORDER BY c.name`),
        q<RawSurvey>(`SELECT s.survey_id, s.farmer_id, s.farm_id, s.farm_crop_id,
                   s.sincronized, s.origin, s.review_status, s.respondent_name,
                   s.created_at,
                   (SELECT count(*)::int FROM responses r
                     WHERE r.survey_id = s.survey_id) AS response_count,
                   (SELECT array_agg(si.instrument_id)
                      FROM surveys_instruments si
                     WHERE si.survey_id = s.survey_id) AS instrument_ids
              FROM surveys s`),
        q<{
          instrument_id: string;
          name: string;
          code: string | null;
          is_active: boolean;
          scope_level: ScopedInstrument['scopeLevel'] | null;
          coverage_group: string | null;
          crop_ids: string[] | null;
        }>(`SELECT i.instrument_id, i.name, i.code, i.is_active, i.scope_level,
                   i.coverage_group,
                   (SELECT array_agg(ic.crop_id) FROM instruments_crops ic
                     WHERE ic.instrument_id = i.instrument_id) AS crop_ids
              FROM instruments i
             ORDER BY i.name`),
      ]);

    const farmerFarmCounts: Record<string, number> = {};
    for (const r of farmerRows) {
      farmerFarmCounts[r.farmer_id] = (farmerFarmCounts[r.farmer_id] ?? 0) + 1;
    }

    const farms: LoadedFarm[] = farmRows.map((f) => {
      const farmers = farmerRows.filter((r) => r.farm_id === f.farm_id);
      const crops = cropRows.filter((c) => c.farm_id === f.farm_id);
      return {
        farmId: f.farm_id,
        farmName: f.name,
        department: f.department_id
          ? { departmentId: f.department_id, name: f.department_name! }
          : null,
        town: f.town_id ? { townId: f.town_id, name: f.town_name! } : null,
        crops: crops.map((c) => ({
          farmCropId: c.farm_crop_id,
          cropId: c.crop_id,
          name: c.name,
        })),
        farmers: farmers.map((r) => ({
          farmerId: r.farmer_id,
          name: r.name,
          documentId: r.document_id,
          phone: r.phone,
          role: r.role,
          isPrimary: r.is_primary,
        })),
        input: {
          farmId: f.farm_id,
          farmerIds: farmers.map((r) => r.farmer_id),
          farmCrops: crops.map((c) => ({
            farmCropId: c.farm_crop_id,
            cropId: c.crop_id,
          })),
        },
      };
    });

    const scoped: ScopedInstrument[] = instrumentRows
      .filter((i) => i.scope_level !== null)
      .map((i) => ({
        instrumentId: i.instrument_id,
        scopeLevel: i.scope_level!,
        cropIds: i.crop_ids ?? [],
        coverageGroup: i.coverage_group,
        isActive: i.is_active,
      }));

    // Una columna por instrumento activo con alcance; un grupo es una sola.
    const columns: CoverageColumn[] = [];
    const seenGroups = new Set<string>();
    for (const i of instrumentRows) {
      if (!i.is_active || i.scope_level === null) continue;
      if (i.coverage_group) {
        if (seenGroups.has(i.coverage_group)) continue;
        seenGroups.add(i.coverage_group);
      }
      columns.push({
        instrumentId: i.instrument_id,
        name: i.name,
        code: i.code,
        scopeLevel: i.scope_level,
        cropIds: i.crop_ids ?? [],
        coverageGroup: i.coverage_group,
        memberIds: i.coverage_group
          ? instrumentRows
              .filter((o) => o.coverage_group === i.coverage_group)
              .map((o) => o.instrument_id)
          : [i.instrument_id],
      });
    }

    const surveys: SurveyInput[] = [];
    for (const s of surveyRows) {
      for (const instrumentId of s.instrument_ids ?? []) {
        surveys.push(this.toInput(s, instrumentId));
      }
    }

    return {
      farms,
      columns,
      scoped,
      surveys,
      rawSurveys: surveyRows,
      farmerFarmCounts,
      withoutScope: instrumentRows.filter(
        (i) => i.is_active && i.scope_level === null,
      ).length,
    };
  }
}

interface LoadedFarm {
  farmId: string;
  farmName: string;
  department: ProductionUnitRow['department'];
  town: ProductionUnitRow['town'];
  crops: ProductionUnitRow['crops'];
  farmers: ProductionUnitRow['farmers'];
  input: FarmInput;
}

interface LoadedData {
  farms: LoadedFarm[];
  columns: CoverageColumn[];
  scoped: ScopedInstrument[];
  surveys: SurveyInput[];
  rawSurveys: RawSurvey[];
  farmerFarmCounts: Record<string, number>;
  withoutScope: number;
}
