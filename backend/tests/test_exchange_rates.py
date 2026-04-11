"""Tests de tasas de cambio."""
import pytest
from datetime import date
from tests.conftest import BASE

TODAY = date.today()
RATES = f"{BASE}/exchange-rates"
TX    = f"{BASE}/transactions"
ACC   = f"{BASE}/accounts"


def _rate(year=None, month=None, rate=42.50):
    return {
        "from_currency": "USD",
        "to_currency": "UYU",
        "rate": rate,
        "year": year or TODAY.year,
        "month": month or TODAY.month,
    }


@pytest.fixture
def usd_account(authed):
    c, h = authed
    r = c.post(ACC, json={
        "name": "USD Wallet", "type": "debit", "currency": "USD", "balance": "1000.00",
    }, headers=h)
    assert r.status_code == 201, r.text
    return r.json()


class TestExchangeRates:
    def test_create_rate_201(self, authed):
        c, h = authed
        r = c.post(RATES, json=_rate(), headers=h)
        assert r.status_code == 201
        body = r.json()
        assert body["from_currency"] == "USD"
        assert body["to_currency"] == "UYU"
        assert float(body["rate"]) == pytest.approx(42.50)

    def test_list_rates(self, authed):
        c, h = authed
        c.post(RATES, json=_rate(), headers=h)
        r = c.get(RATES, headers=h)
        assert r.status_code == 200
        data = r.json()
        assert len(data) == 1
        assert data[0]["from_currency"] == "USD"

    def test_duplicate_same_month_409(self, authed):
        c, h = authed
        c.post(RATES, json=_rate(), headers=h)
        r = c.post(RATES, json=_rate(), headers=h)
        assert r.status_code == 409

    def test_different_months_ok(self, authed):
        c, h = authed
        c.post(RATES, json=_rate(month=1), headers=h)
        r = c.post(RATES, json=_rate(month=2), headers=h)
        assert r.status_code == 201
        assert len(c.get(RATES, headers=h).json()) == 2

    def test_usd_tx_without_rate_422(self, authed, usd_account, seeds):
        c, h = authed
        cid, cat_id = seeds
        r = c.post(TX, json={
            "account_id": usd_account["id"], "concept_id": cid, "category_id": cat_id,
            "amount": "100.00", "type": "expense", "date": str(TODAY),
        }, headers=h)
        assert r.status_code == 422
        assert "tasa" in r.json()["detail"].lower()

    def test_usd_tx_with_rate_201(self, authed, usd_account, seeds):
        c, h = authed
        c.post(RATES, json=_rate(), headers=h)
        cid, cat_id = seeds
        r = c.post(TX, json={
            "account_id": usd_account["id"], "concept_id": cid, "category_id": cat_id,
            "amount": "50.00", "type": "expense", "date": str(TODAY),
        }, headers=h)
        assert r.status_code == 201
        assert r.json()["amount"] == "50.00"

    def test_update_rate(self, authed):
        c, h = authed
        rate_id = c.post(RATES, json=_rate(), headers=h).json()["id"]
        r = c.patch(f"{RATES}/{rate_id}", json={"rate": 45.00}, headers=h)
        assert r.status_code == 200
        assert float(r.json()["rate"]) == pytest.approx(45.00)

    def test_delete_rate(self, authed):
        c, h = authed
        rate_id = c.post(RATES, json=_rate(), headers=h).json()["id"]
        r = c.delete(f"{RATES}/{rate_id}", headers=h)
        assert r.status_code == 204
        assert c.get(RATES, headers=h).json() == []
