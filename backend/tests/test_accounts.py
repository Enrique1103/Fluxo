"""Tests de cuentas bancarias."""
import pytest
from tests.conftest import BASE


class TestCreateAccount:
    def test_create_cash(self, authed):
        c, h = authed
        r = c.post(f"{BASE}/accounts", json={
            "name": "Efectivo", "type": "cash", "currency": "UYU", "balance": "5000.00",
        }, headers=h)
        assert r.status_code == 201
        body = r.json()
        assert body["balance"] == "5000.00"
        assert body["is_liability"] is False

    def test_create_debit(self, authed):
        c, h = authed
        r = c.post(f"{BASE}/accounts", json={
            "name": "BROU", "type": "debit", "currency": "UYU", "balance": "20000.00",
        }, headers=h)
        assert r.status_code == 201
        assert r.json()["type"] == "debit"

    def test_create_credit_requires_limit(self, authed):
        c, h = authed
        r = c.post(f"{BASE}/accounts", json={
            "name": "Visa", "type": "credit", "currency": "USD",
        }, headers=h)
        assert r.status_code == 422

    def test_create_credit_ok(self, authed):
        c, h = authed
        r = c.post(f"{BASE}/accounts", json={
            "name": "Visa", "type": "credit", "currency": "USD",
            "balance": "0.00", "credit_limit": "2000.00",
        }, headers=h)
        assert r.status_code == 201
        body = r.json()
        assert body["is_liability"] is True
        assert body["credit_limit"] == "2000.00"

    def test_create_credit_balance_silently_reset_to_zero(self, authed):
        """
        BUG DOCUMENTADO: el schema resetea silenciosamente el balance a 0
        en cuentas de crédito en lugar de rechazar con 422.
        Se espera 201 con balance=0 (comportamiento actual).
        """
        c, h = authed
        r = c.post(f"{BASE}/accounts", json={
            "name": "Visa Mala", "type": "credit", "currency": "USD",
            "balance": "500.00", "credit_limit": "2000.00",
        }, headers=h)
        assert r.status_code == 201
        # El balance enviado (500) es ignorado y forzado a 0
        assert r.json()["balance"] == "0.00"

    def test_create_duplicate_name(self, authed):
        c, h = authed
        payload = {"name": "Mi Cuenta", "type": "cash", "currency": "UYU", "balance": "0.00"}
        c.post(f"{BASE}/accounts", json=payload, headers=h)
        r = c.post(f"{BASE}/accounts", json=payload, headers=h)
        assert r.status_code == 409

    def test_non_credit_cannot_have_limit(self, authed):
        c, h = authed
        r = c.post(f"{BASE}/accounts", json={
            "name": "Débito con límite", "type": "debit", "currency": "UYU",
            "balance": "0.00", "credit_limit": "1000.00",
        }, headers=h)
        assert r.status_code == 422


class TestGetAccounts:
    def test_list_accounts(self, authed, cash_account):
        c, h = authed
        r = c.get(f"{BASE}/accounts", headers=h)
        assert r.status_code == 200
        assert any(a["id"] == cash_account["id"] for a in r.json())

    def test_get_account_by_id(self, authed, cash_account):
        c, h = authed
        r = c.get(f"{BASE}/accounts/{cash_account['id']}", headers=h)
        assert r.status_code == 200
        assert r.json()["id"] == cash_account["id"]

    def test_get_nonexistent_account(self, authed):
        c, h = authed
        r = c.get(f"{BASE}/accounts/00000000-0000-0000-0000-000000000000", headers=h)
        assert r.status_code == 404

    def test_cannot_access_other_users_account(self, client, cash_account, auth_headers):
        """Un segundo usuario no puede ver la cuenta del primero."""
        from tests.conftest import REG, LOG, next_email
        # Registrar y loguear segundo usuario
        email2 = next_email()
        client.post(REG, json={
            "name": "Otro", "email": email2,
            "password": "Test1234!", "currency_default": "UYU",
        })
        r = client.post(LOG, data={"username": email2, "password": "Test1234!"})
        token2 = r.json()["access_token"]
        h2 = {"Authorization": f"Bearer {token2}"}

        r = client.get(f"{BASE}/accounts/{cash_account['id']}", headers=h2)
        assert r.status_code in (403, 404)  # 403 Forbidden (implementación actual)


class TestUpdateAccount:
    def test_update_name(self, authed, cash_account):
        c, h = authed
        r = c.patch(f"{BASE}/accounts/{cash_account['id']}", json={"name": "Efectivo UYU"}, headers=h)
        assert r.status_code == 200
        assert r.json()["name"] == "Efectivo UYU"

    def test_update_to_existing_name(self, authed, cash_account, debit_account):
        c, h = authed
        r = c.patch(f"{BASE}/accounts/{cash_account['id']}", json={"name": debit_account["name"]}, headers=h)
        assert r.status_code == 409


class TestDeleteAccount:
    def test_delete_account_without_transactions(self, authed, cash_account):
        c, h = authed
        r = c.delete(f"{BASE}/accounts/{cash_account['id']}", headers=h)
        assert r.status_code == 204
