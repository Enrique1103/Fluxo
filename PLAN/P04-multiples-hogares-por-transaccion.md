# P04 — Prompt para Claude Code: Múltiples Hogares por Transacción

> **Sesión NUEVA. Rama `feature/F04-multi-household-tx`.**
> Esta feature toca el modelo Transaction. **Backups antes de empezar.**

---

## CONTEXTO DEL PROYECTO

Fluxo: finanzas personales uruguaya. FastAPI + PostgreSQL + React 19. 123+ tests.

**ANTES de codear:**

1. Leé:
   - `docs/plan/01-PRINCIPIOS-INMUTABLES.md`
   - `docs/plan/02-ARQUITECTURA-Y-PATRONES.md`
   - `docs/plan/03-CONVENCIONES-DE-CODIGO.md`
   - `docs/plan/features/F04-multiples-hogares-por-transaccion.md`

2. Resumime 3 puntos por archivo.

3. Esperá mi confirmación.

---

## FEATURE A IMPLEMENTAR

**F04 — Múltiples Hogares por Transacción**

Hoy una transacción se asocia a UN hogar (campo `household_id`). Necesitamos que se asocie a 0, 1 o N hogares mediante una tabla intermedia.

---

## REGLAS INMUTABLES PARA ESTA FEATURE

1. **Compatibilidad backward total durante la transición.**
   El campo `Transaction.household_id` se mantiene legacy. **NO lo borres.** Una migración futura lo eliminará cuando todo el código use la nueva relación.

2. **Validación de membresía OBLIGATORIA.**
   No se puede asociar una transacción a un hogar donde el creador no es miembro activo.

3. **El monto NO se divide entre hogares.**
   Si una transacción de $500 está en 2 hogares, cada hogar la cuenta como $500 (no como $250 cada uno).

4. **Personal es siempre fuente de verdad (P6).**
   Asociar a hogares NO saca la transacción del personal.

5. **Por defecto, NO está en ningún hogar.**
   Hoy seguramente algo se asocia automáticamente. Revisar y corregir si hace falta.

6. **Migración cuidadosa de datos existentes:**
   Toda transacción con `household_id != NULL` se convierte en una fila en `transaction_households`.

7. **Eliminar miembro del hogar NO borra las transacciones del hogar.**
   Las transacciones se mantienen como histórico.

---

## ARCHIVOS QUE PODÉS TOCAR

### Backend - Crear

```
backend/app/models/transaction_household.py  (nueva tabla intermedia)
backend/alembic/versions/XXXX_add_transaction_households.py
backend/tests/test_transaction_households.py  (o agregar a test_transactions.py)
```

### Backend - Modificar

```
backend/app/models/transaction.py     → agregar relationship household_links
backend/app/models/household.py       → agregar relationship transaction_links
backend/app/schemas/transaction.py    → reemplazar household_id por household_ids (lista)
backend/app/services/transaction_service.py  → manejar lista
backend/app/services/household_analytics_service.py  → queries con JOIN
backend/app/crud/transaction_crud.py  → si hace falta
backend/app/api/v1/transactions.py    → endpoint para gestionar asociaciones
backend/tests/test_transactions.py    → agregar tests nuevos
```

### Backend - NO TOCAR

```
backend/app/models/user.py
backend/app/models/account.py
Otros modelos no relacionados
Migraciones ya aplicadas
```

### Frontend - Modificar

```
frontend/src/components/TransactionModal.tsx  → selector múltiple de hogares
frontend/src/types/transaction.ts             → tipos
frontend/src/api/dashboard.ts (o donde estén transactions) → adaptar
```

---

## CRITERIOS DE COMPLETITUD

### Backend

- [ ] Modelo `TransactionHousehold` creado
- [ ] Modelos `Transaction` y `Household` con relationships nuevos
- [ ] Migración Alembic ejecutable:
  - Crea tabla `transaction_households`
  - Migra datos: transactions con `household_id != NULL` → filas en tabla intermedia
  - NO elimina `Transaction.household_id` (legacy)
- [ ] Schema `TransactionCreate` tiene `household_ids: list[int]`
- [ ] Schema `TransactionCreate` AÚN acepta `household_id: int` para backward compat
- [ ] Service valida que TODOS los `household_ids` sean hogares donde el user es miembro activo
- [ ] Service maneja correctamente:
  - Lista vacía → transacción sin hogares
  - Lista con 1 ID → como antes
  - Lista con N IDs → asocia a todos
- [ ] Endpoint POST `/transactions` acepta lista
- [ ] Endpoint nuevo `PUT /transactions/{id}/households` para gestionar asociaciones
- [ ] `household_analytics_service` usa JOIN con `transaction_households`
- [ ] 10+ tests nuevos cubriendo:
  1. Crear sin hogares
  2. Crear con 1 hogar
  3. Crear con múltiples hogares
  4. Crear con hogar no miembro → 403
  5. Crear con membresía PENDING → 403
  6. Update household_ids (reemplaza completamente)
  7. Remove de un hogar específico (DELETE /transactions/{tx}/households/{hh})
  8. Delete transacción cascadea associations
  9. Analytics cuenta transacción en cada hogar asociado
  10. Backward compat: `household_id` singular sigue funcionando
- [ ] `pytest backend/tests/` pasa al 100%

### Frontend

- [ ] `TransactionModal` muestra checkboxes de los hogares del usuario
- [ ] Si el usuario no tiene hogares, la sección NO se muestra
- [ ] Vista de transacción muestra los hogares asociados como tags/badges
- [ ] `npm run build` sin errores

---

## FORMATO DE TRABAJO

### SPRINT 1 — Backend

#### Paso 1.1: Análisis previo

1. Mostrame el modelo `Transaction` actual completo
2. Mostrame el modelo `Household` actual completo
3. Mostrame cómo se setea `household_id` hoy en el service (busca "household_id" en service)
4. Mostrame cómo el endpoint actual valida `household_id` (membresía, etc.)
5. Esperá aprobación

#### Paso 1.2: Modelo intermedio + Migración

1. Crear `models/transaction_household.py`:
   - PK compuesta (transaction_id, household_id)
   - FKs con `ondelete='CASCADE'`
   - Timestamp `added_at`
2. Agregar relationships a `Transaction` y `Household`
3. **NO eliminar** `Transaction.household_id`
4. Generar migración: `alembic revision --autogenerate -m "add transaction_households junction"`
5. Editar la migración para incluir el INSERT de migración de datos existentes:
   ```sql
   INSERT INTO transaction_households (transaction_id, household_id, added_at)
   SELECT id, household_id, COALESCE(created_at, NOW())
   FROM transactions
   WHERE household_id IS NOT NULL AND is_deleted = FALSE
   ```
6. Aplicar: `alembic upgrade head`
7. Verificar con query: cuántas filas hay en `transaction_households` debería matchear cuántas transactions tenían household_id
8. Mostrame todo + outputs
9. Esperá aprobación

#### Paso 1.3: Schemas

1. Actualizar `TransactionCreate`, `TransactionUpdate`, `TransactionRead`
2. Agregar `household_ids: list[int] = Field(default_factory=list)`
3. Mantener `household_id: int | None = None` como deprecated (compatibilidad)
4. En `TransactionRead`, exponer la lista de hogares asociados
5. Mostrame los schemas
6. Esperá aprobación

#### Paso 1.4: Service

1. Modificar `transaction_service.create()`:
   - Obtener lista combinada de IDs (usar `household_ids` si está, sino caer en `household_id` legacy)
   - Validar TODOS los IDs son hogares con membresía activa
   - Crear transacción
   - Crear filas en `transaction_households` por cada ID
2. Crear método `update_household_associations(db, tx_id, user, household_ids)`:
   - Reemplaza completamente la lista
   - Validar membresías
3. Modificar `transaction_service.soft_delete()` con scope=PERSONAL → cascada borra todas las associations (verificar que `cascade='all, delete-orphan'` lo haga automático o hacerlo manual)
4. Mostrame los métodos modificados
5. Esperá aprobación

#### Paso 1.5: Endpoints

1. Endpoint POST `/transactions` ya acepta `household_ids` por el schema, verificar
2. Crear endpoint `PUT /transactions/{tx_id}/households` que reemplaza la lista
3. Crear endpoint `DELETE /transactions/{tx_id}/households/{hh_id}` (quita de un hogar específico)
4. Mostrame los endpoints
5. Esperá aprobación

#### Paso 1.6: Analytics

1. Modificar `household_analytics_service` para usar JOIN:
   ```python
   query = db.query(Transaction).join(
       TransactionHousehold,
       TransactionHousehold.transaction_id == Transaction.id
   ).filter(TransactionHousehold.household_id == household_id, ...)
   ```
2. Verificar que sigue funcionando con hogares pre-migración
3. Mostrame los cambios
4. Esperá aprobación

#### Paso 1.7: Tests

1. Implementar los 10+ tests del checklist
2. Correr: `pytest backend/tests/ -v`
3. Pegame el output completo
4. Esperá aprobación

---

### SPRINT 2 — Frontend

#### Paso 2.1: Tipos

1. Actualizar `types/transaction.ts` con `household_ids: number[]`
2. Tipo `Household` no cambia significativamente
3. Esperá aprobación

#### Paso 2.2: TransactionModal

1. Cargar los hogares del usuario al abrir modal
2. Si no tiene hogares → no mostrar sección
3. Si tiene hogares → checkboxes (multi-select) con sus nombres
4. Por defecto: ningún hogar seleccionado
5. Al guardar, mandar `household_ids` al backend
6. Mostrame el componente completo
7. Esperá aprobación

#### Paso 2.3: Vista de transacción

1. En la lista de transacciones, mostrar tags con los hogares asociados
2. Cada tag con el color/nombre del hogar
3. Si la transacción NO está en ningún hogar, no mostrar tags
4. Esperá aprobación

#### Paso 2.4: Verificación

1. `npm run build`
2. Testing manual:
   - Crear transacción sin hogares
   - Crear transacción con 1 hogar
   - Crear transacción con 2+ hogares
   - Editar para cambiar la lista
   - Borrar transacción → debe cascadear
3. Reportame outputs

---

## PROHIBICIONES EXPLÍCITAS

- ❌ NO elimines `Transaction.household_id`. Es legacy, se elimina en una migración futura.
- ❌ NO permitas asociar transacciones a hogares donde el user no es miembro activo.
- ❌ NO dividas el monto entre hogares. Cada hogar cuenta el monto completo.
- ❌ NO automatices la asociación a hogares. Es opt-in explícito.
- ❌ NO toques otros modelos no relacionados.
- ❌ NO uses `cascade='all, delete-orphan'` sin entender qué hace. Pedíme si dudás.

---

## EN CASO DE DUDA

Dudas válidas:
- *"El campo `household_id` legacy, ¿lo seteo en NULL cuando se crea con la nueva lista, o lo mantengo para casos donde hay 1 solo hogar?"*
- *"En el modelo, ¿uso `secondary` de SQLAlchemy o defino la tabla intermedia explícitamente?"*

Para la pregunta 1, mi respuesta tentativa: **mantenelo seteado con el primer hogar de la lista** (si hay alguno) durante la transición. Cuando todo el código nuevo use la relación, en una migración futura se elimina.

Para la pregunta 2: **definí la tabla intermedia explícitamente** como modelo, para tener acceso al campo `added_at`. NO uses `secondary` (es para asociaciones puras sin metadatos).

¿Listo? Empezá por SPRINT 1 PASO 1.1.
