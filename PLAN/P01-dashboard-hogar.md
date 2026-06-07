# P01 — Prompt para Claude Code: Dashboard del Hogar Mejorado

> **Copiá y pegá TODO lo que está debajo de la línea horizontal a Claude Code.**
> Asegurate de estar en una sesión NUEVA y en la rama `feature/F01-dashboard-hogar`.

---

## CONTEXTO DEL PROYECTO

Estás trabajando en **Fluxo**, una plataforma de finanzas personales uruguaya. El proyecto está en producción con 123 tests pasando, backend en FastAPI + PostgreSQL y frontend en React 19 + TypeScript.

**ANTES de escribir UNA SOLA línea de código:**

1. Leé el contenido completo de estos archivos del repo:
   - `docs/plan/01-PRINCIPIOS-INMUTABLES.md`
   - `docs/plan/02-ARQUITECTURA-Y-PATRONES.md`
   - `docs/plan/03-CONVENCIONES-DE-CODIGO.md`
   - `docs/plan/features/F01-dashboard-hogar-mejorado.md`

2. Resumime en 3 puntos lo que entendiste de **CADA** archivo (12 puntos en total).

3. Esperá MI confirmación antes de empezar.

---

## FEATURE A IMPLEMENTAR

**F01 — Dashboard del Hogar Mejorado**

Objetivo: que la página `/hogar` (componente `HouseholdPage.tsx`) tenga la misma riqueza visual y analítica que el dashboard personal. Hoy es flojo comparado con el personal.

**Resumen de cambios:**

- **Backend:** verificar/agregar campos en el endpoint `GET /api/v1/households/{id}/analytics` para soportar nuevos gráficos.
- **Frontend:** crear componentes nuevos para el hogar e integrarlos en `HouseholdPage.tsx`.

---

## REGLAS INMUTABLES PARA ESTA FEATURE

1. **NO modifiques** los componentes del dashboard personal (`StatsDashboardPage.tsx`, `DashboardPage.tsx`).
   Si necesitás funcionalidad similar, **copiá y adaptá** los componentes, no los hagas más genéricos.

2. **NO toques modelos de datos.** Esta feature no requiere cambios en SQLAlchemy.

3. **NO crees nuevas migraciones Alembic.**

4. **Las queries de analytics deben filtrar por miembros activos del hogar.**
   Verificá P1 (aislamiento de datos).

5. **Reutilizá** `MonthYearPicker.tsx` y `household/CategoryDonut.tsx` que ya existen.

6. Los textos visibles al usuario van en **español**.

7. **NO modifiques tests existentes** salvo el de `test_analytics_returns_valid_structure` SI agregás campos nuevos al response (en ese caso, agregá assertions, no quites).

8. **NO uses `localStorage` ni `sessionStorage`** en componentes nuevos (no hace falta para este feature).

---

## ARCHIVOS QUE PODÉS TOCAR

### Crear (NUEVOS)

```
frontend/src/components/household/HouseholdKPICards.tsx
frontend/src/components/household/HouseholdHeatmap.tsx
frontend/src/components/household/HouseholdTopConcepts.tsx
frontend/src/components/household/HouseholdMonthComparison.tsx
frontend/src/components/household/HouseholdExpensesTable.tsx
```

### Modificar (con cuidado)

```
frontend/src/pages/HouseholdPage.tsx
  → solo para integrar los nuevos componentes en el layout

backend/app/services/household_analytics_service.py
  → SOLO si faltan campos en el response (agregar, no modificar)

backend/app/schemas/household.py
  → SOLO si hay que actualizar el schema del response
```

### NO TOCAR jamás

```
frontend/src/pages/DashboardPage.tsx
frontend/src/pages/StatsDashboardPage.tsx
frontend/src/components/MonthYearPicker.tsx
frontend/src/components/household/CategoryDonut.tsx
backend/app/models/  ← todo
backend/app/crud/  ← salvo si hay query nueva imprescindible
Cualquier archivo NO listado arriba como "crear" o "modificar"
```

---

## CRITERIOS DE COMPLETITUD

La feature está completa cuando **TODOS** estos puntos son verdad:

### Backend
- [ ] El endpoint `GET /api/v1/households/{id}/analytics?month=YYYY-MM` retorna estos campos:
  - `total_expenses_household` (Decimal)
  - `expenses_by_category` (lista)
  - `expenses_by_day` (lista de objetos `{day: int, amount: Decimal}`)
  - `top_concepts` (lista de 5 conceptos más gastados)
  - `comparison_previous_month` (objeto con delta vs mes anterior)
  - `expenses_by_member` (lista de aportes por miembro)
- [ ] `pytest backend/tests/` pasa al 100% (123 tests siguen pasando + cualquier modificación tuya)
- [ ] El test `test_analytics_returns_valid_structure` verifica los nuevos campos si los agregaste

### Frontend
- [ ] 5 componentes nuevos creados en `frontend/src/components/household/`
- [ ] `HouseholdPage.tsx` integra los nuevos componentes en el layout
- [ ] El selector de mes funciona (usa `MonthYearPicker.tsx`)
- [ ] La página es responsive (se ve bien en mobile)
- [ ] Los montos están formateados con separadores de miles
- [ ] No hay errores en la consola del browser
- [ ] No hay warnings de React Query

### Manual (vos lo vas a verificar)
- [ ] Levantás backend + frontend localmente
- [ ] Vas a `/hogar` y ves los nuevos componentes
- [ ] Cambiar el mes actualiza los gráficos
- [ ] La paleta de colores es consistente con el dashboard personal

---

## FORMATO DE TRABAJO

Trabajá en **pasos pequeños**. Esperá MI aprobación entre cada paso.

### PASO 1: Diagnóstico del estado actual

Antes de codear nada:

1. Mostrame el contenido actual de `frontend/src/pages/HouseholdPage.tsx` (los primeros 100 renglones).
2. Mostrame qué campos retorna actualmente el endpoint `/households/{id}/analytics` (revisá `household_analytics_service.py`).
3. Identificá qué campos FALTAN para los gráficos nuevos.
4. Esperá mi aprobación.

### PASO 2: Backend (si hace falta)

Si en el paso 1 detectaste que faltan campos:

1. Modificá `household_analytics_service.py` para agregar los campos faltantes.
2. Actualizá el schema Pydantic del response si corresponde.
3. Actualizá el test `test_analytics_returns_valid_structure` con assertions sobre los nuevos campos.
4. Corré: `pytest backend/tests/test_households.py -v`
5. Pegame el output completo.
6. Esperá mi aprobación.

Si NO hace falta tocar backend, decímelo y saltá al paso 3.

### PASO 3: Componente `HouseholdKPICards.tsx`

1. Crealo siguiendo las convenciones de `03-CONVENCIONES-DE-CODIGO.md`.
2. Debe mostrar 4 cards: Gastos totales, Promedio diario, Mayor categoría, vs Mes anterior.
3. Usa React Query para consumir el endpoint de analytics.
4. Estilos con Tailwind, consistente con el dashboard personal.
5. Mostrame el código completo.
6. Esperá mi aprobación.

### PASO 4: Componente `HouseholdHeatmap.tsx`

Heatmap de gastos por día del mes (calendar grid). Esperá mi aprobación.

### PASO 5: Componente `HouseholdTopConcepts.tsx`

Lista top 5 conceptos con monto. Esperá mi aprobación.

### PASO 6: Componente `HouseholdMonthComparison.tsx`

Comparación con mes anterior por categoría (con flechas ↑ ↓). Esperá mi aprobación.

### PASO 7: Componente `HouseholdExpensesTable.tsx`

Tabla de transacciones con filtros (categoría, miembro, fecha). Esperá mi aprobación.

### PASO 8: Integración en `HouseholdPage.tsx`

1. Reorganizá el layout para incluir todos los componentes nuevos.
2. Mantené las funcionalidades existentes (miembros, donut, liquidación).
3. Mostrame el código completo del archivo modificado.
4. Esperá mi aprobación.

### PASO 9: Verificación final

1. Corré `pytest backend/tests/`.
2. Verificá que el frontend compila sin errores: `npm run build`.
3. Mostrame el output de ambos comandos.
4. Reportame el checklist de criterios de completitud, marcando cada uno.

---

## PROHIBICIONES EXPLÍCITAS

- ❌ NO modifiques archivos del dashboard personal.
- ❌ NO agregues features que no estén en este prompt.
- ❌ NO refactorices código existente "porque sí". Si ves algo que vale refactorizar, anótalo y avisame, no lo hagas.
- ❌ NO uses bibliotecas nuevas. Las disponibles son las que ya están en `package.json`.
- ❌ NO avances al siguiente paso sin mi aprobación.
- ❌ NO comites código en main. Trabajá en la rama `feature/F01-dashboard-hogar`.

---

## EN CASO DE DUDA

Si en cualquier paso tenés una duda técnica o de producto, **PARÁ y PREGUNTAME**. No asumas.

Ejemplo de duda válida:
> *"En el HouseholdHeatmap, ¿el `MonthYearPicker` debe filtrar la data del heatmap o solo el mes mostrado? Necesito clarificación."*

Ejemplo de "ahora invento":
> ❌ *"Decidí usar D3 para el heatmap porque Plotly no soporta calendar maps."*

Si dudás de algo así, PREGUNTAME primero. Si ya hay una librería de gráficos en el proyecto (Plotly), úsala.

---

¿Listo? Empezá por el PASO 1.
