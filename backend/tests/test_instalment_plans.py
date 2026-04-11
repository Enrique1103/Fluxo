"""Tests de planes de cuotas."""
import pytest
from datetime import date
from tests.conftest import BASE

TODAY = str(date.today())
PLANS = f"{BASE}/instalment-plans"
TX    = f"{BASE}/transactions"
ACC   = f"{BASE}/accounts"


@pytest.fixture
def credit_account(authed):
    c, h = authed
    r = c.post(ACC, json={
        "name": "Visa", "type": "credit", "currency": "UYU",
        "balance": "0.00", "credit_limit": "50000.00",
    }, headers=h)
    assert r.status_code == 201, r.text
    return r.json()


def _plan(account_id, concept_id, category_id, n=3, total=6000.00):
    return {
        "account_id": account_id,
        "concept_id": concept_id,
        "category_id": category_id,
        "description": "Notebook cuotas",
        "total_amount": str(total),
        "n_cuotas": n,
        "fecha_inicio": TODAY,
        "metodo_pago": "tarjeta_credito",
    }


class TestInstalmentPlans:
    def test_create_plan_201(self, authed, credit_account, seeds):
        c, h = authed
        cid, cat_id = seeds
        r = c.post(PLANS, json=_plan(credit_account["id"], cid, cat_id), headers=h)
        assert r.status_code == 201
        body = r.json()
        assert body["n_cuotas"] == 3
        assert body["is_active"] is True
        assert float(body["total_amount"]) == pytest.approx(6000.0)
        assert float(body["monto_cuota"]) == pytest.approx(2000.0)

    def test_plan_generates_n_transactions(self, authed, credit_account, seeds):
        c, h = authed
        cid, cat_id = seeds
        c.post(PLANS, json=_plan(credit_account["id"], cid, cat_id, n=4), headers=h)

        txs = c.get(TX, headers=h).json()
        # Todos los movimientos del plan deben existir
        assert len(txs) >= 4

    def test_each_tx_has_plan_id(self, authed, credit_account, seeds):
        c, h = authed
        cid, cat_id = seeds
        plan_id = c.post(PLANS, json=_plan(credit_account["id"], cid, cat_id, n=3), headers=h).json()["id"]

        txs = c.get(TX, headers=h).json()
        plan_txs = [t for t in txs if t.get("instalment_plan_id") == str(plan_id)]
        assert len(plan_txs) == 3

    def test_list_plans(self, authed, credit_account, seeds):
        c, h = authed
        cid, cat_id = seeds
        c.post(PLANS, json=_plan(credit_account["id"], cid, cat_id), headers=h)
        r = c.get(PLANS, headers=h)
        assert r.status_code == 200
        assert len(r.json()) == 1

    def test_cancel_plan_204(self, authed, credit_account, seeds):
        c, h = authed
        cid, cat_id = seeds
        plan_id = c.post(PLANS, json=_plan(credit_account["id"], cid, cat_id, n=3), headers=h).json()["id"]

        r = c.delete(f"{PLANS}/{plan_id}", headers=h)
        assert r.status_code == 204

    def test_cancel_deletes_future_cuotas(self, authed, credit_account, seeds):
        c, h = authed
        cid, cat_id = seeds
        plan_id = c.post(PLANS, json=_plan(credit_account["id"], cid, cat_id, n=5, total=10000), headers=h).json()["id"]

        txs_before = len(c.get(TX, headers=h).json())
        assert txs_before >= 5

        c.delete(f"{PLANS}/{plan_id}", headers=h)

        txs_after = len(c.get(TX, headers=h).json())
        assert txs_after < txs_before

    def test_invalid_n_cuotas_422(self, authed, credit_account, seeds):
        c, h = authed
        cid, cat_id = seeds
        r = c.post(PLANS, json=_plan(credit_account["id"], cid, cat_id, n=1), headers=h)
        assert r.status_code == 422
