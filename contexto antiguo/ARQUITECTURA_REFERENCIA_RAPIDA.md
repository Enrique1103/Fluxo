# Arquitectura del Sistema - Referencia Rápida

## 1. Flujo de Datos Completo

```
┌─────────────────────────────────────────────────────────────────┐
│                         USUARIO                                 │
└────────────┬──────────────────────────────────────────────┬─────┘
             │                                              │
             │ (1) Sube archivo Excel                       │
             ↓                                              │
┌─────────────────────────────────────────────────────────┐│
│ importador_ui.html                                      ││
│ - Drag & drop                                           ││
│ - Selecciona banco y cuenta                             ││
└──────┬────────────────────────────────────────────────┬─┘│
       │ POST /api/importar                             │  │
       │ (file, banco, cuenta)                          │  │
       ↓                                                │  │
┌─────────────────────────────────────────────────────┐│  │
│ Backend: routes/importacion.py                       ││  │
└────┬───────────────────────────────────────────────┬┘│  │
     │ Llamar ImportadorBancario                      │ │  │
     ↓                                                │ │  │
┌──────────────────────────────────────────────────┐ │ │  │
│ importador_bancario.py                           │ │ │  │
│                                                  │ │ │  │
│ ParserPrex.parsear_excel()                       │ │ │  │
│   ├─ Leer con pandas                             │ │ │  │
│   ├─ ParentesisNormalizar fechas                       │ │ │  │
│   ├─ NormalizadorFechas.normalizar()             │ │ │  │
│   ├─ Categorizar con CategorizadorLocal          │ │ │  │
│   ├─ Calcular hash (DetectorDuplicados)          │ │ │  │
│   └─ Retornar List[Movimiento]                   │ │ │  │
│                                                  │ │ │  │
│ ImportadorBancario.importar_archivo()            │ │ │  │
│   ├─ Validar movimientos                         │ │ │  │
│   ├─ Detectar duplicados en BD                   │ │ │  │
│   └─ Retornar resultado                          │ │ │  │
└──────┬───────────────────────────────────────────┘ │ │  │
       │ Response: {exitosos, duplicados, errores}   │ │  │
       ↓                                             │ │  │
       ├─────────────────────────────────────────────┘ │  │
       │                                               │  │
       │ (2) Mostrar resultado                        │  │
       ↓                                               │  │
│ importador_ui.html                                      │  │
│ - Resumen: 85 válidos, 15 requieren revisión           │  │
│ - Botón: "Siguiente"                                    │  │
└────────────┬────────────────────────────────────────────┬──┘
             │                                            │
             │ (3) Usuario clickea "Siguiente"            │
             ↓                                            │
│ POST /api/guardar-importacion                          │
│ {                                                      │
│   "movimientos": [...]                                 │
│ }                                                      │
             │                                            │
             ↓                                            │
┌────────────────────────────────────────────────────────┐
│ Backend: guardar en BD                                 │
│ - Insertar en tabla movimientos                        │
│ - Insertar en tabla importaciones                      │
│ - Actualizar reglas de categorización                  │
└────────┬──────────────────────────────────────────────┘
         │ Response: {estado: "success"}
         ↓
│ importador_ui.html
│ - Mostrar: "✓ 85 movimientos importados"              │
│ - Redirigir a dashboard                                │
└────────────────────────────────────────────────────────┘
```

---

## 2. Estructura de Carpetas

```
fluxo/
├── backend/
│   ├── __init__.py
│   ├── app.py                    # Flask/FastAPI app
│   ├── config.py                 # Configuración
│   │
│   ├── importador_bancario.py    # FASE 1
│   │   ├── Banco (enum)
│   │   ├── Movimiento (dataclass)
│   │   ├── ParserBancario
│   │   ├── ParserPrex
│   │   ├── CategorizadorLocal
│   │   ├── NormalizadorFechas
│   │   ├── DetectorDuplicados
│   │   ├── ValidadorMovimientos
│   │   └── ImportadorBancario
│   │
│   ├── post_importacion.py       # FASE 2
│   │   ├── ProblemaImportacion (enum)
│   │   ├── ProblemaDetectado
│   │   ├── DetectorProblemas
│   │   ├── Resolvedor
│   │   └── GestorPostImportacion
│   │
│   ├── routes/
│   │   ├── __init__.py
│   │   ├── importacion.py        # Endpoints importación
│   │   └── dashboard.py          # Endpoints dashboard
│   │
│   ├── models/
│   │   ├── __init__.py
│   │   ├── movimiento.py         # SQLAlchemy models
│   │   └── importacion.py
│   │
│   ├── database/
│   │   ├── __init__.py
│   │   ├── connection.py
│   │   └── migrations.py
│   │
│   └── tests/
│       ├── __init__.py
│       ├── test_parsers.py       # FASE 1
│       ├── test_importador.py
│       ├── test_detector.py      # FASE 2
│       └── test_resolvedor.py
│
├── frontend/
│   ├── importador_ui.html        # FASE 1
│   ├── resolvedor_problemas_ui.html  # FASE 2
│   └── js/
│       └── importacion.js        # JS helpers
│
├── database/
│   ├── migrations/
│   │   ├── 001_create_importacion_tables.sql
│   │   └── 002_add_rules_table.sql
│   └── seeds/
│       └── reglas_categorias.json
│
├── docs/
│   ├── ESPECIFICACION_TECNICA.md
│   ├── PLAN_IMPLEMENTACION.md
│   ├── PROMPT_MAESTRO_CLAUDE_CODE.md
│   ├── ARQUITECTURA.md            # Este archivo
│   └── API.md
│
└── tests/
    └── integration/
        └── test_flujo_completo.py
```

---

## 3. Clases Principales y Sus Responsabilidades

```
┌─────────────────────────────────────────────────────────────┐
│ ParserBancario (ABSTRACT)                                   │
├─────────────────────────────────────────────────────────────┤
│ Responsabilidad: Base para parsers específicos              │
│ Métodos:                                                     │
│ - parsear_excel(archivo, cuenta) → List[Movimiento]        │
│ - _crear_movimiento(datos, cuenta) → Movimiento            │
└─────────────────────────────────────────────────────────────┘
         △
         │
         ├─ ParserPrex
         ├─ ParserItau (Fase 3)
         └─ ...otros bancos (Fase 3)

┌─────────────────────────────────────────────────────────────┐
│ CategorizadorLocal                                           │
├─────────────────────────────────────────────────────────────┤
│ Responsabilidad: Categorizar movimientos automáticamente   │
│ Métodos:                                                     │
│ - categorizar(concepto) → (categoria, confianza)           │
│ - registrar_categorización(concepto, categoria)            │
│ - _cargar_reglas_predefinidas() → Dict                     │
│ - _cargar_reglas_personalizadas() → Dict                   │
│ - guardar_reglas_personalizadas()                          │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ NormalizadorFechas                                           │
├─────────────────────────────────────────────────────────────┤
│ Responsabilidad: Convertir cualquier formato a ISO 8601    │
│ Métodos:                                                     │
│ - @staticmethod normalizar(fecha_str) → "YYYY-MM-DD"       │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ DetectorDuplicados                                           │
├─────────────────────────────────────────────────────────────┤
│ Responsabilidad: Detectar y prevenir duplicados            │
│ Métodos:                                                     │
│ - @staticmethod generar_hash(...) → str[16]                │
│ - es_duplicado(movimiento) → bool                          │
│ - es_similar(mov1, mov2) → bool                            │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ ImportadorBancario                                           │
├─────────────────────────────────────────────────────────────┤
│ Responsabilidad: Orquestar importación de archivos         │
│ Métodos:                                                     │
│ - importar_archivo(archivo, banco, cuenta) → Dict          │
│ - guardar_db(movimientos) → int                            │
│ - _cargar_bd() → List[Movimiento]                          │
│ - guardar_bd()                                              │
└─────────────────────────────────────────────────────────────┘

(FASE 2)

┌─────────────────────────────────────────────────────────────┐
│ DetectorProblemas                                            │
├─────────────────────────────────────────────────────────────┤
│ Responsabilidad: Detectar 8 tipos de problemas             │
│ Métodos:                                                     │
│ - ejecutar_diagnostico() → List[ProblemaDetectado]         │
│ - _detectar_duplicados(mov)                                │
│ - _detectar_categoria_faltante(mov)                        │
│ - ... (6 métodos más)                                      │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ Resolvedor                                                   │
├─────────────────────────────────────────────────────────────┤
│ Responsabilidad: Resolver automáticamente o manual          │
│ Métodos:                                                     │
│ - resolver_duplicados(estrategia) → Dict                   │
│ - resolver_categorias(estrategia) → Dict                   │
│ - resolver_metodos_pago() → Dict                           │
│ - aplicar_correcciones_batch(correcciones) → Dict          │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ GestorPostImportacion                                        │
├─────────────────────────────────────────────────────────────┤
│ Responsabilidad: Orquestar diagnóstico y resolución        │
│ Métodos:                                                     │
│ - diagnosticar() → Dict                                    │
│ - resolver_automaticamente() → Dict                        │
│ - generar_interfaz_manual() → Dict                         │
│ - procesar_respuestas_usuario(respuestas) → Dict          │
│ - finalizar_importacion() → Dict                           │
└─────────────────────────────────────────────────────────────┘
```

---

## 4. Flujo de Movimiento a Través del Sistema

```
ARCHIVO EXCEL
     │
     ├─→ [ParserPrex] Leer datos crudos
     │
     ├─→ [Para cada fila]
     │     │
     │     ├─→ [NormalizadorFechas] Normalizar fecha
     │     │
     │     ├─→ [CategorizadorLocal] Sugerir categoría
     │     │
     │     ├─→ [DetectorDuplicados] Calcular hash
     │     │
     │     └─→ [Crear objeto Movimiento]
     │
     └─→ [List[Movimiento]]
             │
             ├─→ [ValidadorMovimientos] Validar campos
             │
             ├─→ [ImportadorBancario] Detectar dups en BD
             │
             └─→ [Resultado]
                   │
                   ├─ exitosos: Int
                   ├─ duplicados: Int
                   ├─ errores: Int
                   └─ movimientos: List[Movimiento]
```

---

## 5. Flujo de Base de Datos

```
INSERCIÓN

Movimiento (objeto)
     │
     ├─ Validar (ValidadorMovimientos)
     │
     ├─ Generar ID único (SHA256)
     │
     ├─ Convertir a Dict
     │
     └─→ INSERT INTO movimientos (...)
              │
              ├─ fecha → DATE
              ├─ cuenta → VARCHAR
              ├─ categoria → VARCHAR
              ├─ monto → DECIMAL
              ├─ hash_movimiento → VARCHAR (índice)
              ├─ metadata → JSON
              └─ ...otros campos
              
BÚSQUEDA (Detectar duplicados)

SELECT * FROM movimientos 
WHERE hash_movimiento = 'abc123def456'
     │
     └─ Resultado: Encontrado = Duplicado


ACTUALIZACIÓN (Categorías aprendidas)

UPDATE reglas_categorias 
SET palabra_clave = [...]
WHERE categoria = 'Supermercado'
```

---

## 6. Mapeo de Campos: Banco → Fluxo

```
PREX
┌──────────────────┬────────────────┬─────────────┐
│ Campo Excel      │ Campo Fluxo    │ Transformación │
├──────────────────┼────────────────┼─────────────┤
│ Fecha            │ fecha          │ DD/MM → YYYY-MM-DD │
│ Descripción      │ concepto       │ Truncar a 100 chars │
│ Importe          │ monto          │ Usar tal cual      │
│ Moneda           │ moneda         │ Usar tal cual      │
│ N/A              │ cuenta         │ Usuario input      │
│ N/A              │ categoría      │ Auto-sugerir       │
│ N/A              │ método_pago    │ "Tarjeta Débito"   │
│ Moneda Origen    │ metadata       │ Guardar            │
│ Importe Origen   │ metadata       │ Guardar            │
└──────────────────┴────────────────┴─────────────┘

ITAÚ
┌──────────────────┬────────────────┬─────────────┐
│ Campo Excel      │ Campo Fluxo    │ Transformación │
├──────────────────┼────────────────┼─────────────┤
│ Fecha            │ fecha          │ DD/MM → YYYY-MM-DD │
│ Descripción      │ concepto       │ Truncar a 100 chars │
│ Débito           │ monto          │ -Débito si > 0    │
│ Crédito          │ monto          │ +Crédito si > 0   │
│ N/A              │ cuenta         │ Usuario input      │
│ N/A              │ categoría      │ Auto-sugerir       │
│ Descripción      │ método_pago    │ Auto-detectar      │
│ Saldo            │ metadata       │ Guardar            │
└──────────────────┴────────────────┴─────────────┘
```

---

## 7. Diagrama de Estados de Movimiento

```
┌────────────────┐
│    CREADO      │  (Objeto en memoria)
└────────┬───────┘
         │
         ├─→ [Validación] → Error
         │                     │
         │                     └─→ ┌──────────┐
         │                         │  ERROR   │
         │                         └──────────┘
         │
         ├─→ [Detección duplicados]
         │
         ├─ Exacto    → ┌────────────────────┐
         │              │ DUPLICADO_EXACTO   │
         │              └────────────────────┘
         │
         ├─ Potencial → ┌────────────────────┐
         │              │ DUPLICADO_POTENCIAL│
         │              └────────────────────┘
         │
         └─→ ┌──────────────┐
             │ CONFIRMADO   │  (Listo para guardar)
             └──────┬───────┘
                    │
                    └─→ [Guardar en BD]
                         │
                         └─→ ┌───────────┐
                             │ VALIDADO  │  (En BD)
                             └───────────┘
```

---

## 8. Tabla de Decisiones: ¿Qué hace quién?

| Decisión | Quién lo decide | Cuándo |
|----------|-----------------|--------|
| Formato de archivo es válido | ParserBancario | Al parsear |
| Fecha es válida | NormalizadorFechas | Al parsear |
| Movimiento es duplicado | DetectorDuplicados | Al parsear |
| Categoría sugerida | CategorizadorLocal | Al parsear |
| Monto es correcto | ValidadorMovimientos | Antes de guardar |
| Es problema crítico | DetectorProblemas | Después de importar |
| Se auto-resuelve | Resolvedor (Nivel 1) | Automáticamente |
| Requiere intervención | GestorPostImportacion | Si no se auto-resuelve |
| Guardar o descartar | Usuario (UI) | En UI interactiva |

---

## 9. Integración con Fluxo Existente

```
Fluxo Actual
├── Dashboard
│   └── Muestra resumen de movimientos
│
├── Análisis
│   ├── Suma por categoría
│   ├── Gráficos de ingresos/gastos
│   └── Reportes
│
└── Base de datos
    └── Tabla existente: movimientos (?)

NUEVA INTEGRACIÓN
│
├── [Sistema de Importación]
│   ├── Parsea archivos
│   ├── Normaliza datos
│   ├── Detecta problemas
│   └── Inserta en tabla movimientos
│
├── [Trigger: Recalcular análisis]
│   ├── Actualizar sumas por categoría
│   ├── Regenerar gráficos
│   └── Mostrar notificación en dashboard
│
└── [UI de importación]
    ├── importador_ui.html
    └── resolvedor_problemas_ui.html
```

---

## 10. Checklist Rápido: Implementación FASE 1

```
ANTES DE EMPEZAR:
□ Base de datos creada
□ Tablas: movimientos, importaciones, reglas_categorias
□ Índices creados
□ Python 3.8+
□ pandas, openpyxl instalados

DESARROLLO:
□ ParserBancario (clase base)
□ ParserPrex (completo)
□ CategorizadorLocal
□ NormalizadorFechas
□ DetectorDuplicados
□ ValidadorMovimientos
□ ImportadorBancario

INTEGRACIONES:
□ Routes: POST /api/importar
□ Routes: POST /api/guardar-importacion
□ Frontend: importador_ui.html conectado

TESTING:
□ test_parsers.py (90%+ coverage)
□ test_importador.py (90%+ coverage)
□ Tests manuales con archivo real Prex

DOCUMENTACIÓN:
□ Docstrings en todas las clases
□ README actualizado
□ GUIA_USUARIO_FASE1.md

DEPLOYMENT:
□ Code review pasado
□ Tests CI/CD pasados
□ Merge a main
□ Deploy a staging/production
```

---

Este documento es tu mapa de referencia. Cuando algo no esté claro, vuélvelo a revisar aquí primero.
