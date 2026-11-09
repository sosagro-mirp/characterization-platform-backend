import type { CoverageStatus } from './coverage-calculator';
import type { CoverageColumn } from './coverage-data.loader';
import type {
  CoverageUnit,
  FarmerCoverageResult,
  FarmerCoverageSummary,
  FarmerCoverageWarning,
} from './farmer-coverage-calculator';

// Spec 103 — foto compacta de cobertura para la caché offline del móvil.
// Función pura con lista blanca: nunca teléfono, correo ni coordenadas.

export interface SnapshotFarmerSource {
  result: FarmerCoverageResult;
  documentId: string | null;
  department: { departmentId: string; name: string } | null;
  hasPendingConsent: boolean;
}

export interface CoverageSnapshotInput {
  computedAt: string;
  columns: CoverageColumn[];
  farmers: SnapshotFarmerSource[];
  maskPersonal: boolean;
}

export interface SnapshotInstrument {
  instrumentId: string;
  status: Exclude<CoverageStatus, 'no_aplica'>;
  surveyCount: number;
  latestSurvey: {
    surveyId: string;
    createdAt: string;
    farmId: string | null;
    farmCropId: string | null;
    farmerId: string | null;
  } | null;
  units: CoverageUnit[];
}

export interface SnapshotFarmer {
  farmerId: string;
  name: string;
  documentId: string | null;
  departmentId: string | null;
  // Aditivo (spec 103): nombre para rotular el filtro por departamento sin conexión.
  departmentName: string | null;
  townId: string | null;
  farmsCount: number;
  cropIds: string[];
  hasPendingConsent: boolean;
  summary: FarmerCoverageSummary;
  warnings: FarmerCoverageWarning[];
  farms: {
    farmId: string;
    name: string;
    role: string | null;
    isPrimary: boolean;
    town: { townId: string; name: string } | null;
    crops: { farmCropId: string; cropId: string; name: string }[];
  }[];
  instruments: SnapshotInstrument[];
}

export interface CoverageSnapshot {
  computedAt: string;
  instruments: CoverageColumn[];
  farmers: SnapshotFarmer[];
}

export function toCoverageSnapshot(
  input: CoverageSnapshotInput,
): CoverageSnapshot {
  return {
    computedAt: input.computedAt,
    instruments: input.columns,
    farmers: input.farmers.map((src) => toFarmer(src, input.maskPersonal)),
  };
}

function toFarmer(src: SnapshotFarmerSource, mask: boolean): SnapshotFarmer {
  const r = src.result;
  const primary = r.farms.find((f) => f.isPrimary) ?? r.farms[0];
  return {
    farmerId: r.farmerId,
    name: r.name,
    documentId: mask ? null : src.documentId,
    departmentId: primary ? (src.department?.departmentId ?? null) : null,
    departmentName: primary ? (src.department?.name ?? null) : null,
    townId: primary?.town?.townId ?? null,
    farmsCount: r.farms.length,
    cropIds: [...new Set(r.farms.flatMap((f) => f.crops.map((c) => c.cropId)))],
    hasPendingConsent: src.hasPendingConsent,
    summary: r.summary,
    warnings: r.warnings,
    farms: r.farms.map((f) => ({
      farmId: f.farmId,
      name: f.name,
      role: f.role,
      isPrimary: f.isPrimary,
      town: f.town ? { townId: f.town.townId, name: f.town.name } : null,
      crops: f.crops.map((c) => ({
        farmCropId: c.farmCropId,
        cropId: c.cropId,
        name: c.name,
      })),
    })),
    instruments: r.instruments
      .filter((i) => i.status !== 'no_aplica')
      .map((i) => ({
        instrumentId: i.instrumentId,
        status: i.status as SnapshotInstrument['status'],
        surveyCount: i.surveyCount,
        latestSurvey: i.latestSurvey
          ? {
              surveyId: i.latestSurvey.surveyId,
              createdAt: i.latestSurvey.createdAt,
              farmId: i.latestSurvey.farmId,
              farmCropId: i.latestSurvey.farmCropId,
              farmerId: i.latestSurvey.farmerId,
            }
          : null,
        units: i.units,
      })),
  };
}
