# Especificación Técnica: Sistema de Importación Bancaria para Fluxo

## 1. Visión General

Extender Fluxo con capacidad de importar movimientos bancarios desde múltiples fuentes (Prex, OCA, Itaú, Santander, BROU, Banco República, Scotiabank, Midinero) sin usar APIs externas.

**Alcance**: 
- Parseo de archivos Excel, PDF, CSV
- Normalización de datos
- Detección de problemas (duplicados, campos faltantes, etc)
- Resolución automática + interfaz manual
- Integración con análisis y dashboard existentes

**No incluye**:
- OCR automático para PDFs (Fase 3)
- Machine Learning o APIs externas
- Sincronización en tiempo real con bancos

---

## 2. Arquitectura de Componentes

```
┌─────────────────────────────────────────────────────────────┐
│ FRONTEND (Web)                                              │
├─────────────────────────────────────────────────────────────┤
│ • importador_ui.html    (cargar archivos)                  │
│ • resolvedor_problemas_ui.html (resolver inconsistencias)  │
└──────────────────┬──────────────────────────────────────────┘
                   │ API REST
┌──────────────────▼──────────────────────────────────────────┐
│ BACKEND (Python)                                            │
├─────────────────────────────────────────────────────────────┤
│ Rutas:                                                      │
│ • POST /api/importar          → importador_bancario.py     │
│ • GET  /api/diagnosticar      → post_importacion.py        │
│ • POST /api/resolver          → post_importacion.py        │
│ • POST /api/confirmar         → guardar en BD              │
└──────────────────┬──────────────────────────────────────────┘
                   │
┌──────────────────▼──────────────────────────────────────────┐
│ LÓGICA DE NEGOCIO                                           │
├─────────────────────────────────────────────────────────────┤
│ • importador_bancario.py                                    │
│   - ParserPrex, ParserItau, etc                            │
│   - CategorizadorLocal                                      │
│   - DetectorDuplicados                                      │
│   - NormalizadorFechas                                      │
│                                                             │
│ • post_importacion.py                                       │
│   - DetectorProblemas                                       │
│   - Resolvedor                                              │
│   - GestorPostImportacion                                   │
└──────────────────┬──────────────────────────────────────────┘
                   │
┌──────────────────▼──────────────────────────────────────────┐
│ BASE DE DATOS                                               │
├─────────────────────────────────────────────────────────────┤
│ • Tabla: movimientos                                        │
│   - id, fecha, cuenta, categoría, método_pago              │
│   - concepto, monto, descripción, moneda                    │
│   - origen_importación, fecha_importación                   │
│   - estado, hash_movimiento, metadata (JSON)               │
│                                                             │
│ • Tabla: reglas_categorización (local)                      │
│   - categoría, palabras_clave                              │
│                                                             │
│ • Tabla: importaciones (auditoría)                         │
│   - id, fecha, archivo, banco, cuenta                      │
│   - total_importados, total_descartados                    │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. Flujo de Datos

### 3.1 Importación Inicial

```
Usuario sube archivo
    ↓
Sistema detecta banco y formato
    ↓
Parser específico (ParserPrex, ParserItau, etc)
    ↓
Normalización de campos
    ├─ Fecha: DD/MM/YYYY → YYYY-MM-DD
    ├─ Monto: Débito/Crédito → Signo
    ├─ Concepto: Truncar a 100 chars
    └─ Categoría: Sugerir automáticamente
    ↓
Detección de duplicados (hash)
    ↓
Retornar lista de movimientos normalizados
```

### 3.2 Diagnóstico Post-Importación

```
Movimientos normalizados
    ↓
DetectorProblemas ejecuta 8 análisis:
    ├─ Duplicados exactos
    ├─ Duplicados potenciales
    ├─ Categorías faltantes
    ├─ Métodos de pago
    ├─ Conversiones de moneda
    ├─ Inconsistencias de saldo
    ├─ Fechas sospechosas
    └─ Descripciones incompletas
    ↓
Generar interfaz para usuario
    ├─ Si problema crítico → Mostrar opción
    ├─ Si sugerencia → Mostrar botón
    └─ Si info → Solo registrar
    ↓
Enviar a UI (JSON)
```

### 3.3 Resolución

```
Usuario interactúa con UI
    ↓
Recopilar decisiones en JSON:
{
  "duplicados": {"mov_id": "acción"},
  "categorias": {"mov_id": "categoría"},
  "metodos_pago": {"mov_id": "acción"}
}
    ↓
Aplicar cambios en backend
    ↓
Validación final
    ↓
Guardar en BD + auditoría
    ↓
Actualizar análisis y dashboard
```

---

## 4. Modelos de Datos

### 4.1 Movimiento (Normalizado)

```python
@dataclass
class Movimiento:
    id: str                    # UUID único (SHA256[:12])
    fecha: str                 # ISO 8601: YYYY-MM-DD
    cuenta: str                # "Prex Débito", "Itaú Corriente", etc
    categoria: str             # "Supermercado", "Transferencia", etc
    metodo_pago: str           # "Tarjeta Débito", "Transferencia", etc
    concepto: str              # Descripción corta (max 100 chars)
    monto: float               # Positivo (ingreso) o negativo (gasto)
    descripcion: str           # Opcional, detalles adicionales
    moneda: str                # "UYU", "USD", etc
    origen_importacion: str    # "prex_excel", "oca_pdf", etc
    fecha_importacion: str     # ISO 8601 de cuándo se importó
    estado: str                # "validado", "duplicado", "error"
    hash_movimiento: str       # SHA256(fecha|concepto|monto|cuenta)[:16]
    metadata: Dict             # Datos específicos del banco
```

### 4.2 Problema Detectado

```python
@dataclass
class ProblemaDetectado:
    tipo: str                  # "duplicado_exacto", "categoria_faltante", etc
    movimiento_id: str         # ID del movimiento con problema
    severidad: str             # "crítico", "advertencia", "info"
    descripcion: str           # Descripción legible
    sugerencia: str            # Qué hacer al respecto
    requiere_accion: bool      # Si necesita intervención del usuario
    metadata: Dict             # Datos específicos del problema
```

### 4.3 Resultado de Importación

```python
{
    "resumen": {
        "total_problemas": int,
        "criticos": int,
        "advertencias": int,
        "info": int,
        "requieren_accion": int,
        "problemas_por_tipo": {
            "duplicado_exacto": int,
            "categoria_faltante": int,
            ...
        }
    },
    "movimientos": [Movimiento],
    "problemas": [ProblemaDetectado]
}
```

---

## 5. Especificaciones por Banco

### 5.1 Prex

**Formato**: Excel (.xlsx)
**Columnas esperadas**:
```
| Fecha | Descripción | Moneda Origen | Importe Origen | Moneda | Importe | Estado |
```

**Mapeo a Fluxo**:
```
Fecha → fecha (DD/MM/YYYY → YYYY-MM-DD)
Descripción → concepto
Importe → monto
Moneda → moneda
Metadata → moneda_origen, importe_origen
Estado → solo importar si "Confirmado"
```

**Método de pago**: Tarjeta Débito (por defecto)

### 5.2 Itaú

**Formato**: Excel (.xlsx)
**Columnas esperadas**:
```
| Fecha | Descripción | Débito | Crédito | Saldo |
```

**Mapeo**:
```
Fecha → fecha
Descripción → concepto
Débito/Crédito → monto (negativo si Débito, positivo si Crédito)
Saldo → metadata.saldo (para validación)
```

**Método de pago**: Auto-detectar de descripción
- Si contiene "TRANSFERENCIA" → "Transferencia"
- Si contiene "DEPÓSITO" → "Depósito"
- Else → "Otro"

### 5.3 Otros bancos (Santander, BROU, etc)

Seguir patrón similar a Itaú o Prex según formato disponible.

---

## 6. Campos Requeridos vs Disponibles

| Campo Fluxo | Prex | Itaú | OCA | Disponible en BD |
|-------------|------|------|-----|------------------|
| Cuenta | ❌ | ❌ | ❌ | Usuario elige |
| Categoría | ❌ | ❌ | ❌ | Auto-sugerida |
| Método pago | ❌ | ❌ | ❌ | Auto o usuario |
| Concepto | ✅ | ✅ | ✅ | Del banco |
| Monto | ✅ | ✅ | ✅ | Del banco |
| Fecha | ✅ | ✅ | ✅ | Del banco |
| Descripción | ✅ | ✅ | ✅ | Del banco |

**Estrategia**:
- Campos ❌ → User input o auto-sugerencia
- Campos ✅ → Normalizados del archivo
- Validación: Todos los campos requeridos deben estar presentes

---

## 7. Reglas de Negocio

### 7.1 Categorización Automática

```python
# Base de datos de palabras clave
CATEGORIAS_REGLAS = {
    "Supermercado": ["MERCADO", "SUPER", "ALMACÉN", "CARREFOUR"],
    "Combustible": ["GASOLINA", "NAFTA", "YPF", "SHELL"],
    "Transferencia": ["TRANSFERENCIA", "TRN"],
    "Farmacia": ["FARMACIA", "FARMACÉUTICO"],
    # ... más categorías
}

# Búsqueda case-insensitive en concepto
# Orden: específico → general
# Confianza: categoría personalizada (95%) > predefinida (85%)
```

### 7.2 Duplicados

**Exacto**:
```
fecha == fecha AND
concepto.lower() == concepto.lower() AND
abs(monto - monto) < 0.01 AND
cuenta == cuenta
→ ELIMINAR (recomendado)
```

**Potencial**:
```
abs(fechas) <= 1 día AND
abs(montos) <= 5% AND
palabras_comunes(conceptos) > 0 AND
cuenta == cuenta
→ REVISAR (usuario decide)
```

### 7.3 Validación

Antes de guardar, verificar:
```
✓ Fecha válida (YYYY-MM-DD, no en el futuro, no > 2 años atrás)
✓ Monto válido (número, no cero)
✓ Concepto no vacío (max 100 chars)
✓ Cuenta seleccionada
✓ Categoría asignada
✓ Método de pago definido
```

### 7.4 Conversión de Moneda

Si moneda_origen ≠ moneda_destino:
```
Guardar tasa_cambio = monto_destino / monto_origen
Registrar para auditoría
Permitir importación igual
```

---

## 8. Integraciones Requeridas

### 8.1 Con Análisis Existentes

Después de importar, Fluxo debe:
1. Recalcular totales por categoría
2. Actualizar gráficos de ingresos/gastos
3. Regenerar resumen del período
4. Mostrar "X movimientos importados" en dashboard

### 8.2 Con Base de Datos

```python
# Insertar en tabla movimientos
INSERT INTO movimientos (...)
VALUES (...)

# Registrar en auditoría
INSERT INTO importaciones (...)
VALUES (...)

# Actualizar reglas aprendidas
UPDATE reglas_categorización
SET palabras_clave = [...] WHERE categoria = ...
```

### 8.3 Con Dashboard

```javascript
// Después de importación exitosa
fetchJSON('/api/resumen').then(data => {
  updateCharts(data);
  showNotification('✓ 97 movimientos importados');
});
```

---

## 9. Casos de Uso (User Stories)

### UC-1: Importar desde Prex

```
Given: Usuario con archivo prex_marzo.xlsx
When: Sube archivo a interfaz de importación
And: Elige banco = "Prex", cuenta = "Prex Débito"
Then: Sistema parsea 100 movimientos
And: Muestra resumen: 85 válidos, 15 requieren revisión
And: Usuario ve interfaz con tabs de problemas
And: Usuario selecciona categorías faltantes
And: Usuario confirma importación
Then: 97 movimientos guardados en BD
And: Dashboard se actualiza automáticamente
```

### UC-2: Resolver Duplicado Potencial

```
Given: 2 movimientos similares detectados
When: Usuario ve tab "Duplicados"
And: Lee descripción: "Fechas, montos y concepto muy parecidos"
And: Revisa detalles: diferencia de 1 día, $10, mismo comercio
Then: Usuario elige "Eliminar duplicado"
And: Movimiento marcado para descarte
And: Sistema continúa con resto
```

### UC-3: Asignar Categoría Manualmente

```
Given: Movimiento sin categoría
When: Usuario ve tab "Categorías"
And: Sistema sugiere 3 opciones basadas en concepto
And: Usuario selecciona "Compras Online"
Then: Categoría asignada
And: Sistema aprende: "AMAZON" → "Compras Online"
And: Próxima importación sugiere automáticamente
```

### UC-4: Manejar Error de Parsing

```
Given: 3 movimientos con errores (fecha inválida, monto vacío)
When: Usuario ve tab "Otros"
And: Lee error específico de cada uno
Then: Usuario puede:
  - Corregir manualmente (si permite edición)
  - Descartar movimiento
  - Volver a subir archivo corregido
```

---

## 10. Plan de Implementación

### Fase 1: MVP (Semana 1)

**Objetivo**: Importar Prex funcional sin intervención de usuario

- [ ] Crear `importador_bancario.py` con ParserPrex
- [ ] Crear `importador_ui.html` (cargar archivo)
- [ ] Crear rutas Flask/FastAPI para `/api/importar`
- [ ] Integración con BD existente
- [ ] Tests: parseo correcto de Prex

**Deliverables**:
- Usuario puede subir Excel de Prex
- Sistema normaliza automáticamente
- Movimientos guardados en BD

### Fase 2: Problemas + Resolución (Semana 2)

**Objetivo**: Detectar problemas y permitir resolverlos manualmente

- [ ] Crear `post_importacion.py` con DetectorProblemas
- [ ] Crear `resolvedor_problemas_ui.html`
- [ ] Crear rutas `/api/diagnosticar` y `/api/resolver`
- [ ] Lógica de auto-resolución (Nivel 1)
- [ ] UI interactiva con tabs

**Deliverables**:
- Sistema detecta 8 tipos de problemas
- UI permite resolver interactivamente
- Movimientos se guardan correctamente

### Fase 3: Más Bancos + Avanzado (Semana 3)

**Objetivo**: Soporte para Itaú, Santander, etc + OCR para PDFs

- [ ] Crear ParserItau, ParserSantander, etc
- [ ] Agregar OCR para PDFs (pytesseract)
- [ ] Mejorar aprendizaje de categorías
- [ ] Edición post-importación
- [ ] Reportes de importación

**Deliverables**:
- Soportar 8 bancos diferentes
- OCR funcional para OCA PDF
- Sistema aprende de usuario

---

## 11. Estructura de Archivos

```
fluxo/
├── backend/
│   ├── importador_bancario.py
│   ├── post_importacion.py
│   ├── routes/
│   │   └── importacion.py
│   └── models/
│       └── movimiento.py
│
├── frontend/
│   ├── importador_ui.html
│   ├── resolvedor_problemas_ui.html
│   └── js/
│       └── importacion.js (opcional)
│
├── database/
│   ├── migrations/
│   │   └── add_importacion_tables.sql
│   └── seed/
│       └── reglas_categorias.json
│
├── docs/
│   ├── ESPECIFICACION_TECNICA.md
│   ├── ARQUITECTURA.md
│   ├── API.md
│   ├── GUIA_USUARIO.md
│   └── PLAN_IMPLEMENTACION.md
│
└── tests/
    ├── test_parsers.py
    ├── test_detector_problemas.py
    └── test_resolvedor.py
```

---

## 12. Dependencias

**Backend**:
```
pandas>=1.3.0          # Lectura de Excel
openpyxl>=3.6.0       # Manejo de .xlsx
python-dateutil>=2.8  # Parseo de fechas
flask o fastapi        # Framework web
sqlalchemy>=1.4       # ORM
```

**Opcional (Fase 3)**:
```
pytesseract>=0.3.8    # OCR para PDFs
pdf2image>=1.16.0     # Conversión PDF a imagen
```

---

## 13. Testing

```python
# test_parsers.py
def test_parser_prex_normaliza_fechas()
def test_parser_prex_calcula_hash_correcto()
def test_parser_itau_combina_debito_credito()

# test_detector_problemas.py
def test_detecta_duplicados_exactos()
def test_detecta_duplicados_potenciales()
def test_detecta_categorias_faltantes()

# test_resolvedor.py
def test_auto_resuelve_nivel_1()
def test_procesa_respuestas_usuario()
def test_valida_movimientos_antes_guardar()
```

---

## 14. API Endpoints

### POST /api/importar
```json
Request:
{
  "file": File,
  "banco": "prex",
  "cuenta": "Prex Débito"
}

Response:
{
  "exitosos": 85,
  "duplicados": 2,
  "errores": 3,
  "movimientos": [...],
  "problemas": [...]
}
```

### GET /api/diagnosticar
```json
Request:
{
  "movimiento_ids": ["mov_001", "mov_002"]
}

Response:
{
  "resumen": {...},
  "problemas": [...],
  "interfaz": {...}
}
```

### POST /api/resolver
```json
Request:
{
  "duplicados": {"mov_001": "eliminar"},
  "categorias": {"mov_002": "Supermercado"},
  "metodos_pago": {"mov_003": "Transferencia"}
}

Response:
{
  "aplicados": 3,
  "errores": 0,
  "movimientos_finales": [...]
}
```

### POST /api/confirmar
```json
Request:
{
  "movimiento_ids": ["mov_001", "mov_005", ...],
  "importacion_id": "imp_20260331"
}

Response:
{
  "estado": "success",
  "total_guardados": 97,
  "total_descartados": 3,
  "mensaje": "Importación completada"
}
```

---

## 15. Consideraciones Importantes

1. **Rendimiento**: Para 1000+ movimientos, usar batch inserts
2. **Seguridad**: Validar todos los inputs, sanitizar concepto/descripción
3. **Manejo de errores**: Mostrar errores específicos al usuario
4. **Auditoría**: Guardar quién importó, cuándo, de dónde, qué cambió
5. **Idempotencia**: Importar 2 veces el mismo archivo no crea duplicados
6. **Reversibilidad**: Poder deshacer importación si es necesario

---

## 16. Métricas de Éxito

- ✓ Importación de Prex en <5 segundos (100 movimientos)
- ✓ Detección de problemas en <2 segundos
- ✓ Tasa de auto-resolución >70%
- ✓ Categorización correcta >85% (después de aprendizaje)
- ✓ 0 duplicados importados
- ✓ Usuario puede completar flujo en <3 minutos

---

Este documento define completamente el alcance, arquitectura y plan de implementación.
