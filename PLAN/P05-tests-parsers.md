# P05 — Prompt para Claude Code: Tests para los 9 Parsers Bancarios

> **Sesión NUEVA. Rama `feature/F05-tests-parsers`.**
> Esta feature es deuda técnica: solo agregar tests, NO modificar código de parsers.

---

## CONTEXTO DEL PROYECTO

Fluxo: finanzas personales uruguaya. Tiene **10 parsers bancarios** (Prex, BROU, Itaú, Santander, OCA, Mercado Pago, Ualá, MiDinero, Scotiabank, Zcuentas) pero solo BROU tiene tests específicos.

**ANTES de codear:**

1. Leé:
   - `docs/plan/01-PRINCIPIOS-INMUTABLES.md`
   - `docs/plan/03-CONVENCIONES-DE-CODIGO.md`
   - `docs/plan/features/F05-tests-parsers.md`

2. Resumime 3 puntos por archivo.

3. Esperá mi confirmación.

---

## FEATURE A IMPLEMENTAR

**F05 — Tests para los 9 Parsers Sin Cobertura**

Agregar tests específicos para cada parser que no tiene cobertura. **No se modifica el código de parsers**, solo se documenta su comportamiento actual mediante tests.

---

## REGLAS INMUTABLES PARA ESTA FEATURE

1. **NO modificar código de parsers.** Esta feature es solo agregar tests.
   Si encontrás bugs, documentalos en `99-DECISIONES-PENDIENTES.md` y avisame, NO los arregles acá.

2. **Los fixtures NO contienen datos personales identificables.**
   Cada fixture pasa por proceso de anonimización + revisión manual.

3. **Los tests verifican COMPORTAMIENTO, no datos exactos.**
   ❌ Mal: `assert len(resultado) == 47` (frágil)
   ✅ Bien: `assert len(resultado) > 0` + verificar estructura

4. **Si un parser tiene comportamiento ambiguo o raro,** el test documenta el comportamiento ACTUAL.
   La discusión de si es correcto va a `99-DECISIONES-PENDIENTES.md`.

5. **Los fixtures se versionan en git** después de anonimizar.

6. **NO modificar tests existentes** salvo si necesitan ser movidos a la nueva estructura.

---

## ARCHIVOS QUE PODÉS TOCAR

### Crear

```
backend/tests/parsers/__init__.py
backend/tests/parsers/conftest.py
backend/tests/parsers/test_detection.py
backend/tests/parsers/test_parser_itau.py
backend/tests/parsers/test_parser_santander.py
backend/tests/parsers/test_parser_prex.py
backend/tests/parsers/test_parser_uala.py
backend/tests/parsers/test_parser_mercadopago.py
backend/tests/parsers/test_parser_oca.py
backend/tests/parsers/test_parser_midinero.py
backend/tests/parsers/test_parser_scotiabank.py
backend/tests/parsers/test_parser_zcuentas.py

backend/tests/parsers/fixtures/
  → estructura completa según F05.md

backend/scripts/anonymize_bank_file.py
```

### Modificar (solo si hace falta)

```
backend/pytest.ini  (agregar marker 'parsers')
```

### NO TOCAR

```
backend/app/services/importacion_service.py  ← NO modificar parsers
backend/app/models/  ← nada
backend/app/api/  ← nada
backend/tests/test_importacion.py  ← existente, mantener como está
Cualquier otro archivo
```

---

## CRITERIOS DE COMPLETITUD

- [ ] Estructura `backend/tests/parsers/` creada
- [ ] Script `backend/scripts/anonymize_bank_file.py` funcional
- [ ] Cada parser tiene mínimo 6 tests:
  - `test_parsea_archivo_valido`
  - `test_distingue_montos_positivos_negativos`
  - `test_fechas_parseadas_correctamente`
  - `test_archivo_vacio_lanza_error`
  - `test_archivo_corrupto_lanza_error`
  - `test_no_genera_duplicados_internos`
- [ ] Test parametrizado `test_detection.py` cubre detección de los 10 bancos
- [ ] Total nuevos tests: 60+
- [ ] Total general: 123 (existentes) + 60+ (nuevos) = 183+
- [ ] `pytest backend/tests/` pasa al 100%
- [ ] Los fixtures están anonimizados (revisión manual)
- [ ] Tests usan `@pytest.mark.parsers` para correr solo este subset

---

## FORMATO DE TRABAJO

### SPRINT 1 — Setup + 4 parsers (Itaú, Santander, Prex, Ualá)

#### Paso 1.1: Estructura

1. Crear estructura de carpetas según los archivos a crear listados arriba
2. Crear `__init__.py` vacíos
3. Crear `conftest.py` con fixture útil:
   ```python
   from pathlib import Path
   FIXTURES_DIR = Path(__file__).parent / "fixtures"
   ```
4. Esperá aprobación

#### Paso 1.2: Script de anonimización

1. Crear `backend/scripts/anonymize_bank_file.py`
2. Debe:
   - Detectar encoding (utf-8-sig, utf-8, latin-1, cp1252)
   - Reemplazar patrones de nombres, DNIs, CBUs
   - Mantener whitelist de comercios conocidos
   - Funcionar como CLI: `python anonymize_bank_file.py input output`
3. Probarlo con un archivo CSV cualquiera para verificar que funciona
4. Mostrame el código y el test del script
5. Esperá aprobación

#### Paso 1.3: Tests Itaú

**IMPORTANTE:** Para esta feature necesitás archivos reales bancarios. Si Claude Code no tiene acceso a archivos de muestra, **DETENETE acá y pedíle al usuario que provea fixtures anonimizados.**

Asumiendo que hay fixtures disponibles:

1. Generar fixtures anonimizados de Itaú (ca-uyu, ca-usd, tc si hay)
2. **Revisar manualmente** que no haya datos personales
3. Implementar `test_parser_itau.py` con los 6 tests mínimos + variantes
4. Marcar todos con `@pytest.mark.parsers`
5. Correr: `pytest backend/tests/parsers/test_parser_itau.py -v -m parsers`
6. Pegame output completo
7. Esperá aprobación

#### Paso 1.4: Tests Santander (2 variantes)

Repetir paso 1.3 para Santander, asegurándose de cubrir ambas variantes de columnas.

#### Paso 1.5: Tests Prex

Repetir para Prex.

#### Paso 1.6: Tests Ualá

Repetir para Ualá.

#### Paso 1.7: Test de detección parametrizado

1. Crear `test_detection.py` con `@pytest.mark.parametrize` que cubra todos los fixtures
2. Verifica que `detectar_banco()` identifica correctamente cada formato
3. Correr y pegame output
4. Esperá aprobación

**Fin de SPRINT 1.**

---

### SPRINT 2 — 5 parsers restantes (Mercado Pago, OCA, MiDinero, Scotiabank, Zcuentas)

#### Paso 2.1 a 2.5: Tests por banco

Mismo patrón que SPRINT 1, un parser por paso. Esperá aprobación entre cada uno.

Consideraciones especiales:

- **Mercado Pago**: tiene CSV y Excel. Tests por cada formato.
- **OCA**: tiene PDF y CSV. Tests por cada formato. **PDF requiere `pdfplumber`** instalado.
- **Zcuentas**: tiene caso "single account" y "multi account". Tests por cada uno.

#### Paso 2.6: Verificación final

1. `pytest backend/tests/ -v` → todo debe pasar
2. `pytest backend/tests/parsers/ -v -m parsers` → solo los nuevos
3. Pegame ambos outputs
4. Reportame el checklist completo

---

### SPRINT 3 — Documentación de hallazgos

Si durante los tests descubriste bugs o comportamientos extraños:

1. Documentar en `99-DECISIONES-PENDIENTES.md` cada uno
2. Reportame qué encontraste

NO arregles bugs en este sprint. Solo documentalos.

---

## TEMPLATE DE TEST POR PARSER

Usá este template adaptándolo:

```python
"""Tests del parser de [BANCO].

Cubre:
- Parseo de archivo válido (happy path)
- Manejo correcto de débitos/créditos
- Formato de fechas
- Manejo de archivos vacíos/corruptos
- Sin duplicados internos por hash
"""
from pathlib import Path
import pytest
from app.services.importacion_service import (
    ParserItau,  # cambiar según banco
    ParseError,
)

FIXTURES_DIR = Path(__file__).parent / "fixtures" / "itau"


@pytest.mark.parsers
class TestParserItauValid:
    """Happy path con archivos válidos."""
    
    def test_parsea_caja_ahorro_uyu(self):
        archivo = (FIXTURES_DIR / "ca-uyu-sample.csv").read_bytes()
        parser = ParserItau()
        resultado = parser.parse(archivo)
        
        assert isinstance(resultado, list)
        assert len(resultado) > 0
        # Cada movimiento tiene la estructura esperada
        for mov in resultado:
            assert "fecha" in mov
            assert "monto" in mov
            assert "descripcion" in mov
            assert isinstance(mov["monto"], (int, float))
    
    def test_distingue_montos_positivos_y_negativos(self):
        archivo = (FIXTURES_DIR / "ca-uyu-sample.csv").read_bytes()
        parser = ParserItau()
        resultado = parser.parse(archivo)
        
        positivos = [m for m in resultado if m["monto"] > 0]
        negativos = [m for m in resultado if m["monto"] < 0]
        # El fixture debería contener ambos para que este test sea útil
        assert len(positivos) > 0, "El fixture debe tener al menos un ingreso"
        assert len(negativos) > 0, "El fixture debe tener al menos un gasto"
    
    def test_fechas_en_formato_iso(self):
        archivo = (FIXTURES_DIR / "ca-uyu-sample.csv").read_bytes()
        parser = ParserItau()
        resultado = parser.parse(archivo)
        
        import re
        ISO_DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
        for mov in resultado:
            assert ISO_DATE.match(mov["fecha"]), f"Fecha no ISO: {mov['fecha']}"


@pytest.mark.parsers
class TestParserItauErrors:
    """Manejo de errores."""
    
    def test_archivo_vacio_lanza_error(self):
        parser = ParserItau()
        with pytest.raises(ParseError):
            parser.parse(b"")
    
    def test_archivo_binario_corrupto_lanza_error(self):
        parser = ParserItau()
        with pytest.raises(ParseError):
            parser.parse(b"\x00\x01\x02\xff\xfe")
    
    def test_csv_sin_headers_lanza_error(self):
        archivo = b"a;b\nx;y"
        parser = ParserItau()
        with pytest.raises(ParseError):
            parser.parse(archivo)


@pytest.mark.parsers
class TestParserItauDeduplication:
    
    def test_no_genera_hashes_duplicados_internos(self):
        archivo = (FIXTURES_DIR / "ca-uyu-sample.csv").read_bytes()
        parser = ParserItau()
        resultado = parser.parse(archivo)
        
        # Si el parser ya calcula hash, verificar unicidad
        # Si no, calcular acá para verificar que no hay filas idénticas
        keys = [(m["fecha"], m["monto"], m["descripcion"]) for m in resultado]
        assert len(keys) == len(set(keys)), "Hay filas idénticas en el parseo"
```

---

## PROHIBICIONES EXPLÍCITAS

- ❌ NO modifiques código de parsers existentes.
- ❌ NO modifiques `importacion_service.py`.
- ❌ NO uses archivos bancarios SIN anonimizar.
- ❌ NO commitees fixtures con datos personales reales.
- ❌ NO inventes fixtures sintéticos sin verificar que coincidan con el formato real del banco.
- ❌ Si no tenés acceso a archivos reales, **PARÁ y pedíme**.

---

## CONSIDERACIÓN IMPORTANTE SOBRE FIXTURES

Esta feature **depende críticamente de tener archivos reales** de cada banco para testear. Hay tres caminos posibles:

**Camino A (preferido):** El usuario tiene archivos propios de cada banco. Los anonimizamos juntos.

**Camino B:** Generamos fixtures sintéticos imitando el formato real. Es válido pero menos robusto.

**Camino C:** Solo testeamos los bancos para los que hay archivos disponibles. Documentamos qué bancos quedan sin tests.

**Si no podés acceder a archivos reales:** PEDIME al usuario que provea fixtures anonimizados antes de empezar SPRINT 1. NO inventes datos.

---

## EN CASO DE DUDA

Dudas válidas:
- *"Para Mercado Pago tengo el CSV pero no el Excel. ¿Genero solo tests del CSV o pedimos el Excel?"*
- *"En el parser de OCA, veo que el comportamiento con PDFs vacíos es retornar `[]` (lista vacía), no levantar excepción. ¿El test debe documentar ese comportamiento o tratarlo como bug?"*

Para casos como el último: **documentá el comportamiento actual en el test** y agregá una nota en `99-DECISIONES-PENDIENTES.md` para evaluar si es bug.

¿Listo? Empezá por SPRINT 1 PASO 1.1.
