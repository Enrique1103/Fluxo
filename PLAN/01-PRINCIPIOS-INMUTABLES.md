# ⚖️ Principios Inmutables de Fluxo

> **Estas reglas NO se negocian.**
> Si una feature las rompe, se rediseña la feature, no se rompe la regla.
> Si Claude Code las viola, se rechaza el código sin importar qué tan bien escrito esté.

---

## 🔒 Principios de Datos y Seguridad

### P1. Aislamiento de datos entre usuarios

**Regla:** Ningún usuario accede a datos de otro usuario, salvo a través de los mecanismos de hogares (HouseholdMember activo).

**Implementación obligatoria:**
- Toda consulta CRUD filtra por `user_id = current_user.id`
- Las excepciones legítimas son exclusivamente:
  - Endpoints bajo `/admin/*` (con token de admin)
  - Endpoints de hogar, donde el filtro es `household.members contains current_user`

**Anti-ejemplo prohibido:**
```python
# ❌ NUNCA
def get_transaction(db, tx_id):
    return db.query(Transaction).filter(Transaction.id == tx_id).first()

# ✅ SIEMPRE
def get_transaction(db, tx_id, user_id):
    return db.query(Transaction).filter(
        Transaction.id == tx_id,
        Transaction.user_id == user_id
    ).first()
```

### P2. La capa CRUD nunca hace commit

**Regla:** Solo los servicios pueden hacer `db.commit()`. La capa CRUD usa `db.add()`, `db.flush()` cuando necesite el ID generado, y retorna objetos ORM.

**Razón:** Las operaciones de negocio frecuentemente involucran múltiples cambios que deben ser atómicos. Si el CRUD hace commit, las operaciones complejas pueden quedar inconsistentes.

**Anti-ejemplo prohibido:**
```python
# ❌ NUNCA en crud/
def create(db, data):
    obj = Transaction(**data)
    db.add(obj)
    db.commit()  # ← prohibido en CRUD
    return obj

# ✅ Correcto en crud/
def create(db, data):
    obj = Transaction(**data)
    db.add(obj)
    db.flush()  # solo para obtener ID generado si hace falta
    return obj
```

### P3. Soft delete sobre hard delete (con excepciones explícitas)

**Regla:** Las entidades con valor histórico usan soft delete (`is_deleted`, `deleted_at`).

**Entidades con soft delete obligatorio:**
- Transactions
- Accounts
- FinGoals

**Entidades donde se permite hard delete:**
- Categories y Concepts custom (con validación de no estar en uso)
- ExchangeRates (los corrige el usuario)
- HouseholdInvites expirados (limpieza periódica)

### P4. Las contraseñas se hashean con bcrypt

**Regla:** Las contraseñas nunca se almacenan en texto plano. La validación se hace exclusivamente con bcrypt vía passlib.

**Validaciones en registro/cambio:**
- Mínimo 8 caracteres, máximo 20
- Al menos: 1 mayúscula, 1 minúscula, 1 dígito, 1 carácter especial `@$!%*?&`

### P5. La autenticación pasa por JWT con revocación

**Regla:** Toda petición autenticada verifica:
1. Firma JWT válida (HS256)
2. Token no expirado
3. Token no revocado (consulta a `revoked_tokens`)

**Razón:** Sin verificación de revocación, el logout no es efectivo. Un atacante con un token robado podría usarlo hasta que expire.

---

## 🧱 Principios de Modelo de Datos

### P6. Personal es la fuente de verdad

**Regla:** Toda transacción **siempre** pertenece a un usuario individual (`user_id` no es nullable). El hogar es una capa de análisis encima del personal, no un reemplazo.

**Consecuencias prácticas:**
- Borrar una transacción del personal cascadea a todos los hogares donde aparece.
- Borrar una transacción de un hogar **no** la borra del personal ni de otros hogares.
- Si un usuario sale de un hogar, sus transacciones siguen vivas en su personal.

### P7. Una transacción siempre tiene un pagador

**Regla:** El campo `user_id` en `Transaction` es el "pagador real". No se admite transacciones sin pagador.

**Razón:** La pregunta "¿quién pagó?" es fundamental para cualquier cálculo de deuda o liquidación. Sin pagador definido, el sistema no puede liquidar.

### P8. Transferencias internas no son gastos ni ingresos

**Regla:** Las transferencias entre cuentas del mismo usuario tienen `transfer_role` (SOURCE / DESTINATION) y NO cuentan como gastos ni ingresos en los análisis.

**Implementación:**
- `get_all_by_user()` excluye los registros con `transfer_role == DESTINATION`
- `get_all_by_account()` muestra ambas patas (para que el extracto de la cuenta sea correcto)

### P9. Las monedas se manejan con valores absolutos en la cuenta de su moneda

**Regla:** Las cuentas tienen una moneda (`currency`). Sus saldos están en esa moneda. Las conversiones a otra moneda solo ocurren en la capa de análisis usando `ExchangeRate`.

**Anti-ejemplo prohibido:**
```python
# ❌ NUNCA
account_usd.balance += amount_uyu * tasa_cambio  # mezcla de monedas

# ✅ Correcto
if transaction.currency != account.currency:
    raise CurrencyMismatchError
account.balance += amount
```

### P10. Las transacciones en USD requieren tasa de cambio del mes

**Regla:** Crear una transacción en una cuenta USD sin tener una tasa de cambio cargada para ese mes → error 422.

**Razón:** Sin tasa, el sistema no puede calcular patrimonios consolidados ni reportes en UYU.

**Fallback permitido:** Si no hay tasa del mes actual, se usa la última disponible (lógica en `exchange_rate_crud.get_most_recent_for_pair_up_to`).

---

## 🎭 Principios de Negocio

### P11. Las categorías y conceptos del sistema son inmutables

**Regla:** Las entidades `is_system=True` NO se pueden modificar ni eliminar por usuarios. Solo el seed inicial las crea.

**Razón:** El sistema depende de ciertas categorías base para el funcionamiento. Si un usuario las borra, los reportes se rompen.

**Validación obligatoria en cada endpoint de modificación:**
```python
if entity.is_system:
    raise SystemEntityCannotBeModified
```

### P12. La auto-categorización aprende pero NO sobrescribe decisiones del usuario

**Regla:** Cuando un usuario asigna categoría manualmente a una transacción importada, esa decisión se guarda en `ReglaCategorias` con `confianza=0.90` para futuras importaciones. Pero NUNCA se sobrescribe una asignación manual del usuario.

**Razón:** El usuario tiene siempre la última palabra. El sistema sugiere; el usuario decide.

### P13. La deduplicación de importación tiene 3 fases, todas obligatorias

**Regla:** Toda importación pasa por:
1. **Fase 1 (exacto):** Hash SHA-256 de `(fecha|concepto|monto|cuenta_id)` vs DB → estado `duplicado`
2. **Fase 2 (batch):** Mismo hash dos veces en el mismo archivo → estado `duplicado`
3. **Fase 3 (suave):** Misma `(fecha, monto)` en DB con descripción distinta → estado `advertencia` (no bloquea)

**No se permite saltar fases ni cambiar el orden.**

### P14. Los presupuestos son alertas, no restricciones

**Regla:** Si un usuario configura un tope de presupuesto y lo supera, el sistema **alerta** pero **NO impide** registrar la transacción.

**Razón:** El software debe registrar la realidad. Si impide registrar gastos reales por superar un presupuesto, el usuario abandonará el sistema y perderá el dato.

### P15. El hogar es opt-in para cada transacción

**Regla:** Una transacción que se carga es personal por defecto. Solo si el usuario explícitamente marca "este gasto es del hogar X", entra al análisis del hogar.

**Anti-ejemplo prohibido:** Auto-clasificar transacciones como "del hogar" basándose en heurísticas. El usuario decide.

---

## 🧪 Principios de Calidad

### P16. Toda feature nueva tiene tests automatizados

**Regla:** Una feature no se considera completa hasta que tiene tests que cubran:
- Happy path (caso exitoso)
- Validaciones (errores esperados con códigos HTTP correctos)
- Aislamiento (usuario A no accede a datos de B)
- Edge cases relevantes (límites, valores extremos)

**Criterio de aceptación:** `pytest` debe pasar al 100% antes de mergear.

### P17. Los tests NO usan datos compartidos entre tests

**Regla:** Cada test crea sus propios datos. La fixture `reset_db` borra y recrea la DB entre tests. Cualquier dependencia entre tests está prohibida.

**Razón:** Si los tests dependen entre sí, el orden de ejecución importa, los flaky tests aparecen, y el debugging se vuelve infierno.

### P18. Las migraciones son irreversibles en producción

**Regla:** Una vez que una migración Alembic se aplicó en producción, NO se modifica. Si hay que corregir algo, se crea una nueva migración.

**Razón:** Modificar migraciones aplicadas rompe entornos donde ya corrió.

### P19. Los mensajes de error son en español y comprensibles

**Regla:** Todos los `detail` de excepciones HTTP están en español y son comprensibles para un usuario no técnico.

**Anti-ejemplos prohibidos:**
- ❌ `"ValidationError: field 'amount' has invalid type"`
- ❌ `"IntegrityError: UNIQUE constraint failed"`
- ❌ `"AssertionError"`

**Ejemplos correctos:**
- ✅ `"El monto debe ser un número mayor a cero"`
- ✅ `"Ya existe una cuenta con ese nombre"`
- ✅ `"No tenés permisos para modificar esta categoría"`

---

## 🚪 Principios de API y Frontend

### P20. La API versiona con prefijo `/v1/`

**Regla:** Todas las rutas tienen prefijo `/api/v1/`. Cambios breaking generan una nueva versión `/v2/`.

### P21. Los endpoints retornan códigos HTTP semánticos

**Regla:** Los códigos HTTP siguen el siguiente mapeo estricto:

| Código | Cuándo |
|---|---|
| 200 | OK (GET, PUT, PATCH) |
| 201 | Created (POST que crea recursos) |
| 204 | No Content (DELETE exitoso) |
| 400 | Datos malformados (Pydantic) |
| 401 | Token inválido/expirado/revocado |
| 403 | Acceso a recurso ajeno o falta de permisos |
| 404 | Recurso no encontrado |
| 409 | Conflicto (duplicados) |
| 410 | Recurso expirado (invites) |
| 422 | Violación de regla de negocio |
| 500 | Error no controlado |

### P22. El frontend no asume estructura de respuestas

**Regla:** El frontend valida los schemas que recibe del backend antes de usarlos. No se accede a campos asumiendo que existen.

### P23. El estado global solo guarda lo que persiste

**Regla:** El `authStore` (Zustand) solo guarda token e `isAdmin`. Datos como cuentas, transacciones, hogares NO van al estado global — son responsabilidad de React Query.

**Razón:** React Query maneja cache, invalidación, refetch automático. Duplicar esos datos en Zustand crea inconsistencias.

---

## 🔄 Principios de Cambio

### P24. Toda modificación de modelo requiere migración Alembic

**Regla:** Si tocás un modelo SQLAlchemy, generás una migración. Si no, el modelo y la DB divergen.

**Flujo obligatorio:**
```bash
alembic revision --autogenerate -m "descripción del cambio"
# Revisar la migración generada
alembic upgrade head
```

### P25. Las features grandes se dividen en commits pequeños

**Regla:** Cada commit es atómico y deja el código en estado funcional (tests pasan). NO se hacen commits gigantes que tocan 50 archivos.

**Razón:** Facilita revisión, rollback y debugging.

### P26. Los cambios en endpoints requieren actualización del frontend

**Regla:** Si cambia el schema de un endpoint, el frontend que lo consume se actualiza en el mismo commit (o se rompe la app).

**Excepción:** Endpoints solo agregan campos nuevos a las respuestas (frontend ignora lo que no usa).

---

## ⛔ Lo que Claude Code NO PUEDE hacer JAMÁS

1. **Eliminar o modificar tests existentes sin permiso explícito.** Los tests son contratos del sistema.

2. **Cambiar la estructura de modelos sin generar migración Alembic.**

3. **Hacer `db.commit()` en la capa CRUD.**

4. **Saltarse el filtrado por `user_id` en queries.**

5. **Modificar `is_system=True` desde código de usuario.**

6. **Almacenar contraseñas en texto plano.**

7. **Crear endpoints sin prefijo `/api/v1/`.**

8. **Retornar mensajes de error en inglés o con stack traces.**

9. **Hard-deletear transactions, accounts o fin_goals.**

10. **Asumir estructura de archivos bancarios sin validación.**

11. **Sobrescribir decisiones manuales del usuario con auto-categorización.**

12. **Bloquear el registro de una transacción real por superar un presupuesto.**

13. **Implementar features que NO estén documentadas en `features/F0X-*.md`.**

14. **Modificar este archivo de principios inmutables.**

---

## ✅ Cómo verificar que estos principios se cumplen

Antes de aceptar código generado por Claude Code, verificar manualmente:

- [ ] ¿Todas las queries filtran por `user_id` (o están bajo `/admin/*`)?
- [ ] ¿La capa CRUD evita `db.commit()`?
- [ ] ¿Hay migración Alembic si tocó modelos?
- [ ] ¿Los tests nuevos están escritos?
- [ ] ¿Los tests existentes siguen pasando?
- [ ] ¿Los códigos HTTP son los correctos según la tabla P21?
- [ ] ¿Los mensajes de error son en español y comprensibles?
- [ ] ¿La feature está documentada en `features/`?

---

> **Próximo paso:** lee `02-ARQUITECTURA-Y-PATRONES.md` para entender los patrones SOLID aplicados a Fluxo.
