"""Tests del parser Itaú (CSV).

Columnas: Fecha, Hora, Movimiento, Débito, Crédito, Saldo, Tipo, Comprobante, Referencia, Divisa
Débito > 0 → gasto (monto negativo); Crédito > 0 → ingreso (monto positivo).
"""
import pytest
from tests.parsers.conftest import csv_bytes
from app.services.importacion_service import ParserItau

HEADER = "Fecha,Hora,Movimiento,Débito,Crédito,Saldo,Tipo,Comprobante,Referencia,Divisa"


def _valid_csv():
    rows = [
        "01/04/2026,10:00,SUPERMERCADO DISCO,1500,,8500,RTD,00001,REF001,UYU",
        "02/04/2026,14:30,DEPOSITO SALARIO,,5000,13500,DEP,00002,REF002,UYU",
        "03/04/2026,09:00,COMPRA FARMACIA,300,,13200,RTD,00003,REF003,UYU",
    ]
    return csv_bytes(HEADER, rows)


class TestParserItau:

    def test_parsea_archivo_valido(self, mock_cat, cuenta_id):
        parser = ParserItau(mock_cat)
        result = parser.parsear(_valid_csv(), cuenta_id)
        validados = [m for m in result if m["estado"] == "validado"]
        assert len(validados) == 3

    def test_debito_es_negativo(self, mock_cat, cuenta_id):
        parser = ParserItau(mock_cat)
        result = parser.parsear(_valid_csv(), cuenta_id)
        gastos = [m for m in result if "SUPERMERCADO" in (m.get("descripcion") or "")]
        assert len(gastos) >= 1
        assert gastos[0]["monto"] < 0

    def test_credito_es_positivo(self, mock_cat, cuenta_id):
        parser = ParserItau(mock_cat)
        result = parser.parsear(_valid_csv(), cuenta_id)
        ingresos = [m for m in result if "SALARIO" in (m.get("descripcion") or "")]
        assert len(ingresos) >= 1
        assert ingresos[0]["monto"] > 0

    def test_fechas_en_formato_iso(self, mock_cat, cuenta_id):
        parser = ParserItau(mock_cat)
        result = parser.parsear(_valid_csv(), cuenta_id)
        for m in (m for m in result if m["estado"] == "validado"):
            assert m["fecha"].count("-") == 2
            assert len(m["fecha"].split("-")[0]) == 4

    def test_hashes_unicos(self, mock_cat, cuenta_id):
        parser = ParserItau(mock_cat)
        result = parser.parsear(_valid_csv(), cuenta_id)
        hashes = [m["import_hash"] for m in result if m.get("import_hash")]
        assert len(hashes) == len(set(hashes))

    def test_fila_sin_debito_ni_credito_omitida(self, mock_cat, cuenta_id):
        rows = [
            "01/04/2026,10:00,MOVIMIENTO NULO,0,0,1000,TRF,001,REF,UYU",
        ]
        data = csv_bytes(HEADER, rows)
        parser = ParserItau(mock_cat)
        result = parser.parsear(data, cuenta_id)
        validados = [m for m in result if m["estado"] == "validado"]
        assert len(validados) == 0

    def test_banco_en_metadata(self, mock_cat, cuenta_id):
        parser = ParserItau(mock_cat)
        result = parser.parsear(_valid_csv(), cuenta_id)
        for m in (m for m in result if m["estado"] == "validado"):
            assert m["metadata"]["banco"] == "itau"
