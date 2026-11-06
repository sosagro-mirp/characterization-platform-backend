import { Injectable, NotFoundException } from '@nestjs/common';
import {
  CoverageDataLoader,
  surveyToInput,
} from '../coverage/coverage-data.loader';
import type {
  CoverageColumn,
  LoadedData,
  LoadedFarm,
  RawSurvey,
  RowSelection,
} from '../coverage/coverage-data.loader';
import {
  computeFarmCoverage,
  isCountableSurvey,
} from '../coverage/coverage-calculator';
import type { CoverageCell } from '../coverage/coverage-calculator';

// Los tipos del cargador se re-exportan: el export y la selección los importan de aquí.
export type {
  CoverageColumn,
  LoadedData,
  LoadedFarm,
  RawSurvey,
  RowSelection,
} from '../coverage/coverage-data.loader';

// Spec 98 — vista de unidades productivas: una fila por finca con su cobertura
// por instrumento. Solo lectura; la cobertura se calcula, nunca se guarda.

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
    consentPending: boolean;
  }[];
  /** Algún productor de la finca tiene el consentimiento pendiente. */
  hasPendingConsent: boolean;
  totalSurveys: number;
  unsyncedWithResponses: number;
  coverage: Record<string, CoverageCell>;
  warnings: string[];
  selection: RowSelection | null;
}

export interface UnlocatedSurvey {
  surveyId: string;
  origin: string;
  createdAt: string;
  farmerId: string | null;
  respondentName: string | null;
  responseCount: number;
  instrumentIds: string[];
  reason:
    | 'sin_productor'
    | 'productor_sin_finca'
    | 'productor_varias_fincas'
    | 'cultivo_ambiguo';
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

@Injectable()
export class ProductionUnitsService {
  constructor(private readonly loader: CoverageDataLoader) {}

  /**
   * `maskPersonal` quita documento y teléfono de los productores: se usa con
   * API keys, que nunca deben recibir datos personales (spec 98).
   */
  async getOverview(maskPersonal = false): Promise<ProductionUnitsResult> {
    const data = await this.load();
    const rows = data.farms.map((farm) => {
      const row = this.buildRow(farm, data);
      return maskPersonal
        ? {
            ...row,
            farmers: row.farmers.map((p) => ({
              ...p,
              documentId: null,
              phone: null,
            })),
          }
        : row;
    });
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

  buildRow(farm: LoadedFarm, data: LoadedData): ProductionUnitRow {
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
      farmers: farm.farmers.map((p) => ({
        ...p,
        consentPending: data.consentPending.get(p.farmerId) !== false,
      })),
      hasPendingConsent: farm.farmers.some(
        (p) => data.consentPending.get(p.farmerId) !== false,
      ),
      totalSurveys: mine.filter((s) => isCountableSurvey(surveyToInput(s, '')))
        .length,
      unsyncedWithResponses: mine.filter(
        (s) => !s.sincronized && s.response_count > 0,
      ).length,
      coverage,
      warnings,
      selection: data.selections.get(farm.farmId) ?? null,
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

  findUnlocated(data: LoadedData): UnlocatedSurvey[] {
    const out: UnlocatedSurvey[] = [];
    const farmsById = new Map(data.farms.map((f) => [f.farmId, f]));
    for (const s of data.rawSurveys) {
      if (!s.sincronized) continue;
      if (s.origin === 'public' && s.review_status !== 'processed') continue;
      const base = {
        surveyId: s.survey_id,
        origin: s.origin,
        createdAt: s.created_at.toISOString(),
        farmerId: s.farmer_id,
        respondentName: s.respondent_name,
        responseCount: s.response_count,
        instrumentIds: s.instrument_ids ?? [],
      };

      if (s.farm_id) {
        // Con finca, pero sin cultivo de finca en un instrumento por cultivo
        // y con varios cultivos aplicables: el cálculo no la atribuye a
        // ninguno, así que debe verse aquí en vez de perderse en silencio.
        const farm = farmsById.get(s.farm_id);
        if (
          farm &&
          s.farm_crop_id === null &&
          this.cropAmbiguous(s, farm, data)
        ) {
          out.push({ ...base, reason: 'cultivo_ambiguo' });
        }
        continue;
      }

      const farms = s.farmer_id
        ? (data.farmerFarmCounts[s.farmer_id] ?? 0)
        : -1;
      if (farms === 1) {
        const farm = data.farms.find((f) =>
          f.input.farmerIds.includes(s.farmer_id!),
        );
        if (
          farm &&
          s.farm_crop_id === null &&
          this.cropAmbiguous(s, farm, data)
        ) {
          out.push({ ...base, reason: 'cultivo_ambiguo' });
        }
        continue;
      }
      out.push({
        ...base,
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

  private cropAmbiguous(
    s: RawSurvey,
    farm: LoadedFarm,
    data: LoadedData,
  ): boolean {
    return (s.instrument_ids ?? []).some((instrumentId) => {
      const instrument = data.scoped.find(
        (i) => i.instrumentId === instrumentId,
      );
      if (instrument?.scopeLevel !== 'farm_crop') return false;
      const applicable = farm.input.farmCrops.filter(
        (fc) =>
          instrument.cropIds.length === 0 ||
          instrument.cropIds.includes(fc.cropId),
      );
      return applicable.length > 1;
    });
  }

  /** Carga completa de datos de cobertura (delegada al cargador compartido). */
  load(): Promise<LoadedData> {
    return this.loader.load();
  }
}
