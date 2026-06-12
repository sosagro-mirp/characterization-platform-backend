import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSystemFieldToQuestion1781093000000 implements MigrationInterface {
  name = 'AddSystemFieldToQuestion1781093000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "questions"
        ADD COLUMN IF NOT EXISTS "system_field" character varying(100) NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "questions"
        DROP COLUMN IF EXISTS "system_field"
    `);
  }
}
