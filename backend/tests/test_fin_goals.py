"""Tests de metas financieras."""
import pytest
from tests.conftest import BASE


@pytest.fixture
def goal_payload():
    return {
        "name": "Fondo de emergencia",
        "target_amount": "100000.00",
        "allocation_pct": "20.00",
    }


class TestCreateFinGoal:
    def test_create_ok(self, authed, goal_payload):
        c, h = authed
        r = c.post(f"{BASE}/fin-goals", json=goal_payload, headers=h)
        assert r.status_code == 201
        body = r.json()
        assert "id" in body
        assert body["allocation_pct"] == "20.00"
        assert "current_amount" in body
        assert "is_completed" in body

    def test_current_amount_reflects_account_balance(self, authed, cash_account):
        """
        current_amount = 30% del patrimonio total.
        Si hay 10000 en efectivo y allocation_pct=30%, current_amount = 3000.
        """
        c, h = authed
        r = c.post(f"{BASE}/fin-goals", json={
            "name": "Meta 30%",
            "target_amount": "999999.00",
            "allocation_pct": "30.00",
        }, headers=h)
        assert r.status_code == 201
        current = float(r.json()["current_amount"])
        # 30% de 10000 (saldo efectivo) = 3000
        assert current == pytest.approx(3000.00, abs=1.0)

    def test_allocation_exceeds_100_422(self, authed):
        c, h = authed
        # Crear meta con 60%
        c.post(f"{BASE}/fin-goals", json={
            "name": "Meta grande", "target_amount": "1000.00", "allocation_pct": "60.00",
        }, headers=h)
        # Intentar otra con 60% (total = 120% → 422)
        r = c.post(f"{BASE}/fin-goals", json={
            "name": "Meta imposible", "target_amount": "1000.00", "allocation_pct": "60.00",
        }, headers=h)
        assert r.status_code == 422

    def test_allocation_exactly_100_ok(self, authed):
        c, h = authed
        c.post(f"{BASE}/fin-goals", json={
            "name": "Primera", "target_amount": "1000.00", "allocation_pct": "50.00",
        }, headers=h)
        r = c.post(f"{BASE}/fin-goals", json={
            "name": "Segunda", "target_amount": "1000.00", "allocation_pct": "50.00",
        }, headers=h)
        assert r.status_code == 201

    def test_zero_amount_422(self, authed):
        c, h = authed
        r = c.post(f"{BASE}/fin-goals", json={
            "name": "Mala", "target_amount": "0.00", "allocation_pct": "10.00",
        }, headers=h)
        assert r.status_code == 422


class TestGetFinGoals:
    def test_list_empty(self, authed):
        c, h = authed
        r = c.get(f"{BASE}/fin-goals", headers=h)
        assert r.status_code == 200
        assert r.json() == []

    def test_list_after_create(self, authed, goal_payload):
        c, h = authed
        c.post(f"{BASE}/fin-goals", json=goal_payload, headers=h)
        r = c.get(f"{BASE}/fin-goals", headers=h)
        assert len(r.json()) == 1

    def test_get_by_id(self, authed, goal_payload):
        c, h = authed
        gid = c.post(f"{BASE}/fin-goals", json=goal_payload, headers=h).json()["id"]
        r = c.get(f"{BASE}/fin-goals/{gid}", headers=h)
        assert r.status_code == 200
        assert r.json()["id"] == gid

    def test_get_nonexistent_404(self, authed):
        c, h = authed
        r = c.get(f"{BASE}/fin-goals/00000000-0000-0000-0000-000000000000", headers=h)
        assert r.status_code == 404


class TestUpdateFinGoal:
    def test_update_name(self, authed, goal_payload):
        c, h = authed
        gid = c.post(f"{BASE}/fin-goals", json=goal_payload, headers=h).json()["id"]
        r = c.patch(f"{BASE}/fin-goals/{gid}", json={"name": "Nuevo nombre"}, headers=h)
        assert r.status_code == 200
        assert r.json()["name"] == "Nuevo nombre"

    def test_update_allocation_respects_total(self, authed):
        c, h = authed
        # Dos metas: 40% + 40% = 80%
        g1 = c.post(f"{BASE}/fin-goals", json={
            "name": "G1", "target_amount": "1000.00", "allocation_pct": "40.00",
        }, headers=h).json()
        c.post(f"{BASE}/fin-goals", json={
            "name": "G2", "target_amount": "1000.00", "allocation_pct": "40.00",
        }, headers=h)
        # Intentar subir G1 a 70% (total sería 110%) → 422
        r = c.patch(f"{BASE}/fin-goals/{g1['id']}", json={"allocation_pct": "70.00"}, headers=h)
        assert r.status_code == 422


class TestDeleteFinGoal:
    def test_delete_ok(self, authed, goal_payload):
        c, h = authed
        gid = c.post(f"{BASE}/fin-goals", json=goal_payload, headers=h).json()["id"]
        r = c.delete(f"{BASE}/fin-goals/{gid}", headers=h)
        assert r.status_code == 204
        # Ya no aparece en la lista
        goals = c.get(f"{BASE}/fin-goals", headers=h).json()
        assert not any(g["id"] == gid for g in goals)

    def test_delete_nonexistent_404(self, authed):
        c, h = authed
        r = c.delete(f"{BASE}/fin-goals/00000000-0000-0000-0000-000000000000", headers=h)
        assert r.status_code == 404
