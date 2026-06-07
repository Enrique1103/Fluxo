# F06 — Sistema de Revisión Colaborativa

> **Prioridad:** 🟢 Media — diferenciador competitivo único.
> **Estimación:** 1-2 fines de semana (8-12 horas)
> **Dependencias:** Recomendado F03 (tipos de hogar) y F04 (múltiples hogares por transacción).

---

## 🎯 PRD — Product Requirements

### Problema que resuelve

Cuando varias personas comparten gastos, **siempre hay tensión por gastos que algunos consideran innecesarios**. Es una causa frecuente de conflictos financieros en parejas y familias.

Hoy lo que pasa en la vida real:

1. María ve un gasto de $3.000 en bar nocturno
2. María se enoja, lo guarda
3. Al fin de mes, conversación tensa: *"¿$3.000 en alcohol? ¿Estás loco?"*
4. Discusión, mal clima

Con esta feature, María puede **marcar el gasto para revisar** con un comentario opcional. El autor recibe la marca y puede responder. La conversación se da **en frío, con tiempo de pensar**, sin confrontación inmediata.

### Casos de uso reales

**Caso 1: Pareja revisando gastos**
Ana ve que Carlos cargó $5.000 en una salida nocturna. Ana marca el gasto con "¿Era necesario? Charlemos." Carlos recibe la marca y responde: "Era cumpleaños sorpresa de un amigo, no se repite." Ana lee, lo marca como resuelto. Sin pelea.

**Caso 2: Menor de edad en el hogar**
Hijo de 13 años carga un gasto de $400 en "gomitas y golosinas". La mamá marca para revisar: "Te recuerdo que tu plata semanal es para que aprendas a administrarla." El hijo lo ve, no responde inmediatamente, pero queda registrado.

**Caso 3: Detección de fraude/error**
Roommate ve un gasto que NO reconoce en el hogar. Marca con tipo "Sospechoso": "¿Quién cargó esto? No me suena." El autor responde aclarando. Si no hay respuesta, hay evidencia de la duda.

**Caso 4: Categorización incorrecta**
Hijo carga un gasto del supermercado en "Entretenimiento". Mamá marca tipo "Categoría incorrecta". Hijo lo corrige sin que sea una corrección autoritaria.

### Hipótesis del producto

Con el sistema de revisión:
- **Reduce conflictos** en hogares (especialmente parejas)
- **Crea histórico** para detectar patrones ("siempre marca mis gastos en bar")
- **Profesionaliza** la conversación financiera del hogar
- **Es opt-in**: si nadie lo usa, no molesta
- **Diferenciador competitivo único** — ninguna app tiene esto

### Métricas de éxito

- ✅ Los beta testers usan la feature al menos 1 vez por semana
- ✅ La mayoría de las marcas reciben respuesta del autor
- ✅ El feedback de usuarios es positivo (no se sienten "espiados")
- ✅ Reducción reportada de discusiones financieras en hogares

### Out of scope (explícito)

❌ NO se implementan reglas automáticas (auto-flag por monto, etc.) en esta versión
❌ NO se implementan estadísticas avanzadas (top gastos marcados, etc.)
❌ NO se notifican marcas a TODOS los miembros del hogar (solo al autor)
❌ NO se permite a usuarios no-miembros del hogar marcar

---

## 🛠 TRD — Technical Requirements

### Modelo de datos

#### Nueva tabla `transaction_reviews`

```python
class TransactionReview(Base):
    __tablename__ = "transaction_reviews"
    
    id: Mapped[int] = mapped_column(primary_key=True)
    
    # Referencia a la transacción y al hogar (contexto)
    transaction_id: Mapped[int] = mapped_column(
        ForeignKey("transactions.id", ondelete="CASCADE"),
        index=True,
        nullable=False
    )
    household_id: Mapped[int] = mapped_column(
        ForeignKey("households.id", ondelete="CASCADE"),
        index=True,
        nullable=False
    )
    
    # Quién marcó
    flagged_by_user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id"),
        nullable=False
    )
    
    # Tipo y comentario opcional
    flag_type: Mapped[ReviewType] = mapped_column(
        Enum(ReviewType, name="review_type_enum"),
        nullable=False
    )
    comment: Mapped[str | None] = mapped_column(String(500), nullable=True)
    
    # Estado y timestamps
    status: Mapped[ReviewStatus] = mapped_column(
        Enum(ReviewStatus, name="review_status_enum"),
        nullable=False,
        default=ReviewStatus.PENDING
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False
    )
    
    # Respuesta del autor de la transacción
    response_comment: Mapped[str | None] = mapped_column(String(500), nullable=True)
    response_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True
    )
    
    # Relaciones
    transaction: Mapped["Transaction"] = relationship()
    household: Mapped["Household"] = relationship()
    flagged_by_user: Mapped["User"] = relationship()
```

#### Enums

```python
class ReviewType(str, PyEnum):
    UNNECESSARY = "innecesario"          # "¿Era necesario este gasto?"
    HIGH_AMOUNT = "monto_alto"           # "Me parece muy caro"
    WRONG_CATEGORY = "categoria_incorrecta"  # "Categoría incorrecta"
    NOT_HOUSEHOLD = "no_es_del_hogar"    # "No debería ser del hogar"
    SUSPICIOUS = "sospechoso"            # "No reconozco este gasto"
    QUESTION = "pregunta"                # "Tengo una pregunta"
    OTHER = "otra"                       # Razón libre


class ReviewStatus(str, PyEnum):
    PENDING = "pendiente"                # El autor todavía no respondió
    ACKNOWLEDGED = "respondida"          # El autor respondió
    DISMISSED = "descartada"             # Quien marcó retiró la marca
    RESOLVED = "resuelta"                # Ambos consideran cerrado el tema
```

### Migración Alembic

```python
"""Add transaction_reviews table

Revision ID: xxxx
"""

def upgrade():
    # Crear enums
    op.execute("""
        CREATE TYPE review_type_enum AS ENUM (
            'innecesario', 'monto_alto', 'categoria_incorrecta',
            'no_es_del_hogar', 'sospechoso', 'pregunta', 'otra'
        )
    """)
    op.execute("""
        CREATE TYPE review_status_enum AS ENUM (
            'pendiente', 'respondida', 'descartada', 'resuelta'
        )
    """)
    
    # Crear tabla
    op.create_table(
        'transaction_reviews',
        sa.Column('id', sa.Integer, primary_key=True),
        sa.Column('transaction_id', sa.Integer, ForeignKey('transactions.id', ondelete='CASCADE'), nullable=False),
        sa.Column('household_id', sa.Integer, ForeignKey('households.id', ondelete='CASCADE'), nullable=False),
        sa.Column('flagged_by_user_id', sa.Integer, ForeignKey('users.id'), nullable=False),
        sa.Column('flag_type', sa.Enum(name='review_type_enum'), nullable=False),
        sa.Column('comment', sa.String(500), nullable=True),
        sa.Column('status', sa.Enum(name='review_status_enum'), nullable=False, server_default='pendiente'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('response_comment', sa.String(500), nullable=True),
        sa.Column('response_at', sa.DateTime(timezone=True), nullable=True),
    )
    
    # Índices
    op.create_index('ix_reviews_transaction', 'transaction_reviews', ['transaction_id'])
    op.create_index('ix_reviews_household', 'transaction_reviews', ['household_id'])
    op.create_index('ix_reviews_status', 'transaction_reviews', ['status'])


def downgrade():
    op.drop_index('ix_reviews_status')
    op.drop_index('ix_reviews_household')
    op.drop_index('ix_reviews_transaction')
    op.drop_table('transaction_reviews')
    op.execute("DROP TYPE review_status_enum")
    op.execute("DROP TYPE review_type_enum")
```

### Endpoints API

#### Crear marca

```
POST /api/v1/transactions/{tx_id}/reviews
```

Body:
```json
{
  "household_id": 1,
  "flag_type": "monto_alto",
  "comment": "Me parece mucho para un jueves común"
}
```

Validaciones:
- `current_user` debe ser miembro activo del hogar `household_id`
- `current_user` NO puede marcar su propia transacción
- La transacción debe estar asociada al hogar especificado

#### Listar marcas de una transacción

```
GET /api/v1/transactions/{tx_id}/reviews
```

Visibilidad:
- Quien marcó (`flagged_by_user_id`) puede ver sus marcas
- El autor de la transacción puede ver las marcas dirigidas a él
- Otros miembros del hogar NO ven las marcas (privacidad entre quien marca y el autor)

#### Listar mis marcas pendientes (como autor)

```
GET /api/v1/me/reviews/incoming
```

Retorna las marcas a transacciones del usuario que están con `status=PENDING`.

#### Listar mis marcas enviadas (como reviewer)

```
GET /api/v1/me/reviews/outgoing
```

Retorna las marcas que el usuario hizo a transacciones de otros.

#### Responder a una marca

```
PUT /api/v1/reviews/{review_id}/respond
```

Body:
```json
{
  "response_comment": "Era un cumpleaños sorpresa, no se repite"
}
```

Solo el autor de la transacción puede responder. Cambia status a `ACKNOWLEDGED`.

#### Marcar como resuelta

```
PUT /api/v1/reviews/{review_id}/resolve
```

Solo quien hizo la marca puede marcar como `RESOLVED`.

#### Descartar marca

```
DELETE /api/v1/reviews/{review_id}
```

Solo quien hizo la marca puede descartarla. Status pasa a `DISMISSED` (soft delete).

### Servicio `transaction_review_service.py`

```python
def create(
    db: Session,
    user: User,
    tx_id: int,
    data: ReviewCreate
) -> TransactionReview:
    """Crea una marca de revisión sobre una transacción."""
    
    # 1. Validar que la transacción existe
    tx = transaction_crud.get_by_id_any_user(db, tx_id)  # query sin filtro user_id
    if not tx:
        raise TransactionNotFound(tx_id)
    
    # 2. El usuario NO puede marcar su propia transacción
    if tx.user_id == user.id:
        raise CannotReviewOwnTransaction()
    
    # 3. Validar que el usuario es miembro activo del hogar
    if not _is_active_member(db, data.household_id, user.id):
        raise NotHouseholdMember(data.household_id)
    
    # 4. Validar que la transacción está asociada a ese hogar
    if not _transaction_belongs_to_household(db, tx_id, data.household_id):
        raise TransactionNotInHousehold(tx_id, data.household_id)
    
    # 5. Crear la marca
    review = transaction_review_crud.create(db, data, user.id)
    db.commit()
    
    # 6. Notificar al autor de la transacción (SSE)
    event_bus.publish(
        f"user_{tx.user_id}",
        {"type": "review_received", "review_id": review.id}
    )
    
    return review


def respond(
    db: Session,
    user: User,
    review_id: int,
    response_comment: str
) -> TransactionReview:
    """El autor de la transacción responde a una marca."""
    review = transaction_review_crud.get_by_id(db, review_id)
    if not review:
        raise ReviewNotFound(review_id)
    
    # Solo el autor de la transacción puede responder
    tx = transaction_crud.get_by_id_any_user(db, review.transaction_id)
    if tx.user_id != user.id:
        raise UnauthorizedReviewAction()
    
    review.response_comment = response_comment
    review.response_at = datetime.now(timezone.utc)
    review.status = ReviewStatus.ACKNOWLEDGED
    
    db.commit()
    
    # Notificar a quien marcó
    event_bus.publish(
        f"user_{review.flagged_by_user_id}",
        {"type": "review_responded", "review_id": review.id}
    )
    
    return review
```

### Frontend

#### Componente `ReviewButton`

Botón visible en cada transacción del hogar (no en personal puro):

```tsx
function ReviewButton({ transaction, householdId }: Props) {
  const currentUser = useCurrentUser()
  
  // No mostrar si la transacción es del usuario actual
  if (transaction.userId === currentUser.id) return null
  
  return (
    <button onClick={() => openReviewModal(transaction)}>
      🚩 Marcar para revisar
    </button>
  )
}
```

#### Componente `ReviewModal`

Modal para crear marca:

```
┌────────────────────────────────────────────────────┐
│ 🚩 Marcar transacción para revisar                 │
├────────────────────────────────────────────────────┤
│ Gasto: $3.000 - Bar Tropical                       │
│ Cargado por: Carlos · 24/05/2026                   │
│ Hogar: Pareja                                      │
│                                                    │
│ ¿Por qué querés marcarla?                          │
│   ○ Me parece innecesaria                          │
│   ● Me parece muy cara                             │
│   ○ Categoría incorrecta                           │
│   ○ No debería ser del hogar                       │
│   ○ No reconozco este gasto                        │
│   ○ Tengo una pregunta sobre esto                  │
│   ○ Otra razón                                     │
│                                                    │
│ Comentario opcional (máx 500 caracteres):          │
│ ┌────────────────────────────────────────────────┐ │
│ │ Charlemos cuando puedas, me parece mucho para  │ │
│ │ un jueves. ¿Podemos ahorrar más?               │ │
│ └────────────────────────────────────────────────┘ │
│                                                    │
│ ℹ️ Solo el autor del gasto y vos verán esta marca. │
│                                                    │
│ [Cancelar]                  [Marcar]               │
└────────────────────────────────────────────────────┘
```

#### Sección "Mis revisiones" en el dashboard

Una sección en el dashboard personal del usuario:

```
🚩 Revisiones (3)

Recibidas (pendientes de tu respuesta) — 1
┌────────────────────────────────────────────────────┐
│ Ana marcó tu gasto de "Bar Tropical" ($3.000)      │
│ Tipo: Monto alto                                   │
│ Comentario: "Charlemos cuando puedas..."           │
│ [Responder]                                        │
└────────────────────────────────────────────────────┘

Enviadas (esperando respuesta) — 2
┌────────────────────────────────────────────────────┐
│ Marcaste el gasto de Carlos: "Salida nocturna"     │
│ Hace 2 días, sin respuesta aún                     │
│ [Descartar]                                        │
└────────────────────────────────────────────────────┘
```

### Reglas inmutables específicas de F06

1. **Privacidad total entre quien marca y el autor.**
   Las marcas NO son visibles para otros miembros del hogar, ni siquiera admins.

2. **No se puede marcar la propia transacción.**
   Sería absurdo y se podría usar para spam.

3. **Solo miembros activos del hogar pueden marcar.**
   Miembros PENDING o ex-miembros no pueden marcar.

4. **La transacción debe estar asociada al hogar.**
   No se puede marcar una transacción "personal" como si fuera del hogar.

5. **El historial de marcas se mantiene aunque el usuario salga del hogar.**
   Es información valiosa, no se elimina.

6. **Las notificaciones son privadas, vía SSE existente.**
   Solo el autor de la transacción recibe notificación. NO se manda email a todo el hogar.

### Tests requeridos

```python
class TestCreateReview:
    def test_create_review_ok(self): ...
    def test_cannot_review_own_transaction(self): ...
    def test_cannot_review_without_household_membership(self): ...
    def test_cannot_review_transaction_not_in_household(self): ...
    def test_comment_max_length_500(self): ...

class TestGetReviews:
    def test_author_can_see_reviews_on_their_tx(self): ...
    def test_reviewer_can_see_their_own_reviews(self): ...
    def test_third_party_cannot_see_reviews(self): ...
    def test_admin_of_household_cannot_see_others_reviews(self): ...

class TestRespondReview:
    def test_author_can_respond(self): ...
    def test_only_author_can_respond(self): ...
    def test_response_changes_status_to_acknowledged(self): ...

class TestResolveReview:
    def test_reviewer_can_mark_resolved(self): ...
    def test_only_reviewer_can_resolve(self): ...

class TestDismissReview:
    def test_reviewer_can_dismiss(self): ...
    def test_only_reviewer_can_dismiss(self): ...
```

**Mínimo 15 tests nuevos.**

---

## ✅ Criterios de aceptación

### Funcional

- [ ] Un miembro del hogar puede marcar la transacción de otro miembro
- [ ] Las marcas son privadas (solo quien marca y el autor las ven)
- [ ] El autor recibe notificación SSE cuando le marcan una transacción
- [ ] El autor puede responder a la marca
- [ ] Quien marcó puede marcar como resuelta o descartar
- [ ] No se puede marcar la propia transacción
- [ ] No se puede marcar si no soy miembro activo del hogar
- [ ] No se puede marcar una transacción que no está en el hogar
- [ ] La sección "Revisiones" del dashboard muestra marcas recibidas y enviadas

### Técnico

- [ ] Migración Alembic aplicada correctamente
- [ ] 123+ tests existentes siguen pasando
- [ ] Al menos 15 tests nuevos cubriendo F06
- [ ] Eventos SSE funcionan correctamente
- [ ] Privacidad enforced a nivel backend (no se filtra info por API)

### UX

- [ ] El modal de marca es claro y no amenazante
- [ ] Los nombres de los tipos son comprensibles
- [ ] Las notificaciones de marca son sutiles, no agresivas
- [ ] La sección de revisiones es fácil de encontrar pero no invasiva

---

## 🚀 Plan de implementación

### Sprint 1 (fin de semana 1) — Backend
- Modelo `TransactionReview` + enums
- Migración Alembic
- CRUD
- Service con validaciones
- Endpoints (crear, listar, responder, resolver, descartar)
- Excepciones nuevas
- Tests (15+)

### Sprint 2 (fin de semana 2) — Frontend
- API client
- Componente `ReviewButton` en transacciones de hogar
- Componente `ReviewModal`
- Sección de revisiones en dashboard
- Integración con SSE para notificaciones
- Testing manual end-to-end

---

## 🔗 Referencias

- **Sistema SSE existente:** `event_bus.py`, `useHouseholdEvents.ts`
- **Charla original (idea):** discusión del 18 de mayo 2026
- **Principios relevantes:** P1 (aislamiento de datos), P19 (mensajes en español)

---

## 📝 Notas de implementación

- **Esta feature requiere F04** porque depende de transacciones asociadas a hogares. Sin F04, una transacción solo puede estar en un hogar (campo singular).
- **Esta feature se beneficia de F03** porque tiene más sentido en hogares con `analysis_level=FULL` o `EXPENSES_ONLY`, donde hay más interacción financiera.
- **Auto-flagging (regla automática)** quedó out of scope. En el futuro se puede agregar reglas tipo "auto-marcar gastos del miembro X superiores a $Y". Por ahora, marcas son 100% manuales.
- **Notificaciones por email:** quedó out of scope. Solo SSE en-app. Email es del BACKLOG.
- **Diferenciador competitivo:** ninguna app de finanzas que conozco tiene esto bien implementado. Es un activo único.
