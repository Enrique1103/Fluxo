"""Tests del parser Ualá (CSV).

Columnas: Fecha, Hora, Categoría, Comercio, Ciudad, Monto, Moneda,
          Estado, Referencia, Saldo_Posterior, Tipo_Operación, Cuotas
COMPRA/RETIRO → gasto (negativo). RECARGA/TRANSFERENCIA → ingreso (positivo).
Solo Estado == 'COMPLETADO'.
"""
import pytest
from tests.parsers.conftest import csv_bytes
from app.services.importacion_service import ParserUala

HEADER = "Fecha,Hora,Categoría,Comercio,Ciudad,Monto,Moneda,Estado,Referencia,Saldo_Posterior,Tipo_Operación,Cuotas"


def _valid_csv():
    rows = [
        "01/04/2026,10:00,Alimentación,SUPERMERCADO DISCO,Montevideo,1200,UYU,COMPLETADO,REF001,8800,COMPRA,1",
        "02/04/2026,09:00,Otros,ATM BROU,Montevideo,1000,UYU,COMPLETADO,REF002,7800,RETIRO,1",
        "03/04/2026,18:00,Otros,TRANSFERENCIA,Montevideo,5000,UYU,COMPLETADO,REF003,12800,RECARGA,1",
        "04/04/2026,08:00,Otros,COMPRA FALLIDA,Montevideo,500,UYU,PENDIENTE,REF004,12800,COMPRA,1",
    ]
    return csv_bytes(HEADER, rows)


class TestParserUala:

    def test_parsea_solo_completados(self, mock_cat, cuenta_id):
        parser = ParserUala(mock_cat)
        result = parser.parsear(_valid_csv(), cuenta_id)
        validados = [m for m in result if m["estado"] == "validado"]
        assert len(validados) == 3

    def test_compra_es_negativa(self, mock_cat, cuenta_id):
        parser = ParserUala(mock_cat)
        result = parser.parsear(_valid_csv(), cuenta_id)
        compras = [m for m in result if "SUPERMERCADO" in (m.get("descripcion") or "")]
        assert len(compras) >= 1
        assert compras[0]["monto"] < 0

    def test_retiro_es_negativo(self, mock_cat, cuenta_id):
        parser = ParserUala(mock_cat)
        result = parser.parsear(_valid_csv(), cuenta_id)
        retiros = [m for m in result if "ATM" in (m.get("descripcion") or "")]
        assert len(retiros) >= 1
        assert retiros[0]["monto"] < 0

    def test_recarga_es_positiva(self, mock_cat, cuenta_id):
        parser = ParserUala(mock_cat)
        result = parser.parsear(_valid_csv(), cuenta_id)
        recargas = [m for m in result if "TRANSFERENCIA" in (m.get("descripcion") or "")]
        assert len(recargas) >= 1
        assert recargas[0]["monto"] > 0

    def test_fechas_en_formato_iso(self, mock_cat, cuenta_id):
        parser = ParserUala(mock_cat)
        result = parser.parsear(_valid_csv(), cuenta_id)
        for m in (m for m in result if m["estado"] == "validado"):
            assert m["fecha"].count("-") == 2

    def test_hashes_unicos(self, mock_cat, cuenta_id):
        parser = ParserUala(mock_cat)
        result = parser.parsear(_valid_csv(), cuenta_id)
        hashes = [m["import_hash"] for m in result if m.get("import_hash")]
        assert len(hashes) == len(set(hashes))

    def test_banco_en_metadata(self, mock_cat, cuenta_id):
        parser = ParserUala(mock_cat)
        result = parser.parsear(_valid_csv(), cuenta_id)
        for m in (m for m in result if m["estado"] == "validado"):
            assert m["metadata"]["banco"] == "uala"
