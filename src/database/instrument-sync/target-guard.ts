/**
 * Decide si una URL de base de datos debe tratarse como producción.
 *
 * Falla cerrada: toda base gestionada (Neon, Railway) se considera producción
 * salvo que su host esté declarado explícitamente como desarrollo en
 * `SYNC_DEV_DATABASE_HOSTS` (lista separada por comas). Desde 2026-10-13 la
 * base de desarrollo también vive en Neon, así que el dominio ya no basta para
 * distinguirlas — y una variable olvidada debe bloquear, no abrir.
 */
export function looksLikeProduction(
  url: string,
  devHosts: string | undefined = process.env.SYNC_DEV_DATABASE_HOSTS,
): boolean {
  const managed = url.includes('neon.tech') || url.includes('railway');
  if (!managed) return false;

  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    return true;
  }

  const declared = (devHosts ?? '')
    .split(',')
    .map((h) => h.trim())
    .filter(Boolean);
  return !declared.includes(host);
}
