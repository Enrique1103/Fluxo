# Fluxo — Gestor de Finanzas Personales

Aplicación web fullstack para el seguimiento de ingresos, gastos, metas y finanzas grupales (hogares). Incluye importación de extractos bancarios, análisis por categorías y dashboard mensual.

---

## Stack

| Capa | Tecnología |
|---|---|
| Frontend | React 19 + TypeScript + Vite + Tailwind CSS v4 |
| Backend | FastAPI (Python) |
| Base de datos | PostgreSQL (Supabase) |
| ORM | SQLAlchemy 2.0 + Alembic |
| Auth | JWT (python-jose) + bcrypt |
| Charts | Plotly (servidor) + react-plotly.js (cliente) |
| Deploy | Render (backend) · Vercel (frontend) · Supabase (DB) |

---

## Estructura

```
Fluxo/
├── backend/
│   ├── app/
│   │   ├── api/          # Routers + inyección de dependencias
│   │   ├── core/         # DB session, JWT, bcrypt, constantes
│   │   ├── crud/         # Operaciones atómicas de BD (sin lógica de negocio)
│   │   ├── exceptions/   # Excepciones de dominio por entidad
│   │   ├── models/       # Modelos SQLAlchemy (DeclarativeBase)
│   │   ├── schemas/      # Schemas Pydantic v2 (request/response)
│   │   └── services/     # Lógica de negocio
│   ├── alembic/          # Migraciones
│   └── requirements.txt
└── frontend/
    ├── src/
    │   ├── api/          # Clientes axios por dominio
    │   ├── components/   # Componentes reutilizables
    │   ├── pages/        # Páginas principales
    │   └── hooks/        # Custom hooks (useTheme, etc.)
    └── package.json
```

---

## Setup local

### Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

Crear `backend/.env`:
```env
DATABASE_URL=postgresql://user:pass@host/dbname
SECRET_KEY=tu-clave-secreta
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30
```

```bash
alembic upgrade head             # aplicar migraciones
uvicorn app.main:app --reload    # servidor en http://localhost:8000
```

### Frontend

```bash
cd frontend
npm install
```

Crear `frontend/.env`:
```env
VITE_API_URL=http://localhost:8000/api
```

```bash
npm run dev                      # http://localhost:5173
```

---

## Migraciones

```bash
# Generar migración desde cambios en modelos
alembic revision --autogenerate -m "descripción"

# Aplicar
alembic upgrade head

# Revertir un paso
alembic downgrade -1
```

---

## Funcionalidades

- **Dashboard mensual** — resumen de ingresos/gastos, balance, evolución, top categorías
- **Dashboard global** — análisis histórico, comparativa entre periodos
- **Transacciones** — alta/baja/edición con concepto, categoría y método de pago
- **Importación bancaria** — parseo de extractos Excel/CSV/PDF (Prex, BROU, Itaú, Santander, OCA, Mercado Pago, Ualá), detección de duplicados, asignación de conceptos en revisión
- **Hogares** — finanzas grupales con contribuciones, liquidación de deudas y gastos compartidos
- **Categorías y conceptos** — etiquetas propias por usuario
- **Cuentas** — efectivo, débito, crédito en UYU o USD
- **Modo claro/oscuro**
