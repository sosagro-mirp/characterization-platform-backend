/**
 * Spec 98 — cobertura de una finca por instrumento. Función pura: no lee ni
 * escribe en la base. Reglas en `spec/98_exploracion_unidades_productivas.md`,
 * "Reglas de negocio". Reutilizable por el spec 83 (H5).
 */

export type ScopeLevel = 'farmer' | 'farm' | 'farm_crop';
export type CoverageStatus = 'aplicado' | 'parcial' | 'falta' | 'no_aplica';

export interface ScopedInstrument {
  instrumentId: string;
  scopeLevel: ScopeLevel;
  /** Vacío = todos los cultivos. */
  cropIds: string[];
  coverageGroup?: string | null;
  isActive: boolean;
}

export interface FarmInput {
  farmId: string;
  farmerIds: string[];
  /** Cultivos activos de la finca. */
  farmCrops: { farmCropId: string; cropId: string }[];
}

export interface SurveyInput {
  surveyId: string;
  instrumentId: string;
  farmerId: string | null;
  farmId: string | null;
  farmCropId: string | null;
  sincronized: boolean;
  origin: 'field' | 'public';
  reviewStatus: string | null;
  responseCount: number;
  createdAt: string;
}

export interface CoverageCell {
  status: CoverageStatus;
  surveyId?: string | null;
  surveyCount?: number;
  coveredFarmers?: number;
  totalFarmers?: number;
  outOfScope?: boolean;
  inferredFarm?: boolean;
  inferredCrop?: boolean;
  noRegisteredCrop?: boolean;
}

/** Sincronizada, con al menos una respuesta, y de campo o pública procesada. */
export function isCountableSurvey(survey: SurveyInput): boolean {
  if (!survey.sincronized || survey.responseCount < 1) return false;
  return survey.origin === 'field' || survey.reviewStatus === 'processed';
}

const byNewest = (a: SurveyInput, b: SurveyInput) =>
  b.createdAt.localeCompare(a.createdAt);

export function computeFarmCoverage(
  farm: FarmInput,
  instrument: ScopedInstrument,
  surveys: SurveyInput[],
  allInstruments: ScopedInstrument[],
  farmerFarmCounts: Record<string, number>,
): CoverageCell {
  const groupIds = new Set<string>([instrument.instrumentId]);
  if (instrument.coverageGroup) {
    for (const other of allInstruments) {
      if (other.coverageGroup === instrument.coverageGroup) {
        groupIds.add(other.instrumentId);
      }
    }
  }
  const candidates = surveys
    .filter((s) => groupIds.has(s.instrumentId) && isCountableSurvey(s))
    .sort(byNewest);

  if (instrument.scopeLevel === 'farmer') {
    const matches = candidates.filter(
      (s) => s.farmerId !== null && farm.farmerIds.includes(s.farmerId),
    );
    const covered = new Set(matches.map((s) => s.farmerId));
    return {
      status: matches.length ? 'aplicado' : 'falta',
      surveyId: matches[0]?.surveyId ?? null,
      surveyCount: matches.length,
      coveredFarmers: covered.size,
      totalFarmers: farm.farmerIds.length,
    };
  }

  // Encuestas atribuibles a la finca, directas o por inferencia.
  let inferredFarm = false;
  const farmSurveys = candidates.filter((s) => {
    if (s.farmId === farm.farmId) return true;
    if (
      s.farmId === null &&
      s.farmerId !== null &&
      farm.farmerIds.includes(s.farmerId) &&
      farmerFarmCounts[s.farmerId] === 1
    ) {
      inferredFarm = true;
      return true;
    }
    return false;
  });

  if (instrument.scopeLevel === 'farm') {
    return {
      status: farmSurveys.length ? 'aplicado' : 'falta',
      surveyId: farmSurveys[0]?.surveyId ?? null,
      surveyCount: farmSurveys.length,
      ...(inferredFarm && farmSurveys.length ? { inferredFarm: true } : {}),
    };
  }

  // farm_crop
  const applicable = farm.farmCrops.filter(
    (fc) =>
      instrument.cropIds.length === 0 || instrument.cropIds.includes(fc.cropId),
  );
  const applicableIds = new Set(applicable.map((fc) => fc.farmCropId));

  let inferredCrop = false;
  const coveredCrops = new Set<string>();
  const used: SurveyInput[] = [];
  const outOfScope: SurveyInput[] = [];
  for (const s of farmSurveys) {
    if (s.farmCropId === null) {
      if (applicable.length === 1) {
        coveredCrops.add(applicable[0].farmCropId);
        inferredCrop = true;
        used.push(s);
      }
    } else if (applicableIds.has(s.farmCropId)) {
      coveredCrops.add(s.farmCropId);
      used.push(s);
    } else {
      outOfScope.push(s);
    }
  }

  const base = {
    ...(inferredFarm && farmSurveys.length ? { inferredFarm: true } : {}),
  };

  if (coveredCrops.size > 0) {
    return {
      ...base,
      status: coveredCrops.size === applicable.length ? 'aplicado' : 'parcial',
      surveyId: used[0].surveyId,
      surveyCount: used.length,
      ...(inferredCrop ? { inferredCrop: true } : {}),
    };
  }
  if (outOfScope.length > 0) {
    return {
      ...base,
      status: 'aplicado',
      surveyId: outOfScope[0].surveyId,
      surveyCount: outOfScope.length,
      outOfScope: true,
    };
  }
  if (applicable.length === 0) {
    return {
      ...base,
      status: 'no_aplica',
      ...(farm.farmCrops.length === 0 ? { noRegisteredCrop: true } : {}),
    };
  }
  return { ...base, status: 'falta', surveyCount: 0 };
}
