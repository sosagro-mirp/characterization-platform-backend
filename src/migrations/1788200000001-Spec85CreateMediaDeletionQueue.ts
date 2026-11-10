import { MigrationInterface, QueryRunner } from 'typeorm';

// Spec 85, Fase 7 — cola de reintento para el borrado de objetos en R2.
//
// Aditiva: tabla nueva, sin tocar ninguna existente. Solo guarda la clave del
// objeto (no datos personales) y el estado del reintento.
export class Spec85CreateMediaDeletionQueue1788200000001 implements MigrationInterface {
  name = 'Spec85CreateMediaDeletionQueue1788200000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "media_deletion_queue" (
        "id"          uuid         NOT NULL DEFAULT uuid_generate_v4(),
        "storage_key" varchar(500) NOT NULL,
        "attempts"    integer      NOT NULL DEFAULT 0,
        "last_error"  text         NULL,
        "created_at"  TIMESTAMP    NOT NULL DEFAULT now(),
        "deleted_at"  TIMESTAMP    NULL,
        CONSTRAINT "PK_media_deletion_queue" PRIMARY KEY ("id")
      )
    `);

    // Índice parcial: la cola se consulta por «pendientes» (deleted_at IS NULL).
    await queryRunner.query(`
      CREATE INDEX "IDX_media_deletion_queue_pending"
        ON "media_deletion_queue" ("created_at")
        WHERE "deleted_at" IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_media_deletion_queue_pending"`);
    await queryRunner.query(`DROP TABLE "media_deletion_queue"`);
  }
}
