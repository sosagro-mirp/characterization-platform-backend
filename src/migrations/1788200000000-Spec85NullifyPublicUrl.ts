import { MigrationInterface, QueryRunner } from 'typeorm';

// Spec 85, Fase 6 — retirada de `publicUrl`.
//
// La evidencia multimedia se lee ahora por URL firmada bajo demanda
// (`GET /media-attachments/:id/download-url`); las URL públicas almacenadas
// dejan de tener uso y de ser válidas una vez cerrado el bucket.
//
// Se CONSERVA la columna `public_url` (decisión D1): un `DROP COLUMN` es
// irreversible y obligaría a que ningún despliegue en vuelo la lea. El `DROP`
// queda en `spec/backlog.md` para cuando `publicUrl` haya desaparecido de todo
// contrato.
//
// ⚠️ `down` NO restaura los valores: las URL se derivaban de
// `R2_PUBLIC_BASE_URL` + `storage_key` y no se guardan copias. Solo se
// reversa el esquema (que aquí no cambia), no el dato.
export class Spec85NullifyPublicUrl1788200000000 implements MigrationInterface {
  name = 'Spec85NullifyPublicUrl1788200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "media_attachments" SET "public_url" = NULL`,
    );
  }

  public async down(): Promise<void> {
    // Intencionalmente vacío: los valores anulados no se pueden reconstruir
    // sin conocer el `R2_PUBLIC_BASE_URL` de cada entorno.
  }
}
