# Fluxo

**Aplicación de finanzas personales** construida con FastAPI y React. Seguimiento de ingresos y gastos, análisis mensual, importación de extractos bancarios, metas financieras y finanzas grupales — todo en una sola app instalable como PWA.

---

## Funcionalidades

### Dashboards
- **Global** — patrimonio neto, activos, deudas, balance del mes, evolución histórica y metas financieras
- **Análisis mensual** — distribución de gastos por categoría, heatmap de actividad diaria, comparativa con el mes anterior y exportación a PDF
- **Hogares** — finanzas grupales con aportes proporcionales al ingreso, balance por miembro y liquidación automática de deudas

### Transacciones
- Alta, edición y eliminación de ingresos, gastos y transferencias
- Clasificación por categoría, concepto y método de pago (efectivo, débito, crédito, transferencia, billetera digital)
- Soporte para cuotas — registro de planes de cuotas en tarjeta de crédito

### Importación bancaria
Parseo automático de extractos con detección de duplicados y asignación de conceptos en revisión:

| Banco | Formato |
|---|---|
| Itaú | CSV |
| Santander | CSV |
| BROU | CSV |
| Mercado Pago | CSV |
| Ualá | CSV |
| OCA | PDF |
| Prex | Excel |
| Zcuentas | Excel |

### Cuentas y configuración
- Tipos: efectivo, débito, crédito — en UYU o USD
- Tasas de cambio configurables para conversión automática
- Categorías y conceptos propios por usuario
- Modo claro / oscuro
- Exportación del reporte mensual a PDF (gráfico de dona + tabla + movimientos)

### PWA
Instalable desde el navegador en Android e iOS, sin pasar por tiendas de aplicaciones.

---

## Stack

| Capa | Tecnología |
|---|---|
| Frontend | React 19 + TypeScript + Vite + Tailwind CSS v4 |
| Backend | FastAPI (Python 3.12) |
| Base de datos | PostgreSQL |
| ORM | SQLAlchemy 2.0 + Alembic |
| Autenticación | JWT (python-jose) + bcrypt |
| Gráficos | Plotly + react-plotly.js |
| PDF | jsPDF + jspdf-autotable |
| Deploy | Render · Vercel · Supabase |

---

## Estructura

```
Fluxo/
├── backend/
│   ├── app/
│   │   ├── api/          # Routers FastAPI + dependencias (get_current_user)
│   │   ├── core/         # Sesión DB, JWT, bcrypt, constantes
│   │   ├── crud/         # Operaciones atómicas de BD sin lógica de negocio
│   │   ├── exceptions/   # Excepciones de dominio por entidad
│   │   ├── models/       # Modelos SQLAlchemy (DeclarativeBase)
│   │   ├── schemas/      # Schemas Pydantic v2 (request / response)
│   │   └── services/     # Lógica de negocio — único lugar con db.commit()
│   ├── alembic/          # Migraciones de base de datos
│   └── requirements.txt
└── frontend/
    ├── public/           # Íconos PWA, favicons
    └── src/
        ├── api/          # Clientes axios por dominio
        ├── components/   # Componentes reutilizables + modales
        ├── pages/        # DashboardPage, StatsDashboardPage, HouseholdPage
        ├── lib/          # exportPDF, queryClient
        └── hooks/        # useTheme, useHouseholdEvents
```

---

## Desarrollo local

### Opción A — Docker (recomendado)

```bash
docker compose up
```

Levanta PostgreSQL y el backend en `http://localhost:8000`. Las migraciones se aplican automáticamente.

### Opción B — Manual

**Backend**

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
alembic upgrade head
uvicorn app.main:app --reload   # http://localhost:8000
```

**Frontend**

```bash
cd frontend
npm install
npm run dev                     # http://localhost:5173
```

---

## Migraciones

```bash
# Generar desde cambios en modelos
alembic revision --autogenerate -m "descripción"

# Aplicar
alembic upgrade head

# Revertir un paso
alembic downgrade -1
```

---

## Tests

```bash
cd backend
pytest
```

---

## Despliegue

| Servicio | Uso |
|---|---|
| Supabase | PostgreSQL gestionado |
| Render | Backend (detecta el Dockerfile automáticamente) |
| Vercel | Frontend estático |

El `Dockerfile` del backend expone `${PORT}` para compatibilidad con Render.
