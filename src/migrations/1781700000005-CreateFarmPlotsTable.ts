import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateFarmPlotsTable1781700000005 implements MigrationInterface {
  name = 'CreateFarmPlotsTable1781700000005';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "farm_plots" (
        "farm_plot_id"      uuid              NOT NULL DEFAULT uuid_generate_v4(),
        "name"              varchar(100)      NOT NULL,
        "description"       varchar(255)      NULL,
        "polygon"           jsonb             NULL,
        "area"              float             NULL,
        "captured_offline"  boolean           NOT NULL DEFAULT false,
        "farm_id"           uuid              NOT NULL,
        "created_at"        timestamp         NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updated_at"        timestamp         NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "PK_farm_plots" PRIMARY KEY ("farm_plot_id"),
        CONSTRAINT "FK_farm_plots_farm"
          FOREIGN KEY ("farm_id")
          REFERENCES "farms"("farm_id")
          ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_farm_plots_farm_id" ON "farm_plots" ("farm_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "farm_plots"`);
  }
}
