import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ProductionUnitsService } from '../production-units/production-units.service';
import type { SelectionStatus } from './entities/farm-selection.entity';
import { SELECTION_STATUSES } from './entities/farm-selection.entity';

// Spec 99 — decisión humana sobre cada finca (incluida / excluida / en revisión),
// con motivo y un historial inalterable. El sistema no evalúa criterios.

/** Meta de unidades productivas del proyecto. Aviso, no tope (spec 99). */
export const SELECTION_TARGET = 40;

export interface SelectionState {
  farmId: string;
  status: SelectionStatus;
  reason: string;
  version: number;
  updatedAt: Date;
}

export interface SelectionEventView {
  fromStatus: SelectionStatus | null;
  toStatus: SelectionStatus;
  reason: string;
  userName: string;
  createdAt: Date;
  coverageSnapshot: unknown;
}

type StatusCounts = Record<SelectionStatus, number>;

export interface SelectionSummary {
  target: number;
  /** Fincas por estado; cada finca cuenta una sola vez. `none` = sin decisión. */
  total: StatusCounts & { none: number };
  byCrop: ({ cropId: string; name: string } & StatusCounts)[];
  byDepartment: ({
    departmentId: string | null;
    name: string;
  } & StatusCounts)[];
}

const emptyCounts = (): StatusCounts => ({
  included: 0,
  excluded: 0,
  in_review: 0,
});

@Injectable()
export class UnitSelectionsService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly units: ProductionUnitsService,
  ) {}

  async set(
    farmId: string,
    dto: { status: SelectionStatus; reason: string; expectedVersion: number },
    actor: { userId: string | null },
  ): Promise<SelectionState> {
    // La cobertura se calcula antes de abrir la transacción (lee mucho) y
    // lanza 404 si la finca no existe.
    const coverage = await this.units.getFarmCoverage(farmId);
    const userName = await this.userName(actor.userId);

    return this.dataSource.transaction(async (manager) => {
      const [current] = await manager.query<
        { status: SelectionStatus; version: number }[]
      >(
        `SELECT status, version FROM farm_selections WHERE farm_id = $1 FOR UPDATE`,
        [farmId],
      );
      const currentVersion = current?.version ?? 0;
      if (currentVersion !== dto.expectedVersion) {
        throw new ConflictException(
          'La decisión cambió mientras se editaba. Recarga y vuelve a intentar.',
        );
      }

      let rows: SelectionState[];
      if (current) {
        rows = await manager.query<SelectionState[]>(
          `UPDATE farm_selections
              SET status = $2, reason = $3, version = version + 1,
                  updated_by = $4, updated_at = now()
            WHERE farm_id = $1
        RETURNING farm_id AS "farmId", status, reason, version,
                  updated_at AS "updatedAt"`,
          [farmId, dto.status, dto.reason, actor.userId],
        );
      } else {
        // Dos primeras decisiones simultáneas: la PK rechaza la segunda.
        rows = await manager
          .query<SelectionState[]>(
            `INSERT INTO farm_selections (farm_id, status, reason, version, updated_by)
             VALUES ($1, $2, $3, 1, $4)
          RETURNING farm_id AS "farmId", status, reason, version,
                    updated_at AS "updatedAt"`,
            [farmId, dto.status, dto.reason, actor.userId],
          )
          .catch((error: unknown) => {
            if (isUniqueViolation(error)) {
              throw new ConflictException(
                'La decisión cambió mientras se editaba. Recarga y vuelve a intentar.',
              );
            }
            throw error;
          });
      }

      await manager.query(
        `INSERT INTO farm_selection_events
           (farm_id, from_status, to_status, reason, user_id, user_name, coverage_snapshot)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
        [
          farmId,
          current?.status ?? null,
          dto.status,
          dto.reason,
          actor.userId,
          userName,
          JSON.stringify(coverage.instruments),
        ],
      );
      return rows[0];
    });
  }

  async history(farmId: string): Promise<SelectionEventView[]> {
    const [farm] = await this.dataSource.query<{ farm_id: string }[]>(
      `SELECT farm_id FROM farms WHERE farm_id = $1`,
      [farmId],
    );
    if (!farm) throw new NotFoundException('Farm not found');
    return this.dataSource.query<SelectionEventView[]>(
      `SELECT from_status AS "fromStatus", to_status AS "toStatus", reason,
              user_name AS "userName", created_at AS "createdAt",
              coverage_snapshot AS "coverageSnapshot"
         FROM farm_selection_events
        WHERE farm_id = $1
        ORDER BY created_at DESC, event_id DESC`,
      [farmId],
    );
  }

  async summary(): Promise<SelectionSummary> {
    const q = <T>(sql: string) => this.dataSource.query<T[]>(sql);
    const [farmCount, totals, byCrop, byDepartment] = await Promise.all([
      q<{ n: number }>(`SELECT count(*)::int AS n FROM farms`),
      q<{ status: SelectionStatus; n: number }>(
        `SELECT status, count(*)::int AS n FROM farm_selections GROUP BY status`,
      ),
      // Una finca con dos cultivos aparece en cada uno; el total no lo repite.
      q<{ cropId: string; name: string; status: SelectionStatus; n: number }>(
        `SELECT c.crop_id AS "cropId", c.name, s.status, count(DISTINCT s.farm_id)::int AS n
           FROM farm_selections s
           JOIN farms_crops fc ON fc.farm_id = s.farm_id AND fc.archived_at IS NULL
           JOIN types_of_crops c ON c.crop_id = fc.crop_id
          GROUP BY c.crop_id, c.name, s.status`,
      ),
      q<{
        departmentId: string | null;
        name: string | null;
        status: SelectionStatus;
        n: number;
      }>(
        `SELECT d.department_id AS "departmentId", d.name, s.status, count(*)::int AS n
           FROM farm_selections s
           JOIN farms f ON f.farm_id = s.farm_id
           LEFT JOIN towns t ON t.town_id = f.town_id
           LEFT JOIN departments d ON d.department_id = t.department_id
          GROUP BY d.department_id, d.name, s.status`,
      ),
    ]);

    const total = { ...emptyCounts(), none: 0 };
    for (const r of totals) total[r.status] = r.n;
    total.none =
      farmCount[0].n -
      SELECTION_STATUSES.reduce((sum, status) => sum + total[status], 0);

    const cropMap = new Map<string, SelectionSummary['byCrop'][number]>();
    for (const r of byCrop) {
      const entry = cropMap.get(r.cropId) ?? {
        cropId: r.cropId,
        name: r.name,
        ...emptyCounts(),
      };
      entry[r.status] = r.n;
      cropMap.set(r.cropId, entry);
    }
    const deptMap = new Map<string, SelectionSummary['byDepartment'][number]>();
    for (const r of byDepartment) {
      const key = r.departmentId ?? 'none';
      const entry = deptMap.get(key) ?? {
        departmentId: r.departmentId,
        name: r.name ?? 'Sin departamento',
        ...emptyCounts(),
      };
      entry[r.status] = r.n;
      deptMap.set(key, entry);
    }
    return {
      target: SELECTION_TARGET,
      total,
      byCrop: [...cropMap.values()].sort((a, b) =>
        a.name.localeCompare(b.name),
      ),
      byDepartment: [...deptMap.values()].sort((a, b) =>
        a.name.localeCompare(b.name),
      ),
    };
  }

  /** Decisión vigente por finca, para la vista y el Excel. */
  async currentByFarm(): Promise<Map<string, SelectionState>> {
    const rows = await this.dataSource.query<SelectionState[]>(
      `SELECT farm_id AS "farmId", status, reason, version, updated_at AS "updatedAt"
         FROM farm_selections`,
    );
    return new Map(rows.map((r) => [r.farmId, r]));
  }

  private async userName(userId: string | null): Promise<string> {
    if (!userId) return 'Desconocido';
    const [user] = await this.dataSource.query<
      { name: string; last_name: string | null }[]
    >(`SELECT name, last_name FROM users WHERE user_id = $1`, [userId]);
    return user
      ? [user.name, user.last_name].filter(Boolean).join(' ')
      : 'Desconocido';
  }
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === '23505'
  );
}
