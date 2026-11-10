import { MigrationInterface, QueryRunner } from 'typeorm';

// Spec 79 — instrumentos públicos aplicables por URL compartible.
//
//   instruments.is_public       — este instrumento se puede compartir por
//                                  /encuesta/{instrumentId}. DEFAULT false:
//                                  ningún instrumento existente se vuelve
//                                  público por esta migración.
//   surveys.origin               — 'field' (DEFAULT) para todo lo existente
//                                  y todo lo que siga creando el flujo con
//                                  encuestador; 'public' solo para lo que
//                                  entra por el canal público nuevo.
//   surveys.review_status        — NULL en toda encuesta de campo. Solo se
//                                  usa en origin='public'
//                                  ('pending' | 'processed' | 'discarded').
//   surveys.reviewed_by/at       — quién y cuándo procesó o descartó un
//                                  envío público desde la bandeja.
//   consent_records.survey_id    — ancla la constancia a la encuesta cuando
//                                  se acepta desde el canal público (no
//                                  existe Farmer ni CampaignSession en ese
//                                  momento).
//
// Ninguna columna existente cambia de tipo ni de nulabilidad. Los DEFAULT
// de origin garantizan que el backfill no altera ninguna fila existente
// salvo rellenar 'field' donde antes no había valor.
export class Spec79PublicInstruments1788000000000 implements MigrationInterface {
  name = 'Spec79PublicInstruments1788000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "instruments" ADD "is_public" boolean NOT NULL DEFAULT false`,
    );

    await queryRunner.query(
      `ALTER TABLE "surveys" ADD "origin" character varying(20) NOT NULL DEFAULT 'field'`,
    );
    await queryRunner.query(
      `ALTER TABLE "surveys" ADD "review_status" character varying(20)`,
    );
    await queryRunner.query(`ALTER TABLE "surveys" ADD "reviewed_by" uuid`);
    await queryRunner.query(
      `ALTER TABLE "surveys" ADD "reviewed_at" TIMESTAMP`,
    );
    await queryRunner.query(
      `ALTER TABLE "surveys" ADD CONSTRAINT "FK_surveys_reviewed_by" FOREIGN KEY ("reviewed_by") REFERENCES "users"("user_id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );

    // Índice parcial: la bandeja de revisión solo consulta origin='public',
    // así que no tiene sentido indexar review_status para el resto de filas
    // (siempre NULL ahí).
    await queryRunner.query(
      `CREATE INDEX "IDX_surveys_review_status_public" ON "surveys" ("review_status") WHERE "origin" = 'public'`,
    );

    await queryRunner.query(
      `ALTER TABLE "consent_records" ADD "survey_id" uuid`,
    );
    await queryRunner.query(
      `ALTER TABLE "consent_records" ADD CONSTRAINT "FK_consent_records_survey" FOREIGN KEY ("survey_id") REFERENCES "surveys"("survey_id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "consent_records" DROP CONSTRAINT "FK_consent_records_survey"`,
    );
    await queryRunner.query(
      `ALTER TABLE "consent_records" DROP COLUMN "survey_id"`,
    );

    await queryRunner.query(`DROP INDEX "IDX_surveys_review_status_public"`);
    await queryRunner.query(
      `ALTER TABLE "surveys" DROP CONSTRAINT "FK_surveys_reviewed_by"`,
    );
    await queryRunner.query(`ALTER TABLE "surveys" DROP COLUMN "reviewed_at"`);
    await queryRunner.query(`ALTER TABLE "surveys" DROP COLUMN "reviewed_by"`);
    await queryRunner.query(
      `ALTER TABLE "surveys" DROP COLUMN "review_status"`,
    );
    await queryRunner.query(`ALTER TABLE "surveys" DROP COLUMN "origin"`);

    await queryRunner.query(
      `ALTER TABLE "instruments" DROP COLUMN "is_public"`,
    );
  }
}
