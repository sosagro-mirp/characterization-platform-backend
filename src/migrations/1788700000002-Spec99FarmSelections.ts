import { MigrationInterface, QueryRunner } from 'typeorm';

// Spec 99 (Fase 1) — selección de las 40 unidades productivas. No destructiva:
// dos tablas nuevas y vacías.
//
//   farm_selections        estado actual por finca, con `version` para el control
//                          de edición simultánea. "Sin decisión" no guarda fila.
//   farm_selection_events  historial inalterable, con la cobertura de la finca en
//                          ese momento. `user_id` no es FK a propósito: el
//                          historial sobrevive al usuario (igual que data_export_logs).
//
// Ambas FK a `farms` son RESTRICT: una finca con decisiones no se borra.
// Timestamp `17887…`: antes de `Spec97SystemFieldData` (ver Spec98InstrumentScope).
export class Spec99FarmSelections1788700000002 implements MigrationInterface {
  name = 'Spec99FarmSelections1788700000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "farm_selections" (
        "farm_id" uuid NOT NULL,
        "status" character varying(20) NOT NULL,
        "reason" text NOT NULL,
        "version" integer NOT NULL DEFAULT 1,
        "updated_by" uuid,
        "updated_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "PK_farm_selections" PRIMARY KEY ("farm_id"),
        CONSTRAINT "CHK_farm_selections_status" CHECK ("status" IN ('included', 'excluded', 'in_review')),
        CONSTRAINT "FK_farm_selections_farm" FOREIGN KEY ("farm_id") REFERENCES "farms"("farm_id") ON DELETE RESTRICT
      )`);
    await queryRunner.query(`
      CREATE TABLE "farm_selection_events" (
        "event_id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "farm_id" uuid NOT NULL,
        "from_status" character varying(20),
        "to_status" character varying(20) NOT NULL,
        "reason" text NOT NULL,
        "user_id" uuid,
        "user_name" character varying(255) NOT NULL,
        "coverage_snapshot" jsonb NOT NULL,
        "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "PK_farm_selection_events" PRIMARY KEY ("event_id"),
        CONSTRAINT "FK_farm_selection_events_farm" FOREIGN KEY ("farm_id") REFERENCES "farms"("farm_id") ON DELETE RESTRICT
      )`);
    await queryRunner.query(
      `CREATE INDEX "IDX_farm_selection_events_farm" ON "farm_selection_events" ("farm_id", "created_at" DESC)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "farm_selection_events"`);
    await queryRunner.query(`DROP TABLE "farm_selections"`);
  }
}
