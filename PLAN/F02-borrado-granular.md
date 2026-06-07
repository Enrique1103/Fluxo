# F02 — Borrado Granular de Transacciones

> **Prioridad:** 🔴 Alta — feature crítica de consistencia de datos.
> **Estimación:** 1 fin de semana (4-6 horas)
> **Dependencias:** Ninguna. Independiente.

---

## 🎯 PRD — Product Requirements

### Problema que resuelve

Hoy en Fluxo, cuando una transacción está marcada como del hogar, **borrarla siempre la elimina de todos lados**. No hay forma de:

- Borrarla del hogar sin perderla en el personal
- Corregir una mala clasificación sin perder el dato real
- Sacarla de un hogar pero mantenerla en otros (cuando soporte múltiples hogares — F04)

Esto genera fricción real:

> *"el hijo lleva sus finanzas personales y aporta al hogar [...] el gasto puede ser únicamente personal (siempre lo es) pero puede que pertenezca a un hogar o varios hogares"*

### Casos de uso reales

**Caso 1: Mala clasificación**
Hijo carga $500 de supermercado, marca como "Finanzas del hogar". Después se acuerda que fue solo para él. Quiere sacarlo del hogar **sin perder el dato en su personal**.

**Caso 2: Eliminación total**
Usuario carga una transacción duplicada por error. Quiere borrarla de todos lados.

**Caso 3 (futuro, post F04): Transacción en múltiples hogares**
Usuario tiene una transacción que está en 2 hogares. Quiere sacarla de uno solo.

### Hipótesis del producto

Si el usuario puede borrar granularmente:
- Tiene mayor confianza en cargar transacciones (sabe que puede corregir)
- Los datos del personal son más confiables (no se pierden por errores de clasificación)
- La fricción de "uy, me equivoqué" baja muchísimo

### Métricas de éxito

- ✅ Los usuarios pueden corregir clasificaciones sin perder datos personales
- ✅ Los reportes personales no tienen huecos por errores de hogar
- ✅ No hay regresiones en el flujo de borrado actual

### Out of scope (explícito)

❌ NO se modifica el borrado de cuentas, categorías, conceptos, metas (esto es solo para transacciones)
❌ NO se implementa "undo" / restauración de transacciones borradas
❌ NO se cambia el modelo de cuentas

---

## 🛠 TRD — Technical Requirements

### Modelo conceptual

Cada transacción tiene **dos "vidas" simultáneas**:

1. **Vida personal:** existe en el dashboard personal del usuario que la creó.
2. **Vida en hogares:** opcionalmente, también aparece en uno o varios hogares.

El borrado puede ser:

- **Borrado personal:** elimina la transacción de la vida personal **y, en cascada**, de todos los hogares.
- **Borrado de hogar:** elimina solo la asociación con ese hogar específico. La vida personal y otros hogares siguen intactos.

### Estado actual (lo que ya existe)

- `Transaction.is_deleted` (soft delete booleano)
- `Transaction.deleted_at` (timestamp)
- `Transaction.household_id` (asociación con UN hogar — esto cambia en F04)
- Endpoint actual: `DELETE /api/v1/transactions/{id}` → soft-delete completo

### Estado futuro (post F02 + F04)

Después de F04 (múltiples hogares por transacción), tendremos una tabla intermedia. Pero **F02 se puede implementar AHORA**, antes de F04, asumiendo que por ahora cada transacción tiene **un solo hogar**.

### Cambios necesarios

#### Backend

##### Modelo

**No cambios en `Transaction`.** El `is_deleted` actual sigue funcionando para borrado completo.

Lo único que cambia es el comportamiento del endpoint.

##### Endpoint modificado

`DELETE /api/v1/transactions/{id}?scope=personal|household`

- `scope=personal` (default): borrado completo (cascada). Comportamiento actual.
- `scope=household`: solo quita la asociación con el hogar. Mantiene la transacción viva en personal.

##### Servicio

`transaction_service.py`:

```python
def soft_delete(
    db: Session,
    tx_id: int,
    user: User,
    scope: DeleteScope = DeleteScope.PERSONAL
) -> None:
    """Borra una transacción según el scope solicitado.

    scope=PERSONAL: cascada total (transacción + asociaciones a hogares).
    scope=HOUSEHOLD: solo quita asociación con hogar, transacción personal sigue viva.

    Raises:
        TransactionNotFound: si tx no existe o no pertenece al usuario.
        InvalidScopeOperation: si scope=HOUSEHOLD pero tx no está en ningún hogar.
    """
    tx = transaction_crud.get_by_id(db, tx_id, user.id)
    if not tx:
        raise TransactionNotFound(tx_id)

    if scope == DeleteScope.PERSONAL:
        # Cascada total
        transaction_crud.soft_delete(db, tx)
        # Si tx tiene household_id, también se "saca" del hogar
        # (en F04 esto borrará de todas las asociaciones)

    elif scope == DeleteScope.HOUSEHOLD:
        if not tx.household_id:
            raise InvalidScopeOperation(
                "No se puede borrar del hogar una transacción que no pertenece a ningún hogar"
            )
        # Restaurar saldos si correspondía al hogar
        # (en este caso, "quitar del hogar" no afecta saldos del usuario)
        tx.household_id = None
        # La transacción sigue viva, solo cambia su scope

    db.commit()
```

##### Excepciones nuevas

`transaction_exceptions.py`:

```python
class InvalidScopeOperation(Exception):
    """Se intentó una operación de scope inválida (ej: borrar de hogar sin estar en hogar)."""
    def __init__(self, message: str):
        self.message = message
        super().__init__(message)
```

Mapeo HTTP: 422.

##### Schema

`schemas/transaction.py`:

```python
class DeleteScope(str, Enum):
    PERSONAL = "personal"
    HOUSEHOLD = "household"
```

#### Frontend

##### UI del modal de confirmación

Cuando el usuario hace click en "Borrar transacción", aparece un modal **contextual**:

###### Caso A: transacción solo personal (no en hogares)
```
┌────────────────────────────────────────────────────┐
│ ⚠️  Eliminar transacción                            │
├────────────────────────────────────────────────────┤
│ ¿Estás seguro que querés eliminar:                 │
│   "Supermercado" — $500 — 24/05/2026               │
│                                                    │
│ Esta acción no se puede deshacer.                  │
│                                                    │
│ [Cancelar]              [Eliminar]                 │
└────────────────────────────────────────────────────┘
```

###### Caso B: transacción asociada a un hogar
```
┌────────────────────────────────────────────────────┐
│ ⚠️  Eliminar transacción                            │
├────────────────────────────────────────────────────┤
│ "Supermercado" — $500 — 24/05/2026                 │
│                                                    │
│ Esta transacción está asociada al hogar:           │
│   🏠 Familia García                                │
│                                                    │
│ ¿Cómo querés eliminarla?                           │
│                                                    │
│ ● Sacarla solo del hogar                           │
│   (Se mantiene en tus finanzas personales)         │
│                                                    │
│ ○ Eliminar completamente                           │
│   (Se elimina de personal Y del hogar)             │
│                                                    │
│ [Cancelar]              [Confirmar]                │
└────────────────────────────────────────────────────┘
```

### Reglas inmutables específicas de F02

1. **El campo `is_deleted` solo se setea a True en borrado scope=personal.**
   Si se borra del hogar, la transacción sigue activa.

2. **El borrado del hogar NO restaura saldos.**
   La transacción ya afectó el saldo de la cuenta del usuario. Quitarla del hogar no cambia eso.

3. **Si la transacción no está en ningún hogar, scope=household devuelve 422.**
   No tiene sentido sacarla de un hogar donde no está.

4. **El borrado total (scope=personal) cascadea a TODAS las asociaciones con hogares.**
   Una vez F04 esté implementado, esto debe seguir funcionando.

5. **Las transferencias se borran como unidad.**
   Si se borra una transferencia, se borran ambas patas (SOURCE y DESTINATION).
   Este comportamiento ya existe y se mantiene.

### Migraciones necesarias

**NINGUNA.** El modelo no cambia.

### Tests requeridos

```python
# backend/tests/test_transactions.py

class TestDeleteTransactionScopes:
    
    def test_delete_personal_cascades_household(self, authed, ...):
        """Borrar con scope=personal elimina también del hogar."""
        # Crear transacción asociada a hogar
        # DELETE con scope=personal
        # Verificar: is_deleted=True, no aparece en analytics del hogar
        
    def test_delete_household_keeps_personal(self, authed, ...):
        """Borrar con scope=household mantiene la transacción en personal."""
        # Crear transacción asociada a hogar
        # DELETE con scope=household
        # Verificar: is_deleted=False, household_id=None
        # Verificar: aparece en personal, no aparece en hogar
        
    def test_delete_household_without_household_422(self, authed, ...):
        """Intentar scope=household sin estar en hogar → 422."""
        # Crear transacción SIN household_id
        # DELETE con scope=household
        # Verificar: 422 InvalidScopeOperation
        
    def test_delete_default_scope_is_personal(self, authed, ...):
        """Sin pasar scope, default es personal (compatibilidad backward)."""
        # DELETE sin parámetro scope
        # Verificar comportamiento de cascada
        
    def test_delete_only_owner_can_delete(self, authed, other_user, ...):
        """Solo el creador puede borrar su transacción."""
        # User1 crea transacción asociada al hogar
        # User2 intenta DELETE → 403
```

**Mínimo 5 tests nuevos.**

---

## ✅ Criterios de aceptación

### Funcional

- [ ] El endpoint `DELETE /api/v1/transactions/{id}?scope=personal` borra completamente (cascada)
- [ ] El endpoint `DELETE /api/v1/transactions/{id}?scope=household` solo quita del hogar
- [ ] Sin parámetro `scope`, el comportamiento default es `personal` (compatibilidad)
- [ ] El modal del frontend muestra opciones según si la transacción está en hogar o no
- [ ] Después de borrar del hogar, la transacción sigue en el dashboard personal
- [ ] Después de borrar personal, la transacción no aparece en personal ni en hogar
- [ ] Las transferencias se borran como par (ambas patas)

### Técnico

- [ ] Los 123 tests existentes siguen pasando
- [ ] Hay al menos 5 tests nuevos cubriendo los casos de scope
- [ ] El código sigue las convenciones de `03-CONVENCIONES-DE-CODIGO.md`
- [ ] La excepción `InvalidScopeOperation` está registrada en `main.py` con código 422
- [ ] El schema Pydantic `DeleteScope` está documentado

### UX

- [ ] El modal del frontend es claro y no confunde al usuario
- [ ] El mensaje de confirmación es en español
- [ ] La diferencia entre las dos opciones es entendible para un no-técnico
- [ ] Después del borrado, la lista se actualiza inmediatamente (React Query invalidation)

---

## 🚀 Plan de implementación

### Paso 1 (1-2 horas)
- Agregar enum `DeleteScope` en schemas
- Agregar excepción `InvalidScopeOperation`
- Registrar en `main.py`
- Tests del enum + excepción

### Paso 2 (2 horas)
- Modificar `transaction_service.soft_delete()` para aceptar scope
- Modificar `transaction_crud.soft_delete()` si hace falta
- Modificar endpoint `DELETE /transactions/{id}` para aceptar query param `scope`
- Tests backend nuevos (5 tests mínimo)
- Verificar tests existentes siguen pasando

### Paso 3 (2 horas)
- Modificar `ConfirmDialog.tsx` o crear `DeleteTransactionModal.tsx`
- Lógica para mostrar opciones según contexto
- Llamada API actualizada con scope
- Invalidación correcta de React Query
- Testing manual end-to-end

### Paso 4 (30 min)
- Commit con mensajes descriptivos
- Actualizar `99-DECISIONES-PENDIENTES.md` si surge algo

---

## 🔗 Referencias

- **Endpoint actual:** `DELETE /api/v1/transactions/{id}`
- **Service:** `transaction_service.py::soft_delete()`
- **CRUD:** `transaction_crud.py::soft_delete()`
- **Frontend:** `ConfirmDialog.tsx` + lugares donde se llama
- **Principios relevantes:** P3 (soft delete), P6 (personal es fuente de verdad)

---

## 📝 Notas de implementación

- Esta feature **anticipa F04** (múltiples hogares por transacción). Cuando se implemente F04, el `scope=household` necesitará un parámetro adicional `household_id` para especificar de cuál hogar sacarla. Por ahora, como una transacción está en máximo 1 hogar, basta con `scope=household`.

- **Compatibilidad backward:** el endpoint sin parámetro `scope` debe seguir funcionando como antes (comportamiento `personal`). Esto evita romper integraciones existentes o frontend que aún no se actualizó.

- **Consideración futura:** después de F04, evaluar si tiene sentido un `scope=household&household_id=X` o si conviene un endpoint nuevo `DELETE /transactions/{tx_id}/households/{hh_id}`. Esa decisión queda para cuando lleguemos a F04.
