"""QA: consistencia de resumen, analytics, metas, presupuestos, tasas y totales mensuales."""
import io
import pytest
from datetime import date
from decimal import Decimal
from tests.conftest import BASE

from app.services.monthly_total_parser import parse_file

TODAY = date.today()
TX = f"{BASE}/transactions"
ANA = f"{BASE}/analytics"
LBL = TODAY.strftime("%Y-%m")


def _prev_month(d: date, n: int = 1) -> date:
    y, m = d.year, d.month - n
    while m <= 0:
        m += 12
        y -= 1
    return date(y, m, 1)


def _tx(c, h, acc, cid, cat, amount, typ, d=TODAY, **extra):
    r = c.post(TX, json={"account_id": acc, "concept_id": cid, "category_id": cat,
                         "amount": str(amount), "type": typ, "date": str(d), **extra}, headers=h)
    assert r.status_code == 201, r.text
    return r.json()


def _rate(c, h, frm, to, rate, d=TODAY):
    r = c.post(f"{BASE}/exchange-rates", json={"from_currency": frm, "to_currency": to, "rate": str(rate),
                                               "year": d.year, "month": d.month}, headers=h)
    assert r.status_code == 201, r.text


def _usd_account(c, h, balance="500.00"):
    r = c.post(f"{BASE}/accounts", json={"name": "USD", "type": "cash", "currency": "USD",
                                         "balance": balance}, headers=h)
    assert r.status_code == 201, r.text
    return r.json()["id"]


def _ive(c, h, label=LBL, **params):
    fig = c.get(f"{ANA}/income-vs-expenses", params={"months": 6, "currency": "UYU", **params}, headers=h).json()
    out = {}
    for trace in fig["data"]:
        idx = list(trace["x"]).index(label)
        out[trace["name"]] = trace["y"][idx]
    return out


def _breakdown(c, h, d=TODAY, currency="UYU"):
    r = c.get(f"{ANA}/monthly-breakdown", params={"year": d.year, "month": d.month, "currency": currency}, headers=h)
    assert r.status_code == 200, r.text
    return r.json()


def _ext_account(c, h):
    r = c.post(f"{BASE}/external-accounts", json={"name": "Juan BROU", "owner_name": "Juan Perez"}, headers=h)
    assert r.status_code == 201, r.text
    return r.json()["id"]


# ─── Consistencia entre endpoints ─────────────────────────────────────────────

def test_breakdown_expenses_match_summary_with_transfer_outflows(authed, cash_account, debit_account, seeds):
    c, h = authed
    cid, cat = seeds
    ext = _ext_account(c, h)
    _tx(c, h, cash_account["id"], cid, cat, 1000, "expense")
    _tx(c, h, cash_account["id"], cid, cat, 2000, "transfer", transfer_to_account_id=debit_account["id"], commission="50")
    _tx(c, h, debit_account["id"], cid, cat, 3000, "transfer", external_account_id=ext)
    s = c.get(f"{BASE}/summary", params={"currency": "UYU"}, headers=h).json()
    ive = _ive(c, h)
    bd = _breakdown(c, h)
    assert float(s["expense_this_month"]) == 4050.0
    assert ive["Egresos"] == 4050.0
    assert bd["expenses"] == pytest.approx(4050.0)
    assert bd["savings"] == pytest.approx(float(s["net_this_month"]))


def test_summary_and_ive_agree_on_month(authed, cash_account, debit_account, seeds):
    c, h = authed
    cid, cat = seeds
    usd = _usd_account(c, h)
    _rate(c, h, "USD", "UYU", 40)
    _tx(c, h, usd, cid, cat, 100, "income")
    _tx(c, h, cash_account["id"], cid, cat, 1000, "expense")
    _tx(c, h, cash_account["id"], cid, cat, 500, "transfer", transfer_to_account_id=debit_account["id"], commission="20")
    s = c.get(f"{BASE}/summary", params={"currency": "UYU"}, headers=h).json()
    ive = _ive(c, h)
    assert float(s["income_this_month"]) == ive["Ingresos"] == 4000.0
    assert float(s["expense_this_month"]) == ive["Egresos"] == 1020.0


def test_breakdown_historical_balance_reverses_later_transfer(authed, cash_account, debit_account, seeds):
    c, h = authed
    cid, cat = seeds
    # Transferencia este mes: el saldo al cierre del mes anterior debe ser el original
    _tx(c, h, cash_account["id"], cid, cat, 1000, "transfer", transfer_to_account_id=debit_account["id"], commission="50")
    bd = _breakdown(c, h, _prev_month(TODAY))
    bal = {a["id"]: a["balance"] for a in bd["account_balances"]}
    assert bal[debit_account["id"]] == 50000.0
    assert bal[cash_account["id"]] == 10000.0


def test_breakdown_historical_balance_reverses_later_income_expense(authed, cash_account, seeds):
    c, h = authed
    cid, cat = seeds
    _tx(c, h, cash_account["id"], cid, cat, 3000, "income")
    _tx(c, h, cash_account["id"], cid, cat, 1000, "expense")
    bd = _breakdown(c, h, _prev_month(TODAY))
    bal = {a["id"]: a["balance"] for a in bd["account_balances"]}
    assert bal[cash_account["id"]] == 10000.0


# ─── Conversión de moneda en gráficos que no la tienen ───────────────────────

@pytest.fixture
def mixed_expenses(authed, cash_account, seeds):
    """Gasto 1000 UYU + gasto 10 USD (= 400 UYU) en la misma categoría/concepto."""
    c, h = authed
    cid, cat = seeds
    usd = _usd_account(c, h)
    _rate(c, h, "USD", "UYU", 40)
    _tx(c, h, cash_account["id"], cid, cat, 1000, "expense")
    _tx(c, h, usd, cid, cat, 10, "expense")
    return c, h


def test_expenses_by_category_converts_currency(mixed_expenses):
    c, h = mixed_expenses
    fig = c.get(f"{ANA}/expenses-by-category", params={"date_from": str(TODAY.replace(day=1)),
                                                        "date_to": str(TODAY)}, headers=h).json()
    assert sum(fig["data"][0]["values"]) == pytest.approx(1400.0)


def test_top_concepts_converts_currency(mixed_expenses):
    c, h = mixed_expenses
    fig = c.get(f"{ANA}/top-concepts", params={"date_from": str(TODAY.replace(day=1)),
                                                "date_to": str(TODAY)}, headers=h).json()
    assert sum(fig["data"][0]["x"]) == pytest.approx(1400.0)


def test_daily_net_flow_converts_currency(mixed_expenses):
    c, h = mixed_expenses
    fig = c.get(f"{ANA}/daily-net-flow", params={"date_from": str(TODAY), "date_to": str(TODAY)}, headers=h).json()
    assert fig["data"][1]["y"][-1] == pytest.approx(-1400.0)


def test_daily_net_flow_counts_external_transfer(authed, cash_account, seeds):
    c, h = authed
    cid, cat = seeds
    ext = _ext_account(c, h)
    _tx(c, h, cash_account["id"], cid, cat, 2000, "transfer", external_account_id=ext, commission="10")
    fig = c.get(f"{ANA}/daily-net-flow", params={"date_from": str(TODAY), "date_to": str(TODAY)}, headers=h).json()
    assert fig["data"][1]["y"][-1] == pytest.approx(-2010.0)


def test_ive_empty_with_months_ahead_has_aligned_axes(authed):
    c, h = authed
    fig = c.get(f"{ANA}/income-vs-expenses", params={"months": 3, "months_ahead": 2}, headers=h).json()
    for trace in fig["data"]:
        assert len(trace["x"]) == len(trace["y"]) == 5


def test_deleted_transaction_not_counted_anywhere(authed, cash_account, seeds):
    c, h = authed
    cid, cat = seeds
    t = _tx(c, h, cash_account["id"], cid, cat, 700, "expense")
    assert c.delete(f"{TX}/{t['id']}", headers=h).status_code == 204
    s = c.get(f"{BASE}/summary", headers=h).json()
    assert float(s["expense_this_month"]) == 0
    assert _ive(c, h)["Egresos"] == 0
    assert _breakdown(c, h)["expenses"] == 0
    assert float(s["net_worth"]) == 10000


def test_internal_transfer_not_income_or_expense(authed, cash_account, debit_account, seeds):
    c, h = authed
    cid, cat = seeds
    _tx(c, h, cash_account["id"], cid, cat, 1000, "transfer", transfer_to_account_id=debit_account["id"])
    s = c.get(f"{BASE}/summary", headers=h).json()
    assert float(s["income_this_month"]) == 0 and float(s["expense_this_month"]) == 0
    assert float(s["net_worth"]) == 60000
    bd = _breakdown(c, h)
    assert bd["income"] == 0 and bd["expenses"] == 0


def test_credit_card_debt_reduces_net_worth(authed, cash_account, seeds):
    c, h = authed
    cid, cat = seeds
    cc = c.post(f"{BASE}/accounts", json={"name": "Visa", "type": "credit", "currency": "UYU",
                                          "balance": "0.00", "credit_limit": "20000.00"}, headers=h).json()
    _tx(c, h, cc["id"], cid, cat, 3000, "expense")
    s = c.get(f"{BASE}/summary", headers=h).json()
    assert float(s["total_debt"]) == -3000
    assert float(s["net_worth"]) == 7000
    pat = {p["month"]: p["value"] for p in c.get(f"{ANA}/patrimonio", headers=h).json()}
    assert pat[LBL] == 7000
    assert pat[_prev_month(TODAY).strftime("%Y-%m")] == 10000


def test_summary_display_currency_usd(authed, cash_account, seeds):
    c, h = authed
    _rate(c, h, "USD", "UYU", 40)
    s = c.get(f"{BASE}/summary", params={"currency": "USD"}, headers=h).json()
    assert float(s["net_worth"]) == pytest.approx(250.0)


# ─── Tasas ───────────────────────────────────────────────────────────────────

def test_inverse_rate_used(authed, cash_account, seeds):
    c, h = authed
    cid, cat = seeds
    usd = _usd_account(c, h)
    _rate(c, h, "UYU", "USD", "0.025")
    _tx(c, h, usd, cid, cat, 100, "income")
    assert _ive(c, h)["Ingresos"] == pytest.approx(4000.0)


def test_exact_month_inverse_beats_stale_direct(authed, cash_account, seeds):
    c, h = authed
    cid, cat = seeds
    usd = _usd_account(c, h)
    _rate(c, h, "USD", "UYU", 30, _prev_month(TODAY, 3))
    _rate(c, h, "UYU", "USD", "0.025", TODAY)      # = 40 UYU por USD este mes
    _tx(c, h, usd, cid, cat, 100, "income")
    assert _ive(c, h)["Ingresos"] == pytest.approx(4000.0)


# ─── Presupuestos ────────────────────────────────────────────────────────────

def test_budget_spent_only_expenses_same_month_currency(authed, cash_account, debit_account, seeds):
    c, h = authed
    cid, cat = seeds
    usd = _usd_account(c, h)
    _rate(c, h, "USD", "UYU", 40)
    _tx(c, h, cash_account["id"], cid, cat, 1000, "expense")
    _tx(c, h, usd, cid, cat, 10, "expense")                                   # otra moneda
    _tx(c, h, cash_account["id"], cid, cat, 500, "expense", d=_prev_month(TODAY))  # otro mes
    _tx(c, h, cash_account["id"], cid, cat, 800, "transfer", transfer_to_account_id=debit_account["id"])
    _tx(c, h, cash_account["id"], cid, cat, 900, "income")
    t = _tx(c, h, cash_account["id"], cid, cat, 300, "expense")
    c.delete(f"{TX}/{t['id']}", headers=h)
    r = c.post(f"{BASE}/budgets", json={"category_id": cat, "month": TODAY.month, "year": TODAY.year,
                                        "max_amount": "5000", "currency": "UYU"}, headers=h)
    assert r.status_code == 201, r.text
    assert float(r.json()["spent"]) == 1000


# ─── Metas ───────────────────────────────────────────────────────────────────

def test_goal_allocation_over_100_rejected(authed, cash_account):
    c, h = authed
    r1 = c.post(f"{BASE}/fin-goals", json={"name": "Auto", "target_amount": "1000000", "allocation_pct": "70"}, headers=h)
    assert r1.status_code == 201, r1.text
    r2 = c.post(f"{BASE}/fin-goals", json={"name": "Viaje", "target_amount": "1000000", "allocation_pct": "40"}, headers=h)
    assert r2.status_code in (400, 409, 422)


def test_goal_current_amount_converted(authed, cash_account):
    c, h = authed
    _rate(c, h, "USD", "UYU", 40)
    r = c.post(f"{BASE}/fin-goals", json={"name": "Auto", "currency": "USD", "target_amount": "10000",
                                          "allocation_pct": "50"}, headers=h)
    assert float(r.json()["current_amount"]) == 125.0
    assert r.json()["is_completed"] is False


def test_goal_completion_reverts_when_target_raised(authed, cash_account):
    c, h = authed
    g = c.post(f"{BASE}/fin-goals", json={"name": "Fondo", "target_amount": "1000", "allocation_pct": "60"}, headers=h).json()
    assert g["is_completed"] is True
    r = c.patch(f"{BASE}/fin-goals/{g['id']}", json={"target_amount": "1000000"}, headers=h)
    assert r.status_code == 200, r.text
    assert r.json()["is_completed"] is False
    # Con la meta otra vez activa al 60%, otra de 60% no debería entrar
    r2 = c.post(f"{BASE}/fin-goals", json={"name": "Viaje", "target_amount": "1000000", "allocation_pct": "60"}, headers=h)
    assert r2.status_code != 201


# ─── Totales mensuales ───────────────────────────────────────────────────────

def test_monthly_total_combines_with_real_tx_everywhere(authed, cash_account, seeds):
    c, h = authed
    cid, cat = seeds
    _tx(c, h, cash_account["id"], cid, cat, 1000, "expense")
    r = c.post(f"{BASE}/monthly-totals", json={"rows": [
        {"year": TODAY.year, "month": TODAY.month, "currency": "UYU", "income": "5000", "expense": "2000"}]}, headers=h)
    assert r.status_code == 200, r.text
    s = c.get(f"{BASE}/summary", headers=h).json()
    ive = _ive(c, h)
    bd = _breakdown(c, h)
    assert float(s["income_this_month"]) == ive["Ingresos"] == bd["income"] == 5000
    assert float(s["expense_this_month"]) == ive["Egresos"] == bd["expenses"] == 3000


def test_monthly_total_usd_converted(authed, cash_account):
    c, h = authed
    prev = _prev_month(TODAY)
    _rate(c, h, "USD", "UYU", 40, prev)
    c.post(f"{BASE}/monthly-totals", json={"rows": [
        {"year": prev.year, "month": prev.month, "currency": "USD", "income": "100", "expense": "50"}]}, headers=h)
    assert _ive(c, h, prev.strftime("%Y-%m")) == {"Ingresos": 4000.0, "Egresos": 2000.0}
    assert _breakdown(c, h, prev)["income"] == 4000.0


def test_monthly_total_future_rejected(authed):
    c, h = authed
    nxt = date(TODAY.year + 1, 1, 1)
    r = c.post(f"{BASE}/monthly-totals", json={"rows": [
        {"year": nxt.year, "month": nxt.month, "currency": "UYU", "income": "1", "expense": "1"}]}, headers=h)
    assert r.status_code >= 400


def test_parser_amount_formats():
    csv = ("Mes;Moneda;Ingresos;Gastos\n"
           "2024-03;UYU;1.234,50;1.000\n"
           "03/2024;USD;$ 1,5;12.50\n").encode()
    out = parse_file(csv, "t.csv", "UYU")
    assert out["errors"] == []
    assert out["rows"][0] == {"year": 2024, "month": 3, "currency": "UYU", "income": "1234.50", "expense": "1000.00"}
    assert out["rows"][1]["income"] == "1.50" and out["rows"][1]["expense"] == "12.50"
