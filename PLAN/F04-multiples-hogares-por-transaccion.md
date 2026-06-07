# F04 — Múltiples Hogares por Transacción

> **Prioridad:** 🟡 Media-alta — habilita casos de uso reales mencionados por beta testers.
> **Estimación:** 2 fines de semana (8-12 horas)
> **Dependencias:** Recomendado tener F03 hecha (los hogares ya están bien tipados).

---

## 🎯 PRD — Product Requirements

### Problema que resuelve

Hoy una transacción solo puede pertenecer a **un único hogar** (campo `household_id` en `Transaction`). Pero la realidad de los usuarios muestra que a veces una transacción es compartida en **múltiples contextos**:

> *"el hijo gasta en el supermercado 500 pesos. ese numero va a las finanzas personales, pero tambien va al hogar 'Finanzas hijo y novia' [...] pero puede o no que si además si lo consumieron todos en casa tambien va al analisis de 'finanzas del hogar'"*

### Casos de uso reales

**Caso 1: Compra que beneficia a múltiples grupos**
Hijo compra papel higiénico por $300. Lo consumen él, su novia (pareja) y también su mamá y papá. Conceptualmente, ese gasto pertenece a:
- "Finanzas hijo y novia"
- "Finanzas del hogar" (familia completa)

Hoy: hay que elegir uno. **No refleja la realidad.**

**Caso 2: Comida del asado familiar**
Papá compra carne para un asado de los 4 + 2 amigos invitados. Si hay un hogar "Familia García" y otro "Amigos del asado":
- La compra pertenece a ambos hogares.
- La liquidación debe considerar ambos.

**Caso 3: Pago de cuenta común con grupo de amigos**
Un grupo de 5 amigos viaja a la playa. Uno paga el alquiler. Si además ese amigo está en un hogar "Pareja" con su novia, **NO** debe aparecer en el hogar pareja porque fue gasto del viaje.

→ Confirma que la **opción por defecto** debe ser "ningún hogar" o "el hogar que el usuario elija", no "todos los hogares".

### Hipótesis del producto

Si una transacción puede pertenecer a varios hogares (cuando el usuario lo decide), el sistema:
- Refleja mejor la realidad de gastos compartidos en múltiples contextos
- Evita duplicación manual ("cargo lo mismo en 2 hogares")
- Permite análisis más precisos por hogar

### Métricas de éxito

- ✅ Una transacción puede asociarse a 0, 1 o N hogares.
- ✅ La liquidación de cada hogar considera correctamente las transacciones que le corresponden.
- ✅ Por defecto, una transacción nueva NO tiene hogares (se elige explícitamente).
- ✅ La UI permite agregar/quitar hogares de una transacción existente.

### Out of scope (explícito)

❌ NO se implementa "división de monto entre hogares" (cada hogar recibe el monto completo).
❌ NO se implementa "participantes específicos dentro del hogar" (esto es una feature aparte, ver `BACKLOG.md`).
❌ NO se permite asociar transacciones a hogares donde el usuario no es miembro.

---

## 🛠 TRD — Technical Requirements

### Cambios en modelo

#### Tabla intermedia nueva

```python
class TransactionHousehold(Base):
    __tablename__ = "transaction_households"
    
    transaction_id: Mapped[int] = mapped_column(
        ForeignKey("transactions.id", ondelete="CASCADE"),
        primary_key=True
    )
    household_id: Mapped[int] = mapped_column(
        ForeignKey("households.id", ondelete="CASCADE"),
        primary_key=True
    )
    added_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc)
    )
    
    transaction: Mapped["Transaction"] = relationship(back_populates="household_links")
    household: Mapped["Household"] = relationship(back_populates="transaction_links")
```

#### Modificar `Transaction`

```python
class Transaction(Base):
    # ... campos existentes ...
    
    # DEPRECAR (pero mantener por compatibilidad migracional):
    # household_id: Mapped[int | None]  ← ya no se usa directamente
    
    # NUEVA relación many-to-many:
    household_links: Mapped[list[TransactionHousehold]] = relationship(
        back_populates="transaction",
        cascade="all, delete-orphan"
    )
    
    @property
    def households(self) -> list[Household]:
        """Lista de hogares a los que pertenece esta transacción."""
        return [link.household for link in self.household_links]
```

#### Modificar `Household`

```python
class Household(Base):
    # ... campos existentes ...
    
    transaction_links: Mapped[list[TransactionHousehold]] = relationship(
        back_populates="household",
        cascade="all, delete-orphan"
    )
    
    @property
    def transactions(self) -> list[Transaction]:
        """Transacciones asociadas a este hogar."""
        return [link.transaction for link in self.transaction_links]
```

### Migración Alembic

**Crítica:** los datos existentes deben migrarse correctamente.

```python
"""Add transaction_households junction table

Revision ID: xxxx
"""

def upgrade():
    # 1. Crear tabla intermedia
    op.create_table(
        'transaction_households',
        sa.Column('transaction_id', sa.Integer, ForeignKey('transactions.id', ondelete='CASCADE'), primary_key=True),
        sa.Column('household_id', sa.Integer, ForeignKey('households.id', ondelete='CASCADE'), primary_key=True),
        sa.Column('added_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    
    # 2. Migrar datos: cada transaction con household_id != NULL se convierte en una fila
    op.execute("""
        INSERT INTO transaction_households (transaction_id, household_id, added_at)
        SELECT id, household_id, COALESCE(created_at, NOW())
        FROM transactions
        WHERE household_id IS NOT NULL
    """)
    
    # 3. NO eliminar Transaction.household_id todavía (deprecación gradual)
    #    Eliminar en una migración posterior cuando todo el código use la nueva relación.


def downgrade():
    # Revertir: borrar tabla intermedia
    # (los datos quedan en transactions.household_id, no se perdieron)
    op.drop_table('transaction_households')
```

**Decisión deliberada:** mantener `Transaction.household_id` como campo legacy durante la transición. Una vez que **todo el código use `households` (lista)**, se hace una migración posterior que elimina ese campo.

### Cambios en backend

#### Schemas Pydantic

```python
class TransactionCreate(BaseModel):
    # ... campos existentes ...
    
    # Reemplaza household_id (singular) por household_ids (lista)
    household_ids: list[int] = Field(default_factory=list)
    
    # Backward compat: aceptar household_id pero deprecarlo
    # household_id: int | None = None

class TransactionUpdate(BaseModel):
    # ... campos existentes ...
    household_ids: list[int] | None = None  # None = no cambiar
```

#### Service

```python
def create(db: Session, user: User, data: TransactionCreate) -> Transaction:
    # Validaciones existentes...
    
    # Validar que TODOS los household_ids sean hogares donde el user es miembro activo
    for hh_id in data.household_ids:
        if not _is_active_member(db, hh_id, user.id):
            raise NotHouseholdMember(hh_id)
    
    tx = transaction_crud.create(db, data, user.id)
    
    # Crear asociaciones
    for hh_id in data.household_ids:
        link = TransactionHousehold(transaction_id=tx.id, household_id=hh_id)
        db.add(link)
    
    db.commit()
    db.refresh(tx)
    return tx


def update_household_links(
    db: Session,
    tx_id: int,
    user: User,
    household_ids: list[int]
) -> Transaction:
    """Actualiza la lista de hogares asociados a una transacción.
    
    Reemplaza completamente la lista actual con la nueva.
    """
    tx = transaction_crud.get_by_id(db, tx_id, user.id)
    if not tx:
        raise TransactionNotFound(tx_id)
    
    # Validar membresías
    for hh_id in household_ids:
        if not _is_active_member(db, hh_id, user.id):
            raise NotHouseholdMember(hh_id)
    
    # Borrar asociaciones actuales
    db.query(TransactionHousehold).filter(
        TransactionHousehold.transaction_id == tx_id
    ).delete()
    
    # Crear nuevas
    for hh_id in household_ids:
        link = TransactionHousehold(transaction_id=tx_id, household_id=hh_id)
        db.add(link)
    
    db.commit()
    db.refresh(tx)
    return tx
```

#### Endpoints

```python
# Endpoint principal de update se mantiene
PUT /api/v1/transactions/{id}
Body: TransactionUpdate (incluye household_ids opcional)

# Endpoint específico para gestionar asociaciones (opcional, conveniencia)
PUT /api/v1/transactions/{id}/households
Body: { "household_ids": [1, 3, 5] }

# Borrado granular (F02) extendido
DELETE /api/v1/transactions/{id}/households/{household_id}
→ Quita solo de ese hogar específico
```

#### Servicio `household_analytics_service.py`

**Modificar queries para usar la nueva relación:**

```python
def _calculate_expenses(db, household_id, month):
    # ANTES:
    # query = db.query(Transaction).filter(Transaction.household_id == household_id)
    
    # AHORA:
    query = db.query(Transaction).join(
        TransactionHousehold,
        TransactionHousehold.transaction_id == Transaction.id
    ).filter(
        TransactionHousehold.household_id == household_id,
        Transaction.is_deleted == False,
        # ... filtros de mes
    )
    # ...
```

### Cambios en frontend

#### Modal de transacción

`TransactionModal.tsx` debe permitir seleccionar **múltiples hogares**:

```
┌────────────────────────────────────────────────────┐
│ Nueva transacción                                  │
├────────────────────────────────────────────────────┤
│ Monto: $500                                        │
│ Descripción: Supermercado                          │
│ Cuenta: Efectivo ▼                                 │
│ Categoría: Alimentación ▼                          │
│                                                    │
│ ¿Es compartida con algún hogar? (opcional)         │
│                                                    │
│ ☑ Familia García                                   │
│ ☐ Pareja                                           │
│ ☑ Roommates Apto 5                                 │
│                                                    │
│ ℹ️  Esta transacción aparecerá en los análisis     │
│    de los hogares marcados.                        │
│                                                    │
│ [Cancelar]              [Guardar]                  │
└────────────────────────────────────────────────────┘
```

Si el usuario NO pertenece a ningún hogar, la sección no se muestra.

#### Vista de transacción

Cuando se ve una transacción, mostrar los hogares a los que pertenece:

```
🍞 Supermercado                $500
   24/05/2026 — Efectivo
   🏠 Familia García · Roommates Apto 5
```

#### Borrado granular (relacionado con F02)

Después de F04, el modal de borrado del F02 se enriquece:

```
┌────────────────────────────────────────────────────┐
│ ⚠️  Eliminar transacción                            │
├────────────────────────────────────────────────────┤
│ "Supermercado" — $500                              │
│                                                    │
│ Está en estos hogares:                             │
│   🏠 Familia García                                │
│   🏠 Roommates Apto 5                              │
│                                                    │
│ ¿Cómo eliminarla?                                  │
│                                                    │
│ ● Solo de algunos hogares (no de personal):        │
│   ☑ Familia García                                 │
│   ☐ Roommates Apto 5                               │
│                                                    │
│ ○ Eliminar completamente                           │
│   (de personal y de TODOS los hogares)             │
│                                                    │
│ [Cancelar]              [Confirmar]                │
└────────────────────────────────────────────────────┘
```

### Reglas inmutables específicas de F04

1. **Validación de membresía OBLIGATORIA.**
   Una transacción NO puede asociarse a un hogar donde el creador no es miembro activo.

2. **El monto se cuenta una sola vez en cada hogar.**
   Si una transacción está en 2 hogares, cada hogar la cuenta como $X (no se divide).
   Esto es importante para la liquidación: cada hogar liquida independientemente.

3. **La transacción siempre pertenece al usuario (personal).**
   Asociar a hogares no la "saca" del personal.

4. **La eliminación del usuario del hogar NO borra las transacciones del hogar.**
   Se mantiene el histórico. Las transacciones siguen asociadas al hogar aunque el usuario ya no esté.

5. **Backward compatibility durante migración.**
   El campo `Transaction.household_id` se mantiene hasta que todo el código use la nueva relación.

### Tests requeridos

```python
class TestTransactionMultipleHouseholds:
    
    def test_create_with_no_households(self):
        """Crear transacción sin asociar a hogares (caso default)."""
    
    def test_create_with_one_household(self):
        """Crear transacción asociada a 1 hogar."""
    
    def test_create_with_multiple_households(self):
        """Crear transacción asociada a 2+ hogares."""
    
    def test_cannot_associate_to_non_member_household_403(self):
        """No se puede asociar a un hogar donde no soy miembro."""
    
    def test_cannot_associate_to_inactive_membership(self):
        """No se puede asociar si la membresía está PENDING."""
    
    def test_update_household_associations(self):
        """Actualizar la lista de hogares de una transacción existente."""
    
    def test_remove_from_one_household_keeps_others(self):
        """DELETE /transactions/{id}/households/{hh} solo saca de ese hogar."""
    
    def test_delete_transaction_cascades_to_associations(self):
        """Borrar transacción cascadea y elimina asociaciones."""
    
    def test_analytics_counts_transaction_in_each_household(self):
        """Si tx está en 2 hogares, ambos la cuentan en sus analytics."""
    
    def test_legacy_household_id_still_works(self):
        """Transacciones viejas con household_id (singular) siguen funcionando."""
```

**Mínimo 10 tests nuevos.**

---

## ✅ Criterios de aceptación

### Funcional

- [ ] Se puede crear una transacción sin asociar a ningún hogar
- [ ] Se puede crear una transacción asociada a 1 hogar
- [ ] Se puede crear una transacción asociada a múltiples hogares
- [ ] Se puede modificar la lista de hogares de una transacción existente
- [ ] Se puede quitar una transacción de un hogar específico (sin afectar otros)
- [ ] El borrado completo (cascada) elimina todas las asociaciones
- [ ] Las analytics de cada hogar muestran las transacciones que le corresponden
- [ ] Las transacciones de hogares pre-F04 siguen funcionando correctamente

### Técnico

- [ ] Migración Alembic ejecutada sin perder datos
- [ ] Datos existentes migrados correctamente a la tabla intermedia
- [ ] 123 tests existentes siguen pasando
- [ ] Al menos 10 tests nuevos cubriendo F04
- [ ] Validación de membresía estricta en backend
- [ ] Compatibilidad con `household_id` (singular) durante transición

### UX

- [ ] El modal de transacción muestra los hogares disponibles
- [ ] Si el usuario no tiene hogares, no se muestra la sección (no confunde)
- [ ] La vista de transacción muestra los hogares asociados
- [ ] El borrado granular permite quitar de hogares específicos

---

## 🚀 Plan de implementación

### Sprint 1 (fin de semana 1) — Backend
- Crear modelo `TransactionHousehold`
- Migración Alembic con migración de datos
- Actualizar `Transaction` y `Household` con relaciones
- Adaptar service de transacciones (create, update)
- Adaptar service de analytics (queries con join)
- Endpoint para gestionar asociaciones
- Tests backend (10+ tests)

### Sprint 2 (fin de semana 2) — Frontend + Pulido
- Actualizar `TransactionModal.tsx` con selector múltiple
- Actualizar vista de transacciones (mostrar hogares)
- Integrar con borrado granular (F02 + F04)
- Testing manual end-to-end
- Documentar deprecación de `household_id` (singular)

---

## 🔗 Referencias

- **Feature relacionada:** F02 (borrado granular)
- **Feature relacionada:** F03 (tipos de hogar)
- **Modelo a modificar:** `Transaction`, `Household`
- **Migración predecesora:** `6d7e49ad28c9_add_households_feature.py`

---

## 📝 Notas de implementación

- **Estrategia de migración:** se mantiene `Transaction.household_id` por compatibilidad. Una migración futura (cuando todo el código nuevo use la relación) lo elimina.
- **Performance:** las queries con JOIN pueden ser más lentas. Si se vuelven un cuello de botella, considerar índices en `transaction_households(household_id)`.
- **Backwards compatibility:** el endpoint de crear transacción debe aceptar tanto `household_id` (singular legacy) como `household_ids` (lista nueva). Si llegan ambos, priorizar la lista.
- **Decisión deliberada:** el monto se cuenta una vez en cada hogar (NO se divide). Esto es lo que la mayoría de los usuarios espera. Si en el futuro alguien pide división de monto, se evalúa como feature aparte.
