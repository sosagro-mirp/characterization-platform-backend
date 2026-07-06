import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateFarmPlotsTable1781700000007 implements MigrationInterface {
  name = 'CreateFarmPlotsTable1781700000007';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "farm_plots" (
        "farm_plot_id"     uuid                        NOT NULL DEFAULT uuid_generate_v4(),
        "name"             character varying(100)      NOT NULL,
        "description"      character varying(255)      NULL,
        "polygon"          jsonb                       NULL,
        "area"             double precision            NULL,
        "captured_offline" boolean                     NOT NULL DEFAULT false,
        "created_at"       timestamp without time zone NOT NULL DEFAULT now(),
        "updated_at"       timestamp without time zone NOT NULL DEFAULT now(),
        "farm_id"          uuid                        NOT NULL,
        CONSTRAINT "PK_0b0978614d959d913738c535a19" PRIMARY KEY ("farm_plot_id")
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "farm_plots"
        ADD CONSTRAINT "FK_9bd4bb85c6e47bace534c4554a1"
          FOREIGN KEY ("farm_id")
          REFERENCES "farms"("farm_id")
          ON DELETE CASCADE
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "farm_plots"
        DROP CONSTRAINT IF EXISTS "FK_9bd4bb85c6e47bace534c4554a1"
    `);

    await queryRunner.query(`DROP TABLE "farm_plots"`);
  }
}
