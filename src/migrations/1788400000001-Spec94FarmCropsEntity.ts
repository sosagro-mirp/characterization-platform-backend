import { MigrationInterface, QueryRunner } from 'typeorm';

// Spec 94 (H3a), migración 2 — `farms_crops` pasa de tabla puente a entidad
// `FarmCrop` (D-H3-A): las encuestas se anclan a un cultivo de finca, así que
// necesita id propio y nada se borra, se archiva.
//
//   farm_crop_id uuid DEFAULT gen_random_uuid() — nueva PK (las filas
//                  existentes reciben cada una el suyo)
//   created_at / archived_at                    — archivado en vez de borrado
//   UNIQUE (farm_id, crop_id)                   — lo que antes era la PK
//   UNIQUE (farm_crop_id, farm_id)              — destino de la FK compuesta
//                  de `surveys (farm_crop_id, farm_id)` (migración 3): la base
//                  rechaza un cultivo de finca de otra finca
//   FK crop_id → types_of_crops RESTRICT        — antes CASCADE (se archiva,
//                  no se borra el catálogo bajo los pies de una encuesta)
//
// La PK y la FK de `crop_id` las creó `synchronize` con nombre con hash, por
// eso se buscan en `pg_constraint` en vez de asumir el nombre. Ninguna fila se
// borra ni cambia: el número de filas y sus pares (farm_id, crop_id) se
// conservan.
//
// `down` restaura la PK compuesta y la FK en cascada. Las filas archivadas
// representan cultivos que el modelo anterior habría borrado, así que el
// `down` las elimina (después de `Spec94SurveyAnchors.down`, que libera las
// referencias de las encuestas).
export class Spec94FarmCropsEntity1788400000001 implements MigrationInterface {
  name = 'Spec94FarmCropsEntity1788400000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "farms_crops" ADD "farm_crop_id" uuid NOT NULL DEFAULT gen_random_uuid()`,
    );
    await queryRunner.query(
      `ALTER TABLE "farms_crops" ADD "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP`,
    );
    await queryRunner.query(
      `ALTER TABLE "farms_crops" ADD "archived_at" TIMESTAMP`,
    );

    for (const name of await this.constraintNames(queryRunner, 'p')) {
      await queryRunner.query(
        `ALTER TABLE "farms_crops" DROP CONSTRAINT "${name}"`,
      );
    }
    await queryRunner.query(
      `ALTER TABLE "farms_crops" ADD CONSTRAINT "PK_farms_crops" PRIMARY KEY ("farm_crop_id")`,
    );
    await queryRunner.query(
      `ALTER TABLE "farms_crops" ADD CONSTRAINT "UQ_farms_crops_farm_crop" UNIQUE ("farm_id", "crop_id")`,
    );
    await queryRunner.query(
      `ALTER TABLE "farms_crops" ADD CONSTRAINT "UQ_farms_crops_id_farm" UNIQUE ("farm_crop_id", "farm_id")`,
    );

    for (const name of await this.constraintNames(
      queryRunner,
      'f',
      'types_of_crops',
    )) {
      await queryRunner.query(
        `ALTER TABLE "farms_crops" DROP CONSTRAINT "${name}"`,
      );
    }
    await queryRunner.query(
      `ALTER TABLE "farms_crops" ADD CONSTRAINT "FK_farms_crops_crop" FOREIGN KEY ("crop_id") REFERENCES "types_of_crops"("crop_id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Lo archivado es lo que el modelo anterior habría borrado.
    await queryRunner.query(
      `DELETE FROM "farms_crops" WHERE "archived_at" IS NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "farms_crops" DROP CONSTRAINT "FK_farms_crops_crop"`,
    );
    await queryRunner.query(
      `ALTER TABLE "farms_crops" DROP CONSTRAINT "UQ_farms_crops_id_farm"`,
    );
    await queryRunner.query(
      `ALTER TABLE "farms_crops" DROP CONSTRAINT "UQ_farms_crops_farm_crop"`,
    );
    await queryRunner.query(
      `ALTER TABLE "farms_crops" DROP CONSTRAINT "PK_farms_crops"`,
    );
    await queryRunner.query(
      `ALTER TABLE "farms_crops" DROP COLUMN "archived_at"`,
    );
    await queryRunner.query(
      `ALTER TABLE "farms_crops" DROP COLUMN "created_at"`,
    );
    await queryRunner.query(
      `ALTER TABLE "farms_crops" DROP COLUMN "farm_crop_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "farms_crops" ADD CONSTRAINT "PK_farms_crops_farm_crop" PRIMARY KEY ("farm_id", "crop_id")`,
    );
    await queryRunner.query(
      `ALTER TABLE "farms_crops" ADD CONSTRAINT "FK_farms_crops_crop_legacy" FOREIGN KEY ("crop_id") REFERENCES "types_of_crops"("crop_id") ON DELETE CASCADE ON UPDATE CASCADE`,
    );
  }

  /** Nombres de las restricciones de `farms_crops` de un tipo (`p` PK, `f` FK). */
  private async constraintNames(
    queryRunner: QueryRunner,
    type: 'p' | 'f',
    referencedTable?: string,
  ): Promise<string[]> {
    const rows = (
      referencedTable
        ? await queryRunner.query(
            `SELECT c.conname AS name FROM pg_constraint c
              WHERE c.conrelid = 'farms_crops'::regclass AND c.contype = $1
                AND c.confrelid = $2::regclass`,
            [type, referencedTable],
          )
        : await queryRunner.query(
            `SELECT c.conname AS name FROM pg_constraint c
              WHERE c.conrelid = 'farms_crops'::regclass AND c.contype = $1`,
            [type],
          )
    ) as { name: string }[];
    return rows.map((r) => r.name);
  }
}
