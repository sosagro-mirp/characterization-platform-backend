import { MigrationInterface, QueryRunner } from 'typeorm';

// Spec 104 (H8 del spec 83), etapa A — archivar campañas.
//
//   - FK surveys.campaign_session_id y campaign_sessions.campaign_id: CASCADE → RESTRICT
//   - surveys.legacy_campaign_name varchar(255) NULL, con backfill
//
// No destructiva y reversible: no borra ni modifica datos existentes.
//
// Las FK se buscan por tabla en `pg_constraint` y no por nombre: en desarrollo
// tienen el nombre autogenerado y en producción la migración 1781100000000 las
// renombró a FK_surveys_campaign_session / FK_campaign_sessions_campaign.
// Se recrean con el nombre autogenerado de TypeORM, el que declara la entidad.
const SURVEYS_FK = 'FK_4f40de874a76732c06217503668';
const SESSIONS_FK = 'FK_17bb758a689b5a3d38c091255eb';

/** Borra, sea cual sea su nombre, la FK de `fromTable` hacia `toTable`. */
function dropForeignKey(fromTable: string, toTable: string): string {
  return `
    DO $$
    DECLARE v_name text;
    BEGIN
      FOR v_name IN
        SELECT c.conname
        FROM pg_constraint c
        JOIN pg_class t ON t.oid = c.conrelid
        JOIN pg_class r ON r.oid = c.confrelid
        WHERE t.relname = '${fromTable}'
          AND r.relname = '${toTable}'
          AND t.relnamespace = 'public'::regnamespace
          AND r.relnamespace = 'public'::regnamespace
          AND c.contype = 'f'
      LOOP
        EXECUTE format('ALTER TABLE ${fromTable} DROP CONSTRAINT %I', v_name);
      END LOOP;
    END $$;
  `;
}

export class Spec104ArchiveCampaigns1789000000000 implements MigrationInterface {
  name = 'Spec104ArchiveCampaigns1789000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "surveys" ADD "legacy_campaign_name" character varying(255)`,
    );
    await queryRunner.query(
      `UPDATE "surveys" s SET "legacy_campaign_name" = c."name"
         FROM "campaign_sessions" cs
         JOIN "campaigns" c ON c."campaign_id" = cs."campaign_id"
        WHERE s."campaign_session_id" = cs."session_id"`,
    );
    await queryRunner.query(dropForeignKey('surveys', 'campaign_sessions'));
    await queryRunner.query(
      `ALTER TABLE "surveys" ADD CONSTRAINT "${SURVEYS_FK}"
         FOREIGN KEY ("campaign_session_id") REFERENCES "campaign_sessions"("session_id")
         ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(dropForeignKey('campaign_sessions', 'campaigns'));
    await queryRunner.query(
      `ALTER TABLE "campaign_sessions" ADD CONSTRAINT "${SESSIONS_FK}"
         FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("campaign_id")
         ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(dropForeignKey('campaign_sessions', 'campaigns'));
    await queryRunner.query(
      `ALTER TABLE "campaign_sessions" ADD CONSTRAINT "${SESSIONS_FK}"
         FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("campaign_id")
         ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(dropForeignKey('surveys', 'campaign_sessions'));
    await queryRunner.query(
      `ALTER TABLE "surveys" ADD CONSTRAINT "${SURVEYS_FK}"
         FOREIGN KEY ("campaign_session_id") REFERENCES "campaign_sessions"("session_id")
         ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "surveys" DROP COLUMN "legacy_campaign_name"`,
    );
  }
}
