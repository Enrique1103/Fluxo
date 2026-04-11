# 🚀 PROMPT MAESTRO: Sistema de Importación Bancaria para Fluxo

## CONTEXTO

Estás implementando un sistema de importación de movimientos bancarios para Fluxo (aplicación de gestión financiera).

**Documentos de referencia**:
1. `ESPECIFICACION_TECNICA.md` - Arquitectura, modelos, specs
2. `PLAN_IMPLEMENTACION.md` - Roadmap detallado por fase
3. Archivos existentes: `importador_bancario.py`, `post_importacion.py`, `importador_ui.html`, `resolvedor_problemas_ui.html`

---

## OBJETIVO GENERAL

Implementar un sistema de importación bancaria que:
1. Parsee archivos de múltiples bancos (Prex, OCA, Itaú, Santander, BROU, etc)
2. Normalice los datos automáticamente
3. Detecte problemas (duplicados, campos faltantes, inconsistencias)
4. Permita al usuario resolver problemas interactivamente
5. Guarde movimientos en BD y actualice análisis

**SIN** APIs externas ni IA. Todo local, simple, eficiente.

---

## FASES DE IMPLEMENTACIÓN

### FASE 1: MVP - Importación Funcional

Tu tarea es implementar la **FASE 1 COMPLETA** siguiendo el plan.

```
FASE 1 CHECKLIST:
├─ Base de datos
│  └─ CREATE TABLE movimientos
│  └─ CREATE TABLE importaciones
│  └─ Índices necesarios
│
├─ Backend (Python)
│  ├─ importador_bancario.py
│  │  ├─ ParserBancario (base)
│  │  ├─ ParserPrex (completo)
│  │  ├─ CategorizadorLocal
│  │  ├─ NormalizadorFechas
│  │  ├─ DetectorDuplicados
│  │  └─ ImportadorBancario (orquestador)
│  │
│  └─ routes/importacion.py
│     └─ POST /api/importar (completo)
│     └─ POST /api/guardar-importacion (completo)
│
├─ Frontend
│  └─ importador_ui.html (conectar con API)
│
└─ Tests
   └─ test_parsers.py (al 90% coverage)
   └─ test_importador.py (al 90% coverage)
```

---

## INSTRUCCIONES ESPECÍFICAS PARA PHASE 1

### 1. Base de Datos

Ejecuta este SQL en tu BD:

```sql
-- Tablas para importación
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
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_fecha (fecha),
    INDEX idx_cuenta (cuenta),
    INDEX idx_hash (hash_movimiento)
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

-- Tabla para reglas de categorización (Fase 2, pero crear aquí)
CREATE TABLE reglas_categorias (
    id INT AUTO_INCREMENT PRIMARY KEY,
    categoria VARCHAR(100),
    palabra_clave VARCHAR(100),
    confianza FLOAT DEFAULT 0.85,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unique_categoria_palabra (categoria, palabra_clave)
);

-- Seed inicial de reglas
INSERT INTO reglas_categorias (categoria, palabra_clave, confianza) VALUES
('Supermercado', 'MERCADO', 0.85),
('Supermercado', 'SUPER', 0.85),
('Supermercado', 'ALMACÉN', 0.85),
('Supermercado', 'CARREFOUR', 0.90),
('Combustible', 'GASOLINA', 0.90),
('Combustible', 'NAFTA', 0.90),
('Combustible', 'YPF', 0.95),
('Transferencia', 'TRANSFERENCIA', 0.95),
('Transferencia', 'TRN', 0.90),
('Farmacia', 'FARMACIA', 0.90),
-- ... agregar más según sea necesario
;
```

### 2. Backend - Estructura

Crear archivo: `backend/importador_bancario.py`

```python
# Estructura esperada:

from enum import Enum
from dataclasses import dataclass
from typing import List, Dict, Optional, Tuple
from datetime import datetime
import hashlib
import pandas as pd
import re

# 1. ENUMS
class Banco(Enum): ...
class EstadoMovimiento(Enum): ...

# 2. DATACLASSES
@dataclass
class Movimiento: ...

# 3. CLASES PRINCIPALES
class CategorizadorLocal: ...
class DetectorDuplicados: ...
class NormalizadorFechas: ...
class ParserBancario: ...
class ParserPrex(ParserBancario): ...
class ValidadorMovimientos: ...
class ImportadorBancario: ...

# 4. EJEMPLO DE USO (tests)
if __name__ == "__main__":
    importador = ImportadorBancario()
    resultado = importador.importar_archivo("prex.xlsx", Banco.PREX, "Prex Débito")
    print(f"Exitosos: {resultado['exitosos']}")
```

### 3. Requisitos Específicos para ParserPrex

```python
class ParserPrex(ParserBancario):
    """
    Lee Excel de Prex con columnas:
    Fecha | Descripción | Moneda Origen | Importe Origen | Moneda | Importe | Estado
    
    Mapea:
    - Fecha (DD/MM/YYYY) → fecha (YYYY-MM-DD)
    - Descripción → concepto (max 100 chars)
    - Importe → monto
    - Moneda → moneda
    - moneda_origen, importe_origen → metadata
    - Solo importar si Estado = "Confirmado"
    - Método de pago siempre: "Tarjeta Débito"
    """
    
    def parsear_excel(self, archivo: str, cuenta: str = "Prex Débito") -> List[Movimiento]:
        # 1. Leer Excel con pandas
        df = pd.read_excel(archivo)
        
        # 2. Para cada fila:
        #    - Validar Estado == "Confirmado"
        #    - Normalizar campos
        #    - Crear Movimiento
        #    - Calcular hash
        
        # 3. Retornar lista de Movimientos
        pass
```

### 4. Requisitos Específicos para CategorizadorLocal

```python
class CategorizadorLocal:
    """
    Categoriza movimientos basado en palabras clave.
    Aprende del usuario.
    """
    
    def __init__(self, archivo_reglas: str = "reglas_categorias.json"):
        # Cargar reglas predefinidas de BD (tabla reglas_categorias)
        # Cargar reglas personalizadas de archivo JSON local
        pass
    
    def categorizar(self, concepto: str) -> Tuple[Optional[str], float]:
        """
        Retorna: (categoría, confianza 0.0-1.0)
        
        Estrategia:
        1. Buscar en reglas personalizadas (confianza 0.95)
        2. Buscar en reglas predefinidas (confianza 0.85)
        3. Si no encuentra: retornar (None, 0.0)
        """
        pass
    
    def registrar_categorización(self, concepto: str, categoria: str):
        """
        Guardar patrón aprendido para futuras importaciones.
        """
        pass
```

### 5. Requisitos Específicos para DetectorDuplicados

```python
class DetectorDuplicados:
    """
    Detecta duplicados usando hash SHA256.
    """
    
    @staticmethod
    def generar_hash(fecha: str, concepto: str, monto: float, cuenta: str) -> str:
        """
        Hash único: SHA256(fecha|concepto|monto|cuenta)[:16]
        Determina si un movimiento es duplicado.
        """
        dato = f"{fecha}|{concepto}|{monto}|{cuenta}"
        return hashlib.sha256(dato.encode()).hexdigest()[:16]
    
    def es_duplicado(self, movimiento: Movimiento) -> bool:
        """
        Verificar si movimiento ya existe en BD.
        """
        pass
```

### 6. Requisitos Específicos para NormalizadorFechas

```python
class NormalizadorFechas:
    """
    Convierte cualquier formato de fecha a ISO 8601.
    """
    
    FORMATOS_SOPORTADOS = [
        "%d/%m/%Y",  # 31/03/2026
        "%d-%m-%Y",  # 31-03-2026
        "%Y/%m/%d",  # 2026/03/31
        "%Y-%m-%d",  # 2026-03-31
        "%d/%m/%y",  # 31/03/26
        "%m/%d/%Y",  # 03/31/2026 (US)
    ]
    
    @staticmethod
    def normalizar(fecha_str: str) -> str:
        """
        Retorna: YYYY-MM-DD
        Lanza ValueError si no puede parsear.
        """
        pass
```

### 7. API Route

Crear archivo: `backend/routes/importacion.py`

```python
from flask import request, jsonify
from werkzeug.utils import secure_filename
import os

@app.route('/api/importar', methods=['POST'])
def importar_archivo():
    """
    Recibe:
    - file: archivo Excel/CSV/PDF
    - banco: "prex", "itau", etc
    - cuenta: nombre de cuenta
    
    Retorna:
    {
        "exitosos": int,
        "duplicados": int,
        "errores": int,
        "movimientos": [...],
        "problemas": [...]
    }
    """
    
    if 'file' not in request.files:
        return jsonify({"error": "No file provided"}), 400
    
    file = request.files['file']
    banco = request.form.get('banco', 'prex')
    cuenta = request.form.get('cuenta', '')
    
    # 1. Guardar archivo temporalmente
    filename = secure_filename(file.filename)
    temp_path = os.path.join(TEMP_DIR, filename)
    file.save(temp_path)
    
    # 2. Importar
    importador = ImportadorBancario()
    resultado = importador.importar_archivo(temp_path, Banco[banco.upper()], cuenta)
    
    # 3. Limpiar temp
    os.remove(temp_path)
    
    # 4. Retornar
    return jsonify({
        "exitosos": len([m for m in resultado['movimientos'] if m.estado != 'error']),
        "duplicados": len([m for m in resultado['movimientos'] if m.estado == 'duplicado']),
        "errores": len([m for m in resultado['movimientos'] if m.estado == 'error']),
        "movimientos": [asdict(m) for m in resultado['movimientos']],
        "problemas": resultado.get('problemas', [])
    })

@app.route('/api/guardar-importacion', methods=['POST'])
def guardar_importacion():
    """
    Guarda movimientos en BD.
    
    Recibe:
    {
        "movimientos": [...]
    }
    
    Retorna:
    {
        "estado": "success",
        "total_guardados": int,
        "importacion_id": str
    }
    """
    
    data = request.get_json()
    movimientos_data = data.get('movimientos', [])
    
    # 1. Validar
    # 2. Generar IDs únicos
    # 3. Insertar en BD
    # 4. Registrar importación
    # 5. Retornar
    
    pass
```

### 8. Tests

Crear archivo: `backend/tests/test_importador.py`

```python
import pytest
from importador_bancario import *

class TestParserPrex:
    def test_parsea_excel_correctamente(self):
        # Crear archivo mock
        # Parsear
        # Verificar resultados
        pass
    
    def test_normaliza_fechas(self):
        parser = ParserPrex(Banco.PREX)
        # Verificar que DD/MM/YYYY → YYYY-MM-DD
        pass
    
    def test_ignora_movimientos_no_confirmados(self):
        # Crear Excel con Estado="Pendiente"
        # Verificar que no se importan
        pass

class TestCategorizadorLocal:
    def test_categoriza_automaticamente(self):
        cat = CategorizadorLocal()
        categoria, confianza = cat.categorizar("MERCADO TIKI")
        assert categoria == "Supermercado"
        assert confianza > 0.8
    
    def test_retorna_none_si_no_encuentra(self):
        cat = CategorizadorLocal()
        categoria, confianza = cat.categorizar("XYZ DESCONOCIDO")
        assert categoria is None
        assert confianza == 0.0

class TestDetectorDuplicados:
    def test_genera_hash_consistente(self):
        hash1 = DetectorDuplicados.generar_hash("2026-03-31", "MERCADO", -100.00, "Prex")
        hash2 = DetectorDuplicados.generar_hash("2026-03-31", "MERCADO", -100.00, "Prex")
        assert hash1 == hash2
        assert len(hash1) == 16

class TestNormalizadorFechas:
    def test_normaliza_dd_mm_yyyy(self):
        fecha = NormalizadorFechas.normalizar("31/03/2026")
        assert fecha == "2026-03-31"
    
    def test_lanza_error_fecha_invalida(self):
        with pytest.raises(ValueError):
            NormalizadorFechas.normalizar("invalid")

class TestImportadorBancario:
    def test_importa_archivo_prex(self):
        importador = ImportadorBancario()
        resultado = importador.importar_archivo("test_data/prex.xlsx", Banco.PREX, "Prex Débito")
        assert resultado['exitosos'] > 0
```

### 9. Ajustes a Frontend

En `importador_ui.html`:

```javascript
// Reemplazar mock con llamada real

function processImport() {
    const formData = new FormData();
    formData.append('file', selectedFile);
    formData.append('banco', document.getElementById('bankSelect').value);
    formData.append('cuenta', document.getElementById('accountInput').value);
    
    fetch('/api/importar', {
        method: 'POST',
        body: formData
    })
    .then(res => res.json())
    .then(data => {
        displayMovements(data);
        goToStep(3);
    })
    .catch(err => {
        alert('Error: ' + err.message);
    });
}

function confirmarImportacion() {
    const movimientos = [...]; // Recuperar de estado actual
    
    fetch('/api/guardar-importacion', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({movimientos})
    })
    .then(res => res.json())
    .then(data => {
        alert('✓ ' + data.total_guardados + ' movimientos importados');
        location.href = '/dashboard';
    });
}
```

---

## INSTRUCCIONES DE EJECUCIÓN PARA FASE 1

### Paso 1: Preparación
```bash
# Clonar repo (si no lo has hecho)
git clone ...
cd fluxo

# Setup ambiente
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install pandas openpyxl flask sqlalchemy pytest

# Crear base de datos
mysql -u root -p < sql/create_importacion_tables.sql
```

### Paso 2: Implementar Backend
```
1. Crear backend/importador_bancario.py
   - Copiar estructura de arriba
   - Implementar cada clase
   - Runear tests: pytest backend/tests/test_importador.py -v
   - Objetivo: 90% coverage

2. Crear backend/routes/importacion.py
   - Implementar endpoints
   - Testar con curl o Postman
```

### Paso 3: Conectar Frontend
```
1. Actualizar importador_ui.html
   - Reemplazar mock data con fetch() real
   - Testar flujo completo en navegador
```

### Paso 4: Testing Manual
```
1. Crear archivo test_data/prex.xlsx (sample)
2. Subir a interfaz
3. Verificar que aparezca en BD
4. Verificar que no haya duplicados si subes 2 veces
```

### Paso 5: Code Review + Deploy
```
1. Verificar cobertura >90%
2. Documentar en GUIA_USUARIO_FASE1.md
3. Push a repo
4. Deploy a staging: TODO
```

---

## ESTÁNDAR DE CÓDIGO

### Python
- PEP 8 (flake8)
- Type hints en todas las funciones
- Docstrings en todas las clases y funciones públicas
- Tests para cada función pública

### Commit Messages
```
[FASE-1] Implementar ParserPrex

- Parsear Excel de Prex
- Normalizar campos
- Calcular hash de duplicados
- Tests al 90%

Closes #123
```

---

## CRITERIOS DE ACEPTACIÓN FASE 1

Para considerar FASE 1 **COMPLETA**, verifica:

- [ ] Usuario puede subir archivo Prex.xlsx
- [ ] Sistema detecta formato y parsea en <5 segundos (100 movimientos)
- [ ] Movimientos aparecen en BD con todos los campos normalizados
- [ ] Fecha está en formato YYYY-MM-DD
- [ ] Monto tiene signo correcto (- para gasto, + para ingreso)
- [ ] Concepto truncado a max 100 chars
- [ ] Categoría sugerida automáticamente (si encuentra palabras clave)
- [ ] Hash calculado correctamente
- [ ] Si subes 2 veces el mismo archivo, NO hay duplicados en BD
- [ ] Dashboard muestra resumen de importación
- [ ] Todos los tests pasan (cobertura >90%)
- [ ] Código está documentado
- [ ] README actualizado con instrucciones

---

## PREGUNTAS FRECUENTES

**P: ¿Qué pasa si el Excel tiene columnas extras?**
A: Ignorarlas. Solo necesitas las columnas mencionadas. Pandas se encarga.

**P: ¿Y si la fecha está en formato incorrecto?**
A: `NormalizadorFechas` intenta varios formatos. Si ninguno funciona, lanza ValueError y el movimiento se marca como error.

**P: ¿Cómo manejo transacciones en BD?**
A: Para FASE 1, simple: importa todo o nada. Si hay 1 error, descartar toda la importación (o importar los válidos). FASE 2 permite granularidad.

**P: ¿Necesito migrar datos existentes?**
A: No. Las nuevas tablas son independientes. Datos viejos de Fluxo no se tocan.

**P: ¿A quién le pregunto si algo no funciona?**
A: Revisar `ESPECIFICACION_TECNICA.md` y `PLAN_IMPLEMENTACION.md` primero. Si aún no está claro, crear issue con contexto.

---

## PRÓXIMOS PASOS DESPUÉS DE FASE 1

Una vez FASE 1 esté completa y en production:

1. Code review con equipo
2. Feedback de usuarios
3. Comenzar FASE 2: Detección de problemas + UI interactiva
4. Actualizar plan según necesidades reales

---

## NOTAS IMPORTANTES

1. **No uses APIs externas**: TODO es local. Incluyendo BD local si es SQLite.
2. **No uses IA/ML**: Categorización es por palabras clave. Punto.
3. **Mantén simple**: Mejor un sistema simple y robusto que complejo y frágil.
4. **Documenta todo**: Futuros desarrolladores (o tú en 6 meses) lo agradecerán.
5. **Testa continuamente**: Los tests son tu red de seguridad.

---

## TIMELINE ESPERADO

- **Día 1**: DB setup + estructura Python (4 horas)
- **Día 2**: ParserPrex + CategorizadorLocal + DetectorDuplicados (3 horas)
- **Día 3**: API routes + Frontend integration + Tests (3 horas)
- **Día 4**: Testing manual + debugging (2 horas)

**Total FASE 1: ~12 horas = 1.5 días (si trabajas full-time)**

---

¡Adelante! 🚀 Sigue este prompt y habrás implementado un sistema robusto sin overthinking.
