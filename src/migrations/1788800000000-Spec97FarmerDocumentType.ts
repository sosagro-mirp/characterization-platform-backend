import { MigrationInterface, QueryRunner } from 'typeorm';

// Spec 97 (H4 del spec 83), migración A — tipo de documento del productor.
//
//   farmers.document_type  varchar(10) NULL — CC | TI | CE | PPT | PEP | NIT | OTRO
//
// Solo esquema: las filas existentes quedan en NULL y se completan por la
// extracción («solo completar vacíos», spec 95).
export class Spec97FarmerDocumentType1788800000000 implements MigrationInterface {
  name = 'Spec97FarmerDocumentType1788800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "farmers" ADD "document_type" character varying(10)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "farmers" DROP COLUMN "document_type"`,
    );
  }
}
