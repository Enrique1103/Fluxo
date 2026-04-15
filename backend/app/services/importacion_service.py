"""
Sistema de importación bancaria para Fluxo.

Flujo:
  parsear_archivo() → lista de movimientos normalizados (sin guardar nada)
  confirmar_importacion() → inserta en transactions + auditoría en importaciones
"""
import hashlib
import uuid
from datetime import datetime, timezone, date as PyDate
from decimal import Decimal
from typing import Any

import pandas as pd
from sqlalchemy.orm import Session

from app.crud import category_crud, concept_crud, transaction_crud, account_crud
from app.models.importacion import Importacion, ReglaCategorias
from app.models.transactions_models import Transaction, TransactionType, TransferRole, PaymentMethod


# ---------------------------------------------------------------------------
# Reglas de categorización predefinidas
# Mapean palabras clave a nombres de categorías existentes en Fluxo
# ---------------------------------------------------------------------------

REGLAS_PREDEFINIDAS: dict[str, list[str]] = {
    "Alimentación":  ["MERCADO", "SUPER", "ALMACÉN", "CARREFOUR", "DISCO",
                      "TIENDA INGLESA", "DELIVERY", "PEDIDOS", "FERIA", "PANADERÍA"],
    "Transporte":    ["ÓMNIBUS", "STM", "UBER", "TAXI", "CABIFY", "COMBUSTIBLE",
                      "NAFTA", "GASOLINA", "YPF", "ANCAP", "SHELL"],
    "Salud":         ["FARMACIA", "MÉDICO", "CONSULTA", "MUTUALISTA", "HOSPITAL",
                      "DENTISTA", "PSICÓLOGO"],
    "Suscripciones": ["NETFLIX", "SPOTIFY", "INTERNET", "CLARO", "ANTEL",
                      "MOVISTAR", "GIMNASIO", "DISNEY", "HBO", "AMAZON PRIME"],
    "Ocio":          ["RESTAURANTE", "BAR ", "CINE", "TEATRO", "BOLICHE",
                      "CLUB ", "CERVECERÍA"],
    "Vivienda":      ["ALQUILER", "LUZ ", "AGUA ", "GAS ", "UTE", "OSE",
                      "GASTOS COMUNES", "ADMINISTRACIÓN"],
    "Sin clasificar": [],
}


# ---------------------------------------------------------------------------
# NormalizadorFechas
# ---------------------------------------------------------------------------

class NormalizadorFechas:
    """Convierte cualquier string de fecha a YYYY-MM-DD."""

    FORMATOS = [
        "%d/%m/%Y",  # 31/03/2026
        "%d-%m-%Y",  # 31-03-2026
        "%Y/%m/%d",  # 2026/03/31
        "%Y-%m-%d",  # 2026-03-31
        "%d/%m/%y",  # 31/03/26
        "%m/%d/%Y",  # 03/31/2026
    ]

    @staticmethod
    def normalizar(fecha_str: str) -> str:
        """Retorna 'YYYY-MM-DD'. Lanza ValueError si no puede parsear."""
        texto = str(fecha_str).strip()
        for fmt in NormalizadorFechas.FORMATOS:
            try:
                return datetime.strptime(texto, fmt).strftime("%Y-%m-%d")
            except ValueError:
                continue
        raise ValueError(f"No se pudo parsear la fecha: '{fecha_str}'")


# ---------------------------------------------------------------------------
# DetectorDuplicados
# ---------------------------------------------------------------------------

class DetectorDuplicados:
    """Hash SHA-256 truncado para detectar movimientos repetidos."""

    @staticmethod
    def generar_hash(fecha: str, concepto: str, monto: float,
                     cuenta_id: str) -> str:
        """Retorna 16 caracteres hex."""
        dato = f"{fecha}|{concepto.upper().strip()}|{round(monto, 2)}|{cuenta_id}"
        return hashlib.sha256(dato.encode()).hexdigest()[:16]

    @staticmethod
    def hashes_existentes(db: Session, user_id: uuid.UUID,
                          cuenta_id: uuid.UUID) -> dict[str, dict]:
        """Devuelve dict {import_hash: tx_detail} de transacciones ya importadas."""
        rows = (
            db.query(Transaction)
            .filter(
                Transaction.user_id == user_id,
                Transaction.account_id == cuenta_id,
                Transaction.import_hash.isnot(None),
                Transaction.is_deleted.is_(False),
            )
            .all()
        )
        result = {}
        for tx in rows:
            result[tx.import_hash] = {
                "id": str(tx.id),
                "fecha": tx.date.strftime("%Y-%m-%d") if tx.date else "",
                "monto": float(tx.amount) if tx.type == "income" else -float(tx.amount),
                "tipo": str(tx.type.value) if hasattr(tx.type, "value") else str(tx.type),
                "concepto": tx.concept.name if tx.concept else None,
                "categoria": tx.category.name if tx.category else None,
                "descripcion": tx.description,
            }
        return result

    @staticmethod
    def claves_fecha_monto(db: Session, user_id: uuid.UUID,
                           cuenta_id: uuid.UUID) -> dict[tuple, dict]:
        """Devuelve dict {(fecha_str, monto): tx_detail} de transacciones existentes."""
        from app.models.transactions_models import Transaction as Tx
        rows = (
            db.query(Tx)
            .filter(
                Tx.user_id == user_id,
                Tx.account_id == cuenta_id,
                Tx.is_deleted.is_(False),
            )
            .all()
        )
        result = {}
        for tx in rows:
            fecha_str = tx.date.strftime("%Y-%m-%d") if tx.date else ""
            monto = float(tx.amount) if str(tx.type) in ("income", "TransactionType.INCOME") else -float(tx.amount)
            clave = (fecha_str, round(monto, 2))
            result[clave] = {
                "id": str(tx.id),
                "fecha": fecha_str,
                "monto": monto,
                "tipo": tx.type.value if hasattr(tx.type, "value") else str(tx.type),
                "concepto": tx.concept.name if tx.concept else None,
                "categoria": tx.category.name if tx.category else None,
                "descripcion": tx.description,
            }
        return result


# ---------------------------------------------------------------------------
# CategorizadorLocal
# ---------------------------------------------------------------------------

class CategorizadorLocal:
    """
    Categoriza movimientos usando palabras clave.
    Prioridad: reglas aprendidas del usuario (BD) > predefinidas.
    """

    def __init__(self, db: Session, user_id: uuid.UUID):
        self.db = db
        self.user_id = user_id
        self._personalizadas: dict[str, list[str]] = {}
        self._cargar_personalizadas()

    def _cargar_personalizadas(self) -> None:
        rows = (
            self.db.query(ReglaCategorias)
            .filter(ReglaCategorias.user_id == self.user_id)
            .all()
        )
        for r in rows:
            self._personalizadas.setdefault(r.categoria, []).append(r.palabra_clave)

    def categorizar(self, concepto: str) -> tuple[str | None, float]:
        """
        Retorna (nombre_categoria, confianza).
        Si no encuentra nada devuelve (None, 0.0).
        """
        texto = concepto.upper()

        for cat, palabras in self._personalizadas.items():
            if any(p.upper() in texto for p in palabras):
                return cat, 0.95

        for cat, palabras in REGLAS_PREDEFINIDAS.items():
            if cat == "Sin clasificar":
                continue
            if any(p.upper() in texto for p in palabras):
                return cat, 0.85

        return None, 0.0

    def registrar_aprendizaje(self, concepto: str, categoria: str) -> None:
        """Guarda una nueva palabra clave para aprendizaje futuro."""
        palabra = concepto.upper().strip()[:100]
        existe = (
            self.db.query(ReglaCategorias)
            .filter(
                ReglaCategorias.user_id == self.user_id,
                ReglaCategorias.categoria == categoria,
                ReglaCategorias.palabra_clave == palabra,
            )
            .first()
        )
        if not existe:
            regla = ReglaCategorias(
                user_id=self.user_id,
                categoria=categoria,
                palabra_clave=palabra,
                confianza=0.90,
            )
            self.db.add(regla)


# ---------------------------------------------------------------------------
# DetectorBanco
# ---------------------------------------------------------------------------

class DetectorBanco:
    """
    Detecta automáticamente el banco/formato de un archivo bancario
    inspeccionando columnas y valores sin que el usuario deba especificar el banco.
    """

    _COLS_ZCUENTAS = {"Fecha", "Tipo", "Cuenta", "Concepto", "Etiqueta", "Importe"}
    _TIPOS_ZCUENTAS = {"Gasto", "Ingreso", "Transferencia"}

    @staticmethod
    def _header_row_zcuentas(archivo_bytes: bytes) -> int:
        """
        Detecta la fila (0-indexada) que contiene el encabezado del export Zcuentas.
        Distintas versiones de la app exportan con distinto número de filas de metadata
        antes del encabezado. Prueba filas 0-9 y retorna la primera que tenga
        {Fecha, Tipo, Importe}. Lanza ValueError si no encuentra ninguna.
        """
        import io
        for row in range(10):
            try:
                df = pd.read_excel(
                    io.BytesIO(archivo_bytes), engine="openpyxl",
                    header=row, nrows=3,
                )
                if {"Fecha", "Tipo", "Importe"}.issubset(set(df.columns)):
                    return row
            except Exception:
                continue
        raise ValueError(
            "No se encontró la fila de encabezado en el archivo. "
            "Verificá que sea un export de Zcuentas válido."
        )

    @classmethod
    def detectar(cls, archivo_bytes: bytes) -> str:
        """Retorna el id de banco. Lanza ValueError si no puede determinarlo."""
        import io

        if archivo_bytes[:4] == b"%PDF":
            return "oca"

        # xlsx/xls — Zcuentas primero (auto-detecta la fila de encabezado)
        try:
            header_row = cls._header_row_zcuentas(archivo_bytes)
            df_z = pd.read_excel(io.BytesIO(archivo_bytes), engine="openpyxl", header=header_row, nrows=10)
            if cls._COLS_ZCUENTAS.issubset(set(df_z.columns)):
                tipos = {str(v).strip() for v in df_z["Tipo"].dropna().unique()}
                if tipos & cls._TIPOS_ZCUENTAS:
                    return "zcuentas"
        except Exception:
            pass

        try:
            df = pd.read_excel(io.BytesIO(archivo_bytes), engine="openpyxl", nrows=10)
            cols = set(df.columns)
            if "Moneda Origen" in cols and "Estado" in cols:
                return "prex"
            if "ID_Transacción" in cols or "Contraparte" in cols:
                return "mercadopago"
            if "ID_TRANSACCION" in cols and "ESTADO" in cols:
                return "midinero"
        except Exception:
            pass

        # CSV
        for enc in ("utf-8-sig", "utf-8", "latin-1", "cp1252"):
            try:
                df = pd.read_csv(io.BytesIO(archivo_bytes), encoding=enc, nrows=5, sep=None, engine="python")
                cols = set(df.columns)
                if "Fecha Movimiento" in cols and "Débito" in cols:
                    return "brou"
                if "Movimiento" in cols and "Divisa" in cols:
                    return "itau"
                # Santander formato nuevo: Fecha,Hora,Tipo,Descripción,Referencia,Débito,Crédito,Saldo
                if "Hora" in cols and "Tipo" in cols and "Débito" in cols and "Crédito" in cols:
                    return "santander"
                # Santander formato antiguo: Fecha Operación, Importe Débito, Importe Crédito
                if "Fecha Operación" in cols and "Importe Débito" in cols:
                    return "santander"
                if "NÚMERO_CUENTA" in cols or "NUMERO_CUENTA" in cols:
                    return "scotiabank"
                if "Tipo_Operación" in cols or "Tipo_Operacion" in cols:
                    return "uala"
                if "Comercio" in cols and "Localidad" in cols:
                    return "oca"
                break
            except Exception:
                continue

        raise ValueError(
            "No se pudo determinar el formato del archivo. "
            "Verificá que sea un extracto bancario válido (Prex, BROU, Itaú, Zcuentas, OCA, etc.)."
        )

    @classmethod
    def extraer_cuentas_zcuentas(cls, archivo_bytes: bytes) -> list[tuple[str, str]]:
        """Retorna lista de (nombre_cuenta, moneda) únicas del export Zcuentas."""
        import io
        header_row = cls._header_row_zcuentas(archivo_bytes)
        df = pd.read_excel(io.BytesIO(archivo_bytes), engine="openpyxl", header=header_row)
        vistas: dict[str, str] = {}
        for _, row in df.iterrows():
            nombre = str(row.get("Cuenta", "") or "").strip()
            if nombre and nombre.lower() not in ("nan", "none", ""):
                moneda = "USD" if "USD" in nombre.upper() else "UYU"
                vistas[nombre] = moneda
        return list(vistas.items())


def _fuzzy_score(a: str, b: str) -> float:
    """Similitud [0,1] entre dos nombres de cuenta."""
    from difflib import SequenceMatcher
    a_n = a.lower().strip()
    b_n = b.lower().strip()
    if a_n == b_n:
        return 1.0
    if a_n in b_n or b_n in a_n:
        return 0.85
    return SequenceMatcher(None, a_n, b_n).ratio()


# ---------------------------------------------------------------------------
# ParserPrex
# ---------------------------------------------------------------------------

class ParserPrex:
    """
    Parsea Excel de Prex.

    Columnas esperadas:
        Fecha | Descripción | Moneda Origen | Importe Origen | Moneda | Importe | Estado

    Solo importa filas con Estado == "Confirmado".
    Método de pago: siempre tarjeta_debito.
    """

    def __init__(self, categorizador: CategorizadorLocal):
        self.categorizador = categorizador

    def parsear(self, archivo_bytes: bytes, cuenta_id: uuid.UUID) -> list[dict]:
        import io
        try:
            df = pd.read_excel(io.BytesIO(archivo_bytes), engine='openpyxl')
        except Exception:
            df = pd.read_excel(io.BytesIO(archivo_bytes), engine='xlrd')

        movimientos: list[dict] = []

        for idx, row in df.iterrows():
            estado_fila = str(row.get("Estado", "")).strip()
            if estado_fila != "Confirmado":
                continue

            try:
                fecha_str = NormalizadorFechas.normalizar(row["Fecha"])
                descripcion_raw = str(row["Descripción"]).strip()
                monto = float(row["Importe"])
                moneda = str(row.get("Moneda", "UYU")).strip()

                categoria, _ = self.categorizador.categorizar(descripcion_raw)
                hash_mov = DetectorDuplicados.generar_hash(
                    fecha_str, descripcion_raw, monto, str(cuenta_id)
                )

                movimientos.append({
                    "fecha": fecha_str,
                    "concepto": None,
                    "monto": monto,
                    "moneda": moneda,
                    "categoria": categoria,
                    "metodo_pago": "tarjeta_debito",
                    "descripcion": descripcion_raw[:200] if descripcion_raw else None,
                    "estado": "validado",
                    "import_hash": hash_mov,
                    "metadata": {
                        "moneda_origen": str(row.get("Moneda Origen", "")),
                        "importe_origen": row.get("Importe Origen"),
                        "banco": "prex",
                    },
                })

            except Exception as exc:
                movimientos.append({
                    "estado": "error",
                    "error": str(exc),
                    "fila": idx + 2,
                    "concepto": str(row.get("Descripción", f"Fila {idx + 2}")),
                    "import_hash": None,
                })

        return movimientos


# ---------------------------------------------------------------------------
# Helper decimal (maneja tanto 1.500,50 europeo como 1500.50 anglosajón)
# ---------------------------------------------------------------------------

def _to_float(val) -> float:
    import re as _re
    s = str(val).strip()
    if not s or s in ("nan", "-", ""):
        return 0.0
    # Quitar símbolos de moneda y espacios
    s = s.replace("$", "").replace("€", "").replace("€", "").replace("\xa0", "").strip()
    if not s:
        return 0.0
    if "," in s and "." in s:
        # Formato europeo: 1.500,50 (punto = miles, coma = decimal)
        s = s.replace(".", "").replace(",", ".")
    elif "," in s:
        # Puede ser 1.290 (sin coma) → tratar coma como decimal
        s = s.replace(",", ".")
    elif _re.search(r"\.\d{3}$", s):
        # Punto seguido de exactamente 3 dígitos al final → separador de miles EU
        # Ej: 1.290 → 1290, 12.345 → 12345, 1.290.500 → 1290500
        s = s.replace(".", "")
    return float(s)


# ---------------------------------------------------------------------------
# ParserBrou
# ---------------------------------------------------------------------------

class ParserBrou:
    """
    CSV exportado por BROU.
    Columnas: Fecha Movimiento, Fecha Valor, Referencia, Descripción,
              Débito, Crédito, Saldo, Código, Sucursal
    Débito > 0 → gasto; Crédito > 0 → ingreso. Filas con ambos en 0 se omiten.
    """

    _METODO = {
        "EXT": "efectivo", "TRF": "transferencia_bancaria",
        "TRE": "transferencia_bancaria", "DEP": "transferencia_bancaria",
        "CHQ": "transferencia_bancaria",
    }

    def __init__(self, categorizador: CategorizadorLocal):
        self.categorizador = categorizador

    def parsear(self, archivo_bytes: bytes, cuenta_id: uuid.UUID) -> list[dict]:
        import io
        df = pd.read_csv(io.BytesIO(archivo_bytes))

        movimientos: list[dict] = []
        for idx, row in df.iterrows():
            try:
                debito  = _to_float(row.get("Débito",  0))
                credito = _to_float(row.get("Crédito", 0))
                if debito == 0 and credito == 0:
                    continue

                fecha_str      = NormalizadorFechas.normalizar(row["Fecha Movimiento"])
                descripcion_raw = str(row["Descripción"]).strip()
                monto  = credito if credito > 0 else -debito
                moneda = "UYU"
                codigo = str(row.get("Código", "")).strip()
                metodo = self._METODO.get(codigo, "otro")

                categoria, _ = self.categorizador.categorizar(descripcion_raw)
                hash_mov = DetectorDuplicados.generar_hash(fecha_str, descripcion_raw, monto, str(cuenta_id))

                movimientos.append({
                    "fecha": fecha_str, "concepto": None,
                    "monto": monto, "moneda": moneda,
                    "categoria": categoria, "metodo_pago": metodo,
                    "descripcion": descripcion_raw[:200],
                    "estado": "validado", "import_hash": hash_mov,
                    "metadata": {
                        "referencia": str(row.get("Referencia", "")),
                        "codigo": codigo, "sucursal": str(row.get("Sucursal", "")),
                        "banco": "brou",
                    },
                })
            except Exception as exc:
                movimientos.append({
                    "estado": "error", "error": str(exc), "fila": idx + 2,
                    "concepto": str(row.get("Descripción", f"Fila {idx + 2}")),
                    "import_hash": None,
                })
        return movimientos


# ---------------------------------------------------------------------------
# ParserItau
# ---------------------------------------------------------------------------

class ParserItau:
    """
    CSV exportado por Itaú.
    Columnas: Fecha, Hora, Movimiento, Débito, Crédito, Saldo, Tipo,
              Comprobante, Referencia, Divisa
    """

    _METODO = {
        "RTD": "tarjeta_debito", "PTC": "tarjeta_credito",
        "TRF": "transferencia_bancaria", "TRE": "transferencia_bancaria",
        "DEP": "transferencia_bancaria", "EXT": "efectivo",
    }

    def __init__(self, categorizador: CategorizadorLocal):
        self.categorizador = categorizador

    def parsear(self, archivo_bytes: bytes, cuenta_id: uuid.UUID) -> list[dict]:
        import io
        df = pd.read_csv(io.BytesIO(archivo_bytes))

        movimientos: list[dict] = []
        for idx, row in df.iterrows():
            try:
                debito  = _to_float(row.get("Débito",  0))
                credito = _to_float(row.get("Crédito", 0))
                if debito == 0 and credito == 0:
                    continue

                fecha_str       = NormalizadorFechas.normalizar(row["Fecha"])
                descripcion_raw = str(row["Movimiento"]).strip()
                monto  = credito if credito > 0 else -debito
                moneda = str(row.get("Divisa", "UYU")).strip()
                tipo   = str(row.get("Tipo", "")).strip()
                metodo = self._METODO.get(tipo, "otro")

                categoria, _ = self.categorizador.categorizar(descripcion_raw)
                hash_mov = DetectorDuplicados.generar_hash(fecha_str, descripcion_raw, monto, str(cuenta_id))

                movimientos.append({
                    "fecha": fecha_str, "concepto": None,
                    "monto": monto, "moneda": moneda,
                    "categoria": categoria, "metodo_pago": metodo,
                    "descripcion": descripcion_raw[:200],
                    "estado": "validado", "import_hash": hash_mov,
                    "metadata": {
                        "tipo": tipo,
                        "comprobante": str(row.get("Comprobante", "")),
                        "referencia": str(row.get("Referencia", "")),
                        "banco": "itau",
                    },
                })
            except Exception as exc:
                movimientos.append({
                    "estado": "error", "error": str(exc), "fila": idx + 2,
                    "concepto": str(row.get("Movimiento", f"Fila {idx + 2}")),
                    "import_hash": None,
                })
        return movimientos


# ---------------------------------------------------------------------------
# ParserSantander
# ---------------------------------------------------------------------------

class ParserSantander:
    """
    CSV exportado por Santander Uruguay. Soporta dos formatos:

    Formato nuevo (app/web):
        Fecha, Hora, Tipo, Descripción, Referencia, Débito, Crédito, Saldo

    Formato antiguo (banca online legacy):
        Fecha Operación, Fecha Valor, Referencia, Concepto,
        Importe Débito, Importe Crédito, Saldo, Centro, Producto, Moneda
    """

    def __init__(self, categorizador: CategorizadorLocal):
        self.categorizador = categorizador

    def parsear(self, archivo_bytes: bytes, cuenta_id: uuid.UUID) -> list[dict]:
        import io

        for enc in ("utf-8-sig", "utf-8", "latin-1", "cp1252"):
            try:
                df = pd.read_csv(io.BytesIO(archivo_bytes), encoding=enc, sep=None, engine="python")
                break
            except Exception:
                continue
        else:
            return [{"estado": "error", "error": "No se pudo leer el CSV", "fila": 1,
                     "concepto": "archivo", "import_hash": None}]

        cols = set(df.columns)
        # Detectar qué formato es
        formato_nuevo = "Hora" in cols and "Descripción" in cols and "Débito" in cols

        movimientos: list[dict] = []
        for idx, row in df.iterrows():
            try:
                if formato_nuevo:
                    debito  = _to_float(row.get("Débito",  0))
                    credito = _to_float(row.get("Crédito", 0))
                    if debito == 0 and credito == 0:
                        continue
                    fecha_str       = NormalizadorFechas.normalizar(row["Fecha"])
                    descripcion_raw = str(row.get("Descripción", "")).strip()
                    monto  = credito if credito > 0 else -debito
                    moneda = "UYU"
                    referencia = str(row.get("Referencia", ""))
                    tipo       = str(row.get("Tipo", ""))
                else:
                    debito  = _to_float(row.get("Importe Débito",  0))
                    credito = _to_float(row.get("Importe Crédito", 0))
                    if debito == 0 and credito == 0:
                        continue
                    fecha_str       = NormalizadorFechas.normalizar(row["Fecha Operación"])
                    descripcion_raw = str(row.get("Concepto", "")).strip()
                    monto  = credito if credito > 0 else -debito
                    moneda = str(row.get("Moneda", "UYU")).strip()
                    referencia = str(row.get("Referencia", ""))
                    tipo       = str(row.get("Producto", ""))

                if not descripcion_raw:
                    continue

                categoria, _ = self.categorizador.categorizar(descripcion_raw)
                hash_mov = DetectorDuplicados.generar_hash(fecha_str, descripcion_raw, monto, str(cuenta_id))

                movimientos.append({
                    "fecha": fecha_str, "concepto": None,
                    "monto": monto, "moneda": moneda,
                    "categoria": categoria, "metodo_pago": "transferencia_bancaria",
                    "descripcion": descripcion_raw[:200],
                    "estado": "validado", "import_hash": hash_mov,
                    "metadata": {
                        "referencia": referencia,
                        "tipo": tipo,
                        "banco": "santander",
                    },
                })
            except Exception as exc:
                desc_col = "Descripción" if formato_nuevo else "Concepto"
                movimientos.append({
                    "estado": "error", "error": str(exc), "fila": idx + 2,
                    "concepto": str(row.get(desc_col, f"Fila {idx + 2}")),
                    "import_hash": None,
                })
        return movimientos


# ---------------------------------------------------------------------------
# ParserOca
# ---------------------------------------------------------------------------

class ParserOca:
    """
    OCA (tarjeta de crédito). Soporta dos formatos:
      - PDF: formato principal exportado por OCA (usa pdfplumber)
      - CSV: formato alternativo / mock de prueba

    Estructura PDF esperada:
      DETALLES DE COMPRAS:
      Fecha | Comercio | Localidad | Referencia | Cuota | Monto
      31/03 | SUPERMERCADO XYZ | MONTEVIDEO | POS-12345 | 01/01 | 543,21

    Todos los movimientos son gastos (tarjeta de crédito).
    """

    def __init__(self, categorizador: CategorizadorLocal):
        self.categorizador = categorizador

    # ------------------------------------------------------------------
    # Dispatcher
    # ------------------------------------------------------------------

    def parsear(self, archivo_bytes: bytes, cuenta_id: uuid.UUID) -> list[dict]:
        if archivo_bytes[:4] == b"%PDF":
            return self._parsear_pdf(archivo_bytes, cuenta_id)
        return self._parsear_csv(archivo_bytes, cuenta_id)

    # ------------------------------------------------------------------
    # PDF
    # ------------------------------------------------------------------

    def _parsear_pdf(self, archivo_bytes: bytes, cuenta_id: uuid.UUID) -> list[dict]:
        import io
        import re
        import pdfplumber

        movimientos: list[dict] = []
        anio_actual = datetime.now().year

        with pdfplumber.open(io.BytesIO(archivo_bytes)) as pdf:
            # Detectar año en cualquier página
            texto_completo = "\n".join(p.extract_text() or "" for p in pdf.pages)
            match_anio = re.search(r"\b(20\d{2})\b", texto_completo)
            anio = int(match_anio.group(1)) if match_anio else anio_actual

            # Intentar con extract_tables() primero (más preciso para tablas)
            filas_crudas: list[list] = []
            for page in pdf.pages:
                tablas = page.extract_tables()
                for tabla in tablas:
                    for fila in tabla:
                        if fila:
                            filas_crudas.append(fila)

            import logging
            logger = logging.getLogger("importacion.oca")
            logger.warning(f"OCA PDF — filas extraídas: {len(filas_crudas)}")
            if filas_crudas:
                logger.warning(f"OCA PDF — primeras 5 filas: {filas_crudas[:5]}")

            if filas_crudas:
                movimientos = self._procesar_filas_tabla(filas_crudas, anio, cuenta_id)

            # Fallback: extract_text() línea a línea
            if not movimientos:
                logger.warning(f"OCA PDF — texto[:800]: {texto_completo[:800]}")
                movimientos = self._procesar_texto(texto_completo, anio, cuenta_id)

        return movimientos

    def _procesar_filas_tabla(
        self, filas: list[list], anio: int, cuenta_id: uuid.UUID
    ) -> list[dict]:
        """Procesa filas extraídas con extract_tables()."""
        import re
        movimientos: list[dict] = []

        # Detectar columnas buscando la fila de encabezado
        idx_header = None
        col_fecha = col_comercio = col_localidad = col_ref = col_cuota = col_monto = None

        for i, fila in enumerate(filas):
            celdas = [str(c or "").strip().upper() for c in fila]
            texto = " ".join(celdas)
            if "FECHA" in texto and "MONTO" in texto:
                idx_header = i
                for j, c in enumerate(celdas):
                    if "FECHA" in c:       col_fecha     = j
                    if "COMERCIO" in c:    col_comercio  = j
                    if "LOCALIDAD" in c or "CIUDAD" in c: col_localidad = j
                    if "REFERENCIA" in c or "REF" in c:   col_ref       = j
                    if "CUOTA" in c:       col_cuota     = j
                    if "MONTO" in c or "IMPORTE" in c:    col_monto     = j
                break

        # Si no encontramos header claro, asumir orden estándar OCA
        if idx_header is None:
            # Buscar primera fila que parece una fecha DD/MM
            for i, fila in enumerate(filas):
                if fila and re.match(r"\d{2}/\d{2}", str(fila[0] or "").strip()):
                    idx_header = i - 1  # la anterior sería el header
                    break

        if col_fecha    is None: col_fecha    = 0
        if col_comercio is None: col_comercio = 1
        if col_localidad is None: col_localidad = 2
        if col_monto    is None: col_monto    = len(filas[0]) - 1 if filas else 5

        inicio = (idx_header + 1) if idx_header is not None else 0

        for idx, fila in enumerate(filas[inicio:], start=inicio):
            try:
                fecha_raw = str(fila[col_fecha] or "").strip()
                if not re.match(r"\d{1,2}/\d{2}", fecha_raw):
                    continue

                # Completar año
                if re.match(r"^\d{2}/\d{2}$", fecha_raw):
                    fecha_raw = f"{fecha_raw}/{anio}"
                fecha_str = NormalizadorFechas.normalizar(fecha_raw)

                comercio  = str(fila[col_comercio]  or "").strip() if col_comercio  < len(fila) else ""
                localidad = str(fila[col_localidad] or "").strip() if col_localidad < len(fila) else ""
                monto_raw = str(fila[col_monto]     or "").strip() if col_monto     < len(fila) else "0"
                referencia = str(fila[col_ref] or "").strip() if col_ref and col_ref < len(fila) else ""
                cuota      = str(fila[col_cuota] or "").strip() if col_cuota and col_cuota < len(fila) else ""

                descripcion_raw = f"{comercio} - {localidad}" if localidad else comercio
                if not descripcion_raw.strip():
                    continue

                monto = -abs(_to_float(monto_raw))
                if monto == 0:
                    continue

                categoria, _ = self.categorizador.categorizar(descripcion_raw)
                hash_mov = DetectorDuplicados.generar_hash(
                    fecha_str, descripcion_raw, monto, str(cuenta_id)
                )
                movimientos.append({
                    "fecha": fecha_str, "concepto": None,
                    "monto": monto, "moneda": "UYU",
                    "categoria": categoria, "metodo_pago": "tarjeta_credito",
                    "descripcion": descripcion_raw[:200],
                    "estado": "validado", "import_hash": hash_mov,
                    "metadata": {
                        "referencia": referencia, "cuota": cuota,
                        "banco": "oca", "fuente": "pdf",
                    },
                })
            except Exception as exc:
                movimientos.append({
                    "estado": "error", "error": str(exc), "fila": idx + 1,
                    "concepto": str(fila[col_comercio] if col_comercio < len(fila) else f"Fila {idx}"),
                    "import_hash": None,
                })

        return movimientos

    def _procesar_texto(
        self, texto: str, anio: int, cuenta_id: uuid.UUID
    ) -> list[dict]:
        """Fallback: parsea texto plano línea a línea."""
        import re
        movimientos: list[dict] = []
        en_detalle = False

        for idx, linea in enumerate(texto.splitlines()):
            linea = linea.strip()
            if not linea:
                continue

            if "DETALLES" in linea.upper() and "COMPRA" in linea.upper():
                en_detalle = True
                continue
            if en_detalle and re.match(r"^(SALDO|TOTAL|INTER|PAGO|RESUMEN)", linea.upper()):
                break
            if not en_detalle:
                continue

            # Fecha al inicio de la línea
            m = re.match(r"^(\d{2}/\d{2}(?:/\d{4})?)\s+(.+?)\s+([\d.,]+)\s*$", linea)
            if not m:
                continue

            try:
                fecha_raw = m.group(1)
                if re.match(r"^\d{2}/\d{2}$", fecha_raw):
                    fecha_raw = f"{fecha_raw}/{anio}"
                fecha_str       = NormalizadorFechas.normalizar(fecha_raw)
                descripcion_raw = m.group(2).strip()
                monto           = -abs(_to_float(m.group(3)))

                if monto == 0:
                    continue

                categoria, _ = self.categorizador.categorizar(descripcion_raw)
                hash_mov = DetectorDuplicados.generar_hash(
                    fecha_str, descripcion_raw, monto, str(cuenta_id)
                )
                movimientos.append({
                    "fecha": fecha_str, "concepto": None,
                    "monto": monto, "moneda": "UYU",
                    "categoria": categoria, "metodo_pago": "tarjeta_credito",
                    "descripcion": descripcion_raw[:200],
                    "estado": "validado", "import_hash": hash_mov,
                    "metadata": {"banco": "oca", "fuente": "pdf_texto"},
                })
            except Exception as exc:
                movimientos.append({
                    "estado": "error", "error": str(exc),
                    "fila": idx + 1, "concepto": linea[:50],
                    "import_hash": None,
                })

        return movimientos

    # ------------------------------------------------------------------
    # CSV (mock de prueba / export alternativo)
    # ------------------------------------------------------------------

    def _parsear_csv(self, archivo_bytes: bytes, cuenta_id: uuid.UUID) -> list[dict]:
        import io
        df = pd.read_csv(io.BytesIO(archivo_bytes))

        movimientos: list[dict] = []
        for idx, row in df.iterrows():
            estado_fila = str(row.get("Estado", "COMPLETADO")).strip().upper()
            if estado_fila != "COMPLETADO":
                continue

            try:
                fecha_str = NormalizadorFechas.normalizar(row["Fecha"])
                comercio  = str(row.get("Comercio", "")).strip()
                localidad = str(row.get("Localidad", "")).strip()
                descripcion_raw = f"{comercio} - {localidad}" if localidad else comercio
                monto = -abs(_to_float(row.get("Monto", 0)))

                if monto == 0:
                    continue

                categoria, _ = self.categorizador.categorizar(descripcion_raw)
                hash_mov = DetectorDuplicados.generar_hash(fecha_str, descripcion_raw, monto, str(cuenta_id))

                movimientos.append({
                    "fecha": fecha_str, "concepto": None,
                    "monto": monto, "moneda": "UYU",
                    "categoria": categoria, "metodo_pago": "tarjeta_credito",
                    "descripcion": descripcion_raw[:200],
                    "estado": "validado", "import_hash": hash_mov,
                    "metadata": {
                        "referencia": str(row.get("Referencia", "")),
                        "cuota": str(row.get("Cuota", "")),
                        "banco": "oca", "fuente": "csv",
                    },
                })
            except Exception as exc:
                movimientos.append({
                    "estado": "error", "error": str(exc), "fila": idx + 2,
                    "concepto": str(row.get("Comercio", f"Fila {idx + 2}")),
                    "import_hash": None,
                })
        return movimientos


# ---------------------------------------------------------------------------
# ParserMercadoPago
# ---------------------------------------------------------------------------

class ParserMercadoPago:
    """
    CSV/Excel exportado por Mercado Pago.
    Columnas: Fecha, Hora, Tipo, Estado, Descripción, Monto, Concepto,
              Saldo, ID_Transacción, Método, Contraparte, Categoría
    Concepto: SALIDA → gasto, ENTRADA → ingreso. Solo COMPLETADO.
    """

    _METODO = {
        "BILLETERA": "billetera_digital",
        "BANCO":     "transferencia_bancaria",
        "TARJETA":   "tarjeta_debito",
        "INGRESO":   "transferencia_bancaria",
    }

    def __init__(self, categorizador: CategorizadorLocal):
        self.categorizador = categorizador

    def parsear(self, archivo_bytes: bytes, cuenta_id: uuid.UUID) -> list[dict]:
        import io
        try:
            df = pd.read_excel(io.BytesIO(archivo_bytes), engine='openpyxl')
        except Exception:
            df = pd.read_csv(io.BytesIO(archivo_bytes))

        movimientos: list[dict] = []
        for idx, row in df.iterrows():
            estado_fila = str(row.get("Estado", "")).strip().upper()
            if estado_fila != "COMPLETADO":
                continue

            try:
                fecha_str       = NormalizadorFechas.normalizar(row["Fecha"])
                descripcion_raw = str(row.get("Descripción", "")).strip()
                monto_raw       = _to_float(row.get("Monto", 0))
                direccion       = str(row.get("Concepto", "SALIDA")).strip().upper()
                monto = monto_raw if direccion == "ENTRADA" else -abs(monto_raw)

                if monto == 0:
                    continue

                metodo_raw = str(row.get("Método", "")).strip().upper()
                metodo     = self._METODO.get(metodo_raw, "billetera_digital")

                categoria, _ = self.categorizador.categorizar(descripcion_raw)
                hash_mov = DetectorDuplicados.generar_hash(fecha_str, descripcion_raw, monto, str(cuenta_id))

                movimientos.append({
                    "fecha": fecha_str, "concepto": None,
                    "monto": monto, "moneda": "UYU",
                    "categoria": categoria, "metodo_pago": metodo,
                    "descripcion": descripcion_raw[:200],
                    "estado": "validado", "import_hash": hash_mov,
                    "metadata": {
                        "id_transaccion": str(row.get("ID_Transacción", "")),
                        "tipo": str(row.get("Tipo", "")),
                        "contraparte": str(row.get("Contraparte", "")),
                        "banco": "mercadopago",
                    },
                })
            except Exception as exc:
                movimientos.append({
                    "estado": "error", "error": str(exc), "fila": idx + 2,
                    "concepto": str(row.get("Descripción", f"Fila {idx + 2}")),
                    "import_hash": None,
                })
        return movimientos


# ---------------------------------------------------------------------------
# ParserUala
# ---------------------------------------------------------------------------

class ParserUala:
    """
    CSV exportado por Uala.
    Columnas: Fecha, Hora, Categoría, Comercio, Ciudad, Monto, Moneda,
              Estado, Referencia, Saldo_Posterior, Tipo_Operación, Cuotas
    COMPRA/RETIRO → gasto; RECARGA/TRANSFERENCIA → ingreso. Solo COMPLETADO.
    """

    _GASTOS  = {"COMPRA", "RETIRO"}
    _INGRESOS = {"RECARGA", "TRANSFERENCIA"}

    def __init__(self, categorizador: CategorizadorLocal):
        self.categorizador = categorizador

    def parsear(self, archivo_bytes: bytes, cuenta_id: uuid.UUID) -> list[dict]:
        import io
        df = pd.read_csv(io.BytesIO(archivo_bytes))

        movimientos: list[dict] = []
        for idx, row in df.iterrows():
            estado_fila = str(row.get("Estado", "")).strip().upper()
            if estado_fila != "COMPLETADO":
                continue

            try:
                fecha_str = NormalizadorFechas.normalizar(row["Fecha"])
                comercio  = str(row.get("Comercio", "")).strip()
                ciudad    = str(row.get("Ciudad",   "")).strip()
                descripcion_raw = f"{comercio} - {ciudad}" if ciudad and ciudad.upper() != "ONLINE" else comercio
                monto_raw   = _to_float(row.get("Monto", 0))
                moneda      = str(row.get("Moneda", "UYU")).strip()
                tipo_op     = str(row.get("Tipo_Operación", "COMPRA")).strip().upper()

                if tipo_op in self._GASTOS:
                    monto  = -abs(monto_raw)
                    metodo = "efectivo" if tipo_op == "RETIRO" else "tarjeta_debito"
                elif tipo_op in self._INGRESOS:
                    monto  = abs(monto_raw)
                    metodo = "transferencia_bancaria"
                else:
                    monto  = -abs(monto_raw)
                    metodo = "otro"

                if monto == 0:
                    continue

                categoria, _ = self.categorizador.categorizar(descripcion_raw)
                hash_mov = DetectorDuplicados.generar_hash(fecha_str, descripcion_raw, monto, str(cuenta_id))

                movimientos.append({
                    "fecha": fecha_str, "concepto": None,
                    "monto": monto, "moneda": moneda,
                    "categoria": categoria, "metodo_pago": metodo,
                    "descripcion": descripcion_raw[:200],
                    "estado": "validado", "import_hash": hash_mov,
                    "metadata": {
                        "referencia": str(row.get("Referencia", "")),
                        "tipo_operacion": tipo_op,
                        "cuotas": str(row.get("Cuotas", 0)),
                        "banco": "uala",
                    },
                })
            except Exception as exc:
                movimientos.append({
                    "estado": "error", "error": str(exc), "fila": idx + 2,
                    "concepto": str(row.get("Comercio", f"Fila {idx + 2}")),
                    "import_hash": None,
                })
        return movimientos


# ---------------------------------------------------------------------------
# Helpers de balance (igual que en transaction_service)
# ---------------------------------------------------------------------------

def _aplicar_gasto(account, amount: Decimal) -> None:
    from app.models.accounts_models import AccountType
    from app.exceptions.account_exceptions import InsufficientFunds, InsufficientCreditLimit
    if account.type == AccountType.CREDIT:
        if account.balance - amount < -account.credit_limit:
            raise InsufficientCreditLimit(
                f"Límite de crédito insuficiente. Disponible: "
                f"{account.credit_limit + account.balance}"
            )
    else:
        if account.balance < amount:
            raise InsufficientFunds(
                f"Saldo insuficiente. Disponible: {account.balance}"
            )
    account.balance -= amount


def _aplicar_ingreso(account, amount: Decimal) -> None:
    from app.models.accounts_models import AccountType
    from app.exceptions.account_exceptions import CreditBalanceCannotBePositive
    if account.type == AccountType.CREDIT:
        if account.balance + amount > Decimal("0.00"):
            raise CreditBalanceCannotBePositive(
                "El saldo de una cuenta de crédito no puede ser positivo"
            )
    account.balance += amount


# ---------------------------------------------------------------------------
# ParserMidinero
# ---------------------------------------------------------------------------

class ParserMidinero:
    """
    Excel exportado por Midinero (billetera digital uruguaya).

    Columnas: FECHA | HORA | TIPO | CONCEPTO | DESCRIPCIÓN | MONTO |
              MONEDA | SALDO | ESTADO | COMERCIO | ID_TRANSACCION

    Solo importa filas con ESTADO == "Completado".
    Tipo → dirección:
      Consumo      → expense  (tarjeta_debito / billetera_digital)
      Recarga      → income
      Devolución   → income
      Retiro       → expense
      Transferencia → expense si monto negativo, income si positivo
    Hash: usa DESCRIPCIÓN (texto libre del banco) + ID_TRANSACCION como
          fallback de unicidad.
    """

    _TIPO_EXPENSE = {"Consumo", "Retiro"}
    _TIPO_INCOME  = {"Recarga", "Devolución"}

    def __init__(self, categorizador: CategorizadorLocal):
        self.categorizador = categorizador

    def parsear(self, archivo_bytes: bytes, cuenta_id: uuid.UUID) -> list[dict]:
        df = self._leer_archivo(archivo_bytes)
        return self._parsear_filas(df, cuenta_id)

    @staticmethod
    def _leer_archivo(archivo_bytes: bytes) -> "pd.DataFrame":
        import io
        # 1. xlsx (openpyxl)
        try:
            return pd.read_excel(io.BytesIO(archivo_bytes), engine="openpyxl")
        except Exception:
            pass
        # 2. xls antiguo (xlrd, opcional)
        try:
            return pd.read_excel(io.BytesIO(archivo_bytes), engine="xlrd")
        except Exception:
            pass
        # 3. CSV con distintos encodings y separadores
        for enc in ("utf-8-sig", "utf-8", "latin-1", "cp1252"):
            try:
                return pd.read_csv(io.BytesIO(archivo_bytes), encoding=enc, sep=None, engine="python")
            except Exception:
                pass
        raise ValueError(
            "No se pudo leer el archivo de Midinero. "
            "Asegurate de exportar en formato Excel (.xls / .xlsx) o CSV."
        )

    def _parsear_filas(self, df: "pd.DataFrame", cuenta_id: uuid.UUID) -> list[dict]:

        movimientos: list[dict] = []

        for idx, row in df.iterrows():
            estado_fila = str(row.get("ESTADO", "")).strip()
            if estado_fila != "Completado":
                continue

            try:
                fecha_str       = NormalizadorFechas.normalizar(row["FECHA"])
                descripcion_raw = str(row.get("DESCRIPCIÓN", row.get("DESCRIPCION", ""))).strip()
                comercio        = str(row.get("COMERCIO", "")).strip()
                tipo            = str(row.get("TIPO", "")).strip()
                moneda          = str(row.get("MONEDA", "UYU")).strip()
                monto_raw       = _to_float(row.get("MONTO", 0))
                id_tx           = str(row.get("ID_TRANSACCION", "")).strip()

                # Determinar dirección según TIPO
                if tipo in self._TIPO_EXPENSE:
                    monto = -abs(monto_raw)
                elif tipo in self._TIPO_INCOME:
                    monto = abs(monto_raw)
                else:
                    # Transferencia u otro: el signo del archivo determina la dirección
                    monto = monto_raw if monto_raw != 0 else -abs(monto_raw)

                # Descripción del banco: preferir DESCRIPCIÓN, fallback a COMERCIO
                descripcion_banco = descripcion_raw or comercio or tipo
                # Hash: incluir ID_TRANSACCION si disponible para máxima unicidad
                hash_base = f"{id_tx}|{str(cuenta_id)}" if id_tx else descripcion_banco
                hash_mov  = DetectorDuplicados.generar_hash(
                    fecha_str, hash_base, monto, str(cuenta_id)
                )

                categoria, _ = self.categorizador.categorizar(descripcion_banco)

                movimientos.append({
                    "fecha":       fecha_str,
                    "concepto":    None,
                    "monto":       monto,
                    "moneda":      moneda,
                    "categoria":   categoria,
                    "metodo_pago": "billetera_digital",
                    "descripcion": descripcion_banco[:200],
                    "estado":      "validado",
                    "import_hash": hash_mov,
                    "metadata": {
                        "tipo":           tipo,
                        "comercio":       comercio,
                        "id_transaccion": id_tx,
                        "banco":          "midinero",
                    },
                })

            except Exception as exc:
                movimientos.append({
                    "estado":      "error",
                    "error":       str(exc),
                    "fila":        idx + 2,
                    "concepto":    str(row.get("DESCRIPCIÓN", row.get("DESCRIPCION", f"Fila {idx + 2}"))),
                    "import_hash": None,
                })

        return movimientos


# ---------------------------------------------------------------------------
# ParserScotiabank
# ---------------------------------------------------------------------------

class ParserScotiabank:
    """
    CSV exportado por Scotiabank Uruguay.

    Columnas: FECHA | HORA | TIPO | DESCRIPCIÓN | REFERENCIA | DÉBITO |
              CRÉDITO | SALDO | MONEDA | NÚMERO_CUENTA | ESTADO

    Solo importa filas con ESTADO == "Completado".
    DÉBITO > 0 → expense; CRÉDITO > 0 → income.
    """

    _METODO = {
        "Compra":        "tarjeta_debito",
        "Retiro":        "efectivo",
        "Pago":          "transferencia_bancaria",
        "Transferencia": "transferencia_bancaria",
        "Depósito":      "transferencia_bancaria",
        "Deposito":      "transferencia_bancaria",
        "Devolución":    "otro",
        "Devolucion":    "otro",
        "Comisión":      "otro",
        "Comision":      "otro",
        "Interés":       "otro",
        "Interes":       "otro",
    }

    def __init__(self, categorizador: CategorizadorLocal):
        self.categorizador = categorizador

    def parsear(self, archivo_bytes: bytes, cuenta_id: uuid.UUID) -> list[dict]:
        import io
        df = None
        for enc in ("utf-8-sig", "utf-8", "latin-1", "cp1252"):
            try:
                df = pd.read_csv(io.BytesIO(archivo_bytes), encoding=enc, sep=None, engine="python")
                break
            except Exception:
                pass
        if df is None:
            raise ValueError("No se pudo leer el archivo de Scotiabank.")

        movimientos: list[dict] = []

        for idx, row in df.iterrows():
            estado_fila = str(row.get("ESTADO", "")).strip()
            if estado_fila != "Completado":
                continue

            try:
                debito  = _to_float(row.get("DÉBITO",  row.get("DEBITO",  0)))
                credito = _to_float(row.get("CRÉDITO", row.get("CREDITO", 0)))
                if debito == 0 and credito == 0:
                    continue

                fecha_str       = NormalizadorFechas.normalizar(row["FECHA"])
                descripcion_raw = str(row.get("DESCRIPCIÓN", row.get("DESCRIPCION", ""))).strip()
                referencia      = str(row.get("REFERENCIA", "")).strip()
                tipo            = str(row.get("TIPO", "")).strip()
                moneda          = str(row.get("MONEDA", "UYU")).strip()
                monto           = credito if credito > 0 else -debito
                metodo          = self._METODO.get(tipo, "otro")

                descripcion_banco = descripcion_raw or referencia or tipo
                hash_base = f"{referencia}|{str(cuenta_id)}" if referencia else descripcion_banco
                hash_mov  = DetectorDuplicados.generar_hash(fecha_str, hash_base, monto, str(cuenta_id))

                categoria, _ = self.categorizador.categorizar(descripcion_banco)

                movimientos.append({
                    "fecha":       fecha_str,
                    "concepto":    None,
                    "monto":       monto,
                    "moneda":      moneda,
                    "categoria":   categoria,
                    "metodo_pago": metodo,
                    "descripcion": descripcion_banco[:200],
                    "estado":      "validado",
                    "import_hash": hash_mov,
                    "metadata": {
                        "tipo":       tipo,
                        "referencia": referencia,
                        "banco":      "scotiabank",
                    },
                })

            except Exception as exc:
                movimientos.append({
                    "estado":      "error",
                    "error":       str(exc),
                    "fila":        idx + 2,
                    "concepto":    str(row.get("DESCRIPCIÓN", row.get("DESCRIPCION", f"Fila {idx + 2}"))),
                    "import_hash": None,
                })

        return movimientos


# ---------------------------------------------------------------------------
# ParserZcuentas
# ---------------------------------------------------------------------------

class ParserZcuentas:
    """
    Parsea exportaciones Excel (.xlsx) de Zcuentas.

    Estructura del archivo:
        Filas 1-2: vacías (metadata de exportación)
        Fila 3:    headers — Fecha | Tipo | Cuenta | Concepto | Etiqueta | Descripción | Importe
        Fila 4+:   datos

    Tipos manejados:
        Gasto         → se importa como expense (monto = abs(Importe))
        Ingreso       → se importa como income
        Transferencia → solo se importa la pata negativa (dinero que sale);
                        la cuenta destino de Zcuentas se guarda en metadata
                        para que el usuario pueda elegir la cuenta Fluxo equivalente.

    La descripción visible se forma como "[Concepto Zcuentas] descripción libre"
    para que el usuario pueda orientarse al asignar concepto/categoría en Fluxo.
    """

    def __init__(self, categorizador: CategorizadorLocal):
        self.categorizador = categorizador

    def parsear(
        self,
        archivo_bytes: bytes,
        cuenta_id: uuid.UUID,
        mapeo_cuentas: dict[str, str] | None = None,
    ) -> list[dict]:
        """
        mapeo_cuentas: {nombre_cuenta_zcuentas: fluxo_account_id_str}
        Si se provee, cada movimiento recibe cuenta_fluxo_id en su metadata.
        """
        import io

        try:
            header_row = DetectorBanco._header_row_zcuentas(archivo_bytes)
            df = pd.read_excel(
                io.BytesIO(archivo_bytes),
                engine="openpyxl",
                header=header_row,
            )
        except Exception as e:
            raise ValueError(f"No se pudo leer el archivo Excel de Zcuentas: {e}")

        # Validar que parece un export de Zcuentas
        required = {"Fecha", "Tipo", "Importe"}
        found = set(df.columns)
        if not required.issubset(found):
            raise ValueError(
                f"El archivo no parece ser un export de Zcuentas. "
                f"Columnas faltantes: {required - found}. "
                f"Columnas encontradas: {list(found)}"
            )

        # Indexar cuentas del export por nombre para resolver destinos de transferencia.
        # Zcuentas exporta la pata negativa (origen) y la pata positiva (destino).
        # Construimos un mapa fecha+importe_abs → nombre_cuenta_destino para los positivos.
        destino_por_clave: dict[tuple, str] = {}
        for _, row in df.iterrows():
            if str(row.get("Tipo", "")).strip() == "Transferencia":
                try:
                    importe = float(row["Importe"])
                    if importe > 0:
                        f = row["Fecha"]
                        fs = f.strftime("%Y-%m-%d") if hasattr(f, "strftime") else NormalizadorFechas.normalizar(f)
                        clave = (fs, round(importe, 2))
                        destino_por_clave[clave] = str(row.get("Cuenta", "") or "").strip()
                except Exception:
                    pass

        movimientos: list[dict] = []

        for idx, row in df.iterrows():
            tipo_raw = str(row.get("Tipo", "")).strip()

            # Transferencias: solo importar la pata negativa (dinero que sale)
            if tipo_raw == "Transferencia":
                try:
                    importe = float(row["Importe"])
                    if importe >= 0:
                        continue  # omitir pata positiva (destino)
                except Exception:
                    continue

            elif tipo_raw not in ("Gasto", "Ingreso"):
                continue

            try:
                fecha_raw = row["Fecha"]
                if hasattr(fecha_raw, "strftime"):
                    fecha_str = fecha_raw.strftime("%Y-%m-%d")
                else:
                    fecha_str = NormalizadorFechas.normalizar(fecha_raw)
                importe         = float(row["Importe"])
                monto           = importe  # negativo=gasto/salida, positivo=ingreso
                concepto_z_raw  = str(row.get("Concepto", "") or "").strip()
                concepto_z      = "" if concepto_z_raw.lower() in ("nan", "none", "") else concepto_z_raw
                descripcion_raw = str(row.get("Descripci\u00f3n", "") or "").strip()
                cuenta_nombre   = str(row.get("Cuenta", "") or "").strip()

                # Inferir moneda del nombre de la cuenta en Zcuentas
                moneda = "USD" if "USD" in cuenta_nombre.upper() else "UYU"

                # Descripción visible: "[Concepto Zcuentas] texto libre"
                partes = []
                if concepto_z:
                    partes.append(f"[{concepto_z}]")
                if descripcion_raw and descripcion_raw != concepto_z:
                    partes.append(descripcion_raw)
                descripcion_final = " ".join(partes) or None

                # Auto-categorización: usar el Concepto de Zcuentas como pista primaria
                categoria: str | None = None
                if concepto_z:
                    categoria, _ = self.categorizador.categorizar(concepto_z)
                if categoria is None and descripcion_raw:
                    categoria, _ = self.categorizador.categorizar(descripcion_raw)

                # Hash de deduplicación
                hash_mov = DetectorDuplicados.generar_hash(
                    fecha_str,
                    descripcion_final or concepto_z or tipo_raw,
                    importe,
                    str(cuenta_id),
                )

                # Para transferencias: buscar el nombre de la cuenta destino
                meta: dict = {"banco": "zcuentas", "tipo_zcuentas": tipo_raw}
                if tipo_raw == "Transferencia":
                    # destino_por_clave está indexado por (fecha, abs_importe_positivo)
                    clave = (fecha_str, round(abs(importe), 2))
                    cuenta_destino = destino_por_clave.get(clave, "")
                    meta["cuenta_destino_zcuentas"] = cuenta_destino or None

                # Si se provee mapeo, asignar cuenta Fluxo por nombre de cuenta Zcuentas
                if mapeo_cuentas and cuenta_nombre in mapeo_cuentas:
                    fluxo_id = mapeo_cuentas[cuenta_nombre]
                    if fluxo_id:
                        meta["cuenta_fluxo_id"] = fluxo_id

                movimientos.append({
                    "fecha":       fecha_str,
                    "concepto":    None,
                    "monto":       monto,
                    "moneda":      moneda,
                    "categoria":   categoria,
                    "metodo_pago": "otro",
                    "descripcion": descripcion_final[:200] if descripcion_final else None,
                    "estado":      "validado",
                    "import_hash": hash_mov,
                    "error":       None,
                    "advertencia": None,
                    "fila":        int(idx) + 4,
                    "metadata":    meta,
                })

            except Exception as exc:
                movimientos.append({
                    "fecha":       None,
                    "concepto":    str(row.get("Descripci\u00f3n", f"Fila {int(idx) + 4}")),
                    "monto":       0,
                    "moneda":      "UYU",
                    "categoria":   None,
                    "metodo_pago": "otro",
                    "descripcion": None,
                    "estado":      "error",
                    "import_hash": None,
                    "error":       str(exc),
                    "advertencia": None,
                    "fila":        int(idx) + 4,
                    "metadata":    {"banco": "zcuentas"},
                })

        return movimientos


# ---------------------------------------------------------------------------
# ImportacionService  (orquestador principal)
# ---------------------------------------------------------------------------

PARSERS = {
    "prex":        ParserPrex,
    "brou":        ParserBrou,
    "itau":        ParserItau,
    "santander":   ParserSantander,
    "oca":         ParserOca,
    "mercadopago": ParserMercadoPago,
    "uala":        ParserUala,
    "midinero":    ParserMidinero,
    "scotiabank":  ParserScotiabank,
    "zcuentas":    ParserZcuentas,
}


class ImportacionService:
    """Orquesta el flujo completo de importación bancaria."""

    def __init__(self, db: Session, user_id: uuid.UUID):
        self.db = db
        self.user_id = user_id
        self.categorizador = CategorizadorLocal(db, user_id)

    # ------------------------------------------------------------------
    # PASO 0: detectar banco (no guarda nada)
    # ------------------------------------------------------------------

    def detectar_banco(self, archivo_bytes: bytes) -> dict[str, Any]:
        """
        Detecta el banco del archivo y, para Zcuentas, sugiere el mapeo
        de cuentas Zcuentas → cuentas Fluxo del usuario.
        """
        from app.models.accounts_models import Account

        banco = DetectorBanco.detectar(archivo_bytes)
        cuentas_detectadas: list[dict] = []

        if banco == "zcuentas":
            cuentas_z = DetectorBanco.extraer_cuentas_zcuentas(archivo_bytes)
            fluxo_accounts = (
                self.db.query(Account)
                .filter(Account.user_id == self.user_id, Account.is_deleted.is_(False))
                .all()
            )
            for nombre_z, moneda in cuentas_z:
                mejor_id, mejor_nombre, mejor_score = None, None, 0.0
                for acc in fluxo_accounts:
                    score = _fuzzy_score(nombre_z, acc.name)
                    if score > mejor_score:
                        mejor_score = score
                        mejor_id = str(acc.id)
                        mejor_nombre = acc.name
                cuentas_detectadas.append({
                    "nombre_zcuentas": nombre_z,
                    "moneda": moneda,
                    "fluxo_account_id": mejor_id if mejor_score >= 0.4 else None,
                    "fluxo_account_name": mejor_nombre if mejor_score >= 0.4 else None,
                    "score": round(mejor_score, 2),
                })

        return {"banco": banco, "cuentas_detectadas": cuentas_detectadas}

    # ------------------------------------------------------------------
    # PASO 1: parsear (no guarda nada)
    # ------------------------------------------------------------------

    def parsear_archivo(
        self,
        archivo_bytes: bytes,
        nombre_archivo: str,
        banco: str,
        cuenta_id: uuid.UUID | None = None,
        mapeo_cuentas: dict[str, str] | None = None,
    ) -> dict[str, Any]:
        """
        Parsea el archivo y detecta duplicados contra la BD.
        NO guarda nada. Devuelve el resultado para que el usuario confirme.
        """
        parser_cls = PARSERS.get(banco.lower())
        if parser_cls is None:
            raise ValueError(f"Banco no soportado: '{banco}'. Disponibles: {list(PARSERS)}")

        # Para deduplicación se necesita un cuenta_id; usar sentinel si no hay uno global
        _cuenta_id = cuenta_id or uuid.UUID(int=0)

        parser = parser_cls(self.categorizador)
        if banco.lower() == "zcuentas" and mapeo_cuentas:
            movimientos = parser.parsear(archivo_bytes, _cuenta_id, mapeo_cuentas=mapeo_cuentas)
        else:
            movimientos = parser.parsear(archivo_bytes, _cuenta_id)

        # 1) Duplicados exactos contra BD (mismo import_hash ya importado)
        hashes_bd = DetectorDuplicados.hashes_existentes(self.db, self.user_id, _cuenta_id)
        for mov in movimientos:
            if mov.get("import_hash") and mov["import_hash"] in hashes_bd:
                mov["estado"] = "duplicado"
                mov["duplicate_detail"] = hashes_bd[mov["import_hash"]]

        # 2) Duplicados dentro del lote actual (dos filas idénticas en el mismo archivo)
        hashes_lote: set[str] = set()
        for mov in movimientos:
            if mov.get("estado") != "validado":
                continue
            h = mov.get("import_hash")
            if h:
                if h in hashes_lote:
                    mov["estado"] = "duplicado"
                else:
                    hashes_lote.add(h)

        # 3) Advertencia suave: ya existe en la cuenta alguna transacción con
        #    la misma fecha y monto (puede ser manual o de otro import).
        claves_bd = DetectorDuplicados.claves_fecha_monto(self.db, self.user_id, _cuenta_id)
        for mov in movimientos:
            if mov.get("estado") != "validado":
                continue
            clave = (mov.get("fecha", ""), round(float(mov.get("monto", 0)), 2))
            if clave in claves_bd:
                mov["advertencia"] = "Ya existe una transacción con esta fecha y monto en la cuenta"
                mov["duplicate_detail"] = claves_bd[clave]

        exitosos  = sum(1 for m in movimientos if m.get("estado") == "validado")
        duplicados = sum(1 for m in movimientos if m.get("estado") == "duplicado")
        errores   = sum(1 for m in movimientos if m.get("estado") == "error")

        return {
            "exitosos": exitosos,
            "duplicados": duplicados,
            "errores": errores,
            "movimientos": movimientos,
        }

    # ------------------------------------------------------------------
    # PASO 2: confirmar (guarda en BD)
    # ------------------------------------------------------------------

    def confirmar_importacion(
        self,
        movimientos: list[dict],
        cuenta_id: uuid.UUID | None,
        banco: str,
        nombre_archivo: str,
    ) -> dict[str, Any]:
        """
        Guarda los movimientos con estado 'validado' como transacciones normales.
        Registra auditoría en importaciones.
        Para Zcuentas multi-cuenta, cuenta_id puede ser None; cada movimiento
        debe traer metadata.cuenta_fluxo_id.
        """
        # Registro de auditoría inicial
        importacion = Importacion(
            user_id=self.user_id,
            banco=banco,
            cuenta_id=cuenta_id,
            archivo=nombre_archivo,
            estado="pending",
        )
        self.db.add(importacion)
        self.db.flush()

        # Cuenta global (puede ser None para Zcuentas multi-cuenta)
        account = None
        if cuenta_id:
            account = account_crud.get_by_id(self.db, cuenta_id)
            if not account or account.user_id != self.user_id:
                raise ValueError("Cuenta no encontrada")

        # Categoría fallback
        categoria_fallback = category_crud.get_by_name_and_user(
            self.db, "Sin clasificar", self.user_id
        )

        a_importar = [m for m in movimientos if m.get("estado") == "validado"]
        importados = 0
        errores_confirmacion: list[dict] = []

        for mov in a_importar:
            try:
                meta = mov.get("metadata") or {}

                # Determinar cuenta para este movimiento (por-movimiento o global)
                cuenta_fluxo_id_raw = meta.get("cuenta_fluxo_id")
                if cuenta_fluxo_id_raw:
                    mov_account = account_crud.get_by_id(
                        self.db, uuid.UUID(str(cuenta_fluxo_id_raw))
                    )
                    if not mov_account or mov_account.user_id != self.user_id:
                        mov_account = account
                else:
                    mov_account = account

                if mov_account is None:
                    raise ValueError("Movimiento sin cuenta asignada")

                dest_account_id_raw = meta.get("transfer_dest_account_id")
                is_zcuentas_transfer = (
                    meta.get("tipo_zcuentas") == "Transferencia"
                    and dest_account_id_raw
                )
                if is_zcuentas_transfer:
                    dest_account = account_crud.get_by_id(
                        self.db, uuid.UUID(str(dest_account_id_raw))
                    )
                    if dest_account and dest_account.user_id == self.user_id:
                        self._crear_transferencia_zcuentas(
                            mov, mov_account, dest_account, categoria_fallback
                        )
                    else:
                        self._crear_transaccion(mov, mov_account, categoria_fallback)
                else:
                    self._crear_transaccion(mov, mov_account, categoria_fallback)
                importados += 1
            except Exception as exc:
                errores_confirmacion.append({
                    "concepto": mov.get("concepto"),
                    "error": str(exc),
                })

        # Aprendizaje de categorías
        for mov in a_importar:
            cat = mov.get("categoria")
            descripcion_banco = mov.get("descripcion", "")
            if cat and descripcion_banco:
                self.categorizador.registrar_aprendizaje(descripcion_banco, cat)

        # Actualizar auditoría
        total = len(movimientos)
        importacion.total_procesados = total
        importacion.total_importados = importados
        importacion.total_descartados = total - importados
        importacion.total_duplicados = sum(
            1 for m in movimientos if m.get("estado") == "duplicado"
        )
        importacion.estado = "completed" if not errores_confirmacion else "partial"
        importacion.metadata_ = {
            "errores_confirmacion": errores_confirmacion,
        }

        self.db.commit()

        return {
            "estado": importacion.estado,
            "importados": importados,
            "descartados": total - importados,
            "importacion_id": importacion.id,
        }

    def _crear_transaccion(
        self,
        mov: dict,
        account,
        categoria_fallback,
    ) -> Transaction:
        """Crea una Transaction a partir de un movimiento importado."""
        monto = Decimal(str(abs(mov["monto"])))
        tipo = TransactionType.EXPENSE if mov["monto"] < 0 else TransactionType.INCOME
        fecha = datetime.strptime(mov["fecha"], "%Y-%m-%d").date()

        # Categoría: buscar por nombre o usar fallback
        nombre_cat = mov.get("categoria")
        if nombre_cat:
            categoria = category_crud.get_by_name_and_user(
                self.db, nombre_cat, self.user_id
            )
            if categoria is None:
                import re
                slug = re.sub(r"[^a-z0-9]+", "-", nombre_cat.lower()).strip("-")
                categoria = category_crud.create(
                    self.db, user_id=self.user_id, name=nombre_cat, slug=slug
                )
        else:
            categoria = None
        if categoria is None:
            categoria = categoria_fallback

        # Concepto: buscar existente o crear nuevo
        concepto_nombre = (mov.get("concepto") or "Importado")[:100]
        concepto = concept_crud.get_by_name_and_user(
            self.db, concepto_nombre, self.user_id
        )
        if concepto is None:
            concepto = concept_crud.create(
                self.db, user_id=self.user_id, name=concepto_nombre
            )

        # Método de pago
        metodo_raw = mov.get("metodo_pago", "otro")
        try:
            metodo = PaymentMethod(metodo_raw)
        except ValueError:
            metodo = PaymentMethod.OTRO

        # Mutar saldo de la cuenta
        if tipo == TransactionType.EXPENSE:
            _aplicar_gasto(account, monto)
        else:
            _aplicar_ingreso(account, monto)

        # Crear transacción
        tx = transaction_crud.create(
            self.db,
            user_id=self.user_id,
            account_id=account.id,
            category_id=categoria.id,
            concept_id=concepto.id,
            amount=monto,
            transaction_type=tipo,
            date=fecha,
            description=(mov.get("descripcion") or "")[:100] or None,
            metodo_pago=metodo,
        )
        tx.import_hash = mov.get("import_hash")
        raw_hh = mov.get("household_id")
        if raw_hh:
            import uuid as _uuid
            try:
                tx.household_id = _uuid.UUID(str(raw_hh))
            except (ValueError, AttributeError):
                pass
        self.db.flush()

        concept_crud.increment_frequency(self.db, concepto)
        return tx

    def _crear_transferencia_zcuentas(
        self,
        mov: dict,
        source_account,
        dest_account,
        categoria_fallback,
    ) -> None:
        """
        Crea una transferencia entre dos cuentas del usuario a partir de
        un movimiento Zcuentas (pata negativa con cuenta destino ya resuelta).
        """
        monto = Decimal(str(abs(mov["monto"])))
        fecha = datetime.strptime(mov["fecha"], "%Y-%m-%d").date()

        concepto_nombre = (mov.get("concepto") or "Transferencia")[:100]
        concepto = concept_crud.get_by_name_and_user(self.db, concepto_nombre, self.user_id)
        if concepto is None:
            concepto = concept_crud.create(self.db, user_id=self.user_id, name=concepto_nombre)

        categoria = (
            category_crud.get_by_name_and_user(self.db, mov.get("categoria") or "", self.user_id)
            or categoria_fallback
        )

        metodo_raw = mov.get("metodo_pago", "otro")
        try:
            metodo = PaymentMethod(metodo_raw)
        except ValueError:
            metodo = PaymentMethod.OTRO

        shared_transfer_id = uuid.uuid4()

        # Pata SOURCE: dinero sale de source_account
        _aplicar_gasto(source_account, monto)
        tx_source = transaction_crud.create(
            self.db,
            user_id=self.user_id,
            account_id=source_account.id,
            category_id=categoria.id,
            concept_id=concepto.id,
            amount=monto,
            transaction_type=TransactionType.EXPENSE,
            date=fecha,
            description=(mov.get("descripcion") or "")[:100] or None,
            metodo_pago=metodo,
            transfer_id=shared_transfer_id,
            transfer_role=TransferRole.SOURCE,
        )
        tx_source.import_hash = mov.get("import_hash")

        # Pata DESTINATION: dinero llega a dest_account
        _aplicar_ingreso(dest_account, monto)
        tx_dest = transaction_crud.create(
            self.db,
            user_id=self.user_id,
            account_id=dest_account.id,
            category_id=categoria.id,
            concept_id=concepto.id,
            amount=monto,
            transaction_type=TransactionType.INCOME,
            date=fecha,
            description=(mov.get("descripcion") or "")[:100] or None,
            metodo_pago=metodo,
            transfer_id=shared_transfer_id,
            transfer_role=TransferRole.DESTINATION,
        )
        tx_dest.import_hash = None  # solo la fuente tiene hash de deduplicación

        self.db.flush()
        concept_crud.increment_frequency(self.db, concepto)
