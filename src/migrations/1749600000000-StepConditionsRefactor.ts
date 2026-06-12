import { MigrationInterface, QueryRunner } from 'typeorm';

export class StepConditionsRefactor1749600000000 implements MigrationInterface {
  name = 'StepConditionsRefactor1749600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Create step_conditions table
    await queryRunner.query(`
      CREATE TABLE "step_conditions" (
        "condition_id"       uuid NOT NULL DEFAULT uuid_generate_v4(),
        "order"              integer NOT NULL,
        "logical_operator"   character varying(3),
        "condition_type"     character varying(10) NOT NULL,
        "condition_value"    character varying(50),
        "created_at"         TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at"         TIMESTAMP NOT NULL DEFAULT now(),
        "step_id"            uuid NOT NULL,
        "condition_question_id" uuid,
        "condition_crop_id"  uuid,
        CONSTRAINT "PK_step_conditions" PRIMARY KEY ("condition_id")
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "step_conditions"
        ADD CONSTRAINT "FK_step_conditions_step"
          FOREIGN KEY ("step_id")
          REFERENCES "campaign_steps"("step_id")
          ON DELETE CASCADE
    `);

    await queryRunner.query(`
      ALTER TABLE "step_conditions"
        ADD CONSTRAINT "FK_step_conditions_question"
          FOREIGN KEY ("condition_question_id")
          REFERENCES "questions"("question_id")
          ON DELETE SET NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "step_conditions"
        ADD CONSTRAINT "FK_step_conditions_crop"
          FOREIGN KEY ("condition_crop_id")
          REFERENCES "types_of_crops"("crop_id")
          ON DELETE SET NULL
    `);

    // 2. Migrate existing question conditions (no-op if 0 rows, safe regardless)
    await queryRunner.query(`
      INSERT INTO "step_conditions"
        ("step_id", "order", "logical_operator", "condition_type", "condition_question_id", "condition_value")
      SELECT
        "step_id",
        1,
        NULL,
        'question',
        "condition_question_id",
        "condition_value"
      FROM "campaign_steps"
      WHERE "condition_question_id" IS NOT NULL
    `);

    // 3. Drop old columns from campaign_steps
    await queryRunner.query(`
      ALTER TABLE "campaign_steps"
        DROP CONSTRAINT IF EXISTS "FK_3d6c54bdc0322d37193ae280cf4"
    `);

    await queryRunner.query(`
      ALTER TABLE "campaign_steps"
        DROP COLUMN "condition_question_id"
    `);

    await queryRunner.query(`
      ALTER TABLE "campaign_steps"
        DROP COLUMN "condition_value"
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // 1. Recreate columns on campaign_steps
    await queryRunner.query(`
      ALTER TABLE "campaign_steps"
        ADD COLUMN "condition_question_id" uuid
    `);

    await queryRunner.query(`
      ALTER TABLE "campaign_steps"
        ADD COLUMN "condition_value" character varying(50)
    `);

    await queryRunner.query(`
      ALTER TABLE "campaign_steps"
        ADD CONSTRAINT "FK_3d6c54bdc0322d37193ae280cf4"
          FOREIGN KEY ("condition_question_id")
          REFERENCES "questions"("question_id")
          ON DELETE SET NULL
    `);

    // 2. Restore data from step_conditions (only question-type, order=1)
    await queryRunner.query(`
      UPDATE "campaign_steps" cs
      SET
        "condition_question_id" = sc."condition_question_id",
        "condition_value"       = sc."condition_value"
      FROM "step_conditions" sc
      WHERE sc."step_id" = cs."step_id"
        AND sc."order" = 1
        AND sc."condition_type" = 'question'
    `);

    // 3. Drop step_conditions table
    await queryRunner.query(`DROP TABLE "step_conditions"`);
  }
}
