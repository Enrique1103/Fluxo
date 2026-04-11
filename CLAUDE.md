# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

All commands must be run from the `backend/` directory.

**Setup:**
```bash
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

**Required `.env` file** (in `backend/`):
```
DATABASE_URL=postgresql://user:pass@host/dbname
SECRET_KEY=your-secret-key
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30
```

**Run the server:**
```bash
uvicorn app.main:app --reload
```

**Database migrations:**
```bash
# Generate a new migration from model changes
alembic revision --autogenerate -m "description"

# Apply migrations
alembic upgrade head

# Rollback one step
alembic downgrade -1
```

## Architecture

The backend is a FastAPI application organized in strict layers. Data flows: **Router → Service → CRUD → DB**.

```
backend/
├── app/
│   ├── api/          # FastAPI routers + dependency injection (get_current_user)
│   ├── core/         # DB session, JWT auth, bcrypt, shared constants
│   ├── crud/         # Atomic DB operations only — no business logic
│   ├── exceptions/   # Domain exception classes per entity
│   ├── models/       # SQLAlchemy ORM models (DeclarativeBase)
│   ├── schemas/      # Pydantic v2 schemas for request/response validation
│   └── services/     # Business logic layer
└── alembic/          # Migration scripts (env.py reads DATABASE_URL from .env)
```

### Key design decisions

**Services own transactions.** `db.commit()` only lives in service methods, never in CRUD. CRUD functions perform operations and return objects; services orchestrate them and commit. All service methods wrap their logic in `try/except` with `db.rollback()` on failure.

**Account balance is mutated on the fly.** `TransactionService` directly modifies `account.amount` when creating, updating, or deleting a transaction — there is no separate balance recalculation step.

**Concept → Category relationship is enforced at write time.** A `Concept` belongs to a `Category`. When creating a transaction, the service derives `category_id` from the selected `concept_id`, and rejects any explicit `category_id` that contradicts the concept's category.

**User registration seeds default data.** `RegisterService.register_user` creates the user, then immediately seeds a default set of categories and concepts (defined in `core/constants.py: INITIAL_USER_CATEGORIES`) all within a single transaction using `db.flush()` between steps.

**Authentication** uses JWT (python-jose) with bcrypt passwords (passlib). The `get_current_user` dependency in `api/dependeces.py` decodes the token and enforces `is_active`.

### Domain models

- `User` → has many `Account`, `Transaction`, `Category`, `Concept`
- `Account` → types: `cash | debit | credit`; currencies: `UYU | USD`; holds running `amount`
- `Transaction` → types: `income | expense`; linked to `Account`, `Category`, `Concept`; enforces `amount > 0` via DB constraint
- `Category` → user-scoped label grouping concepts
- `Concept` → user-scoped sub-label under a category; the atomic classification unit of a transaction

## Documentación
Antes de responder, leé siempre la carpeta @docs/ que contiene toda la documentación del proyecto.