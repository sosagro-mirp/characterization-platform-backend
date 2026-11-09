import { Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ConsentRecordsService } from '../consents/consent-records.service';
import { buildIndexes, CoverageDataLoader } from './coverage-data.loader';
import type {
  CoverageColumn,
  LoadedData,
  LoadedFarm,
} from './coverage-data.loader';
import type { SurveyInput } from './coverage-calculator';
import { toCoverageSnapshot } from './coverage-snapshot.mapper';
import type { CoverageSnapshot } from './coverage-snapshot.mapper';
import { computeFarmerCoverage } from './farmer-coverage-calculator';
import type {
  FarmerCoverageResult,
  FarmerCoverageSummary,
  FarmerFarmInput,
} from './farmer-coverage-calculator';

// Spec 100 — cobertura de instrumentos por productor. Solo lectura: se calcula
// al leer, nunca se guarda.

export interface FarmerCoverageRow {
  farmerId: string;
  name: string;
  documentId: string | null;
  primaryFarm: {
    farmId: string;
    name: string;
    town: { townId: string; name: string } | null;
    department: { departmentId: string; name: string } | null;
  } | null;
  farmsCount: number;
  cropIds: string[];
  hasPendingConsent: boolean;
  openDiscrepancies: number;
  summary: FarmerCoverageSummary;
  statusByInstrument: Record<string, string>;
  warnings: string[];
}

export interface FarmerCoverageList {
  instruments: CoverageColumn[];
  rows: FarmerCoverageRow[];
  summary: { farmers: number; withoutFarm: number; fullyCovered: number };
}

@Injectable()
export class FarmerCoverageService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly loader: CoverageDataLoader,
    private readonly consents: ConsentRecordsService,
  ) {}

  async getDetail(farmerId: string): Promise<FarmerCoverageResult> {
    const found = await this.dataSource.query<{ name: string }[]>(
      `SELECT name FROM farmers WHERE id = $1`,
      [farmerId],
    );
    if (!found.length) throw new NotFoundException('Farmer not found');
    const data = await this.loader.load({ farmerId });
    const farms = data.farms.filter((f) =>
      f.farmers.some((p) => p.farmerId === farmerId),
    );
    return computeFarmerCoverage(
      this.toInput(farmerId, found[0].name, farms, data, data.surveys),
    );
  }

  /** `maskPersonal` quita el documento: se usa con API keys (spec 98). */
  async getList(maskPersonal = false): Promise<FarmerCoverageList> {
    const { columns, entries } = await this.computeAll();
    const rows: FarmerCoverageRow[] = entries.map((e) => {
      const statusByInstrument: Record<string, string> = {};
      for (const i of e.result.instruments) {
        statusByInstrument[i.instrumentId] = i.status;
      }
      return {
        farmerId: e.person.id,
        name: e.person.name,
        documentId: maskPersonal ? null : e.person.document_id,
        primaryFarm: e.primary
          ? {
              farmId: e.primary.farmId,
              name: e.primary.farmName,
              town: e.primary.town,
              department: e.primary.department,
            }
          : null,
        farmsCount: e.farms.length,
        cropIds: [
          ...new Set(e.farms.flatMap((f) => f.crops.map((c) => c.cropId))),
        ],
        hasPendingConsent: e.hasPendingConsent,
        openDiscrepancies: e.openDiscrepancies,
        summary: e.result.summary,
        statusByInstrument,
        warnings: e.result.warnings,
      };
    });

    return {
      instruments: columns,
      rows,
      summary: {
        farmers: rows.length,
        withoutFarm: rows.filter((r) => r.farmsCount === 0).length,
        fullyCovered: rows.filter(
          (r) =>
            r.summary.applicable > 0 &&
            r.summary.applied === r.summary.applicable,
        ).length,
      },
    };
  }

  /** Spec 103 — foto compacta para la caché offline del móvil. */
  async getSnapshot(maskPersonal = false): Promise<CoverageSnapshot> {
    const { columns, entries } = await this.computeAll();
    return toCoverageSnapshot({
      computedAt: new Date().toISOString(),
      columns,
      maskPersonal,
      farmers: entries.map((e) => ({
        result: e.result,
        documentId: e.person.document_id,
        department: e.primary?.department ?? null,
        hasPendingConsent: e.hasPendingConsent,
      })),
    });
  }

  private async computeAll() {
    const [data, people, openRows] = await Promise.all([
      this.loader.load(),
      this.dataSource.query<
        { id: string; name: string; document_id: string | null }[]
      >(`SELECT id, name, document_id FROM farmers ORDER BY name`),
      this.dataSource.query<
        {
          discrepancy_id: string;
          farmer_id: string | null;
          farm_id: string | null;
        }[]
      >(
        `SELECT discrepancy_id, farmer_id, farm_id
           FROM entity_field_discrepancies WHERE status = 'open'`,
      ),
    ]);
    const consentPending = await this.consents.getPendingConsentMap(
      people.map((p) => p.id),
    );
    const idx = buildIndexes(data);

    const openByFarmer = new Map<string, Set<string>>();
    const openByFarm = new Map<string, Set<string>>();
    const add = (
      m: Map<string, Set<string>>,
      key: string | null,
      id: string,
    ) => {
      if (!key) return;
      const set = m.get(key) ?? new Set<string>();
      set.add(id);
      m.set(key, set);
    };
    for (const r of openRows) {
      add(openByFarmer, r.farmer_id, r.discrepancy_id);
      add(openByFarm, r.farm_id, r.discrepancy_id);
    }

    const entries = people.map((person) => {
      const farms = idx.farmsByFarmer.get(person.id) ?? [];
      const surveys = new Set<SurveyInput>();
      for (const s of idx.surveysByFarmer.get(person.id) ?? []) surveys.add(s);
      for (const f of farms) {
        for (const s of idx.surveysByFarm.get(f.farmId) ?? []) surveys.add(s);
        for (const p of f.farmers) {
          for (const s of idx.surveysByFarmer.get(p.farmerId) ?? []) {
            surveys.add(s);
          }
        }
      }
      const result = computeFarmerCoverage(
        this.toInput(person.id, person.name, farms, data, [...surveys]),
      );
      const open = new Set(openByFarmer.get(person.id) ?? []);
      for (const f of farms) {
        for (const id of openByFarm.get(f.farmId) ?? []) open.add(id);
      }
      return {
        person,
        farms,
        result,
        primary: this.primaryOf(person.id, farms),
        hasPendingConsent: consentPending.get(person.id) !== false,
        openDiscrepancies: open.size,
      };
    });
    return { columns: data.columns, entries };
  }

  private primaryOf(farmerId: string, farms: LoadedFarm[]) {
    return (
      farms.find((f) =>
        f.farmers.some((p) => p.farmerId === farmerId && p.isPrimary),
      ) ?? farms[0]
    );
  }

  private toInput(
    farmerId: string,
    name: string,
    farms: LoadedFarm[],
    data: LoadedData,
    surveys: SurveyInput[],
  ) {
    const linked: FarmerFarmInput[] = farms.map((f) => {
      const me = f.farmers.find((p) => p.farmerId === farmerId);
      return {
        farm: f.input,
        name: f.farmName,
        role: me?.role ?? null,
        isPrimary: me?.isPrimary ?? false,
        town: f.town,
        crops: f.crops,
      };
    });
    // Principal primero, como en la ficha.
    linked.sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary));
    return {
      farmerId,
      name,
      farms: linked,
      columns: data.columns,
      scoped: data.scoped,
      surveys,
      farmerFarmCounts: data.farmerFarmCounts,
      withoutScope: data.withoutScope,
    };
  }
}
