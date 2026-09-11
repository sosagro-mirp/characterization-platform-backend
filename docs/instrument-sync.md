# `instrument-sync` — copia y promoción de instrumentos entre entornos

> Spec 84, Fase 3. Herramienta de línea de comandos, sin endpoint HTTP. Vive
> en `src/database/instrument-sync/` y se invoca con `pnpm instruments:*`.

## Qué es y qué no es

- **Es** la manera de copiar el contenido de instrumentos (instrumentos →
  secciones → preguntas → opciones) entre producción y desarrollo, y de
  llevar de vuelta a producción lo que se depure en desarrollo, sin editar
  directamente en producción.
- **No** es una migración de esquema (eso lo siguen resolviendo las
  migraciones TypeORM de siempre) ni un reemplazo del MCP para depurar
  contenido — trabajan juntos: el MCP edita en desarrollo, esta herramienta
  lleva lo depurado a producción.
- **Nunca borra respuestas ni datos personales.** Las guardas 409 del spec 84
  (Fase 1) bloquean cualquier operación que lo intentaría; esta herramienta
  respeta esas mismas reglas al calcular el plan.

## Conexiones — siempre explícitas

Nunca se toma `DATABASE_URL` de forma implícita. Cada comando que toca una
base pide una o ambas de estas variables:

| Variable | Uso |
|---|---|
| `SYNC_SOURCE_DATABASE_URL` | De dónde se exporta o con qué se compara |
| `SYNC_TARGET_DATABASE_URL` | A dónde se aplica o se hace snapshot |

Si el destino parece producción (URL con `neon.tech` o `railway`), `apply` y
`restore` exigen además `--production-target-confirm` — y ese flag solo se
usa después de que el usuario lo haya confirmado explícitamente en la sesión.
`snapshot` **rechaza de plano** un destino que parezca producción, sin flag
que lo salve: existe para reemplazar contenido a ciegas en desarrollo, nunca
para tocar datos reales.

## Los comandos

### 1. `pnpm instruments:export`

Exporta instrumentos a un archivo JSON (el "manifiesto"). Sin datos
personales: cada pregunta y opción lleva su `responseCount`, nunca el
contenido de las respuestas. Los catálogos (departamento, municipio,
cultivo, tipo de actor) se guardan por **nombre**, no por UUID — los UUID de
esas tablas no coinciden entre entornos.

```bash
SYNC_SOURCE_DATABASE_URL=... pnpm instruments:export -- --out prod.json
# Solo algunos instrumentos:
SYNC_SOURCE_DATABASE_URL=... pnpm instruments:export -- --out prod.json --instruments <uuid1>,<uuid2>
```

### 2. `pnpm instruments:snapshot`

Reemplaza **todo** el contenido de instrumentos del destino por el del
origen, conservando los UUID. Antes de insertar, borra en el destino las
encuestas de prueba y todo lo que depende de ellas — pero **conserva
agricultores y fincas**. Se detiene si encuentra una tabla dependiente que no
reconoce (más seguro que adivinar). Solo funciona si el destino no parece
producción.

```bash
SYNC_SOURCE_DATABASE_URL=<prod> SYNC_TARGET_DATABASE_URL=<dev> pnpm instruments:snapshot
```

Uso previsto: traer producción a desarrollo antes de empezar a depurar
(Fase 7 del spec 84).

### 3. `pnpm instruments:plan`

La simulación. Compara tres manifiestos:

- **`--base`**: producción en el momento del snapshot.
- **`--desired`**: desarrollo, ya depurado.
- **`--current`**: producción en este momento (puede haber cambiado desde
  el snapshot).

No escribe nada. Devuelve una lista de operaciones (crear / actualizar /
archivar / desarchivar / borrar) y de **conflictos** que bloquean aplicar el
plan tal cual:

| Conflicto | Cuándo aparece |
|---|---|
| `delete_with_responses` | Desarrollo quiere borrar algo que ya tiene respuestas en el destino |
| `type_change_with_responses` | Desarrollo cambió el tipo de una pregunta que ya tiene respuestas |
| `changed_in_target` | La misma entidad cambió en producción después del snapshot **y** en desarrollo — no hay forma automática de decidir cuál gana |
| `unresolved_metadata` | Una opción referencia un departamento/municipio/cultivo/tipo de actor que no existe en el destino con ese nombre |

```bash
pnpm instruments:plan -- --base prod-base.json --desired dev.json --current prod-actual.json --out plan.json
```

### 4. `pnpm instruments:apply`

Aplica un plan **sin conflictos**. Antes de escribir:

1. Vuelve a exportar el destino y lo compara contra el estado con el que se
   calculó el plan (`--current` de ese momento). Si algo cambió desde
   entonces, **aborta sin escribir nada** — hay que recalcular el plan.
2. Ese export fresco es el respaldo (guárdelo con `--out-backup`).
3. Aplica todo en una sola transacción: si algo falla a mitad de camino, no
   queda nada a medias.

```bash
SYNC_TARGET_DATABASE_URL=<prod> pnpm instruments:apply -- --plan plan.json --out-backup respaldo.json --production-target-confirm
```

### 5. `pnpm instruments:restore`

Vuelve el destino exactamente al estado de un respaldo (el que generó
`apply`), calculando y aplicando por el mismo motor qué hace falta cambiar.
Si algo recibió una respuesta real después de tomarse el respaldo, se
detiene con el mismo tipo de conflicto que un plan normal — nunca descarta
datos nuevos en silencio.

```bash
SYNC_TARGET_DATABASE_URL=<prod> pnpm instruments:restore -- --backup respaldo.json --production-target-confirm
```

### 6. `pnpm instruments:verify`

Compara un manifiesto contra el estado actual de una base y dice si
coinciden exactamente (mismo mecanismo que `plan`, reportando 0
operaciones/0 conflictos como éxito).

### 7. `pnpm instruments:inventory`

Genera un Markdown con la lista de instrumentos de un manifiesto (nombre,
código, activo/público, conteos) — insumo de
`docs/reports/instruments/inventario-084-post-spec82.md` (Fase 9).

## Procedimiento recomendado de promoción a producción

1. `instruments:export` contra producción → `base.json`. Guardarlo fuera de
   git (`.instrument-sync/`, ya en `.gitignore`).
2. Depurar en desarrollo (a mano en el admin, o con el MCP `sosagro-admin`).
3. `instruments:export` contra desarrollo → `dev.json`.
4. `instruments:export` contra producción de nuevo → `prod-actual.json`
   (por si cambió desde el paso 1).
5. `instruments:plan --base base.json --desired dev.json --current prod-actual.json`.
   Revisar el plan a mano — nunca aplicar un plan con conflictos sin
   resolverlos primero.
6. **Ensayar en una rama de Neon** creada por el usuario: `apply` contra esa
   rama, `verify`, y revisar a mano en el admin de esa rama.
7. Con el ensayo aprobado, `apply` contra producción real, con
   `--production-target-confirm` y solo tras la confirmación explícita del
   usuario en la misma sesión.
8. `verify` contra producción para confirmar que quedó igual al manifiesto
   deseado.

## Qué hacer si algo sale mal

- Si `apply` lanza un error de "el destino cambió desde que se generó el
  plan": no se escribió nada. Recalcular el plan desde el paso 4 de arriba.
- Si algo se aplicó y hay que deshacerlo: `instruments:restore` con el
  `--out-backup` que generó ese mismo `apply`.
- Si la restauración también falla (conflicto): el rollback de esquema/datos
  a nivel de base de datos (branch de Neon a un punto en el tiempo) lo decide
  el usuario — ver "Rollback de emergencia" en `CLAUDE.md`.
