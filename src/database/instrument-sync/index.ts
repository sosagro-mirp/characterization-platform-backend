/**
 * Spec 84, Fase 3 — herramienta de copia y promoción de instrumentos entre
 * entornos. Ver `backend/docs/instrument-sync.md` para el procedimiento
 * operativo completo (snapshot a desarrollo, ensayo en rama de Neon,
 * promoción a producción).
 *
 * Es una librería pura (sin dependencia de Nest ni de la API HTTP): recibe
 * un `DataSource` de TypeORM ya conectado y no asume ningún contexto de
 * request. El CLI (`cli.ts`) es el único que decide a qué base conectarse.
 */
export * from './types';
export { exportManifest } from './export';
export { buildPlan } from './plan';
export { applyPlan, type ApplyOptions } from './apply';
export { restoreFromBackup } from './restore';
export { generateInventory } from './inventory';
export { snapshot } from './snapshot';
export {
  exportCampaigns,
  insertCampaigns,
  type CampaignSnapshotCampaign,
} from './campaigns';
