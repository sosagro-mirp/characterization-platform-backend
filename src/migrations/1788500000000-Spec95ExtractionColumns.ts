import { MigrationInterface, QueryRunner } from 'typeorm';

// Spec 95 (H3b), migración 1 — la encuesta recuerda cómo le fue a su extracción.
//
//   surveys.client_farmer_id   varchar(100) NULL — id provisional `local_farmer_…`
//   surveys.extraction_status  varchar(20)  NULL — done | collision | no_identity |
//                              pending_alias | not_applicable | awaiting_review |
//                              error | backfilled
//   surveys.extraction_error   text NULL
//   surveys.extracted_at       timestamp NULL
//
// Índice parcial para localizar las encuestas que esperan su alias. Las que ya
// tienen productor (anclajes del backfill del spec 94) quedan `backfilled`: el
// reprocesado (`extraction:replay`) es quien decide si se extraen de nuevo.
export class Spec95ExtractionColumns1788500000000 implements MigrationInterface {
  name = 'Spec95ExtractionColumns1788500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "surveys" ADD "client_farmer_id" character varying(100)`,
    );
    await queryRunner.query(
      `ALTER TABLE "surveys" ADD "extraction_status" character varying(20)`,
    );
    await queryRunner.query(
      `ALTER TABLE "surveys" ADD "extraction_error" text`,
    );
    await queryRunner.query(
      `ALTER TABLE "surveys" ADD "extracted_at" TIMESTAMP`,
    );
    await queryRunner.query(
      `ALTER TABLE "surveys" ADD CONSTRAINT "CHK_surveys_extraction_status" CHECK ("extraction_status" IS NULL OR "extraction_status" IN ('done', 'collision', 'no_identity', 'pending_alias', 'not_applicable', 'awaiting_review', 'error', 'backfilled'))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_surveys_client_farmer_pending" ON "surveys" ("client_farmer_id") WHERE "client_farmer_id" IS NOT NULL AND "farmer_id" IS NULL`,
    );
    await queryRunner.query(
      `UPDATE "surveys" SET "extraction_status" = 'backfilled' WHERE "farmer_id" IS NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_surveys_client_farmer_pending"`);
    await queryRunner.query(
      `ALTER TABLE "surveys" DROP CONSTRAINT "CHK_surveys_extraction_status"`,
    );
    await queryRunner.query(`ALTER TABLE "surveys" DROP COLUMN "extracted_at"`);
    await queryRunner.query(
      `ALTER TABLE "surveys" DROP COLUMN "extraction_error"`,
    );
    await queryRunner.query(
      `ALTER TABLE "surveys" DROP COLUMN "extraction_status"`,
    );
    await queryRunner.query(
      `ALTER TABLE "surveys" DROP COLUMN "client_farmer_id"`,
    );
  }
}
