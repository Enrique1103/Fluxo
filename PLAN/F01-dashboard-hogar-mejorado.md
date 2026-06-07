# F01 — Dashboard del Hogar Mejorado

> **Prioridad:** 🔴 Alta — quick win con alto valor para usuarios actuales.
> **Estimación:** 1-2 fines de semana (8-12 horas)
> **Dependencias:** Ninguna (puede ser la primera feature)

---

## 🎯 PRD — Product Requirements

### Problema que resuelve

El dashboard actual del Hogar (`HouseholdPage.tsx`) muestra información financiera básica pero **sin la riqueza visual del dashboard personal**. Los usuarios beta lo han pedido explícitamente:

> *"el desboard del hogar si tuviera graficos intuitivos estaria mejor, como si se tratara del desboard de finanaza personales"*

### Casos de uso reales

**Caso 1: Pareja revisando el mes**
A fin de mes, una pareja abre el hogar para ver cómo les fue. Quieren ver de un vistazo: cuánto entró, cuánto gastaron, en qué se fue la mayor parte, qué días gastaron más.

**Caso 2: Familia controlando gastos compartidos**
Una familia de 4 quiere identificar patrones: ¿gastamos más los fines de semana? ¿Qué categoría creció vs el mes anterior?

**Caso 3: Compañeros de cuarto**
Roommates revisan al final del mes para ver cuánto debe cada uno, pero también quieren ver visualmente en qué se fue la plata.

### Hipótesis del producto

Si el dashboard del hogar tiene la misma calidad visual y profundidad analítica que el personal, los usuarios:
- Visitan más seguido el hogar (engagement)
- Toman mejores decisiones financieras grupales
- Promueven Fluxo a más conocidos (viralidad)

### Métricas de éxito

- ✅ El dashboard del hogar reutiliza los mismos componentes visuales que el personal
- ✅ Los beta testers reportan satisfacción con la nueva vista
- ✅ Visitas a la página `/hogar` aumentan (cuando haya analytics)

### Out of scope (explícito)

❌ NO se modifican los **tipos de hogar** todavía (eso es F03)
❌ NO se agrega análisis_level configurable (eso es F03)
❌ NO se agregan metas del hogar (eso es F03)
❌ NO se agrega análisis de ingresos del hogar (eso es F03 con analysis_level=FULL)

**Esta feature se enfoca SOLO en mejorar visualmente el análisis de gastos del hogar.**

---

## 🛠 TRD — Technical Requirements

### Estado actual

`HouseholdPage.tsx` muestra:
- Lista de miembros
- Gastos del mes (lista simple)
- Liquidación de deudas
- Gráfico donut de categorías (`household/CategoryDonut.tsx`)

Componentes del dashboard PERSONAL (`StatsDashboardPage.tsx` + `DashboardPage.tsx`) que NO están reusados en el hogar:
- KPI cards (ingresos, gastos, ahorro, tasa de ahorro)
- Comparación con mes anterior
- Heatmap de días con más gasto
- Top conceptos del mes
- Income vs expenses chart
- Tabla de transacciones con filtros

### Cambios necesarios

#### Backend

**Modificaciones MÍNIMAS** — la mayoría de la lógica ya existe.

1. **Verificar que `household_analytics_service.py` retorne todos los datos necesarios.**
   
   Endpoint actual: `GET /api/v1/households/{id}/analytics?month=YYYY-MM`
   
   Debe retornar (o agregar si faltan):
   - `total_expenses_household` (total gastos del hogar este mes)
   - `expenses_by_category` (donut)
   - `expenses_by_day` (heatmap)
   - `top_concepts` (top 5 conceptos más gastados)
   - `comparison_previous_month` (delta vs mes anterior)
   - `expenses_by_member` (cuánto pagó cada uno)
   - `member_contributions` (proporción de aporte real)

2. **NO modificar modelos.** No hay cambios de DB.
3. **NO modificar parsers ni servicios de transacciones.**

#### Frontend

**El grueso del trabajo está acá.**

##### Archivos NUEVOS

```
frontend/src/components/household/
├── HouseholdKPICards.tsx        # 4 cards: ingresos, gastos, ahorro, tasa
├── HouseholdHeatmap.tsx         # Heatmap de gastos por día del mes
├── HouseholdTopConcepts.tsx     # Top 5 conceptos más gastados
├── HouseholdMonthComparison.tsx # Comparación con mes anterior
└── HouseholdExpensesTable.tsx   # Tabla con filtros de transacciones del hogar
```

##### Archivos a MODIFICAR

```
frontend/src/pages/HouseholdPage.tsx
```

Reorganizar el layout para incluir los nuevos componentes. Layout propuesto:

```
┌─────────────────────────────────────────────────────────────┐
│ 🏠 Familia García                  Mayo 2026 ▼              │
│ 4 miembros • Tipo: Proporcional                             │
├─────────────────────────────────────────────────────────────┤
│  KPI Cards (4 columns):                                     │
│  ┌─────────┬─────────┬─────────┬─────────┐                  │
│  │ Gastos  │ Por día │ Mayor   │ vs Mes  │                  │
│  │ $45.000 │ $1.500  │ Alim.   │ +12%    │                  │
│  └─────────┴─────────┴─────────┴─────────┘                  │
├─────────────────────────────────────────────────────────────┤
│  Donut categorías        │  Heatmap del mes                 │
│  [gráfico]               │  [calendario con intensidad]     │
├─────────────────────────────────────────────────────────────┤
│  Top 5 conceptos         │  Comparación mes anterior        │
│  Supermercado: $18.000   │  Alimentación: ↑ $2.000          │
│  Combustible: $8.500     │  Transporte: ↓ $500              │
│  Servicios: $6.200       │  ...                             │
│  ...                     │                                  │
├─────────────────────────────────────────────────────────────┤
│  Liquidación de deudas:                                     │
│  Papá le debe $1.500 a Mamá                                 │
│  Hijo le debe $800 a Papá                                   │
├─────────────────────────────────────────────────────────────┤
│  Transacciones del mes (con filtros):                       │
│  [tabla filtrable]                                          │
└─────────────────────────────────────────────────────────────┘
```

### Reglas inmutables específicas de F01

1. **NO modificar** los componentes del dashboard personal (`StatsDashboardPage.tsx`, etc.).
   Si son reusables, **copialos y adaptalos** para el hogar. NO los hagas más genéricos modificándolos.
   *Razón:* Romper el dashboard personal por intentar genericidad es alto riesgo, bajo beneficio.

2. **Los gráficos del hogar usan Plotly** (mismo que personal).
   Mantener consistencia visual.

3. **Las queries de analytics filtran por `household.members contains current_user`.**
   Sin esto, hay riesgo de leakage entre hogares.

4. **El selector de mes debe ser el mismo componente** (`MonthYearPicker.tsx`) que usa el dashboard personal.

5. **NO tocar el endpoint de analytics** salvo agregar campos si faltan.
   Las firmas de funciones existentes son contratos.

### Migraciones necesarias

**NINGUNA.** Esta feature no toca el modelo de datos.

### Tests requeridos

#### Backend
Si se agregan campos al endpoint de analytics, actualizar:
- `test_households.py::TestHouseholdAnalytics::test_analytics_returns_valid_structure`
  
  Agregar asserts para los nuevos campos.

#### Frontend
**No hay tests frontend en el proyecto actual.** No se introducen en esta feature.
(Discutir si vale la pena agregar testing-library en otro momento.)

---

## ✅ Criterios de aceptación

### Funcional

- [ ] El dashboard del hogar muestra 4 KPI cards (gastos totales, promedio diario, categoría mayor, comparación con mes anterior)
- [ ] Hay un donut de gastos por categoría (ya existía, mantener)
- [ ] Hay un heatmap de gastos por día del mes
- [ ] Hay una lista de top 5 conceptos
- [ ] Hay una comparación con el mes anterior por categoría
- [ ] La tabla de transacciones tiene filtros (por categoría, por miembro, por fecha)
- [ ] El selector de mes funciona correctamente
- [ ] La liquidación de deudas sigue funcionando como antes

### Técnico

- [ ] Los 123 tests existentes siguen pasando
- [ ] El endpoint `/households/{id}/analytics` retorna todos los campos necesarios
- [ ] El frontend no rompe el dashboard personal
- [ ] No hay errores en consola del browser
- [ ] No hay warnings de React Query
- [ ] El código sigue las convenciones de `03-CONVENCIONES-DE-CODIGO.md`

### Performance

- [ ] La página carga en menos de 2 segundos (con datos típicos de un mes)
- [ ] Los gráficos renderizan sin "salto" visual

### UX

- [ ] El layout es responsive (se ve bien en mobile y desktop)
- [ ] La paleta de colores es consistente con el dashboard personal
- [ ] Los textos están en español
- [ ] Los montos están formateados con separadores de miles

---

## 📊 Mock visual

### Mobile (priority)

```
┌──────────────────────────┐
│ 🏠 Familia García   ⚙️    │
│ 4 miembros               │
│ [Mayo 2026 ▼]            │
├──────────────────────────┤
│ Gastos totales           │
│ $45.000                  │
│ ↑ 12% vs mes anterior    │
├──────────────────────────┤
│ Promedio diario          │
│ $1.500                   │
├──────────────────────────┤
│ 🎯 Mayor gasto           │
│ Alimentación             │
│ $18.000 (40%)            │
├──────────────────────────┤
│ Gastos por categoría     │
│ [donut chart]            │
├──────────────────────────┤
│ Heatmap del mes          │
│ [calendar grid]          │
├──────────────────────────┤
│ Top conceptos            │
│ 1. Supermercado $18.000  │
│ 2. Combustible $8.500    │
│ ...                      │
├──────────────────────────┤
│ Liquidación              │
│ Papá → Mamá: $1.500      │
│ Hijo → Papá: $800        │
└──────────────────────────┘
```

### Desktop

Layout de 2 columnas (como el dashboard personal). KPIs en una fila arriba, gráficos en grid de 2x2, tabla abajo.

---

## 🚀 Plan de implementación

### Sprint 1 (fin de semana 1)
- Verificar endpoint analytics retorna todos los campos
- Implementar `HouseholdKPICards.tsx`
- Implementar `HouseholdMonthComparison.tsx`
- Refactor del layout de `HouseholdPage.tsx`

### Sprint 2 (fin de semana 2)
- Implementar `HouseholdHeatmap.tsx`
- Implementar `HouseholdTopConcepts.tsx`
- Implementar `HouseholdExpensesTable.tsx` con filtros
- Testing manual completo + ajustes UX
- Merge a main

---

## 🔗 Referencias

- **Componentes a inspirar** (no copiar literal): `DashboardPage.tsx`, `StatsDashboardPage.tsx`
- **Componentes a reusar**: `MonthYearPicker.tsx`, `household/CategoryDonut.tsx`
- **API existente**: `GET /api/v1/households/{id}/analytics?month=YYYY-MM`
- **Servicio backend**: `household_analytics_service.py`

---

## 📝 Notas de implementación

- El dashboard del hogar **no** muestra ingresos personales de los miembros. Solo gastos compartidos del hogar.
- En esta feature **NO se introducen ingresos del hogar** (eso es F03 con analysis_level=FULL).
- Los componentes que se creen para esta feature serán **reusables más adelante** cuando F03 introduzca distintos analysis_levels.
- Si el endpoint backend retorna campos que el frontend aún no usa, **está bien**. Es para uso futuro.
