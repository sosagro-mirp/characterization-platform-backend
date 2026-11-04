import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash } from 'crypto';
import * as ExcelJS from 'exceljs';
import { DataSource, Repository } from 'typeorm';
import { isCountableSurvey } from '../coverage/coverage-calculator';
import {
  cellValue,
  NUMERIC_WITH_UNIT,
  questionHeaders,
  ResponseRow,
  uniqueHeaders,
  uniqueSheetName,
  unitCellValue,
} from './export-cells';
import { DataExportLog } from './entities/data-export-log.entity';
import {
  LoadedData,
  LoadedFarm,
  ProductionUnitsService,
  RawSurvey,
} from './production-units.service';

// Spec 98, Fase 5 — libro de Excel con lo filtrado en la vista. Reglas en
// `spec/98_exploracion_unidades_productivas.md`, sección "Excel".

const STATUS_LABEL: Record<string, string> = {
  aplicado: 'Aplicado',
  parcial: 'Parcial',
  falta: 'Falta',
  no_aplica: 'No aplica',
};

const SELECTION_LABEL: Record<string, string> = {
  included: 'Incluida',
  excluded: 'Excluida',
  in_review: 'En revisión',
};

const REASON_LABEL: Record<string, string> = {
  sin_productor: 'Sin productor',
  productor_sin_finca: 'Productor sin finca',
  productor_varias_fincas: 'Productor con varias fincas',
  cultivo_ambiguo: 'Finca con varios cultivos y encuesta sin cultivo',
};

interface ExportActor {
  userId: string | null;
  email: string;
}

interface QuestionMeta {
  questionId: string;
  instrumentId: string;
  sectionName: string;
  text: string;
  typeName: string;
  archived: boolean;
  options: string[];
}

export interface ExportResult {
  buffer: Buffer;
  rowCount: number;
}

interface FilterRange {
  from: { row: number; column: number };
  to: { row: number; column: number };
}

/**
 * Estira el autofiltro de cada hoja hasta su última fila. Las hojas se crean
 * vacías, y un rango que solo cubre el encabezado deja los desplegables de
 * Excel sin valores: las flechas aparecen pero no se puede filtrar nada.
 */
export function extendAutoFilters(wb: ExcelJS.Workbook): void {
  for (const ws of wb.worksheets) {
    const range = ws.autoFilter as FilterRange | string | undefined;
    if (!range || typeof range === 'string') continue;
    if (ws.rowCount <= range.to.row) continue;
    ws.autoFilter = {
      from: range.from,
      to: { row: ws.rowCount, column: range.to.column },
    };
  }
}

/**
 * Hoja con encabezado en negrita, fila fija y autofiltro provisional: la hoja
 * todavía no tiene filas, así que `extendAutoFilters` lo estira hasta la última
 * al cerrar el libro.
 */
export function addFilteredSheet(
  wb: ExcelJS.Workbook,
  name: string,
  header: string[],
): ExcelJS.Worksheet {
  const ws = wb.addWorksheet(name, {
    views: [{ state: 'frozen', ySplit: 1 }],
  });
  ws.addRow(header).font = { bold: true };
  ws.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: header.length },
  };
  ws.columns.forEach((c) => (c.width = 22));
  return ws;
}

@Injectable()
export class ProductionUnitsExportService {
  constructor(
    private readonly units: ProductionUnitsService,
    private readonly dataSource: DataSource,
    @InjectRepository(DataExportLog)
    private readonly logs: Repository<DataExportLog>,
  ) {}

  async export(
    farmIds: string[],
    filters: Record<string, unknown>,
    actor: ExportActor,
  ): Promise<ExportResult> {
    const data = await this.units.load();
    const wanted = new Set(farmIds);
    const farms = data.farms.filter((f) => wanted.has(f.farmId));
    if (farms.length !== wanted.size) {
      throw new BadRequestException('Una o más fincas no existen');
    }

    const buffer = await this.buildWorkbook(data, farms, filters, actor);
    const hash = createHash('sha256').update(buffer).digest('hex');
    await this.logs.save(
      this.logs.create({
        userId: actor.userId,
        userEmail: actor.email,
        exportType: 'production_units',
        filters,
        farmIds: farms.map((f) => f.farmId),
        rowCount: farms.length,
        fileSha256: hash,
      }),
    );
    return { buffer, rowCount: farms.length };
  }

  listLogs(limit = 200): Promise<DataExportLog[]> {
    return this.logs.find({ order: { createdAt: 'DESC' }, take: limit });
  }

  private async buildWorkbook(
    data: LoadedData,
    farms: LoadedFarm[],
    filters: Record<string, unknown>,
    actor: ExportActor,
  ): Promise<Buffer> {
    const wb = new ExcelJS.Workbook();
    wb.created = new Date();
    const rows = farms.map((f) => this.units.buildRow(f, data));
    const unlocated = this.units.findUnlocated(data);

    const pending = data.consentPending;
    const farmDetails = await this.farmDetails(farms.map((f) => f.farmId));

    // Unidades
    const unidades = this.sheet(wb, 'Unidades', [
      'Finca',
      'Departamento',
      'Municipio',
      'Vereda',
      'Cultivos',
      'Productores',
      'Documento',
      'Teléfono',
      'Rol',
      'Consentimiento',
      'Decisión',
      'Motivo de la decisión',
      'Área',
      'Altitud',
      'Latitud',
      'Longitud',
      'Total de encuestas',
      'Sin sincronizar con respuestas',
      'Avisos',
    ]);
    let pendingConsentRows = 0;
    farms.forEach((farm, i) => {
      const row = rows[i];
      const detail = farmDetails.get(farm.farmId);
      const consent = farm.farmers.map((p) =>
        pending.get(p.farmerId) === false ? 'Vigente' : 'Pendiente',
      );
      if (consent.includes('Pendiente')) pendingConsentRows += 1;
      unidades.addRow([
        farm.farmName,
        farm.department?.name ?? null,
        farm.town?.name ?? null,
        detail?.vereda ?? null,
        farm.crops.map((c) => c.name).join('; '),
        farm.farmers.map((p) => p.name).join('; '),
        farm.farmers.map((p) => p.documentId ?? '').join('; '),
        farm.farmers.map((p) => p.phone ?? '').join('; '),
        farm.farmers.map((p) => p.role ?? '').join('; '),
        consent.join('; '),
        row.selection ? SELECTION_LABEL[row.selection.status] : 'Sin decisión',
        row.selection?.reason ?? null,
        detail?.area ?? null,
        detail?.altitude ?? null,
        detail?.latitude ?? null,
        detail?.longitude ?? null,
        row.totalSurveys,
        row.unsyncedWithResponses,
        row.warnings.join('; '),
      ]);
    });

    // Cobertura
    const cobertura = this.sheet(wb, 'Cobertura', [
      'Finca',
      ...data.columns.map((c) => c.coverageGroup ?? c.code ?? c.name),
    ]);
    rows.forEach((row) => {
      cobertura.addRow([
        row.name,
        ...data.columns.map((c) => {
          const cell = row.coverage[c.instrumentId];
          const extra =
            cell.totalFarmers && cell.totalFarmers > 1
              ? ` (${cell.coveredFarmers} de ${cell.totalFarmers})`
              : '';
          const marks =
            cell.outOfScope || cell.inferredCrop || cell.inferredFarm
              ? '*'
              : '';
          const repeated =
            cell.surveyCount && cell.surveyCount > 1
              ? ` [${cell.surveyCount} encuestas]`
              : '';
          return `${STATUS_LABEL[cell.status]}${extra}${marks}${repeated}`;
        }),
      ]);
    });

    // Respuestas por instrumento
    const usedNames = new Set<string>([
      'Unidades',
      'Cobertura',
      'Sin ubicar',
      'Diccionario',
      'Metadatos',
    ]);
    const dictionary = this.sheet(wb, 'Diccionario', [
      'Instrumento',
      'Sección',
      'Pregunta',
      'Tipo',
      'Opciones',
    ]);
    const excludedByReason = await this.addResponseSheets(
      wb,
      data,
      farms,
      usedNames,
      dictionary,
    );

    // Sin ubicar
    const sin = this.sheet(wb, 'Sin ubicar', [
      'Encuesta',
      'Fecha',
      'Origen',
      'Encuestado',
      'Respuestas',
      'Motivo',
      'Instrumentos',
    ]);
    const instrumentName = new Map(
      (
        await this.dataSource.query<{ instrument_id: string; name: string }[]>(
          `SELECT instrument_id, name FROM instruments`,
        )
      ).map((i) => [i.instrument_id, i.name]),
    );
    for (const s of unlocated) {
      sin.addRow([
        s.surveyId,
        new Date(s.createdAt),
        s.origin === 'public' ? 'Pública' : 'Campo',
        s.respondentName,
        s.responseCount,
        REASON_LABEL[s.reason],
        s.instrumentIds.map((id) => instrumentName.get(id) ?? id).join('; '),
      ]);
    }

    // Metadatos
    const meta = wb.addWorksheet('Metadatos');
    meta.addRows([
      ['Generado', new Date()],
      ['Usuario', actor.email],
      ['Filtros de la vista', JSON.stringify(filters)],
      ['Fincas exportadas', farms.length],
      ['Fincas con consentimiento pendiente', pendingConsentRows],
      ['Encuestas sin ubicar', unlocated.length],
      [],
      ['Reglas'],
      [
        'Cuenta una encuesta sincronizada, con al menos una respuesta, de campo o pública procesada.',
      ],
      ['Con encuestas repetidas se usa la más reciente.'],
      ['El consentimiento se informa en una columna y no excluye filas.'],
      [
        'Solo salen hojas de respuestas de instrumentos con al menos una encuesta incluida.',
      ],
      ['Multimedia: solo el conteo de adjuntos, sin URL.'],
      [
        'En Cobertura, * marca una encuesta fuera de alcance o con cultivo/finca inferidos.',
      ],
      [],
      ['Encuestas excluidas (todas las del sistema, por motivo)'],
      ['No sincronizadas', excludedByReason.unsynced],
      ['Sin respuestas', excludedByReason.empty],
      ['Públicas sin procesar', excludedByReason.publicUnprocessed],
    ]);
    meta.getColumn(1).width = 60;
    meta.getColumn(2).width = 40;

    extendAutoFilters(wb);

    return Buffer.from(await wb.xlsx.writeBuffer());
  }

  private sheet(wb: ExcelJS.Workbook, name: string, header: string[]) {
    return addFilteredSheet(wb, name, header);
  }

  private async farmDetails(ids: string[]) {
    const rows = await this.dataSource.query<
      {
        farm_id: string;
        vereda: string | null;
        area: number | null;
        altitude: number | null;
        latitude: number | null;
        longitude: number | null;
      }[]
    >(
      `SELECT farm_id, vereda, area, altitude, latitude, longitude
         FROM farms WHERE farm_id = ANY($1::uuid[])`,
      [ids],
    );
    return new Map(rows.map((r) => [r.farm_id, r]));
  }

  /** Hoja de respuestas en formato ancho por cada instrumento con encuestas incluidas. */
  private async addResponseSheets(
    wb: ExcelJS.Workbook,
    data: LoadedData,
    farms: LoadedFarm[],
    usedNames: Set<string>,
    dictionary: ExcelJS.Worksheet,
  ) {
    const farmById = new Map(farms.map((f) => [f.farmId, f]));
    const farmOfFarmer = new Map<string, LoadedFarm>();
    for (const f of farms) {
      for (const p of f.farmers) {
        if (data.farmerFarmCounts[p.farmerId] === 1)
          farmOfFarmer.set(p.farmerId, f);
      }
    }

    // Más reciente por (instrumento, clave de fila).
    interface Pick {
      survey: RawSurvey;
      farm: LoadedFarm;
      farmerName?: string;
      cropName?: string;
    }
    const picks = new Map<string, Map<string, Pick>>();
    const sorted = [...data.rawSurveys]
      .filter(isCountable)
      .sort((a, b) => a.created_at.getTime() - b.created_at.getTime());
    for (const s of sorted) {
      for (const instrumentId of s.instrument_ids ?? []) {
        const scoped = data.scoped.find((i) => i.instrumentId === instrumentId);
        const level = scoped?.scopeLevel ?? 'farm';
        // Solo atribución directa o por productor de una sola finca; un
        // productor con varias fincas no se reparte arbitrariamente (va a
        // "Sin ubicar"). Excepción: a nivel productor la fila es del
        // productor, así que cualquier finca suya filtrada sirve de contexto.
        const farm =
          (s.farm_id ? farmById.get(s.farm_id) : undefined) ??
          (s.farmer_id ? farmOfFarmer.get(s.farmer_id) : undefined) ??
          (level === 'farmer' && s.farmer_id
            ? farms.find((f) =>
                f.farmers.some((p) => p.farmerId === s.farmer_id),
              )
            : undefined);
        if (!farm) continue;
        let key: string;
        let farmerName: string | undefined;
        let cropName: string | undefined;
        if (level === 'farmer') {
          key = s.farmer_id ?? s.survey_id;
          farmerName = farm.farmers.find(
            (p) => p.farmerId === s.farmer_id,
          )?.name;
        } else if (level === 'farm_crop') {
          const crop = farm.crops.find((c) => c.farmCropId === s.farm_crop_id);
          key = `${farm.farmId}|${s.farm_crop_id ?? ''}`;
          cropName = crop?.name;
        } else {
          key = farm.farmId;
        }
        const byKey = picks.get(instrumentId) ?? new Map<string, Pick>();
        byKey.set(key, { survey: s, farm, farmerName, cropName });
        picks.set(instrumentId, byKey);
      }
    }

    const excluded = {
      unsynced: data.rawSurveys.filter((s) => !s.sincronized).length,
      empty: data.rawSurveys.filter((s) => s.response_count === 0).length,
      publicUnprocessed: data.rawSurveys.filter(
        (s) => s.origin === 'public' && s.review_status !== 'processed',
      ).length,
    };
    if (picks.size === 0) return excluded;

    const instrumentIds = [...picks.keys()];
    const surveyIds = [
      ...new Set(
        [...picks.values()].flatMap((m) =>
          [...m.values()].map((p) => p.survey.survey_id),
        ),
      ),
    ];

    const instruments = await this.dataSource.query<
      { instrument_id: string; name: string; code: string | null }[]
    >(
      `SELECT instrument_id, name, code FROM instruments WHERE instrument_id = ANY($1::uuid[])`,
      [instrumentIds],
    );

    const questions = await this.dataSource.query<
      {
        question_id: string;
        instrument_id: string;
        section_name: string;
        text: string;
        type_name: string;
        archived: boolean;
        options: string[] | null;
      }[]
    >(
      `SELECT q.question_id, s.instrument_id, s.name AS section_name, q.text,
              t.name AS type_name, (q.archived_at IS NOT NULL) AS archived,
              (SELECT array_agg(o.text ORDER BY o.created_at) FROM options_question o
                WHERE o.question_id = q.question_id) AS options
         FROM questions q
         JOIN sections s ON s.section_id = q.section_id
         JOIN types_of_questions t ON t.type_id = q.type_id
        WHERE s.instrument_id = ANY($1::uuid[])
        ORDER BY s.instrument_id, s."order", q."order"`,
      [instrumentIds],
    );

    const responses = await this.dataSource.query<ResponseRow[]>(
      `SELECT r.survey_id, r.question_id, r.text_value, r.numeric_value,
              r.boolean_value, o.text AS option_text, o.is_other
         FROM responses r
         LEFT JOIN options_question o ON o.option_id = r.option_id
        WHERE r.survey_id = ANY($1::uuid[])`,
      [surveyIds],
    );
    const bySurvey = new Map<string, Map<string, ResponseRow[]>>();
    for (const r of responses) {
      const m = bySurvey.get(r.survey_id) ?? new Map<string, ResponseRow[]>();
      m.set(r.question_id, [...(m.get(r.question_id) ?? []), r]);
      bySurvey.set(r.survey_id, m);
    }

    const attachments = await this.dataSource.query<
      { survey_id: string; question_id: string; n: number }[]
    >(
      `SELECT survey_id, question_id, count(*)::int AS n FROM media_attachments
        WHERE survey_id = ANY($1::uuid[]) GROUP BY 1, 2`,
      [surveyIds],
    );
    const attachCount = new Map(
      attachments.map((a) => [`${a.survey_id}|${a.question_id}`, a.n]),
    );

    for (const instrument of instruments) {
      const qs: QuestionMeta[] = questions
        .filter((q) => q.instrument_id === instrument.instrument_id)
        .map((q) => ({
          questionId: q.question_id,
          instrumentId: q.instrument_id,
          sectionName: q.section_name,
          text: q.text,
          typeName: q.type_name,
          archived: q.archived,
          options: q.options ?? [],
        }));
      const used = [...picks.get(instrument.instrument_id)!.values()];
      const visible = qs.filter(
        (q) =>
          !q.archived ||
          used.some((p) => bySurvey.get(p.survey.survey_id)?.has(q.questionId)),
      );

      const name = uniqueSheetName(
        instrument.code ?? instrument.name,
        usedNames,
      );
      const header = [
        'Finca',
        'Departamento',
        'Municipio',
        'Productor',
        'Cultivo',
        'Encuesta',
        'Fecha',
        ...uniqueHeaders(questionHeaders(visible)),
      ];
      const ws = this.sheet(wb, name, header);
      for (const p of used) {
        const answers = bySurvey.get(p.survey.survey_id);
        ws.addRow([
          p.farm.farmName,
          p.farm.department?.name ?? null,
          p.farm.town?.name ?? null,
          p.farmerName ?? p.farm.farmers.map((f) => f.name).join('; '),
          p.cropName ?? null,
          p.survey.survey_id,
          p.survey.created_at,
          ...visible.flatMap((q) => {
            const rows = answers?.get(q.questionId) ?? [];
            const value = cellValue(
              q,
              rows,
              attachCount.get(`${p.survey.survey_id}|${q.questionId}`) ?? 0,
            );
            return q.typeName === NUMERIC_WITH_UNIT
              ? [value, unitCellValue(rows)]
              : [value];
          }),
        ]);
      }

      for (const q of qs) {
        dictionary.addRow([
          instrument.name,
          q.sectionName,
          q.text,
          q.typeName,
          q.options.join('; '),
        ]);
      }
    }
    return excluded;
  }
}

function isCountable(s: RawSurvey): boolean {
  return isCountableSurvey({
    surveyId: s.survey_id,
    instrumentId: '',
    farmerId: s.farmer_id,
    farmId: s.farm_id,
    farmCropId: s.farm_crop_id,
    sincronized: s.sincronized,
    origin: s.origin,
    reviewStatus: s.review_status,
    responseCount: Number(s.response_count),
    createdAt: s.created_at.toISOString(),
  });
}
