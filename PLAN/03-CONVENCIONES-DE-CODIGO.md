# 🎨 Convenciones de Código de Fluxo

> **Reglas concretas sobre cómo escribir el código.**
> Todo código nuevo cumple estas convenciones. El código viejo se adapta progresivamente.

---

## 🐍 Python (Backend)

### Naming

| Elemento | Convención | Ejemplo |
|---|---|---|
| Archivos | snake_case | `transaction_service.py` |
| Clases | PascalCase | `TransactionService`, `Account` |
| Funciones | snake_case | `create_transaction`, `get_by_id` |
| Variables | snake_case | `user_id`, `total_amount` |
| Constantes | UPPER_SNAKE_CASE | `MAX_TRANSACTIONS_PER_USER` |
| Enums | PascalCase + miembros UPPER_SNAKE | `TransactionType.EXPENSE` |
| Privados | prefijo `_` | `_calculate_balance`, `_internal_helper` |
| Modelos ORM | PascalCase singular | `Transaction`, NO `Transactions` |
| Tablas en DB | snake_case plural | `transactions`, `household_members` |

### Naming de funciones de servicio

Las funciones de service usan **verbos en inglés** en imperativo:

```python
# ✅ Correcto
def create(db, user, data): ...
def get_all_by_user(db, user_id): ...
def update(db, tx, data): ...
def soft_delete(db, tx): ...
def calculate_household_split(db, household_id, month): ...

# ❌ Mal
def transaction_creator(...): ...  # no es verbo
def getAllByUser(...): ...  # camelCase
def crear_transaccion(...): ...  # español mezclado con inglés
```

### Naming de conceptos del dominio uruguayo

Cuando un concepto es específico del dominio uruguayo y traducirlo confunde, se mantiene en español:

```python
# ✅ Correcto: términos del dominio uruguayo en español
concepto = "SUPERMERCADO"
categoria = "Alimentación"
monto = 1500.00
viatico_no_grabado = 1000.00

# ❌ Mal: traducciones forzadas que no aportan
concept = "SUPERMERCADO"  # innecesario
category = "Alimentación"
amount = 1500.00
```

**Regla:** Si el concepto tiene equivalente claro en inglés (transaction, account, balance), usar inglés. Si es uruguayo (concepto, viático, presentismo), usar español.

### Estructura típica de un service

```python
"""Service de Transactions.

Maneja la creación, modificación y eliminación de transacciones,
incluyendo la actualización de saldos de cuentas y la validación
de reglas de negocio.
"""

from sqlalchemy.orm import Session
from app.models.transaction import Transaction, TransactionType
from app.models.user import User
from app.schemas.transaction import TransactionCreate, TransactionUpdate
from app.crud import transaction_crud, account_crud, concept_crud
from app.exceptions.transaction_exceptions import (
    TransactionNotFound,
    InsufficientFunds,
    SameAccountTransferNotAllowed,
)
from app.exceptions.account_exceptions import AccountNotFound


def create(db: Session, user: User, data: TransactionCreate) -> Transaction:
    """Crea una transacción nueva, actualizando saldos correspondientes.

    Reglas:
    - Si es expense: descuenta del saldo de la cuenta.
    - Si es income: suma al saldo.
    - Si es transfer: actualiza ambas cuentas.

    Raises:
        AccountNotFound: si account_id no pertenece al usuario.
        InsufficientFunds: si la cuenta no tiene saldo suficiente (excepto crédito).
    """
    # 1. Validaciones
    account = account_crud.get_by_id(db, data.account_id, user.id)
    if not account:
        raise AccountNotFound(data.account_id)

    _validate_concept_belongs_to_user(db, data.concept_id, user.id)

    # 2. Lógica de negocio según tipo
    if data.type == TransactionType.EXPENSE:
        _apply_expense(account, data.amount)
    elif data.type == TransactionType.INCOME:
        _apply_income(account, data.amount)
    elif data.type == TransactionType.TRANSFER:
        return _create_transfer(db, user, data)

    # 3. Persistir
    tx = transaction_crud.create(db, data, user.id)
    db.commit()
    db.refresh(tx)
    return tx


def _apply_expense(account, amount):
    """Helper privado para aplicar un gasto al saldo."""
    if account.type != "credit" and account.balance < amount:
        raise InsufficientFunds(account.id, account.balance, amount)
    account.balance -= amount


def _validate_concept_belongs_to_user(db, concept_id, user_id):
    """Helper privado de validación."""
    concept = concept_crud.get_by_id(db, concept_id)
    if not concept or concept.user_id != user_id:
        raise ConceptNotBelongsToUser(concept_id)
```

**Observaciones:**
- Docstring al inicio explicando qué hace el módulo.
- Imports organizados: stdlib, third-party, app.
- Función pública (`create`) tiene docstring con reglas y excepciones.
- Helpers privados con prefijo `_`.
- Validaciones primero, lógica después, commit al final.

### Type hints obligatorios

**Toda función pública** tiene type hints en parámetros y retorno:

```python
# ✅ Correcto
def create(db: Session, user: User, data: TransactionCreate) -> Transaction:
    ...

def get_by_id(db: Session, tx_id: int, user_id: int) -> Transaction | None:
    ...

# ❌ Mal
def create(db, user, data):
    ...
```

Para Python 3.10+ usar `|` en lugar de `Optional` y `Union`:

```python
# ✅ Correcto (Python 3.10+)
def find(db: Session) -> Transaction | None: ...
def parse(value: str | int) -> int: ...

# ❌ Estilo viejo, evitar
from typing import Optional, Union
def find(db: Session) -> Optional[Transaction]: ...
def parse(value: Union[str, int]) -> int: ...
```

### Manejo de errores

```python
# ✅ Correcto: excepciones de dominio específicas
if not account:
    raise AccountNotFound(account_id)

if balance < amount:
    raise InsufficientFunds(account_id, balance, amount)

# ❌ Mal: excepciones genéricas
raise Exception("Account not found")
raise ValueError("not enough money")
raise HTTPException(status_code=404, detail="Not found")  # mezcla capas
```

**Nunca** lanzar `HTTPException` desde un service. Las HTTP responses se generan en `main.py` a partir de las excepciones de dominio.

### Comentarios

```python
# ✅ Comentarios útiles: el "por qué", no el "qué"
# Excluimos DESTINATION para que las transferencias no aparezcan duplicadas
# en el extracto general del usuario.
query = query.filter(Transaction.transfer_role != TransferRole.DESTINATION)

# ❌ Comentarios obvios
# Suma 1 a x
x = x + 1

# ❌ Comentarios desactualizados son peor que no comentarios
# Esta función calcula el promedio (ya no, ahora calcula la mediana)
def calcular(...): ...
```

### Imports

```python
# ✅ Orden correcto: stdlib → third-party → app

# Stdlib
from datetime import datetime, timezone
from decimal import Decimal

# Third-party
from sqlalchemy.orm import Session
from sqlalchemy import select
from pydantic import BaseModel

# App
from app.models.transaction import Transaction
from app.schemas.transaction import TransactionCreate
from app.crud import transaction_crud
from app.exceptions.transaction_exceptions import TransactionNotFound
```

**Nunca** usar imports `from X import *`. **Nunca** imports relativos profundos (`from ...services import ...`).

---

## 🟦 TypeScript (Frontend)

### Naming

| Elemento | Convención | Ejemplo |
|---|---|---|
| Archivos de componente | PascalCase | `TransactionModal.tsx` |
| Archivos de utility | camelCase | `formatCurrency.ts` |
| Componentes | PascalCase | `TransactionModal` |
| Funciones | camelCase | `formatCurrency`, `getHouseholds` |
| Hooks custom | camelCase con prefijo `use` | `useHouseholdEvents` |
| Constantes | UPPER_SNAKE_CASE | `MAX_RETRIES` |
| Interfaces/Types | PascalCase | `Transaction`, `HouseholdMember` |
| Enums | PascalCase + miembros PascalCase | `TransactionType.Expense` |

### Estructura típica de un componente

```tsx
import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { createTransaction } from '@/api/transactions'
import { invalidateFinancialData } from '@/lib/queryClient'
import type { Account, Concept } from '@/types'

// Schema de validación
const formSchema = z.object({
  amount: z.number().positive('El monto debe ser mayor a cero'),
  accountId: z.number().int().positive(),
  conceptId: z.number().int().positive(),
})

type FormData = z.infer<typeof formSchema>

interface TransactionModalProps {
  open: boolean
  onClose: () => void
  accounts: Account[]
  concepts: Concept[]
}

export function TransactionModal({ open, onClose, accounts, concepts }: TransactionModalProps) {
  const queryClient = useQueryClient()

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(formSchema),
  })

  const mutation = useMutation({
    mutationFn: createTransaction,
    onSuccess: () => {
      invalidateFinancialData()
      onClose()
    },
  })

  const onSubmit = (data: FormData) => {
    mutation.mutate(data)
  }

  if (!open) return null

  return (
    <div className="modal">
      <form onSubmit={handleSubmit(onSubmit)}>
        {/* ... */}
      </form>
    </div>
  )
}
```

**Observaciones:**
- Imports organizados: React → third-party → app → types
- Schema Zod con mensajes en español
- Props tipadas con interface
- `useMutation` para escritura, `useQuery` para lectura (no mostrado aquí)
- Invalidación de cache después de mutación exitosa

### Tipado estricto

**Toda variable, prop, retorno** tiene tipo explícito o inferido. **NO se usa `any`** salvo casos extremadamente justificados.

```typescript
// ✅ Correcto
function formatCurrency(amount: number, currency: 'UYU' | 'USD'): string {
  return new Intl.NumberFormat('es-UY', { style: 'currency', currency }).format(amount)
}

// ❌ Mal
function formatCurrency(amount: any, currency: any): any {
  return new Intl.NumberFormat('es-UY', { style: 'currency', currency }).format(amount)
}
```

### Manejo de estado

```typescript
// ✅ Datos del servidor → React Query
const { data: transactions, isLoading } = useQuery({
  queryKey: ['transactions', { accountId }],
  queryFn: () => getTransactions({ accountId }),
})

// ✅ Estado de UI temporal → useState
const [isOpen, setIsOpen] = useState(false)

// ✅ Auth global → Zustand
const token = useAuthStore(state => state.token)

// ❌ Datos del servidor en Zustand
const transactions = useTransactionsStore(state => state.transactions) // ← no
```

### Manejo de errores en API

```typescript
// ✅ Correcto: error tipado y mostrado al usuario
const mutation = useMutation({
  mutationFn: createTransaction,
  onError: (error: AxiosError<{ detail: string }>) => {
    toast.error(error.response?.data.detail ?? 'Ocurrió un error inesperado')
  },
})

// ❌ Mal: error silencioso
const mutation = useMutation({
  mutationFn: createTransaction,
  onError: () => {
    console.log('error')
  },
})
```

### CSS con Tailwind

```tsx
// ✅ Correcto: utility classes ordenadas (layout → spacing → color → states)
<button className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50">
  Guardar
</button>

// ❌ Evitar: clases custom inline cuando Tailwind alcanza
<button style={{ padding: '8px 16px', backgroundColor: '#2563eb' }}>
  Guardar
</button>
```

**Cuándo usar CSS custom:** solo para animaciones complejas o cosas que Tailwind no cubre.

---

## 🗂 Estructura de archivos en una feature nueva

### Ejemplo: feature "Sistema de revisión colaborativa"

#### Backend

```
backend/app/
├── models/
│   └── transaction_review.py          # ← NUEVO modelo
├── schemas/
│   └── transaction_review.py          # ← NUEVOS schemas
├── crud/
│   └── transaction_review_crud.py     # ← NUEVO CRUD
├── services/
│   └── transaction_review_service.py  # ← NUEVO service
├── exceptions/
│   └── transaction_review_exceptions.py  # ← NUEVAS excepciones
├── api/v1/
│   └── transaction_reviews.py         # ← NUEVO router
└── main.py                            # MODIFICAR: registrar router + handlers
```

```
backend/tests/
└── test_transaction_reviews.py        # ← NUEVO archivo de tests
```

```
backend/alembic/versions/
└── XXXXX_add_transaction_reviews.py   # ← NUEVA migración
```

#### Frontend

```
frontend/src/
├── api/
│   └── transactionReviews.ts          # ← NUEVO API client
├── components/
│   ├── review/
│   │   ├── ReviewButton.tsx           # ← Botón "🚩 Marcar"
│   │   ├── ReviewModal.tsx            # ← Modal para marcar
│   │   └── ReviewList.tsx             # ← Lista de revisiones
│   └── TransactionItem.tsx            # MODIFICAR: agregar botón review
└── types/
    └── transactionReview.ts           # ← NUEVOS types
```

---

## 📝 Convenciones de commits

### Formato

```
tipo(scope): descripción corta

descripción detallada opcional

Refs: #issue (si aplica)
```

### Tipos permitidos

- `feat`: nueva funcionalidad
- `fix`: corrección de bug
- `refactor`: cambio que no agrega ni quita funcionalidad
- `test`: agregar o modificar tests
- `docs`: cambios en documentación
- `chore`: tareas de mantenimiento (deps, configs)
- `perf`: mejoras de performance

### Ejemplos

```
feat(households): permitir múltiples hogares por usuario

Agrega soporte para que un usuario pertenezca a varios hogares
simultáneamente. El modelo HouseholdMember ya soportaba múltiples
relaciones; este cambio expone la funcionalidad en la UI.

Refs: #42
```

```
fix(auth): test_register_seeds_categories_and_concepts
```

```
refactor(parsers): extraer interfaz común BankParser
```

```
test(parsers): agregar fixtures para Itaú CSV
```

---

## 🔢 Estilos de código (formato)

### Python

- **Indentación:** 4 espacios (NO tabs)
- **Longitud de línea:** máximo 100 caracteres
- **Strings:** preferir comillas dobles `"texto"`, salvo cuando el string contenga comillas dobles
- **F-strings** para interpolación: `f"Total: {total}"`, NO `"Total: %s" % total`
- **Tipado:** type hints en todas las funciones públicas
- **Docstrings:** triple comilla doble `"""`, formato Google style

### TypeScript

- **Indentación:** 2 espacios
- **Longitud de línea:** máximo 100 caracteres
- **Strings:** comillas simples `'texto'`, backticks para interpolación
- **Semicolons:** opcionales (consistencia con lo existente, no obligatorios)
- **Trailing commas:** sí, en arrays y objetos multiline
- **Arrow functions** preferidas sobre `function` para callbacks

---

## ⚠️ Anti-patrones prohibidos

### Backend

1. **Mutación silenciosa de objetos pasados por parámetro**
```python
# ❌ Mal: muta el dict del caller sin avisarle
def normalize_data(data: dict):
    data['name'] = data['name'].upper()  # ← muta el original

# ✅ Bien: retorna copia modificada
def normalize_data(data: dict) -> dict:
    return {**data, 'name': data['name'].upper()}
```

2. **Magic numbers**
```python
# ❌ Mal
if user.transactions_count > 1000:
    ...

# ✅ Bien
MAX_TRANSACTIONS_PER_USER = 1000
if user.transactions_count > MAX_TRANSACTIONS_PER_USER:
    ...
```

3. **Catch genérico**
```python
# ❌ Mal: oculta bugs
try:
    do_something()
except Exception:
    pass

# ✅ Bien: específico
try:
    do_something()
except SpecificError as e:
    logger.warning(f"Could not do: {e}")
    raise
```

### Frontend

1. **Prop drilling profundo**
```tsx
// ❌ Mal: pasar prop por 5 niveles
<Page user={user}>
  <Header user={user}>
    <Nav user={user}>
      <Menu user={user}>
        <UserBadge user={user} />

// ✅ Bien: usar contexto o estado global apropiado
```

2. **useEffect para datos del servidor**
```tsx
// ❌ Mal: reinventar React Query
useEffect(() => {
  fetch('/api/transactions').then(r => r.json()).then(setData)
}, [])

// ✅ Bien
const { data } = useQuery({
  queryKey: ['transactions'],
  queryFn: getTransactions
})
```

3. **Inline functions en JSX**
```tsx
// ❌ Mal: recrea la función en cada render
<button onClick={() => handleSubmit({ amount: 100, type: 'expense' })}>

// ✅ Bien si la usás múltiples veces o el componente es complejo
const handleClick = () => handleSubmit({ amount: 100, type: 'expense' })
<button onClick={handleClick}>

// ✅ También bien para callbacks simples one-off
<button onClick={onClose}>Cancelar</button>
```

---

## 📐 Checklist de convenciones por PR

Antes de mergear, verificar:

### Backend
- [ ] Imports organizados (stdlib, third-party, app)
- [ ] Type hints en todas las funciones públicas
- [ ] Docstrings en módulos y funciones complejas
- [ ] Excepciones de dominio (no genéricas)
- [ ] Sin `print()` ni `console.log()` olvidados
- [ ] Sin comentarios `TODO`, `FIXME` sin issue asociado
- [ ] Sin código comentado (eliminado o explicado)

### Frontend
- [ ] Tipos explícitos (sin `any`)
- [ ] Mensajes de UI en español
- [ ] Validación con Zod cuando hay formularios
- [ ] React Query para datos del servidor
- [ ] Tailwind para estilos (no inline styles salvo casos justificados)
- [ ] Componentes <200 líneas (si supera, dividir)

---

> **Próximo paso:** lee `04-FLUJO-DE-TRABAJO.md` para saber cómo dirigir a Claude Code paso a paso.
