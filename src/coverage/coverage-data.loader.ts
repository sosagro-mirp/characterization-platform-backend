import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ConsentRecordsService } from '../consents/consent-records.service';
import type {
  FarmInput,
  ScopedInstrument,
  SurveyInput,
} from './coverage-calculator';

// Spec 100 — cargador de datos de cobertura, extraído de
// `ProductionUnitsService.load()` (spec 98) para que lo compartan la vista de
// unidades productivas y la cobertura por productor. Solo lectura.

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

/** Decisión vigente de la selección (spec 99); `null` = sin decisión. */
export interface RowSelection {
  status: 'included' | 'excluded' | 'in_review';
  reason: string;
  version: number;
  updatedAt: string;
}

export interface RawSurvey {
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

export interface LoadedFarm {
  farmId: string;
  farmName: string;
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
  input: FarmInput;
}

export interface LoadedData {
  farms: LoadedFarm[];
  columns: CoverageColumn[];
  scoped: ScopedInstrument[];
  surveys: SurveyInput[];
  rawSurveys: RawSurvey[];
  farmerFarmCounts: Record<string, number>;
  /** farmerId → true si su consentimiento está pendiente (false = vigente). */
  consentPending: Map<string, boolean>;
  /** farmId → decisión vigente de la selección (spec 99). */
  selections: Map<string, RowSelection>;
  withoutScope: number;
}

export interface LoadOptions {
  /**
   * Acota la carga a las fincas de un productor, a los productores que las
   * comparten y a sus encuestas. `farmerFarmCounts` sigue contando todas las
   * fincas de cada productor involucrado (no solo las cargadas).
   */
  farmerId?: string;
}

/** Datos preindexados para la lista por productor (sin recorrer todo N veces). */
export interface CoverageIndexes {
  farmById: Map<string, LoadedFarm>;
  /** farmerId → fincas vinculadas, en orden de carga. */
  farmsByFarmer: Map<string, LoadedFarm[]>;
  /** farmerId → encuestas por instrumento (una entrada por encuesta × instrumento). */
  surveysByFarmer: Map<string, SurveyInput[]>;
  /** farmId → encuestas por instrumento. */
  surveysByFarm: Map<string, SurveyInput[]>;
  rawByFarmer: Map<string, RawSurvey[]>;
}

export function surveyToInput(s: RawSurvey, instrumentId: string): SurveyInput {
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

export function buildIndexes(data: LoadedData): CoverageIndexes {
  const farmById = new Map(data.farms.map((f) => [f.farmId, f]));
  const farmsByFarmer = new Map<string, LoadedFarm[]>();
  for (const f of data.farms) {
    for (const p of f.farmers) {
      const list = farmsByFarmer.get(p.farmerId) ?? [];
      list.push(f);
      farmsByFarmer.set(p.farmerId, list);
    }
  }
  const push = <T>(m: Map<string, T[]>, key: string | null, v: T) => {
    if (!key) return;
    const list = m.get(key) ?? [];
    list.push(v);
    m.set(key, list);
  };
  const surveysByFarmer = new Map<string, SurveyInput[]>();
  const surveysByFarm = new Map<string, SurveyInput[]>();
  for (const s of data.surveys) {
    push(surveysByFarmer, s.farmerId, s);
    push(surveysByFarm, s.farmId, s);
  }
  const rawByFarmer = new Map<string, RawSurvey[]>();
  for (const s of data.rawSurveys) push(rawByFarmer, s.farmer_id, s);
  return {
    farmById,
    farmsByFarmer,
    surveysByFarmer,
    surveysByFarm,
    rawByFarmer,
  };
}

@Injectable()
export class CoverageDataLoader {
  constructor(
    private readonly dataSource: DataSource,
    private readonly consents: ConsentRecordsService,
  ) {}

  async load(options: LoadOptions = {}): Promise<LoadedData> {
    const q = <T>(sql: string, params: unknown[] = []) =>
      this.dataSource.query<T[]>(sql, params);

    // Modo productor: resolver primero las fincas y los productores involucrados.
    let farmIds: string[] | null = null;
    let involvedFarmers: string[] | null = null;
    if (options.farmerId) {
      const mine = await q<{ farm_id: string }>(
        `SELECT farm_id FROM farmer_farms WHERE farmer_id = $1`,
        [options.farmerId],
      );
      farmIds = mine.map((r) => r.farm_id);
      const people = farmIds.length
        ? await q<{ farmer_id: string }>(
            `SELECT DISTINCT farmer_id FROM farmer_farms WHERE farm_id = ANY($1::uuid[])`,
            [farmIds],
          )
        : [];
      involvedFarmers = [
        ...new Set([options.farmerId, ...people.map((r) => r.farmer_id)]),
      ];
    }
    const byFarm = farmIds ? `WHERE f.farm_id = ANY($1::uuid[])` : '';
    const farmParams = farmIds ? [farmIds] : [];

    const [
      farmRows,
      farmerRows,
      cropRows,
      surveyRows,
      instrumentRows,
      selectionRows,
      countRows,
    ] = await Promise.all([
      q<{
        farm_id: string;
        name: string;
        town_id: string | null;
        town_name: string | null;
        department_id: string | null;
        department_name: string | null;
      }>(
        `SELECT f.farm_id, f.name, t.town_id, t.name AS town_name,
                   d.department_id, d.name AS department_name
              FROM farms f
              LEFT JOIN towns t ON t.town_id = f.town_id
              LEFT JOIN departments d ON d.department_id = t.department_id
              ${byFarm}
             ORDER BY f.name`,
        farmParams,
      ),
      q<{
        farm_id: string;
        farmer_id: string;
        name: string;
        document_id: string | null;
        phone: string | null;
        role: string | null;
        is_primary: boolean;
      }>(
        `SELECT ff.farm_id, ff.farmer_id, fr.name, fr.document_id, fr.phone,
                   ff.role, ff.is_primary
              FROM farmer_farms ff
              JOIN farmers fr ON fr.id = ff.farmer_id
              ${farmIds ? 'WHERE ff.farm_id = ANY($1::uuid[])' : ''}
             ORDER BY ff.is_primary DESC, fr.name`,
        farmParams,
      ),
      q<{
        farm_id: string;
        farm_crop_id: string;
        crop_id: string;
        name: string;
      }>(
        `SELECT fc.farm_id, fc.farm_crop_id, fc.crop_id, c.name
              FROM farms_crops fc
              JOIN types_of_crops c ON c.crop_id = fc.crop_id
             WHERE fc.archived_at IS NULL
               ${farmIds ? 'AND fc.farm_id = ANY($1::uuid[])' : ''}
             ORDER BY c.name`,
        farmParams,
      ),
      q<RawSurvey>(
        `SELECT s.survey_id, s.farmer_id, s.farm_id, s.farm_crop_id,
                   s.sincronized, s.origin, s.review_status, s.respondent_name,
                   s.created_at,
                   (SELECT count(*)::int FROM responses r
                     WHERE r.survey_id = s.survey_id) AS response_count,
                   (SELECT array_agg(si.instrument_id)
                      FROM surveys_instruments si
                     WHERE si.survey_id = s.survey_id) AS instrument_ids
              FROM surveys s
              ${
                farmIds
                  ? 'WHERE s.farmer_id = ANY($1::uuid[]) OR s.farm_id = ANY($2::uuid[])'
                  : ''
              }`,
        farmIds ? [involvedFarmers, farmIds] : [],
      ),
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
      q<{
        farm_id: string;
        status: RowSelection['status'];
        reason: string;
        version: number;
        updated_at: Date;
      }>(
        `SELECT farm_id, status, reason, version, updated_at FROM farm_selections`,
      ),
      // Fincas totales de cada productor (no solo las cargadas).
      involvedFarmers
        ? q<{ farmer_id: string; n: number }>(
            `SELECT farmer_id, count(*)::int AS n FROM farmer_farms
              WHERE farmer_id = ANY($1::uuid[]) GROUP BY farmer_id`,
            [involvedFarmers],
          )
        : Promise.resolve(null),
    ]);

    const selections = new Map<string, RowSelection>(
      selectionRows.map((r) => [
        r.farm_id,
        {
          status: r.status,
          reason: r.reason,
          version: r.version,
          updatedAt: r.updated_at.toISOString(),
        },
      ]),
    );

    const farmerFarmCounts: Record<string, number> = {};
    if (countRows) {
      for (const r of countRows) farmerFarmCounts[r.farmer_id] = Number(r.n);
    } else {
      for (const r of farmerRows) {
        farmerFarmCounts[r.farmer_id] =
          (farmerFarmCounts[r.farmer_id] ?? 0) + 1;
      }
    }

    const farmersByFarm = new Map<string, typeof farmerRows>();
    for (const r of farmerRows) {
      const list = farmersByFarm.get(r.farm_id) ?? [];
      list.push(r);
      farmersByFarm.set(r.farm_id, list);
    }
    const cropsByFarm = new Map<string, typeof cropRows>();
    for (const c of cropRows) {
      const list = cropsByFarm.get(c.farm_id) ?? [];
      list.push(c);
      cropsByFarm.set(c.farm_id, list);
    }

    const farms: LoadedFarm[] = farmRows.map((f) => {
      const farmers = farmersByFarm.get(f.farm_id) ?? [];
      const crops = cropsByFarm.get(f.farm_id) ?? [];
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
        surveys.push(surveyToInput(s, instrumentId));
      }
    }

    const consentPending = await this.consents.getPendingConsentMap(
      Object.keys(farmerFarmCounts),
    );

    return {
      farms,
      columns,
      scoped,
      surveys,
      rawSurveys: surveyRows,
      farmerFarmCounts,
      consentPending,
      selections,
      withoutScope: instrumentRows.filter(
        (i) => i.is_active && i.scope_level === null,
      ).length,
    };
  }
}
