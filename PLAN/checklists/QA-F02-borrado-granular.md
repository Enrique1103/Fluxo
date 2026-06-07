# 🧪 QA-F02 — Borrado Granular de Transacciones

> **Verificá ESTE checklist DESPUÉS de pasar `QA-template.md`.**

---

## ✅ Verificación específica F02

### Backend

- [ ] Enum `DeleteScope` con valores `PERSONAL` y `HOUSEHOLD`
- [ ] Excepción `InvalidScopeOperation` registrada, retorna 422
- [ ] Endpoint `DELETE /api/v1/transactions/{id}` acepta query param `scope`
- [ ] **Sin parámetro `scope`** → comportamiento default `personal` (backward compat)
- [ ] **`scope=personal`** → soft delete completo + asociaciones a hogares
- [ ] **`scope=household`** → solo limpia `household_id`, transacción sigue activa
- [ ] **`scope=household` sin estar en hogar** → 422 `InvalidScopeOperation`
- [ ] **Usuario no creador** intentando borrar → 403
- [ ] Solo el creador (`tx.user_id == current_user.id`) puede borrar

### Tests automatizados

Verificar que estos tests existen y pasan:

- [ ] `test_delete_personal_cascades_household`
- [ ] `test_delete_household_keeps_personal`
- [ ] `test_delete_household_without_household_422`
- [ ] `test_delete_default_scope_is_personal`
- [ ] `test_delete_only_owner_can_delete`

### Frontend

- [ ] Al hacer click en eliminar transacción, aparece modal de confirmación
- [ ] Modal **NO** confunde con `confirm()` del browser
- [ ] **Caso A: transacción sin hogar**
  - Modal muestra solo confirmación simple
  - Botones [Cancelar] [Eliminar]
- [ ] **Caso B: transacción asociada a hogar**
  - Modal muestra nombre del hogar
  - 2 opciones claras (sacar del hogar / eliminar completamente)
  - Por defecto NO está seleccionado ninguno (o está seleccionado el menos destructivo)
- [ ] La opción elegida se envía como query param `scope` correcto
- [ ] Después de eliminar, React Query invalida las queries relevantes
- [ ] La lista de transacciones se actualiza inmediatamente
- [ ] No hay loading spinner que quede colgado

### Funcional - Happy Path

**Setup:** un usuario con 1 cuenta y 1 hogar donde es miembro.

**Caso 1: Borrar transacción personal**

1. Cargo una transacción SIN asociar a hogar
2. Click en eliminar
3. Modal simple aparece
4. Click "Eliminar"
- [ ] La transacción desaparece de la lista
- [ ] El saldo de la cuenta se restaura

**Caso 2: Borrar transacción del hogar (scope=household)**

1. Cargo transacción asociada al hogar
2. Click en eliminar
3. Modal con 2 opciones aparece
4. Selecciono "Sacar solo del hogar"
5. Click "Confirmar"
- [ ] La transacción sigue en mi dashboard personal
- [ ] La transacción NO aparece en el dashboard del hogar
- [ ] El saldo de mi cuenta NO cambió (sigue afectada)
- [ ] La liquidación del hogar no incluye esta transacción

**Caso 3: Borrar transacción completamente (scope=personal cascada)**

1. Cargo transacción asociada al hogar
2. Click en eliminar
3. Modal con 2 opciones aparece
4. Selecciono "Eliminar completamente"
5. Click "Confirmar"
- [ ] La transacción desaparece de mi dashboard personal
- [ ] La transacción desaparece del dashboard del hogar
- [ ] El saldo de mi cuenta se restaura
- [ ] La liquidación del hogar se actualiza

### Funcional - Edge Cases

- [ ] **Borrar transferencia** (entre 2 cuentas mías):
  - Se borran ambas patas (SOURCE + DESTINATION)
  - Los saldos de ambas cuentas se restauran
  - Si la transferencia estaba en un hogar, también se quita del hogar
  
- [ ] **Borrar transacción de plan de cuotas:**
  - Verificar el comportamiento esperado (ver código actual)
  - Si plan tiene tx editable bloqueada → 422 `InstalmentPlanTransactionEditNotAllowed`
  
- [ ] **Borrar transacción de otro usuario** (con la misma URL):
  - 403, no se borra nada
  
- [ ] **Borrar dos veces la misma transacción:**
  - Primera vez: éxito
  - Segunda vez: 404 (ya está marcada como deleted)
  
- [ ] **Scope inválido** (`scope=foobar`):
  - 422 con mensaje claro

### Regresión

- [ ] Crear transacción sigue funcionando
- [ ] Editar transacción sigue funcionando
- [ ] Listar transacciones sigue funcionando
- [ ] Analytics personal sigue funcionando
- [ ] Analytics del hogar sigue funcionando
- [ ] Importación bancaria sigue funcionando (también borra correctamente)

### UX

- [ ] El texto del modal es en español, claro y no técnico
- [ ] Si el modal tiene 2 opciones, las descripciones explican bien la diferencia
- [ ] El usuario entiende sin leer ayuda externa qué hace cada opción
- [ ] No hay tipos en el texto
- [ ] Los botones del modal son distinguibles (cancelar suave, eliminar destructivo)

---

## 🎯 Test de fuego

**Escenario realista:**

Como María (usuaria del hogar), te das cuenta que cargaste un gasto en el hogar familiar que en realidad fue solo tuyo:

1. Vas a la lista de transacciones del hogar
2. Encontrás el gasto mal clasificado
3. Click en "Eliminar"
4. El modal te ofrece sacarla del hogar SIN perderla del personal
5. Confirmás
6. En tu personal, el gasto sigue ahí (perfecto)
7. En el hogar, ya no aparece
8. La liquidación del hogar se actualizó

**Tildá si todo el flujo es intuitivo:** [ ]

---

## 📊 Reporte de QA

```markdown
# QA Report — F02: Borrado Granular

Fecha: YYYY-MM-DD
Branch: feature/F02-borrado-granular
Commit: abcd1234

## Resultado: ✅ / ❌

## Tests
- Antes: 123 ✅
- Después: 128+ ✅ (5 nuevos mínimo)

## Verificación específica
- Backend: X/X items ✅
- Tests automatizados: 5/5 ✅
- Frontend: X/X items ✅
- Happy path 1 (personal): ✅
- Happy path 2 (sacar del hogar): ✅
- Happy path 3 (eliminación completa): ✅
- Edge cases: X/X items ✅
- Regresión: ✅

## Notas
[Observaciones]

## Listo para merge: SÍ / NO
```

---

## 🚨 Problemas comunes en esta feature

### Problema: el saldo se restaura mal cuando se borra una transacción del hogar
**Causa probable:** confusión entre los scopes. Recordá: borrar del hogar **NO** debe afectar saldos personales (la transacción sigue viva en personal).

### Problema: las transferencias rompen el flow de borrado
**Verificar:** el endpoint maneja correctamente que una transferencia son DOS rows (SOURCE + DESTINATION). Si se borra una, también la otra.

### Problema: el modal no se cierra después de confirmar
**Solución típica:** después de la mutación exitosa, llamar a `onClose()` o setear el estado del modal a cerrado.

### Problema: la lista no se actualiza
**Causa:** falta de invalidación de React Query. Verificar que `invalidateFinancialData()` se llame.
