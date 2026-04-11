"""Tests de categorías."""
import pytest
from tests.conftest import BASE


class TestCreateCategory:
    def test_create_ok(self, authed):
        c, h = authed
        r = c.post(f"{BASE}/categories", json={
            "name": "tecnologia", "icon": "laptop", "color": "#6366F1",
        }, headers=h)
        assert r.status_code == 201
        body = r.json()
        # normalize_category hace TitleCase
        assert body["name"] == "Tecnologia"
        assert "slug" in body

    def test_slug_generated_from_name(self, authed):
        c, h = authed
        r = c.post(f"{BASE}/categories", json={"name": "Hogar Y Construcción"}, headers=h)
        assert r.status_code == 201
        slug = r.json()["slug"]
        assert "hogar" in slug

    def test_duplicate_name_409(self, authed):
        c, h = authed
        payload = {"name": "Viajes", "icon": "plane"}
        c.post(f"{BASE}/categories", json=payload, headers=h)
        r = c.post(f"{BASE}/categories", json=payload, headers=h)
        assert r.status_code == 409

    def test_name_too_short(self, authed):
        c, h = authed
        r = c.post(f"{BASE}/categories", json={"name": "X"}, headers=h)
        assert r.status_code == 422


class TestGetCategories:
    def test_list_includes_seeds(self, authed):
        c, h = authed
        r = c.get(f"{BASE}/categories", headers=h)
        assert r.status_code == 200
        cats = r.json()
        assert len(cats) >= 10  # semilla

    def test_get_by_id(self, authed):
        c, h = authed
        cats = c.get(f"{BASE}/categories", headers=h).json()
        cat_id = cats[0]["id"]
        r = c.get(f"{BASE}/categories/{cat_id}", headers=h)
        assert r.status_code == 200
        assert r.json()["id"] == cat_id

    def test_get_nonexistent(self, authed):
        c, h = authed
        r = c.get(f"{BASE}/categories/00000000-0000-0000-0000-000000000000", headers=h)
        assert r.status_code == 404


class TestUpdateCategory:
    def test_update_name_and_slug(self, authed):
        c, h = authed
        r = c.post(f"{BASE}/categories", json={"name": "Deporte"}, headers=h)
        cat_id = r.json()["id"]
        r2 = c.patch(f"{BASE}/categories/{cat_id}", json={"name": "Deporte Y Fitness"}, headers=h)
        assert r2.status_code == 200
        body = r2.json()
        assert body["name"] == "Deporte Y Fitness"
        # slug debe actualizarse
        assert "deporte" in body["slug"]

    def test_cannot_modify_system_category(self, authed):
        c, h = authed
        cats = c.get(f"{BASE}/categories", headers=h).json()
        sys_cat = next((x for x in cats if x.get("is_system")), None)
        if not sys_cat:
            pytest.skip("No hay categoría de sistema en el seed")
        r = c.patch(f"{BASE}/categories/{sys_cat['id']}", json={"name": "Hackeado"}, headers=h)
        assert r.status_code == 403


class TestDeleteCategory:
    def test_delete_custom_category_no_transactions(self, authed):
        c, h = authed
        r = c.post(f"{BASE}/categories", json={"name": "Temporal"}, headers=h)
        cat_id = r.json()["id"]
        r2 = c.delete(f"{BASE}/categories/{cat_id}", headers=h)
        assert r2.status_code == 204

    def test_cannot_delete_system_category(self, authed):
        c, h = authed
        cats = c.get(f"{BASE}/categories", headers=h).json()
        sys_cat = next((x for x in cats if x.get("is_system")), None)
        if not sys_cat:
            pytest.skip("No hay categoría de sistema en el seed")
        r = c.delete(f"{BASE}/categories/{sys_cat['id']}", headers=h)
        assert r.status_code == 403
