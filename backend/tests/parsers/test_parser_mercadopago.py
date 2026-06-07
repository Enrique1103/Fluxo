"""Tests del parser Mercado Pago (CSV / Excel).

Columnas: Fecha, Hora, Tipo, Estado, Descripción, Monto, Concepto, Saldo, ID_Transacción, Método
Concepto ENTRADA → ingreso, SALIDA → gasto. Solo Estado == 'COMPLETADO'.
"""
import pytest
from tests.parsers.conftest import csv_bytes
from app.services.importacion_service import ParserMercadoPago

HEADER = "Fecha,Hora,Tipo,Estado,Descripción,Monto,Concepto,Saldo,ID_Transacción,Método"


def _valid_csv():
    rows = [
        "01/04/2026,10:00,Pago,COMPLETADO,SUPERMERCADO DISCO,1500,SALIDA,8500,TX001,BILLETERA",
        "02/04/2026,14:00,Transferencia,COMPLETADO,RECARGA SALDO,3000,ENTRADA,11500,TX002,BANCO",
        "03/04/2026,09:00,Pago,PENDIENTE,COMPRA FALLIDA,500,SALIDA,11000,TX003,BILLETERA",
    ]
    return csv_bytes(HEADER, rows)


class TestParserMercadoPago:

    def test_parsea_solo_completados(self, mock_cat, cuenta_id):
        parser = ParserMercadoPago(mock_cat)
        result = parser.parsear(_valid_csv(), cuenta_id)
        validados = [m for m in result if m["estado"] == "validado"]
        assert len(validados) == 2

    def test_salida_es_negativa(self, mock_cat, cuenta_id):
        parser = ParserMercadoPago(mock_cat)
        result = parser.parsear(_valid_csv(), cuenta_id)
        gastos = [m for m in result if "SUPERMERCADO" in (m.get("descripcion") or "")]
        assert len(gastos) >= 1
        assert gastos[0]["monto"] < 0

    def test_entrada_es_positiva(self, mock_cat, cuenta_id):
        parser = ParserMercadoPago(mock_cat)
        result = parser.parsear(_valid_csv(), cuenta_id)
        ingresos = [m for m in result if "RECARGA" in (m.get("descripcion") or "")]
        assert len(ingresos) >= 1
        assert ingresos[0]["monto"] > 0

    def test_fechas_en_formato_iso(self, mock_cat, cuenta_id):
        parser = ParserMercadoPago(mock_cat)
        result = parser.parsear(_valid_csv(), cuenta_id)
        for m in (m for m in result if m["estado"] == "validado"):
            assert m["fecha"].count("-") == 2

    def test_hashes_unicos(self, mock_cat, cuenta_id):
        parser = ParserMercadoPago(mock_cat)
        result = parser.parsear(_valid_csv(), cuenta_id)
        hashes = [m["import_hash"] for m in result if m.get("import_hash")]
        assert len(hashes) == len(set(hashes))

    def test_metodo_pago_billetera(self, mock_cat, cuenta_id):
        parser = ParserMercadoPago(mock_cat)
        result = parser.parsear(_valid_csv(), cuenta_id)
        billetera = [m for m in result if m.get("metodo_pago") == "billetera_digital"]
        assert len(billetera) >= 1

    def test_banco_en_metadata(self, mock_cat, cuenta_id):
        parser = ParserMercadoPago(mock_cat)
        result = parser.parsear(_valid_csv(), cuenta_id)
        for m in (m for m in result if m["estado"] == "validado"):
            assert m["metadata"]["banco"] == "mercadopago"
