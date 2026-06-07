# 🧪 QA-F04 — Múltiples Hogares por Transacción

> **Verificá ESTE checklist DESPUÉS de pasar `QA-template.md`.**

---

## ✅ Verificación específica F04

### Backend - Modelo y migración

- [ ] Modelo `TransactionHousehold` creado con:
  - PK compuesta `(transaction_id, household_id)`
  - FKs con `ondelete='CASCADE'`
  - Campo `added_at`
- [ ] `Transaction` tiene relationship `household_links`
- [ ] `Household` tiene relationship `transaction_links`
- [ ] **`Transaction.household_id` SE MANTIENE** (legacy, no eliminar)
- [ ] Migración Alembic aplicable sin errores
- [ ] **Migración de datos:** transactions con `household_id != NULL` aparecen en tabla intermedia

**Verificación crítica:**

```sql
-- Antes de la migración:
SELECT COUNT(*) FROM transactions WHERE household_id IS NOT NULL AND is_deleted = FALSE;
-- Después de la migración:
SELECT COUNT(*) FROM transaction_households;
-- Los números deben coincidir
```

- [ ] Los counts coinciden (no se perdieron datos)

### Backend - Schemas

- [ ] `TransactionCreate` tiene `household_ids: list[int]` (default `[]`)
- [ ] `TransactionCreate` aún acepta `household_id: int | None` (backward compat)
- [ ] `TransactionUpdate` permite cambiar `household_ids`
- [ ] `TransactionRead` expone la lista de hogares asociados

### Backend - Service y endpoints

- [ ] `POST /transactions` con `household_ids: [1, 2, 3]` crea asociaciones a los 3 hogares
- [ ] `POST /transactions` sin `household_ids` crea sin asociaciones (no aparece en ningún hogar)
- [ ] `POST /transactions` con `household_id: 1` (legacy) sigue funcionando
- [ ] **Validación crítica:** asociar a hogar donde NO soy miembro activo → 403
- [ ] Miembro PENDING (no aprobado) → 403
- [ ] `PUT /transactions/{id}/households` con `household_ids: [...]` reemplaza la lista
- [ ] `DELETE /transactions/{id}/households/{hh_id}` quita solo de ese hogar
- [ ] `DELETE /transactions/{id}` (sin scope) cascadea: borra associations

### Tests automatizados

- [ ] `test_create_with_no_households`
- [ ] `test_create_with_one_household`
- [ ] `test_create_with_multiple_households`
- [ ] `test_cannot_associate_to_non_member_household_403`
- [ ] `test_cannot_associate_to_inactive_membership`
- [ ] `test_update_household_associations`
- [ ] `test_remove_from_one_household_keeps_others`
- [ ] `test_delete_transaction_cascades_to_associations`
- [ ] `test_analytics_counts_transaction_in_each_household`
- [ ] `test_legacy_household_id_still_works`

### Backend - Analytics

- [ ] `household_analytics_service` usa JOIN con `transaction_households`
- [ ] Una transacción en 2 hogares aparece en analytics de AMBOS hogares (no se divide el monto)
- [ ] Cada hogar cuenta el monto completo de cada tx asociada
- [ ] La liquidación funciona correctamente independientemente de en cuántos hogares está la tx

### Frontend

- [ ] `TransactionModal` muestra checkboxes de hogares del usuario al crear
- [ ] Si el usuario no tiene hogares, la sección NO aparece (no confunde)
- [ ] Por defecto, ningún hogar está seleccionado
- [ ] Se pueden seleccionar múltiples hogares
- [ ] Al guardar, se envía `household_ids` correctamente
- [ ] La vista de transacción muestra los hogares asociados como tags/badges
- [ ] Si no hay hogares asociados, no se muestran tags

### Funcional - Happy Path

**Setup:** un usuario con 1 cuenta y 3 hogares (Familia, Pareja, Amigos).

**Caso 1: Transacción sin hogares (default)**

1. Click en "+ Nueva transacción"
2. Lleno monto, descripción, etc.
3. NO marco ningún hogar
4. Guardo
- [ ] La transacción aparece en personal
- [ ] NO aparece en ningún hogar
- [ ] Los analytics de los 3 hogares no la cuentan

**Caso 2: Transacción en 1 hogar**

1. Cargo gasto de supermercado
2. Marco "Familia"
3. Guardo
- [ ] Aparece en personal
- [ ] Aparece en analytics de Familia
- [ ] NO aparece en Pareja ni Amigos
- [ ] Tag visible: "Familia"

**Caso 3: Transacción en múltiples hogares**

1. Cargo gasto "Café compartido $300"
2. Marco "Familia" y "Amigos"
3. Guardo
- [ ] Aparece en personal
- [ ] Aparece en analytics de Familia (como $300, no $150)
- [ ] Aparece en analytics de Amigos (como $300, no $150)
- [ ] Tags visibles: "Familia", "Amigos"

**Caso 4: Editar asociaciones**

1. Tomo la tx del Caso 3
2. Edito y cambio a solo "Pareja"
3. Guardo
- [ ] Ya NO aparece en Familia
- [ ] Ya NO aparece en Amigos
- [ ] Ahora aparece en Pareja
- [ ] Tag visible: "Pareja"

### Funcional - Edge Cases

- [ ] **Intentar asociar a hogar donde NO soy miembro:**
  - Backend rechaza con 403
  - Frontend muestra mensaje en español

- [ ] **Asociar a un hogar, salirse del hogar, luego intentar editar:**
  - El usuario ya no es miembro
  - La tx queda asociada al hogar (histórico)
  - El usuario NO puede modificar esa asociación

- [ ] **Borrar una tx que está en 3 hogares (scope=PERSONAL):**
  - La tx desaparece de personal
  - La tx desaparece de los 3 hogares (cascada de associations)

- [ ] **Borrar de un hogar específico (DELETE /tx/{id}/households/{hh}):**
  - La tx se quita SOLO de ese hogar
  - Sigue activa en personal y otros hogares
  - La liquidación de ese hogar se actualiza
  - Las liquidaciones de los otros hogares NO cambian

- [ ] **Transferencia (SOURCE + DESTINATION) asociada a hogares:**
  - Solo la pata SOURCE (visible al usuario) debe estar en analytics
  - La pata DESTINATION se mantiene oculta como siempre
  - Verificar que `transfer_role != DESTINATION` se sigue aplicando en queries

- [ ] **Backward compat:** enviar `household_id: 5` (legacy) en POST:
  - Funciona, crea la asociación en la tabla intermedia
  - Setea `household_id` legacy también (durante transición)

### Frontend - UX

- [ ] El selector múltiple es claro (checkboxes, no dropdown con multi-select confuso)
- [ ] Los nombres de hogares se ven bien aunque sean largos
- [ ] Si un usuario tiene MUCHOS hogares (10+), el selector sigue siendo usable (scroll)
- [ ] Los tags en la lista de transacciones no rompen el layout

### Regresión

- [ ] Crear transacciones sin tocar hogares: funciona idéntico
- [ ] Editar transacciones: funciona
- [ ] Listar transacciones: funciona
- [ ] Importación bancaria: funciona (no debe romper porque importa con `household_id=null` por defecto)
- [ ] Analytics personal: funciona
- [ ] Liquidación de hogares (función pre-existente): funciona con el nuevo modelo

---

## 🎯 Test de fuego

**Escenario realista — Compra del hijo:**

1. Hijo cargo gasto "Supermercado $500"
2. En el modal de transacción ve sus 2 hogares disponibles: "Familia" e "hijo y novia"
3. Marca AMBOS (la compra incluye cosas para todos en casa + cosas de la pareja)
4. Guarda
- [ ] Aparece en su personal: $500
- [ ] Aparece en analytics de "Familia": $500
- [ ] Aparece en analytics de "hijo y novia": $500
- [ ] La liquidación de "Familia" considera el monto para dividir entre los 4 miembros
- [ ] La liquidación de "hijo y novia" considera el monto para dividir entre 2 (hijo y novia)

**Tildá si funciona correctamente:** [ ]

Después:

5. La mamá ve la tx en "Familia"
6. Click en eliminar
7. Modal aparece, ella selecciona "Sacar del hogar Familia"
- [ ] La tx se quita de "Familia"
- [ ] La tx sigue en "hijo y novia"
- [ ] La tx sigue en personal del hijo
- [ ] La liquidación de "Familia" se actualiza

**Tildá si todo funciona:** [ ]

Este test integra F02 + F04 y valida el modelo completo.

---

## 📊 Reporte de QA

```markdown
# QA Report — F04: Múltiples Hogares por Transacción

Fecha: YYYY-MM-DD
Branch: feature/F04-multi-household-tx
Commit: abcd1234

## Resultado: ✅ / ❌

## Tests
- Antes: 138 (post F03)
- Después: 148+ (10 nuevos mínimo)

## Verificación específica
- Modelo + migración: ✅
- Datos migrados correctamente: ✅
- Schemas: ✅
- Endpoints: ✅
- Tests automatizados: 10/10 ✅
- Analytics con JOIN: ✅
- Frontend selector: ✅
- Happy path (4 casos): ✅
- Edge cases: ✅
- Backward compat: ✅
- Regresión: ✅
- Test de fuego: ✅

## Notas
[Observaciones]

## Listo para merge: SÍ / NO
```

---

## 🚨 Problemas comunes en esta feature

### Problema: la migración duplica filas o se pierden
**Causa típica:** la query de migración no excluyó transacciones borradas (`is_deleted = FALSE`).
**Verificar:** la query INSERT solo migra rows activos.

### Problema: el analytics cuenta dos veces la misma transacción
**Causa:** una tx en 2 hogares se cuenta UNA vez por hogar, NO dos veces dentro de un solo hogar.
**Verificar:** la query del analytics tiene `DISTINCT` o el JOIN no duplica.

### Problema: borrar una tx no cascadea associations
**Causa:** falta `cascade="all, delete-orphan"` en relationship o falta `ondelete='CASCADE'` en FK.
**Solución:** verificar que ambos estén configurados.

### Problema: el frontend no muestra hogares actualizados al editar
**Causa:** React Query no invalida la query de la transacción individual.
**Solución:** después de mutación, invalidar `['transactions', txId]` específicamente.

### Problema: backward compat falla cuando frontend envía `household_id` y `household_ids` juntos
**Solución:** el backend debe priorizar `household_ids` si está presente. Si solo está `household_id`, usar ese.

### Problema: usuario con muchos hogares ve el modal cargado
**Solución:** scroll en el selector + búsqueda por nombre si son más de 5 hogares.
