# P02 — Prompt para Claude Code: Borrado Granular de Transacciones

> **Copiá y pegá TODO lo que está debajo de la línea horizontal a Claude Code.**
> Sesión NUEVA. Rama `feature/F02-borrado-granular`.

---

## CONTEXTO DEL PROYECTO

Estás trabajando en **Fluxo**, plataforma de finanzas personales uruguaya. FastAPI + PostgreSQL + React 19. 123 tests passing.

**ANTES de escribir UNA SOLA línea de código:**

1. Leé el contenido completo de:
   - `docs/plan/01-PRINCIPIOS-INMUTABLES.md`
   - `docs/plan/02-ARQUITECTURA-Y-PATRONES.md`
   - `docs/plan/03-CONVENCIONES-DE-CODIGO.md`
   - `docs/plan/features/F02-borrado-granular.md`

2. Resumime en 3 puntos lo que entendiste de **CADA** archivo.

3. Esperá MI confirmación antes de empezar.

---

## FEATURE A IMPLEMENTAR

**F02 — Borrado Granular de Transacciones**

Hoy borrar una transacción siempre la elimina de todos lados. Esta feature agrega un parámetro `scope` para distinguir:

- `scope=personal` (default): cascada total (transacción + asociaciones a hogares)
- `scope=household`: solo quita la asociación con el hogar (transacción sigue viva en personal)

---

## REGLAS INMUTABLES PARA ESTA FEATURE

1. **El campo `is_deleted` solo se setea a True en `scope=personal`.**
   En `scope=household` la transacción sigue activa.

2. **El borrado de hogar NO restaura saldos** de cuentas. La transacción ya afectó el saldo del usuario.

3. **`scope=household` requiere que la transacción ESTÉ en un hogar.**
   Si no está en ningún hogar, retornar 422 con `InvalidScopeOperation`.

4. **Compatibilidad backward:** sin parámetro `scope`, el comportamiento default es `personal` (igual que ahora).

5. **Las transferencias se borran como par** (SOURCE + DESTINATION). Comportamiento existente, mantener.

6. **Solo el creador puede borrar su transacción.**

7. Mensaje de error en **español** comprensible.

8. **NO modificar tests existentes** salvo si necesitás agregar parámetro `scope` a los calls que ya hay. En ese caso, MANTENÉ los assertions y solo actualizá la URL.

---

## ARCHIVOS QUE PODÉS TOCAR

### Modificar

```
backend/app/api/v1/transactions.py
  → endpoint DELETE ahora acepta query param scope

backend/app/services/transaction_service.py
  → método soft_delete acepta scope

backend/app/schemas/transaction.py
  → agregar enum DeleteScope

backend/app/exceptions/transaction_exceptions.py
  → agregar InvalidScopeOperation

backend/app/main.py
  → registrar el nuevo exception handler

backend/tests/test_transactions.py
  → agregar nueva clase TestDeleteTransactionScopes

frontend/src/components/ConfirmDialog.tsx  (o crear DeleteTransactionModal.tsx)
  → modal de borrado con opciones según contexto

frontend/src/api/dashboard.ts (o donde esté deleteTransaction)
  → aceptar parámetro scope
```

### NO TOCAR

```
backend/app/models/transaction.py
  → NO cambian los modelos en esta feature

backend/app/crud/transaction_crud.py
  → SOLO si la función soft_delete necesita un parámetro nuevo

Cualquier otro archivo no listado
```

---

## CRITERIOS DE COMPLETITUD

### Backend

- [ ] Enum `DeleteScope` con valores `PERSONAL`, `HOUSEHOLD`
- [ ] Excepción `InvalidScopeOperation` registrada, retorna 422
- [ ] Endpoint `DELETE /api/v1/transactions/{id}?scope=...` funciona:
  - `scope=personal` → cascada (cubre comportamiento actual)
  - `scope=household` → solo quita `household_id` y commitea
  - sin parámetro → default `personal` (compatibilidad backward)
  - `scope=household` sin estar en hogar → 422
- [ ] Al menos 5 tests nuevos en `TestDeleteTransactionScopes`:
  1. `test_delete_personal_cascades_household`
  2. `test_delete_household_keeps_personal`
  3. `test_delete_household_without_household_422`
  4. `test_delete_default_scope_is_personal`
  5. `test_delete_only_owner_can_delete`
- [ ] `pytest backend/tests/` pasa al 100%

### Frontend

- [ ] Al hacer click en eliminar transacción, aparece modal
- [ ] Si la transacción NO está en hogar: modal simple "¿Eliminar?"
- [ ] Si la transacción está en hogar: modal con 2 opciones (sacar del hogar / eliminar completamente)
- [ ] La opción elegida se envía como query param `scope`
- [ ] Después de eliminar, React Query invalida correctamente las caches
- [ ] La lista de transacciones se actualiza inmediatamente

---

## FORMATO DE TRABAJO

### PASO 1: Análisis del estado actual

1. Mostrame el contenido actual de:
   - El endpoint `DELETE /transactions/{id}` (en `transactions.py`)
   - El método `soft_delete` en `transaction_service.py`
   - El método `soft_delete` en `transaction_crud.py` (si existe)
2. Confirmame que entendés cómo funciona el borrado actual.
3. Esperá mi aprobación.

### PASO 2: Schema y excepciones

1. Agregar enum `DeleteScope` en `schemas/transaction.py`
2. Agregar excepción `InvalidScopeOperation` en `exceptions/transaction_exceptions.py`
3. Registrar el handler en `main.py` con código 422
4. Mostrame los 3 archivos completos modificados
5. Esperá aprobación

### PASO 3: Service

1. Modificar `transaction_service.soft_delete()` para aceptar `scope: DeleteScope = DeleteScope.PERSONAL`
2. Lógica:
   - Si scope=PERSONAL → llamar a `transaction_crud.soft_delete(db, tx)` (cascada)
   - Si scope=HOUSEHOLD → validar que `tx.household_id is not None`, setear `tx.household_id = None`, commitear
3. Mostrame el código del método completo
4. Esperá aprobación

### PASO 4: Endpoint

1. Modificar el endpoint DELETE en `transactions.py`:
   ```python
   @router.delete("/{tx_id}", status_code=204)
   def delete_transaction(
       tx_id: int,
       scope: DeleteScope = Query(default=DeleteScope.PERSONAL),
       db: Session = Depends(get_db),
       user: User = Depends(get_current_user)
   ):
       transaction_service.soft_delete(db, tx_id, user, scope)
   ```
2. Mostrame el código completo del endpoint
3. Esperá aprobación

### PASO 5: Tests backend

1. Crear clase `TestDeleteTransactionScopes` en `test_transactions.py`
2. Implementar los 5 tests mínimos del checklist
3. Correr: `pytest backend/tests/test_transactions.py -v`
4. Pegame el output COMPLETO
5. Esperá aprobación

### PASO 6: API client del frontend

1. Modificar `deleteTransaction()` para aceptar parámetro `scope`
2. Mostrame la función modificada
3. Esperá aprobación

### PASO 7: Modal de confirmación

1. Decidí entre modificar `ConfirmDialog.tsx` o crear `DeleteTransactionModal.tsx` (recomiendo crear uno nuevo específico).
2. Diseño del modal:
   - Si `tx.household_id` es null → modal simple con botón [Cancelar] [Eliminar]
   - Si `tx.household_id` existe → mostrar nombre del hogar + 2 radio buttons (sacar del hogar / eliminar completamente) + botones
3. Después de confirmar, invocar `deleteTransaction(txId, scope)` y luego `invalidateFinancialData()`
4. Mostrame el código completo del componente
5. Esperá aprobación

### PASO 8: Integración

1. Donde se llamaba al delete antes (botón de eliminar en lista), reemplazar por el nuevo modal
2. Mostrame los cambios
3. Esperá aprobación

### PASO 9: Verificación final

1. `pytest backend/tests/` → debe pasar al 100%
2. `npm run build` → debe compilar sin errores
3. Pegame ambos outputs
4. Reportame el checklist de criterios marcando cada item

---

## PROHIBICIONES EXPLÍCITAS

- ❌ NO modifiques el modelo Transaction.
- ❌ NO crees migraciones Alembic (no hace falta).
- ❌ NO modifiques otros endpoints más allá del DELETE de transacciones.
- ❌ NO uses estado global (Zustand) para esto. Es UI temporal → useState local.
- ❌ NO uses `confirm()` del browser. Usá modal de React.
- ❌ NO toques tests existentes para que pasen. Si fallan, INVESTIGÁ por qué y corregí el código, no el test.

---

## EN CASO DE DUDA

PREGUNTAME en vez de asumir.

Dudas válidas:
- *"Para el modal, ¿uso `<dialog>` nativo, react-modal, o el modal genérico del proyecto si existe?"*
- *"El `cascade='all, delete-orphan'` en relaciones de Transaction afecta el comportamiento de scope=PERSONAL?"*

¿Listo? Empezá por el PASO 1.
