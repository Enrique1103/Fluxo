# 🧪 QA-F01 — Dashboard del Hogar Mejorado

> **Verificá ESTE checklist DESPUÉS de pasar el `QA-template.md`.**

---

## ✅ Verificación específica F01

### Backend

- [ ] El endpoint `GET /api/v1/households/{id}/analytics?month=YYYY-MM` retorna **todos** los campos esperados:
  - `total_expenses_household`
  - `expenses_by_category`
  - `expenses_by_day`
  - `top_concepts`
  - `comparison_previous_month`
  - `expenses_by_member`
- [ ] Si la query del endpoint cambió, sigue filtrando por miembros activos del hogar
- [ ] Solo miembros del hogar pueden acceder al analytics (403 si no es miembro)
- [ ] Los montos en el response son `Decimal` (no `float` con errores de precisión)
- [ ] El parámetro `month` valida formato YYYY-MM (rechaza inválidos)

### Frontend - Componentes

- [ ] `HouseholdKPICards.tsx` existe y muestra 4 cards
- [ ] `HouseholdHeatmap.tsx` existe y muestra calendario
- [ ] `HouseholdTopConcepts.tsx` existe y muestra top 5
- [ ] `HouseholdMonthComparison.tsx` existe y muestra delta vs mes anterior
- [ ] `HouseholdExpensesTable.tsx` existe con filtros
- [ ] `HouseholdPage.tsx` integra todos los componentes nuevos

### Frontend - UX

- [ ] El selector de mes (`MonthYearPicker`) funciona correctamente
- [ ] Al cambiar el mes, todos los gráficos se actualizan
- [ ] Los gráficos usan Plotly (consistente con el dashboard personal)
- [ ] La paleta de colores es coherente con el dashboard personal
- [ ] Los montos están formateados con separadores de miles (`$1.500` no `$1500`)
- [ ] Estados de loading visibles mientras carga
- [ ] Estados de error muestran mensaje útil en español
- [ ] La página es responsive en mobile (probar con DevTools: 375px)
- [ ] La página es responsive en desktop (probar con 1920px)

### Funcional - Happy Path

Crear un hogar con 2 miembros y cargar transacciones:

- [ ] Cada miembro carga al menos 3 gastos en distintas categorías
- [ ] Algunas transacciones son del mismo día (para testear heatmap)
- [ ] Hay variedad de conceptos (para testear top 5)

Verificar:

- [ ] El total de gastos del hogar suma correctamente
- [ ] El promedio diario = total / días del mes
- [ ] El donut muestra todas las categorías presentes
- [ ] El heatmap muestra días con más actividad más oscuros/intensos
- [ ] El top 5 conceptos lista los más gastados, ordenados desc
- [ ] La comparación vs mes anterior muestra:
  - ↑ verde si subió
  - ↓ rojo si bajó
  - = neutro si igual

### Funcional - Edge Cases

- [ ] **Mes sin transacciones:** la página muestra "No hay gastos este mes" sin errores
- [ ] **Hogar de 1 miembro:** el dashboard funciona aunque sea un hogar de 1 persona
- [ ] **Mes con 1 sola transacción:** todos los gráficos se renderizan
- [ ] **Datos con USD y UYU mezclados:** se muestran convertidos correctamente
- [ ] **Mes anterior sin datos:** la comparación no rompe, muestra "Sin datos previos"

### Performance

- [ ] La página carga en menos de 2 segundos con datos típicos (50-100 transacciones del mes)
- [ ] Los gráficos no causan "salto" visual al renderizar
- [ ] No hay re-renders innecesarios (verificar con React DevTools Profiler)

### Regresión

- [ ] El dashboard personal (`/`) sigue funcionando idéntico
- [ ] El dashboard de stats (`/stats`) sigue funcionando idéntico
- [ ] La importación bancaria sigue funcionando
- [ ] La liquidación de deudas del hogar (función existente) sigue funcionando
- [ ] El donut original (`household/CategoryDonut.tsx`) sigue mostrando lo mismo

---

## 🎯 Test de fuego

**Escenario realista:**

Como Ana (usuaria), abrís `/hogar` un domingo a la noche para ver cómo le fue al hogar este mes:

1. Entrás a `/hogar`
2. Ves rápidamente: "Gastamos $48.500 este mes, $1.560 por día"
3. Notás que el mes anterior fue $42.000 → ↑ 15%
4. Ves que la categoría que más creció fue "Salidas" en $3.500
5. Hacés click en el filtro de la tabla → "Salidas"
6. Ves las salidas del mes para entender
7. Total: ~2 minutos para tener insight financiero útil

**Tildá si esto funciona fluido y útil:** [ ]

Si no es fluido, hay problema de UX. Pedí ajustes a Claude Code.

---

## 📊 Reporte de QA

```markdown
# QA Report — F01: Dashboard del Hogar Mejorado

Fecha: YYYY-MM-DD
Branch: feature/F01-dashboard-hogar
Commit: abcd1234

## Resultado: ✅ / ❌

## Tests automatizados
- Antes: 123 ✅
- Después: 12X ✅ (sumar nuevos)

## Verificación específica F01
- Backend: X/X items ✅
- Frontend componentes: X/X items ✅
- Frontend UX: X/X items ✅
- Happy path: ✅
- Edge cases: X/X items ✅
- Performance: ✅
- Regresión: ✅

## Test de fuego
✅ Fluido y útil / ❌ Hay problemas con [especificar]

## Notas
[Observaciones, mejoras menores, etc.]

## Listo para merge: SÍ / NO
```

---

## 🚨 Problemas comunes en esta feature

### Problema: los componentes nuevos pesan mucho el bundle
**Verificar:** Plotly es grande. Asegurate que el código no esté importando todo Plotly, solo lo necesario.

### Problema: el heatmap se ve roto en mobile
**Solución típica:** el grid de calendario necesita ajustes de tamaño en breakpoints chicos.

### Problema: la comparación con mes anterior muestra valores raros
**Verificar:** el cálculo debe considerar si el mes anterior tiene MÁS días o MENOS que el actual. Comparar "tasas" no "totales absolutos" cuando los meses son distintos.

### Problema: la tabla de transacciones no se filtra correctamente
**Verificar:** los filtros deben aplicar al frontend con `useMemo`, no hacer requests al backend por cada cambio de filtro.
