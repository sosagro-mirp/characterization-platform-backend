import { MigrationInterface, QueryRunner } from 'typeorm';

// Spec 102 — idempotencia del consentimiento por encuesta y por productor
// (sin sesión de campaña). No toca el índice de sesión vigente
// `UQ_consent_records_session_document`; el móvil no cambia.
export class Spec102ConsentAnchorIndexes1788900000001 implements MigrationInterface {
  name = 'Spec102ConsentAnchorIndexes1788900000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_consent_records_survey_document" ON "consent_records" ("survey_id", "consent_document_id") WHERE "survey_id" IS NOT NULL AND "session_id" IS NULL`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_consent_records_farmer_document" ON "consent_records" ("farmer_id", "consent_document_id") WHERE "farmer_id" IS NOT NULL AND "session_id" IS NULL AND "survey_id" IS NULL AND "revoked_at" IS NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "UQ_consent_records_farmer_document"`);
    await queryRunner.query(`DROP INDEX "UQ_consent_records_survey_document"`);
  }
}
