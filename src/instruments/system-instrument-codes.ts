/**
 * Códigos de los instrumentos de sistema (identificación S1/S2, el
 * diagnóstico de barreras digitales, y el Registro del productor). No son
 * elegibles como pasos de campaña ni deben aparecer en el selector de
 * instrumentos disponibles para armar una campaña — spec 25.
 *
 * 2026-08-22 — corrección: `instruments.code` se usaba antes como señal
 * única de "instrumento de sistema" (`code != null` ⇒ sistema), porque solo
 * estos 3 instrumentos tenían `code`. El backfill del spec 43
 * (`BackfillInstrumentCodes`) le puso `code` a los 36 instrumentos —
 * ahora `code` significa "categoría de dashboard" para el resto, y
 * `code != null` deja de identificar correctamente a los de sistema.
 * Se reemplaza esa comprobación por esta lista explícita en los sitios que
 * antes usaban `code != null` con ese sentido
 * (`campaign-steps.service.ts`, `instruments.service.ts` findAll con
 * `excludeSystem`). No es una migración de esquema: no había ningún campo
 * dedicado a "es instrumento de sistema" antes de este backfill tampoco.
 *
 * 2026-09-11 (spec 84) — se agrega `S_REG`, el instrumento de Registro del
 * productor que reemplaza a S1a+S1b en la pre-encuesta de campo. S1a y S1b
 * se mantienen en la lista (y sus alias legados `S1`/`S2` en
 * `InstrumentsService.LEGACY_CODE_ALIASES`): quedan como "sistema
 * histórico" mientras existan encuestas de campo con esos códigos, y se
 * retiran de aquí solo en H8 del spec 83.
 */
export const SYSTEM_INSTRUMENT_CODES = [
  'S1a',
  'S1b',
  'S_DCU',
  'S_REG',
] as const;

export function isSystemInstrumentCode(
  code: string | null | undefined,
): boolean {
  return (
    code != null &&
    (SYSTEM_INSTRUMENT_CODES as readonly string[]).includes(code)
  );
}
