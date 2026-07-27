# spec-001 — [DONE] Optimizar N+1 queries en `POST /api/responses/batch`

## Contexto

Sentry reportó el issue `NODE-NESTJS-2` (N+1 Query, `db_query`, actionabilidad
"low") sobre el endpoint `POST /api/responses/batch`. En un trace de
producción, la consulta a `surveys` se repitió **42 veces** dentro de una
misma transacción de 655ms, a pesar de que todas las respuestas del lote
pertenecen al **mismo `surveyId`** (esto ya se valida explícitamente en
`createMany`, líneas 45-52 de `responses.service.ts`).

Causa raíz identificada en `src/responses/responses.service.ts`:

- `createMany()` (líneas 65-79) itera con un `for` sobre cada
  `CreateResponseDto` del lote y llama a `buildAndSaveResponse()` una vez
  por respuesta.
- `buildAndSaveResponse()` (líneas 82-190) ejecuta, **por cada respuesta
  individual**:
  1. `Survey.findOne({ surveyId })` (línea 108) — redundante: el lote entero
     comparte el mismo `surveyId`, ya validado antes del loop.
  2. `Question.findOne({ questionId, relations: { type: true } })` (línea 116)
  3. `OptionQuestion.findOne({ optionId, relations: { question: true } })`
     (línea 137, solo si hay `optionId`)

Este endpoint es crítico: se llama al finalizar cada cuestionario, tanto
desde el frontend web (encuestador online) como desde la app móvil al
sincronizar encuestas offline (lotes potencialmente grandes, conexión
intermitente). El costo actual escala linealmente en cantidad de queries por
cada respuesta del lote, en vez de mantenerse acotado por el número de
`question`/`option` distintos involucrados.

No es un error funcional (la request en el trace de Sentry devolvió `201`,
0 usuarios afectados reportados) sino deuda de performance detectada de forma
proactiva.

## Alcance

**Incluye:**
- Precargar el `Survey` **una sola vez** por lote (ya se conoce el
  `surveyId` único antes del loop).
- Precargar todos los `Question` distintos del lote con una sola consulta
  (`IN (...)`, incluyendo la relación `type`), en vez de un `findOne` por
  respuesta.
- Precargar todos los `OptionQuestion` distintos del lote con una sola
  consulta (`IN (...)`, incluyendo la relación `question`), en vez de un
  `findOne` por respuesta.
- Mantener las mismas validaciones de negocio actuales (survey/question/
  option no encontrados, `numeric_with_unit` requiere `numericValue` +
  `optionId`, option debe pertenecer a la question, attachment debe estar
  `UPLOADED`) con los mismos códigos de error (`NotFoundException` /
  `BadRequestException`) y mensajes.
- Mantener la transacción DB envolvente y el guard de idempotencia existente
  (si ya hay respuestas para el `surveyId`, devolverlas sin reinsertar).

**No incluye:**
- Cambios al endpoint `POST /api/responses` (creación individual) — su
  patrón de una query por creación es correcto para ese caso de uso.
- Cambios al contrato del DTO (`CreateResponseDto`) ni al shape de la
  respuesta HTTP.
- Cambios al guard de idempotencia (líneas 54-63) — se mantiene tal cual.
- Optimización de `MediaAttachment` (el `update` por `attachmentId` en línea
  183 no forma parte del N+1 reportado por Sentry; queda fuera de este spec).

## Impacto en el sistema

- **Repositorio:** `backend/` (único afectado; no impacta frontend ni mobile
  — el contrato del endpoint no cambia).
- **Archivo principal:** `src/responses/responses.service.ts`
  (`createMany`, `buildAndSaveResponse`).
- **Sin cambios de esquema:** no requiere migración.
- **Sin cambios de rutas:** `src/responses/responses.controller.ts` no se
  modifica.

## Evaluación MCP

**¿Aplica MCP?** No. Es una optimización interna de una operación ya
expuesta (`POST /api/responses/batch`); no agrega datos ni acciones nuevas
que un agente necesite consultar o ejecutar.

## Fases de implementación

### Fase 1 — Precarga de `Survey`, `Question` y `OptionQuestion` ✅
- [x] En `createMany`, después de validar `surveyId` único, buscar el
      `Survey` una sola vez (reemplaza el `findOne` repetido dentro del loop).
- [x] Recolectar los `questionId` y `optionId` distintos de todo el lote
      (`Set`).
- [x] Cargar todos los `Question` distintos con una sola consulta
      (`In(questionIds)`, `relations: { type: true }`) y todos los
      `OptionQuestion` distintos con una sola consulta
      (`In(optionIds)`, `relations: { question: true }`).
- [x] Indexar los resultados en `Map<string, Question>` y
      `Map<string, OptionQuestion>` para lookup O(1) dentro del loop.

### Fase 2 — Adaptar `buildAndSaveResponse` para reutilizar precarga ✅
- [x] Extraer la lógica de validación y armado de `Response` (líneas 96-178)
      a una función que reciba `survey`, `question` y `option` ya resueltos
      en vez de volver a buscarlos por ID, manteniendo intactas las
      validaciones de negocio existentes (`NotFoundException` si el ID del
      lote no está en el mapa precargado, `BadRequestException` para
      `numeric_with_unit` y para option/question no correspondientes).
- [x] `create()` (creación individual) mantiene el mismo comportamiento y
      número de queries que antes (1 `Survey.findOne` + 1 `Question.findOne`
      + 1 `OptionQuestion.findOne` opcional); se adaptó su llamado a
      `buildAndSaveResponse` para compartir la validación sin duplicar
      lógica, sin afectar su patrón de queries.
- [x] El `INSERT` de cada `Response` y el `update` condicional de
      `MediaAttachment` se mantienen sin cambios, ejecutándose dentro de la
      misma transacción.

> Nota de scope: `create()` no se dejó "literalmente sin tocar" como decía el
> plan original — se adaptó su llamado interno a la nueva firma de
> `buildAndSaveResponse` para no duplicar la lógica de validación en dos
> lugares. Su comportamiento observable (queries ejecutadas, validaciones,
> respuesta HTTP) es idéntico al anterior.

### Fase 3 — Pruebas e2e ✅
- [x] Escribir `test/responses-batch.e2e-spec.ts` cubriendo los criterios de
      aceptación (ver sección siguiente).
- [x] Confirmado con espías sobre `Repository.prototype.findOne`/`.find`
      (no requirió logging manual): un lote de 5 respuestas ejecuta 1 sola
      query a `Survey`, 1 sola a `Question` (4 IDs distintos vía `IN`) y 1
      sola a `OptionQuestion` (4 IDs distintos vía `IN`); un lote de 10
      respuestas para el mismo `questionId` mantiene 1 sola query a `Survey`
      — confirma que no escala con el tamaño del lote.

> Nota de proceso: no existe un agente `@tester` definido en `/.agents/` de
> este repositorio (solo skills). Ante esa ausencia, el usuario indicó
> definir y correr las pruebas directamente en esta sesión, en vez de
> invocar un agente inexistente.

**Resultado de la ejecución (2026-07-27, contra la base de datos de
desarrollo vía túnel SSH a `mirp-lab`):**
- `test/responses-batch.e2e-spec.ts`: 7/7 casos aprobados.
- Suite e2e completa (`pnpm test:e2e`): 24/24 aprobados (sin regresiones).
- Suite unitaria (`pnpm test`): 16/16 aprobados.
- Datos de prueba (usuario `e2e-rb-pollster@test.local`, instrumento
  `E2E RB Instrument` y sus secciones/preguntas/opciones, y los `surveys`
  creados por cada caso) eliminados por el propio `afterAll` de la suite;
  verificado post-ejecución que no quedaron registros huérfanos.

## Criterios de aceptación

- Un `POST /api/responses/batch` con N respuestas para el mismo `surveyId`
  ejecuta **una sola** consulta a `surveys`, independientemente de N.
- Las consultas a `questions` y `options_question` se ejecutan **una vez por
  cada ID distinto** presente en el lote, no una vez por respuesta.
- Todas las validaciones de negocio actuales se preservan exactamente:
  - `Survey`/`Question`/`OptionQuestion` no encontrado → `404 NotFoundException`.
  - `numeric_with_unit` sin `numericValue`+`optionId` → `400 BadRequestException`.
  - `optionId` que no pertenece a la `questionId` provista → `400 BadRequestException`.
  - `attachmentId` de un `MediaAttachment` no `UPLOADED` → `400 BadRequestException`.
- El guard de idempotencia (respuestas ya existentes para el `surveyId`)
  sigue devolviendo las respuestas existentes sin reinsertar ni recalcular.
- La respuesta HTTP (shape, status codes) no cambia respecto al
  comportamiento actual.
- El issue `NODE-NESTJS-2` en Sentry deja de reproducirse en producción tras
  el despliegue (validar con nuevas transacciones sobre el endpoint).

## Pruebas e2e (si aplica)

Casos a automatizar en `test/responses-batch.e2e-spec.ts` (Fase 3, ejecutados
por `@tester`):

- Lote de N respuestas válidas para el mismo `surveyId` con `questionId`/
  `optionId` repetidos entre respuestas → `201`, N respuestas creadas,
  verificar (vía spy/mock de repositorio o conteo de queries en el test)
  que `Survey.findOne` se llama una única vez.
- Lote con `surveyId` no encontrado → `404`.
- Lote con `questionId` no encontrado → `404`.
- Lote con `optionId` que no pertenece a la `questionId` provista → `400`.
- Lote para pregunta `numeric_with_unit` sin `optionId` → `400`.
- Segundo `POST /api/responses/batch` para un `surveyId` que ya tiene
  respuestas guardadas → devuelve las respuestas existentes sin duplicar.

## Aprobación de implementación
> Claude no escribe código de implementación hasta que esta sección esté marcada.
- [x] Paquete (spec) aprobado por el usuario
- **Fecha de aprobación:** 2026-07-27
