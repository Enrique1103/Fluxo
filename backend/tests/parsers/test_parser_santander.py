"""Tests del parser Santander (CSV, dos variantes).

Formato nuevo: Fecha, Hora, Tipo, Descripción, Referencia, Débito, Crédito, Saldo
Formato antiguo: Fecha Operación, Fecha Valor, Referencia, Concepto, Importe Débito, Importe Crédito, Saldo, Centro, Producto, Moneda
"""
import pytest
from tests.parsers.conftest import csv_bytes
from app.services.importacion_service import ParserSantander

HEADER_NUEVO  = "Fecha,Hora,Tipo,Descripción,Referencia,Débito,Crédito,Saldo"
HEADER_ANTIGUO = "Fecha Operación,Fecha Valor,Referencia,Concepto,Importe Débito,Importe Crédito,Saldo,Centro,Producto,Moneda"


def _csv_nuevo():
    rows = [
        "01/04/2026,10:00,Compra,SUPERMERCADO DISCO,REF001,1500,,8500",
        "02/04/2026,14:00,Transferencia,SUELDO EMPRESA,REF002,,5000,13500",
    ]
    return csv_bytes(HEADER_NUEVO, rows)


def _csv_antiguo():
    rows = [
        "01/04/2026,01/04/2026,REF001,PAGO SERVICIOS,800,,9200,001,Corriente,UYU",
        "02/04/2026,02/04/2026,REF002,ACREDITACION SUELDO,,4500,13700,001,Corriente,UYU",
    ]
    return csv_bytes(HEADER_ANTIGUO, rows)


class TestParserSantanderNuevo:

    def test_parsea_formato_nuevo(self, mock_cat, cuenta_id):
        parser = ParserSantander(mock_cat)
        result = parser.parsear(_csv_nuevo(), cuenta_id)
        validados = [m for m in result if m["estado"] == "validado"]
        assert len(validados) == 2

    def test_debito_negativo_formato_nuevo(self, mock_cat, cuenta_id):
        parser = ParserSantander(mock_cat)
        result = parser.parsear(_csv_nuevo(), cuenta_id)
        gastos = [m for m in result if m.get("monto", 0) < 0]
        assert len(gastos) >= 1

    def test_credito_positivo_formato_nuevo(self, mock_cat, cuenta_id):
        parser = ParserSantander(mock_cat)
        result = parser.parsear(_csv_nuevo(), cuenta_id)
        ingresos = [m for m in result if m.get("monto", 0) > 0]
        assert len(ingresos) >= 1

    def test_fechas_formato_nuevo(self, mock_cat, cuenta_id):
        parser = ParserSantander(mock_cat)
        result = parser.parsear(_csv_nuevo(), cuenta_id)
        for m in (m for m in result if m["estado"] == "validado"):
            assert m["fecha"].count("-") == 2


class TestParserSantanderAntiguo:

    def test_parsea_formato_antiguo(self, mock_cat, cuenta_id):
        parser = ParserSantander(mock_cat)
        result = parser.parsear(_csv_antiguo(), cuenta_id)
        validados = [m for m in result if m["estado"] == "validado"]
        assert len(validados) == 2

    def test_debito_negativo_formato_antiguo(self, mock_cat, cuenta_id):
        parser = ParserSantander(mock_cat)
        result = parser.parsear(_csv_antiguo(), cuenta_id)
        gastos = [m for m in result if m.get("monto", 0) < 0]
        assert len(gastos) >= 1

    def test_hashes_unicos(self, mock_cat, cuenta_id):
        parser = ParserSantander(mock_cat)
        result = parser.parsear(_csv_antiguo(), cuenta_id)
        hashes = [m["import_hash"] for m in result if m.get("import_hash")]
        assert len(hashes) == len(set(hashes))

    def test_banco_en_metadata(self, mock_cat, cuenta_id):
        parser = ParserSantander(mock_cat)
        result = parser.parsear(_csv_nuevo(), cuenta_id)
        for m in (m for m in result if m["estado"] == "validado"):
            assert m["metadata"]["banco"] == "santander"
