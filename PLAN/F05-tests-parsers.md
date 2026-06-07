# F05 — Tests para los 9 Parsers Bancarios

> **Prioridad:** 🔴 Alta (deuda técnica crítica)
> **Estimación:** 1-2 fines de semana (6-10 horas)
> **Dependencias:** Ninguna. Es independiente y se puede hacer en cualquier momento.

---

## 🎯 PRD — Product Requirements

### Problema que resuelve

Fluxo tiene **10 parsers bancarios en producción** (Prex, BROU, Itaú, Santander, OCA, Mercado Pago, Ualá, MiDinero, Scotiabank, Zcuentas), pero **solo BROU tiene tests específicos**. Los otros 9 están "en producción sin red de seguridad".

Esto significa que cualquier cambio en código compartido (encoding, fechas, decimales, deduplicación) puede romper silenciosamente uno o varios parsers, y solo se detecta cuando un usuario reporta el bug.

### Casos reales que esto evitaría

**Caso 1: Cambio en utilidad común**
Hace 3 meses se modificó la función `normalize_concept()` para agregar trim de espacios. Eso rompió el parser de MiDinero porque dependía de espacios para detectar el header. **Nadie se enteró durante 2 semanas hasta que un usuario reportó.**

**Caso 2: Banco cambia su formato**
Itaú lanza nueva versión del home banking y cambia el separador CSV de `,` a `;`. El parser deja de funcionar. **Sin tests, no hay forma de saber qué dejó de funcionar y qué no.**

**Caso 3: Refactor inocente**
Se mejora la lógica de detección de duplicados. El cambio funciona perfecto en BROU (donde hay tests), pero rompe Santander que tenía un comportamiento sutilmente distinto.

### Hipótesis del producto

Con tests robustos por parser, el desarrollador:
- Puede refactorizar con confianza
- Detecta bugs antes que los usuarios
- Tiene un "contrato" de qué se espera de cada parser
- Identifica formato changes de bancos rápidamente

### Métricas de éxito

- ✅ Cada parser tiene mínimo 3 tests específicos
- ✅ Existe una carpeta `tests/fixtures/` con archivos reales (anonimizados) por banco
- ✅ Los tests corren en CI/CD automáticamente
- ✅ Cobertura de código del módulo `importacion_service.py` aumenta significativamente

### Out of scope (explícito)

❌ NO se refactoriza el `importacion_service.py` (eso es trabajo separado, está en BACKLOG)
❌ NO se crean tests del frontend
❌ NO se cubren todos los edge cases de cada banco (los tests cubren happy path + algunos errores conocidos)

---

## 🛠 TRD — Technical Requirements

### Estructura de archivos a crear

```
backend/tests/
├── parsers/                                # NUEVO subdirectorio
│   ├── __init__.py
│   ├── conftest.py                         # Fixtures comunes para parsers
│   ├── fixtures/                           # Archivos de muestra anonimizados
│   │   ├── itau/
│   │   │   ├── ca-uyu-sample.csv
│   │   │   ├── tc-sample.csv               # Tarjeta de crédito
│   │   │   └── ca-usd-sample.csv
│   │   ├── santander/
│   │   │   ├── variante-a-sample.csv
│   │   │   └── variante-b-sample.csv
│   │   ├── prex/
│   │   │   └── sample.xlsx
│   │   ├── uala/
│   │   │   └── sample.csv
│   │   ├── mercadopago/
│   │   │   ├── sample.csv
│   │   │   └── sample.xlsx
│   │   ├── oca/
│   │   │   ├── sample.pdf
│   │   │   └── sample.csv
│   │   ├── midinero/
│   │   │   └── sample.xlsx
│   │   ├── scotiabank/
│   │   │   └── sample.csv
│   │   └── zcuentas/
│   │       ├── single-cuenta.xlsx
│   │       └── multi-cuenta.xlsx
│   ├── test_parser_itau.py
│   ├── test_parser_santander.py
│   ├── test_parser_prex.py
│   ├── test_parser_uala.py
│   ├── test_parser_mercadopago.py
│   ├── test_parser_oca.py
│   ├── test_parser_midinero.py
│   ├── test_parser_scotiabank.py
│   └── test_parser_zcuentas.py
└── test_importacion.py                     # Existente (tests de BROU + endpoint)
```

### Plantilla de tests por parser

Cada `test_parser_X.py` sigue esta estructura:

```python
"""Tests del parser de [BANCO].

Cubre:
- Parseo de archivo válido (happy path)
- Detección de banco
- Manejo de duplicados internos
- Validación de campos esperados
- Manejo de archivos malformados
"""
from pathlib import Path
import pytest
from app.services.importacion_service import ParserItau, ParseError

FIXTURES_DIR = Path(__file__).parent / "fixtures" / "itau"


class TestParserItauValid:
    """Tests del happy path con archivos válidos."""
    
    def test_parsea_caja_ahorro_uyu(self):
        """Parsea un archivo de caja de ahorro UYU sin errores."""
        archivo = (FIXTURES_DIR / "ca-uyu-sample.csv").read_bytes()
        parser = ParserItau()
        resultado = parser.parse(archivo)
        
        assert isinstance(resultado, list)
        assert len(resultado) > 0
        # Estructura esperada de cada movimiento
        for mov in resultado:
            assert "fecha" in mov
            assert "monto" in mov
            assert "descripcion" in mov
    
    def test_parsea_montos_positivos_y_negativos(self):
        """Distingue correctamente débitos y créditos."""
        archivo = (FIXTURES_DIR / "ca-uyu-sample.csv").read_bytes()
        parser = ParserItau()
        resultado = parser.parse(archivo)
        
        positivos = [m for m in resultado if m["monto"] > 0]
        negativos = [m for m in resultado if m["monto"] < 0]
        
        # El fixture debe tener ambos para que este test sirva
        assert len(positivos) > 0, "Fixture debe contener ingresos"
        assert len(negativos) > 0, "Fixture debe contener gastos"
    
    def test_fechas_parseadas_correctamente(self):
        """Las fechas se parsean al formato YYYY-MM-DD."""
        archivo = (FIXTURES_DIR / "ca-uyu-sample.csv").read_bytes()
        parser = ParserItau()
        resultado = parser.parse(archivo)
        
        for mov in resultado:
            # Verificar formato de fecha
            assert mov["fecha"].count("-") == 2  # YYYY-MM-DD
            year, month, day = mov["fecha"].split("-")
            assert 1900 <= int(year) <= 2100
            assert 1 <= int(month) <= 12
            assert 1 <= int(day) <= 31


class TestParserItauErrors:
    """Tests de manejo de errores."""
    
    def test_archivo_vacio_lanza_error(self):
        """Archivo vacío levanta ParseError."""
        parser = ParserItau()
        with pytest.raises(ParseError):
            parser.parse(b"")
    
    def test_archivo_corrupto_lanza_error(self):
        """Archivo con bytes inválidos levanta ParseError."""
        parser = ParserItau()
        with pytest.raises(ParseError):
            parser.parse(b"\x00\x01\x02\xff\xfe")
    
    def test_csv_sin_headers_esperados_lanza_error(self):
        """CSV sin las columnas esperadas levanta ParseError."""
        archivo = b"columna_a;columna_b\nvalor1;valor2"
        parser = ParserItau()
        with pytest.raises(ParseError):
            parser.parse(archivo)
```

### Generación de fixtures anonimizados

**El paso más delicado:** generar archivos de muestra **reales pero anonimizados**.

#### Política de anonimización

Para cada archivo real que se incluya como fixture:

**Datos a anonimizar (reemplazar):**
- Nombres de personas (titular de la cuenta) → "TITULAR ANONIMIZADO"
- Números de cuenta CBU/CVU → ceros o "XXXXXXXXX"
- Documentos de identidad → "XXXXXXXX"
- Direcciones → "DIRECCION ANONIMIZADA"
- Referencias específicas que identifiquen a la persona

**Datos a MANTENER intactos:**
- Fechas (son neutrales)
- Montos (no identifican a nadie)
- Descripciones genéricas (SUPERMERCADO DISCO, PEDIDOS YA, NETFLIX) — son negocios públicos
- Estructura del archivo (separadores, encoding, orden de columnas)
- Headers exactos
- Líneas de metadatos del banco

#### Script de anonimización (helper)

Crear en `backend/scripts/anonymize_bank_file.py`:

```python
"""Helper para anonimizar archivos bancarios reales para usar como fixtures.

Uso:
    python scripts/anonymize_bank_file.py input.csv output.csv

Reemplaza:
- Nombres en patrones típicos
- Números de cuenta
- Documentos
"""
import re
import sys
from pathlib import Path


PATTERNS = [
    # Nombres de personas (heurística: 2-3 palabras en MAYÚSCULAS seguidas)
    (r"\b[A-ZÁÉÍÓÚÑ]{3,}\s+[A-ZÁÉÍÓÚÑ]{3,}(?:\s+[A-ZÁÉÍÓÚÑ]{3,})?\b", "TITULAR ANONIMIZADO"),
    # Documentos uruguayos (8 dígitos)
    (r"\b\d{8}\b", "XXXXXXXX"),
    # CBUs (22 dígitos)
    (r"\b\d{22}\b", "X" * 22),
    # Números de cuenta largos (10+ dígitos)
    (r"\b\d{10,}\b", "XXXXXXXXXX"),
]


# Lista blanca de nombres a NO reemplazar (negocios, comercios, etc.)
WHITELIST = [
    "SUPERMERCADO", "TIENDA", "PAGO", "TRANSF", "COMPRA",
    "NETFLIX", "SPOTIFY", "PEDIDOS YA", "UBER", "DISCO",
    "MERCADO PAGO", "PREX", "BROU", "ITAU", "SANTANDER",
    "ABITAB", "REDPAGOS", "ANTEL", "UTE", "OSE",
    # ... agregar según se vayan encontrando
]


def anonymize(content: str) -> str:
    for pattern, replacement in PATTERNS:
        def replacer(match):
            text = match.group(0)
            # No reemplazar si está en whitelist
            for white in WHITELIST:
                if white in text:
                    return text
            return replacement
        content = re.sub(pattern, replacer, content)
    return content


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("Uso: python anonymize_bank_file.py input output")
        sys.exit(1)
    
    inp = Path(sys.argv[1])
    out = Path(sys.argv[2])
    
    # Detectar encoding
    raw = inp.read_bytes()
    for encoding in ["utf-8", "utf-8-sig", "latin-1", "cp1252"]:
        try:
            text = raw.decode(encoding)
            break
        except UnicodeDecodeError:
            continue
    else:
        print("No se pudo decodificar el archivo")
        sys.exit(1)
    
    anonymized = anonymize(text)
    out.write_text(anonymized, encoding=encoding)
    print(f"Archivo anonimizado: {out}")
```

**Importante:** Después de generar el fixture, **revisar manualmente** que no haya datos personales remanentes.

### Tests obligatorios por parser

Cada parser debe tener como mínimo:

1. **`test_parsea_archivo_valido`** — happy path
2. **`test_distingue_montos_positivos_negativos`** — débitos vs créditos
3. **`test_fechas_parseadas_correctamente`** — formato consistente
4. **`test_archivo_vacio_lanza_error`** — manejo de error
5. **`test_archivo_corrupto_lanza_error`** — manejo de error
6. **`test_no_genera_duplicados_internos`** — hash de dedup

**Mínimo 6 tests × 9 parsers = 54 tests nuevos.**

Si el banco tiene variantes (Santander tiene 2 variantes de columnas, OCA tiene PDF y CSV), agregar tests específicos por variante.

### Tests de detección de banco

Además de los tests por parser, **un test que verifica que el detector identifica correctamente cada formato**:

```python
# backend/tests/parsers/test_detection.py

import pytest
from pathlib import Path
from app.services.importacion_service import detectar_banco

FIXTURES_DIR = Path(__file__).parent / "fixtures"


@pytest.mark.parametrize("banco,filename", [
    ("itau", "itau/ca-uyu-sample.csv"),
    ("santander", "santander/variante-a-sample.csv"),
    ("santander", "santander/variante-b-sample.csv"),
    ("prex", "prex/sample.xlsx"),
    ("uala", "uala/sample.csv"),
    ("mercadopago", "mercadopago/sample.csv"),
    ("mercadopago", "mercadopago/sample.xlsx"),
    ("oca", "oca/sample.pdf"),
    ("oca", "oca/sample.csv"),
    ("midinero", "midinero/sample.xlsx"),
    ("scotiabank", "scotiabank/sample.csv"),
    ("zcuentas", "zcuentas/single-cuenta.xlsx"),
    ("zcuentas", "zcuentas/multi-cuenta.xlsx"),
])
def test_detecta_banco_correctamente(banco, filename):
    """Verifica que el detector identifique cada formato correctamente."""
    archivo = (FIXTURES_DIR / filename).read_bytes()
    resultado = detectar_banco(archivo, filename)
    assert resultado == banco
```

### Configuración de pytest

`backend/pytest.ini` o `pyproject.toml`:

```ini
[pytest]
testpaths = tests
python_files = test_*.py
python_classes = Test*
python_functions = test_*

# Markers útiles
markers =
    parsers: tests específicos de parsers bancarios
    slow: tests que tardan más de 1 segundo
```

Uso:
```bash
# Correr solo tests de parsers
pytest -m parsers

# Correr todo
pytest

# Correr un parser específico
pytest tests/parsers/test_parser_itau.py -v
```

### Reglas inmutables específicas de F05

1. **Los fixtures NO contienen datos personales identificables.**
   Cada fixture pasa por proceso de anonimización + revisión manual.

2. **Los tests verifican comportamiento, no datos exactos.**
   ❌ `assert len(resultado) == 47` (frágil: el fixture puede cambiar)
   ✅ `assert len(resultado) > 0` y verificar estructura

3. **NO se modifica el código de parsers en esta feature.**
   Si un parser tiene un bug, se documenta en `99-DECISIONES-PENDIENTES.md` pero NO se arregla en F05.

4. **Los fixtures se versionan en git** (no son data sensible después de anonimizar).

5. **Si un parser tiene comportamiento ambiguo**, el test documenta el comportamiento ACTUAL.
   Luego se evalúa si ese comportamiento es correcto o necesita refactor.

### Tests requeridos

**Mínimo 60 tests nuevos** distribuidos así:

| Parser | Tests mínimos | Fixtures |
|---|---|---|
| Itaú | 6-8 | ca-uyu, ca-usd, tc |
| Santander | 6-8 | variante-a, variante-b |
| Prex | 6 | sample |
| Ualá | 6 | sample |
| Mercado Pago | 6-8 | sample.csv, sample.xlsx |
| OCA | 6-8 | sample.pdf, sample.csv |
| MiDinero | 6 | sample |
| Scotiabank | 6 | sample |
| Zcuentas | 8-10 | single, multi-cuenta |
| **Detección de banco** | 1 parametrizado con todos los fixtures | — |

---

## ✅ Criterios de aceptación

### Funcional

- [ ] Existe la carpeta `tests/parsers/` con la estructura indicada
- [ ] Cada parser tiene mínimo 6 tests
- [ ] Cada parser tiene al menos 1 fixture anonimizado
- [ ] Existe test parametrizado de detección de banco
- [ ] Todos los tests pasan localmente
- [ ] Todos los tests existentes siguen pasando

### Técnico

- [ ] Total de tests: 123 (existentes) + ~60 (nuevos) = ~183
- [ ] Los fixtures están versionados en git
- [ ] Los fixtures NO contienen datos personales identificables (revisión manual)
- [ ] El script de anonimización está documentado
- [ ] Los tests usan markers `@pytest.mark.parsers` cuando aplica

### Calidad

- [ ] Cada test es legible (un test = una cosa que verifica)
- [ ] Los tests no dependen entre sí (orden no importa)
- [ ] Los assertions son sobre comportamiento, no sobre datos exactos del fixture
- [ ] Los tests fallan claramente si algo se rompe (mensajes de error útiles)

---

## 🚀 Plan de implementación

### Sprint 1 (fin de semana 1) — Setup + 4 parsers
- Crear estructura de carpetas
- Crear script de anonimización
- Generar fixtures para Itaú, Santander, Prex, Ualá (los más usados)
- Escribir tests de esos 4 parsers
- Test de detección (parametrizado)
- Verificar que pytest pasa al 100%

### Sprint 2 (fin de semana 2) — 5 parsers restantes
- Generar fixtures para Mercado Pago, OCA, MiDinero, Scotiabank, Zcuentas
- Escribir tests de esos 5 parsers
- Documentar comportamientos extraños en `99-DECISIONES-PENDIENTES.md`
- Verificar suite completa pasa
- Merge a main

---

## 🔗 Referencias

- **Servicio principal:** `backend/app/services/importacion_service.py`
- **Test existente como modelo:** `backend/tests/test_importacion.py` (BROU)
- **Documentación de formatos:** `bancos/FORMATOS_EXPORTACION_BANCOS.md`
- **Principios relevantes:** P16 (toda feature tiene tests), P17 (tests sin datos compartidos)

---

## 📝 Notas de implementación

- **Estrategia "muestra propia":** generar los fixtures con tus propios archivos bancarios (anonimizados). Vos sos usuario de varios bancos, tenés archivos reales.
- **Si te falta un banco:** pedile a un beta tester un archivo de muestra anonimizado. Es un gran intercambio: ellos te dan formato, vos les das parser de calidad.
- **Variantes de Santander:** ya tenés 2 variantes implementadas en el código. Los fixtures deben representar ambas para evitar regresiones.
- **Zcuentas multi-cuenta:** este caso es especial por el flujo de mapeo de cuentas. Vale la pena un test dedicado.
- **Si encontrás bugs durante esta feature:** NO los arregles acá. Documentalos en `99-DECISIONES-PENDIENTES.md` con prioridad sugerida. F05 es **solo agregar tests**, no refactor.
