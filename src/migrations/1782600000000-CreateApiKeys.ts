import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateApiKeys1782600000000 implements MigrationInterface {
  name = 'CreateApiKeys1782600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "api_keys" (
        "api_key_id"     uuid          NOT NULL DEFAULT uuid_generate_v4(),
        "name"           varchar(100)  NOT NULL,
        "key_prefix"     varchar(16)   NOT NULL,
        "key_hash"       varchar(255)  NOT NULL,
        "scopes"         text[]        NOT NULL,
        "user_id"        uuid          NOT NULL,
        "created_by_id"  uuid          NULL,
        "expires_at"     TIMESTAMP     NULL,
        "revoked_at"     TIMESTAMP     NULL,
        "last_used_at"   TIMESTAMP     NULL,
        "created_at"     TIMESTAMP     NOT NULL DEFAULT now(),
        "updated_at"     TIMESTAMP     NOT NULL DEFAULT now(),
        CONSTRAINT "PK_api_keys" PRIMARY KEY ("api_key_id"),
        CONSTRAINT "UQ_api_keys_key_prefix" UNIQUE ("key_prefix")
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "api_keys"
        ADD CONSTRAINT "FK_api_keys_user"
          FOREIGN KEY ("user_id")
          REFERENCES "users"("user_id")
          ON DELETE CASCADE
    `);

    await queryRunner.query(`
      ALTER TABLE "api_keys"
        ADD CONSTRAINT "FK_api_keys_created_by"
          FOREIGN KEY ("created_by_id")
          REFERENCES "users"("user_id")
          ON DELETE SET NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "api_keys"
        DROP CONSTRAINT IF EXISTS "FK_api_keys_created_by",
        DROP CONSTRAINT IF EXISTS "FK_api_keys_user"
    `);

    await queryRunner.query(`DROP TABLE "api_keys"`);
  }
}
