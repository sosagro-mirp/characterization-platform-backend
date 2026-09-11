import { MigrationInterface, QueryRunner } from 'typeorm';

// Spec 84, Fase 1 — depuración de instrumentos y Registro del productor.
//
//   questions.archived_at        — "editar en sitio + archivar": una pregunta
//                                  con respuestas nunca se borra, se archiva.
//                                  NULL = visible; con fecha = oculta de
//                                  render/formulario público/caché móvil,
//                                  pero sus respuestas se conservan.
//   options_question.archived_at — mismo mecanismo para opciones.
//   farms.corregimiento           — campo nuevo del instrumento de Registro
//                                  (S_REG); no existía ninguna columna de
//                                  finca para esto.
//
// Todo aditivo, nullable, sin default distinto de NULL: ninguna fila
// existente cambia de valor.
export class Spec84ArchiveAndCorregimiento1788100000000 implements MigrationInterface {
  name = 'Spec84ArchiveAndCorregimiento1788100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "questions" ADD "archived_at" TIMESTAMP`,
    );
    await queryRunner.query(
      `ALTER TABLE "options_question" ADD "archived_at" TIMESTAMP`,
    );
    await queryRunner.query(
      `ALTER TABLE "farms" ADD "corregimiento" character varying(100)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "farms" DROP COLUMN "corregimiento"`);
    await queryRunner.query(
      `ALTER TABLE "options_question" DROP COLUMN "archived_at"`,
    );
    await queryRunner.query(
      `ALTER TABLE "questions" DROP COLUMN "archived_at"`,
    );
  }
}
