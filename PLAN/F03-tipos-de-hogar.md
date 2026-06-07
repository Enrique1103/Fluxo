# F03 — Tipos de Hogar (split + analysis_level)

> **Prioridad:** 🟡 Media-alta — feature estructural que habilita futuras features.
> **Estimación:** 2-3 fines de semana (12-18 horas)
> **Dependencias:** Recomendado tener F01 hecha primero (componentes del dashboard).

---

## 🎯 PRD — Product Requirements

### Problema que resuelve

Hoy todos los hogares en Fluxo son iguales: tienen un único modelo de funcionamiento. Pero los usuarios reales tienen necesidades muy distintas:

- Una **pareja unida** quiere ver ingresos + gastos + metas conjuntas.
- **Compañeros de cuarto** solo quieren controlar gastos compartidos sin compartir información de ingresos.
- Una **familia con hijos** quiere repartir gastos proporcionalmente según ingresos.
- **Tres amigos planeando un viaje** quieren ver metas conjuntas sin compartir ingresos individuales.

Como dijo el dueño del producto:

> *"al crear el hogar se puede decidir su naturaleza, osea ademas de si se paga de forma proprocional a tus ingresos o partes iguales, debe haber opciones que te permitan que solo se lleve el analisis de gastos del hogar o el analiss de gastos en genral mas ingresos"*

### Casos de uso reales

**Caso 1: Pareja senior**
Papá y mamá crean un hogar "Finanzas mamá y papá" con:
- **split:** PROPORTIONAL (papá gana más, paga más)
- **analysis_level:** FULL (ven gastos, ingresos, metas, patrimonio combinado)

**Caso 2: Familia con hijos**
La familia crea "Finanzas del hogar" con los 4 miembros:
- **split:** PROPORTIONAL (cada uno paga según ingresos)
- **analysis_level:** EXPENSES_ONLY (solo ven gastos compartidos, nadie comparte ingresos personales)

**Caso 3: Pareja joven**
Hijo y novia crean "Finanzas hijo y novia":
- **split:** EQUAL (ganan parecido, se divide igual)
- **analysis_level:** FULL (comparten todo)

**Caso 4: Compañeros de cuarto**
4 amigos en un apartamento:
- **split:** EQUAL
- **analysis_level:** EXPENSES_ONLY

**Caso 5: Viaje en grupo**
4 amigos planean un viaje:
- **split:** EQUAL
- **analysis_level:** EXPENSES_AND_GOALS (gastos compartidos del viaje + meta común de ahorro, sin ingresos)

### Las 2 dimensiones configurables

#### Dimensión 1: split_method (cómo se reparten los gastos)

| Valor | Significado |
|---|---|
| `EQUAL` | Cada gasto se divide en partes iguales entre miembros |
| `PROPORTIONAL` | Cada uno aporta según porcentaje de ingreso (ya implementado parcialmente) |
| `CUSTOM` | Porcentajes configurables manualmente por miembro |

#### Dimensión 2: analysis_level (qué se analiza)

| Valor | Significado |
|---|---|
| `EXPENSES_ONLY` | Solo se ven gastos compartidos. Sin ingresos, sin metas. |
| `EXPENSES_AND_GOALS` | Gastos compartidos + metas conjuntas. Sin ingresos. |
| `FULL` | Gastos + ingresos aportados + metas + patrimonio combinado. |

**6 combinaciones posibles** (3 × 2), todas válidas según el caso de uso.

### Métricas de éxito

- ✅ Al crear un hogar, el usuario puede elegir tipo y nivel de análisis.
- ✅ El dashboard del hogar se adapta al `analysis_level` configurado.
- ✅ Los hogares existentes (antes de F03) migran a un default razonable sin romper datos.
- ✅ El usuario entiende sin confusión qué significa cada opción al crear el hogar.

### Out of scope (explícito)

❌ NO se implementa "cambiar de tipo de hogar" después de creado (puede ser futuro)
❌ NO se implementa CUSTOM split todavía (solo EQUAL y PROPORTIONAL en esta versión inicial)
❌ NO se implementa "aporte automático de ingresos" del usuario al hogar
❌ NO se implementa transición entre analysis_levels (un hogar nace con uno y se queda con ese)

---

## 🛠 TRD — Technical Requirements

### Cambios en modelo

#### Tabla `households`

Agregar 2 columnas:

```python
class Household(Base):
    # ... campos existentes ...
    
    split_method: Mapped[SplitMethod] = mapped_column(
        Enum(SplitMethod, name="split_method_enum"),
        nullable=False,
        default=SplitMethod.EQUAL
    )
    
    analysis_level: Mapped[AnalysisLevel] = mapped_column(
        Enum(AnalysisLevel, name="analysis_level_enum"),
        nullable=False,
        default=AnalysisLevel.EXPENSES_ONLY
    )
```

#### Enums nuevos

```python
class SplitMethod(str, PyEnum):
    EQUAL = "equal"
    PROPORTIONAL = "proportional"
    # CUSTOM = "custom"  # NO en esta versión

class AnalysisLevel(str, PyEnum):
    EXPENSES_ONLY = "expenses_only"
    EXPENSES_AND_GOALS = "expenses_and_goals"
    FULL = "full"
```

#### Migración Alembic

```python
"""Add split_method and analysis_level to households

Revision ID: xxxx
"""

def upgrade():
    # Crear enums
    op.execute("CREATE TYPE split_method_enum AS ENUM ('equal', 'proportional')")
    op.execute("CREATE TYPE analysis_level_enum AS ENUM ('expenses_only', 'expenses_and_goals', 'full')")
    
    # Agregar columnas con default razonable
    op.add_column('households', sa.Column(
        'split_method',
        sa.Enum('equal', 'proportional', name='split_method_enum'),
        nullable=False,
        server_default='equal'
    ))
    op.add_column('households', sa.Column(
        'analysis_level',
        sa.Enum('expenses_only', 'expenses_and_goals', 'full', name='analysis_level_enum'),
        nullable=False,
        server_default='expenses_only'
    ))
    
    # Migrar hogares existentes:
    # - Los que ya usan proporcional → split_method=proportional
    # - Resto → EQUAL
    # - Todos arrancan con analysis_level=EXPENSES_ONLY (compatible con lo actual)
    
    # Si existe una columna "split_type" o similar, mappear los valores acá


def downgrade():
    op.drop_column('households', 'analysis_level')
    op.drop_column('households', 'split_method')
    op.execute("DROP TYPE analysis_level_enum")
    op.execute("DROP TYPE split_method_enum")
```

**Importante:** Revisar primero en el código si ya existe alguna columna similar a `split_method` (en `household_analytics_service.py` se menciona `SplitType.PROPORTIONAL`). Si existe, esta migración consolida o renombra.

### Cambios en backend

#### Schemas Pydantic

```python
class HouseholdCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    split_method: SplitMethod = SplitMethod.EQUAL
    analysis_level: AnalysisLevel = AnalysisLevel.EXPENSES_ONLY

class HouseholdUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    # NO permitir cambiar split_method ni analysis_level después de creado
    # (deliberado, ver "Decisiones de diseño")

class HouseholdRead(BaseModel):
    id: int
    name: str
    split_method: SplitMethod
    analysis_level: AnalysisLevel
    members: list[HouseholdMemberRead]
    # ...
```

#### Servicio `household_service.py`

```python
def create(db: Session, user: User, data: HouseholdCreate) -> Household:
    household = Household(
        name=data.name,
        split_method=data.split_method,
        analysis_level=data.analysis_level,
    )
    db.add(household)
    db.flush()
    
    # Agregar al creador como admin
    member = HouseholdMember(
        household_id=household.id,
        user_id=user.id,
        role=Role.ADMIN,
        status=MemberStatus.ACTIVE
    )
    db.add(member)
    db.commit()
    return household
```

#### Servicio `household_analytics_service.py`

**Adaptar el análisis según `analysis_level`:**

```python
def get_analytics(db, household_id, user_id, month):
    household = household_crud.get_by_id(db, household_id)
    _verify_member(db, household_id, user_id)
    
    # Siempre se calculan gastos
    expenses = _calculate_expenses(db, household_id, month)
    
    result = {
        "total_expenses": expenses.total,
        "expenses_by_category": expenses.by_category,
        "expenses_by_member": expenses.by_member,
        # ...
    }
    
    # Liquidación según split_method
    if household.split_method == SplitMethod.EQUAL:
        result["settlement"] = _settle_equal(expenses, household.members)
    elif household.split_method == SplitMethod.PROPORTIONAL:
        result["settlement"] = _settle_proportional(db, expenses, household.members, month)
    
    # Análisis adicional según analysis_level
    if household.analysis_level in (AnalysisLevel.EXPENSES_AND_GOALS, AnalysisLevel.FULL):
        result["goals"] = _get_household_goals(db, household_id)
    
    if household.analysis_level == AnalysisLevel.FULL:
        result["incomes"] = _calculate_household_incomes(db, household_id, month)
        result["net_savings"] = result["incomes"].total - result["total_expenses"]
        result["combined_patrimony"] = _calculate_combined_patrimony(db, household_id)
    
    return result
```

**Helpers `_settle_equal` y `_settle_proportional` ya existen** (verificar nombres exactos en código actual).

#### Permisos

- **Crear hogar:** cualquier usuario autenticado.
- **Ver analytics del hogar:** solo miembros activos.
- **Configurar split_method y analysis_level:** solo al crear (no editable después).

### Cambios en frontend

#### Wizard de creación de hogar

`frontend/src/components/household/CreateModal.tsx` se convierte en un **wizard de 3 pasos**:

##### Paso 1: Nombre
```
┌──────────────────────────────────────────┐
│ Crear hogar — Paso 1 de 3                │
├──────────────────────────────────────────┤
│ Nombre del hogar:                        │
│ [___________________________]            │
│                                          │
│ Ejemplos:                                │
│ • Finanzas familia García                │
│ • Pareja                                 │
│ • Roommates Apto 5                       │
│                                          │
│ [Cancelar]              [Siguiente →]    │
└──────────────────────────────────────────┘
```

##### Paso 2: Tipo de división
```
┌──────────────────────────────────────────┐
│ Crear hogar — Paso 2 de 3                │
├──────────────────────────────────────────┤
│ ¿Cómo se reparten los gastos?            │
│                                          │
│ ● ⚖️ Partes iguales                       │
│    Cada gasto se divide igualmente.      │
│    Ideal: amigos, parejas similares.     │
│                                          │
│ ○ 📊 Proporcional al ingreso             │
│    Quien gana más, paga más.             │
│    Ideal: parejas con ingresos dispares. │
│                                          │
│ [← Atrás]              [Siguiente →]     │
└──────────────────────────────────────────┘
```

##### Paso 3: Tipo de análisis
```
┌──────────────────────────────────────────┐
│ Crear hogar — Paso 3 de 3                │
├──────────────────────────────────────────┤
│ ¿Qué tipo de análisis necesitan?         │
│                                          │
│ ● 💸 Solo control de gastos              │
│    Vemos en qué gastamos en común y      │
│    cuánto debe cada uno.                 │
│    Ideal: roommates, hogares grandes.    │
│                                          │
│ ○ 🎯 Gastos + metas                       │
│    Lo anterior + metas conjuntas         │
│    (viaje, casa, etc.).                  │
│    Ideal: amigos planeando objetivos.    │
│                                          │
│ ○ 📈 Análisis completo                    │
│    Gastos + ingresos + metas +           │
│    patrimonio combinado.                 │
│    ⚠️  Los miembros verán los ingresos    │
│    que cada uno aporte al hogar.         │
│    Ideal: parejas, familias unidas.      │
│                                          │
│ [← Atrás]              [Crear hogar]     │
└──────────────────────────────────────────┘
```

#### Dashboard del hogar adaptativo

`HouseholdPage.tsx` debe mostrar/ocultar secciones según `analysis_level`:

- **EXPENSES_ONLY:** solo gastos compartidos + liquidación.
- **EXPENSES_AND_GOALS:** lo anterior + sección de metas del hogar.
- **FULL:** todo + ingresos aportados + patrimonio combinado.

```typescript
function HouseholdDashboard({ household }: Props) {
  return (
    <>
      <HouseholdHeader name={household.name} />
      <HouseholdExpenses householdId={household.id} /> {/* SIEMPRE */}
      <HouseholdSettlement householdId={household.id} /> {/* SIEMPRE */}
      
      {household.analysis_level !== 'expenses_only' && (
        <HouseholdGoals householdId={household.id} />
      )}
      
      {household.analysis_level === 'full' && (
        <>
          <HouseholdIncomes householdId={household.id} />
          <HouseholdPatrimony householdId={household.id} />
        </>
      )}
    </>
  )
}
```

#### Indicador visual del tipo de hogar

En la vista del hogar, mostrar las configuraciones de forma sutil pero visible:

```
🏠 Familia García
4 miembros • Proporcional • Solo gastos
```

### Reglas inmutables específicas de F03

1. **split_method y analysis_level NO se editan después de crear el hogar.**
   *Razón:* cambiar el tipo de un hogar con datos existentes genera ambigüedad sobre cómo recalcular liquidaciones pasadas.
   *Alternativa:* si un hogar necesita cambiar de tipo, se crea uno nuevo y se invita a los miembros.

2. **Hogares existentes (pre-F03) migran a EQUAL + EXPENSES_ONLY** salvo que tengan información explícita de tipo proporcional, en cuyo caso van a PROPORTIONAL + EXPENSES_ONLY.

3. **El usuario debe consentir explícitamente al elegir FULL** porque expone ingresos a otros miembros.
   El warning del wizard ("⚠️ Los miembros verán los ingresos...") es OBLIGATORIO.

4. **Endpoints existentes de hogares siguen funcionando** con los nuevos campos como opcionales en requests (defaults razonables).

5. **El backend valida que solo se envíen valores de enum válidos.**
   Si llega un split_method inválido, retorna 422.

### Tests requeridos

```python
class TestCreateHousehold:
    def test_create_with_defaults(self):
        """Sin especificar tipo, default es EQUAL + EXPENSES_ONLY."""
    
    def test_create_with_proportional_split(self):
        """Crear con PROPORTIONAL."""
    
    def test_create_with_full_analysis(self):
        """Crear con analysis_level=FULL."""
    
    def test_create_invalid_split_method_422(self):
        """Enviar split_method='invalid' → 422."""

class TestUpdateHousehold:
    def test_update_name(self):
        """Se puede modificar el nombre."""
    
    def test_cannot_update_split_method(self):
        """split_method no se puede modificar después de crear."""
    
    def test_cannot_update_analysis_level(self):
        """analysis_level no se puede modificar después de crear."""

class TestHouseholdAnalytics:
    def test_expenses_only_excludes_incomes(self):
        """Con EXPENSES_ONLY, el endpoint no retorna campo 'incomes'."""
    
    def test_full_includes_all_sections(self):
        """Con FULL, el endpoint retorna gastos, ingresos, metas, patrimonio."""
    
    def test_proportional_split_calculation(self):
        """La liquidación PROPORTIONAL usa porcentajes de ingreso."""
    
    def test_equal_split_calculation(self):
        """La liquidación EQUAL divide en partes iguales."""
```

**Mínimo 10 tests nuevos.**

---

## ✅ Criterios de aceptación

### Funcional

- [ ] Se puede crear un hogar con split=EQUAL + analysis=EXPENSES_ONLY (default)
- [ ] Se puede crear un hogar con split=PROPORTIONAL
- [ ] Se puede crear un hogar con analysis_level=EXPENSES_AND_GOALS
- [ ] Se puede crear un hogar con analysis_level=FULL
- [ ] El wizard de creación tiene 3 pasos claros
- [ ] El paso 3 muestra warning explícito si se elige FULL
- [ ] El dashboard del hogar adapta lo que muestra según analysis_level
- [ ] La liquidación funciona correctamente con ambos split_methods
- [ ] El hogar muestra sus configuraciones (tipo y nivel) en el header
- [ ] No se puede modificar split_method ni analysis_level después de crear

### Técnico

- [ ] Migración Alembic generada y testeada
- [ ] Hogares existentes migrados correctamente (no se pierden datos)
- [ ] 123 tests existentes siguen pasando
- [ ] Al menos 10 tests nuevos cubriendo F03
- [ ] Schemas Pydantic validan los enums correctamente
- [ ] El frontend valida con Zod los valores antes de enviar

### UX

- [ ] El wizard es claro y guía bien al usuario
- [ ] Los warnings sobre privacidad (FULL) son visibles
- [ ] El dashboard se adapta sin "saltos" visuales
- [ ] No hay opciones "ocultas" que el usuario no entienda

---

## 🚀 Plan de implementación

### Sprint 1 (fin de semana 1) — Backend
- Modelos + enums
- Migración Alembic (con plan de migración de hogares existentes)
- Schemas Pydantic
- Service: crear hogar con nuevos campos
- Service: adaptar analytics según analysis_level
- Tests backend (10+ tests)
- Verificar tests existentes siguen pasando

### Sprint 2 (fin de semana 2) — Frontend
- Wizard de 3 pasos para crear hogar
- Adaptar `HouseholdPage.tsx` según analysis_level
- Indicador visual de tipo en header
- Testing manual end-to-end
- Ajustes UX

### Sprint 3 (medio fin de semana) — Pulido
- Revisar edge cases en migración
- Verificar permisos correctos
- Documentación interna actualizada
- Merge a main

---

## 🔗 Referencias

- **Charla original (planificación):** discusión del 18 de mayo 2026 sobre tipos de hogar
- **Servicios relacionados:** `household_service.py`, `household_analytics_service.py`
- **Componentes a modificar:** `household/CreateModal.tsx`, `HouseholdPage.tsx`
- **Principios relevantes:** P11 (entidades del sistema), P14 (presupuesto como alerta)

---

## 📝 Notas de implementación

- Esta feature **habilita** F04 (múltiples hogares por transacción). Sin F03, F04 no tendría tipos diferenciados.
- Esta feature también **habilita** F06 (sistema de revisión colaborativa). Las reviews son más relevantes en hogares con analysis_level=FULL.
- **Migración cuidadosa:** revisar si en el código actual hay referencias a `SplitType.PROPORTIONAL` o similares. Si existen, mapear correctamente.
- **Decisión deliberada:** NO permitir editar `split_method` y `analysis_level` después de creado. Si en el futuro hay demanda, se evalúa.
- **CUSTOM split:** queda para una versión futura. La estructura del enum se diseña para soportarlo sin migración rota.
