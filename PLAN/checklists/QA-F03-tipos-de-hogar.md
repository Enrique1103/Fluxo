# 🧪 QA-F03 — Tipos de Hogar

> **Verificá ESTE checklist DESPUÉS de pasar `QA-template.md`.**

---

## ✅ Verificación específica F03

### Backend - Modelo y migración

- [ ] Enum `SplitMethod` con valores `EQUAL` y `PROPORTIONAL` (NO `CUSTOM` todavía)
- [ ] Enum `AnalysisLevel` con valores `EXPENSES_ONLY`, `EXPENSES_AND_GOALS`, `FULL`
- [ ] Modelo `Household` tiene los 2 nuevos campos `split_method` y `analysis_level`
- [ ] Ambos campos son `nullable=False` con default razonable
- [ ] Migración Alembic aplicable sin errores
- [ ] Migración crea los tipos enum en PostgreSQL
- [ ] **Hogares existentes** (pre-feature) migraron a defaults seguros:
  - Si tenían split_type proporcional → `PROPORTIONAL`
  - Resto → `EQUAL`
  - Todos → `EXPENSES_ONLY` (refleja comportamiento previo)

**Verificación crítica:**

```sql
-- Correr en DB después de migración
SELECT id, name, split_method, analysis_level FROM households;
-- Verificar que NINGÚN hogar tiene NULL en estos campos
```

- [ ] Ningún hogar tiene NULL en `split_method`
- [ ] Ningún hogar tiene NULL en `analysis_level`

### Backend - Schemas

- [ ] `HouseholdCreate` acepta `split_method` y `analysis_level` (opcionales con defaults)
- [ ] `HouseholdUpdate` **NO** permite cambiar `split_method` ni `analysis_level`
- [ ] Solo permite `name` en update
- [ ] `HouseholdRead` retorna ambos campos

### Backend - Service y endpoints

- [ ] `POST /households` crea con los nuevos campos
- [ ] `PUT /households/{id}` solo permite editar `name`
  - Intentar cambiar split_method → 422 o ignorado
  - Intentar cambiar analysis_level → 422 o ignorado
- [ ] `GET /households/{id}/analytics` **adapta** el response según `analysis_level`:
  - **EXPENSES_ONLY:** NO incluye `incomes`, `goals`, `combined_patrimony`
  - **EXPENSES_AND_GOALS:** incluye `goals`, NO incluye `incomes`, NO incluye `combined_patrimony`
  - **FULL:** incluye TODO

### Tests automatizados

- [ ] `test_create_with_defaults` — sin especificar, default EQUAL + EXPENSES_ONLY
- [ ] `test_create_with_proportional_split` — crear con PROPORTIONAL
- [ ] `test_create_with_full_analysis` — crear con FULL
- [ ] `test_create_invalid_split_method_422` — enviar valor inválido → 422
- [ ] `test_update_name` — puede modificar nombre
- [ ] `test_cannot_update_split_method` — split_method NO se modifica
- [ ] `test_cannot_update_analysis_level` — analysis_level NO se modifica
- [ ] `test_expenses_only_excludes_incomes` — response no tiene `incomes`
- [ ] `test_full_includes_all_sections` — response tiene `incomes`, `goals`, `combined_patrimony`
- [ ] `test_proportional_split_calculation` — liquidación usa porcentajes
- [ ] `test_equal_split_calculation` — liquidación divide igual

### Frontend - Wizard

- [ ] El wizard de creación tiene 3 pasos claros
- [ ] **Paso 1 (Nombre):** validación de mínimo/máximo, error si vacío
- [ ] **Paso 2 (Split):** 2 opciones con descripciones claras
- [ ] **Paso 3 (Analysis):** 3 opciones con descripciones claras
- [ ] **Paso 3 muestra warning explícito si se elige FULL:**
  - Texto tipo "⚠️ Los miembros verán los ingresos que cada uno aporte al hogar"
  - El warning es **visible**, no oculto
- [ ] Navegación entre pasos: [← Atrás] [Siguiente →] [Crear hogar]
- [ ] No se puede avanzar al paso siguiente sin completar el actual
- [ ] Se puede retroceder y los datos se mantienen

### Frontend - Dashboard adaptativo

Probar con 3 hogares de los 3 tipos distintos:

**Hogar EXPENSES_ONLY:**
- [ ] Muestra lista de miembros
- [ ] Muestra gastos del mes
- [ ] Muestra liquidación de deudas
- [ ] **NO** muestra sección de metas
- [ ] **NO** muestra sección de ingresos
- [ ] **NO** muestra patrimonio combinado

**Hogar EXPENSES_AND_GOALS:**
- [ ] Todo lo de EXPENSES_ONLY
- [ ] **SÍ** muestra sección de metas del hogar
- [ ] **NO** muestra sección de ingresos
- [ ] **NO** muestra patrimonio combinado

**Hogar FULL:**
- [ ] Todo lo de EXPENSES_AND_GOALS
- [ ] **SÍ** muestra sección de ingresos aportados al hogar
- [ ] **SÍ** muestra patrimonio combinado

### Frontend - Badge de tipo

- [ ] El header del hogar muestra un badge con la configuración:
  - Ej: "4 miembros · Proporcional · Solo gastos"
- [ ] El badge se ve sutil pero informativo

### Funcional - Happy Path

**Caso 1: Pareja unida**

1. Usuario A crea hogar "Pareja Ana y Carlos"
2. Wizard:
   - Paso 1: "Pareja Ana y Carlos"
   - Paso 2: PROPORTIONAL
   - Paso 3: FULL → ve y acepta warning
3. Invita a Usuario B, aprueba
4. Cargan ingresos y gastos
- [ ] Ambos ven todos los gastos
- [ ] Ambos ven los ingresos aportados al hogar
- [ ] La liquidación se calcula proporcionalmente

**Caso 2: Roommates**

1. Usuario A crea "Apartamento UTU"
2. Wizard:
   - Paso 2: EQUAL
   - Paso 3: EXPENSES_ONLY (default)
3. Invita 3 personas más
4. Cargan gastos
- [ ] Ven gastos compartidos
- [ ] NO ven ingresos de los demás
- [ ] La liquidación divide en 4 partes iguales

**Caso 3: Amigos planeando un viaje**

1. Usuario crea "Viaje Brasil"
2. Wizard:
   - Paso 2: EQUAL
   - Paso 3: EXPENSES_AND_GOALS
3. Cargan meta del hogar "Vuelos $2000"
- [ ] Ven la meta del hogar
- [ ] Pueden contribuir
- [ ] NO ven ingresos individuales

### Funcional - Edge Cases

- [ ] **Crear hogar enviando solo nombre** (sin split, sin analysis):
  - Backend asigna defaults: EQUAL + EXPENSES_ONLY ✅
  
- [ ] **Crear con split inválido** (ej: `"split_method": "weird"`):
  - 422 ✅
  
- [ ] **Tratar de cambiar split_method vía PUT:**
  - El campo se ignora o se rechaza con 422 ✅
  - El valor en DB NO cambia ✅
  
- [ ] **Hogar viejo (pre-migración):**
  - Se ve correctamente con sus defaults migrados ✅
  - El analytics retorna lo correcto según su `analysis_level` ✅

### Regresión

- [ ] Crear hogares sigue funcionando
- [ ] Invitaciones de hogares funcionan
- [ ] Aprobación de miembros funciona
- [ ] Hogares preexistentes siguen accesibles
- [ ] Otras features (Transactions, Goals, etc.) intactas

---

## 🎯 Test de fuego

**Escenario realista — Familia García (caso original):**

1. Mamá crea "Finanzas mamá y papá" → PROPORTIONAL + FULL
   - [ ] El wizard guía sin confusión
   - [ ] Mamá acepta el warning de privacidad
2. Mamá invita a Papá. Papá acepta.
3. Mamá crea "Finanzas del hogar" → PROPORTIONAL + EXPENSES_ONLY
4. Mamá invita a Papá, Hijo, Novia. Todos aceptan.
5. Hijo crea "Finanzas hijo y novia" → EQUAL + FULL
6. Hijo invita a Novia. Acepta.

Verificar que cada usuario ve la cantidad correcta de hogares con la configuración correcta:

- [ ] Mamá ve 2 hogares: "Finanzas mamá y papá" y "Finanzas del hogar"
- [ ] Papá ve 2 hogares: igual que mamá
- [ ] Hijo ve 2 hogares: "Finanzas del hogar" y "Finanzas hijo y novia"
- [ ] Novia ve 2 hogares: igual que hijo
- [ ] **Mamá NO ve "Finanzas hijo y novia"** (no es miembro)
- [ ] **Hijo NO ve "Finanzas mamá y papá"** (no es miembro)

**Tildá si todo se ve correcto:** [ ]

Este caso valida el modelo completo de hogares múltiples con tipos diferenciados.

---

## 📊 Reporte de QA

```markdown
# QA Report — F03: Tipos de Hogar

Fecha: YYYY-MM-DD
Branch: feature/F03-tipos-de-hogar
Commit: abcd1234

## Resultado: ✅ / ❌

## Tests
- Antes: 128 (post F02)
- Después: 138+ (10 nuevos mínimo)

## Verificación específica
- Modelo + migración: ✅
- Datos pre-existentes migrados: ✅
- Schemas: ✅
- Service y endpoints: ✅
- Tests automatizados: 11/11 ✅
- Frontend wizard: ✅
- Dashboard adaptativo (EXPENSES_ONLY): ✅
- Dashboard adaptativo (EXPENSES_AND_GOALS): ✅
- Dashboard adaptativo (FULL): ✅
- Badge de tipo: ✅
- Happy path (3 casos): ✅
- Edge cases: ✅
- Regresión: ✅
- Test de fuego (Familia García): ✅

## Notas
[Observaciones]

## Listo para merge: SÍ / NO
```

---

## 🚨 Problemas comunes en esta feature

### Problema: la migración falla por hogares existentes con NULL
**Causa:** se olvidó `server_default` en la migración.
**Solución:** la migración debe tener `server_default='equal'` y `server_default='expenses_only'`.

### Problema: en `HouseholdUpdate` permite cambiar split_method
**Causa:** se olvidó excluirlo del schema.
**Verificar:** intentar enviar `{"split_method": "equal"}` a PUT debe retornar 422 o ignorar el campo silenciosamente.

### Problema: el analytics retorna campos que NO debería según el analysis_level
**Causa:** el service no está adaptando el response correctamente.
**Solución:** condicionales en el service que solo agregan keys al dict según el level.

### Problema: la liquidación PROPORTIONAL no funciona si los miembros no tienen ingresos
**Verificar:** el código debería tener fallback a EQUAL cuando nadie tiene ingresos (esto ya estaba implementado pre-F03 según el documento de estado).

### Problema: el warning de FULL no es visible
**Verificar:** el texto debe estar dentro del paso 3 del wizard, con icono ⚠️ y color que llame la atención (amarillo/naranja).
