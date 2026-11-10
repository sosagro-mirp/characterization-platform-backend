import { MigrationInterface, QueryRunner } from 'typeorm';

// Spec 94 (H3a), migración 1 — vínculo N:M productor ↔ finca con rol (D1).
//
//   farmer_farms — un productor puede tener varias fincas y una finca varios
//                  productores. `role` (catálogo D-H3-3, varchar + CHECK) e
//                  `is_primary` (índice único parcial: a lo sumo una principal
//                  por productor). `source` registra quién creó el vínculo.
//
// `farmers.farm_id` NO se toca: queda como ESPEJO de la finca principal hasta
// H8 (la escritura espejo la hace el backend). El backfill copia cada
// `farmers.farm_id` existente como vínculo principal (`role='producer'`,
// `source='backfill'`); es aditivo y se puede relanzar sin duplicar.
//
// `down` borra solo la tabla nueva: los datos de origen (`farmers.farm_id`)
// siguen intactos, así que no se pierde información.
export class Spec94CreateFarmerFarms1788400000000 implements MigrationInterface {
  name = 'Spec94CreateFarmerFarms1788400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "farmer_farms" (
         "farmer_farm_id" uuid NOT NULL DEFAULT gen_random_uuid(),
         "farmer_id" uuid NOT NULL,
         "farm_id" uuid NOT NULL,
         "role" character varying(20) NOT NULL DEFAULT 'producer',
         "is_primary" boolean NOT NULL DEFAULT false,
         "source" character varying(20) NOT NULL,
         "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
         "updated_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
         CONSTRAINT "PK_farmer_farms" PRIMARY KEY ("farmer_farm_id"),
         CONSTRAINT "UQ_farmer_farms_farmer_farm" UNIQUE ("farmer_id", "farm_id"),
         CONSTRAINT "CHK_farmer_farms_role" CHECK ("role" IN ('owner', 'producer', 'manager', 'worker', 'family', 'other'))
       )`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_farmer_farms_primary" ON "farmer_farms" ("farmer_id") WHERE "is_primary" = true`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_farmer_farms_farm" ON "farmer_farms" ("farm_id")`,
    );
    await queryRunner.query(
      `ALTER TABLE "farmer_farms" ADD CONSTRAINT "FK_farmer_farms_farmer" FOREIGN KEY ("farmer_id") REFERENCES "farmers"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "farmer_farms" ADD CONSTRAINT "FK_farmer_farms_farm" FOREIGN KEY ("farm_id") REFERENCES "farms"("farm_id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );

    // Backfill: la finca de cada productor pasa a ser su vínculo principal.
    await queryRunner.query(
      `INSERT INTO "farmer_farms" ("farmer_id", "farm_id", "role", "is_primary", "source")
       SELECT f."id", f."farm_id", 'producer', true, 'backfill'
         FROM "farmers" f
        WHERE f."farm_id" IS NOT NULL
       ON CONFLICT ("farmer_id", "farm_id") DO NOTHING`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "farmer_farms"`);
  }
}
