# P06 — Prompt para Claude Code: Sistema de Revisión Colaborativa

> **Sesión NUEVA. Rama `feature/F06-review-colaborativa`.**
> Esta feature requiere F04 (múltiples hogares por transacción) implementada.

---

## CONTEXTO DEL PROYECTO

Fluxo: finanzas personales uruguaya. FastAPI + PostgreSQL + React 19. 183+ tests (post F05).

**ANTES de codear:**

1. Leé:
   - `docs/plan/01-PRINCIPIOS-INMUTABLES.md`
   - `docs/plan/02-ARQUITECTURA-Y-PATRONES.md`
   - `docs/plan/03-CONVENCIONES-DE-CODIGO.md`
   - `docs/plan/features/F06-sistema-revision-colaborativa.md`

2. Resumime 3 puntos por archivo.

3. Esperá mi confirmación.

---

## FEATURE A IMPLEMENTAR

**F06 — Sistema de Revisión Colaborativa**

Mecanismo de "🚩 Marcar para revisar" en transacciones de hogares. Las marcas son privadas entre quien marcó y el autor de la transacción. Reduce conflictos cara a cara.

---

## REGLAS INMUTABLES PARA ESTA FEATURE

1. **Privacidad TOTAL.**
   Las marcas son visibles SOLO para:
   - Quien marcó (`flagged_by_user_id`)
   - El autor de la transacción (`transaction.user_id`)
   
   **NI los admins del hogar, NI otros miembros del hogar, NI nadie más** las ven.

2. **No se puede marcar la propia transacción.**
   `flagged_by_user_id != transaction.user_id` (validación obligatoria).

3. **Solo miembros activos del hogar pueden marcar.**
   Status `ACTIVE`, no `PENDING` ni ex-miembros.

4. **La transacción debe estar asociada al hogar.**
   Si la transacción no está en el hogar especificado en la marca, error.

5. **Histórico de marcas se mantiene aunque el usuario salga del hogar.**
   No se eliminan al sacar al usuario del hogar.

6. **Notificaciones via SSE existente** (`event_bus.py`), NO email.

7. **Comentarios máximo 500 caracteres.**

8. **NO modificar tests existentes.**

---

## ARCHIVOS QUE PODÉS TOCAR

### Backend - Crear

```
backend/app/models/transaction_review.py
backend/app/schemas/transaction_review.py
backend/app/crud/transaction_review_crud.py
backend/app/services/transaction_review_service.py
backend/app/exceptions/transaction_review_exceptions.py
backend/app/api/v1/transaction_reviews.py
backend/tests/test_transaction_reviews.py
backend/alembic/versions/XXXX_add_transaction_reviews.py
```

### Backend - Modificar

```
backend/app/main.py
  → registrar router + handlers de excepciones
```

### Frontend - Crear

```
frontend/src/api/transactionReviews.ts
frontend/src/types/transactionReview.ts
frontend/src/components/review/ReviewButton.tsx
frontend/src/components/review/ReviewModal.tsx
frontend/src/components/review/ReviewsSection.tsx (sección en dashboard)
frontend/src/components/review/ReviewItem.tsx
frontend/src/hooks/useReviewEvents.ts (SSE para notificaciones)
```

### Frontend - Modificar

```
frontend/src/pages/HouseholdPage.tsx (o donde se listan transacciones del hogar)
  → integrar ReviewButton

frontend/src/pages/DashboardPage.tsx
  → agregar ReviewsSection en el dashboard personal
```

### NO TOCAR

```
Tests existentes
Modelos no relacionados (Transaction, Household, User)
  ← excepto agregar relationship inverso si hace falta
event_bus.py (usar tal cual)
```

---

## CRITERIOS DE COMPLETITUD

### Backend

- [ ] Modelo `TransactionReview` con todos los campos del PRD
- [ ] Enums `ReviewType` y `ReviewStatus`
- [ ] Migración Alembic aplicable
- [ ] Schemas Pydantic (`ReviewCreate`, `ReviewRead`, `ReviewRespond`)
- [ ] CRUD básico
- [ ] Service con validaciones:
  - `create` valida no-self-review, membresía, tx-en-hogar
  - `respond` valida que current_user es autor de la tx
  - `resolve` valida que current_user es quien marcó
  - `dismiss` valida que current_user es quien marcó
- [ ] Endpoints:
  - `POST /api/v1/transactions/{tx_id}/reviews` → crear marca
  - `GET /api/v1/transactions/{tx_id}/reviews` → listar (filtrado por privacidad)
  - `GET /api/v1/me/reviews/incoming` → marcas recibidas
  - `GET /api/v1/me/reviews/outgoing` → marcas enviadas
  - `PUT /api/v1/reviews/{id}/respond` → responder (autor)
  - `PUT /api/v1/reviews/{id}/resolve` → resolver (quien marcó)
  - `DELETE /api/v1/reviews/{id}` → descartar (quien marcó)
- [ ] Excepciones registradas con códigos HTTP correctos
- [ ] Eventos SSE publicados al autor cuando recibe marca
- [ ] Eventos SSE publicados a quien marcó cuando recibe respuesta
- [ ] 15+ tests nuevos cubriendo:
  - Create: happy path
  - Create: propia transacción → 403
  - Create: no miembro del hogar → 403
  - Create: miembro PENDING → 403
  - Create: tx no asociada al hogar → 422
  - Create: comment > 500 chars → 422
  - Get: autor ve marcas dirigidas a él
  - Get: reviewer ve sus marcas
  - Get: tercero NO ve marcas
  - Get: admin del hogar NO ve marcas de otros
  - Respond: autor puede responder
  - Respond: no-autor → 403
  - Respond: cambia status a ACKNOWLEDGED
  - Resolve: reviewer puede resolver
  - Resolve: no-reviewer → 403
  - Dismiss: reviewer puede descartar
- [ ] `pytest backend/tests/` pasa al 100%

### Frontend

- [ ] `ReviewButton` aparece en transacciones de hogar (NO en personales)
- [ ] `ReviewButton` NO aparece en mis propias transacciones
- [ ] `ReviewModal` con dropdown de tipos + textarea para comentario (max 500)
- [ ] `ReviewsSection` en dashboard muestra:
  - Marcas recibidas pendientes (con botón Responder)
  - Marcas enviadas esperando respuesta (con botón Descartar)
- [ ] Hook `useReviewEvents` escucha SSE y refresca queries
- [ ] `npm run build` sin errores

---

## FORMATO DE TRABAJO

### SPRINT 1 — Backend

#### Paso 1.1: Modelo + Enums + Migración

1. Crear `models/transaction_review.py` con:
   - Enums `ReviewType` y `ReviewStatus`
   - Modelo `TransactionReview` con todos los campos
   - Relationships (transaction, household, flagged_by_user)
2. Generar migración Alembic
3. Aplicar: `alembic upgrade head`
4. Mostrame:
   - El modelo completo
   - La migración generada
   - Output de `alembic upgrade head`
5. Esperá aprobación

#### Paso 1.2: Schemas Pydantic

1. `ReviewCreate`: campos `household_id`, `flag_type`, `comment` (opcional, max 500)
2. `ReviewRespond`: campo `response_comment` (max 500)
3. `ReviewRead`: todos los campos visibles
4. Mostrame los schemas
5. Esperá aprobación

#### Paso 1.3: Excepciones

Crear `exceptions/transaction_review_exceptions.py`:
- `ReviewNotFound` → 404
- `CannotReviewOwnTransaction` → 403
- `TransactionNotInHousehold` → 422
- `UnauthorizedReviewAction` → 403

Registrar handlers en `main.py`. Mensajes en **español**.

Mostrame los archivos. Esperá aprobación.

#### Paso 1.4: CRUD

`crud/transaction_review_crud.py`:
- `create(db, data, flagged_by_user_id)` → sin commit
- `get_by_id(db, review_id)` → TransactionReview o None
- `get_for_transaction(db, tx_id, current_user_id)` → solo retorna las que el current_user puede ver (suyas o dirigidas a él)
- `get_incoming(db, user_id)` → marcas a transacciones del user
- `get_outgoing(db, user_id)` → marcas que el user hizo

Mostrame el CRUD. Esperá aprobación.

#### Paso 1.5: Service

`services/transaction_review_service.py`:

```python
def create(db, user, tx_id, data):
    # 1. Validar tx existe
    # 2. Validar no es propia transacción
    # 3. Validar user es miembro activo del hogar
    # 4. Validar tx está asociada al hogar (via transaction_households)
    # 5. Crear review
    # 6. db.commit()
    # 7. event_bus.publish a user_{tx.user_id}
    
def respond(db, user, review_id, response_comment):
    # 1. Validar review existe
    # 2. Validar user es autor de la transacción
    # 3. Setear response + status=ACKNOWLEDGED
    # 4. db.commit()
    # 5. event_bus.publish a quien marcó
    
def resolve(db, user, review_id):
    # 1. Validar review existe
    # 2. Validar user es quien marcó
    # 3. Setear status=RESOLVED
    # 4. commit
    
def dismiss(db, user, review_id):
    # 1. Validar review existe
    # 2. Validar user es quien marcó
    # 3. Setear status=DISMISSED
    # 4. commit
```

Mostrame el service completo. Esperá aprobación.

#### Paso 1.6: Endpoints

Crear `api/v1/transaction_reviews.py` con los 7 endpoints listados en criterios.

Registrar el router en `main.py`.

Mostrame el archivo. Esperá aprobación.

#### Paso 1.7: Tests backend

Implementar los 15+ tests del checklist. Estructura sugerida:

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

Correr: `pytest backend/tests/test_transaction_reviews.py -v`

Pegame output completo. Esperá aprobación.

**Fin de SPRINT 1.**

---

### SPRINT 2 — Frontend

#### Paso 2.1: Tipos y API client

1. `types/transactionReview.ts`:
   ```typescript
   export enum ReviewType {
     UNNECESSARY = 'innecesario',
     HIGH_AMOUNT = 'monto_alto',
     // ... etc
   }
   
   export enum ReviewStatus {
     PENDING = 'pendiente',
     ACKNOWLEDGED = 'respondida',
     // ... etc
   }
   
   export interface TransactionReview { ... }
   ```

2. `api/transactionReviews.ts`:
   - `createReview(txId, data)`
   - `getIncomingReviews()`
   - `getOutgoingReviews()`
   - `respondReview(reviewId, comment)`
   - `resolveReview(reviewId)`
   - `dismissReview(reviewId)`

Mostrame los archivos. Esperá aprobación.

#### Paso 2.2: ReviewButton

Componente que muestra "🚩 Marcar para revisar":
- NO se muestra si la transacción es propia
- NO se muestra si la transacción no está en hogares
- Al click, abre `ReviewModal`

Mostrame el código. Esperá aprobación.

#### Paso 2.3: ReviewModal

Modal con:
- Info de la transacción (monto, descripción, autor)
- Si hay múltiples hogares: dropdown para elegir cuál
- Radio buttons con los 7 tipos
- Textarea para comentario (max 500 chars con contador)
- Disclaimer: "Solo el autor del gasto y vos verán esta marca"
- Botones [Cancelar] [Marcar]

Usar react-hook-form + zod. Mostrame el componente. Esperá aprobación.

#### Paso 2.4: ReviewsSection en dashboard

Sección visible en `DashboardPage.tsx`:

```
🚩 Revisiones (N)

Recibidas (pendientes) — X
  [Cards con cada review entrante, botón Responder]

Enviadas (esperando respuesta) — Y
  [Cards con cada review enviado, botón Descartar]
```

Si no hay reviews, no se muestra la sección (o se muestra vacía con mensaje sutil).

Mostrame el componente. Esperá aprobación.

#### Paso 2.5: Hook useReviewEvents

Hook que conecta a SSE y refresca queries de reviews cuando llega evento `review_received` o `review_responded`.

```typescript
export function useReviewEvents() {
  const queryClient = useQueryClient()
  
  useEffect(() => {
    // Conectar a /api/v1/events?token=...
    // Escuchar eventos tipo review_received y review_responded
    // Invalidar queries ['reviews', 'incoming'] y ['reviews', 'outgoing']
  }, [])
}
```

Si ya existe un hook similar para hogares (`useHouseholdEvents`), inspirarse pero NO modificarlo.

Mostrame el código. Esperá aprobación.

#### Paso 2.6: Integración + Verificación

1. Agregar `useReviewEvents` en algún componente raíz (DashboardPage)
2. Agregar `ReviewButton` en la lista de transacciones del hogar
3. Agregar `ReviewsSection` en el dashboard personal
4. `npm run build`
5. Testing manual:
   - Crear hogar con 2 usuarios (puede requerir simular con 2 sesiones)
   - Usuario A marca transacción de usuario B
   - Usuario B ve la notificación en su dashboard
   - Usuario B responde
   - Usuario A ve la respuesta
6. Pegame outputs y reportame qué viste

---

## PROHIBICIONES EXPLÍCITAS

- ❌ NO hagas las marcas visibles a otros miembros del hogar (privacidad estricta).
- ❌ NO permitas marcar la propia transacción.
- ❌ NO uses email para notificaciones. Solo SSE.
- ❌ NO modifiques el `event_bus.py`. Usalo tal cual.
- ❌ NO automatices el marcado (no auto-flag por monto, etc.). Esta versión es 100% manual.
- ❌ NO modifiques modelos no relacionados.
- ❌ NO uses placeholders ni TODOs en el código que generes.

---

## CONSIDERACIONES DE PRIVACIDAD (CRÍTICAS)

Acá el riesgo más alto es **filtrar información privada**. Verificá especialmente:

1. **El endpoint `GET /transactions/{tx_id}/reviews` filtra por privacidad.**
   Si soy admin del hogar pero NO soy el autor ni quien marcó, NO debo ver la review.

2. **El endpoint `GET /me/reviews/incoming` solo retorna reviews donde `transaction.user_id == current_user.id`.**

3. **El endpoint `GET /me/reviews/outgoing` solo retorna reviews donde `flagged_by_user_id == current_user.id`.**

4. **Los eventos SSE se envían a usuarios específicos**, no broadcast al hogar.

Los tests de "TestGetReviews" deben verificar TODOS estos casos.

---

## EN CASO DE DUDA

Dudas válidas:
- *"En la vista del autor, ¿muestro el nombre completo de quien marcó o solo el username?"*
- *"Si el usuario que marcó sale del hogar después, ¿la review sigue siendo visible para el autor?"*

Mi respuesta tentativa a la 2: **sí, la review se mantiene** aunque quien marcó haya salido del hogar. Es histórico relevante.

¿Listo? Empezá por SPRINT 1 PASO 1.1.
