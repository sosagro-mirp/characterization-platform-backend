/**
 * Spec 85, Fase 8 — guarda de `scripts/audit-orphan-media.ts --delete`.
 *
 * El bucket de R2 es compartido entre desarrollo y producción, pero cada
 * informe de auditoría se calcula contra UNA base: un objeto sin fila en esa
 * base puede tener fila en la otra. Por eso solo se borran las claves que son
 * huérfanas en dos informes del mismo bucket, generados contra bases distintas
 * y recientes (el bucket cambia con cada subida).
 */

export interface OrphanReportSummary {
  bucket: string;
  database: string;
  generatedAt: string;
  orphanObjects: string[];
}

const MAX_REPORT_AGE_MS = 24 * 60 * 60 * 1000;

export function selectCrossCheckedOrphans(input: {
  primary: OrphanReportSummary;
  cross: OrphanReportSummary;
  envBucket: string;
  envDatabase: string;
  now: Date;
}): string[] {
  const { primary, cross, envBucket, envDatabase, now } = input;

  for (const report of [primary, cross]) {
    if (report.bucket !== envBucket) {
      throw new Error(
        `El informe de «${report.database}» es del bucket «${report.bucket}» pero el .env apunta a «${envBucket}». Se aborta.`,
      );
    }
    const age = now.getTime() - new Date(report.generatedAt).getTime();
    if (!(age <= MAX_REPORT_AGE_MS)) {
      throw new Error(
        `El informe de «${report.database}» (${report.generatedAt}) tiene más de 24 horas. Regenérelo antes de borrar.`,
      );
    }
  }

  if (primary.database === cross.database) {
    throw new Error(
      `Los dos informes son de la misma base («${primary.database}»). ` +
        `El cruce exige un informe de cada entorno. Se aborta.`,
    );
  }

  // El informe principal autoriza el borrado: debe ser de la base del .env.
  if (primary.database !== envDatabase) {
    throw new Error(
      `El informe principal es de la base «${primary.database}» pero el .env apunta a «${envDatabase}». Se aborta.`,
    );
  }

  const crossOrphans = new Set(cross.orphanObjects);
  return primary.orphanObjects.filter((key) => crossOrphans.has(key));
}
