/**
 * Contrato de respuesta de `GET /api/farmers/:id/deletion-preview` y de
 * `DELETE /api/farmers/:id/cascade` (spec 73). En el preview, `counts`
 * describe lo que se borraría; en el resultado del borrado, lo que
 * efectivamente se borró.
 */
export interface FarmDeletionInfo {
  farmId: string;
  name: string;
  /** `true` si otro agricultor la tiene vinculada o hay encuestas ajenas ancladas a ella. */
  shared: boolean;
  /** `false` cuando la finca es compartida: sobrevive al borrado. */
  willBeDeleted: boolean;
  /**
   * Spec 99 — `'selection'` si la finca tiene decisiones de selección: no se
   * borra, y el borrado en cascada del productor se rechaza con 409.
   */
  blockedBy?: 'selection';
}

export interface DeletionCounts {
  farms: number;
  campaignSessions: number;
  surveys: number;
  responses: number;
  documentCollisions: number;
  relations: number;
  /** Constancias de consentimiento informado (spec 78). */
  consentRecords: number;
}

export class FarmerDeletionPreviewDto {
  farmerId: string;
  name: string;
  documentId: string | null;
  counts: DeletionCounts;
  /** La finca principal (contrato histórico). */
  farm: FarmDeletionInfo | null;
  /**
   * Spec 94 — TODAS las fincas del productor (N:M) con su destino. "Compartida"
   * = otro productor la tiene vinculada, o hay encuestas de otro productor
   * ancladas a ella.
   */
  farms: FarmDeletionInfo[];
  /**
   * Registros que sobreviven al borrado porque su FK es `SET NULL`
   * (`change_requests.farmer_id`), para que el inventario no dé la impresión
   * de que se pierden en silencio.
   */
  preserved: { changeRequests: number };
  /**
   * Objetos de multimedia en R2 del agricultor (spec 85). Solo lo informa el
   * borrado (`DELETE .../cascade`): `deleted` = eliminados del bucket,
   * `queued` = fallaron y quedaron en `media_deletion_queue` para reintento.
   */
  mediaObjects?: { deleted: number; queued: number };
}
