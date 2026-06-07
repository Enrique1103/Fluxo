# P03 — Prompt para Claude Code: Tipos de Hogar

> **Sesión NUEVA. Rama `feature/F03-tipos-de-hogar`.**
> Esta es una feature **GRANDE**. Vamos a trabajar en sprints separados, no todo de una.

---

## CONTEXTO DEL PROYECTO

Fluxo: finanzas personales uruguaya. FastAPI + PostgreSQL + React 19. 123 tests.

**ANTES de codear:**

1. Leé:
   - `docs/plan/01-PRINCIPIOS-INMUTABLES.md`
   - `docs/plan/02-ARQUITECTURA-Y-PATRONES.md`
   - `docs/plan/03-CONVENCIONES-DE-CODIGO.md`
   - `docs/plan/features/F03-tipos-de-hogar.md`

2. Resumime 3 puntos por archivo.

3. Esperá mi confirmación.

---

## FEATURE A IMPLEMENTAR

**F03 — Tipos de Hogar**

Agregar 2 dimensiones configurables al modelo `Household`:

- `split_method`: EQUAL | PROPORTIONAL (cómo se reparten los gastos)
- `analysis_level`: EXPENSES_ONLY | EXPENSES_AND_GOALS | FULL (qué se analiza)

Estas configuraciones se eligen al crear el hogar y NO se modifican después.

---

## REGLAS INMUTABLES PARA ESTA FEATURE

1. **`split_method` y `analysis_level` NO se editan después de crear el hogar.**
   Endpoint PUT/PATCH de Household solo permite cambiar `name`.

2. **Hogares existentes migran a defaults seguros:**
   - `split_method = EQUAL` (salvo que ya tengan PROPORTIONAL — investigar en código actual si hay algún campo `SplitType` o similar)
   - `analysis_level = EXPENSES_ONLY` (todos, refleja comportamiento actual)

3. **El `analysis_level = FULL` expone ingresos** de un miembro a otros. La UI **DEBE** mostrar warning explícito al elegirlo.

4. **El backend valida enums estrictamente.** Valor inválido → 422.

5. **NO modificar tests existentes** salvo si cambia el response shape de hogares (en cuyo caso, AGREGAR assertions, no quitar).

6. **NO implementar `CUSTOM split_method` en esta versión.** Solo EQUAL y PROPORTIONAL.

7. **Migración Alembic con `server_default`** para que hogares existentes no fallen.

---

## ARCHIVOS QUE PODÉS TOCAR

### Backend - Crear

```
backend/alembic/versions/XXXX_add_household_types.py
backend/tests/test_household_types.py  (opcional, también podés agregar a test_households.py)
```

### Backend - Modificar

```
backend/app/models/household.py        → agregar campos split_method, analysis_level + enums
backend/app/schemas/household.py       → reflejar nuevos campos en Create/Read/Update
backend/app/services/household_service.py    → create acepta nuevos campos
backend/app/services/household_analytics_service.py  → adaptar según analysis_level
backend/app/api/v1/households.py       → endpoint create con validación
backend/tests/test_households.py       → agregar tests nuevos (no romper existentes)
```

### Frontend - Crear

```
frontend/src/components/household/CreateHouseholdWizard.tsx (reemplaza/extiende CreateModal.tsx)
frontend/src/components/household/HouseholdTypeBadge.tsx (muestra config en header)
```

### Frontend - Modificar

```
frontend/src/pages/HouseholdPage.tsx   → render condicional según analysis_level
frontend/src/api/households.ts         → tipos actualizados
frontend/src/types/household.ts        → enums TypeScript
```

### NO TOCAR

```
backend/app/models/transaction.py
backend/app/models/user.py
Otros modelos no relacionados
Tests existentes que no sean de households
```

---

## CRITERIOS DE COMPLETITUD

### Backend

- [ ] Enums `SplitMethod` y `AnalysisLevel` definidos
- [ ] Modelo `Household` tiene los 2 campos nuevos no nulos con defaults
- [ ] Migración Alembic creada Y aplicable sin errores
- [ ] Migración migra hogares existentes a defaults razonables
- [ ] Schema Pydantic `HouseholdCreate` acepta los campos (con defaults)
- [ ] Schema Pydantic `HouseholdUpdate` NO acepta cambios a split/analysis (solo name)
- [ ] Service `create` valida y guarda los campos
- [ ] Service `analytics` adapta el response según `analysis_level`:
  - EXPENSES_ONLY: solo expenses
  - EXPENSES_AND_GOALS: expenses + goals
  - FULL: expenses + goals + incomes + combined_patrimony
- [ ] 10+ tests nuevos cubriendo:
  - Crear con defaults
  - Crear con PROPORTIONAL
  - Crear con FULL
  - Crear con valor inválido → 422
  - Update name OK, update split_method 422
  - Analytics con cada `analysis_level` retorna campos correctos
  - Liquidación con EQUAL
  - Liquidación con PROPORTIONAL
- [ ] `pytest backend/tests/` pasa al 100% (123 + nuevos)

### Frontend

- [ ] Wizard de 3 pasos para crear hogar (nombre → split → analysis)
- [ ] Paso 3 muestra warning si se elige FULL
- [ ] `HouseholdPage.tsx` muestra/oculta secciones según `analysis_level`
- [ ] Badge visible con tipo configurado (ej: "Proporcional · Solo gastos")
- [ ] Compila sin errores: `npm run build`

---

## FORMATO DE TRABAJO

Esta feature se divide en **3 SPRINTS**. NO intentes hacer todo de una.

### SPRINT 1 — Backend (esperá mi aprobación entre cada paso)

#### Paso 1.1: Análisis del estado actual

1. Mostrame el modelo `Household` actual
2. Buscá referencias a "split", "proportional", "SplitType" en el código (con grep). Reportame qué encontrás.
3. Mostrame cómo funciona hoy la liquidación en `household_analytics_service.py`
4. Esperá aprobación

#### Paso 1.2: Enums + Modelo + Migración

1. Crear enums `SplitMethod` y `AnalysisLevel` en `models/household.py` o `models/enums.py`
2. Agregar columnas al modelo Household
3. Generar migración: `alembic revision --autogenerate -m "add household types"`
4. **Revisar manualmente** la migración generada — Alembic suele equivocarse
5. La migración debe:
   - Crear los tipos enum en PostgreSQL
   - Agregar columnas con `server_default` para hogares existentes
   - Si encontraste un campo legacy de "split type", migrar valores
6. Aplicar: `alembic upgrade head`
7. Mostrame el archivo de migración completo y el output del comando
8. Esperá aprobación

#### Paso 1.3: Schemas Pydantic

1. Actualizar `HouseholdCreate`, `HouseholdUpdate`, `HouseholdRead`
2. **Importante:** `HouseholdUpdate` NO debe permitir cambiar split_method ni analysis_level
3. Mostrame los schemas modificados
4. Esperá aprobación

#### Paso 1.4: Services

1. `household_service.create()` acepta y guarda los nuevos campos
2. `household_analytics_service` adapta response según `analysis_level`:
   - Si EXPENSES_ONLY: NO incluir keys `incomes`, `goals`, `combined_patrimony`
   - Si EXPENSES_AND_GOALS: incluir `goals`, NO incluir `incomes`
   - Si FULL: incluir todo
3. Si el code de liquidación ya implementaba PROPORTIONAL, integrarlo con el nuevo campo (no duplicar lógica)
4. Mostrame los métodos modificados completos
5. Esperá aprobación

#### Paso 1.5: Endpoint

1. Endpoint POST `/households` ya existe — verificar que pase los nuevos campos al service
2. Endpoint PUT/PATCH (si existe) — asegurarse que solo permite cambiar `name`
3. Mostrame el archivo del router
4. Esperá aprobación

#### Paso 1.6: Tests backend

1. Implementar los 10+ tests del checklist
2. Correr: `pytest backend/tests/ -v`
3. Pegame el output completo
4. Esperá aprobación

**Acá termina SPRINT 1. NO sigas con frontend hasta que apruebe el sprint.**

---

### SPRINT 2 — Frontend

#### Paso 2.1: Tipos TypeScript

1. Crear enums `SplitMethod` y `AnalysisLevel` en `types/household.ts`
2. Actualizar el tipo `Household`
3. Esperá aprobación

#### Paso 2.2: Wizard de creación

1. Crear `CreateHouseholdWizard.tsx` con 3 pasos:
   - Paso 1: Nombre del hogar
   - Paso 2: Tipo de división (radio buttons con descripciones)
   - Paso 3: Tipo de análisis (radio buttons con descripciones + warning para FULL)
2. Usar `react-hook-form` + `zod` (consistente con el proyecto)
3. Botones [← Atrás] [Siguiente →] [Crear hogar]
4. Mostrame el código completo
5. Esperá aprobación

#### Paso 2.3: Integración con HouseholdPage

1. Reemplazar el modal de creación con el wizard
2. Adaptar `HouseholdPage.tsx`:
   - Render condicional de sección de metas (solo si analysis_level != EXPENSES_ONLY)
   - Render condicional de sección de ingresos (solo si FULL)
   - Render condicional de patrimonio combinado (solo si FULL)
3. Agregar `HouseholdTypeBadge` en el header
4. Mostrame los cambios
5. Esperá aprobación

#### Paso 2.4: Verificación

1. `npm run build`
2. Testing manual:
   - Crear hogar EXPENSES_ONLY → verificar que NO se ven secciones de ingresos/metas
   - Crear hogar EXPENSES_AND_GOALS → verificar metas pero no ingresos
   - Crear hogar FULL → verificar todo
3. Pegame outputs y reportame qué viste

---

### SPRINT 3 — Pulido y QA

#### Paso 3.1: Edge cases

1. Verificar qué pasa con hogares existentes (pre-migración) en la UI
2. Verificar permisos (admin vs miembro)
3. Verificar que invalidación de cache funciona después de crear

#### Paso 3.2: Checklist final

Reportame el checklist completo de criterios de completitud marcando cada item.

---

## PROHIBICIONES EXPLÍCITAS

- ❌ NO implementes `CUSTOM` split_method.
- ❌ NO permitas modificar split_method ni analysis_level después de creado el hogar.
- ❌ NO modifiques migraciones Alembic ya aplicadas en producción (creá una nueva).
- ❌ NO toques modelos no relacionados (Transaction, User, Account).
- ❌ NO avances de Sprint sin mi aprobación.
- ❌ NO crees el wizard como un solo componente gigante — separá en sub-componentes por paso.

---

## EN CASO DE DUDA

PREGUNTAME. Dudas válidas:

- *"En el código actual veo un campo `split_type` con valor 'proportional'. ¿Es lo mismo que el nuevo `split_method`? ¿Renombrar o agregar?"*
- *"El análisis de patrimonio combinado en FULL: ¿debo sumar todos los saldos de cuentas de los miembros, o solo las marcadas como del hogar? No vi 'cuentas del hogar' en el modelo actual."*

Si encontrás un campo legacy, **NO lo modifiques sin consultarme**.

¿Listo? Empezá por SPRINT 1 PASO 1.1.
