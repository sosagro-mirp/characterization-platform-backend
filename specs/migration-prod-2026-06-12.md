# Plan de Migración a Producción — 2026-06-12

**Base de datos destino:** Neon PostgreSQL (us-east-1)
**Preparado por:** Arquitecto SOSAgro
**Fecha de preparación:** 2026-06-12
**Ventana de mantenimiento recomendada:** fuera de horario laboral colombiano (después de las 22:00 COT)

---

## 1. Resumen Ejecutivo

Este documento describe la migración de esquema necesaria para llevar la base de datos de producción (Neon) al estado actual del modelo de datos en desarrollo. La migración aplica los cambios acumulados desde la última sincronización y los consolida en una sola ventana de mantenimiento.

### Cambios incluidos

| # | Tipo de cambio | Tabla | Riesgo |
|---|----------------|-------|--------|
| 1 | Crear tabla nueva | `step_conditions` | Bajo |
| 2 | Crear tabla pivot nueva | `campaign_sessions_crops` | Bajo |
| 3 | Migrar datos inline → tabla normalizada | `campaign_steps` → `step_conditions` | **Alto** |
| 4 | Eliminar columnas obsoletas | `campaign_steps` | Medio |
| 5 | Agregar columnas NULLABLE | `farms` (4 columnas) | Bajo |
| 6 | Agregar columna NULLABLE | `instruments` | Bajo |
| 7 | Relajar constraints NOT NULL | `farmers` (11 columnas) | Bajo |
| 8 | Relajar constraints NOT NULL | `farms` (6 columnas) | Bajo |

**Total de filas con riesgo de pérdida de datos:** 9 filas en `campaign_steps`.
**Total de filas en tablas vacías afectadas por constraints:** 0 (`farmers`, `farms`).

### Mecanismo de ejecución

La migración se ejecuta a través del runner de TypeORM (`pnpm migration:run`) contra el `DATABASE_URL` de producción. El archivo TypeORM correspondiente es:

```
src/migrations/1749600000000-StepConditionsRefactor.ts
```

Los pasos 5, 6, 7 y 8 **no están cubiertos por ese archivo** — requieren un nuevo archivo de migración TypeORM o ejecución manual de SQL. Ver Sección 5 para los scripts exactos.

---

## 2. Evaluación de Riesgos

### Cambio 1 — Crear `step_conditions`
**Riesgo: Bajo.**
Tabla nueva sin datos previos. Si falla el `CREATE TABLE`, no hay efecto secundario. No hay locks prolongados.

### Cambio 2 — Crear `campaign_sessions_crops`
**Riesgo: Bajo.**
Tabla pivot nueva. La relación M:M entre `campaign_sessions` y `types_of_crops` no existía en producción. No afecta filas existentes en ninguna tabla.

### Cambio 3 — Migrar datos de `campaign_steps` → `step_conditions`
**Riesgo: Alto. Este es el paso crítico de la migración.**

Las 9 filas identificadas contienen condiciones en formato inline (`condition_question_id`, `condition_value`) que deben trasladarse a `step_conditions` antes de eliminar las columnas fuente. Si se eliminan las columnas antes de migrar, los datos se pierden de forma **irreversible**.

Mitigación:
- El backup debe tomarse antes de cualquier DDL.
- El INSERT en `step_conditions` ocurre dentro de la misma transacción que el DROP COLUMN (el archivo TypeORM actual lo hace así).
- Se debe verificar la cuenta de filas en `step_conditions` antes de proceder al DROP.

Fila especial a considerar:
```
step_id: a44691d2  condition_value: "28762a53-4ee4-445c-b1c4-e472c5102863"
```
Esta fila tiene un `condition_value` que parece ser un UUID (posiblemente referencia a un crop). La migración la trata como tipo `'question'` igual que las demás porque `condition_question_id` no es NULL. Revisar si esta fila debería recibir `condition_type = 'crop'` y `condition_crop_id` en lugar de `condition_question_id`. **Decisión requerida antes de ejecutar.**

### Cambio 4 — Eliminar columnas de `campaign_steps`
**Riesgo: Medio.**
PostgreSQL requiere un `ACCESS EXCLUSIVE` lock sobre la tabla para ejecutar `DROP COLUMN`. En producción, si hay consultas activas en ese momento, el lock puede bloquear brevemente la tabla. Con 19 filas, el tiempo de lock es mínimo (< 1 segundo). De todas formas, ejecutar fuera de horario pico.

El rollback requiere recrear las columnas y restaurar datos desde backup. Sin backup previo, es irrecuperable.

### Cambios 5, 6, 7, 8 — Columnas NULLABLE y nuevas
**Riesgo: Bajo.**
- `ALTER TABLE ... ADD COLUMN ... NULL` no requiere reescritura de heap en PostgreSQL moderno (solo actualiza el catálogo).
- `ALTER TABLE ... ALTER COLUMN ... DROP NOT NULL` es una operación de solo catálogo cuando no hay filas afectadas (confirmado: 0 filas en `farmers` y `farms`).
- `instruments` tiene 30 filas pero la columna `code` es NULLABLE, por lo que no requiere un valor default.

---

## 3. Estrategia de Backup

### 3.1 Qué respaldar

Respaldar la base de datos completa de Neon antes de cualquier modificación. El dump incluye esquema + datos.

### 3.2 Comando de backup

Neon expone un endpoint PostgreSQL estándar. Usar `pg_dump` desde el contenedor Docker local apuntando al `DATABASE_URL` de producción:

```bash
# Sustituir <NEON_DATABASE_URL> por la URL completa de Neon
# Formato: postgres://usuario:password@host/dbname?sslmode=require

docker run --rm \
  -e PGPASSWORD="<password>" \
  postgres:15 \
  pg_dump \
    --no-owner \
    --no-acl \
    --format=custom \
    --file=/dev/stdout \
    "<NEON_DATABASE_URL>" \
  > ~/backups/sosagro-prod-2026-06-12-pre-migration.dump
```

O alternativamente, si se tiene la URL completa con credenciales:

```bash
docker run --rm postgres:15 \
  pg_dump --no-owner --no-acl --format=custom \
  "postgres://usuario:password@ep-xxx.us-east-1.aws.neon.tech/sos-agro?sslmode=require" \
  > ~/backups/sosagro-prod-2026-06-12-pre-migration.dump
```

### 3.3 Verificar el backup

```bash
docker run --rm postgres:15 \
  pg_restore --list \
  ~/backups/sosagro-prod-2026-06-12-pre-migration.dump \
  | head -40
```

El comando debe listar tablas y datos sin errores antes de continuar.

### 3.4 Resguardo específico de las 9 filas críticas

Adicionalmente, extraer las filas específicas de `campaign_steps` con condiciones para tener una referencia textual independiente del dump binario:

```bash
# Ejecutar contra Neon (ajustar credenciales)
docker run --rm postgres:15 \
  psql "<NEON_DATABASE_URL>" \
  -c "SELECT step_id, condition_value, condition_question_id FROM campaign_steps WHERE condition_question_id IS NOT NULL ORDER BY step_id;" \
  > ~/backups/campaign_steps_conditions_2026-06-12.txt
```

---

## 4. Orden de Ejecución

El orden es estricto. Cada paso tiene dependencias de los anteriores.

```
PASO 1  → Tomar backup completo de Neon
PASO 2  → Verificar integridad del backup
PASO 3  → (Decisión) Revisar fila a44691d2 y confirmar condition_type
PASO 4  → CREATE TABLE step_conditions + FKs
PASO 5  → Verificar tabla creada (0 filas)
PASO 6  → INSERT datos desde campaign_steps → step_conditions
PASO 7  → Verificar 9 filas insertadas en step_conditions
PASO 8  → DROP CONSTRAINT FK en campaign_steps (condition_question_id)
PASO 9  → DROP COLUMN condition_question_id en campaign_steps
PASO 10 → DROP COLUMN condition_value en campaign_steps
PASO 11 → Verificar esquema final de campaign_steps
PASO 12 → CREATE TABLE campaign_sessions_crops + FKs
PASO 13 → ALTER TABLE farms ADD COLUMNS (latitude, longitude, altitude, vereda)
PASO 14 → ALTER TABLE instruments ADD COLUMN code
PASO 15 → ALTER TABLE farmers DROP NOT NULL en 11 columnas
PASO 16 → ALTER TABLE farms DROP NOT NULL en 6 columnas
PASO 17 → Ejecutar checklist de validación post-migración
```

**Regla:** Si algún paso falla, detener y evaluar rollback antes de continuar.

---

## 5. Scripts SQL de Migración

### PASO 4 — Crear tabla `step_conditions`

```sql
-- Verificar que la extensión uuid existe (debería existir ya en Neon)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE "step_conditions" (
  "condition_id"          uuid        NOT NULL DEFAULT uuid_generate_v4(),
  "order"                 integer     NOT NULL,
  "logical_operator"      varchar(3)  NULL,
  "condition_type"        varchar(10) NOT NULL,
  "condition_value"       varchar(50) NULL,
  "created_at"            timestamp   NOT NULL DEFAULT now(),
  "updated_at"            timestamp   NOT NULL DEFAULT now(),
  "step_id"               uuid        NOT NULL,
  "condition_question_id" uuid        NULL,
  "condition_crop_id"     uuid        NULL,
  CONSTRAINT "PK_step_conditions" PRIMARY KEY ("condition_id")
);

ALTER TABLE "step_conditions"
  ADD CONSTRAINT "FK_step_conditions_step"
    FOREIGN KEY ("step_id")
    REFERENCES "campaign_steps"("step_id")
    ON DELETE CASCADE;

ALTER TABLE "step_conditions"
  ADD CONSTRAINT "FK_step_conditions_question"
    FOREIGN KEY ("condition_question_id")
    REFERENCES "questions"("question_id")
    ON DELETE SET NULL;

ALTER TABLE "step_conditions"
  ADD CONSTRAINT "FK_step_conditions_crop"
    FOREIGN KEY ("condition_crop_id")
    REFERENCES "types_of_crops"("crop_id")
    ON DELETE SET NULL;
```

### PASO 5 — Verificar creación

```sql
SELECT COUNT(*) FROM step_conditions;
-- Resultado esperado: 0
```

### PASO 6 — Migrar datos de `campaign_steps` → `step_conditions`

```sql
-- Migrar las 9 filas con condiciones de tipo 'question'
-- NOTA: Si la fila a44691d2 debe ser tipo 'crop', modificar su INSERT por separado (ver Sección 5a)
INSERT INTO "step_conditions"
  ("step_id", "order", "logical_operator", "condition_type", "condition_question_id", "condition_value")
SELECT
  "step_id",
  1,
  NULL,
  'question',
  "condition_question_id",
  "condition_value"
FROM "campaign_steps"
WHERE "condition_question_id" IS NOT NULL;
```

### PASO 7 — Verificar migración de datos

```sql
SELECT
  sc.condition_id,
  sc.step_id,
  sc.condition_type,
  sc.condition_value,
  sc.condition_question_id
FROM step_conditions sc
ORDER BY sc.step_id;
-- Resultado esperado: 9 filas
```

Verificación cruzada:

```sql
-- Las 9 filas de campaign_steps deben coincidir con las 9 de step_conditions
SELECT
  cs.step_id,
  cs.condition_value AS original_value,
  cs.condition_question_id AS original_question_id,
  sc.condition_id,
  sc.condition_value AS migrated_value,
  sc.condition_question_id AS migrated_question_id
FROM campaign_steps cs
JOIN step_conditions sc ON sc.step_id = cs.step_id
WHERE cs.condition_question_id IS NOT NULL
ORDER BY cs.step_id;
-- Todas las filas deben mostrar coincidencia entre columnas _original_ y _migrated_
```

### PASO 8-10 — Eliminar columnas de `campaign_steps`

```sql
-- Eliminar FK existente (el nombre del constraint puede variar; verificar con \d campaign_steps en psql)
ALTER TABLE "campaign_steps"
  DROP CONSTRAINT IF EXISTS "FK_3d6c54bdc0322d37193ae280cf4";

-- Eliminar columna condition_question_id
ALTER TABLE "campaign_steps"
  DROP COLUMN "condition_question_id";

-- Eliminar columna condition_value
ALTER TABLE "campaign_steps"
  DROP COLUMN "condition_value";
```

> **Cómo verificar el nombre real del constraint antes de ejecutar:**
> ```sql
> SELECT conname
> FROM pg_constraint
> WHERE conrelid = 'campaign_steps'::regclass
>   AND contype = 'f';
> ```
> Si el nombre difiere de `FK_3d6c54bdc0322d37193ae280cf4`, ajustar el DROP CONSTRAINT.

### PASO 11 — Verificar esquema final de `campaign_steps`

```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'campaign_steps'
ORDER BY ordinal_position;
-- Las columnas condition_value y condition_question_id NO deben aparecer
```

### PASO 12 — Crear tabla `campaign_sessions_crops`

```sql
CREATE TABLE "campaign_sessions_crops" (
  "campaign_sessions_session_id" uuid NOT NULL,
  "types_of_crops_crop_id"       uuid NOT NULL,
  CONSTRAINT "PK_campaign_sessions_crops"
    PRIMARY KEY ("campaign_sessions_session_id", "types_of_crops_crop_id")
);

ALTER TABLE "campaign_sessions_crops"
  ADD CONSTRAINT "FK_campaign_sessions_crops_session"
    FOREIGN KEY ("campaign_sessions_session_id")
    REFERENCES "campaign_sessions"("session_id")
    ON DELETE CASCADE;

ALTER TABLE "campaign_sessions_crops"
  ADD CONSTRAINT "FK_campaign_sessions_crops_crop"
    FOREIGN KEY ("types_of_crops_crop_id")
    REFERENCES "types_of_crops"("crop_id")
    ON DELETE CASCADE;
```

### PASO 13 — Agregar columnas a `farms`

```sql
ALTER TABLE "farms"
  ADD COLUMN "latitude"  double precision NULL,
  ADD COLUMN "longitude" double precision NULL,
  ADD COLUMN "altitude"  double precision NULL,
  ADD COLUMN "vereda"    varchar(100)     NULL;
```

### PASO 14 — Agregar columna `code` a `instruments`

```sql
ALTER TABLE "instruments"
  ADD COLUMN "code" varchar(10) NULL;

-- Agregar constraint UNIQUE (la entidad TypeORM lo define con unique: true)
ALTER TABLE "instruments"
  ADD CONSTRAINT "UQ_instruments_code" UNIQUE ("code");
```

### PASO 15 — Relajar NOT NULL en `farmers`

```sql
ALTER TABLE "farmers"
  ALTER COLUMN "last_name"               DROP NOT NULL,
  ALTER COLUMN "document_id"             DROP NOT NULL,
  ALTER COLUMN "email"                   DROP NOT NULL,
  ALTER COLUMN "phone"                   DROP NOT NULL,
  ALTER COLUMN "age"                     DROP NOT NULL,
  ALTER COLUMN "gender"                  DROP NOT NULL,
  ALTER COLUMN "education_level"         DROP NOT NULL,
  ALTER COLUMN "experience_years"        DROP NOT NULL,
  ALTER COLUMN "family_size"             DROP NOT NULL,
  ALTER COLUMN "is_main_income"          DROP NOT NULL,
  ALTER COLUMN "participation_in_training" DROP NOT NULL;
```

### PASO 16 — Relajar NOT NULL en `farms`

```sql
ALTER TABLE "farms"
  ALTER COLUMN "location"                   DROP NOT NULL,
  ALTER COLUMN "area"                       DROP NOT NULL,
  ALTER COLUMN "water_access"               DROP NOT NULL,
  ALTER COLUMN "internet_access"            DROP NOT NULL,
  ALTER COLUMN "has_stability_electricity"  DROP NOT NULL,
  ALTER COLUMN "technical_assistance_access" DROP NOT NULL;
```

---

## 5a. Decisión pendiente — Fila `a44691d2`

Antes de ejecutar el PASO 6, revisar esta fila:

```
step_id: a44691d2
condition_value: "28762a53-4ee4-445c-b1c4-e472c5102863"
condition_question_id: 38233b00-...
```

El `condition_value` tiene formato UUID, lo cual es inusual para una condición de tipo `question` (donde normalmente el valor sería `"true"` o `"false"`). Dos interpretaciones posibles:

**Opción A — El valor es semántico (recomendada si no se conoce el contexto exacto):** Mantener la migración como `condition_type = 'question'` con el UUID como `condition_value`. Preserva fielmente los datos originales aunque el significado sea incierto.

**Opción B — Era una condición de cultivo:** Si el UUID `28762a53-4ee4-445c-b1c4-e472c5102863` corresponde a un registro en `types_of_crops`, esta condición debería migrarse como:

```sql
-- Primero verificar si el UUID existe en types_of_crops
SELECT crop_id, name FROM types_of_crops
WHERE crop_id = '28762a53-4ee4-445c-b1c4-e472c5102863';

-- Si existe, insertar con condition_type = 'crop'
INSERT INTO "step_conditions"
  ("step_id", "order", "logical_operator", "condition_type", "condition_crop_id", "condition_value")
VALUES (
  'a44691d2-...',   -- step_id completo
  1,
  NULL,
  'crop',
  '28762a53-4ee4-445c-b1c4-e472c5102863',
  NULL
);
-- Y excluir este step_id del INSERT masivo del PASO 6
```

**Decisión tomada (2026-06-12): Opción A.** La fila se migra como `condition_type = 'question'` con el UUID como `condition_value`. El INSERT masivo del PASO 6 cubre esta fila sin modificaciones adicionales.

---

## 6. Ejecución via TypeORM (opción recomendada para Pasos 4-10)

Los pasos 4 al 11 están encapsulados en el archivo de migración existente:

```
src/migrations/1749600000000-StepConditionsRefactor.ts
```

Para ejecutar contra producción:

```bash
# En el directorio characterization-platform-backend/
# Asegurarse de que DATABASE_URL apunte a Neon y DB_SSL=true

DATABASE_URL="postgres://usuario:password@ep-xxx.us-east-1.aws.neon.tech/sos-agro?sslmode=require" \
DB_SSL=true \
pnpm migration:run
```

Esto ejecuta **únicamente** el archivo TypeORM de migración. Los pasos 12-16 (tablas nuevas y cambios de constraint) deben ejecutarse manualmente con SQL o en un nuevo archivo de migración TypeORM.

### Crear migración para los cambios restantes (Pasos 12-16)

Si se prefiere tener todo en TypeORM, crear el siguiente archivo:

```
src/migrations/1749686400000-AddCampaignSessionsCropsAndNullableColumns.ts
```

Con el contenido:

```typescript
import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCampaignSessionsCropsAndNullableColumns1749686400000
  implements MigrationInterface
{
  name = 'AddCampaignSessionsCropsAndNullableColumns1749686400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Tabla pivot campaign_sessions_crops
    await queryRunner.query(`
      CREATE TABLE "campaign_sessions_crops" (
        "campaign_sessions_session_id" uuid NOT NULL,
        "types_of_crops_crop_id"       uuid NOT NULL,
        CONSTRAINT "PK_campaign_sessions_crops"
          PRIMARY KEY ("campaign_sessions_session_id", "types_of_crops_crop_id")
      )
    `);
    await queryRunner.query(`
      ALTER TABLE "campaign_sessions_crops"
        ADD CONSTRAINT "FK_campaign_sessions_crops_session"
          FOREIGN KEY ("campaign_sessions_session_id")
          REFERENCES "campaign_sessions"("session_id") ON DELETE CASCADE
    `);
    await queryRunner.query(`
      ALTER TABLE "campaign_sessions_crops"
        ADD CONSTRAINT "FK_campaign_sessions_crops_crop"
          FOREIGN KEY ("types_of_crops_crop_id")
          REFERENCES "types_of_crops"("crop_id") ON DELETE CASCADE
    `);

    // Columnas nuevas en farms
    await queryRunner.query(`
      ALTER TABLE "farms"
        ADD COLUMN "latitude"  double precision NULL,
        ADD COLUMN "longitude" double precision NULL,
        ADD COLUMN "altitude"  double precision NULL,
        ADD COLUMN "vereda"    varchar(100)     NULL
    `);

    // Columna nueva en instruments
    await queryRunner.query(`
      ALTER TABLE "instruments"
        ADD COLUMN "code" varchar(10) NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "instruments"
        ADD CONSTRAINT "UQ_instruments_code" UNIQUE ("code")
    `);

    // Relajar NOT NULL en farmers
    await queryRunner.query(`
      ALTER TABLE "farmers"
        ALTER COLUMN "last_name"                 DROP NOT NULL,
        ALTER COLUMN "document_id"               DROP NOT NULL,
        ALTER COLUMN "email"                     DROP NOT NULL,
        ALTER COLUMN "phone"                     DROP NOT NULL,
        ALTER COLUMN "age"                       DROP NOT NULL,
        ALTER COLUMN "gender"                    DROP NOT NULL,
        ALTER COLUMN "education_level"           DROP NOT NULL,
        ALTER COLUMN "experience_years"          DROP NOT NULL,
        ALTER COLUMN "family_size"               DROP NOT NULL,
        ALTER COLUMN "is_main_income"            DROP NOT NULL,
        ALTER COLUMN "participation_in_training" DROP NOT NULL
    `);

    // Relajar NOT NULL en farms
    await queryRunner.query(`
      ALTER TABLE "farms"
        ALTER COLUMN "location"                    DROP NOT NULL,
        ALTER COLUMN "area"                        DROP NOT NULL,
        ALTER COLUMN "water_access"                DROP NOT NULL,
        ALTER COLUMN "internet_access"             DROP NOT NULL,
        ALTER COLUMN "has_stability_electricity"   DROP NOT NULL,
        ALTER COLUMN "technical_assistance_access" DROP NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Restaurar NOT NULL en farms (solo seguro si no hay NULLs — verificar antes)
    await queryRunner.query(`
      ALTER TABLE "farms"
        ALTER COLUMN "location"                    SET NOT NULL,
        ALTER COLUMN "area"                        SET NOT NULL,
        ALTER COLUMN "water_access"                SET NOT NULL,
        ALTER COLUMN "internet_access"             SET NOT NULL,
        ALTER COLUMN "has_stability_electricity"   SET NOT NULL,
        ALTER COLUMN "technical_assistance_access" SET NOT NULL
    `);

    // Restaurar NOT NULL en farmers (solo seguro si no hay NULLs)
    await queryRunner.query(`
      ALTER TABLE "farmers"
        ALTER COLUMN "last_name"                 SET NOT NULL,
        ALTER COLUMN "document_id"               SET NOT NULL,
        ALTER COLUMN "email"                     SET NOT NULL,
        ALTER COLUMN "phone"                     SET NOT NULL,
        ALTER COLUMN "age"                       SET NOT NULL,
        ALTER COLUMN "gender"                    SET NOT NULL,
        ALTER COLUMN "education_level"           SET NOT NULL,
        ALTER COLUMN "experience_years"          SET NOT NULL,
        ALTER COLUMN "family_size"               SET NOT NULL,
        ALTER COLUMN "is_main_income"            SET NOT NULL,
        ALTER COLUMN "participation_in_training" SET NOT NULL
    `);

    // Eliminar columna code de instruments
    await queryRunner.query(`
      ALTER TABLE "instruments"
        DROP CONSTRAINT IF EXISTS "UQ_instruments_code"
    `);
    await queryRunner.query(`ALTER TABLE "instruments" DROP COLUMN "code"`);

    // Eliminar columnas de farms
    await queryRunner.query(`
      ALTER TABLE "farms"
        DROP COLUMN "latitude",
        DROP COLUMN "longitude",
        DROP COLUMN "altitude",
        DROP COLUMN "vereda"
    `);

    // Eliminar tabla pivot
    await queryRunner.query(`
      ALTER TABLE "campaign_sessions_crops"
        DROP CONSTRAINT IF EXISTS "FK_campaign_sessions_crops_session",
        DROP CONSTRAINT IF EXISTS "FK_campaign_sessions_crops_crop"
    `);
    await queryRunner.query(`DROP TABLE "campaign_sessions_crops"`);
  }
}
```

---

## 7. Plan de Rollback

### Rollback completo (restauración desde backup)

Si algo sale mal de forma irrecuperable, restaurar desde el dump tomado en el Paso 1:

```bash
# Neon no soporta pg_restore directo sobre la base de datos principal
# Opciones:
# A) Usar el panel de Neon para restaurar desde branch/snapshot si está habilitado
# B) Crear una base de datos nueva en Neon y restaurar ahí para extraer datos específicos

docker run --rm \
  -v ~/backups:/backups \
  postgres:15 \
  pg_restore \
    --no-owner \
    --no-acl \
    --dbname "<NEON_DATABASE_URL_NEW_DB>" \
    /backups/sosagro-prod-2026-06-12-pre-migration.dump
```

### Rollback por paso (si la migración TypeORM falló parcialmente)

```bash
# Revertir la última migración TypeORM aplicada
DATABASE_URL="..." DB_SSL=true pnpm migration:revert
```

El método `down()` de `StepConditionsRefactor1749600000000` recrea las columnas y restaura los datos desde `step_conditions`.

### Rollback manual por cambio

| Cambio | Script de rollback |
|--------|--------------------|
| step_conditions creada | `DROP TABLE step_conditions CASCADE;` |
| campaign_sessions_crops creada | `DROP TABLE campaign_sessions_crops CASCADE;` |
| Columnas de farms agregadas | `ALTER TABLE farms DROP COLUMN latitude, DROP COLUMN longitude, DROP COLUMN altitude, DROP COLUMN vereda;` |
| Columna code en instruments | `ALTER TABLE instruments DROP CONSTRAINT IF EXISTS "UQ_instruments_code"; ALTER TABLE instruments DROP COLUMN code;` |
| NOT NULL relajado en farmers | Solo seguro si no hay NULLs: `ALTER TABLE farmers ALTER COLUMN last_name SET NOT NULL, ...` |
| NOT NULL relajado en farms | Solo seguro si no hay NULLs: `ALTER TABLE farms ALTER COLUMN location SET NOT NULL, ...` |
| DROP COLUMN en campaign_steps | **Irrecuperable sin backup.** Requiere restaurar desde dump. |

---

## 8. Checklist de Validación Post-Migración

Ejecutar todos estos queries después de completar la migración. Cada uno debe devolver el resultado esperado indicado.

### 8.1 Tablas nuevas existen

```sql
-- Debe retornar 2 filas
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('step_conditions', 'campaign_sessions_crops');
```

### 8.2 step_conditions tiene las 9 filas migradas

```sql
SELECT COUNT(*) AS total FROM step_conditions;
-- Resultado esperado: 9
```

### 8.3 Todas las condiciones migradas son del tipo correcto

```sql
SELECT condition_type, COUNT(*) FROM step_conditions GROUP BY condition_type;
-- Resultado esperado: fila 'question' con valor 9
-- (o 8 + 1 'crop' si se tomó la Opción B para la fila a44691d2)
```

### 8.4 campaign_steps ya no tiene las columnas eliminadas

```sql
SELECT column_name
FROM information_schema.columns
WHERE table_name = 'campaign_steps'
  AND column_name IN ('condition_value', 'condition_question_id');
-- Resultado esperado: 0 filas
```

### 8.5 campaign_steps sigue teniendo 19 filas

```sql
SELECT COUNT(*) FROM campaign_steps;
-- Resultado esperado: 19
```

### 8.6 Columnas nuevas en farms

```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'farms'
  AND column_name IN ('latitude', 'longitude', 'altitude', 'vereda')
ORDER BY column_name;
-- Resultado esperado: 4 filas, todas con is_nullable = 'YES'
```

### 8.7 Columna code en instruments

```sql
SELECT column_name, character_maximum_length, is_nullable
FROM information_schema.columns
WHERE table_name = 'instruments'
  AND column_name = 'code';
-- Resultado esperado: 1 fila con character_maximum_length = 10, is_nullable = 'YES'
```

### 8.8 Constraint UNIQUE en instruments.code

```sql
SELECT constraint_name, constraint_type
FROM information_schema.table_constraints
WHERE table_name = 'instruments'
  AND constraint_name = 'UQ_instruments_code';
-- Resultado esperado: 1 fila con constraint_type = 'UNIQUE'
```

### 8.9 farmers acepta NULLs en columnas relajadas

```sql
SELECT column_name, is_nullable
FROM information_schema.columns
WHERE table_name = 'farmers'
  AND column_name IN (
    'last_name', 'document_id', 'email', 'phone', 'age',
    'gender', 'education_level', 'experience_years',
    'family_size', 'is_main_income', 'participation_in_training'
  )
ORDER BY column_name;
-- Resultado esperado: 11 filas, todas con is_nullable = 'YES'
```

### 8.10 farms acepta NULLs en columnas relajadas

```sql
SELECT column_name, is_nullable
FROM information_schema.columns
WHERE table_name = 'farms'
  AND column_name IN (
    'location', 'area', 'water_access', 'internet_access',
    'has_stability_electricity', 'technical_assistance_access'
  )
ORDER BY column_name;
-- Resultado esperado: 6 filas, todas con is_nullable = 'YES'
```

### 8.11 FKs de step_conditions apuntan a tablas correctas

```sql
SELECT
  kcu.column_name,
  ccu.table_name AS foreign_table,
  ccu.column_name AS foreign_column
FROM information_schema.key_column_usage kcu
JOIN information_schema.referential_constraints rc
  ON kcu.constraint_name = rc.constraint_name
JOIN information_schema.constraint_column_usage ccu
  ON rc.unique_constraint_name = ccu.constraint_name
WHERE kcu.table_name = 'step_conditions';
-- Resultado esperado: 3 filas (step_id → campaign_steps, condition_question_id → questions, condition_crop_id → types_of_crops)
```

### 8.12 Integridad referencial — step_conditions sin huérfanos

```sql
-- No debe haber filas en step_conditions cuyo step_id no exista en campaign_steps
SELECT COUNT(*)
FROM step_conditions sc
LEFT JOIN campaign_steps cs ON cs.step_id = sc.step_id
WHERE cs.step_id IS NULL;
-- Resultado esperado: 0
```

### 8.13 Validar tabla migrations en la base de datos

```sql
SELECT name, timestamp FROM migrations ORDER BY timestamp DESC LIMIT 5;
-- Debe incluir las migraciones ejecutadas con sus timestamps
```

### 8.14 Verificar que instruments existentes no fueron afectados

```sql
SELECT COUNT(*) FROM instruments WHERE code IS NOT NULL;
-- Resultado esperado: 0 (los 30 instruments existentes no tienen code asignado aún)
```

---

## 9. Notas Adicionales

### Sobre el flag `synchronize: true` en desarrollo

El archivo `app.module.ts` en el entorno de desarrollo usa `synchronize: true`, lo que significa que TypeORM modifica automáticamente el esquema para reflejar las entidades. Producción usa `synchronize: false` con migraciones explícitas. Nunca ejecutar el backend en modo desarrollo apuntando a la base de datos de producción.

### Sobre el registro de migraciones ejecutadas

TypeORM mantiene la tabla `migrations` en la base de datos para saber qué migraciones se han aplicado. Después de ejecutar `pnpm migration:run` contra Neon, verificar que los registros fueron insertados:

```sql
SELECT * FROM migrations ORDER BY timestamp DESC;
```

### Sobre Neon y transacciones DDL

Neon es compatible con PostgreSQL estándar y soporta DDL dentro de transacciones. El runner de TypeORM envuelve cada migración en una transacción, por lo que si falla en mitad de ejecución, se hace rollback automático de esa migración específica.

### Pendiente posterior a esta migración

Una vez completada esta migración, el próximo ciclo de desarrollo debe:
1. Configurar Neon branching para staging antes de aplicar cambios futuros a producción.
2. Revisar si `synchronize: true` puede desactivarse en desarrollo y reemplazarse por migraciones para mantener consistencia entre entornos.
