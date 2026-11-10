import { MigrationInterface, QueryRunner } from 'typeorm';
import { resolveCropsFromResponses } from '../surveys/crop-extraction';
import { pickFarmCrop } from '../farmer-farms/pick-farm-crop';

// Spec 94 (H3a), migración 4 — backfill de los anclajes (D5: backfill y
// conservar). Solo DATOS: ninguna tabla de campañas se toca más allá de
// completar `campaign_sessions.farmer_id`, y ninguna fila se borra.
//
// Todo valor que se escribe sobre una fila existente queda registrado con su
// valor previo en `spec94_backfill_audit`, así el `down` devuelve exactamente
// lo que había. La migración es RELANZABLE: la auditoría se crea con
// `IF NOT EXISTS`, cada paso solo toca filas que aún no tienen el valor y el
// `INSERT` a la auditoría es `ON CONFLICT DO NOTHING` (conserva el valor
// previo original). Una segunda ejecución no cambia nada.
//
// Pasos (el spec los lista a–f; `f` va primero para que la sesión ya tenga
// productor cuando `a` copia al de sus encuestas, y así el resultado sea un
// punto fijo):
//   f. campaign_sessions.farmer_id  ← el productor de sus encuestas (único)
//   a. surveys.farmer_id            ← campaign_sessions.farmer_id (si es NULL)
//   b. surveys.farm_id              ← finca principal del productor
//   c. surveys.farm_crop_id         ← por prioridad (`pickFarmCrop`): único
//        cultivo de la sesión → único cultivo resuelto por las respuestas →
//        único cultivo activo de la finca → NULL (ambiguo; lo reporta
//        `pnpm spec94:verify`)
//   d. surveys.crop_id              ← farms_crops.crop_id del cultivo anclado
//   e. consent_records.farmer_id    ← productor de la sesión / de la encuesta /
//        único productor de las encuestas de la sesión; consent_records.survey_id
//        ← primera encuesta de la sesión (solo las que tienen sesión y no
//        encuesta). Las constancias sin camino (sesiones abandonadas, envíos
//        públicos sin procesar) NO se tocan ni se borran.

/** Tablas y PK que el `down` sabe restaurar (lista cerrada: evita SQL dinámico libre). */
const AUDITED = [
  // Orden de restauración: lo derivado primero. `farm_crop_id` y `crop_id`
  // antes que `farm_id` (el CHECK exige finca mientras haya cultivo de finca).
  { table: 'surveys', pk: 'survey_id', column: 'crop_id' },
  { table: 'surveys', pk: 'survey_id', column: 'farm_crop_id' },
  { table: 'surveys', pk: 'survey_id', column: 'farm_id' },
  { table: 'surveys', pk: 'survey_id', column: 'farmer_id' },
  { table: 'consent_records', pk: 'consent_record_id', column: 'survey_id' },
  { table: 'consent_records', pk: 'consent_record_id', column: 'farmer_id' },
  { table: 'campaign_sessions', pk: 'session_id', column: 'farmer_id' },
] as const;

const CHUNK = 500;

export class Spec94BackfillAnchors1788400000003 implements MigrationInterface {
  name = 'Spec94BackfillAnchors1788400000003';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "spec94_backfill_audit" (
         "table_name" character varying(64) NOT NULL,
         "row_id" uuid NOT NULL,
         "column_name" character varying(64) NOT NULL,
         "previous_value" uuid,
         "new_value" uuid,
         "created_at" TIMESTAMP NOT NULL DEFAULT now(),
         CONSTRAINT "PK_spec94_backfill_audit" PRIMARY KEY ("table_name", "row_id", "column_name")
       )`,
    );

    // f. La sesión toma el productor de sus encuestas cuando es único.
    await this.fill(
      queryRunner,
      'campaign_sessions',
      'farmer_id',
      `UPDATE campaign_sessions cs SET farmer_id = x.farmer_id
         FROM (SELECT s.campaign_session_id AS session_id,
                      (array_agg(DISTINCT s.farmer_id))[1] AS farmer_id
                 FROM surveys s
                WHERE s.campaign_session_id IS NOT NULL AND s.farmer_id IS NOT NULL
                GROUP BY s.campaign_session_id
               HAVING count(DISTINCT s.farmer_id) = 1) x
        WHERE x.session_id = cs.session_id AND cs.farmer_id IS NULL
        RETURNING cs.session_id AS row_id, NULL::uuid AS previous_value, cs.farmer_id AS new_value`,
    );

    // a. La encuesta toma el productor de su sesión.
    await this.fill(
      queryRunner,
      'surveys',
      'farmer_id',
      `UPDATE surveys s SET farmer_id = cs.farmer_id
         FROM campaign_sessions cs
        WHERE cs.session_id = s.campaign_session_id
          AND s.farmer_id IS NULL AND cs.farmer_id IS NOT NULL
        RETURNING s.survey_id AS row_id, NULL::uuid AS previous_value, s.farmer_id AS new_value`,
    );

    // b. La encuesta toma la finca principal de su productor.
    await this.fill(
      queryRunner,
      'surveys',
      'farm_id',
      `UPDATE surveys s SET farm_id = ff.farm_id
         FROM farmer_farms ff
        WHERE ff.farmer_id = s.farmer_id AND ff.is_primary = true
          AND s.farm_id IS NULL
        RETURNING s.survey_id AS row_id, NULL::uuid AS previous_value, s.farm_id AS new_value`,
    );

    // c. Cultivo de finca por prioridad (JS: reutiliza `resolveCropsFromResponses`).
    await this.backfillFarmCrops(queryRunner);

    // d. crop_id derivado del cultivo de finca.
    await this.fill(
      queryRunner,
      'surveys',
      'crop_id',
      `UPDATE surveys s SET crop_id = fc.crop_id
         FROM farms_crops fc, surveys o
        WHERE fc.farm_crop_id = s.farm_crop_id AND o.survey_id = s.survey_id
          AND s.crop_id IS DISTINCT FROM fc.crop_id
        RETURNING s.survey_id AS row_id, o.crop_id AS previous_value, fc.crop_id AS new_value`,
    );

    // e. Constancias ancladas al productor y a la encuesta.
    await this.fill(
      queryRunner,
      'consent_records',
      'farmer_id',
      `UPDATE consent_records cr SET farmer_id = x.farmer_id
         FROM (SELECT cr2.consent_record_id,
                      COALESCE(
                        (SELECT cs.farmer_id FROM campaign_sessions cs
                          WHERE cs.session_id = cr2.session_id),
                        (SELECT s.farmer_id FROM surveys s
                          WHERE s.survey_id = cr2.survey_id),
                        (SELECT (array_agg(DISTINCT s2.farmer_id))[1] FROM surveys s2
                          WHERE s2.campaign_session_id = cr2.session_id
                            AND s2.farmer_id IS NOT NULL
                         HAVING count(DISTINCT s2.farmer_id) = 1)
                      ) AS farmer_id
                 FROM consent_records cr2
                WHERE cr2.farmer_id IS NULL) x
        WHERE x.consent_record_id = cr.consent_record_id AND x.farmer_id IS NOT NULL
        RETURNING cr.consent_record_id AS row_id, NULL::uuid AS previous_value, cr.farmer_id AS new_value`,
    );
    await this.fill(
      queryRunner,
      'consent_records',
      'survey_id',
      `UPDATE consent_records cr SET survey_id = x.survey_id
         FROM (SELECT cr2.consent_record_id,
                      (SELECT s.survey_id FROM surveys s
                        WHERE s.campaign_session_id = cr2.session_id
                        ORDER BY s.created_at ASC, s.survey_id ASC LIMIT 1) AS survey_id
                 FROM consent_records cr2
                WHERE cr2.survey_id IS NULL AND cr2.session_id IS NOT NULL) x
        WHERE x.consent_record_id = cr.consent_record_id AND x.survey_id IS NOT NULL
        RETURNING cr.consent_record_id AS row_id, NULL::uuid AS previous_value, cr.survey_id AS new_value`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const [exists] = (await queryRunner.query(
      `SELECT to_regclass('spec94_backfill_audit') AS name`,
    )) as { name: string | null }[];
    if (!exists?.name) return;

    // Solo se restaura lo que sigue valiendo lo que escribió el backfill: un
    // valor cambiado después por la aplicación no se pisa.
    for (const { table, pk, column } of AUDITED) {
      // Al devolver `farm_id` a NULL, un `farm_crop_id` escrito después (p. ej. por
      // `anchorSurvey`) violaría `CHK_surveys_farm_crop_requires_farm`: se anula
      // también. `crop_id` ya se restauró arriba con su propio valor auditado.
      const alsoClearFarmCrop =
        table === 'surveys' && column === 'farm_id'
          ? `, "farm_crop_id" = CASE WHEN a.previous_value IS NULL THEN NULL ELSE t."farm_crop_id" END`
          : '';
      await queryRunner.query(
        `UPDATE "${table}" t SET "${column}" = a.previous_value${alsoClearFarmCrop}
           FROM spec94_backfill_audit a
          WHERE a.table_name = $1 AND a.column_name = $2
            AND t."${pk}" = a.row_id
            AND t."${column}" IS NOT DISTINCT FROM a.new_value`,
        [table, column],
      );
    }
    await queryRunner.query(`DROP TABLE "spec94_backfill_audit"`);
  }

  /**
   * Ejecuta un `UPDATE … RETURNING row_id, previous_value, new_value` y
   * registra cada fila cambiada en la auditoría, en una sola sentencia.
   */
  private async fill(
    queryRunner: QueryRunner,
    table: string,
    column: string,
    updateReturning: string,
    params: unknown[] = [],
  ): Promise<void> {
    await queryRunner.query(
      `WITH changed AS (${updateReturning})
       INSERT INTO spec94_backfill_audit (table_name, row_id, column_name, previous_value, new_value)
       SELECT '${table}', row_id, '${column}', previous_value, new_value FROM changed
       ON CONFLICT DO NOTHING`,
      params,
    );
  }

  /** Paso c — `surveys.farm_crop_id` por prioridad, con las reglas puras. */
  private async backfillFarmCrops(queryRunner: QueryRunner): Promise<void> {
    const surveys = (await queryRunner.query(
      `SELECT survey_id, farm_id, campaign_session_id
         FROM surveys WHERE farm_id IS NOT NULL AND farm_crop_id IS NULL`,
    )) as {
      survey_id: string;
      farm_id: string;
      campaign_session_id: string | null;
    }[];
    if (surveys.length === 0) return;

    const farmIds = [...new Set(surveys.map((s) => s.farm_id))];
    const sessionIds = [
      ...new Set(
        surveys.flatMap((s) =>
          s.campaign_session_id ? [s.campaign_session_id] : [],
        ),
      ),
    ];
    const surveyIds = surveys.map((s) => s.survey_id);

    const catalog = (await queryRunner.query(
      `SELECT crop_id AS "cropId", name FROM types_of_crops`,
    )) as { cropId: string; name: string }[];

    const farmCropRows = (await queryRunner.query(
      `SELECT farm_id, farm_crop_id, crop_id FROM farms_crops
        WHERE archived_at IS NULL AND farm_id = ANY($1::uuid[])
        ORDER BY created_at, farm_crop_id`,
      [farmIds],
    )) as { farm_id: string; farm_crop_id: string; crop_id: string }[];
    const farmCropsByFarm = new Map<
      string,
      { farmCropId: string; cropId: string }[]
    >();
    for (const row of farmCropRows) {
      const list = farmCropsByFarm.get(row.farm_id) ?? [];
      list.push({ farmCropId: row.farm_crop_id, cropId: row.crop_id });
      farmCropsByFarm.set(row.farm_id, list);
    }

    const sessionCropRows = sessionIds.length
      ? ((await queryRunner.query(
          `SELECT campaign_sessions_session_id AS session_id,
                  types_of_crops_crop_id AS crop_id
             FROM campaign_sessions_crops
            WHERE campaign_sessions_session_id = ANY($1::uuid[])`,
          [sessionIds],
        )) as { session_id: string; crop_id: string }[])
      : [];
    const sessionCrops = new Map<string, string[]>();
    for (const row of sessionCropRows) {
      const list = sessionCrops.get(row.session_id) ?? [];
      list.push(row.crop_id);
      sessionCrops.set(row.session_id, list);
    }

    const responseRows = (await queryRunner.query(
      `SELECT r.survey_id, q.system_field AS "systemField",
              r.boolean_value AS "booleanValue",
              o.text AS "optionText", o.metadata_id AS "metadataId"
         FROM responses r
         JOIN questions q ON q.question_id = r.question_id
         LEFT JOIN options_question o ON o.option_id = r.option_id
        WHERE r.survey_id = ANY($1::uuid[])
          AND (q.system_field LIKE 'crop.%' OR q.system_field = 'farm.mainCrop')`,
      [surveyIds],
    )) as {
      survey_id: string;
      systemField: string;
      booleanValue: boolean | null;
      optionText: string | null;
      metadataId: string | null;
    }[];
    const responsesBySurvey = new Map<
      string,
      Parameters<typeof resolveCropsFromResponses>[0]
    >();
    for (const row of responseRows) {
      const list = responsesBySurvey.get(row.survey_id) ?? [];
      list.push({
        booleanValue: row.booleanValue,
        question: { systemField: row.systemField },
        option:
          row.optionText !== null || row.metadataId !== null
            ? { text: row.optionText, metadataId: row.metadataId }
            : null,
      });
      responsesBySurvey.set(row.survey_id, list);
    }

    const picks: { surveyId: string; farmCropId: string }[] = [];
    for (const survey of surveys) {
      const resolved = resolveCropsFromResponses(
        responsesBySurvey.get(survey.survey_id) ?? [],
        catalog,
      ).crops.map((c) => c.cropId);
      const pick = pickFarmCrop(farmCropsByFarm.get(survey.farm_id) ?? [], [
        survey.campaign_session_id
          ? (sessionCrops.get(survey.campaign_session_id) ?? [])
          : [],
        resolved,
      ]);
      if (pick.farmCropId) {
        picks.push({ surveyId: survey.survey_id, farmCropId: pick.farmCropId });
      }
    }

    for (let i = 0; i < picks.length; i += CHUNK) {
      const chunk = picks.slice(i, i + CHUNK);
      await this.fill(
        queryRunner,
        'surveys',
        'farm_crop_id',
        `UPDATE surveys s SET farm_crop_id = v.farm_crop_id
           FROM unnest($1::uuid[], $2::uuid[]) AS v(survey_id, farm_crop_id)
          WHERE s.survey_id = v.survey_id AND s.farm_crop_id IS NULL
          RETURNING s.survey_id AS row_id, NULL::uuid AS previous_value, s.farm_crop_id AS new_value`,
        [chunk.map((p) => p.surveyId), chunk.map((p) => p.farmCropId)],
      );
    }
  }
}
