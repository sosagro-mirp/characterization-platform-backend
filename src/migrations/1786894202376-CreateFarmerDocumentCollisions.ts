import { MigrationInterface, QueryRunner } from 'typeorm';

// Spec 68 — tabla aditiva. Ninguna tabla existente cambia de esquema.
export class CreateFarmerDocumentCollisions1786894202376 implements MigrationInterface {
  name = 'CreateFarmerDocumentCollisions1786894202376';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "farmer_document_collisions" ("collision_id" uuid NOT NULL DEFAULT uuid_generate_v4(), "document_id" character varying(50) NOT NULL, "submitted_name" character varying(255) NOT NULL, "existing_farmer_name" character varying(255) NOT NULL, "resolution" character varying(20), "created_at" TIMESTAMP NOT NULL DEFAULT now(), "resolved_at" TIMESTAMP, "existing_farmer_id" uuid NOT NULL, CONSTRAINT "PK_784e862fe8f368d111a68aece28" PRIMARY KEY ("collision_id"))`,
    );
    await queryRunner.query(
      `ALTER TABLE "farmer_document_collisions" ADD CONSTRAINT "FK_635e1694571b171c7c6f7be5b5a" FOREIGN KEY ("existing_farmer_id") REFERENCES "farmers"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "farmer_document_collisions" DROP CONSTRAINT "FK_635e1694571b171c7c6f7be5b5a"`,
    );
    await queryRunner.query(`DROP TABLE "farmer_document_collisions"`);
  }
}
