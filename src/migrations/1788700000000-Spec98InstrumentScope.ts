import { MigrationInterface, QueryRunner } from 'typeorm';

// Spec 98 (Fase 2) — alcance declarado por instrumento. No destructiva: solo
// agrega columnas nulas y una tabla vacía; ningún dato existente cambia.
//
//   instruments.scope_level     varchar(20) NULL — farmer | farm | farm_crop
//                               (nulo = sin declarar)
//   instruments.coverage_group  varchar(50) NULL — columna compartida en cobertura
//   instruments_crops           cultivos a los que aplica un instrumento farm_crop
//                               (sin filas = todos los cultivos)
//
// Timestamp `17887…`: debe quedar ANTES de `Spec97SystemFieldData`, que será la
// última migración pendiente (ver spec 98, "Notas técnicas").
export class Spec98InstrumentScope1788700000000 implements MigrationInterface {
  name = 'Spec98InstrumentScope1788700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "instruments" ADD "scope_level" character varying(20)`,
    );
    await queryRunner.query(
      `ALTER TABLE "instruments" ADD "coverage_group" character varying(50)`,
    );
    await queryRunner.query(
      `ALTER TABLE "instruments" ADD CONSTRAINT "CHK_instruments_scope_level" CHECK ("scope_level" IS NULL OR "scope_level" IN ('farmer', 'farm', 'farm_crop'))`,
    );
    await queryRunner.query(
      `CREATE TABLE "instruments_crops" (
        "instrument_id" uuid NOT NULL,
        "crop_id" uuid NOT NULL,
        CONSTRAINT "PK_instruments_crops" PRIMARY KEY ("instrument_id", "crop_id")
      )`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_instruments_crops_crop" ON "instruments_crops" ("crop_id")`,
    );
    await queryRunner.query(
      `ALTER TABLE "instruments_crops" ADD CONSTRAINT "FK_instruments_crops_instrument" FOREIGN KEY ("instrument_id") REFERENCES "instruments"("instrument_id") ON DELETE CASCADE ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "instruments_crops" ADD CONSTRAINT "FK_instruments_crops_crop" FOREIGN KEY ("crop_id") REFERENCES "types_of_crops"("crop_id") ON DELETE CASCADE ON UPDATE CASCADE`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "instruments_crops"`);
    await queryRunner.query(
      `ALTER TABLE "instruments" DROP CONSTRAINT "CHK_instruments_scope_level"`,
    );
    await queryRunner.query(
      `ALTER TABLE "instruments" DROP COLUMN "coverage_group"`,
    );
    await queryRunner.query(
      `ALTER TABLE "instruments" DROP COLUMN "scope_level"`,
    );
  }
}
