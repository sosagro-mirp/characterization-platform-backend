import { MigrationInterface, QueryRunner } from 'typeorm';

// Bug `web-survey-sync` (2026-11-07) — backfill de `surveys.sincronized`.
//
// La web nunca llamaba a `PATCH /api/surveys/:id/sync`, así que sus encuestas
// terminadas quedaron con `sincronized = false` y no cuentan en la cobertura
// (`isCountableSurvey`) ni en el dashboard. El frontend ya lo corrige hacia
// adelante; esta migración marca las históricas.
//
// Criterio (encuestas web terminadas):
//   - `origin = 'field'` (no el canal público);
//   - `client_survey_id IS NULL` (el móvil siempre lo envía; sus borradores
//     sin subir no se tocan);
//   - `sincronized = false`;
//   - con al menos una respuesta (la web envía las respuestas en un único batch
//     al terminar, así que una encuesta web con respuestas está terminada; las
//     que no tienen respuestas son intentos abandonados y siguen igual).
//
// Producción al 2026-11-07: 25 encuestas (del 15/09 al 07/10, 3 productores).
//
// 1. Respalda en `surveys_sync_backup_web` los ids que va a cambiar.
// 2. Los marca como sincronizados.
// El `down` vuelve a `false` solo los respaldados y elimina el respaldo.
//
// DESPLIEGUE: esta migración NO se corre sola al arrancar el backend
// (`AppModule` excluye los archivos `*Data.js` de `migrationsRun`). Se corre a
// mano (`pnpm migration:run`) con autorización explícita, después de desplegar
// la corrección del frontend.
const BACKUP_TABLE = 'surveys_sync_backup_web';

const WEB_UNSYNCED_FINISHED = `
  s.origin = 'field'
  AND s.client_survey_id IS NULL
  AND s.sincronized = false
  AND EXISTS (SELECT 1 FROM responses r WHERE r.survey_id = s.survey_id)`;

export class WebSurveySyncData1788900000000 implements MigrationInterface {
  name = 'WebSurveySyncData1788900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "${BACKUP_TABLE}" (
         "survey_id" uuid PRIMARY KEY
       )`,
    );
    await queryRunner.query(
      `INSERT INTO "${BACKUP_TABLE}" ("survey_id")
       SELECT s.survey_id FROM surveys s
        WHERE ${WEB_UNSYNCED_FINISHED}
       ON CONFLICT ("survey_id") DO NOTHING`,
    );
    await queryRunner.query(
      `UPDATE surveys SET sincronized = true
        WHERE survey_id IN (SELECT survey_id FROM "${BACKUP_TABLE}")
          AND sincronized = false`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE surveys SET sincronized = false
        WHERE survey_id IN (SELECT survey_id FROM "${BACKUP_TABLE}")`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "${BACKUP_TABLE}"`);
  }
}
