"""Tests del parser Scotiabank (CSV).

Columnas: FECHA | HORA | TIPO | DESCRIPCIÓN | REFERENCIA | DÉBITO | CRÉDITO | SALDO | MONEDA | NÚMERO_CUENTA | ESTADO
Solo ESTADO == 'Completado'. DÉBITO > 0 → gasto; CRÉDITO > 0 → ingreso.
"""
import pytest
from tests.parsers.conftest import csv_bytes
from app.services.importacion_service import ParserScotiabank

HEADER = "FECHA,HORA,TIPO,DESCRIPCIÓN,REFERENCIA,DÉBITO,CRÉDITO,SALDO,MONEDA,NÚMERO_CUENTA,ESTADO"


def _valid_csv():
    rows = [
        "01/04/2026,10:00,Compra,SUPERMERCADO DISCO,REF001,1500,,8500,UYU,001-001,Completado",
        "02/04/2026,14:00,Depósito,ACREDITACION SUELDO,REF002,,5000,13500,UYU,001-001,Completado",
        "03/04/2026,09:00,Retiro,RETIRO ATM,REF003,1000,,12500,UYU,001-001,Completado",
        "04/04/2026,08:00,Compra,COMPRA FALLIDA,REF004,200,,12300,UYU,001-001,Pendiente",
    ]
    return csv_bytes(HEADER, rows, encoding="utf-8")


class TestParserScotiabank:

    def test_parsea_solo_completados(self, mock_cat, cuenta_id):
        parser = ParserScotiabank(mock_cat)
        result = parser.parsear(_valid_csv(), cuenta_id)
        validados = [m for m in result if m["estado"] == "validado"]
        assert len(validados) == 3

    def test_debito_es_negativo(self, mock_cat, cuenta_id):
        parser = ParserScotiabank(mock_cat)
        result = parser.parsear(_valid_csv(), cuenta_id)
        gastos = [m for m in result if "SUPERMERCADO" in (m.get("descripcion") or "")]
        assert len(gastos) >= 1
        assert gastos[0]["monto"] < 0

    def test_credito_es_positivo(self, mock_cat, cuenta_id):
        parser = ParserScotiabank(mock_cat)
        result = parser.parsear(_valid_csv(), cuenta_id)
        ingresos = [m for m in result if "SUELDO" in (m.get("descripcion") or "")]
        assert len(ingresos) >= 1
        assert ingresos[0]["monto"] > 0

    def test_fechas_en_formato_iso(self, mock_cat, cuenta_id):
        parser = ParserScotiabank(mock_cat)
        result = parser.parsear(_valid_csv(), cuenta_id)
        for m in (m for m in result if m["estado"] == "validado"):
            assert m["fecha"].count("-") == 2

    def test_hashes_unicos(self, mock_cat, cuenta_id):
        parser = ParserScotiabank(mock_cat)
        result = parser.parsear(_valid_csv(), cuenta_id)
        hashes = [m["import_hash"] for m in result if m.get("import_hash")]
        assert len(hashes) == len(set(hashes))

    def test_fila_sin_debito_ni_credito_omitida(self, mock_cat, cuenta_id):
        rows = ["01/04/2026,10:00,Otro,MOVIMIENTO NULO,REF999,0,0,5000,UYU,001,Completado"]
        data = csv_bytes(HEADER, rows)
        parser = ParserScotiabank(mock_cat)
        result = parser.parsear(data, cuenta_id)
        validados = [m for m in result if m["estado"] == "validado"]
        assert len(validados) == 0

    def test_banco_en_metadata(self, mock_cat, cuenta_id):
        parser = ParserScotiabank(mock_cat)
        result = parser.parsear(_valid_csv(), cuenta_id)
        for m in (m for m in result if m["estado"] == "validado"):
            assert m["metadata"]["banco"] == "scotiabank"
