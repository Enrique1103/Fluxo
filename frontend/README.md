# Fluxo — Frontend

React 19 + TypeScript + Vite + Tailwind CSS v4.

## Stack

- **React 19** con React Router v7
- **TypeScript** (modo estricto)
- **Tailwind CSS v4** vía plugin de Vite
- **TanStack Query v5** para fetching y caché de datos del servidor
- **Axios** como cliente HTTP
- **React Hook Form + Zod** para formularios con validación tipada
- **Lucide React** para íconos
- **react-plotly.js** para gráficos (recibe figuras generadas por el backend)
- **Zustand** para estado global ligero

## Comandos

```bash
npm install        # instalar dependencias
npm run dev        # servidor de desarrollo (http://localhost:5173)
npm run build      # build de producción (output: dist/)
npm run preview    # preview del build
npm run lint       # ESLint
```

## Variables de entorno

Crear `.env` en la raíz del frontend:

```env
VITE_API_URL=http://localhost:8000/api
```

En producción apunta a la URL del backend en Render.

## Estructura

```
src/
├── api/           # Un archivo por dominio (dashboard.ts, importacion.ts, households.ts, …)
├── components/    # Componentes compartidos (TransactionModal, etc.)
├── hooks/         # useTheme
├── pages/         # DashboardPage, StatsDashboardPage, ImportacionPage, HouseholdPage, …
└── App.tsx        # Rutas
```
