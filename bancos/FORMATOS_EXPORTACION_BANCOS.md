# 📊 Formatos de Exportación: Bancos y Billeteras Uruguay/LatAm

## Resumen Rápido

| Institución | Formato | Método | Caracteres |
|---|---|---|---|
| **BROU** | Excel/CSV/TXT | Download portal | UTF-8 / ANSI |
| **Itaú** | Excel/CSV/TXT | Download portal | UTF-8 |
| **Santander** | Excel/PDF/CSV | Download/Email | UTF-8 |
| **OCA** | PDF/Excel | Download portal | ANSI |
| **Mercado Pago** | Excel/CSV/JSON | API/Email | UTF-8 |
| **Uala** | CSV/JSON | API/App | UTF-8 |

---

## 1. BROU (Banco República Oriental del Uruguay)

### Formato: Excel (.xls / .xlsx)

**Columnas estándar**:
```
A: Fecha Movimiento (dd/mm/yyyy)
B: Fecha Valor (dd/mm/yyyy)
C: Referencia Transacción (texto)
D: Descripción Movimiento (texto)
E: Débito (número decimal, separado por coma)
F: Crédito (número decimal, separado por coma)
G: Saldo (número decimal, separado por coma)
H: Concepto/Código (3-4 caracteres)
I: Sucursal (números)
J: Número Comprobante (opcional)
```

### Ejemplo Real BROU
```
Fecha Mov. | Fecha Valor | Referencia | Descripción | Débito | Crédito | Saldo | Código | Sucursal
31/03/2026 | 31/03/2026  | TRF001     | TRANSFER A CUENTA | 0,00 | 5000,00 | 10500,00 | TRF | 179
30/03/2026 | 30/03/2026  | CHQ002     | CHEQUE DEPÓSITO | 0,00 | 2500,00 | 5500,00 | CHQ | 179
29/03/2026 | 29/03/2026  | EXT003     | EXTRACCIÓN CAJERO | 500,00 | 0,00 | 3000,00 | EXT | 179
28/03/2026 | 28/03/2026  | DCO004     | DESCUENTO COMISIÓN | 45,50 | 0,00 | 3500,00 | DCO | 179
27/03/2026 | 27/03/2026  | INT005     | INTERÉS ACREDITADO | 0,00 | 12,35 | 3545,50 | INT | 179
```

### Características BROU
- Decimal: `,` (coma)
- Miles: `.` (punto)
- Fecha: DD/MM/YYYY
- Moneda por defecto: UYU
- Puede incluir tarjeta débito/crédito asociada
- Saldo actualizado después de cada movimiento

---

## 2. ITAÚ (Uruguay/Argentina/Brasil)

### Formato: Excel/CSV/TXT (múltiples opciones)

**Opción A: Excel (.xlsx)**
```
A: Data (dd/mm/yyyy)
B: Movimiento (texto libre)
C: Débito (número, formato .00)
D: Crédito (número, formato .00)
E: Saldo (número, formato .00)
F: Tipo de Movimiento (código)
G: Número de Comprobante
H: Referencia Externa (código banco destino si aplica)
```

**Opción B: CSV Estándar**
```csv
Data,Movimiento,Débito,Crédito,Saldo,Tipo,Comprobante,Referencia
31/03/2026,TRANSFERENCIA RECIBIDA,0.00,5000.00,10500.00,01,TRF-001,ITAU-123456
30/03/2026,PAGO SERVICIOS ONLINE,450.00,0.00,5500.00,02,TRF-002,PREX-789
29/03/2026,DEPÓSITO EFECTIVO,0.00,2000.00,5950.00,03,DEP-001,MANUAL
28/03/2026,COMISIÓN CUENTA,25.00,0.00,3950.00,98,COM-001,AUTO
```

**Opción C: TXT Fijo (para corporativos)**
```
Fecha      | Descripción              | Débito    | Crédito   | Saldo
31/03/2026 | TRANSFERENCIA            | 0,00      | 5000,00   | 10500,00
30/03/2026 | PAGO PROVEEDORES         | 1500,00   | 0,00      | 5500,00
29/03/2026 | DEPÓSITO CORPORATIVO     | 0,00      | 7000,00   | 7000,00
```

### Características ITAÚ
- Decimal: `,` (coma) o `.` (punto según país)
- Puede incluir múltiples monedas (USD, EUR, UYU, BRL)
- Tasa de cambio en columna adicional si hay conversión
- Código de movimiento estándar (01=TRF, 02=Débito, 03=Depósito, etc)
- Períodos: últimos 9 meses en portal

### Ejemplo ITAÚ completo
```
Fecha      | Hora     | Concepto                      | Débito  | Crédito | Saldo   | Tipo | Divisa
31/03/2026 | 14:30    | TRANSFERENCIA BANCO X         | 0.00    | 5000.00 | 10500.00| TRF  | UYU
30/03/2026 | 10:15    | PAGO TARJETA CRÉDITO VISA     | 2500.00 | 0.00    | 5500.00 | PTC  | UYU
29/03/2026 | 09:45    | DEPÓSITO CHEQUE               | 0.00    | 3000.00 | 8000.00 | CHQ  | UYU
28/03/2026 | 16:20    | EXTRACCIÓN CAJERO AUTOMÁTICO  | 500.00  | 0.00    | 5000.00 | EXT  | UYU
27/03/2026 | 08:00    | INTERÉS CAPITALIZADO          | 0.00    | 15.75   | 5515.00 | INT  | UYU
```

---

## 3. SANTANDER (Uruguay/Argentina/Chile)

### Formato: Excel (.xlsx) / PDF / CSV

**Excel Estándar**:
```
A: Fecha Operación (dd/mm/yyyy)
B: Fecha Valor (dd/mm/yyyy)
C: Referencia (código único)
D: Concepto (texto descripción)
E: Importe Débito (número positivo)
F: Importe Crédito (número positivo)
G: Saldo Resultante (número)
H: Centro (sucursal)
I: Producto (nombre de producto)
J: Moneda (ISO 4217)
```

### Ejemplo SANTANDER
```
Fecha Op.  | Fecha Valor | Referencia | Concepto                        | Débito   | Crédito  | Saldo    | Centro | Producto        | Moneda
31/03/2026 | 31/03/2026  | OP-123456  | TRANSFERENCIA DE TERCEROS       | 0,00     | 5000,00  | 10500,00 | 0500   | CUNTA VISTA     | UYU
30/03/2026 | 30/03/2026  | OP-123457  | PAGO IMPUESTOS                  | 1800,50  | 0,00     | 5500,00  | 0500   | CUENTA CORRIENTE| UYU
29/03/2026 | 29/03/2026  | OP-123458  | DEPÓSITO EFECTIVO               | 0,00     | 3000,00  | 7300,50  | 0500   | CAJA DE AHORRO  | UYU
28/03/2026 | 28/03/2026  | OP-123459  | COMISIÓN MANTENIMIENTO          | 50,00    | 0,00     | 4300,50  | 0500   | CUENTA VISTA    | UYU
27/03/2026 | 27/03/2026  | OP-123460  | TRANSFERENCIA INTERNACIONAL     | 2000,00  | 0,00     | 4350,50  | 0500   | CUENTA VISTA    | USD
```

### Características SANTANDER
- Decimal: `,` (coma)
- Miles: `.` (punto)
- Centro = sucursal
- Producto muy detallado
- Incluye moneda en columna separada
- Genera PDF para impresión
- Permite filtros por rango de fechas

---

## 4. OCA (Tarjeta de Crédito)

### Formato: PDF (principalmente) / Excel (parcial)

**Estructura PDF estándar**:
```
Resumen de Período: [mes año]
Saldo Anterior: $XXXX,XX
Compras realizadas: $XXXX,XX
Pagos realizados: -$XXXX,XX
Intereses/Gastos: $XX,XX
Saldo Actual a Pagar: $XXXX,XX

DETALLES DE COMPRAS:
Fecha | Comercio              | Localidad        | Referencia | Cuota | Monto
31/03 | SUPERMERCADO XYZ      | MONTEVIDEO       | POS-12345  | 01/01 | 543,21
30/03 | FARMACIA ABC          | MONTEVIDEO       | POS-12346  | 01/01 | 120,50
29/03 | RESTAURANTE DEF       | MONTEVIDEO       | POS-12347  | 01/01 | 890,00
28/03 | COMBUSTIBLE ANCAP     | MONTEVIDEO       | POS-12348  | 01/03 | 350,00
27/03 | TIENDA ROPA ONLINE    | ONLINE           | WEB-12349  | 01/01 | 1200,00
```

### Excel descargable (si disponible):
```csv
Fecha,Comercio,Ciudad,Referencia,Cuota,Monto,Categoría
31/03/2026,SUPERMERCADO XYZ,MONTEVIDEO,POS-12345,01/01,543.21,Supermercado
30/03/2026,FARMACIA ABC,MONTEVIDEO,POS-12346,01/01,120.50,Salud
29/03/2026,RESTAURANTE DEF,MONTEVIDEO,POS-12347,01/01,890.00,Entretenimiento
28/03/2026,COMBUSTIBLE ANCAP,MONTEVIDEO,POS-12348,01/03,350.00,Transporte
27/03/2026,TIENDA ROPA ONLINE,ONLINE,WEB-12349,01/01,1200.00,Compras
```

### Características OCA
- Principal: PDF (requiere OCR para importar)
- Movimientos siempre son débitos (es tarjeta de crédito)
- Incluye cuota si es plan de pagos
- Fecha de compra ≠ Fecha de facturación
- Comercios pueden repetirse
- Categoría automática por comercio

---

## 5. MERCADO PAGO (Billetera Digital)

### Formato: Excel / CSV / JSON (API)

**Opción A: Excel descargable (.xlsx)**
```
A: Fecha (yyyy-mm-dd)
B: Hora (HH:MM:SS)
C: Tipo de Transacción (PAGO, ENVÍO, COMPRA, RECARGA, etc)
D: Estado (COMPLETADO, PENDIENTE, RECHAZADO)
E: Descripción (texto)
F: Monto (número positivo)
G: Concepto (entrada/salida)
H: Saldo Disponible Después
I: ID Transacción
J: Método (billetera, tarjeta, transferencia)
K: Contraparteado (usuario o comercio)
```

**Ejemplo MERCADO PAGO Excel**:
```
Fecha      | Hora     | Tipo         | Estado      | Descripción                  | Monto   | Concepto | Saldo  | ID Trans. | Método      | Contraparte
2026-03-31 | 14:35    | COMPRA       | COMPLETADO  | Compra a TIENDA ONLINE       | 890.50  | SALIDA   | 4109.50| MP-123456 | BILLETERA   | tienda@mp
2026-03-30 | 10:20    | ENVÍO        | COMPLETADO  | Cobro por envío realizado    | 250.00  | ENTRADA  | 5000.00| MP-123457 | INGRESO     | cliente@mp
2026-03-29 | 16:45    | PAGO         | COMPLETADO  | Pago de servicios            | 750.00  | SALIDA   | 4750.00| MP-123458 | BILLETERA   | provee@mp
2026-03-28 | 09:15    | TRANSFERENCIA| COMPLETADO  | Transferencia a banco        | 1000.00 | SALIDA   | 5750.00| MP-123459 | BANCO       | BROU-1234
2026-03-27 | 13:50    | RECARGA      | COMPLETADO  | Recarga de saldo             | 2000.00 | ENTRADA  | 6750.00| MP-123460 | TARJETA     | Visa****1234
```

**Opción B: CSV**
```csv
fecha,hora,tipo,estado,descripcion,monto,concepto,saldo,id_transaccion,metodo,contraparte
2026-03-31,14:35,COMPRA,COMPLETADO,Compra TIENDA ONLINE,890.50,SALIDA,4109.50,MP-123456,BILLETERA,tienda@mp
2026-03-30,10:20,ENVÍO,COMPLETADO,Cobro por envío,250.00,ENTRADA,5000.00,MP-123457,INGRESO,cliente@mp
2026-03-29,16:45,PAGO,COMPLETADO,Pago servicios,750.00,SALIDA,4750.00,MP-123458,BILLETERA,provee@mp
```

**Opción C: JSON (API)**
```json
{
  "transactions": [
    {
      "id": "MP-123456",
      "fecha": "2026-03-31T14:35:00Z",
      "tipo": "COMPRA",
      "estado": "COMPLETADO",
      "descripcion": "Compra a TIENDA ONLINE",
      "monto": 890.50,
      "concepto": "SALIDA",
      "saldo_posterior": 4109.50,
      "metodo": "BILLETERA",
      "contraparte": "tienda@mp",
      "categoria": "compras_online"
    },
    {
      "id": "MP-123457",
      "fecha": "2026-03-30T10:20:00Z",
      "tipo": "ENVÍO",
      "estado": "COMPLETADO",
      "descripcion": "Cobro por envío realizado",
      "monto": 250.00,
      "concepto": "ENTRADA",
      "saldo_posterior": 5000.00,
      "metodo": "INGRESO",
      "contraparte": "cliente@mp",
      "categoria": "ingresos"
    }
  ]
}
```

### Características MERCADO PAGO
- Decimal: `.` (punto)
- Moneda por defecto: ARS, BRL, CLP, MXN, UYU
- Transacciones son entrada/salida (no débito/crédito)
- Incluye saldo disponible
- Tipos variados (PAGO, ENVÍO, COMPRA, RECARGA, RETIRO, etc)
- Método muy diverso (billetera, tarjeta, transferencia)
- Comisiones incluidas en transacción
- ID único para cada operación

---

## 6. UALA (Billetera Digital/Tarjeta Débito)

### Formato: CSV / JSON (API/App)

**Opción A: CSV descargable**
```csv
fecha,hora,categoria,comercio,ciudad,monto,moneda,estado,referencia,saldo_posterior,tipo_operacion
2026-03-31,14:35,Supermercado,JUMBO,Montevideo,543.21,UYU,COMPLETADO,POS-123456,5456.79,COMPRA
2026-03-30,10:20,Salud,FARMACIA ABC,Montevideo,120.50,UYU,COMPLETADO,POS-123457,5977.29,COMPRA
2026-03-29,16:45,Entretenimiento,CINE PALACE,Montevideo,250.00,UYU,COMPLETADO,POS-123458,6227.29,COMPRA
2026-03-28,09:15,Transporte,UBER,Online,380.50,UYU,COMPLETADO,POS-123459,6607.79,COMPRA
2026-03-27,13:50,Ingresos,RECARGA MANUAL,Online,2000.00,UYU,COMPLETADO,TRF-123460,8607.79,RECARGA
```

**Opción B: JSON (API)**
```json
{
  "transacciones": [
    {
      "id": "POS-123456",
      "fecha": "2026-03-31",
      "hora": "14:35",
      "categoria": "Supermercado",
      "comercio": "JUMBO",
      "ciudad": "Montevideo",
      "monto": 543.21,
      "moneda": "UYU",
      "estado": "COMPLETADO",
      "saldo_posterior": 5456.79,
      "tipo": "COMPRA",
      "cuotas": null,
      "cuota_activa": null,
      "pais": "UY"
    },
    {
      "id": "TRF-123460",
      "fecha": "2026-03-27",
      "hora": "13:50",
      "categoria": "Ingresos",
      "comercio": "RECARGA MANUAL",
      "ciudad": "Online",
      "monto": 2000.00,
      "moneda": "UYU",
      "estado": "COMPLETADO",
      "saldo_posterior": 8607.79,
      "tipo": "RECARGA",
      "banco_origen": "BROU",
      "pais": "UY"
    }
  ],
  "saldo_actual": 8607.79,
  "moneda_principal": "UYU"
}
```

### Características UALA
- Decimal: `.` (punto)
- Moneda por defecto: UYU, ARS, BRL
- Cada operación tiene categoría automática
- Compras se categorizan por comercio
- Soporta cuotas (planes de pago)
- Puede tener retiros en USD con conversión
- Recargas desde banco o tarjeta
- ID único por transacción
- Estado: COMPLETADO, PENDIENTE, FALLIDO

---

## COMPARATIVA: Columnas Mínimas Requeridas

Para normalizar TODOS los formatos, Fluxo necesita:

```
OBLIGATORIOS:
1. Fecha (formato variable, normalizar a YYYY-MM-DD)
2. Descripción/Concepto (texto libre)
3. Monto (número decimal, signo o columnas separadas)

DESEABLES:
4. Saldo posterior (para validación)
5. Referencia/ID único (para duplicados)
6. Moneda (si no es UYU por defecto)
7. Categoría (automática o manual)
8. Método de pago (si aplica)

OPCIONALES:
9. Hora exacta
10. Centro/sucursal
11. Código movimiento
12. Saldo anterior
```

---

## Mapa de Conversión a Fluxo

```
Columna Banco          →  Campo Fluxo
─────────────────────────────────────
Fecha Movimiento      →  fecha (YYYY-MM-DD)
Descripción/Concepto  →  concepto (max 100 chars)
Débito OR Crédito     →  monto (float, signo incluido)
Saldo (opcional)      →  metadata.saldo_posterior
Referencia/ID         →  metadata.referencia_original
Moneda                →  moneda (UYU, USD, EUR, etc)
Código Movimiento     →  metadata.codigo_banco
Centro/Sucursal       →  metadata.sucursal
Fecha Valor           →  metadata.fecha_valor
```

---

## Notas Importantes

1. **Decimales**: BROU/Santander usan `,` | Itaú/MP/Uala usan `.`
2. **Fechas**: Pueden venir DD/MM/YYYY o YYYY-MM-DD
3. **Moneda**: Asumir UYU si no especifica; algunos movimientos pueden tener conversión
4. **Saldo**: No todos lo incluyen; usar para validación cuando esté disponible
5. **Duplicados**: ID único varía (Referencia, POS-XXX, MP-XXX, TRF-XXX, etc)
6. **OCA**: Requiere OCR para PDF, pero algunos usuarios pueden descargar Excel
7. **Mercado Pago/Uala**: Tienden a tener categorías automáticas útiles
