# Spec 01 — S1 y S2 como instrumentos prerequisito y creación automática de Farmer

## Contexto

Actualmente todos los instrumentos son independientes entre sí. Sin embargo, los instrumentos
**S1 (Identificación del Encuestado y la Unidad Productiva)** y **S2 (Identificación del Cultivo)**
son los primeros que deben aplicarse a cualquier encuestado antes que cualquier otro instrumento.

Al completar S1, el backend debe extraer las respuestas y crear automáticamente un registro `Farmer`.
A partir de ese momento, **toda encuesta con instrumentos distintos a S1/S2 debe tener un `farmerId`
obligatorio**. El API rechazará la creación sin él.

---

## Decisiones de diseño

| Pregunta | Decisión |
|---|---|
| ¿Cómo se crea el Farmer? | El backend extrae automáticamente los campos de las respuestas de S1 |
| ¿Qué pasa si el documentId ya existe? | Se retorna el Farmer existente con `{ farmer, existed: true }` para que el frontend decida |
| ¿El API valida la obligatoriedad del farmerId? | Sí, validación estricta: 400 si falta farmerId en surveys con instrumentos no-prerequisito |

---

## Flujo objetivo

```
1. Encuestador inicia sesión de S1
   POST /api/surveys  { instrumentIds: [<id-S1>] }
   → { surveyId }

2. Encuestador completa S1
   POST /api/responses/batch  { surveyId, responses: [...] }

3. Backend extrae respuestas y crea (o detecta) el Farmer
   POST /api/surveys/:surveyId/extract-farmer
   → { farmer: { id, name, ... }, existed: false }
      — o —
   → { farmer: { id, name, ... }, existed: true }  ← frontend pide confirmación

4. Encuestador inicia sesión de S2 (ya con farmerId)
   POST /api/surveys  { instrumentIds: [<id-S2>], farmerId }
   → { surveyId }

5. Encuestador completa S2
   POST /api/responses/batch  { surveyId, responses: [...] }

6. Para cualquier otro instrumento (S3…S6):
   POST /api/surveys  { instrumentIds: [<id-S3>], farmerId }  ← farmerId obligatorio
   → 400 si farmerId ausente
```

---

## Impacto en el backend

### Entidades modificadas

#### `Instrument` — nuevo campo `code`
- Tipo: `varchar(10)`, nullable, único cuando no es null
- Permite identificar S1 y S2 sin depender del nombre (que puede cambiar)
- Valores: `'S1'`, `'S2'` para los instrumentos prerequisito; `null` para el resto
- Requiere migración y actualización del seed

#### `Question` — nuevo campo `systemField`
- Tipo: `varchar(50)`, nullable
- Marca las preguntas de S1 cuya respuesta debe mapearse a un campo de la entidad `Farmer`
- Valores posibles: `'name'`, `'lastName'`, `'documentId'`, `'email'`, `'phone'`, `'age'`, `'gender'`, `'educationLevel'`, `'experienceYears'`, `'familySize'`, `'isMainIncome'`, `'participationInTraining'`
- Requiere migración y actualización del seed de S1

### Módulos nuevos / completados

#### `FarmersModule` — implementación completa (actualmente stub)
- `CreateFarmerDto` — todos los campos de la entidad con validaciones `class-validator`
- `FarmersService.create()` — persiste un Farmer en DB
- `FarmersService.findByDocumentId()` — busca por `documentId` para detección de duplicados
- `FarmersController` — expone `POST /api/farmers` y `GET /api/farmers/:id`

### Endpoints nuevos

#### `POST /api/surveys/:surveyId/extract-farmer`
- Lee todas las respuestas del survey indicado
- Busca las preguntas con `systemField` no nulo para mapear valores
- Busca en DB si ya existe un Farmer con el `documentId` extraído
  - Si no existe: crea el Farmer y retorna `{ farmer, existed: false }`
  - Si existe: retorna `{ farmer, existed: true }` sin crear duplicado
- Actualiza el survey con el `farmer` creado/encontrado
- Errores: 404 si survey no existe, 422 si faltan campos obligatorios en las respuestas

### Lógica modificada

#### `SurveysService.create()`
- Al recibir `instrumentIds`, carga los instrumentos y revisa si alguno tiene `code` en `['S1', 'S2']`
- Si **ningún** instrumento tiene código S1/S2 y `farmerId` es `undefined` → lanza `BadRequestException`
- Si todos los instrumentos son S1/S2 → `farmerId` opcional (es la primera aplicación)

### DTOs modificados

#### `CreateSurveyDto`
- `farmerId` sigue siendo `@IsOptional()` en el decorador de clase-validator, pero la validación de negocio ocurre en el servicio (no en el DTO, porque depende de qué instrumentos se solicitan)
- Agregar documentación Swagger aclarando cuándo es obligatorio

---

## Plan de implementación paso a paso

### Paso 1 — Agregar `code` a la entidad `Instrument`

**Archivos:**
- `src/instruments/entities/instrument.entity.ts` — agregar columna `code`
- `src/instruments/dto/create-instrument.dto.ts` y `update-instrument.dto.ts` — agregar campo opcional `code`
- Seed `instrumento-identificacion.seed.ts` — asignar `code: 'S1'`
- Seed `instrumento-cultivos.seed.ts` — asignar `code: 'S2'`

```ts
@Column({ type: 'varchar', length: 10, nullable: true, unique: true })
code?: string;
```

---

### Paso 2 — Agregar `systemField` a la entidad `Question`

**Archivos:**
- `src/questions/entities/question.entity.ts` — agregar columna `systemField`
- `src/questions/dto/create-question.dto.ts` y `update-question.dto.ts` — agregar campo opcional

```ts
@Column({ name: 'system_field', type: 'varchar', length: 50, nullable: true })
systemField?: string;
```

---

### Paso 3 — Actualizar seed de S1 con `systemField`

**Archivo:** `src/database/seeds/instrumento-identificacion.seed.ts`

Identificar qué preguntas de S1 corresponden a cada campo de `Farmer` y asignar `systemField`
en cada `saveQuestion(...)`. Ejemplo:

| Pregunta S1 | systemField |
|---|---|
| Nombre del encuestado | `'name'` |
| Apellido | `'lastName'` |
| Número de documento | `'documentId'` |
| Correo electrónico | `'email'` |
| Teléfono | `'phone'` |
| Edad | `'age'` |
| Género | `'gender'` |
| Nivel de educación | `'educationLevel'` |
| Años de experiencia | `'experienceYears'` |
| Número de personas en el hogar | `'familySize'` |
| ¿Es su principal fuente de ingresos? | `'isMainIncome'` |
| ¿Ha participado en capacitaciones? | `'participationInTraining'` |

---

### Paso 4 — Implementar `FarmersModule`

**Archivos:**
- `src/farmers/dto/create-farmer.dto.ts` — implementar todos los campos con validaciones
- `src/farmers/farmers.service.ts` — implementar `create()`, `findByDocumentId()`, `findOne()`
- `src/farmers/farmers.controller.ts` — exponer endpoints `POST /farmers` y `GET /farmers/:id`

El servicio debe usar `InjectRepository(Farmer)` e inyectar el repositorio de TypeORM.

---

### Paso 5 — Agregar endpoint `extract-farmer` en `SurveysModule`

**Archivos:**
- `src/surveys/surveys.controller.ts` — agregar `POST /:surveyId/extract-farmer`
- `src/surveys/surveys.service.ts` — agregar método `extractFarmerFromSurvey(surveyId: string)`

Lógica del método `extractFarmerFromSurvey`:
```
1. Cargar el survey con sus responses e instruments
2. Filtrar responses cuya question.systemField no sea null
3. Construir un objeto con los valores mapeados { name, lastName, documentId, ... }
4. Validar que documentId esté presente (campo mínimo obligatorio)
5. Buscar Farmer por documentId
   - Si no existe: FarmersService.create(mappedData) → { farmer, existed: false }
   - Si existe: { farmer: existing, existed: true }
6. Actualizar survey.farmer = farmer → guardar
7. Retornar { farmer, existed }
```

Para leer las respuestas mapeadas, inyectar `Repository<Response>` y `Repository<Question>`.

---

### Paso 6 — Validación en `SurveysService.create()`

**Archivo:** `src/surveys/surveys.service.ts`

Después de cargar los instrumentos, agregar:

```ts
const prerequisiteCodes = ['S1', 'S2'];
const allArePrerequisite = instruments.every(i => prerequisiteCodes.includes(i.code));

if (!allArePrerequisite && !createSurveyDto.farmerId) {
  throw new BadRequestException(
    'farmerId es obligatorio para encuestas con instrumentos distintos a S1 y S2',
  );
}
```

---

### Paso 7 — Actualizar Swagger y documentación

**Archivos:**
- `src/surveys/dto/create-survey.dto.ts` — actualizar descripción de `farmerId`
- `src/surveys/surveys.controller.ts` — documentar el nuevo endpoint `extract-farmer`

---

## Consideraciones y riesgos

| Riesgo | Mitigación |
|---|---|
| Encuestas existentes sin farmerId quedan inválidas con la nueva validación | La validación solo aplica a `create()` nuevo; registros existentes no se tocan |
| El mapeo de respuestas S1 → Farmer depende de `systemField` en la DB | Si el seed no se re-ejecuta, el campo estará vacío y `extract-farmer` fallará. Documentar que se requiere re-seed o migración de datos |
| `FarmersService` actualmente es un stub; hay código de `SurveysService` que ya lo usa indirectamente | Implementar `FarmersService` completo antes del Paso 5 |
| `DB_SYNC=true` no está activo en producción | Los nuevos campos `code` y `systemField` deben agregarse vía migración TypeORM antes de desplegar |

---

## Orden de implementación sugerido

```
Paso 1 → Paso 2 → Paso 4 → Paso 3 → Paso 5 → Paso 6 → Paso 7
```

El Paso 4 (FarmersModule) debe completarse antes del Paso 5 porque `extractFarmerFromSurvey`
depende de `FarmersService.create()` y `findByDocumentId()`.
