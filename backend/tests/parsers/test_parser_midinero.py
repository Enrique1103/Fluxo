"""Tests del parser MiDinero (Excel .xlsx).

Columnas: FECHA | HORA | TIPO | CONCEPTO | DESCRIPCIÓN | MONTO | MONEDA | SALDO | ESTADO | COMERCIO | ID_TRANSACCION
Solo ESTADO == 'Completado'. TIPO determina dirección:
  Consumo / Retiro → gasto (negativo)
  Recarga / Devolución → ingreso (positivo)
"""
import pytest
from tests.parsers.conftest import xlsx_bytes
from app.services.importacion_service import ParserMidinero

HEADERS = ["FECHA", "HORA", "TIPO", "CONCEPTO", "DESCRIPCIÓN", "MONTO", "MONEDA", "SALDO", "ESTADO", "COMERCIO", "ID_TRANSACCION"]


def _valid_xlsx():
    rows = [
        ["01/04/2026", "10:00", "Consumo",    "Compra",      "SUPERMERCADO DISCO", 1500, "UYU", 8500, "Completado", "DISCO",    "TX001"],
        ["02/04/2026", "14:00", "Recarga",    "Acreditación","SUELDO EMPRESA",      4000, "UYU",12500, "Completado", "",         "TX002"],
        ["03/04/2026", "09:00", "Retiro",     "Efectivo",    "ATM BROU",            1000, "UYU",11500, "Completado", "BROU ATM", "TX003"],
        ["04/04/2026", "11:00", "Devolución", "Devolución",  "DEVOLUCION COMPRA",    500, "UYU",12000, "Completado", "",         "TX004"],
        ["05/04/2026", "08:00", "Consumo",    "Compra",      "COMPRA PENDIENTE",     200, "UYU",11800, "Pendiente",  "",         "TX005"],
    ]
    return xlsx_bytes(HEADERS, rows)


class TestParserMidinero:

    def test_parsea_solo_completados(self, mock_cat, cuenta_id):
        parser = ParserMidinero(mock_cat)
        result = parser.parsear(_valid_xlsx(), cuenta_id)
        validados = [m for m in result if m["estado"] == "validado"]
        assert len(validados) == 4

    def test_consumo_es_negativo(self, mock_cat, cuenta_id):
        parser = ParserMidinero(mock_cat)
        result = parser.parsear(_valid_xlsx(), cuenta_id)
        consumos = [m for m in result if "SUPERMERCADO" in (m.get("descripcion") or "")]
        assert len(consumos) >= 1
        assert consumos[0]["monto"] < 0

    def test_recarga_es_positiva(self, mock_cat, cuenta_id):
        parser = ParserMidinero(mock_cat)
        result = parser.parsear(_valid_xlsx(), cuenta_id)
        recargas = [m for m in result if "SUELDO" in (m.get("descripcion") or "")]
        assert len(recargas) >= 1
        assert recargas[0]["monto"] > 0

    def test_devolucion_es_positiva(self, mock_cat, cuenta_id):
        parser = ParserMidinero(mock_cat)
        result = parser.parsear(_valid_xlsx(), cuenta_id)
        devoluciones = [m for m in result if "DEVOLUCION" in (m.get("descripcion") or "")]
        assert len(devoluciones) >= 1
        assert devoluciones[0]["monto"] > 0

    def test_fechas_en_formato_iso(self, mock_cat, cuenta_id):
        parser = ParserMidinero(mock_cat)
        result = parser.parsear(_valid_xlsx(), cuenta_id)
        for m in (m for m in result if m["estado"] == "validado"):
            assert m["fecha"].count("-") == 2

    def test_hashes_unicos(self, mock_cat, cuenta_id):
        parser = ParserMidinero(mock_cat)
        result = parser.parsear(_valid_xlsx(), cuenta_id)
        hashes = [m["import_hash"] for m in result if m.get("import_hash")]
        assert len(hashes) == len(set(hashes))

    def test_metodo_pago_billetera(self, mock_cat, cuenta_id):
        parser = ParserMidinero(mock_cat)
        result = parser.parsear(_valid_xlsx(), cuenta_id)
        for m in (m for m in result if m["estado"] == "validado"):
            assert m["metodo_pago"] == "billetera_digital"

    def test_banco_en_metadata(self, mock_cat, cuenta_id):
        parser = ParserMidinero(mock_cat)
        result = parser.parsear(_valid_xlsx(), cuenta_id)
        for m in (m for m in result if m["estado"] == "validado"):
            assert m["metadata"]["banco"] == "midinero"
