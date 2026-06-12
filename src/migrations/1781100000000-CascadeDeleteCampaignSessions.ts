import { MigrationInterface, QueryRunner } from 'typeorm';

export class CascadeDeleteCampaignSessions1781100000000
  implements MigrationInterface
{
  name = 'CascadeDeleteCampaignSessions1781100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // campaign_sessions.campaign_id: RESTRICT → CASCADE
    await queryRunner.query(`
      DO $$
      DECLARE v_name text;
      BEGIN
        SELECT conname INTO v_name
        FROM pg_constraint c
        JOIN pg_class t ON t.oid = c.conrelid
        JOIN pg_class r ON r.oid = c.confrelid
        WHERE t.relname = 'campaign_sessions'
          AND r.relname = 'campaigns'
          AND c.contype = 'f';
        IF v_name IS NOT NULL THEN
          EXECUTE format('ALTER TABLE campaign_sessions DROP CONSTRAINT %I', v_name);
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      ALTER TABLE "campaign_sessions"
        ADD CONSTRAINT "FK_campaign_sessions_campaign"
          FOREIGN KEY ("campaign_id")
          REFERENCES "campaigns"("campaign_id")
          ON DELETE CASCADE
    `);

    // surveys.campaign_session_id: SET NULL → CASCADE
    await queryRunner.query(`
      DO $$
      DECLARE v_name text;
      BEGIN
        SELECT conname INTO v_name
        FROM pg_constraint c
        JOIN pg_class t ON t.oid = c.conrelid
        JOIN pg_class r ON r.oid = c.confrelid
        WHERE t.relname = 'surveys'
          AND r.relname = 'campaign_sessions'
          AND c.contype = 'f';
        IF v_name IS NOT NULL THEN
          EXECUTE format('ALTER TABLE surveys DROP CONSTRAINT %I', v_name);
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      ALTER TABLE "surveys"
        ADD CONSTRAINT "FK_surveys_campaign_session"
          FOREIGN KEY ("campaign_session_id")
          REFERENCES "campaign_sessions"("session_id")
          ON DELETE CASCADE
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "surveys" DROP CONSTRAINT IF EXISTS "FK_surveys_campaign_session"
    `);
    await queryRunner.query(`
      ALTER TABLE "surveys"
        ADD CONSTRAINT "FK_surveys_campaign_session"
          FOREIGN KEY ("campaign_session_id")
          REFERENCES "campaign_sessions"("session_id")
          ON DELETE SET NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "campaign_sessions" DROP CONSTRAINT IF EXISTS "FK_campaign_sessions_campaign"
    `);
    await queryRunner.query(`
      ALTER TABLE "campaign_sessions"
        ADD CONSTRAINT "FK_campaign_sessions_campaign"
          FOREIGN KEY ("campaign_id")
          REFERENCES "campaigns"("campaign_id")
          ON DELETE RESTRICT
    `);
  }
}
