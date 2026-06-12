import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCampaignSessionsCropsAndNullableColumns1749686400000
  implements MigrationInterface
{
  name = 'AddCampaignSessionsCropsAndNullableColumns1749686400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Step 12: Create campaign_sessions_crops pivot table
    await queryRunner.query(`
      CREATE TABLE "campaign_sessions_crops" (
        "campaign_sessions_session_id" uuid NOT NULL,
        "types_of_crops_crop_id"       uuid NOT NULL,
        CONSTRAINT "PK_campaign_sessions_crops"
          PRIMARY KEY ("campaign_sessions_session_id", "types_of_crops_crop_id")
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "campaign_sessions_crops"
        ADD CONSTRAINT "FK_campaign_sessions_crops_session"
          FOREIGN KEY ("campaign_sessions_session_id")
          REFERENCES "campaign_sessions"("session_id")
          ON DELETE CASCADE
    `);

    await queryRunner.query(`
      ALTER TABLE "campaign_sessions_crops"
        ADD CONSTRAINT "FK_campaign_sessions_crops_crop"
          FOREIGN KEY ("types_of_crops_crop_id")
          REFERENCES "types_of_crops"("crop_id")
          ON DELETE CASCADE
    `);

    // Step 13: Add geolocation and vereda columns to farms
    await queryRunner.query(`
      ALTER TABLE "farms"
        ADD COLUMN "latitude"  double precision NULL,
        ADD COLUMN "longitude" double precision NULL,
        ADD COLUMN "altitude"  double precision NULL,
        ADD COLUMN "vereda"    character varying(100) NULL
    `);

    // Step 14: Add code column to instruments
    await queryRunner.query(`
      ALTER TABLE "instruments"
        ADD COLUMN "code" character varying(10) NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "instruments"
        ADD CONSTRAINT "UQ_instruments_code" UNIQUE ("code")
    `);

    // Step 15: Relax NOT NULL constraints on farmers
    await queryRunner.query(`
      ALTER TABLE "farmers"
        ALTER COLUMN "last_name"                 DROP NOT NULL,
        ALTER COLUMN "document_id"               DROP NOT NULL,
        ALTER COLUMN "email"                     DROP NOT NULL,
        ALTER COLUMN "phone"                     DROP NOT NULL,
        ALTER COLUMN "age"                       DROP NOT NULL,
        ALTER COLUMN "gender"                    DROP NOT NULL,
        ALTER COLUMN "education_level"           DROP NOT NULL,
        ALTER COLUMN "experience_years"          DROP NOT NULL,
        ALTER COLUMN "family_size"               DROP NOT NULL,
        ALTER COLUMN "is_main_income"            DROP NOT NULL,
        ALTER COLUMN "participation_in_training" DROP NOT NULL
    `);

    // Step 16: Relax NOT NULL constraints on farms
    await queryRunner.query(`
      ALTER TABLE "farms"
        ALTER COLUMN "location"                    DROP NOT NULL,
        ALTER COLUMN "area"                        DROP NOT NULL,
        ALTER COLUMN "water_access"                DROP NOT NULL,
        ALTER COLUMN "internet_access"             DROP NOT NULL,
        ALTER COLUMN "has_stability_electricity"   DROP NOT NULL,
        ALTER COLUMN "technical_assistance_access" DROP NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "farms"
        ALTER COLUMN "location"                    SET NOT NULL,
        ALTER COLUMN "area"                        SET NOT NULL,
        ALTER COLUMN "water_access"                SET NOT NULL,
        ALTER COLUMN "internet_access"             SET NOT NULL,
        ALTER COLUMN "has_stability_electricity"   SET NOT NULL,
        ALTER COLUMN "technical_assistance_access" SET NOT NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "farmers"
        ALTER COLUMN "last_name"                 SET NOT NULL,
        ALTER COLUMN "document_id"               SET NOT NULL,
        ALTER COLUMN "email"                     SET NOT NULL,
        ALTER COLUMN "phone"                     SET NOT NULL,
        ALTER COLUMN "age"                       SET NOT NULL,
        ALTER COLUMN "gender"                    SET NOT NULL,
        ALTER COLUMN "education_level"           SET NOT NULL,
        ALTER COLUMN "experience_years"          SET NOT NULL,
        ALTER COLUMN "family_size"               SET NOT NULL,
        ALTER COLUMN "is_main_income"            SET NOT NULL,
        ALTER COLUMN "participation_in_training" SET NOT NULL
    `);

    await queryRunner.query(`ALTER TABLE "instruments" DROP CONSTRAINT "UQ_instruments_code"`);
    await queryRunner.query(`ALTER TABLE "instruments" DROP COLUMN "code"`);

    await queryRunner.query(`
      ALTER TABLE "farms"
        DROP COLUMN "latitude",
        DROP COLUMN "longitude",
        DROP COLUMN "altitude",
        DROP COLUMN "vereda"
    `);

    await queryRunner.query(`DROP TABLE "campaign_sessions_crops"`);
  }
}
