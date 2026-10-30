import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash } from 'crypto';
import * as ExcelJS from 'exceljs';
import { DataSource, Repository } from 'typeorm';
import { DataExportLog } from '../production-units/entities/data-export-log.entity';
import {
  addFilteredSheet,
  extendAutoFilters,
} from '../production-units/production-units-export.service';
import type { SelectionStatus } from './entities/farm-selection.entity';
import { SELECTION_TARGET } from './unit-selections.service';

// Spec 99, Fase 3 — Excel del resultado de la selección: decisiones con motivo
// e historial completo. Se registra en `data_export_logs` como en el spec 98.

export const SELECTION_STATUS_LABEL: Record<SelectionStatus, string> = {
  included: 'Incluida',
  excluded: 'Excluida',
  in_review: 'En revisión',
};

interface ExportActor {
  userId: string | null;
  email: string;
}

interface DecisionRow {
  farm_id: string;
  farm_name: string;
  department: string | null;
  town: string | null;
  crops: string | null;
  farmers: string | null;
  status: SelectionStatus;
  reason: string;
  version: number;
  updated_at: Date;
}

interface EventRow {
  farm_name: string;
  created_at: Date;
  from_status: SelectionStatus | null;
  to_status: SelectionStatus;
  reason: string;
  user_name: string;
}

@Injectable()
export class UnitSelectionsExportService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(DataExportLog)
    private readonly logs: Repository<DataExportLog>,
  ) {}

  async export(
    filters: Record<string, unknown>,
    actor: ExportActor,
  ): Promise<{ buffer: Buffer; rowCount: number }> {
    const decisions = await this.dataSource.query<DecisionRow[]>(
      `SELECT s.farm_id, f.name AS farm_name, d.name AS department, t.name AS town,
              (SELECT string_agg(c.name, '; ' ORDER BY c.name)
                 FROM farms_crops fc JOIN types_of_crops c ON c.crop_id = fc.crop_id
                WHERE fc.farm_id = s.farm_id AND fc.archived_at IS NULL) AS crops,
              (SELECT string_agg(fr.name, '; ' ORDER BY ff.is_primary DESC, fr.name)
                 FROM farmer_farms ff JOIN farmers fr ON fr.id = ff.farmer_id
                WHERE ff.farm_id = s.farm_id) AS farmers,
              s.status, s.reason, s.version, s.updated_at
         FROM farm_selections s
         JOIN farms f ON f.farm_id = s.farm_id
         LEFT JOIN towns t ON t.town_id = f.town_id
         LEFT JOIN departments d ON d.department_id = t.department_id
        ORDER BY f.name`,
    );
    const events = await this.dataSource.query<EventRow[]>(
      `SELECT f.name AS farm_name, e.created_at, e.from_status, e.to_status,
              e.reason, e.user_name
         FROM farm_selection_events e
         JOIN farms f ON f.farm_id = e.farm_id
        ORDER BY f.name, e.created_at DESC, e.event_id DESC`,
    );
    const [{ n: farmCount }] = await this.dataSource.query<{ n: number }[]>(
      `SELECT count(*)::int AS n FROM farms`,
    );

    const buffer = await this.buildWorkbook(
      decisions,
      events,
      farmCount,
      filters,
      actor,
    );
    await this.logs.save(
      this.logs.create({
        userId: actor.userId,
        userEmail: actor.email,
        exportType: 'unit_selection',
        filters,
        farmIds: decisions.map((d) => d.farm_id),
        rowCount: decisions.length,
        fileSha256: createHash('sha256').update(buffer).digest('hex'),
      }),
    );
    return { buffer, rowCount: decisions.length };
  }

  private async buildWorkbook(
    decisions: DecisionRow[],
    events: EventRow[],
    farmCount: number,
    filters: Record<string, unknown>,
    actor: ExportActor,
  ): Promise<Buffer> {
    const wb = new ExcelJS.Workbook();
    wb.created = new Date();

    const sheet = addFilteredSheet(wb, 'Decisiones', [
      'Finca',
      'Departamento',
      'Municipio',
      'Cultivos',
      'Productores',
      'Decisión',
      'Motivo',
      'Versión',
      'Actualizada',
    ]);
    for (const d of decisions) {
      sheet.addRow([
        d.farm_name,
        d.department,
        d.town,
        d.crops,
        d.farmers,
        SELECTION_STATUS_LABEL[d.status],
        d.reason,
        d.version,
        d.updated_at,
      ]);
    }

    const history = addFilteredSheet(wb, 'Historial', [
      'Finca',
      'Fecha',
      'Estado anterior',
      'Estado nuevo',
      'Motivo',
      'Usuario',
    ]);
    for (const e of events) {
      history.addRow([
        e.farm_name,
        e.created_at,
        e.from_status ? SELECTION_STATUS_LABEL[e.from_status] : 'Sin decisión',
        SELECTION_STATUS_LABEL[e.to_status],
        e.reason,
        e.user_name,
      ]);
    }

    const included = decisions.filter((d) => d.status === 'included').length;
    const meta = wb.addWorksheet('Metadatos');
    meta.addRows([
      ['Generado', new Date()],
      ['Usuario', actor.email],
      ['Filtros de la vista', JSON.stringify(filters)],
      ['Meta de unidades productivas', SELECTION_TARGET],
      ['Incluidas', included],
      ['Excluidas', decisions.filter((d) => d.status === 'excluded').length],
      ['En revisión', decisions.filter((d) => d.status === 'in_review').length],
      ['Sin decisión', farmCount - decisions.length],
      [],
      [
        'Solo salen las fincas con alguna decisión; "Sin decisión" se cuenta aquí.',
      ],
      ['El historial conserva cada cambio, del más reciente al más antiguo.'],
    ]);
    meta.getColumn(1).width = 60;
    meta.getColumn(2).width = 40;

    extendAutoFilters(wb);
    return Buffer.from(await wb.xlsx.writeBuffer());
  }
}
