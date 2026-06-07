"""Tests del parser OCA (CSV y PDF mock).

CSV: Fecha, Comercio, Localidad, Referencia, Cuota, Monto, Estado
Solo importa Estado == 'COMPLETADO'. Todos los montos son expenses (negativos).
"""
import pytest
from tests.parsers.conftest import csv_bytes
from app.services.importacion_service import ParserOca

HEADER_CSV = "Fecha,Comercio,Localidad,Referencia,Cuota,Monto,Estado"


def _valid_csv():
    rows = [
        "01/04/2026,SUPERMERCADO DISCO,MONTEVIDEO,POS-001,01/01,1500,COMPLETADO",
        "02/04/2026,FARMACIA URUGUAYA,MONTEVIDEO,POS-002,01/01,800,COMPLETADO",
        "03/04/2026,COMPRA PENDIENTE,MONTEVIDEO,POS-003,01/01,200,PENDIENTE",
    ]
    return csv_bytes(HEADER_CSV, rows)


class TestParserOcaCsv:

    def test_parsea_solo_completados(self, mock_cat, cuenta_id):
        parser = ParserOca(mock_cat)
        result = parser.parsear(_valid_csv(), cuenta_id)
        validados = [m for m in result if m["estado"] == "validado"]
        assert len(validados) == 2

    def test_todos_los_montos_son_negativos(self, mock_cat, cuenta_id):
        """OCA tarjeta de crédito: todos los movimientos son gastos."""
        parser = ParserOca(mock_cat)
        result = parser.parsear(_valid_csv(), cuenta_id)
        for m in (m for m in result if m["estado"] == "validado"):
            assert m["monto"] < 0

    def test_fechas_en_formato_iso(self, mock_cat, cuenta_id):
        parser = ParserOca(mock_cat)
        result = parser.parsear(_valid_csv(), cuenta_id)
        for m in (m for m in result if m["estado"] == "validado"):
            assert m["fecha"].count("-") == 2
            assert len(m["fecha"].split("-")[0]) == 4

    def test_metodo_pago_es_tarjeta_credito(self, mock_cat, cuenta_id):
        parser = ParserOca(mock_cat)
        result = parser.parsear(_valid_csv(), cuenta_id)
        for m in (m for m in result if m["estado"] == "validado"):
            assert m["metodo_pago"] == "tarjeta_credito"

    def test_hashes_unicos(self, mock_cat, cuenta_id):
        parser = ParserOca(mock_cat)
        result = parser.parsear(_valid_csv(), cuenta_id)
        hashes = [m["import_hash"] for m in result if m.get("import_hash")]
        assert len(hashes) == len(set(hashes))

    def test_descripcion_incluye_comercio(self, mock_cat, cuenta_id):
        parser = ParserOca(mock_cat)
        result = parser.parsear(_valid_csv(), cuenta_id)
        validados = [m for m in result if m["estado"] == "validado"]
        assert any("SUPERMERCADO" in (m.get("descripcion") or "") for m in validados)

    def test_banco_en_metadata(self, mock_cat, cuenta_id):
        parser = ParserOca(mock_cat)
        result = parser.parsear(_valid_csv(), cuenta_id)
        for m in (m for m in result if m["estado"] == "validado"):
            assert m["metadata"]["banco"] == "oca"
