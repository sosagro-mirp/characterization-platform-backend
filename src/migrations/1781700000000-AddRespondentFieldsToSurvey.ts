import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddRespondentFieldsToSurvey1781700000000
  implements MigrationInterface
{
  name = 'AddRespondentFieldsToSurvey1781700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "surveys"
        ADD COLUMN IF NOT EXISTS "respondent_name"        TEXT,
        ADD COLUMN IF NOT EXISTS "respondent_phone"       TEXT,
        ADD COLUMN IF NOT EXISTS "respondent_document_id" TEXT,
        ADD COLUMN IF NOT EXISTS "respondent_email"       TEXT
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "surveys"
        DROP COLUMN IF EXISTS "respondent_name",
        DROP COLUMN IF EXISTS "respondent_phone",
        DROP COLUMN IF EXISTS "respondent_document_id",
        DROP COLUMN IF EXISTS "respondent_email"
    `);
  }
}
