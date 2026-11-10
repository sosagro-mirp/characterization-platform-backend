import { MigrationInterface, QueryRunner } from 'typeorm';

// Spec 98 (Fase 5) — registro de exportaciones de datos. Una fila por archivo
// generado: quién, cuándo, con qué filtros, de qué fincas y el hash del archivo
// (el archivo no se guarda). No se edita ni se borra: no hay endpoints que lo
// hagan. `user_id` no es FK a propósito: el registro sobrevive al usuario.
// Timestamp `17887…`: antes de `Spec97SystemFieldData` (ver Spec98InstrumentScope).
export class Spec98DataExportLogs1788700000001 implements MigrationInterface {
  name = 'Spec98DataExportLogs1788700000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "data_export_logs" (
        "export_id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "user_id" uuid,
        "user_email" character varying(255) NOT NULL,
        "export_type" character varying(50) NOT NULL,
        "filters" jsonb NOT NULL DEFAULT '{}',
        "farm_ids" uuid[] NOT NULL DEFAULT '{}',
        "row_count" integer NOT NULL,
        "file_sha256" character varying(64) NOT NULL,
        "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "PK_data_export_logs" PRIMARY KEY ("export_id")
      )`);
    await queryRunner.query(
      `CREATE INDEX "IDX_data_export_logs_created" ON "data_export_logs" ("created_at" DESC)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "data_export_logs"`);
  }
}
