import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddChangeRequests1781700000005 implements MigrationInterface {
  name = 'AddChangeRequests1781700000005';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "change_requests" (
        "change_request_id"   uuid          NOT NULL DEFAULT gen_random_uuid(),
        "description"         varchar(2000) NOT NULL,
        "status"              varchar(10)   NOT NULL DEFAULT 'open',
        "source"              varchar(10)   NOT NULL,
        "category"            varchar(20)   NULL,
        "local_id"            varchar(36)   NULL,
        "created_by_user_id"  uuid          NOT NULL,
        "farmer_id"           uuid          NULL,
        "resolved_by_user_id" uuid          NULL,
        "resolved_at"         timestamp     NULL,
        "created_at"          timestamp     NOT NULL DEFAULT now(),
        "updated_at"          timestamp     NOT NULL DEFAULT now(),
        CONSTRAINT "PK_change_requests" PRIMARY KEY ("change_request_id")
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "change_requests"
        ADD CONSTRAINT "FK_change_requests_created_by"
          FOREIGN KEY ("created_by_user_id")
          REFERENCES "users"("user_id")
          ON DELETE RESTRICT
    `);

    await queryRunner.query(`
      ALTER TABLE "change_requests"
        ADD CONSTRAINT "FK_change_requests_farmer"
          FOREIGN KEY ("farmer_id")
          REFERENCES "farmers"("id")
          ON DELETE SET NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "change_requests"
        ADD CONSTRAINT "FK_change_requests_resolved_by"
          FOREIGN KEY ("resolved_by_user_id")
          REFERENCES "users"("user_id")
          ON DELETE SET NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "change_requests"
        DROP CONSTRAINT IF EXISTS "FK_change_requests_resolved_by",
        DROP CONSTRAINT IF EXISTS "FK_change_requests_farmer",
        DROP CONSTRAINT IF EXISTS "FK_change_requests_created_by"
    `);

    await queryRunner.query(`DROP TABLE "change_requests"`);
  }
}
