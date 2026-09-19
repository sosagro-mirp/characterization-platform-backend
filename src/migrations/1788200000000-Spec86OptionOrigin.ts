import { MigrationInterface, QueryRunner } from 'typeorm';

// Spec 86 — la opción "Otros" guarda el texto en la respuesta.
//
//   options_question.origin — 'instrument' (opción del instrumento, la de
//                             siempre) o 'field' (creada desde campo por un
//                             cliente viejo o migrada por el script de datos
//                             legados). Las 'field' nacen archivadas y el
//                             backend normaliza sus respuestas a la opción
//                             "Otros" hermana con el texto de la opción.
//
// Aditiva: todas las filas existentes quedan en 'instrument'. El script
// `run-migrate-other-options` es el que marca las legadas como 'field'.
export class Spec86OptionOrigin1788200000000 implements MigrationInterface {
  name = 'Spec86OptionOrigin1788200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "options_question" ADD "origin" character varying(16) NOT NULL DEFAULT 'instrument'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "options_question" DROP COLUMN "origin"`,
    );
  }
}
