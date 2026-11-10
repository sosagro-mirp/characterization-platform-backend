import { MigrationInterface, QueryRunner } from 'typeorm';

// Spec 95 (H3b), migración 2 — alias de identidad provisional y discrepancias.
//
//   farmer_client_aliases        client_farmer_id → farmer (CASCADE) y la
//                                encuesta que lo registró (SET NULL)
//   entity_field_discrepancies   valor enviado ≠ valor actual, sin pisar nada.
//                                Único por (entity_type, COALESCE(farmer_id,
//                                farm_id), field, survey_id) para que repetir la
//                                extracción no duplique.
export class Spec95DiscrepanciesAndAliases1788500000001 implements MigrationInterface {
  name = 'Spec95DiscrepanciesAndAliases1788500000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "farmer_client_aliases" (
        "client_farmer_id" character varying(100) NOT NULL,
        "farmer_id" uuid NOT NULL,
        "survey_id" uuid,
        "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "PK_farmer_client_aliases" PRIMARY KEY ("client_farmer_id"),
        CONSTRAINT "FK_farmer_client_aliases_farmer" FOREIGN KEY ("farmer_id") REFERENCES "farmers"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_farmer_client_aliases_survey" FOREIGN KEY ("survey_id") REFERENCES "surveys"("survey_id") ON DELETE SET NULL ON UPDATE NO ACTION
      )`);
    await queryRunner.query(
      `CREATE INDEX "IDX_farmer_client_aliases_farmer" ON "farmer_client_aliases" ("farmer_id")`,
    );

    await queryRunner.query(`
      CREATE TABLE "entity_field_discrepancies" (
        "discrepancy_id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "entity_type" character varying(20) NOT NULL,
        "farmer_id" uuid,
        "farm_id" uuid,
        "field" character varying(100) NOT NULL,
        "system_field" character varying(100),
        "current_value" jsonb,
        "submitted_value" jsonb,
        "survey_id" uuid NOT NULL,
        "response_id" uuid,
        "status" character varying(20) NOT NULL DEFAULT 'open',
        "resolved_by" uuid,
        "resolved_at" TIMESTAMP,
        "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "PK_entity_field_discrepancies" PRIMARY KEY ("discrepancy_id"),
        CONSTRAINT "CHK_discrepancies_entity_type" CHECK ("entity_type" IN ('farmer', 'farm', 'farmer_farm')),
        CONSTRAINT "CHK_discrepancies_status" CHECK ("status" IN ('open', 'applied', 'dismissed')),
        CONSTRAINT "CHK_discrepancies_target" CHECK ("farmer_id" IS NOT NULL OR "farm_id" IS NOT NULL),
        CONSTRAINT "FK_discrepancies_farmer" FOREIGN KEY ("farmer_id") REFERENCES "farmers"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_discrepancies_farm" FOREIGN KEY ("farm_id") REFERENCES "farms"("farm_id") ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_discrepancies_survey" FOREIGN KEY ("survey_id") REFERENCES "surveys"("survey_id") ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_discrepancies_response" FOREIGN KEY ("response_id") REFERENCES "responses"("response_id") ON DELETE SET NULL ON UPDATE NO ACTION,
        CONSTRAINT "FK_discrepancies_resolved_by" FOREIGN KEY ("resolved_by") REFERENCES "users"("user_id") ON DELETE SET NULL ON UPDATE NO ACTION
      )`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_discrepancies_entity_field_survey" ON "entity_field_discrepancies" ("entity_type", COALESCE("farmer_id", "farm_id"), "field", "survey_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_discrepancies_farmer" ON "entity_field_discrepancies" ("farmer_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_discrepancies_farm" ON "entity_field_discrepancies" ("farm_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_discrepancies_survey" ON "entity_field_discrepancies" ("survey_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_discrepancies_status" ON "entity_field_discrepancies" ("status")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "entity_field_discrepancies"`);
    await queryRunner.query(`DROP TABLE "farmer_client_aliases"`);
  }
}
