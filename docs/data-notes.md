# Notas para quien analiza los datos

Casos donde el dato, tal como aparece en la base, no es un error — aunque a
primera vista parezca uno. Pensado para quien consulte la base directamente
(reportes, dashboards, auditorías), no para desarrollo.

---

## Sesiones de campaña sin agricultor (`campaign_sessions.farmer_id IS NULL`)

**No es corrupción de datos.** Es un estado legítimo producido por un flujo de
recuperación del cliente móvil offline-first.

**Cómo se produce:** cuando el encuestador identifica a un agricultor en modo
offline, la app móvil le asigna un ID provisional local. Si al sincronizar esa
identidad ya no resuelve contra el backend (por ejemplo, el agricultor fue
eliminado entre la identificación offline y la sincronización) y la API
responde `404 Farmer not found`, el cliente reintenta crear la sesión de
campaña **sin `farmerId`**, para no bloquear al encuestador en medio de una
jornada de campo ni perder la sesión completa.

**Consecuencia:** esa sesión, y las respuestas que cuelgan de ella, quedan
huérfanas de identidad de agricultor de forma permanente — no hay un segundo
intento de asociarlas a un agricultor después.

**Origen:** `spec/49_correccion_identidad_offline_agricultor_cultivos.md`
(implementó el reintento tras 404) y
`spec/51_limpieza_identidad_provisional_post_sync.md` (documentó este
comportamiento como legítimo, sin cambiarlo). Ver el comentario de contrato en
`src/campaign-sessions/campaign-sessions.service.ts`, junto a la creación de
la sesión.

**Al interpretar reportes:** una sesión sin agricultor no implica un fallo de
captura ni una encuesta inválida — las respuestas siguen siendo datos válidos
del instrumento, solo que no se pueden atribuir a un agricultor identificado
en el sistema.
