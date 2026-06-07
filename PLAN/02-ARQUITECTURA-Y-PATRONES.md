# 🏛️ Arquitectura y Patrones de Fluxo

> **Este documento define cómo se estructura el código.**
> Se aplica a TODO el código nuevo. El código viejo que no lo cumple, se refactoriza progresivamente.

---

## 🧭 Arquitectura general: capas

Fluxo sigue una arquitectura de **4 capas** en backend, con responsabilidades claras y separadas:

```
┌─────────────────────────────────────────────────────────────┐
│  Capa 1: API (Routers)                                      │
│  → Recibe HTTP, valida con Pydantic, llama al servicio      │
│  → NO contiene lógica de negocio                            │
│  → Maneja conversión de excepciones a HTTP responses        │
├─────────────────────────────────────────────────────────────┤
│  Capa 2: Services                                           │
│  → Contiene la lógica de negocio                            │
│  → Orquesta llamadas a CRUD                                 │
│  → ES DUEÑO DEL COMMIT (db.commit() solo aquí)              │
│  → Valida reglas de negocio                                 │
│  → Lanza excepciones de dominio                             │
├─────────────────────────────────────────────────────────────┤
│  Capa 3: CRUD                                               │
│  → Acceso directo a la DB                                   │
│  → Métodos simples: create, get, update, soft_delete        │
│  → NUNCA hace commit                                        │
│  → Retorna objetos ORM o None                               │
├─────────────────────────────────────────────────────────────┤
│  Capa 4: Models (SQLAlchemy)                                │
│  → Define la estructura de tablas                           │
│  → Define relaciones, constraints, índices                  │
│  → Puede tener métodos puros (sin acceso a DB)              │
└─────────────────────────────────────────────────────────────┘
```

**Regla de oro:** las capas se llaman **hacia abajo** únicamente. Un router puede llamar a un service. Un service puede llamar a un CRUD. **Un CRUD nunca llama a un service.**

---

## 🎯 Principios SOLID aplicados a Fluxo

### S — Single Responsibility Principle

**Cada clase y función tiene una sola razón para cambiar.**

#### En Fluxo:

- Un **service** maneja UN dominio (ej: `transaction_service` solo se ocupa de transacciones).
- Un **CRUD** maneja UNA entidad (ej: `transaction_crud` solo accede a la tabla `transactions`).
- Un **schema Pydantic** tiene UN propósito (`TransactionCreate` para crear, `TransactionRead` para leer).

#### Anti-ejemplo prohibido:
```python
# ❌ Service "God class" que mezcla responsabilidades
class FinanceService:
    def create_transaction(...): ...
    def create_account(...): ...
    def send_email_notification(...): ...
    def parse_bank_csv(...): ...
    def calculate_household_split(...): ...

# ✅ Servicios separados por responsabilidad
class TransactionService: ...
class AccountService: ...
class NotificationService: ...
class ImportacionService: ...
class HouseholdAnalyticsService: ...
```

#### Cuándo dividir un service:

Si tu service tiene más de **400 líneas** o **15 métodos públicos**, está pidiendo ser dividido. Identificá las responsabilidades distintas y separá.

**Excepción justificada:** `importacion_service.py` tiene ~1900 líneas porque encapsula la lógica de 10 parsers distintos. Aún así, el plan de refactor lo divide.

---

### O — Open/Closed Principle

**Las entidades están abiertas a extensión pero cerradas a modificación.**

#### En Fluxo:

Los **parsers bancarios** son el ejemplo perfecto. Cada banco extiende una interfaz común sin modificar el código existente:

```python
# Interfaz abstracta
class BankParser(ABC):
    @abstractmethod
    def parse(self, content: bytes) -> list[MovimientoCrudo]:
        ...

# Implementación concreta para cada banco
class ParserBrou(BankParser):
    def parse(self, content: bytes) -> list[MovimientoCrudo]:
        # lógica específica de BROU
        ...

class ParserItau(BankParser):
    def parse(self, content: bytes) -> list[MovimientoCrudo]:
        # lógica específica de Itaú
        ...
```

**Agregar un banco nuevo** = crear una clase nueva, NO modificar las existentes.

#### Anti-ejemplo prohibido:
```python
# ❌ Modificar código existente cada vez que entra un banco nuevo
def parse_bank(banco: str, content: bytes):
    if banco == "BROU":
        # lógica BROU
    elif banco == "Itau":
        # lógica Itau
    elif banco == "Santander":  # ← agregás aquí cada vez
        # lógica Santander
```

---

### L — Liskov Substitution Principle

**Las subclases deben ser sustituibles por sus clases base sin romper el comportamiento.**

#### En Fluxo:

Si tenemos `BankParser` como base, **cualquier subclase** debe poder ser usada donde se espera un `BankParser` sin sorpresas.

#### Regla práctica:

Todos los parsers bancarios retornan **la misma estructura** (`list[MovimientoCrudo]`). Si un parser inventa su propio formato de retorno, rompe el principio.

```python
# ✅ Correcto: todos retornan el mismo tipo
def procesar(parser: BankParser, content: bytes):
    movimientos = parser.parse(content)  # funciona con cualquier parser
    for m in movimientos:
        # m tiene siempre los mismos campos
        ...

# ❌ Mal: un parser retorna algo distinto
class ParserRaro(BankParser):
    def parse(self, content: bytes) -> dict:  # ← rompe LSP
        return {"movs": [...]}
```

---

### I — Interface Segregation Principle

**Mejor muchas interfaces pequeñas y específicas que una grande.**

#### En Fluxo:

Los **schemas Pydantic** ilustran esto:

```python
# ✅ Schemas específicos por propósito
class TransactionCreate(BaseModel):
    account_id: int
    amount: Decimal
    type: TransactionType
    concept_id: int
    # ... solo lo necesario para crear

class TransactionUpdate(BaseModel):
    amount: Decimal | None = None
    description: str | None = None
    # ... solo lo modificable

class TransactionRead(BaseModel):
    id: int
    account_id: int
    amount: Decimal
    type: TransactionType
    balance_after: Decimal
    # ... lo que se expone al cliente
```

#### Anti-ejemplo prohibido:
```python
# ❌ Un schema gigante que sirve para todo
class TransactionSchema(BaseModel):
    id: int | None = None
    account_id: int | None = None
    amount: Decimal | None = None
    # ... 30 campos opcionales que nunca se sabe cuáles son necesarios
```

---

### D — Dependency Inversion Principle

**Los módulos de alto nivel no dependen de los de bajo nivel. Ambos dependen de abstracciones.**

#### En Fluxo:

Los **services no instancian CRUDs directamente**. La sesión `db` se pasa por parámetro (FastAPI Depends).

```python
# ✅ Correcto
def create_transaction(db: Session, user: User, data: TransactionCreate):
    # service usa el db que le pasaron
    tx = transaction_crud.create(db, data, user.id)
    db.commit()
    return tx

# ❌ Mal: service crea su propia conexión
def create_transaction(user: User, data: TransactionCreate):
    db = SessionLocal()  # ← acopla al service con la implementación
    ...
```

**FastAPI Depends** es nuestro mecanismo de inyección de dependencias:

```python
@router.post("/transactions")
def create_transaction(
    data: TransactionCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user)
):
    return transaction_service.create(db, user, data)
```

---

## 🧩 Patrones de diseño que SE USAN en Fluxo

### Repository Pattern (CRUD)

Cada archivo en `app/crud/` es un repository de una entidad. Encapsula el acceso a DB.

**Cuándo crear un nuevo CRUD:**
- Cuando agregás una entidad nueva (modelo nuevo)
- Cuando tenés queries complejas que se repiten

**Cuándo NO crear:**
- Para una query única que solo se usa en un lugar (queda en el service directamente)

### Service Layer

Cada archivo en `app/services/` orquesta operaciones de negocio.

**Cuándo crear un nuevo service:**
- Cuando una operación toca múltiples entidades
- Cuando hay validaciones de negocio complejas
- Cuando hay efectos secundarios (actualizar saldo, enviar SSE, etc.)

### Exception-based Error Handling

Las excepciones de dominio están en `app/exceptions/` y se mapean a HTTP en `app/main.py`.

```python
# En el service
if not account:
    raise AccountNotFound(account_id)

# En main.py
@app.exception_handler(AccountNotFound)
async def handle_account_not_found(request, exc):
    return JSONResponse(status_code=404, content={"detail": str(exc)})
```

### Strategy Pattern (en parsers e importación)

Los parsers bancarios siguen este patrón. La estrategia se selecciona en runtime según el banco detectado.

### Pub/Sub (eventos SSE)

`event_bus.py` implementa un patrón pub/sub con `asyncio.Queue`. Se usa para notificaciones en tiempo real.

---

## 🚫 Patrones que NO se usan (y razones)

### NO usar ORM relationships con lazy="dynamic"

**Razón:** Genera queries N+1 sin que te enteres. Mejor usar eager loading explícito (`selectinload`) cuando necesites relaciones.

### NO usar inheritance de SQLAlchemy con joined table

**Razón:** Complica las queries y el rendimiento. Si dos modelos tienen mucho en común, mejor extraer un mixin o un campo `type`.

### NO usar callbacks pre/post commit de SQLAlchemy

**Razón:** Esconde lógica que debería ser explícita en el service. Hace muy difícil debuggear.

### NO crear "Manager" classes globales

**Razón:** Tienden a convertirse en god classes. Mejor servicios pequeños y específicos.

---

## 📐 Estructura física del proyecto (backend)

```
backend/
├── app/
│   ├── api/                    # Capa 1: Routers
│   │   ├── v1/
│   │   │   ├── auth.py
│   │   │   ├── transactions.py
│   │   │   ├── accounts.py
│   │   │   ├── households.py
│   │   │   └── ...
│   │   └── deps.py             # get_current_user, get_db
│   │
│   ├── services/               # Capa 2: Lógica de negocio
│   │   ├── transaction_service.py
│   │   ├── household_service.py
│   │   ├── importacion_service.py
│   │   └── ...
│   │
│   ├── crud/                   # Capa 3: Acceso a DB
│   │   ├── transaction_crud.py
│   │   ├── account_crud.py
│   │   └── ...
│   │
│   ├── models/                 # Capa 4: Modelos ORM
│   │   ├── transaction.py
│   │   ├── account.py
│   │   ├── household.py
│   │   └── ...
│   │
│   ├── schemas/                # Schemas Pydantic
│   │   ├── transaction.py
│   │   ├── account.py
│   │   └── ...
│   │
│   ├── exceptions/             # Excepciones de dominio
│   │   ├── transaction_exceptions.py
│   │   ├── account_exceptions.py
│   │   └── ...
│   │
│   ├── core/                   # Utilities transversales
│   │   ├── config.py
│   │   ├── security.py         # JWT, hash, etc
│   │   ├── utils.py            # normalize_concept, slugify
│   │   └── database.py         # SessionLocal, engine
│   │
│   ├── parsers/                # Implementaciones de bancos
│   │   ├── base.py
│   │   ├── brou.py
│   │   ├── itau.py
│   │   └── ...
│   │
│   └── main.py                 # FastAPI app, exception handlers, CORS
│
├── alembic/
│   ├── versions/
│   └── env.py
│
└── tests/
    ├── conftest.py
    ├── test_transactions.py
    └── ...
```

**Regla:** Una clase/función se ubica en la carpeta de su capa. Si un service necesita helpers privados, van en el mismo archivo. Si los helpers se usan en múltiples services, van a `core/utils.py`.

---

## 🔄 Cómo agregar una feature nueva (paso a paso)

### Paso 1: Modelo
Si la feature requiere campos nuevos o tablas nuevas:
1. Modificar/crear archivo en `app/models/`
2. Generar migración: `alembic revision --autogenerate -m "..."`
3. Revisar la migración generada (Alembic a veces se equivoca)
4. Aplicarla: `alembic upgrade head`

### Paso 2: Schema
Crear schemas Pydantic correspondientes en `app/schemas/`:
- `XCreate` para POST
- `XUpdate` para PUT/PATCH (todos los campos opcionales)
- `XRead` para GET responses

### Paso 3: CRUD
Si la feature requiere queries nuevas, agregar funciones en `app/crud/`.
- Sin `db.commit()`
- Con filtro por `user_id` siempre que aplique

### Paso 4: Service
Implementar la lógica de negocio en `app/services/`:
- Validaciones que lanzan excepciones de dominio
- Orquestación de varias llamadas CRUD
- Commit al final

### Paso 5: Excepciones
Si hay nuevos tipos de error, crear en `app/exceptions/X_exceptions.py` y registrar en `main.py`.

### Paso 6: Router
Crear endpoint en `app/api/v1/`:
- Usar `Depends` para inyección
- Solo llamar al service
- NO lógica de negocio aquí

### Paso 7: Tests
Escribir tests en `backend/tests/test_X.py`:
- Happy path
- Validaciones (códigos HTTP correctos)
- Aislamiento entre usuarios
- Edge cases

### Paso 8: Frontend
Implementar UI correspondiente:
- API client en `frontend/src/api/`
- Componente/página en `frontend/src/`
- Manejo de cache con React Query

---

## 🎨 Arquitectura del Frontend

### Capas en frontend

```
┌────────────────────────────────────────────────────┐
│ Pages (frontend/src/pages/)                        │
│ → Rutas top-level, compone componentes             │
├────────────────────────────────────────────────────┤
│ Components (frontend/src/components/)              │
│ → Reusables, sin lógica de negocio                 │
├────────────────────────────────────────────────────┤
│ Hooks (frontend/src/hooks/)                        │
│ → useQuery, useMutation, lógica reusable           │
├────────────────────────────────────────────────────┤
│ API Client (frontend/src/api/)                     │
│ → Llamadas HTTP, agrupadas por recurso             │
├────────────────────────────────────────────────────┤
│ State Global (frontend/src/stores/)                │
│ → Zustand: solo auth                               │
└────────────────────────────────────────────────────┘
```

### Reglas del frontend

1. **Datos del servidor → React Query.** Nunca Zustand.
2. **Estado de UI temporal → useState local.** Nunca prop drilling profundo.
3. **Auth → Zustand con persistencia.** Solo token e `isAdmin`.
4. **Side effects (notificaciones SSE) → custom hooks.** Aislados.
5. **Componentes reusables NO hacen fetch.** Reciben datos por props.
6. **Páginas SÍ hacen fetch.** Son los "smart components".

---

## 🧪 Patrones de testing

### Estructura de un test típico

```python
class TestCreateTransaction:
    def test_expense_debits_account(self, authed, cash_account, seeds):
        client, headers = authed
        response = client.post(
            "/api/v1/transactions",
            json={
                "account_id": cash_account["id"],
                "concept_id": seeds["concept_id"],
                "amount": 100,
                "type": "expense",
                "date": "2026-05-24"
            },
            headers=headers
        )
        assert response.status_code == 201
        # Verificar efecto: saldo debe haber bajado
        account_response = client.get(
            f"/api/v1/accounts/{cash_account['id']}",
            headers=headers
        )
        assert account_response.json()["balance"] == 9900  # 10000 - 100
```

### Reglas de testing

1. **Un test verifica una sola cosa.** Si necesita más de 3 asserts diferentes, dividilo.
2. **Los tests son legibles.** Si no entiendo qué verifica leyendo el nombre + 5 líneas, está mal nombrado.
3. **Fixtures para setup, no para asserts.** Los fixtures preparan datos, no verifican comportamiento.
4. **Tests negativos son tan importantes como positivos.** Si testeás "el happy path funciona", también testeá "fallar correctamente cuando se viola X regla".

---

## 📊 Decisiones arquitectónicas críticas

### ¿Por qué SQLAlchemy y no Tortoise/SQLModel?

- SQLAlchemy es maduro, documentado, con comunidad enorme
- Permite raw SQL cuando hace falta performance
- Alembic es excelente para migraciones

### ¿Por qué FastAPI y no Django/Flask?

- Tipado con Python type hints
- Pydantic integrado para validación
- Performance asíncrono
- Documentación OpenAPI automática

### ¿Por qué React Query?

- Cache automático con invalidación
- Refetch en focus, en reconnect
- Loading/error states out of the box
- Elimina la necesidad de Redux para datos del servidor

### ¿Por qué Zustand?

- Más simple que Redux
- Sin boilerplate
- Funciona perfecto para casos chicos (auth)

### ¿Por qué Tailwind?

- Productividad alta
- Consistencia visual
- Bundle size pequeño con purge

### ¿Por qué PostgreSQL?

- Constraints fuertes
- Soporte JSONB para datos semi-estructurados (ej: settings de hogar)
- Replicación, performance maduros

---

## 🚀 Cuándo refactorizar vs cuándo no

### Refactorizar SI:
- Un archivo supera **400 líneas** sin razón fuerte
- Un método supera **40 líneas**
- Hay código duplicado (regla "tres strikes": si lo escribís 3 veces, refactorizá)
- Los tests se vuelven difíciles de escribir (señal de mal diseño)
- Un cambio simple requiere tocar 10 archivos (acoplamiento alto)

### NO refactorizar si:
- Es código que funciona y nadie va a tocar más
- "Para hacerlo más elegante" sin un problema concreto
- Justo antes de un release importante
- Sin tests existentes (refactorizar sin tests es ruleta rusa)

---

## ✅ Checklist arquitectónico para cada feature

Antes de mergear una feature, verificar:

- [ ] ¿Las 4 capas están separadas (router → service → crud → model)?
- [ ] ¿El service hace commit, no el CRUD?
- [ ] ¿Las excepciones de dominio están definidas y mapeadas?
- [ ] ¿Los schemas Pydantic son específicos (Create, Update, Read)?
- [ ] ¿Las queries filtran por `user_id`?
- [ ] ¿Hay tests para happy path, error path, y aislamiento?
- [ ] ¿Se generó migración Alembic si tocó modelos?
- [ ] ¿El frontend usa React Query para datos del servidor?
- [ ] ¿No se duplicaron datos entre Zustand y React Query?

---

> **Próximo paso:** lee `03-CONVENCIONES-DE-CODIGO.md` para naming, estructura y estilos.
