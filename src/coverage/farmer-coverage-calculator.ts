/**
 * Spec 100 — cobertura de instrumentos por productor. Función pura: agrega la
 * cobertura por finca del spec 98 (`computeFarmCoverage`) sobre todas las
 * fincas vinculadas al productor. Reglas en
 * `spec/100_cobertura_por_productor.md`, "Reglas de `computeFarmerCoverage`".
 */

import { computeFarmCoverage, isCountableSurvey } from './coverage-calculator';
import type {
  CoverageCell,
  CoverageStatus,
  FarmInput,
  ScopedInstrument,
  SurveyInput,
} from './coverage-calculator';

export interface CoverageColumnInput {
  instrumentId: string;
  name: string;
  code: string | null;
  scopeLevel: ScopedInstrument['scopeLevel'];
  cropIds: string[];
  coverageGroup: string | null;
  memberIds: string[];
}

export interface FarmerFarmInput {
  /** `farmerIds` incluye a todos los productores de la finca (DP1). */
  farm: FarmInput;
  name: string;
  role: string | null;
  isPrimary: boolean;
  town: { townId: string; name: string } | null;
  crops: { farmCropId: string; cropId: string; name: string }[];
}

export interface FarmerCoverageInput {
  farmerId: string;
  name: string;
  farms: FarmerFarmInput[];
  columns: CoverageColumnInput[];
  scoped: ScopedInstrument[];
  surveys: SurveyInput[];
  farmerFarmCounts: Record<string, number>;
  withoutScope: number;
  computedAt?: string;
}

export interface CoverageUnit {
  unitType: 'farmer' | 'farm' | 'farm_crop';
  farmId?: string;
  farmCropId?: string;
  label: string;
  status: CoverageStatus;
  surveyId: string | null;
  surveyCount: number;
  inferredFarm?: boolean;
  inferredCrop?: boolean;
  outOfScope?: boolean;
  coveredByOtherFarmer?: boolean;
}

export interface FarmerInstrumentCoverage extends CoverageColumnInput {
  status: CoverageStatus;
  surveyCount: number;
  latestSurvey: {
    surveyId: string;
    instrumentId: string;
    createdAt: string;
    origin: 'field' | 'public';
    farmId: string | null;
    farmCropId: string | null;
    farmerId: string | null;
  } | null;
  units: CoverageUnit[];
}

export type FarmerCoverageWarning =
  | 'sin_finca'
  | 'sin_cultivo'
  | 'encuestas_sin_ubicar';

export interface FarmerCoverageSummary {
  applicable: number;
  applied: number;
  partial: number;
  pending: number;
  notApplicable: number;
  instrumentsWithoutScope: number;
}

export interface FarmerCoverageResult {
  farmerId: string;
  name: string;
  computedAt: string;
  summary: FarmerCoverageSummary;
  farms: {
    farmId: string;
    name: string;
    role: string | null;
    isPrimary: boolean;
    town: { townId: string; name: string } | null;
    crops: { farmCropId: string; cropId: string; name: string }[];
  }[];
  instruments: FarmerInstrumentCoverage[];
  warnings: FarmerCoverageWarning[];
  unlocatedSurveys: {
    surveyId: string;
    reason: 'productor_varias_fincas' | 'cultivo_ambiguo';
  }[];
  unsyncedWithResponses: number;
}

const byNewest = (a: SurveyInput, b: SurveyInput) =>
  b.createdAt.localeCompare(a.createdAt);

/** Estado agregado de varias unidades (ignora las que no aplican). */
function aggregate(statuses: CoverageStatus[]): CoverageStatus {
  const relevant = statuses.filter((s) => s !== 'no_aplica');
  if (relevant.length === 0) return 'no_aplica';
  if (relevant.every((s) => s === 'aplicado')) return 'aplicado';
  if (relevant.every((s) => s === 'falta')) return 'falta';
  return 'parcial';
}

export function computeFarmerCoverage(
  input: FarmerCoverageInput,
): FarmerCoverageResult {
  const { farmerId, farms, scoped, surveys, farmerFarmCounts } = input;
  const scopedById = new Map(scoped.map((i) => [i.instrumentId, i]));
  const countable = surveys.filter(isCountableSurvey);

  /** Encuesta atribuible a la finca, directa o por productor de una sola finca. */
  const attributable = (s: SurveyInput, farm: FarmInput) =>
    s.farmId === farm.farmId ||
    (s.farmId === null &&
      s.farmerId !== null &&
      farm.farmerIds.includes(s.farmerId) &&
      farmerFarmCounts[s.farmerId] === 1);
  const isMine = (s: SurveyInput, farm: FarmInput) =>
    s.farmerId === farmerId &&
    (s.farmId === farm.farmId ||
      (s.farmId === null && farmerFarmCounts[farmerId] === 1));

  const instruments: FarmerInstrumentCoverage[] = input.columns.map(
    (column) => {
      const instrument = scopedById.get(column.instrumentId)!;
      const groupIds = new Set(column.memberIds);
      const candidates = countable
        .filter((s) => groupIds.has(s.instrumentId))
        .sort(byNewest);
      const base = { ...column };
      const finish = (
        status: CoverageStatus,
        units: CoverageUnit[],
        used: SurveyInput[],
      ): FarmerInstrumentCoverage => {
        const latest = [...used].sort(byNewest)[0];
        return {
          ...base,
          status,
          surveyCount: used.length,
          latestSurvey: latest
            ? {
                surveyId: latest.surveyId,
                instrumentId: latest.instrumentId,
                createdAt: latest.createdAt,
                origin: latest.origin,
                farmId: latest.farmId,
                farmCropId: latest.farmCropId,
                farmerId: latest.farmerId,
              }
            : null,
          units,
        };
      };

      if (instrument.scopeLevel === 'farmer') {
        const matches = candidates.filter((s) => s.farmerId === farmerId);
        const status: CoverageStatus = matches.length ? 'aplicado' : 'falta';
        return finish(
          status,
          [
            {
              unitType: 'farmer',
              label: input.name,
              status,
              surveyId: matches[0]?.surveyId ?? null,
              surveyCount: matches.length,
            },
          ],
          matches,
        );
      }

      if (farms.length === 0) return finish('no_aplica', [], []);

      const units: CoverageUnit[] = [];
      const farmStatuses: CoverageStatus[] = [];
      const used: SurveyInput[] = [];

      for (const f of farms) {
        const cell: CoverageCell = computeFarmCoverage(
          f.farm,
          instrument,
          surveys,
          scoped,
          farmerFarmCounts,
        );
        farmStatuses.push(cell.status);
        const onFarm = candidates.filter((s) => attributable(s, f.farm));

        if (instrument.scopeLevel === 'farm') {
          const covered = cell.status === 'aplicado';
          if (covered) used.push(...onFarm);
          units.push({
            unitType: 'farm',
            farmId: f.farm.farmId,
            label: f.name,
            status: cell.status,
            surveyId: cell.surveyId ?? null,
            surveyCount: cell.surveyCount ?? 0,
            ...(cell.inferredFarm ? { inferredFarm: true } : {}),
            ...(covered && !onFarm.some((s) => isMine(s, f.farm))
              ? { coveredByOtherFarmer: true }
              : {}),
          });
          continue;
        }

        // farm_crop: una unidad por cultivo aplicable.
        const applicable = f.farm.farmCrops.filter(
          (fc) =>
            instrument.cropIds.length === 0 ||
            instrument.cropIds.includes(fc.cropId),
        );
        const cropName = new Map(f.crops.map((c) => [c.farmCropId, c.name]));
        for (const fc of applicable) {
          const covering = onFarm.filter(
            (s) =>
              s.farmCropId === fc.farmCropId ||
              (s.farmCropId === null && applicable.length === 1),
          );
          units.push({
            unitType: 'farm_crop',
            farmId: f.farm.farmId,
            farmCropId: fc.farmCropId,
            label: `${f.name} · ${cropName.get(fc.farmCropId) ?? fc.cropId}`,
            status: covering.length ? 'aplicado' : 'falta',
            surveyId: covering[0]?.surveyId ?? null,
            surveyCount: covering.length,
            ...(covering.length && applicable.length === 1
              ? covering.some((s) => s.farmCropId === null)
                ? { inferredCrop: true }
                : {}
              : {}),
            ...(cell.inferredFarm ? { inferredFarm: true } : {}),
          });
          used.push(...covering);
        }
        if (cell.outOfScope) {
          const outside = onFarm.filter(
            (s) =>
              s.farmCropId !== null &&
              !applicable.some((fc) => fc.farmCropId === s.farmCropId),
          );
          units.push({
            unitType: 'farm_crop',
            farmId: f.farm.farmId,
            label: `${f.name} · fuera de alcance`,
            status: 'aplicado',
            surveyId: cell.surveyId ?? null,
            surveyCount: cell.surveyCount ?? 0,
            outOfScope: true,
          });
          used.push(...outside);
        }
      }

      const uniqueUsed = [
        ...new Map(used.map((s) => [s.surveyId, s])).values(),
      ];
      return finish(aggregate(farmStatuses), units, uniqueUsed);
    },
  );

  const summary: FarmerCoverageSummary = {
    applicable: 0,
    applied: 0,
    partial: 0,
    pending: 0,
    notApplicable: 0,
    instrumentsWithoutScope: input.withoutScope,
  };
  for (const i of instruments) {
    if (i.status === 'aplicado') summary.applied++;
    else if (i.status === 'parcial') summary.partial++;
    else if (i.status === 'falta') summary.pending++;
    else summary.notApplicable++;
  }
  summary.applicable = summary.applied + summary.partial + summary.pending;

  // Encuestas del productor que no se pueden ubicar (una sola vez por encuesta).
  const unlocated = new Map<
    string,
    'productor_varias_fincas' | 'cultivo_ambiguo'
  >();
  for (const s of countable) {
    const scope = scopedById.get(s.instrumentId)?.scopeLevel;
    // Solo los instrumentos de finca o cultivo necesitan ubicar la encuesta.
    if (s.farmId === null && s.farmerId === farmerId) {
      if (
        (scope === 'farm' || scope === 'farm_crop') &&
        (farmerFarmCounts[farmerId] ?? 0) > 1
      ) {
        unlocated.set(s.surveyId, 'productor_varias_fincas');
        continue;
      }
    }
    if (s.farmCropId !== null) continue;
    const instrument = scopedById.get(s.instrumentId);
    if (instrument?.scopeLevel !== 'farm_crop') continue;
    for (const f of farms) {
      if (!attributable(s, f.farm)) continue;
      const applicable = f.farm.farmCrops.filter(
        (fc) =>
          instrument.cropIds.length === 0 ||
          instrument.cropIds.includes(fc.cropId),
      );
      if (applicable.length > 1) {
        unlocated.set(s.surveyId, 'cultivo_ambiguo');
        break;
      }
    }
  }

  const unsynced = new Set(
    surveys
      .filter(
        (s) => s.farmerId === farmerId && !s.sincronized && s.responseCount > 0,
      )
      .map((s) => s.surveyId),
  );

  const warnings: FarmerCoverageWarning[] = [];
  if (farms.length === 0) warnings.push('sin_finca');
  else if (farms.every((f) => f.farm.farmCrops.length === 0)) {
    warnings.push('sin_cultivo');
  }
  if (unlocated.size > 0) warnings.push('encuestas_sin_ubicar');

  return {
    farmerId,
    name: input.name,
    computedAt: input.computedAt ?? new Date().toISOString(),
    summary,
    farms: farms.map((f) => ({
      farmId: f.farm.farmId,
      name: f.name,
      role: f.role,
      isPrimary: f.isPrimary,
      town: f.town,
      crops: f.crops,
    })),
    instruments,
    warnings,
    unlocatedSurveys: [...unlocated].map(([surveyId, reason]) => ({
      surveyId,
      reason,
    })),
    unsyncedWithResponses: unsynced.size,
  };
}
