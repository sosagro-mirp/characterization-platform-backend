/**
 * Contrato de respuesta de `GET /api/farmers/:id/deletion-preview` y de
 * `DELETE /api/farmers/:id/cascade` (spec 73). En el preview, `counts`
 * describe lo que se borraría; en el resultado del borrado, lo que
 * efectivamente se borró.
 */
export interface FarmDeletionInfo {
  farmId: string;
  name: string;
  /** `true` si otro agricultor además de este referencia la misma finca. */
  shared: boolean;
  /** `false` cuando la finca es compartida: sobrevive al borrado. */
  willBeDeleted: boolean;
}

export interface DeletionCounts {
  farms: number;
  campaignSessions: number;
  surveys: number;
  responses: number;
  documentCollisions: number;
  relations: number;
}

export class FarmerDeletionPreviewDto {
  farmerId: string;
  name: string;
  documentId: string | null;
  counts: DeletionCounts;
  farm: FarmDeletionInfo | null;
  /**
   * Registros que sobreviven al borrado porque su FK es `SET NULL`
   * (`change_requests.farmer_id`), para que el inventario no dé la impresión
   * de que se pierden en silencio.
   */
  preserved: { changeRequests: number };
}
