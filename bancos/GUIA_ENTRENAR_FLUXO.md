# 🎯 Guía: Entrenar Fluxo con Datos de Prueba

## Resumen

Tienes 6 archivos CSV con datos reales simulados de cada banco/billetera. Aquí está cómo usarlos para entrenar los parsers y validar el sistema.

---

## 1. Archivos Disponibles

```
MOCK_DATA_BROU.csv         → 15 movimientos BROU
MOCK_DATA_ITAU.csv         → 15 movimientos Itaú
MOCK_DATA_SANTANDER.csv    → 15 movimientos Santander
MOCK_DATA_OCA.csv          → 15 movimientos OCA (tarjeta crédito)
MOCK_DATA_MERCADOPAGO.csv  → 15 movimientos Mercado Pago
MOCK_DATA_UALA.csv         → 15 movimientos Uala
```

**Total**: 90 transacciones realistas para pruebas

---

## 2. Cómo Usar Estos Datos

### Opción A: Testing Manual en UI

1. **Abre Fluxo** → Sección "Importar"
2. **Descarga** uno de los archivos CSV
3. **Abre en Excel** → Modifica algunos valores si quieres (fechas, montos)
4. **Sube a Fluxo** → Selecciona banco correcto
5. **Revisa resultado** → Debe normalizarse y aparecer en dashboard

### Opción B: Testing Automático (Unit Tests)

Crea tests que:
1. Lean el CSV
2. Parseen con el ParserXXX correspondiente
3. Validen que los campos están correctos
4. Verifiquen que no hay duplicados

```python
# Ejemplo test
def test_parser_brou_con_datos_reales():
    # Leer MOCK_DATA_BROU.csv
    df = pd.read_csv('MOCK_DATA_BROU.csv')
    
    parser = ParserBROU(categorizador)
    movimientos = parser.parsear(df)
    
    # Validaciones
    assert len(movimientos) == 15
    assert all(m['estado'] == 'validado' for m in movimientos)
    assert all('YYYY-MM-DD' in m['fecha'] for m in movimientos)
```

### Opción C: Testing de Extremo a Extremo

1. **Sube archivo** → API `/api/v1/importacion/parsear`
2. **Confirma importación** → API `/api/v1/importacion/confirmar`
3. **Valida en BD** → Verifica que aparecen en `transactions`
4. **Revisa dashboard** → Gráficos actualizados

---

## 3. Mapeo de Datos: Cómo Normalizar

### Caso: BROU → Fluxo

**CSV BROU**:
```
Fecha Movimiento | Descripción                  | Débito | Crédito | Saldo
31/03/2026       | TRANSFERENCIA BANCO ITAU     | 0.00   | 5000.00 | 10500.00
```

**Después de normalizar a Fluxo**:
```json
{
  "fecha": "2026-03-31",                              // Fecha Movimiento
  "concepto": "TRANSFERENCIA BANCO ITAU",            // Descripción (max 100 chars)
  "monto": 5000.00,                                  // Crédito (positivo) o -Débito (negativo)
  "categoria": "Transferencia",                      // Auto-detectado
  "metodo_pago": "Transferencia Bancaria",          // Auto-detectado
  "descripcion": "Banco origen: BROU",               // Opcional
  "moneda": "UYU",                                   // Por defecto
  "estado": "validado",
  "hash_movimiento": "abc123def456",                 // SHA256 para duplicados
  "metadata": {
    "fecha_valor": "2026-03-31",
    "referencia_original": "TRF-001",
    "codigo_banco": "TRF",
    "sucursal": "179",
    "saldo_posterior": 10500.00
  }
}
```

### Regla: Débito vs Crédito

```
CSV Tiene Débito Y Crédito:
  - Si Débito > 0 → monto = -Débito (gasto)
  - Si Crédito > 0 → monto = +Crédito (ingreso)

CSV Tiene Columna Única "Monto":
  - Positivo = ingreso
  - Negativo = gasto
  
CSV Tiene "Concepto":
  - Usar como concepto en Fluxo
```

---

## 4. Detección de Categorías

Fluxo debe aprender a categorizar automáticamente. Aquí están las reglas por concepto:

### Palabras Clave Predefinidas

```python
CATEGORIAS = {
    "Supermercado": ["JUMBO", "CARREFOUR", "SUPERMERCADO", "ALMACÉN"],
    "Salud": ["FARMACIA", "CLINICA", "HOSPITAL", "ODONTÓLOGO"],
    "Transporte": ["UBER", "COMBUSTIBLE", "ANCAP", "TAXI", "BUSES"],
    "Entretenimiento": ["CINE", "NETFLIX", "RESTAURANTE", "SPOTIFY"],
    "Compras": ["TIENDA", "AMAZON", "EBAY", "ONLINE"],
    "Transferencia": ["TRANSFERENCIA", "TRN", "SPI"],
    "Servicios": ["UTE", "ANDE", "ANTEL", "OSE"],
    "Ingresos": ["DEPOSITO", "SUELDO", "GANANCIA", "COBRO"],
    "Inversión": ["COMPRA ACCIONES", "BONOS"],
}
```

### Ejemplo: Categorizar "SUPERMERCADO XYZ"

```
1. Buscar en reglas personalizadas (del usuario) → No encontrado
2. Buscar en reglas predefinidas → Encontrado "SUPERMERCADO"
3. Retornar: ("Supermercado", 0.85)  // categoría, confianza
```

---

## 5. Detección de Duplicados

Fluxo debe usar HASH para detectar duplicados:

```python
def generar_hash(fecha, concepto, monto, cuenta):
    dato = f"{fecha}|{concepto}|{monto}|{cuenta}"
    return hashlib.sha256(dato.encode()).hexdigest()[:16]

# Ejemplo
hash1 = generar_hash("2026-03-31", "TRANSFERENCIA BANCO ITAU", 5000.00, "BROU-001")
# hash1 = "a1b2c3d4e5f6g7h8"

# Si importas 2 veces el mismo archivo
hash2 = generar_hash("2026-03-31", "TRANSFERENCIA BANCO ITAU", 5000.00, "BROU-001")
# hash2 = "a1b2c3d4e5f6g7h8"  ← IGUAL → Duplicado detectado
```

---

## 6. Plan de Entrenamiento

### Día 1: Tests Unitarios
```
1. Test ParserBROU con MOCK_DATA_BROU.csv
   ✓ Parsea correctamente
   ✓ Normaliza fechas
   ✓ Calcula hashes

2. Test ParserItau con MOCK_DATA_ITAU.csv
3. Test ParserSantander con MOCK_DATA_SANTANDER.csv
... etc para todos
```

### Día 2: Tests de Integración
```
1. Upload MOCK_DATA_BROU.csv → API /parsear
   ✓ Retorna JSON correcto
   ✓ Detecta categorías
   ✓ Genera hashes

2. Confirmar importación → API /confirmar
   ✓ Inserta en tabla transactions
   ✓ Auditoría en tabla importaciones
   
3. Verificar en BD
   ✓ 15 transacciones nuevas
   ✓ Todas tienen categoría
   ✓ Ningún duplicado
```

### Día 3: Tests End-to-End
```
1. Subir MOCK_DATA_BROU.csv dos veces
   ✓ Segunda vez: detecta 15 duplicados
   ✓ No duplica en BD

2. Subir todos los CSV
   ✓ 90 transacciones totales
   ✓ Dashboard se actualiza
   ✓ Gráficos se recalculan
   
3. Verificar aprendizaje
   ✓ Reglas de categorización guardadas
   ✓ Próxima importación usa las reglas aprendidas
```

---

## 7. Casos de Prueba Específicos

### Test 1: Normalización de Fechas

**Entrada** (BROU):
```
31/03/2026  →  Debe convertir a  →  2026-03-31
```

**Test**:
```python
assert normalizador.normalizar("31/03/2026") == "2026-03-31"
```

### Test 2: Categorización Automática

**Entrada** (OCA):
```
SUPERMERCADO XYZ  →  Debe categorizar como  →  Supermercado
```

**Test**:
```python
categoria, confianza = categorizador.categorizar("SUPERMERCADO XYZ")
assert categoria == "Supermercado"
assert confianza >= 0.85
```

### Test 3: Detección de Duplicados

**Entrada** (importar BROU dos veces):
```
Primera vez:  15 movimientos → Todos validados
Segunda vez:  15 movimientos → Todos marcados como duplicados
```

**Test**:
```python
resultado1 = importador.parsear_archivo(archivo, "brou")
assert resultado1["exitosos"] == 15
assert resultado1["duplicados"] == 0

resultado2 = importador.parsear_archivo(archivo, "brou")
assert resultado2["exitosos"] == 0
assert resultado2["duplicados"] == 15
```

### Test 4: Conversión de Moneda

**Entrada** (Itaú con operación en USD):
```
TRANSFERENCIA INTERNACIONAL | Débito 2000 | Moneda USD
```

**Test**:
```python
mov = parser.parsear(df)
assert mov["moneda"] == "USD"
assert mov["metadata"]["fecha_valor"] exists
```

### Test 5: Saldo Consistente

**Entrada** (BROU con múltiples movimientos):
```
Saldo inicial: 10500.00
- Transferencia: +5000.00 = 15500.00
- Extracción: -500.00 = 15000.00
```

**Test**:
```python
saldos = [mov["metadata"]["saldo_posterior"] for mov in movimientos]
assert saldos[-1] == 15000.00  # Saldo final correcto
```

---

## 8. Cómo Modificar los Datos para Pruebas Especiales

### Test de Duplicados Exactos

1. **Copia** una fila de MOCK_DATA_BROU.csv
2. **Pégala** al final del mismo archivo
3. **Importa** → Debe detectar 1 duplicado exacto

### Test de Duplicados Potenciales

1. **Toma** una fila: `31/03/2026 | SUPERMERCADO XYZ | 543.21`
2. **Modifica** ligeramente:
   - Cambia fecha a `01/04/2026` (1 día después)
   - Cambia monto a `546.00` (5% más)
   - Mantén concepto igual
3. **Importa** → Debe detectar 1 posible duplicado

### Test de Conversión de Moneda

1. **Toma** una fila
2. **Duplica** y cambia:
   - Concepto: "COMPRA DOLAR BILLETE"
   - Moneda: USD
   - Monto: 100 USD
3. **Importa** → Debe registrar conversión

### Test de Categorías Faltantes

1. **Crea** una fila con concepto desconocido:
   ```
   31/03/2026 | PAGO XXXYYYZZZ | 1000.00
   ```
2. **Importa** → Sistema no debe categorizar automáticamente
3. **UI debe permitir** seleccionar categoría manualmente

---

## 9. Validación Final

Antes de usar en producción, verifica:

```
✓ Parseo de todos los 6 bancos funciona
✓ 90 movimientos se importan correctamente
✓ Categorización automática >85% preciso
✓ Duplicados detectados (exactos y potenciales)
✓ Conversiones de moneda registradas
✓ Dashboard se actualiza
✓ No hay duplicados en BD
✓ Auditoría completa en tabla importaciones
✓ Tests >90% cobertura
✓ Tiempo de importación <5 segundos por 100 movimientos
```

---

## 10. Archivos en Orden de Complejidad

### Fácil (Bancos estándar)
1. **BROU** - Formato simple, columnas claras
2. **Santander** - Similar a BROU
3. **Itaú** - Más columnas, pero estructura clara

### Medio (Tarjetas y billeteras)
4. **OCA** - Solo débitos (tarjeta crédito)
5. **Mercado Pago** - Entrada/Salida, múltiples tipos

### Difícil (Más variedad)
6. **Uala** - Categorías automáticas, cuotas, tipos variados

### Recomendación de Testing
```
Semana 1: BROU + Santander + Itaú (bancos)
Semana 2: OCA (tarjeta)
Semana 3: Mercado Pago + Uala (billeteras)
```

---

## 11. Próximos Pasos

Una vez que Fluxo importe correctamente estos 90 movimientos:

1. **Pasar a datos reales**
   - Pide a usuarios que exporten archivos reales
   - Anonimiza (mantén conceptos, cambia nombres)
   - Prueba con los formatos reales

2. **Entrenar categorización**
   - Registra decisiones del usuario
   - Sistema aprende patrones
   - Mejora con el tiempo

3. **Expandir a más bancos**
   - OCA PDF (requiere OCR)
   - Banco República (también Uruguay)
   - Otros según demanda

---

**¡Listo para entrenar Fluxo!** 🚀

Todos los archivos están listos para usar. Comienza con BROU, valida que funciona, y luego prueba los demás.
