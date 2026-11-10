# `public-submissions` — operación sobre los envíos públicos pendientes

> Spec 93, Fases 3 y 8. Herramienta de línea de comandos, sin endpoint HTTP.
> Vive en `src/database/public-submissions/` y se invoca con
> `pnpm public-submissions:plan|apply|revert`. Sigue el patrón de
> `docs/instrument-sync.md` (conexión explícita, guarda de producción, ensayo
> en rama de Neon).

## Qué es y qué no es

- **Es** la manera de incorporar a la base los envíos del canal público que
  quedaron `pending` (talleres de productores) con la misma lógica que hoy
  aplica el botón «Procesar» de la bandeja: `SurveysService.processPublicSubmission`
  y `discardPublicSubmission`. La CLI no reimplementa nada; solo valida,
  fotografía el estado antes y después, escribe un log por envío y se detiene
  al primer error.
- **No** procesa envíos nuevos del día a día (eso es la bandeja) ni corrige el
  contenido de las respuestas.
- **No hay borrado de respuestas.** `revert` solo devuelve el envío a
  `pending` y deshace lo que `apply` creó o completó.

## Datos personales

Los reportes, plantillas de decisiones y logs incluyen nombre, documento y
teléfono de personas. Se escriben por defecto en `.public-submissions/`
(ignorado por git, ver `.gitignore`). No se suben a git, a chats ni a
tableros; se comparten solo dentro del equipo del proyecto.

## Conexión — siempre explícita

Nunca se toma `DATABASE_URL` del `.env`. Los tres comandos leen:

| Variable | Uso |
|---|---|
| `SYNC_TARGET_DATABASE_URL` | Base sobre la que se planea, aplica o revierte |

(La misma variable que `instrument-sync`, para reutilizar la URL de la rama de
ensayo.) Si la URL contiene `neon.tech` o `railway` —incluidas las **ramas de
Neon**, por eso el ensayo también lo pide— `apply` y `revert` exigen:

1. `--production-target-confirm`, y solo después de que el usuario lo haya
   confirmado de forma explícita en la sesión;
2. escribir el **número de envíos** (a procesar en `apply`, a revertir en
   `revert`) cuando la CLI lo pregunta. En ejecuciones sin terminal se pasa
   con `--confirm-count <n>`; sigue siendo una decisión consciente, no un
   valor por defecto.

`plan` es solo lectura y no exige nada.

## Los comandos

### 1. `pnpm public-submissions:plan`

Solo lectura: llama a `previewPublicSubmission` (que no escribe, ni siquiera la
fila de colisión) por cada envío `pending` del instrumento del taller
(`f24739ee-9617-46e3-a2e4-9424b6aced82`) o de los que se indiquen.

```bash
SYNC_TARGET_DATABASE_URL=<url> pnpm public-submissions:plan -- [--instruments <id1,id2>] [--out-dir <dir>]
```

Escribe tres archivos en `.public-submissions/reports/` (o `--out-dir`):

| Archivo | Contenido |
|---|---|
| `plan-<fecha>.json` | Reporte completo por envío (vista previa de la API, clasificación, repetidos) |
| `plan-<fecha>.md` | El mismo reporte legible para revisarlo con el usuario |
| `plan-<fecha>.decisions.template.json` | Plantilla de decisiones con **todo en `leave_pending`** y una nota por envío |

Clasificaciones (un envío puede tener varias; `clean` solo si no tiene otra):

| Clase | Significado |
|---|---|
| `clean` | Productor nuevo sin nada que decidir |
| `existing_same_person` | El documento (o nombre + teléfono) ya es de un productor compatible: se vincula y se completan solo campos vacíos |
| `collision` | El documento existe a nombre de otra persona: exige `resolution` |
| `shared_farm_candidate` | Mismo nombre de finca y vereda que otra finca u otro envío pendiente: el administrador elige `farm.mode` |
| `non_producer` | El perfil declarado no es de productor (extensionista, técnico…): por D-H2-4 se deja pendiente salvo decisión expresa |
| `missing_town` | El envío no trae municipio: indicar `townId` o queda sin municipio |
| `duplicate_document_in_pending` | Otro envío pendiente trae el mismo documento |
| `repeated_submission_same_person` | Mismo documento y mismo nombre en varios pendientes; sugiere conservar el más completo o reciente (D-H2-11) y descartar el resto |
| `farm_name_too_long` | El nombre de finca pasa de 50 caracteres (`Farm.name` es `varchar(50)`, ver `spec/backlog.md`): crear la finca fallaría |

### 2. `pnpm public-submissions:apply`

```bash
SYNC_TARGET_DATABASE_URL=<url> pnpm public-submissions:apply -- \
  --decisions decisiones.json --reviewed-by <userId> \
  [--log-dir <dir>] [--production-target-confirm] [--confirm-count <n>]
```

**Archivo de decisiones** (partir de la plantilla del `plan`):

```json
{
  "decisions": [
    { "surveyId": "<uuid>", "action": "process" },
    { "surveyId": "<uuid>", "action": "process", "resolution": "same_person" },
    { "surveyId": "<uuid>", "action": "process", "farm": { "mode": "link", "farmId": "<uuid>" }, "townId": "<uuid>" },
    { "surveyId": "<uuid>", "action": "discard" },
    { "surveyId": "<uuid>", "action": "leave_pending", "note": "extensionista" }
  ]
}
```

- `action`: `process` | `discard` | `leave_pending`.
- `resolution`, `farm` y `townId` solo con `process`. `farm.mode = link` exige
  `farm.farmId`; `create` no lo admite. `note` es libre y no se interpreta.
- No se admiten campos desconocidos ni envíos repetidos en el archivo.

**Validación previa, sin tocar nada.** Se acumulan todos los errores y, si hay
alguno, no se escribe nada: UUID mal formados, envíos inexistentes o de campo,
fincas y municipios inexistentes, usuario `--reviewed-by` inexistente, decisión
sobre un envío que ya no está pendiente en otro estado, colisión de documento
sin `resolution`, y nombre de finca de más de 50 caracteres al crear. Además se
informan como ADVERTENCIA (no detienen): perfil no productor, sin municipio,
`same_person` sin colisión, `farm.mode = link` ignorado porque el productor ya
tiene finca.

**Ejecución.** Un envío por transacción, en el orden del archivo. Antes de cada
envío se recalcula la vista previa (un envío anterior de la misma corrida puede
cambiar el resultado). Se **detiene al primer error**: lo anterior queda
aplicado y con su log; el resto no se toca.

**Idempotencia.** Los envíos que ya están en el estado pedido (`processed` con
`process`, `discarded` con `discard`) se saltan. Un segundo `apply` con el mismo
archivo informa `0 cambios` y no escribe logs.

**Logs.** Una carpeta por corrida, `.public-submissions/logs/apply-<fecha>/`,
con un archivo `NNN-<surveyId>.json` por envío y un `run.json` con el resumen.
Cada log guarda: estado previo (estado de revisión, productor, revisor, fecha
y datos del respondiente), productor creado o reutilizado, finca creada,
vinculada o existente, cultivos agregados, campos completados con su valor
anterior (`NULL`), constancias de consentimiento reancladas, la fila de
colisión (antes y después) y anomalías (valores no nulos que cambiaron; no
deberían existir). **Guárdelos junto al respaldo: son lo único que permite
`revert`.**

### 3. `pnpm public-submissions:revert`

> **Solo se ejecuta con autorización explícita del usuario en la sesión.**
> Es la vía de deshacer de la operación; para un problema mayor, la vía es la
> rama de respaldo de Neon.

```bash
SYNC_TARGET_DATABASE_URL=<url> pnpm public-submissions:revert -- \
  --log .public-submissions/logs/apply-<fecha> [--survey <surveyId>] \
  [--production-target-confirm] [--confirm-count <n>]
```

`--log` acepta el log de un envío o la carpeta de una corrida (se revierten del
último al primero; `--survey` limita a uno). Por envío, en una transacción y
bajo el mismo lock del procesado:

1. Se comprueba que el envío sigue como lo dejó `apply` (`processed` con el
   mismo productor, o `discarded`); si no, se omite y se informa.
2. Se desanclan (`farmer_id = NULL`) solo las constancias que `apply` reancló.
3. Se quitan de `farms_crops` los cultivos que `apply` agregó.
4. Se devuelven a `NULL` los campos completados, **solo si siguen valiendo lo
   que escribió `apply`**; si alguien los editó, se respeta y se informa.
5. Se restaura la fila de colisión (se borra si la creó el envío) y los datos
   del respondiente.
6. El envío vuelve a `pending` con `farmer_id`, `reviewed_by` y `reviewed_at`
   en `NULL`.
7. Si `apply` asignó una finca a un productor que ya existía, se desvincula.
8. El productor o la finca **creados** por el envío se borran solo si nada más
   los referencia (otros envíos, constancias, colisiones u otras tablas);
   si algo los usa, se conservan y se informa el motivo.

Revertir dos veces es inocuo: el envío ya pendiente se omite.

## Procedimiento completo (Fase 8)

### 0. Requisitos previos

- Backend y frontend desplegados con las fases 1 a 4 del spec 93 (orden del
  `CLAUDE.md` raíz: backend primero).
- Mapeo del taller en producción hecho y verificado (Fase 6): cultivos,
  «¿cultiva también cáñamo?», corregimiento, perfil y preguntas de
  Departamento y Municipio. Sin el mapeo los cultivos no llegan a la finca.
- Ventana **sin taller en curso**.
- Usuario que firmará las revisiones (`--reviewed-by`), con su UUID.

### 1. Fecha de corte

Fijar con el usuario la fecha y hora de corte. Los envíos posteriores quedan
para la bandeja. Anotarla: el reporte solo incluye lo pendiente al momento de
correr `plan`; los que lleguen después no están en el archivo de decisiones.

### 2. Reporte

```bash
SYNC_TARGET_DATABASE_URL=<producción> pnpm public-submissions:plan
```

Revisar el `.md` con el usuario. Identificar los envíos de prueba (por ejemplo
`49faf2ac-…`, TC-082-017) para descartarlos.

### 3. Archivo de decisiones

Copiar la plantilla y decidir cada envío (`process`, `discard`,
`leave_pending`) con su `resolution`, `farm` y `townId`. **El usuario aprueba
el archivo antes de continuar.** Contar cuántos son `process` (será el número
que se escribe contra producción) y cuántos productores nuevos se esperan
(los `new` del reporte que se procesan).

### 4. Respaldo en Neon

Crear la rama **`backup-pre-spec93-<fecha>`** desde producción en el panel de
Neon (o que la cree el usuario). Es el punto de retorno ante cualquier
imprevisto que `revert` no cubra. Anotar el nombre y la hora.

### 5. Ensayo en `ensayo-spec93-<fecha>`

Crear la rama de Neon **`ensayo-spec93-<fecha>`** desde producción (lo hace el
usuario) y obtener su URL. Contra **esa** URL:

1. Anotar los conteos «antes» (ver verificaciones abajo).
2. `plan` → confirmar que coincide con el reporte de producción.
3. `apply --decisions ... --reviewed-by ... --production-target-confirm`
   (la rama de Neon también cuenta como producción para la guarda).
4. Anotar los conteos «después» y correr las verificaciones.
5. Repetir `apply` con el mismo archivo: debe informar `0 cambios`.
6. Probar `revert` sobre uno o todos los logs y comprobar que los conteos
   vuelven a los de «antes». Volver a aplicar si se quiere dejar el ensayo
   en su estado final.

### 6. Verificaciones (ensayo y producción)

Se comparan los conteos antes y después con SQL de solo lectura (TablePlus):

| # | Verificación | Resultado esperado |
|---|---|---|
| 1 | Envíos públicos `pending` antes / después | Bajan en procesados + descartados; los `leave_pending` siguen |
| 2 | Envíos `processed` | Igual a las decisiones de procesar |
| 3 | Productores nuevos | Igual a los productores nuevos del reporte |
| 4 | Toda encuesta `processed` del canal público tiene `farmer_id` | 0 sin productor |
| 5 | Toda finca de un envío con cultivo tiene al menos un cultivo en `farms_crops` | 0 fincas sin cultivo |
| 6 | Constancias de consentimiento de esos envíos con `farmer_id` | 0 sin `farmer_id` |
| 7 | Total de filas de `responses` | Sin cambios |
| 8 | Documentos normalizados repetidos entre productores | 0, salvo los marcados `separate_person` |
| 9 | Segundo `apply` con el mismo archivo | `0 cambios` |

Ejemplos de consultas (ajustar al ensayo):

```sql
-- 1 y 2
SELECT review_status, count(*) FROM surveys WHERE origin = 'public' GROUP BY 1;
-- 4
SELECT count(*) FROM surveys WHERE origin = 'public' AND review_status = 'processed' AND farmer_id IS NULL;
-- 6
SELECT count(*) FROM consent_records c JOIN surveys s ON s.survey_id = c.survey_id
 WHERE s.origin = 'public' AND s.review_status = 'processed' AND c.farmer_id IS NULL;
-- 7
SELECT count(*) FROM responses;
-- 8
SELECT regexp_replace(document_id, '[.\s-]', '', 'g') AS doc, count(*)
  FROM farmers WHERE document_id IS NOT NULL GROUP BY 1 HAVING count(*) > 1;
```

### 7. Aplicación en producción

Solo con la confirmación explícita del usuario en la sesión y **lo ejecuta el
usuario**:

1. Repetir `plan` contra producción y confirmar que coincide con el ensayo (los
   pendientes pueden haber cambiado desde el reporte; si cambiaron, rehacer
   decisiones y ensayo).
2. Anotar los conteos «antes».
3. `apply --decisions ... --reviewed-by ... --production-target-confirm`,
   escribiendo el número de envíos a procesar cuando se pregunta.
4. Las mismas verificaciones de la sección 6, más el dashboard público en `200`.
5. Guardar la carpeta de logs junto a la rama de respaldo.

### 8. Reversión

Solo con autorización del usuario. Primero `revert` con la carpeta de logs de la
corrida (ver arriba). Si el problema excede lo que cubre el log (daño fuera de
los envíos), se restaura desde la rama `backup-pre-spec93-<fecha>` de Neon; ese
rollback lo decide el usuario (ver «Rollback de emergencia» en `CLAUDE.md`).

### 9. Aviso al equipo

Los envíos `processed` entran a los agregados del dashboard público (spec 79):
las cifras de productores, fincas y cultivos **suben de golpe** al aplicar. Avisar
al equipo antes, con el orden de magnitud del reporte, para que nadie lo tome
como un error.

## Qué hacer si algo sale mal

- **`apply` se detiene con error:** lo anterior queda aplicado y con su log; el
  envío fallido no cambió (su transacción se revirtió). Corregir la decisión o el
  dato y volver a correr el mismo archivo: lo ya aplicado se salta.
- **Se escribió mal el número de envíos o falta el flag:** no se escribió nada.
- **No se pudo escribir un log:** la CLI imprime el contenido en pantalla;
  guardarlo a mano con el nombre `NNN-<surveyId>.json` antes de seguir.
- **`revert` conservó un productor o una finca:** el mensaje indica qué los
  referencia; resolverlo a mano o con el respaldo.
