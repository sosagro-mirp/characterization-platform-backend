import { MigrationInterface, QueryRunner } from 'typeorm';

// Spec 97 (H4 del spec 83), migración C — limpieza de datos de `system_field`.
//
//   1. Respalda en `questions_system_field_backup_097` cada fila que va a cambiar.
//   2. `NULL` en la etiqueta «Pregunta estratégica…» (ya vive en
//      `is_digital_demand_item`) y en `inverted:*` (ya vive en `is_inverted_scale`).
//   3. Reescribe alias → clave canónica: `farm.mainCrop` → `farm.crops`,
//      `crop.<x>` → `farm.hasCrop.<x>`.
//
// No toca las claves `legacy` ni los datos de otras tablas
// (`entity_field_discrepancies.system_field` es histórico y se lee con
// `canonicalKey`). El `down` restaura desde el respaldo y lo elimina.
//
// DESPLIEGUE (D-H4-13): esta migración NO se corre sola al arrancar el backend.
// `AppModule` excluye los archivos `*Data.js` de `migrationsRun`; en producción
// se corre a mano (`pnpm migration:run`) después de que el OTA del móvil esté
// adoptado en las tabletas, y con autorización explícita.
const STRATEGIC_TAG = 'Pregunta estratégica de caracterización tecnológica';
const BACKUP_TABLE = 'questions_system_field_backup_097';

export class Spec97SystemFieldData1788600000002 implements MigrationInterface {
  name = 'Spec97SystemFieldData1788600000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // «Demanda digital» quedaría vacía si se limpia el texto antes de que las
    // columnas estén pobladas: abortar en vez de perder la marca.
    const unmarked = (await queryRunner.query(
      `SELECT
         count(*) FILTER (WHERE system_field = $1 AND NOT is_digital_demand_item) AS strategic,
         count(*) FILTER (WHERE system_field LIKE 'inverted:%' AND NOT is_inverted_scale) AS inverted
       FROM questions`,
      [STRATEGIC_TAG],
    )) as { strategic: string; inverted: string }[];
    if (Number(unmarked[0].strategic) > 0 || Number(unmarked[0].inverted) > 0) {
      throw new Error(
        `Spec97SystemFieldData: hay preguntas con la etiqueta en system_field que no están marcadas en sus columnas ` +
          `(estratégicas sin marcar: ${unmarked[0].strategic}, invertidas sin marcar: ${unmarked[0].inverted}). ` +
          `Corra primero la migración B.`,
      );
    }

    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "${BACKUP_TABLE}" (
         "question_id" uuid PRIMARY KEY,
         "old_value" character varying(100) NOT NULL
       )`,
    );
    await queryRunner.query(
      `INSERT INTO "${BACKUP_TABLE}" ("question_id", "old_value")
       SELECT question_id, system_field FROM questions
        WHERE system_field = $1
           OR system_field LIKE 'inverted:%'
           OR system_field = 'farm.mainCrop'
           OR system_field LIKE 'crop.%'
       ON CONFLICT ("question_id") DO NOTHING`,
      [STRATEGIC_TAG],
    );

    await queryRunner.query(
      `UPDATE questions SET system_field = NULL
        WHERE system_field = $1 OR system_field LIKE 'inverted:%'`,
      [STRATEGIC_TAG],
    );
    await queryRunner.query(
      `UPDATE questions SET system_field = 'farm.crops'
        WHERE system_field = 'farm.mainCrop'`,
    );
    await queryRunner.query(
      `UPDATE questions SET system_field = 'farm.hasCrop.' || substr(system_field, 6)
        WHERE system_field LIKE 'crop.%'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE questions q SET system_field = b.old_value
         FROM "${BACKUP_TABLE}" b WHERE q.question_id = b.question_id`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "${BACKUP_TABLE}"`);
  }
}
