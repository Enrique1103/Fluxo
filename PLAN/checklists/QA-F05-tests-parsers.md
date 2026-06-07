# 🧪 QA-F05 — Tests para los 9 Parsers Bancarios

> **Verificá ESTE checklist DESPUÉS de pasar `QA-template.md`.**
> Esta feature es deuda técnica: solo verifica que se agregaron tests, no funcionalidad nueva.

---

## ✅ Verificación específica F05

### Estructura

- [ ] Existe carpeta `backend/tests/parsers/`
- [ ] Existe `tests/parsers/__init__.py`
- [ ] Existe `tests/parsers/conftest.py`
- [ ] Existe `tests/parsers/test_detection.py` con test parametrizado
- [ ] Existe carpeta `tests/parsers/fixtures/` con subcarpetas por banco
- [ ] Existe `backend/scripts/anonymize_bank_file.py`

### Archivos de tests por banco

- [ ] `test_parser_itau.py` con 6+ tests
- [ ] `test_parser_santander.py` con 6+ tests (cubre 2 variantes)
- [ ] `test_parser_prex.py` con 6+ tests
- [ ] `test_parser_uala.py` con 6+ tests
- [ ] `test_parser_mercadopago.py` con 6+ tests (CSV y Excel)
- [ ] `test_parser_oca.py` con 6+ tests (PDF y CSV)
- [ ] `test_parser_midinero.py` con 6+ tests
- [ ] `test_parser_scotiabank.py` con 6+ tests
- [ ] `test_parser_zcuentas.py` con 8+ tests (single y multi-cuenta)

### Fixtures

Para cada banco:

- [ ] Hay al menos 1 fixture (`sample.csv`/`sample.xlsx`/`sample.pdf` según corresponda)
- [ ] El fixture es realista (tamaño razonable, no 2 líneas)
- [ ] El fixture está **anonimizado**: revisá manualmente que NO haya:
  - Nombres completos de personas reales
  - DNIs/CIs reales
  - Números de cuenta reales
  - Direcciones reales
  - Saldos exactos que podrían identificar a alguien

### Privacidad de fixtures

**Verificación crítica — Hacé esto antes de commitear:**

```bash
# Buscar patrones sospechosos en fixtures
cd backend/tests/parsers/fixtures
grep -rE "[A-ZÁÉÍÓÚÑ]{3,}\s+[A-ZÁÉÍÓÚÑ]{3,}\s+[A-ZÁÉÍÓÚÑ]{3,}" . | grep -v "ANONIMIZADO" | grep -v "SUPERMERCADO" | grep -v "PEDIDOS"
# Si retorna resultados, hay nombres reales sin anonimizar
```

- [ ] No hay nombres completos de personas reales en ningún fixture
- [ ] No hay números de 8 dígitos sospechosos (posibles CIs)
- [ ] No hay números de 22 dígitos (posibles CBUs)

### Cantidad de tests

```bash
pytest backend/tests/parsers/ --collect-only -q | tail -1
```

- [ ] El conteo es **mínimo 60 tests nuevos** en `tests/parsers/`
- [ ] Pytest collect no muestra errores de import

### Ejecución

```bash
# Solo tests de parsers
pytest backend/tests/parsers/ -v -m parsers

# Suite completa
pytest backend/tests/ -v
```

- [ ] `pytest backend/tests/parsers/` pasa al 100%
- [ ] `pytest backend/tests/` pasa al 100% (183+ tests)
- [ ] Marker `@pytest.mark.parsers` funciona correctamente

### Calidad de los tests

Revisá una muestra de los tests (3-4 archivos al azar) y verificá:

- [ ] **Cada test tiene UN propósito claro** (un nombre, una verificación)
- [ ] Los nombres de tests son **descriptivos en snake_case**:
  - ✅ `test_parsea_montos_positivos_y_negativos`
  - ❌ `test_1`, `test_basic`
- [ ] **Assertions sobre comportamiento, NO sobre datos exactos del fixture:**
  - ✅ `assert len(resultado) > 0`
  - ❌ `assert len(resultado) == 47` (frágil)
- [ ] **Tests negativos presentes:** archivo vacío, archivo corrupto, formato incorrecto
- [ ] **NO hay tests skippeados** sin razón documentada

### Script de anonimización

- [ ] `backend/scripts/anonymize_bank_file.py` existe
- [ ] Funciona como CLI: `python anonymize_bank_file.py input output`
- [ ] Detecta encoding correctamente
- [ ] Anonimiza nombres, DNIs, CBUs
- [ ] Tiene whitelist para no anonimizar comercios conocidos
- [ ] Tiene comentarios/docstring explicando cómo usarlo

### Documentación

- [ ] Si surgieron hallazgos durante los tests (bugs, comportamientos raros), están documentados en `99-DECISIONES-PENDIENTES.md`
- [ ] El `pytest.ini` o `pyproject.toml` tiene el marker `parsers` documentado

---

## 🎯 Test de fuego — Refactor hipotético

**Escenario:** te imaginás que alguien va a refactorizar `importacion_service.py` la próxima semana.

Pregunta: **si rompiera el parser de Itaú sin querer, ¿los tests lo detectarían?**

Hacé este experimento mental rápido:

1. Mirá el código del parser de Itaú en `importacion_service.py`
2. Identificá UNA línea crítica (ej: el split del CSV, el parseo de fecha)
3. Imaginate que esa línea se modificara mal
4. **¿Algún test fallaría?**

- [ ] Sí, hay tests que detectarían el cambio (✅ cobertura útil)
- [ ] No, los tests pasarían igual (❌ cobertura superficial — pedile más assertions a Claude Code)

Repetí mentalmente para 2-3 parsers más.

---

## 🚨 Verificación de no-regresión crítica

Esta feature SOLO agrega tests. **NO debe modificar parsers.**

```bash
# Verificar que importacion_service.py NO se modificó
git diff main -- backend/app/services/importacion_service.py
```

- [ ] El diff es **vacío** (o solo cambios cosméticos como typos en comentarios)

Si Claude Code modificó código de parsers durante esta feature, **rechazá ese cambio** y pedile que revierta. Esta feature es **solo tests**.

---

## 📊 Reporte de QA

```markdown
# QA Report — F05: Tests de los 9 Parsers

Fecha: YYYY-MM-DD
Branch: feature/F05-tests-parsers
Commit: abcd1234

## Resultado: ✅ / ❌

## Tests
- Antes: 123 ✅
- Después: 183+ ✅ (60 nuevos mínimo)

## Verificación específica
- Estructura: ✅
- Archivos por banco (9): ✅
- Fixtures presentes (9 carpetas): ✅
- Privacidad de fixtures: ✅ (manual review hecho)
- Cantidad de tests: ✅
- Ejecución: ✅
- Calidad de tests: ✅
- Script de anonimización: ✅
- No-regresión (parsers no modificados): ✅

## Hallazgos durante la feature
[Lista de bugs o comportamientos raros encontrados, documentados en 99-DECISIONES-PENDIENTES.md]

## Listo para merge: SÍ / NO
```

---

## 🚨 Problemas comunes en esta feature

### Problema: los tests pasan pero el código del parser tiene un bug
**Causa:** los tests verifican comportamiento ACTUAL, no comportamiento CORRECTO.
**Esto es intencional:** F05 documenta cómo se comporta hoy. Si el comportamiento actual es buggy, se documenta el bug en `99-DECISIONES-PENDIENTES.md` y se arregla aparte.

### Problema: faltan fixtures de algunos bancos
**Si Claude Code no tiene archivos reales:**
- Es válido generar fixtures sintéticos imitando el formato real
- Pero **documentá** que es sintético en el archivo
- Cuando consigas archivos reales, regenerás el fixture

### Problema: el script de anonimización deja datos sensibles
**Solución:** la regex del script no es perfecta. Después de correrlo, **siempre revisá manualmente** el output antes de commitear.

### Problema: tests demasiado acoplados al fixture específico
**Síntoma:** un test pasa solo si el fixture tiene EXACTAMENTE 47 filas.
**Solución:** assertions sobre estructura, no sobre datos exactos.

### Problema: tests muy lentos
**Síntoma:** la suite tarda 30 segundos solo por los parsers.
**Diagnóstico:** probablemente algún test está cargando un fixture gigante muchas veces.
**Solución:** cargá los bytes una sola vez al inicio del test class (en `@classmethod setUpClass`).

---

## 💡 Notas para el futuro

Si esta feature se completa exitosamente, **F05 habilita** estas mejoras futuras:

1. **Refactor de `importacion_service.py`** (B05 en BACKLOG): con tests, el refactor es seguro
2. **Detección de cambios de formato bancario:** si un banco cambia su CSV, los tests fallan y te enterás antes que un usuario
3. **Parsers personalizables** (B06): la infraestructura de tests permite construir esto encima sin miedo
