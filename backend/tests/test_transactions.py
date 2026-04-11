"""
Tests de transacciones.
NOTA: los tests usan SOLO cuentas UYU (sin USD) para evitar el bloqueo
por tasa de cambio — comportamiento documentado en BUG 1.
"""
import pytest
from datetime import date
from tests.conftest import BASE

TODAY = str(date.today())


# ─── Fixture: cuenta efectivo UYU lista para transacciones ────────────────────

@pytest.fixture
def tx_setup(authed, cash_account, seeds):
    """Devuelve (client, headers, account_id, concept_id, category_id)."""
    c, h = authed
    concept_id, category_id = seeds
    return c, h, cash_account["id"], concept_id, category_id


@pytest.fixture
def two_accounts(authed, cash_account, debit_account, seeds):
    """Devuelve (client, headers, cash_id, debit_id, concept_id, category_id)."""
    c, h = authed
    concept_id, category_id = seeds
    return c, h, cash_account["id"], debit_account["id"], concept_id, category_id


# ─── Tests ────────────────────────────────────────────────────────────────────

class TestCreateTransaction:
    def test_expense_debits_account(self, tx_setup):
        c, h, acc_id, cid, cat_id = tx_setup
        r = c.post(f"{BASE}/transactions", json={
            "account_id": acc_id, "concept_id": cid, "category_id": cat_id,
            "amount": "1500.00", "type": "expense", "date": TODAY,
        }, headers=h)
        assert r.status_code == 201
        body = r.json()
        assert body["type"] == "expense"
        assert body["amount"] == "1500.00"
        # Verificar saldo actualizado
        acc = c.get(f"{BASE}/accounts/{acc_id}", headers=h).json()
        assert float(acc["balance"]) == 10000.00 - 1500.00

    def test_income_credits_account(self, tx_setup):
        c, h, acc_id, cid, cat_id = tx_setup
        r = c.post(f"{BASE}/transactions", json={
            "account_id": acc_id, "concept_id": cid, "category_id": cat_id,
            "amount": "5000.00", "type": "income", "date": TODAY,
        }, headers=h)
        assert r.status_code == 201
        acc = c.get(f"{BASE}/accounts/{acc_id}", headers=h).json()
        assert float(acc["balance"]) == 10000.00 + 5000.00

    def test_expense_insufficient_funds_422(self, tx_setup):
        c, h, acc_id, cid, cat_id = tx_setup
        r = c.post(f"{BASE}/transactions", json={
            "account_id": acc_id, "concept_id": cid, "category_id": cat_id,
            "amount": "99999.00", "type": "expense", "date": TODAY,
        }, headers=h)
        assert r.status_code == 422

    def test_transfer_between_accounts(self, two_accounts):
        c, h, cash_id, debit_id, cid, cat_id = two_accounts
        r = c.post(f"{BASE}/transactions", json={
            "account_id": cash_id, "concept_id": cid, "category_id": cat_id,
            "amount": "2000.00", "type": "transfer", "date": TODAY,
            "transfer_to_account_id": debit_id,
        }, headers=h)
        assert r.status_code == 201
        body = r.json()
        assert body["transfer_role"] == "source"
        # Verificar balances
        cash = c.get(f"{BASE}/accounts/{cash_id}", headers=h).json()
        debit = c.get(f"{BASE}/accounts/{debit_id}", headers=h).json()
        assert float(cash["balance"]) == 10000.00 - 2000.00
        assert float(debit["balance"]) == 50000.00 + 2000.00

    def test_transfer_same_account_422(self, tx_setup):
        c, h, acc_id, cid, cat_id = tx_setup
        r = c.post(f"{BASE}/transactions", json={
            "account_id": acc_id, "concept_id": cid, "category_id": cat_id,
            "amount": "100.00", "type": "transfer", "date": TODAY,
            "transfer_to_account_id": acc_id,
        }, headers=h)
        assert r.status_code == 422

    def test_transfer_requires_destination(self, tx_setup):
        c, h, acc_id, cid, cat_id = tx_setup
        r = c.post(f"{BASE}/transactions", json={
            "account_id": acc_id, "concept_id": cid, "category_id": cat_id,
            "amount": "100.00", "type": "transfer", "date": TODAY,
        }, headers=h)
        assert r.status_code == 422

    def test_missing_category_id_422(self, tx_setup):
        """category_id es requerido — el test anterior del script original lo omitía."""
        c, h, acc_id, cid, _ = tx_setup
        r = c.post(f"{BASE}/transactions", json={
            "account_id": acc_id, "concept_id": cid,
            "amount": "100.00", "type": "expense", "date": TODAY,
        }, headers=h)
        assert r.status_code == 422

    def test_zero_amount_422(self, tx_setup):
        c, h, acc_id, cid, cat_id = tx_setup
        r = c.post(f"{BASE}/transactions", json={
            "account_id": acc_id, "concept_id": cid, "category_id": cat_id,
            "amount": "0.00", "type": "expense", "date": TODAY,
        }, headers=h)
        assert r.status_code == 422

    def test_uyu_transaction_not_blocked_by_usd_account(self, authed, seeds):
        """
        Una transacción en cuenta UYU NO se bloquea por tener una cuenta USD
        sin tasa de cambio cargada (el chequeo solo aplica a las cuentas involucradas).
        """
        c, h = authed
        cid, cat_id = seeds
        # Crear cuenta UYU
        acc_uyu = c.post(f"{BASE}/accounts", json={
            "name": "Efectivo UYU", "type": "cash", "currency": "UYU", "balance": "5000.00",
        }, headers=h).json()
        # Crear cuenta USD (antes bloqueaba transacciones UYU, ahora no)
        c.post(f"{BASE}/accounts", json={
            "name": "Visa USD", "type": "credit", "currency": "USD",
            "balance": "0.00", "credit_limit": "1000.00",
        }, headers=h)
        # Transacción en cuenta UYU — debe funcionar aunque no haya tasa USD
        r = c.post(f"{BASE}/transactions", json={
            "account_id": acc_uyu["id"], "concept_id": cid, "category_id": cat_id,
            "amount": "100.00", "type": "expense", "date": TODAY,
        }, headers=h)
        assert r.status_code == 201

    def test_usd_transaction_blocked_without_exchange_rate(self, authed, seeds):
        """
        Una transacción en cuenta USD SÍ se bloquea si no hay tasa de cambio.
        """
        c, h = authed
        cid, cat_id = seeds
        acc_usd = c.post(f"{BASE}/accounts", json={
            "name": "Visa USD", "type": "credit", "currency": "USD",
            "balance": "0.00", "credit_limit": "1000.00",
        }, headers=h).json()
        # Transacción en cuenta USD sin tasa cargada → 422
        r = c.post(f"{BASE}/transactions", json={
            "account_id": acc_usd["id"], "concept_id": cid, "category_id": cat_id,
            "amount": "50.00", "type": "expense", "date": TODAY,
        }, headers=h)
        assert r.status_code == 422
        assert "tasa de cambio" in r.json()["detail"].lower()


class TestGetTransactions:
    def test_list_empty_initially(self, tx_setup):
        c, h, acc_id, cid, cat_id = tx_setup
        r = c.get(f"{BASE}/transactions", headers=h)
        assert r.status_code == 200
        assert r.json() == []

    def test_list_after_expense(self, tx_setup):
        c, h, acc_id, cid, cat_id = tx_setup
        c.post(f"{BASE}/transactions", json={
            "account_id": acc_id, "concept_id": cid, "category_id": cat_id,
            "amount": "500.00", "type": "expense", "date": TODAY,
        }, headers=h)
        r = c.get(f"{BASE}/transactions", headers=h)
        assert r.status_code == 200
        txs = r.json()
        assert len(txs) == 1
        assert txs[0]["type"] == "expense"

    def test_transfer_destination_hidden_from_list(self, two_accounts):
        """La pata DESTINATION de una transferencia no aparece en el listado."""
        c, h, cash_id, debit_id, cid, cat_id = two_accounts
        c.post(f"{BASE}/transactions", json={
            "account_id": cash_id, "concept_id": cid, "category_id": cat_id,
            "amount": "500.00", "type": "transfer", "date": TODAY,
            "transfer_to_account_id": debit_id,
        }, headers=h)
        txs = c.get(f"{BASE}/transactions", headers=h).json()
        dest_txs = [t for t in txs if t.get("transfer_role") == "destination"]
        assert len(dest_txs) == 0, "DESTINATION no debe aparecer en el listado"

    def test_filter_by_type(self, tx_setup):
        c, h, acc_id, cid, cat_id = tx_setup
        c.post(f"{BASE}/transactions", json={
            "account_id": acc_id, "concept_id": cid, "category_id": cat_id,
            "amount": "200.00", "type": "expense", "date": TODAY,
        }, headers=h)
        r = c.get(f"{BASE}/transactions?type=income", headers=h)
        assert r.status_code == 200
        assert r.json() == []

    def test_get_by_id(self, tx_setup):
        c, h, acc_id, cid, cat_id = tx_setup
        r = c.post(f"{BASE}/transactions", json={
            "account_id": acc_id, "concept_id": cid, "category_id": cat_id,
            "amount": "300.00", "type": "expense", "date": TODAY,
        }, headers=h)
        tx_id = r.json()["id"]
        r2 = c.get(f"{BASE}/transactions/{tx_id}", headers=h)
        assert r2.status_code == 200
        assert r2.json()["id"] == tx_id


class TestUpdateTransaction:
    def test_update_amount(self, tx_setup):
        c, h, acc_id, cid, cat_id = tx_setup
        tx = c.post(f"{BASE}/transactions", json={
            "account_id": acc_id, "concept_id": cid, "category_id": cat_id,
            "amount": "1000.00", "type": "expense", "date": TODAY,
        }, headers=h).json()
        r = c.patch(f"{BASE}/transactions/{tx['id']}", json={"amount": "500.00"}, headers=h)
        assert r.status_code == 200
        # Balance ajustado: 10000 - 1000 = 9000, después update a 500: 9000 + 500 = 9500
        acc = c.get(f"{BASE}/accounts/{acc_id}", headers=h).json()
        assert float(acc["balance"]) == 9500.00

    def test_cannot_edit_transfer(self, two_accounts):
        c, h, cash_id, debit_id, cid, cat_id = two_accounts
        tx = c.post(f"{BASE}/transactions", json={
            "account_id": cash_id, "concept_id": cid, "category_id": cat_id,
            "amount": "500.00", "type": "transfer", "date": TODAY,
            "transfer_to_account_id": debit_id,
        }, headers=h).json()
        r = c.patch(f"{BASE}/transactions/{tx['id']}", json={"amount": "100.00"}, headers=h)
        assert r.status_code == 422


class TestDeleteTransaction:
    def test_delete_expense_restores_balance(self, tx_setup):
        c, h, acc_id, cid, cat_id = tx_setup
        tx = c.post(f"{BASE}/transactions", json={
            "account_id": acc_id, "concept_id": cid, "category_id": cat_id,
            "amount": "3000.00", "type": "expense", "date": TODAY,
        }, headers=h).json()
        c.delete(f"{BASE}/transactions/{tx['id']}", headers=h)
        acc = c.get(f"{BASE}/accounts/{acc_id}", headers=h).json()
        assert float(acc["balance"]) == 10000.00  # restaurado

    def test_delete_transfer_restores_both_balances(self, two_accounts):
        c, h, cash_id, debit_id, cid, cat_id = two_accounts
        tx = c.post(f"{BASE}/transactions", json={
            "account_id": cash_id, "concept_id": cid, "category_id": cat_id,
            "amount": "2000.00", "type": "transfer", "date": TODAY,
            "transfer_to_account_id": debit_id,
        }, headers=h).json()
        c.delete(f"{BASE}/transactions/{tx['id']}", headers=h)
        cash  = c.get(f"{BASE}/accounts/{cash_id}", headers=h).json()
        debit = c.get(f"{BASE}/accounts/{debit_id}", headers=h).json()
        assert float(cash["balance"])  == 10000.00
        assert float(debit["balance"]) == 50000.00
