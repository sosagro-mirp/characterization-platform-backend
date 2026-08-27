import { MigrationInterface, QueryRunner } from 'typeorm';

// Spec 78 — dos tablas nuevas: consent_documents (versionado del texto de
// consentimiento) y consent_records (constancias de aceptación). Ninguna
// tabla existente cambia de esquema. El índice único
// UQ_consent_records_session_document respalda en base de datos la
// idempotencia por (session_id, consent_document_id) que
// ConsentRecordsService.create() ya aplicaba solo con un check-then-insert
// (hallazgo B3 de la auditoría en docs/reports/auditorias/).
export class CreateConsents1787700000000 implements MigrationInterface {
  name = 'CreateConsents1787700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "consent_documents" (` +
        `"consent_document_id" uuid NOT NULL DEFAULT uuid_generate_v4(), ` +
        `"version" character varying(20) NOT NULL, ` +
        `"title" character varying(255) NOT NULL, ` +
        `"body" text NOT NULL, ` +
        `"data_processing_clause" text NOT NULL, ` +
        `"multimedia_clause" text NOT NULL, ` +
        `"rights_clause" text NOT NULL, ` +
        `"responsible_entity" character varying(255) NOT NULL, ` +
        `"contact_email" character varying(255) NOT NULL, ` +
        `"status" character varying(20) NOT NULL DEFAULT 'draft', ` +
        `"published_at" TIMESTAMP, ` +
        `"created_by_id" uuid, ` +
        `"updated_by_id" uuid, ` +
        `"created_at" TIMESTAMP NOT NULL DEFAULT now(), ` +
        `"updated_at" TIMESTAMP NOT NULL DEFAULT now(), ` +
        `CONSTRAINT "UQ_consent_documents_version" UNIQUE ("version"), ` +
        `CONSTRAINT "PK_consent_documents" PRIMARY KEY ("consent_document_id")` +
        `)`,
    );
    await queryRunner.query(
      `ALTER TABLE "consent_documents" ADD CONSTRAINT "FK_consent_documents_created_by" FOREIGN KEY ("created_by_id") REFERENCES "users"("user_id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "consent_documents" ADD CONSTRAINT "FK_consent_documents_updated_by" FOREIGN KEY ("updated_by_id") REFERENCES "users"("user_id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );

    await queryRunner.query(
      `CREATE TABLE "consent_records" (` +
        `"consent_record_id" uuid NOT NULL DEFAULT uuid_generate_v4(), ` +
        `"consent_document_id" uuid NOT NULL, ` +
        `"farmer_id" uuid, ` +
        `"session_id" uuid, ` +
        `"accepted_data_processing" boolean NOT NULL, ` +
        `"accepted_photo" boolean NOT NULL DEFAULT false, ` +
        `"accepted_audio" boolean NOT NULL DEFAULT false, ` +
        `"accepted_video" boolean NOT NULL DEFAULT false, ` +
        `"accepted_follow_up_contact" boolean NOT NULL DEFAULT false, ` +
        `"respondent_name" character varying(255), ` +
        `"respondent_document_id" character varying(50), ` +
        `"on_behalf_of_producer" boolean NOT NULL DEFAULT false, ` +
        `"recorded_by" uuid, ` +
        `"accepted_at" TIMESTAMP NOT NULL, ` +
        `"synced_at" TIMESTAMP, ` +
        `"revoked_at" TIMESTAMP, ` +
        `"revoked_reason" text, ` +
        `"revoked_by" uuid, ` +
        `"created_at" TIMESTAMP NOT NULL DEFAULT now(), ` +
        `"updated_at" TIMESTAMP NOT NULL DEFAULT now(), ` +
        `CONSTRAINT "PK_consent_records" PRIMARY KEY ("consent_record_id")` +
        `)`,
    );
    await queryRunner.query(
      `ALTER TABLE "consent_records" ADD CONSTRAINT "FK_consent_records_document" FOREIGN KEY ("consent_document_id") REFERENCES "consent_documents"("consent_document_id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "consent_records" ADD CONSTRAINT "FK_consent_records_farmer" FOREIGN KEY ("farmer_id") REFERENCES "farmers"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "consent_records" ADD CONSTRAINT "FK_consent_records_session" FOREIGN KEY ("session_id") REFERENCES "campaign_sessions"("session_id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "consent_records" ADD CONSTRAINT "FK_consent_records_recorded_by" FOREIGN KEY ("recorded_by") REFERENCES "users"("user_id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "consent_records" ADD CONSTRAINT "FK_consent_records_revoked_by" FOREIGN KEY ("revoked_by") REFERENCES "users"("user_id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );

    // B3 — idempotencia por (session_id, consent_document_id) respaldada en
    // base de datos, no solo en el check-then-insert del servicio. Parcial
    // (session_id IS NOT NULL): una constancia sin sesión asociada (SET NULL
    // tras borrar la sesión) no debe seguir bloqueando reintentos futuros de
    // otra sesión distinta.
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_consent_records_session_document" ON "consent_records" ("session_id", "consent_document_id") WHERE "session_id" IS NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "UQ_consent_records_session_document"`);
    await queryRunner.query(
      `ALTER TABLE "consent_records" DROP CONSTRAINT "FK_consent_records_revoked_by"`,
    );
    await queryRunner.query(
      `ALTER TABLE "consent_records" DROP CONSTRAINT "FK_consent_records_recorded_by"`,
    );
    await queryRunner.query(
      `ALTER TABLE "consent_records" DROP CONSTRAINT "FK_consent_records_session"`,
    );
    await queryRunner.query(
      `ALTER TABLE "consent_records" DROP CONSTRAINT "FK_consent_records_farmer"`,
    );
    await queryRunner.query(
      `ALTER TABLE "consent_records" DROP CONSTRAINT "FK_consent_records_document"`,
    );
    await queryRunner.query(`DROP TABLE "consent_records"`);

    await queryRunner.query(
      `ALTER TABLE "consent_documents" DROP CONSTRAINT "FK_consent_documents_updated_by"`,
    );
    await queryRunner.query(
      `ALTER TABLE "consent_documents" DROP CONSTRAINT "FK_consent_documents_created_by"`,
    );
    await queryRunner.query(`DROP TABLE "consent_documents"`);
  }
}
