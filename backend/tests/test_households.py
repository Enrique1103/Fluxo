"""Tests de hogares (households)."""
import pytest
from datetime import date
from tests.conftest import BASE, next_email

HH  = f"{BASE}/households"
TODAY = date.today()


def _register_and_login(client) -> dict:
    """Registra un nuevo usuario y devuelve sus headers de auth."""
    email = next_email()
    client.post(f"{BASE}/users/register", json={
        "name": "Otro Usuario", "email": email,
        "password": "Test1234!", "currency_default": "UYU",
    })
    r = client.post(f"{BASE}/auth/login",
                    data={"username": email, "password": "Test1234!"})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def _hh():
    return {"name": "Hogar Test", "base_currency": "UYU", "split_type": "equal"}


@pytest.fixture
def household(authed):
    c, h = authed
    r = c.post(HH, json=_hh(), headers=h)
    assert r.status_code == 201, r.text
    return c, h, r.json()["id"]


@pytest.fixture
def with_invite(household):
    c, h, hh_id = household
    r = c.post(f"{HH}/{hh_id}/invite", headers=h)
    assert r.status_code == 200, r.text
    return c, h, hh_id, r.json()["code"]


class TestHouseholdCreate:
    def test_create_201(self, authed):
        c, h = authed
        r = c.post(HH, json=_hh(), headers=h)
        assert r.status_code == 201
        body = r.json()
        assert body["name"] == "Hogar Test"
        assert body["base_currency"] == "UYU"

    def test_list_includes_created(self, authed):
        c, h = authed
        c.post(HH, json=_hh(), headers=h)
        r = c.get(HH, headers=h)
        assert r.status_code == 200
        assert len(r.json()) >= 1


class TestInvite:
    def test_generate_invite_returns_code(self, household):
        c, h, hh_id = household
        r = c.post(f"{HH}/{hh_id}/invite", headers=h)
        assert r.status_code == 200
        assert "code" in r.json()
        assert len(r.json()["code"]) > 0

    def test_join_valid_code_pending(self, with_invite):
        c, h, hh_id, code = with_invite
        h2 = _register_and_login(c)
        r = c.post(f"{HH}/join", json={"code": code}, headers=h2)
        assert r.status_code == 201
        assert r.json()["status"] == "pending"

    def test_join_invalid_code_error(self, authed):
        c, h = authed
        r = c.post(f"{HH}/join", json={"code": "INVALIDO-0000"}, headers=h)
        assert r.status_code in (404, 410, 422)


class TestMemberManagement:
    def test_admin_approves_pending_member(self, with_invite):
        c, h, hh_id, code = with_invite
        h2 = _register_and_login(c)
        member = c.post(f"{HH}/join", json={"code": code}, headers=h2).json()
        user2_id = member["user_id"]

        r = c.post(f"{HH}/{hh_id}/members/{user2_id}/approve", headers=h)
        assert r.status_code == 200
        assert r.json()["status"] == "active"

    def test_non_member_cannot_approve_403(self, with_invite):
        c, h, hh_id, code = with_invite
        h2 = _register_and_login(c)
        member = c.post(f"{HH}/join", json={"code": code}, headers=h2).json()
        user2_id = member["user_id"]

        h3 = _register_and_login(c)   # tercero: no pertenece al hogar
        r = c.post(f"{HH}/{hh_id}/members/{user2_id}/approve", headers=h3)
        assert r.status_code == 403

    def test_admin_removes_member_204(self, with_invite):
        c, h, hh_id, code = with_invite
        h2 = _register_and_login(c)
        member = c.post(f"{HH}/join", json={"code": code}, headers=h2).json()
        user2_id = member["user_id"]

        r = c.delete(f"{HH}/{hh_id}/members/{user2_id}", headers=h)
        assert r.status_code == 204

    def test_non_admin_cannot_remove_403(self, with_invite):
        c, h, hh_id, code = with_invite
        h2 = _register_and_login(c)
        member = c.post(f"{HH}/join", json={"code": code}, headers=h2).json()
        user2_id = member["user_id"]
        # Aprobamos al miembro para que sea activo
        c.post(f"{HH}/{hh_id}/members/{user2_id}/approve", headers=h)

        # Generar nueva invitación y unir al tercero
        code2 = c.post(f"{HH}/{hh_id}/invite", headers=h).json()["code"]
        h3 = _register_and_login(c)
        member3 = c.post(f"{HH}/join", json={"code": code2}, headers=h3).json()
        user3_id = member3["user_id"]

        # h2 (no admin) intenta eliminar a h3
        r = c.delete(f"{HH}/{hh_id}/members/{user3_id}", headers=h2)
        assert r.status_code == 403


class TestHouseholdAnalytics:
    def test_analytics_returns_valid_structure(self, household):
        c, h, hh_id = household
        r = c.get(f"{HH}/{hh_id}/analytics",
                  params={"year": TODAY.year, "month": TODAY.month}, headers=h)
        assert r.status_code == 200
        body = r.json()
        assert "members" in body
        assert "settlement" in body
        assert "shared_expenses" in body

    def test_analytics_non_member_403(self, household):
        c, h, hh_id = household
        h2 = _register_and_login(c)
        r = c.get(f"{HH}/{hh_id}/analytics",
                  params={"year": TODAY.year, "month": TODAY.month}, headers=h2)
        assert r.status_code == 403
