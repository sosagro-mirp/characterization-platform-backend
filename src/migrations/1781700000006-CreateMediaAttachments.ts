import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateMediaAttachments1781700000006 implements MigrationInterface {
  name = 'CreateMediaAttachments1781700000006';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "media_attachments" (
        "attachment_id"     uuid          NOT NULL DEFAULT uuid_generate_v4(),
        "survey_id"         uuid          NOT NULL,
        "question_id"       uuid          NOT NULL,
        "response_id"       uuid          NULL,
        "storage_key"       varchar(500)  NOT NULL,
        "public_url"        varchar(1000) NULL,
        "original_filename" varchar(255)  NULL,
        "mime_type"         varchar(100)  NOT NULL,
        "file_size_bytes"   bigint        NULL,
        "status"            varchar(20)   NOT NULL DEFAULT 'pending',
        "created_by_id"     uuid          NULL,
        "created_at"        TIMESTAMP     NOT NULL DEFAULT now(),
        "updated_at"        TIMESTAMP     NOT NULL DEFAULT now(),
        CONSTRAINT "PK_media_attachments" PRIMARY KEY ("attachment_id")
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "media_attachments"
        ADD CONSTRAINT "FK_media_attachments_survey"
          FOREIGN KEY ("survey_id")
          REFERENCES "surveys"("survey_id")
          ON DELETE CASCADE
    `);

    await queryRunner.query(`
      ALTER TABLE "media_attachments"
        ADD CONSTRAINT "FK_media_attachments_question"
          FOREIGN KEY ("question_id")
          REFERENCES "questions"("question_id")
          ON DELETE CASCADE
    `);

    await queryRunner.query(`
      ALTER TABLE "media_attachments"
        ADD CONSTRAINT "FK_media_attachments_response"
          FOREIGN KEY ("response_id")
          REFERENCES "responses"("response_id")
          ON DELETE SET NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "media_attachments"
        ADD CONSTRAINT "FK_media_attachments_created_by"
          FOREIGN KEY ("created_by_id")
          REFERENCES "users"("user_id")
          ON DELETE SET NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "media_attachments"
        DROP CONSTRAINT IF EXISTS "FK_media_attachments_created_by",
        DROP CONSTRAINT IF EXISTS "FK_media_attachments_response",
        DROP CONSTRAINT IF EXISTS "FK_media_attachments_question",
        DROP CONSTRAINT IF EXISTS "FK_media_attachments_survey"
    `);

    await queryRunner.query(`DROP TABLE "media_attachments"`);
  }
}
