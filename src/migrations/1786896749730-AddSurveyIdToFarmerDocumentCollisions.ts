import { MigrationInterface, QueryRunner } from 'typeorm';

// Spec 68 — columna aditiva. Ninguna otra tabla cambia de esquema.
export class AddSurveyIdToFarmerDocumentCollisions1786896749730 implements MigrationInterface {
  name = 'AddSurveyIdToFarmerDocumentCollisions1786896749730';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "farmer_document_collisions" ADD "survey_id" uuid`,
    );
    await queryRunner.query(
      `ALTER TABLE "farmer_document_collisions" ADD CONSTRAINT "FK_6fe5ee57a0a81776e512e0a2e88" FOREIGN KEY ("survey_id") REFERENCES "surveys"("survey_id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "farmer_document_collisions" DROP CONSTRAINT "FK_6fe5ee57a0a81776e512e0a2e88"`,
    );
    await queryRunner.query(
      `ALTER TABLE "farmer_document_collisions" DROP COLUMN "survey_id"`,
    );
  }
}
