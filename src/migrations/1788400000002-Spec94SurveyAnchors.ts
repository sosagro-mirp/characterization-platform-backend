import { MigrationInterface, QueryRunner } from 'typeorm';

// Spec 94 (H3a), migración 3 — la encuesta sabe de qué finca y de qué cultivo
// de finca habla.
//
//   surveys.farm_id       uuid NULL — FK → farms RESTRICT
//   surveys.farm_crop_id  uuid NULL — FK COMPUESTA (farm_crop_id, farm_id) →
//                          farms_crops (farm_crop_id, farm_id) RESTRICT: el
//                          cultivo debe pertenecer a la finca de la encuesta
//   CHK_surveys_farm_crop_requires_farm — una FK compuesta con una columna NULL
//                          no se evalúa (MATCH SIMPLE); el CHECK cierra ese
//                          hueco: no hay cultivo de finca sin finca.
//   índices en farmer_id (no tenía), farm_id y farm_crop_id
//   farms.name → varchar(255) (D-H3-10)
//
// `surveys.crop_id` se conserva y pasa a ser DERIVADO de `farm_crop_id`
// (`anchorSurvey`, sin trigger — D-H3-9). Todo nullable: ninguna fila cambia de
// valor aquí; los datos los llena la migración 4.
//
// `down` quita lo creado. NO vuelve `farms.name` a varchar(50): acortarlo
// truncaría nombres que hoy caben en 255 (destruiría datos); el ancho mayor es
// inofensivo para el esquema anterior.
export class Spec94SurveyAnchors1788400000002 implements MigrationInterface {
  name = 'Spec94SurveyAnchors1788400000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "surveys" ADD "farm_id" uuid`);
    await queryRunner.query(`ALTER TABLE "surveys" ADD "farm_crop_id" uuid`);
    await queryRunner.query(
      `ALTER TABLE "surveys" ADD CONSTRAINT "FK_surveys_farm" FOREIGN KEY ("farm_id") REFERENCES "farms"("farm_id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "surveys" ADD CONSTRAINT "FK_surveys_farm_crop" FOREIGN KEY ("farm_crop_id", "farm_id") REFERENCES "farms_crops"("farm_crop_id", "farm_id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "surveys" ADD CONSTRAINT "CHK_surveys_farm_crop_requires_farm" CHECK ("farm_crop_id" IS NULL OR "farm_id" IS NOT NULL)`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_surveys_farmer" ON "surveys" ("farmer_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_surveys_farm" ON "surveys" ("farm_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_surveys_farm_crop" ON "surveys" ("farm_crop_id")`,
    );
    await queryRunner.query(
      `ALTER TABLE "farms" ALTER COLUMN "name" TYPE character varying(255)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_surveys_farm_crop"`);
    await queryRunner.query(`DROP INDEX "IDX_surveys_farm"`);
    await queryRunner.query(`DROP INDEX "IDX_surveys_farmer"`);
    await queryRunner.query(
      `ALTER TABLE "surveys" DROP CONSTRAINT "CHK_surveys_farm_crop_requires_farm"`,
    );
    await queryRunner.query(
      `ALTER TABLE "surveys" DROP CONSTRAINT "FK_surveys_farm_crop"`,
    );
    await queryRunner.query(
      `ALTER TABLE "surveys" DROP CONSTRAINT "FK_surveys_farm"`,
    );
    await queryRunner.query(`ALTER TABLE "surveys" DROP COLUMN "farm_crop_id"`);
    await queryRunner.query(`ALTER TABLE "surveys" DROP COLUMN "farm_id"`);
  }
}
