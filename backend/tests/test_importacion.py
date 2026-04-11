"""Tests de importación bancaria."""
import io
import pytest
from tests.conftest import BASE

IMP = f"{BASE}/importacion"
ACC = f"{BASE}/accounts"
TX  = f"{BASE}/transactions"


# ── Helpers ───────────────────────────────────────────────────────────────────

def _brou_csv(rows=None) -> bytes:
    """Genera un CSV mínimo válido para el parser BROU."""
    header = "Fecha Movimiento,Fecha Valor,Referencia,Descripción,Débito,Crédito,Saldo,Código,Sucursal"
    default_rows = [
        "01/04/2026,01/04/2026,REF001,Supermercado ABC,500.00,,9500.00,EXT,001",
        "02/04/2026,02/04/2026,REF002,Salario empresa,,3000.00,12500.00,DEP,001",
    ]
    lines = [header] + (rows or default_rows)
    return "\n".join(lines).encode("utf-8")


def _parsear(client, headers, cuenta_id: str, csv_bytes: bytes):
    return client.post(
        f"{IMP}/parsear",
        files={"file": ("extracto.csv", io.BytesIO(csv_bytes), "text/csv")},
        params={"banco": "brou", "cuenta_id": cuenta_id},
        headers=headers,
    )


def _confirmar(client, headers, cuenta_id: str, movimientos: list):
    return client.post(f"{IMP}/confirmar", json={
        "movimientos": movimientos,
        "cuenta_id": cuenta_id,
        "banco": "brou",
        "nombre_archivo": "test.csv",
    }, headers=headers)


# ── Fixtures ──────────────────────────────────────────────────────────────────

@pytest.fixture
def uyu_account(authed):
    c, h = authed
    r = c.post(ACC, json={
        "name": "BROU UYU", "type": "debit", "currency": "UYU", "balance": "20000.00",
    }, headers=h)
    assert r.status_code == 201, r.text
    return r.json()


# ── Tests ─────────────────────────────────────────────────────────────────────

class TestParsear:
    def test_parsear_brou_valid_csv(self, authed, uyu_account):
        c, h = authed
        r = _parsear(c, h, uyu_account["id"], _brou_csv())
        assert r.status_code == 200
        body = r.json()
        assert body["exitosos"] == 2
        assert body["errores"] == 0
        movs = body["movimientos"]
        assert len(movs) == 2

    def test_parsear_signed_amounts(self, authed, uyu_account):
        """Débitos son negativos, créditos positivos."""
        c, h = authed
        body = _parsear(c, h, uyu_account["id"], _brou_csv()).json()
        montos = {m["descripcion"][:12]: m["monto"] for m in body["movimientos"]}
        assert montos["Supermercado"] < 0   # débito
        assert montos["Salario empr"] > 0   # crédito

    def test_parsear_invalid_file_error(self, authed, uyu_account):
        """Archivo corrupto → error descriptivo o lista vacía."""
        c, h = authed
        garbage = b"esto no es un csv valido \x00\x01\x02"
        r = _parsear(c, h, uyu_account["id"], garbage)
        # Puede devolver 200 con errores o 422
        assert r.status_code in (200, 422)

    def test_parsear_wrong_account_404(self, authed):
        c, h = authed
        import uuid
        r = _parsear(c, h, str(uuid.uuid4()), _brou_csv())
        assert r.status_code == 404


class TestConfirmar:
    def test_confirmar_creates_transactions(self, authed, uyu_account, seeds):
        c, h = authed
        body = _parsear(c, h, uyu_account["id"], _brou_csv()).json()
        movs = [m for m in body["movimientos"] if m["estado"] == "validado"]
        # Asignar concepto
        cid_name = c.get(f"{BASE}/concepts", headers=h).json()[0]["name"]
        for m in movs:
            m["concepto"] = cid_name

        r = _confirmar(c, h, uyu_account["id"], movs)
        assert r.status_code == 200
        res = r.json()
        assert res["importados"] == 2
        assert res["estado"] in ("completed", "partial")

    def test_deduplication_second_import_zero(self, authed, uyu_account):
        """Importar el mismo archivo dos veces → segunda vez 0 importados."""
        c, h = authed
        csv = _brou_csv()
        cid_name = c.get(f"{BASE}/concepts", headers=h).json()[0]["name"]

        def _do_import():
            body = _parsear(c, h, uyu_account["id"], csv).json()
            movs = [m for m in body["movimientos"] if m["estado"] == "validado"]
            for m in movs:
                m["concepto"] = cid_name
            return _confirmar(c, h, uyu_account["id"], movs).json()

        r1 = _do_import()
        assert r1["importados"] == 2

        r2 = _do_import()
        # Segunda vez: movimientos detectados como duplicados → no se importan
        assert r2["importados"] == 0


class TestHistorial:
    def test_historial_vacio(self, authed):
        c, h = authed
        r = c.get(f"{IMP}/historial", headers=h)
        assert r.status_code == 200
        assert r.json() == []

    def test_historial_registra_importacion(self, authed, uyu_account):
        c, h = authed
        csv = _brou_csv()
        cid_name = c.get(f"{BASE}/concepts", headers=h).json()[0]["name"]
        body = _parsear(c, h, uyu_account["id"], csv).json()
        movs = [m for m in body["movimientos"] if m["estado"] == "validado"]
        for m in movs:
            m["concepto"] = cid_name
        _confirmar(c, h, uyu_account["id"], movs)

        r = c.get(f"{IMP}/historial", headers=h)
        assert r.status_code == 200
        assert len(r.json()) == 1
        assert r.json()[0]["banco"] == "brou"
