# Plan de Implementación: Sistema de Importación Bancaria

## Estructura: 3 Fases, Entregables Incrementales

---

## FASE 1: MVP - Importación Funcional (Estimado: 8 horas)

### Objetivo
Usuario puede importar archivos de Prex, normalizarlos automáticamente y guardarlos en BD.

### Tareas

#### 1.1 Base de datos (30 min)
```sql
-- Crear tabla movimientos
CREATE TABLE movimientos (
    id VARCHAR(32) PRIMARY KEY,
    fecha DATE NOT NULL,
    cuenta VARCHAR(100) NOT NULL,
    categoria VARCHAR(100),
    metodo_pago VARCHAR(50),
    concepto VARCHAR(100) NOT NULL,
    monto DECIMAL(12, 2) NOT NULL,
    descripcion TEXT,
    moneda VARCHAR(5) DEFAULT 'UYU',
    origen_importacion VARCHAR(50),
    fecha_importacion DATETIME,
    estado VARCHAR(20),
    hash_movimiento VARCHAR(16),
    metadata JSON,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE importaciones (
    id VARCHAR(32) PRIMARY KEY,
    fecha DATETIME NOT NULL,
    archivo VARCHAR(255),
    banco VARCHAR(50),
    cuenta VARCHAR(100),
    total_importados INT,
    total_descartados INT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Índices
CREATE INDEX idx_fecha ON movimientos(fecha);
CREATE INDEX idx_cuenta ON movimientos(cuenta);
CREATE INDEX idx_hash ON movimientos(hash_movimiento);
```

#### 1.2 Módulo de importación (2 horas)
**Archivo**: `backend/importador_bancario.py`

Implementar:
```python
class ParserBancario:
    def parsear_excel(archivo, cuenta) → List[Movimiento]
    def _crear_movimiento(datos, cuenta) → Movimiento

class ParserPrex(ParserBancario):
    def parsear_excel(archivo, cuenta="Prex Débito") → List[Movimiento]
    # Lectura de Excel
    # Normalización de campos
    # Validaciones básicas

class CategorizadorLocal:
    def __init__(archivo_reglas)
    def categorizar(concepto) → Tuple[str, float]
    def registrar_categorización(concepto, categoria)

class NormalizadorFechas:
    @staticmethod
    def normalizar(fecha_str) → str  # → YYYY-MM-DD

class DetectorDuplicados:
    @staticmethod
    def generar_hash(fecha, concepto, monto, cuenta) → str
    def es_duplicado(movimiento) → bool

class ImportadorBancario:
    def importar_archivo(archivo, banco, cuenta) → Dict
    def guardar_db(movimientos) → int
```

Pruebas:
```python
def test_parser_prex_lee_excel()
def test_normaliza_fechas_correctamente()
def test_calcula_hash_sha256()
def test_detecta_duplicados()
```

#### 1.3 Rutas API (1 hora)
**Archivo**: `backend/routes/importacion.py`

```python
@app.post("/api/importar")
def importar_archivo(file: UploadFile, banco: str, cuenta: str):
    # 1. Guardar archivo temporalmente
    # 2. Llamar ImportadorBancario.importar_archivo()
    # 3. Retornar resultado (exitosos, duplicados, errores)

@app.post("/api/guardar-importacion")
def guardar_importacion(movimientos: List[Dict]):
    # 1. Validar cada movimiento
    # 2. Insertar en BD
    # 3. Registrar en tabla importaciones
    # 4. Retornar confirmación
```

#### 1.4 UI de carga (1 hora)
**Archivo**: `frontend/importador_ui.html` (ya creado, ajustar)

Cambios:
- Conectar con `/api/importar` real
- Mostrar progreso de procesamiento
- Validar respuesta del servidor
- Redirigir a dashboard después de guardar

#### 1.5 Integración con dashboard (1 hora)
```python
# En ruta de dashboard
@app.get("/dashboard")
def dashboard():
    # ... datos existentes ...
    # Agregar:
    ultimas_importaciones = db.query(Importaciones).limit(5)
    total_importados_mes = sum([imp.total_importados for imp in importaciones_mes])
    # Pasar a template
```

#### 1.6 Tests (1 hora)
- Test de parseo de Prex
- Test de normalización
- Test de API endpoints
- Test end-to-end (upload → BD)

### Entregables Fase 1
- ✅ `importador_bancario.py` (completo)
- ✅ `routes/importacion.py` (endpoint POST /api/importar)
- ✅ `importador_ui.html` (conectado)
- ✅ Tabla `movimientos` en BD
- ✅ 90% cobertura de tests
- ✅ Documentación: GUIA_USUARIO_FASE1.md

### Criterios de Aceptación
- [ ] Usuario puede subir archivo Prex.xlsx
- [ ] Sistema normaliza 100 movimientos en <5 segundos
- [ ] Movimientos aparecen en BD sin errores
- [ ] Dashboard muestra resumen de importación
- [ ] No hay duplicados en BD después de importar 2 veces

---

## FASE 2: Detección y Resolución de Problemas (Estimado: 10 horas)

### Objetivo
Sistema detecta problemas automáticamente y ofrece interfaz para resolverlos.

### Tareas

#### 2.1 Módulo de detección (3 horas)
**Archivo**: `backend/post_importacion.py`

Implementar:
```python
class ProblemaImportacion(Enum):
    DUPLICADO_EXACTO
    DUPLICADO_POTENCIAL
    CATEGORIA_FALTANTE
    METODO_PAGO_INCORRECTO
    CONVERSION_MONEDA
    INCONSISTENCIA_SALDO
    FECHA_SOSPECHOSA
    DESCRIPCION_INCOMPLETA

class DetectorProblemas:
    def __init__(movimientos_importados, movimientos_existentes)
    def ejecutar_diagnostico() → List[ProblemaDetectado]
    
    def _detectar_duplicados(mov)
    def _detectar_categoria_faltante(mov)
    def _detectar_metodo_pago(mov)
    def _detectar_conversion_moneda(mov)
    def _detectar_inconsistencia_saldo(mov)
    def _detectar_descripcion(mov)
    def _detectar_fecha_sospechosa(mov)
    def _detectar_monto_negativo(mov)
```

Pruebas:
```python
def test_detecta_duplicado_exacto()
def test_detecta_duplicado_potencial()
def test_sugiere_categoria()
def test_detecta_fecha_futuro()
```

#### 2.2 Módulo de resolución (2.5 horas)
**Archivo**: `backend/post_importacion.py` (continuación)

Implementar:
```python
class Resolvedor:
    def __init__(movimientos)
    
    def resolver_duplicados(estrategia) → Dict
    def resolver_categorias(estrategia) → Dict
    def resolver_metodos_pago() → Dict
    def aplicar_tasas_cambio(tasas) → Dict
    def aplicar_correcciones_batch(correcciones) → Dict

class GestorPostImportacion:
    def diagnosticar() → Dict
    def resolver_automaticamente() → Dict
    def generar_interfaz_manual() → Dict
    def procesar_respuestas_usuario(respuestas) → Dict
    def finalizar_importacion() → Dict
```

Pruebas:
```python
def test_auto_resuelve_nivel_1()
def test_genera_interfaz_correcta()
def test_procesa_respuestas_usuario()
def test_valida_movimientos_finales()
```

#### 2.3 Rutas API (2 horas)
**Archivo**: `backend/routes/importacion.py` (extensión)

```python
@app.post("/api/diagnosticar")
def diagnosticar(movimiento_ids: List[str]):
    # 1. Recuperar movimientos de BD
    # 2. Llamar GestorPostImportacion.diagnosticar()
    # 3. Retornar problemas + interfaz

@app.post("/api/resolver")
def resolver(respuestas_usuario: Dict):
    # 1. Validar respuestas
    # 2. Llamar GestorPostImportacion.procesar_respuestas_usuario()
    # 3. Aplicar cambios
    # 4. Retornar confirmación

@app.get("/api/resumen-importacion")
def resumen_importacion(importacion_id: str):
    # Retornar estadísticas de importación
```

#### 2.4 UI de resolución (2 horas)
**Archivo**: `frontend/resolvedor_problemas_ui.html` (ya creado, ajustar)

Cambios:
- Conectar con `/api/diagnosticar` real
- Conectar botones con `/api/resolver`
- Mostrar datos dinámicos (no mockeados)
- Actualizar contadores en tiempo real

#### 2.5 Integración workflow (0.5 horas)
```python
# Modificar POST /api/importar para:
# 1. Importar movimientos
# 2. Diagnosticar automáticamente
# 3. Si hay problemas, redirigir a resolvedor
# 4. Si está limpio, guardar directamente
```

#### 2.6 Tests (1 hora)
- Tests de detección de cada problema
- Tests de resolución automática
- Tests de interfaz generada
- Tests end-to-end del flujo completo

### Entregables Fase 2
- ✅ `post_importacion.py` (completo)
- ✅ Rutas `/api/diagnosticar` y `/api/resolver`
- ✅ `resolvedor_problemas_ui.html` (conectado)
- ✅ 85% cobertura de tests
- ✅ Documentación: GUIA_RESOLUCION.md

### Criterios de Aceptación
- [ ] Sistema detecta los 8 tipos de problemas
- [ ] Nivel 1 auto-resuelve >70% de casos
- [ ] UI muestra problemas y permite resolverlos
- [ ] Usuario completa flujo en <5 minutos
- [ ] Datos se guardan correctamente después de resolver

---

## FASE 3: Múltiples Bancos + Avanzado (Estimado: 8 horas)

### Objetivo
Soportar múltiples bancos, OCR para PDFs, edición post-importación, reportes.

### Tareas

#### 3.1 Parsers adicionales (2 horas)
**Archivo**: `backend/importador_bancario.py` (extensión)

Implementar:
```python
class ParserItau(ParserBancario):
    # Maneja columnas Débito/Crédito
    # Auto-detecta método de pago

class ParserSantander(ParserBancario):
    # Similar a Itaú

class ParserBROU(ParserBancario):
    # Maneja formato antiguo

class ParserOCA(ParserBancario):
    # Requiere OCR de PDF
```

Pruebas:
```python
def test_parser_itau_combina_debito_credito()
def test_parser_santander_normaliza()
def test_parser_brou_parsea_formato_texto()
```

#### 3.2 Mejoras a categorización (1.5 horas)
**Archivo**: `backend/importador_bancario.py`

Implementar:
```python
class CategorizadorLocal:
    # Agregar:
    def aprender_patron(concepto, categoria)
    def sugerir_multiples(concepto) → List[Tuple[str, float]]
    def evaluar_precision(dataset) → float
```

Agregar reglas predefinidas:
```json
{
  "Supermercado": ["MERCADO", "SUPER", "ALMACÉN", ...],
  "Combustible": ["GASOLINA", "NAFTA", "YPF", ...],
  // ... completo
}
```

#### 3.3 OCR para PDFs (2 horas)
**Archivo**: `backend/importador_bancario.py`

Implementar:
```python
class ParserOCA(ParserBancario):
    def parsear_pdf(archivo, cuenta) → List[Movimiento]
    def _aplicar_ocr(pdf_path) → List[Dict]
    def _extraer_tabla_pdf(pdf_path) → DataFrame
```

Pruebas:
```python
def test_ocr_extrae_texto_correctamente()
def test_parsea_tabla_del_pdf()
```

#### 3.4 Edición post-importación (1 hora)
**Archivo**: `backend/routes/importacion.py` (extensión)

```python
@app.put("/api/movimientos/{mov_id}")
def editar_movimiento(mov_id: str, cambios: Dict):
    # Editar: categoría, método_pago, concepto, descripción
    # Validar antes de guardar
    # Actualizar metadata (quién editó, cuándo)

@app.get("/api/movimientos/{mov_id}/historial")
def historial_movimiento(mov_id: str):
    # Mostrar cambios realizados
```

#### 3.5 Reportes de importación (1 hora)
**Archivo**: `backend/routes/importacion.py` (extensión)

```python
@app.get("/api/reportes/importaciones")
def reporte_importaciones(fecha_inicio, fecha_fin):
    # Resumen de importaciones
    # Bancos importados, totales, problemas

@app.get("/api/reportes/categorias-aprendidas")
def reporte_categorias():
    # Mostrar reglas aprendidas
```

#### 3.6 Tests adicionales (0.5 horas)
- Tests de nuevos parsers
- Tests de OCR
- Tests de edición
- Tests de reportes

### Entregables Fase 3
- ✅ `ParserItau`, `ParserSantander`, `ParserBROU`, `ParserOCA`
- ✅ Sistema de aprendizaje mejorado
- ✅ OCR funcional para PDFs
- ✅ Endpoints de edición y reportes
- ✅ 80% cobertura de tests
- ✅ Documentación: GUIA_AVANZADA.md

### Criterios de Aceptación
- [ ] Soporta 8 bancos diferentes
- [ ] OCR en PDFs funciona correctamente
- [ ] Usuario puede editar movimientos después de importar
- [ ] Reportes muestran datos correctos
- [ ] Sistema aprende de usuario (categorías)

---

## Roadmap Visual

```
SEMANA 1:
┌─────────────────────────────────────────┐
│ FASE 1: MVP                             │
│ - Parseo Prex                           │
│ - Normalización                         │
│ - Guardado en BD                        │
│ Estimado: 8 horas                       │
└─────────────────────────────────────────┘
        ↓
SEMANA 2:
┌─────────────────────────────────────────┐
│ FASE 2: Problemas + Resolución          │
│ - Detección de 8 problemas              │
│ - Auto-resolución                       │
│ - UI interactiva                        │
│ - Aprendizaje de categorías             │
│ Estimado: 10 horas                      │
└─────────────────────────────────────────┘
        ↓
SEMANA 3:
┌─────────────────────────────────────────┐
│ FASE 3: Avanzado                        │
│ - Múltiples bancos                      │
│ - OCR para PDFs                         │
│ - Edición post-importación              │
│ - Reportes                              │
│ Estimado: 8 horas                       │
└─────────────────────────────────────────┘

Total: 26 horas de desarrollo
```

---

## Checklist de Implementación

### Antes de Empezar
- [ ] Clone repositorio de Fluxo
- [ ] Setup entorno virtual Python
- [ ] Instale dependencias (pandas, openpyxl, flask/fastapi)
- [ ] Base de datos creada y migrada
- [ ] Tests configurados (pytest)

### FASE 1
- [ ] Crear `importador_bancario.py`
- [ ] Crear tabla `movimientos` en BD
- [ ] Implementar `ParserPrex`
- [ ] Crear `/api/importar`
- [ ] Conectar `importador_ui.html`
- [ ] Tests pasando al 90%
- [ ] Code review
- [ ] Deploy a staging

### FASE 2
- [ ] Crear `post_importacion.py`
- [ ] Implementar `DetectorProblemas`
- [ ] Implementar `GestorPostImportacion`
- [ ] Crear `/api/diagnosticar` y `/api/resolver`
- [ ] Conectar `resolvedor_problemas_ui.html`
- [ ] Tests pasando al 85%
- [ ] Code review
- [ ] Deploy a staging

### FASE 3
- [ ] Implementar parsers adicionales
- [ ] Agregar OCR para PDFs
- [ ] Crear endpoints de edición
- [ ] Crear endpoints de reportes
- [ ] Tests pasando al 80%
- [ ] Code review
- [ ] Deploy a production

---

## Estimación de Esfuerzo

| Fase | Actividad | Horas | Esfuerzo |
|------|-----------|-------|----------|
| 1 | Base de datos | 0.5 | Bajo |
| 1 | Importador | 2 | Medio |
| 1 | API | 1 | Bajo |
| 1 | UI | 1 | Bajo |
| 1 | Integración | 1 | Bajo |
| 1 | Tests | 1 | Bajo |
| **1 Total** | | **6.5** | **Bajo** |
| 2 | Detección | 3 | Medio |
| 2 | Resolución | 2.5 | Medio |
| 2 | API | 2 | Medio |
| 2 | UI | 2 | Medio |
| 2 | Integración | 0.5 | Bajo |
| 2 | Tests | 1 | Bajo |
| **2 Total** | | **11** | **Medio** |
| 3 | Parsers | 2 | Medio |
| 3 | Categorización | 1.5 | Bajo |
| 3 | OCR | 2 | Alto |
| 3 | Edición | 1 | Bajo |
| 3 | Reportes | 1 | Bajo |
| 3 | Tests | 0.5 | Bajo |
| **3 Total** | | **8** | **Medio** |
| **TOTAL** | | **25.5** | **Medio** |

---

## Riesgos y Mitigación

| Riesgo | Probabilidad | Impacto | Mitigación |
|--------|-------------|--------|-----------|
| Formato PDF varía por banco | Alta | Alto | Usar librería robusta, tests extensos |
| Performance con 1000+ movimientos | Media | Medio | Usar batch inserts, índices BD |
| Errores en normalización de fechas | Media | Bajo | Librería `dateutil`, tests exhaustivos |
| Duplicados no detectados | Baja | Alto | Hash fuerte (SHA256), tests |
| UI no responsiva | Baja | Bajo | Testing en móvil durante Fase 2 |

---

## Métricas de Progreso

- **Líneas de código**: Fase 1: ~500, Fase 2: ~1000, Fase 3: ~800
- **Cobertura de tests**: Fase 1: 90%, Fase 2: 85%, Fase 3: 80%
- **Documentación**: Cada fase genera docs
- **Performance**: <5s para 100 movimientos (benchmark)

---

Este plan es iterativo e incremental. Cada fase es completamente funcional y puede deployarse independientemente.
