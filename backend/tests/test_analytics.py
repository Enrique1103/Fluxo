"""Tests de analytics."""
import pytest
from datetime import date
from tests.conftest import BASE

TODAY = date.today()
YEAR  = TODAY.year
MONTH = TODAY.month
ANA   = f"{BASE}/analytics"
TX    = f"{BASE}/transactions"


@pytest.fixture
def with_txs(authed, cash_account, seeds):
    """Income 5000 + Expense 1200 en el mes actual."""
    c, h = authed
    cid, cat_id = seeds
    acc_id = cash_account["id"]
    c.post(TX, json={
        "account_id": acc_id, "concept_id": cid, "category_id": cat_id,
        "amount": "5000.00", "type": "income", "date": str(TODAY),
    }, headers=h)
    c.post(TX, json={
        "account_id": acc_id, "concept_id": cid, "category_id": cat_id,
        "amount": "1200.00", "type": "expense", "date": str(TODAY),
    }, headers=h)
    return c, h


class TestIncomeVsExpenses:
    def test_empty_returns_plotly_figure(self, authed):
        c, h = authed
        r = c.get(f"{ANA}/income-vs-expenses", params={"currency": "UYU"}, headers=h)
        assert r.status_code == 200
        body = r.json()
        assert "data" in body
        assert "layout" in body

    def test_with_data_has_traces(self, with_txs):
        c, h = with_txs
        r = c.get(f"{ANA}/income-vs-expenses", params={"currency": "UYU", "months": 3}, headers=h)
        assert r.status_code == 200
        assert len(r.json()["data"]) > 0


class TestMonthlyBreakdown:
    def test_empty_month_returns_zeros(self, authed):
        c, h = authed
        r = c.get(f"{ANA}/monthly-breakdown",
                  params={"year": YEAR, "month": MONTH, "currency": "UYU"}, headers=h)
        assert r.status_code == 200
        body = r.json()
        assert "income" in body
        assert "expenses" in body
        assert "savings" in body
        assert float(body["income"]) == 0.0
        assert float(body["expenses"]) == 0.0

    def test_with_data_correct_totals(self, with_txs):
        c, h = with_txs
        r = c.get(f"{ANA}/monthly-breakdown",
                  params={"year": YEAR, "month": MONTH, "currency": "UYU"}, headers=h)
        assert r.status_code == 200
        body = r.json()
        income   = float(body["income"])
        expenses = float(body["expenses"])
        savings  = float(body["savings"])
        assert income   == pytest.approx(5000.0)
        assert expenses == pytest.approx(1200.0)
        assert savings  == pytest.approx(income - expenses)

    def test_currency_param_accepted(self, authed):
        c, h = authed
        r = c.get(f"{ANA}/monthly-breakdown",
                  params={"year": YEAR, "month": MONTH}, headers=h)
        assert r.status_code == 200


class TestOtherEndpoints:
    def test_expenses_by_category_200(self, authed):
        c, h = authed
        r = c.get(f"{ANA}/expenses-by-category", headers=h)
        assert r.status_code == 200
        assert "data" in r.json()

    def test_top_concepts_200(self, authed):
        c, h = authed
        r = c.get(f"{ANA}/top-concepts", headers=h)
        assert r.status_code == 200

    def test_patrimonio_200(self, authed):
        c, h = authed
        r = c.get(f"{ANA}/patrimonio", params={"currency": "UYU"}, headers=h)
        assert r.status_code == 200
        assert isinstance(r.json(), list)
