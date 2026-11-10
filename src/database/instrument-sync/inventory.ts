import { InstrumentManifest } from './types';

/**
 * Spec 84, Fase 9 — inventario en Markdown a partir de un manifiesto, para
 * `docs/reports/instruments/inventario-084-post-spec82.md`.
 */
export function generateInventory(manifest: InstrumentManifest): string {
  const lines: string[] = [
    `# Inventario de instrumentos — spec 84`,
    ``,
    `> Generado desde un manifiesto de \`instrument-sync\` (\`exportedAt: ${manifest.exportedAt}\`).`,
    ``,
    `| Instrumento | Código | Activo | Público | Secciones | Preguntas | Opciones | Respuestas |`,
    `|---|---|---|---|---|---|---|---|`,
  ];

  for (const instrument of manifest.instruments) {
    const questions = instrument.sections.flatMap((s) => s.questions);
    const options = questions.flatMap((q) => q.options);
    const responseCount = questions.reduce(
      (sum, q) => sum + q.responseCount,
      0,
    );
    lines.push(
      `| ${instrument.name} | ${instrument.code ?? '—'} | ${instrument.isActive ? 'sí' : 'no'} | ` +
        `${instrument.isPublic ? 'sí' : 'no'} | ${instrument.sections.length} | ${questions.length} | ` +
        `${options.length} | ${responseCount} |`,
    );
  }

  lines.push('', `Total: ${manifest.instruments.length} instrumentos.`);
  return lines.join('\n');
}
