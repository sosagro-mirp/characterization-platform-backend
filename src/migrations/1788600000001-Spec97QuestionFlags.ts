import { MigrationInterface, QueryRunner } from 'typeorm';

// Spec 97 (H4 del spec 83), migración B — dos marcas que `system_field`
// cargaba por accidente.
//
//   questions.is_inverted_scale      boolean NOT NULL DEFAULT false
//       ← antes `system_field LIKE 'inverted:%'` (D-H4-7)
//   questions.is_digital_demand_item boolean NOT NULL DEFAULT false
//       ← antes `system_field = 'Pregunta estratégica de caracterización
//         tecnológica'` (D-H4-6)
//
// Solo esquema y backfill: `system_field` no se toca aquí. Limpiarlo es la
// migración de datos C, que se corre después de que el dashboard lea las
// columnas nuevas.
export class Spec97QuestionFlags1788600000001 implements MigrationInterface {
  name = 'Spec97QuestionFlags1788600000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "questions" ADD "is_inverted_scale" boolean NOT NULL DEFAULT false`,
    );
    await queryRunner.query(
      `ALTER TABLE "questions" ADD "is_digital_demand_item" boolean NOT NULL DEFAULT false`,
    );
    await queryRunner.query(
      `UPDATE "questions" SET "is_inverted_scale" = true
        WHERE "system_field" LIKE 'inverted:%'`,
    );
    await queryRunner.query(
      `UPDATE "questions" SET "is_digital_demand_item" = true
        WHERE "system_field" = 'Pregunta estratégica de caracterización tecnológica'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "questions" DROP COLUMN "is_digital_demand_item"`,
    );
    await queryRunner.query(
      `ALTER TABLE "questions" DROP COLUMN "is_inverted_scale"`,
    );
  }
}
