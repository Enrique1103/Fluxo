# Fluxo — Resumen General del Proyecto

## ¿Qué es Fluxo?

Fluxo es una aplicación web de gestión financiera personal. Permite registrar ingresos, gastos y transferencias entre cuentas, visualizar el estado financiero en tiempo real, y planificar metas de ahorro. Está orientada a usuarios que quieren tener un control claro y detallado de su dinero, con soporte para múltiples cuentas y monedas.

---

## Stack Tecnológico

| Capa | Tecnología |
|------|-----------|
| Frontend | React + TypeScript + TanStack Query |
| Estilos | Tailwind CSS |
| Backend | FastAPI (Python) |
| Base de datos | PostgreSQL (Supabase) |
| ORM | SQLAlchemy v2 |
| Autenticación | JWT + bcrypt |
| Migraciones | Alembic |

---

## Arquitectura General

```
Frontend (React)
    │
    ├── DashboardPage       → Hub financiero principal
    └── StatsDashboardPage  → Análisis mensual detallado

Backend (FastAPI)
    │
    ├── Router → Service → CRUD → PostgreSQL
    │
    ├── Módulos: auth, users, accounts, transactions,
    │           categories, concepts, fin_goals,
    │           analytics, summary, exchange_rates,
    │           external_accounts
```

El frontend consume una API REST. Los datos de análisis (gráficos, patrimonio, proyecciones) se calculan en el servidor.

---

## Dashboard 1 — Hub Principal (`/`)

**Archivo:** `frontend/src/pages/DashboardPage.tsx`

Es la pantalla central de la aplicación. Muestra el estado financiero global del usuario y agrupa todo lo necesario para tomar decisiones.

### Secciones

#### Gráfico Ingresos · Gastos · Ahorro
Gráfico SVG interactivo con scroll horizontal que muestra la evolución mensual de ingresos, gastos y ahorro acumulado. Carga hasta 24 meses hacia atrás y proyecta 24 meses hacia adelante. Incluye:
- Líneas con gradiente y efecto glow por tipo (verde = ingresos, rojo = gastos, azul = ahorro)
- Tooltip al hacer hover con los valores del mes
- Zoom de columnas (más o menos ancho por mes)
- Ajuste de eje Y al rango de datos visibles
- Indicador de meses futuros ("PROYECCIÓN")
- Punto pulsante en el mes actual

#### Barra de Libertad Financiera
Muestra cuántos meses podría vivir el usuario sin ingresos, basándose en su patrimonio neto y sus gastos del mes actual. Incluye:
- Porcentaje de avance hacia un objetivo configurable (1 año, 2 años, personalizado)
- Estimación de tiempo para alcanzar el objetivo según el ahorro promedio
- Barra de progreso con colores (rojo < 25%, amarillo < 50%, verde ≥ 50%)

#### Patrimonio Neto
Gráfico de barras verticales con scroll horizontal que muestra la evolución mensual del patrimonio neto. Las barras son positivas (cyan) o negativas (rojo) según el valor. Incluye:
- Etiqueta de valor sobre cada barra
- Barra del mes actual destacada con glow
- Variación porcentual vs el mes anterior
- Desglose por cuenta (con íconos por tipo: efectivo, débito, crédito, inversión)
- Conversión automática a la moneda seleccionada usando tasas de cambio

#### Metas Financieras
Panel lateral con los objetivos de ahorro del usuario. Por cada meta muestra:
- Nombre y progreso en porcentaje
- Barra de progreso hacia el monto objetivo
- Tiempo estimado para alcanzarla (basado en el ahorro mensual promedio)
- Control deslizante para asignar qué porcentaje del flujo libre va a cada meta
- Candado para fijar la asignación de una meta mientras se rebalancean las demás
- Insight de flujo: sugiere redirigir más porcentaje si hay flujo libre sin asignar

#### Controles Globales
- Selector de moneda (UYU / USD / EUR) — convierte todos los valores mostrados
- Toggle de privacidad — oculta todos los montos con `****`
- Botón de configuración (abre el SettingsDrawer)
- FAB (botón flotante `+`) para registrar un movimiento rápido

---

## Dashboard 2 — Deep Dive Mensual (`/stats`)

**Archivo:** `frontend/src/pages/StatsDashboardPage.tsx`

Análisis detallado mes a mes. Permite revisar qué pasó en cualquier mes específico: cuánto se gastó, en qué, y cuándo.

### Secciones

#### Navegación de Meses
Flechas izquierda/derecha para moverse entre meses. Muestra el mes y año actual formateado (ej. "Marzo 2026").

#### Resumen del Mes
Cuatro indicadores clave:
- **Ingresos:** total de ingresos registrados en el mes
- **Gastos:** total de gastos del mes
- **Ahorro:** diferencia (ingresos − gastos), en verde si positivo o rojo si negativo
- **Tasa de ahorro:** porcentaje del ingreso que se ahorró

#### Donut de Categorías
Gráfico circular que muestra la distribución de gastos por categoría. Cada categoría tiene su color personalizado. Debajo lista las categorías con su monto y porcentaje del ingreso mensual.

#### Heatmap de Gastos Diarios
Calendario estilo GitHub con todos los días del mes. La intensidad del color indica el nivel de gasto ese día:
- Gris oscuro = sin gastos
- Degradado de azul claro a azul intenso según el monto
- El día actual se resalta con borde
- Al hacer hover sobre una celda se ve el monto del día

#### Tabla de Transacciones
Lista completa de todas las transacciones del mes con:
- Fecha, concepto, categoría, monto y método de pago
- Badge de color por método de pago (efectivo, tarjeta débito, tarjeta crédito, transferencia bancaria, billetera digital)
- Botones de editar y eliminar por fila
- Actualización automática al modificar una transacción

---

## Módulos de Configuración (SettingsDrawer)

Accesible desde el ícono de engranaje en el header. Panel lateral con navegación interna entre secciones:

| Sección | Qué permite hacer |
|---------|-------------------|
| **Perfil** | Editar nombre, cambiar contraseña, elegir moneda por defecto, subir avatar |
| **Cuentas** | Crear, editar y eliminar cuentas (efectivo, débito, crédito, inversión) |
| **Etiquetas** | Administrar categorías (con color e ícono) y conceptos |
| **Tasas de Cambio** | Registrar tasas mensuales entre pares de moneda (ej. USD→UYU) |
| **Eliminar Cuenta** | Eliminar la cuenta del usuario de forma permanente |

---

## Modal de Transacciones (TransactionModal)

Formulario para registrar o editar cualquier movimiento financiero. Campos:
- **Tipo:** Ingreso / Gasto / Transferencia
- **Monto:** número positivo
- **Fecha:** selector de fecha
- **Cuenta:** de cuál cuenta se debita o acredita
- **Concepto:** etiqueta del gasto (ej. "Supermercado", "Sueldo")
- **Categoría:** derivada automáticamente del concepto seleccionado
- **Método de pago:** efectivo, tarjeta débito, tarjeta crédito, transferencia, billetera digital, otro
- **Descripción:** nota libre opcional
- Para transferencias: cuenta destino (puede ser externa)

---

## Dominio de Datos

### Entidades principales

| Entidad | Descripción |
|---------|-------------|
| **User** | Cuenta del usuario. Tiene moneda por defecto. |
| **Account** | Cuenta bancaria o billetera. Tipos: `cash`, `debit`, `credit`, `investment`. Monedas: `UYU`, `USD`, `EUR`. Guarda el saldo corriente. |
| **Transaction** | Cada movimiento de dinero. Tipos: `income`, `expense`, `transfer`. Monto siempre positivo. |
| **Category** | Agrupación de conceptos. Tiene color e ícono. |
| **Concept** | Unidad mínima de clasificación de una transacción (ej. "Alquiler", "Sueldo"). Pertenece a una categoría. |
| **FinGoal** | Meta de ahorro. Tiene un monto objetivo, fecha límite opcional y un porcentaje de asignación del flujo libre. |
| **ExchangeRate** | Tasa de cambio mensual entre dos monedas. Se usa para convertir saldos y patrimonio. |

### Reglas de negocio clave
- El saldo de una cuenta se recalcula en tiempo real cada vez que se crea, edita o elimina una transacción.
- Al crear una transacción, la categoría se deriva del concepto seleccionado — no se puede asignar una categoría que contradiga al concepto.
- Una transferencia genera dos transacciones vinculadas: una de egreso en la cuenta origen y una de ingreso en la cuenta destino.
- Al registrarse, el usuario recibe un set de categorías y conceptos por defecto listos para usar.
- La suma de `allocation_pct` entre todas las metas no puede superar 100%.

---

## Flujo Típico de Uso

1. El usuario se registra → se crean categorías y conceptos por defecto.
2. Crea sus cuentas (ej. "Cuenta corriente USD", "Efectivo UYU").
3. Registra sus transacciones diarias con el FAB `+`.
4. En el **Hub Principal** ve su patrimonio, libertad financiera y tendencia mensual.
5. En **Deep Dive Mensual** revisa el detalle de cualquier mes: qué gastó, en qué categorías y en qué días.
6. Define metas de ahorro y asigna un porcentaje de su flujo libre a cada una.
7. Si tiene cuentas en moneda extranjera, carga las tasas de cambio mensuales para que el patrimonio se convierta correctamente.
