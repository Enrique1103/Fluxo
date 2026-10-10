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
