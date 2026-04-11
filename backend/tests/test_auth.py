"""Tests de autenticación y gestión de usuario."""
import pytest
from tests.conftest import BASE, REG, LOG, next_email


class TestRegister:
    def test_register_ok(self, client):
        r = client.post(REG, json={
            "name": "Ana", "email": next_email(),
            "password": "Secure1!", "currency_default": "UYU",
        })
        assert r.status_code == 201
        body = r.json()
        assert body["email"].endswith("@example.com")
        assert "id" in body
        assert "password" not in body  # nunca exponer password

    def test_register_duplicate_email(self, client):
        email = next_email()
        payload = {"name": "Test User", "email": email, "password": "Secure1!", "currency_default": "UYU"}
        client.post(REG, json=payload)
        r = client.post(REG, json=payload)
        assert r.status_code == 409

    def test_register_seeds_categories_and_concepts(self, client, auth_headers):
        """Al registrarse se crean 10 categorías y 30 conceptos semilla."""
        c = client
        cats = c.get(f"{BASE}/categories", headers=auth_headers).json()
        concepts = c.get(f"{BASE}/concepts", headers=auth_headers).json()
        assert len(cats) == 10
        assert len(concepts) == 30

    def test_register_invalid_password_missing(self, client):
        r = client.post(REG, json={"name": "X", "email": next_email(), "currency_default": "UYU"})
        assert r.status_code == 422


class TestLogin:
    def test_login_ok(self, client, registered_user):
        r = client.post(LOG, data={
            "username": registered_user["email"],
            "password": registered_user["password"],
        })
        assert r.status_code == 200
        assert "access_token" in r.json()

    def test_login_wrong_password(self, client, registered_user):
        r = client.post(LOG, data={
            "username": registered_user["email"],
            "password": "WrongPass999!",
        })
        assert r.status_code == 401

    def test_login_unknown_email(self, client):
        r = client.post(LOG, data={"username": "nobody@example.com", "password": "Pass1!"})
        assert r.status_code == 401


class TestMe:
    def test_get_me_ok(self, client, registered_user, auth_headers):
        r = client.get(f"{BASE}/users/me", headers=auth_headers)
        assert r.status_code == 200
        body = r.json()
        assert body["email"] == registered_user["email"]
        assert body["name"] == registered_user["name"]

    def test_get_me_without_token(self, client):
        r = client.get(f"{BASE}/users/me")
        assert r.status_code == 401

    def test_update_name(self, client, auth_headers):
        r = client.patch(f"{BASE}/users/me", json={"name": "Nuevo Nombre"}, headers=auth_headers)
        assert r.status_code == 200
        assert r.json()["name"] == "Nuevo Nombre"

    def test_change_password(self, client, registered_user, auth_headers):
        r = client.patch(f"{BASE}/users/me", json={
            "current_password": registered_user["password"],
            "new_password": "NuevaClave9!",
        }, headers=auth_headers)
        assert r.status_code == 200
        # Verificar que el nuevo password funciona
        r2 = client.post(LOG, data={
            "username": registered_user["email"],
            "password": "NuevaClave9!",
        })
        assert r2.status_code == 200

    def test_change_password_wrong_current(self, client, auth_headers):
        r = client.patch(f"{BASE}/users/me", json={
            "current_password": "Incorrecto999!",
            "new_password": "NuevaClave9!",
        }, headers=auth_headers)
        assert r.status_code == 401
