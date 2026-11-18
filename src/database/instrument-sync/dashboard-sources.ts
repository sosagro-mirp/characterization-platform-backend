import { DataSource, EntityManager } from 'typeorm';

/**
 * Spec 108 (R4) — `dashboard_chart_sources.question_id` es CASCADE hacia
 * `questions`, así que vaciar las preguntas en `snapshot()` arrastraría las
 * fuentes de los gráficos del constructor. Aquí se guardan antes del borrado
 * y se restauran después: las que conservan su UUID se reinsertan tal cual y
 * las demás se reconstruyen por huella (código de instrumento + texto exacto).
 */
export interface SavedChartSource {
  source_id: string;
  chart_id: string;
  question_id: string;
  series_key: string;
  series_label: string;
  series_position: number;
  is_representative: boolean;
  instrument_code_snapshot: string | null;
  question_text_snapshot: string;
}

export interface DashboardSourcesRestoreReport {
  kept: number;
  rebuilt: number;
  unresolved: SavedChartSource[];
}

export async function saveDashboardSources(
  ds: DataSource,
): Promise<SavedChartSource[]> {
  const exists = await ds.query<{ t: string | null }[]>(
    `SELECT to_regclass('public.dashboard_chart_sources') AS t`,
  );
  if (!exists[0]?.t) return [];
  return ds.query<SavedChartSource[]>(`SELECT * FROM dashboard_chart_sources`);
}

export async function restoreDashboardSources(
  manager: EntityManager,
  saved: SavedChartSource[],
): Promise<DashboardSourcesRestoreReport> {
  const report: DashboardSourcesRestoreReport = {
    kept: 0,
    rebuilt: 0,
    unresolved: [],
  };
  for (const s of saved) {
    // El gráfico pudo no existir ya (tablas de gráficos no se vacían, pero se cubre).
    const byUuid = await manager.query<{ question_id: string }[]>(
      `SELECT question_id FROM questions WHERE question_id = $1`,
      [s.question_id],
    );
    let questionId: string | null = byUuid[0]?.question_id ?? null;
    let rebuilt = false;
    if (!questionId) {
      const byFingerprint = await manager.query<{ question_id: string }[]>(
        `SELECT q.question_id
           FROM questions q
           JOIN sections sc ON sc.section_id = q.section_id
           JOIN instruments i ON i.instrument_id = sc.instrument_id
          WHERE q.text = $1 AND i.code IS NOT DISTINCT FROM $2`,
        [s.question_text_snapshot, s.instrument_code_snapshot],
      );
      // Solo se reconstruye si la huella es inequívoca.
      if (byFingerprint.length === 1) {
        questionId = byFingerprint[0].question_id;
        rebuilt = true;
      }
    }
    if (!questionId) {
      report.unresolved.push(s);
      continue;
    }
    await manager.query(
      `INSERT INTO dashboard_chart_sources
         (source_id, chart_id, question_id, series_key, series_label,
          series_position, is_representative, instrument_code_snapshot,
          question_text_snapshot)
       VALUES (gen_random_uuid(),$1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (chart_id, question_id) DO NOTHING`,
      [
        s.chart_id,
        questionId,
        s.series_key,
        s.series_label,
        s.series_position,
        s.is_representative,
        s.instrument_code_snapshot,
        s.question_text_snapshot,
      ],
    );
    if (rebuilt) report.rebuilt++;
    else report.kept++;
  }
  return report;
}
