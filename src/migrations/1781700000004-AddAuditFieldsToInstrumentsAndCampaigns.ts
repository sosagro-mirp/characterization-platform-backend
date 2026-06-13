import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAuditFieldsToInstrumentsAndCampaigns1781700000004
  implements MigrationInterface
{
  name = 'AddAuditFieldsToInstrumentsAndCampaigns1781700000004';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "instruments"
        ADD COLUMN "created_by_id" uuid NULL,
        ADD COLUMN "updated_by_id" uuid NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "instruments"
        ADD CONSTRAINT "FK_instruments_created_by"
          FOREIGN KEY ("created_by_id")
          REFERENCES "users"("user_id")
          ON DELETE SET NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "instruments"
        ADD CONSTRAINT "FK_instruments_updated_by"
          FOREIGN KEY ("updated_by_id")
          REFERENCES "users"("user_id")
          ON DELETE SET NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "campaigns"
        ADD COLUMN "created_by_id" uuid NULL,
        ADD COLUMN "updated_by_id" uuid NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "campaigns"
        ADD CONSTRAINT "FK_campaigns_created_by"
          FOREIGN KEY ("created_by_id")
          REFERENCES "users"("user_id")
          ON DELETE SET NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "campaigns"
        ADD CONSTRAINT "FK_campaigns_updated_by"
          FOREIGN KEY ("updated_by_id")
          REFERENCES "users"("user_id")
          ON DELETE SET NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "campaigns"
        DROP CONSTRAINT IF EXISTS "FK_campaigns_updated_by",
        DROP CONSTRAINT IF EXISTS "FK_campaigns_created_by"
    `);

    await queryRunner.query(`
      ALTER TABLE "campaigns"
        DROP COLUMN "updated_by_id",
        DROP COLUMN "created_by_id"
    `);

    await queryRunner.query(`
      ALTER TABLE "instruments"
        DROP CONSTRAINT IF EXISTS "FK_instruments_updated_by",
        DROP CONSTRAINT IF EXISTS "FK_instruments_created_by"
    `);

    await queryRunner.query(`
      ALTER TABLE "instruments"
        DROP COLUMN "updated_by_id",
        DROP COLUMN "created_by_id"
    `);
  }
}
