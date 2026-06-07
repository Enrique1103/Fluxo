# 🧪 QA-F06 — Sistema de Revisión Colaborativa

> **Verificá ESTE checklist DESPUÉS de pasar `QA-template.md`.**
> Esta feature tiene **alto riesgo de filtrar información privada**. Verificación de privacidad es **CRÍTICA**.

---

## ✅ Verificación específica F06

### Backend - Modelo

- [ ] Modelo `TransactionReview` creado con todos los campos:
  - `id`, `transaction_id`, `household_id`, `flagged_by_user_id`
  - `flag_type` (enum), `comment` (max 500)
  - `status` (enum), `created_at`
  - `response_comment` (max 500), `response_at` (nullable)
- [ ] Enums `ReviewType` y `ReviewStatus` definidos
- [ ] FKs con `ondelete='CASCADE'` (tx y household)
- [ ] Índices en `transaction_id`, `household_id`, `status`
- [ ] Migración Alembic aplicada sin errores

### Backend - Validaciones críticas de privacidad

**Cada uno de estos casos debe estar testeado y funcionando:**

- [ ] **Crear marca sobre propia transacción** → 403 `CannotReviewOwnTransaction`
- [ ] **Crear marca sin ser miembro activo del hogar** → 403 `NotHouseholdMember`
- [ ] **Crear marca con membresía PENDING** → 403
- [ ] **Crear marca sobre tx que NO está en ese hogar** → 422 `TransactionNotInHousehold`
- [ ] **Comment > 500 caracteres** → 422
- [ ] **Otro usuario (no autor, no reviewer) consulta la marca** → 403 o no la ve

### Backend - Endpoints

Verificar que existen y responden correctamente:

- [ ] `POST /api/v1/transactions/{tx_id}/reviews` → crea marca
- [ ] `GET /api/v1/transactions/{tx_id}/reviews` → listar (filtrado por privacidad)
- [ ] `GET /api/v1/me/reviews/incoming` → marcas recibidas (como autor)
- [ ] `GET /api/v1/me/reviews/outgoing` → marcas enviadas (como reviewer)
- [ ] `PUT /api/v1/reviews/{id}/respond` → autor responde
- [ ] `PUT /api/v1/reviews/{id}/resolve` → reviewer marca como resuelta
- [ ] `DELETE /api/v1/reviews/{id}` → reviewer descarta

### Backend - Privacidad enforced en endpoints

Cada uno de estos casos:

**`GET /transactions/{tx_id}/reviews` cuando soy:**
- [ ] El autor de la tx → veo las marcas dirigidas a mí
- [ ] El que marcó (reviewer) → veo mi marca
- [ ] Tercer miembro del hogar → NO veo nada (lista vacía o 403)
- [ ] Admin del hogar pero ni autor ni reviewer → NO veo nada

**`PUT /reviews/{id}/respond` cuando soy:**
- [ ] El autor de la transacción → puedo responder
- [ ] El que marcó → NO puedo responder, 403
- [ ] Tercer miembro → 403

**`PUT /reviews/{id}/resolve` cuando soy:**
- [ ] El que marcó → puedo resolver
- [ ] El autor de la tx → NO puedo, 403
- [ ] Tercer miembro → 403

**`DELETE /reviews/{id}` cuando soy:**
- [ ] El que marcó → puedo descartar
- [ ] Otros → 403

### Tests automatizados

Verificar que existen:

**TestCreateReview:**
- [ ] `test_create_review_ok`
- [ ] `test_cannot_review_own_transaction`
- [ ] `test_cannot_review_without_household_membership`
- [ ] `test_cannot_review_transaction_not_in_household`
- [ ] `test_comment_max_length_500`

**TestGetReviews:**
- [ ] `test_author_can_see_reviews_on_their_tx`
- [ ] `test_reviewer_can_see_their_own_reviews`
- [ ] `test_third_party_cannot_see_reviews`
- [ ] `test_admin_of_household_cannot_see_others_reviews`

**TestRespondReview:**
- [ ] `test_author_can_respond`
- [ ] `test_only_author_can_respond`
- [ ] `test_response_changes_status_to_acknowledged`

**TestResolveReview:**
- [ ] `test_reviewer_can_mark_resolved`
- [ ] `test_only_reviewer_can_resolve`

**TestDismissReview:**
- [ ] `test_reviewer_can_dismiss`
- [ ] `test_only_reviewer_can_dismiss`

### Backend - Notificaciones SSE

- [ ] Cuando se crea una marca, se publica evento al autor de la tx
- [ ] Cuando el autor responde, se publica evento a quien marcó
- [ ] Los eventos son **específicos por usuario**, NO broadcast al hogar
- [ ] El payload del evento contiene `review_id` (no datos sensibles)

### Frontend - ReviewButton

- [ ] Aparece en transacciones de hogar
- [ ] **NO aparece** en transacciones personales puras (sin hogar)
- [ ] **NO aparece** en mis propias transacciones
- [ ] Al click, abre `ReviewModal`

### Frontend - ReviewModal

- [ ] Muestra info de la transacción (monto, descripción, autor)
- [ ] Si la tx está en múltiples hogares: dropdown para elegir cuál
- [ ] Si la tx está en 1 solo hogar: se selecciona automáticamente (no se muestra dropdown)
- [ ] 7 opciones de tipo (radio buttons) con labels en español
- [ ] Textarea para comentario con **contador de caracteres visible** (X / 500)
- [ ] Disclaimer visible: "Solo el autor del gasto y vos verán esta marca"
- [ ] Validación: error si supera 500 chars
- [ ] Botones [Cancelar] [Marcar]
- [ ] Después de marcar exitosamente, el modal se cierra
- [ ] La lista de transacciones se actualiza

### Frontend - ReviewsSection en dashboard

- [ ] Visible en el dashboard personal del usuario
- [ ] Muestra 2 secciones: "Recibidas pendientes" y "Enviadas esperando"
- [ ] Si no hay marcas, la sección NO se muestra (o muestra mensaje vacío sutil)
- [ ] Cada marca recibida tiene botón [Responder]
- [ ] Cada marca enviada tiene botón [Descartar]
- [ ] Al responder, se abre modal/inline form
- [ ] Después de responder, la marca pasa a otra sección o desaparece

### Frontend - SSE / Notificaciones

- [ ] Hook `useReviewEvents` se conecta al SSE
- [ ] Cuando recibo un evento `review_received`, mi dashboard se actualiza
- [ ] Cuando recibo un evento `review_responded`, mi vista de "enviadas" se actualiza
- [ ] La notificación es **sutil**, no intrusiva (no popups molestos)

---

## 🎯 Test de fuego — Pareja real

**Setup:** crear 2 usuarios en distintos navegadores (o sesiones incógnito).

**Carlos** crea hogar "Pareja" con tipo EQUAL + FULL.
**Ana** acepta invitación.

### Flujo 1: Marca y respuesta

1. Carlos carga gasto "Bar Tropical $3.000" asociado al hogar "Pareja"
2. En sesión de Ana, ella ve el gasto en el dashboard del hogar
3. Ana click en "🚩 Marcar para revisar"
4. Selecciona "Me parece muy cara"
5. Comentario: "Charlemos cuando puedas"
6. Confirma

**Verificar:**
- [ ] Carlos recibe notificación en su dashboard (o ve la sección "Revisiones (1)")
- [ ] Carlos ve la marca con el comentario de Ana
- [ ] Ana NO recibe notificación a sí misma
- [ ] La marca tiene status "pendiente"

7. Carlos click en "Responder"
8. Escribe: "Era cumpleaños sorpresa, no se repite"
9. Confirma

**Verificar:**
- [ ] La marca ahora tiene status "respondida"
- [ ] Ana recibe notificación de la respuesta
- [ ] Ana ve la respuesta de Carlos en su sección "Enviadas"

10. Ana click en "Marcar como resuelta"

**Verificar:**
- [ ] La marca ahora tiene status "resuelta"
- [ ] Ya no aparece como pendiente en ningún dashboard

### Flujo 2: Privacidad

**Setup adicional:** invitar a un tercer usuario "Tomás" al hogar.

1. En sesión de Tomás, va al hogar "Pareja"

**Verificar:**
- [ ] Tomás ve el gasto de Carlos en la lista
- [ ] Tomás **NO ve** la marca de Ana
- [ ] Tomás **NO ve** la respuesta de Carlos
- [ ] Tomás puede crear sus propias marcas

2. Tomás intenta hacer `GET /api/v1/transactions/{tx_id}/reviews` directamente vía Postman/curl

**Verificar:**
- [ ] La respuesta NO incluye la marca de Ana

### Flujo 3: No-self-review

1. Carlos intenta marcar su propio gasto

**Verificar:**
- [ ] El botón "🚩 Marcar" NO aparece
- [ ] Si Carlos intenta vía API directa, recibe 403

### Flujo 4: Salida del hogar

1. Ana sale del hogar (se elimina su membresía)
2. Carlos consulta sus marcas

**Verificar:**
- [ ] La marca de Ana sigue visible para Carlos
- [ ] Pero Ana ya no puede crear nuevas marcas (no es miembro)
- [ ] Si Ana intenta acceder al hogar → 403

**Tildá si todos los flujos funcionan correctamente:** [ ]

---

## 🚨 Verificación crítica de privacidad

**Esta es la verificación MÁS IMPORTANTE de esta feature.** Hacela con cuidado.

### Test adversarial: ¿puedo leer marcas que no son mías?

Con 3 usuarios en el mismo hogar (A, B, C):

1. A marca una transacción de B
2. Inicio sesión como C
3. Intento todas estas URLs/operaciones:

```bash
# Como C, intentar ver la marca:
GET /api/v1/transactions/{tx_id}/reviews
# Esperado: lista vacía o sin la marca

# Intentar acceder directo al ID de la marca (si lo conozco):
GET /api/v1/reviews/{review_id}
# Esperado: 403 o 404

# Intentar responder a la marca:
PUT /api/v1/reviews/{review_id}/respond
# Esperado: 403

# Intentar resolver la marca:
PUT /api/v1/reviews/{review_id}/resolve
# Esperado: 403

# Intentar descartarla:
DELETE /api/v1/reviews/{review_id}
# Esperado: 403
```

- [ ] **TODAS** las operaciones rechazadas con 403/404 (no leakea info)

Si CUALQUIERA de estas operaciones devuelve datos privados o tiene éxito, **la feature está rota**. Volvé con Claude Code y arreglálo antes de mergear.

---

## 📊 Reporte de QA

```markdown
# QA Report — F06: Sistema de Revisión Colaborativa

Fecha: YYYY-MM-DD
Branch: feature/F06-review-colaborativa
Commit: abcd1234

## Resultado: ✅ / ❌

## Tests
- Antes: 148 (post F04)
- Después: 163+ (15 nuevos mínimo)

## Verificación específica
- Modelo + migración: ✅
- Validaciones de privacidad: ✅ (CRÍTICO)
- Endpoints: ✅
- Tests automatizados: 15+/15+ ✅
- Notificaciones SSE: ✅
- Frontend ReviewButton: ✅
- Frontend ReviewModal: ✅
- Frontend ReviewsSection: ✅
- Test de fuego flujo 1 (marca + respuesta): ✅
- Test de fuego flujo 2 (privacidad de tercero): ✅
- Test de fuego flujo 3 (no-self-review): ✅
- Test de fuego flujo 4 (salida del hogar): ✅
- **Test adversarial de privacidad: ✅** (CRÍTICO)

## Notas
[Observaciones]

## Listo para merge: SÍ / NO
```

---

## 🚨 Problemas comunes en esta feature

### Problema CRÍTICO: tercer miembro ve marcas ajenas
**Causa:** falta filtro de privacidad en el endpoint GET.
**Solución:** verificar que `get_for_transaction()` en CRUD filtra correctamente.

### Problema: admin del hogar puede ver marcas
**Esto NO es deseado.** Los admins NO tienen poder especial sobre marcas.
**Solución:** la lógica de "puede ver" se basa en `flagged_by_user_id == current_user.id` OR `transaction.user_id == current_user.id`, NUNCA en rol de admin.

### Problema: marca queda huérfana al borrar transacción
**Verificar:** `ondelete='CASCADE'` en la FK debe borrar la review automáticamente.

### Problema: notificación SSE no llega
**Causa típica:** el listener del frontend no está suscrito al canal correcto.
**Verificar:** el canal SSE es `user_{user_id}`, no `household_{id}`.

### Problema: el textarea acepta más de 500 chars
**Solución:** validación en frontend (con react-hook-form + zod) Y en backend (Pydantic). Ambos.

### Problema: el usuario puede crear marcas duplicadas
**Esto es OK por ahora.** No hay constraint de unicidad (uno puede marcar la misma tx 2 veces con razones distintas). Si se vuelve un problema, se agrega constraint en el futuro.

### Problema: nombres de tipos confusos en el frontend
**Solución:** crear mapping `ReviewType` → texto en español visible:
```typescript
const REVIEW_TYPE_LABELS = {
  unnecessary: 'Me parece innecesaria',
  high_amount: 'Me parece muy cara',
  // ...
}
```

---

## 💡 Notas para el futuro

Esta feature **habilita** estas mejoras futuras (todas en `BACKLOG.md`):

1. **Auto-flag basado en reglas** (B11 hipotético): si un miembro gasta más de $X, marcar automáticamente
2. **Estadísticas de marcas:** "Marcaste X gastos este mes, fueron respondidos Y"
3. **Mediación grupal:** si la marca no se resuelve en N días, escalar al admin del hogar

Todas son post-MVP. Por ahora, esta versión simple es suficiente.
