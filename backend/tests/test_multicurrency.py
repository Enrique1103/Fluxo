"""Conversión de monedas en resumen, gráfico Ingresos·Gastos y patrimonio."""
import pytest
from datetime import date
from tests.conftest import BASE

TODAY = date.today()
TX = f"{BASE}/transactions"


def _prev_month(d: date, n: int = 1) -> date:
    y, m = d.year, d.month - n
    while m <= 0:
        m += 12
        y -= 1
    return date(y, m, 1)


@pytest.fixture
def mixed(authed, cash_account, seeds):
    """Cuenta UYU (10000) + cuenta USD (500), tasa USD→UYU = 40 solo para el mes actual."""
    c, h = authed
    cid, cat_id = seeds
    r = c.post(f"{BASE}/exchange-rates", json={
        "from_currency": "USD", "to_currency": "UYU", "rate": "40", "year": TODAY.year, "month": TODAY.month,
    }, headers=h)
    assert r.status_code == 201, r.text
    usd = c.post(f"{BASE}/accounts", json={
        "name": "USD", "type": "cash", "currency": "USD", "balance": "500.00",
    }, headers=h).json()
    return c, h, cash_account["id"], usd["id"], cid, cat_id


def _tx(c, h, acc, cid, cat, amount, typ, d=TODAY):
    r = c.post(TX, json={"account_id": acc, "concept_id": cid, "category_id": cat,
                         "amount": str(amount), "type": typ, "date": str(d)}, headers=h)
    assert r.status_code == 201, r.text


def _ive_month(c, h, label):
    fig = c.get(f"{BASE}/analytics/income-vs-expenses", params={"months": 6, "currency": "UYU"}, headers=h).json()
    out = {}
    for trace in fig["data"]:
        idx = list(trace["x"]).index(label)
        out[trace["name"]] = trace["y"][idx]
    return out


def test_summary_converts_month_income_and_expense(mixed):
    c, h, uyu, usd, cid, cat = mixed
    _tx(c, h, usd, cid, cat, 100, "income")    # 100 USD = 4000 UYU
    _tx(c, h, uyu, cid, cat, 1000, "expense")
    _tx(c, h, usd, cid, cat, 10, "expense")    # 10 USD = 400 UYU
    s = c.get(f"{BASE}/summary", params={"currency": "UYU"}, headers=h).json()
    assert float(s["income_this_month"]) == 4000.0
    assert float(s["expense_this_month"]) == 1400.0
    assert float(s["net_this_month"]) == 2600.0
    assert sum(float(x["total"]) for x in s["expense_by_category"]) == 1400.0


def test_income_vs_expenses_converts(mixed):
    c, h, uyu, usd, cid, cat = mixed
    _tx(c, h, usd, cid, cat, 100, "income")
    _tx(c, h, uyu, cid, cat, 1000, "expense")
    m = _ive_month(c, h, TODAY.strftime("%Y-%m"))
    assert m["Ingresos"] == 4000.0
    assert m["Egresos"] == 1000.0


def test_month_before_first_rate_uses_nearest_rate(mixed):
    """Un ingreso USD de un mes sin tasa no debe contarse 1:1 como UYU."""
    c, h, uyu, usd, cid, cat = mixed
    prev = _prev_month(TODAY)
    _tx(c, h, usd, cid, cat, 100, "income", prev)
    m = _ive_month(c, h, prev.strftime("%Y-%m"))
    assert m["Ingresos"] == 4000.0


def test_patrimonio_counts_transfer_commission(mixed, debit_account):
    c, h, uyu, usd, cid, cat = mixed
    prev = _prev_month(TODAY)
    # Transferencia interna este mes con comisión de 50: el patrimonio baja 50
    r = c.post(TX, json={"account_id": uyu, "concept_id": cid, "category_id": cat, "amount": "1000",
                         "type": "transfer", "date": str(TODAY), "transfer_to_account_id": debit_account["id"],
                         "commission": "50"}, headers=h)
    assert r.status_code == 201, r.text
    pat = {p["month"]: p["value"] for p in c.get(f"{BASE}/analytics/patrimonio", params={"currency": "UYU"}, headers=h).json()}
    cur, before = pat[TODAY.strftime("%Y-%m")], pat[prev.strftime("%Y-%m")]
    assert cur == 10000 - 50 + 50000 + 500 * 40
    assert before - cur == 50


def _bal(c, h, acc):
    return float(c.get(f"{BASE}/accounts/{acc}", headers=h).json()["balance"])


def test_transfer_uyu_to_usd_with_destination_amount_and_commission(mixed):
    """Sale 4100 UYU de la cuenta UYU (+ 60 de comisión), llegan 100 USD."""
    c, h, uyu, usd, cid, cat = mixed
    r = c.post(TX, json={"account_id": uyu, "concept_id": cid, "category_id": cat, "amount": "4100",
                         "type": "transfer", "date": str(TODAY), "transfer_to_account_id": usd,
                         "destination_amount": "100", "commission": "60"}, headers=h)
    assert r.status_code == 201, r.text
    assert _bal(c, h, uyu) == 10000 - 4100 - 60
    assert _bal(c, h, usd) == 500 + 100

    # Borrar la transferencia revierte ambas cuentas con sus propios montos
    assert c.delete(f"{TX}/{r.json()['id']}", headers=h).status_code == 204
    assert _bal(c, h, uyu) == 10000
    assert _bal(c, h, usd) == 500


def test_transfer_cross_currency_uses_rate_when_no_destination_amount(mixed):
    c, h, uyu, usd, cid, cat = mixed
    r = c.post(TX, json={"account_id": usd, "concept_id": cid, "category_id": cat, "amount": "10",
                         "type": "transfer", "date": str(TODAY), "transfer_to_account_id": uyu}, headers=h)
    assert r.status_code == 201, r.text
    assert _bal(c, h, usd) == 490
    assert _bal(c, h, uyu) == 10400


def test_destination_amount_ignored_for_same_currency(mixed, debit_account):
    c, h, uyu, usd, cid, cat = mixed
    r = c.post(TX, json={"account_id": uyu, "concept_id": cid, "category_id": cat, "amount": "1000",
                         "type": "transfer", "date": str(TODAY), "transfer_to_account_id": debit_account["id"],
                         "destination_amount": "5"}, headers=h)
    assert r.status_code == 201, r.text
    assert _bal(c, h, debit_account["id"]) == 51000


def test_withdrawal_flag_in_monthly_breakdown(mixed):
    """Transferencia hacia una cuenta de efectivo = retiro (se marca en el historial)."""
    c, h, uyu, usd, cid, cat = mixed
    deb = c.post(f"{BASE}/accounts", json={"name": "Banco", "type": "debit", "currency": "UYU", "balance": "5000"}, headers=h).json()
    c.post(TX, json={"account_id": deb["id"], "concept_id": cid, "category_id": cat, "amount": "4100",
                     "type": "transfer", "date": str(TODAY), "transfer_to_account_id": usd,
                     "destination_amount": "100"}, headers=h)
    c.post(TX, json={"account_id": uyu, "concept_id": cid, "category_id": cat, "amount": "100",
                     "type": "transfer", "date": str(TODAY), "transfer_to_account_id": deb["id"]}, headers=h)
    bd = c.get(f"{BASE}/analytics/monthly-breakdown", params={"year": TODAY.year, "month": TODAY.month}, headers=h).json()
    flags = {t["transfer_dest_name"]: t["is_withdrawal"] for t in bd["transactions"] if t["type"] == "transfer"}
    assert flags == {"USD": True, "Banco": False}
    # Efectivo → banco = carga (Retiro / Carga dentro de Transferencia)
    deposits = {t["transfer_dest_name"]: t["is_deposit"] for t in bd["transactions"] if t["type"] == "transfer"}
    assert deposits == {"USD": False, "Banco": True}


def test_rate_rule_exact_average_prev_next(authed):
    """Mes con tasa → esa; sin tasa → promedio de la anterior y la siguiente; solo una → esa."""
    from app.services import exchange_rate_service
    c, h = authed
    for y, m, r in ((2026, 3, "38"), (2026, 6, "42")):
        c.post(f"{BASE}/exchange-rates", json={"from_currency": "USD", "to_currency": "UYU", "rate": r, "year": y, "month": m}, headers=h)
    # inversa en agosto: 1 UYU = 0.025 USD → 40
    c.post(f"{BASE}/exchange-rates", json={"from_currency": "UYU", "to_currency": "USD", "rate": "0.025", "year": 2026, "month": 8}, headers=h)
    from app.models.users_models import User
    from tests.conftest import TestingSessionLocal
    db = TestingSessionLocal()
    uid = db.query(User).first().id
    rate = lambda y, m: float(exchange_rate_service.get_rate_nearest(db, uid, "USD", "UYU", y, m))
    assert rate(2026, 3) == 38            # exacta
    assert rate(2026, 4) == 40            # promedio 38 y 42
    assert rate(2026, 7) == 41            # promedio 42 y 40 (inversa)
    assert rate(2026, 1) == 38            # sin anterior → la siguiente
    assert rate(2026, 12) == 40           # sin siguiente → la anterior
    assert abs(float(exchange_rate_service.get_rate_nearest(db, uid, "UYU", "USD", 2026, 4)) - 1/40) < 1e-9
    db.close()
