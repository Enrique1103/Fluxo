"""Tests de conceptos."""
import pytest
from tests.conftest import BASE


class TestCreateConcept:
    def test_create_normalizes_to_uppercase(self, authed):
        c, h = authed
        r = c.post(f"{BASE}/concepts", json={"name": "netflix"}, headers=h)
        # "netflix" ya existe en el seed — debería dar 409
        # (porque normalize_concept → "NETFLIX" y "NETFLIX" está en el seed)
        assert r.status_code == 409

    def test_create_unique_concept_ok(self, authed):
        c, h = authed
        r = c.post(f"{BASE}/concepts", json={"name": "mi concepto unico xyz"}, headers=h)
        assert r.status_code == 201
        assert r.json()["name"] == "MI CONCEPTO UNICO XYZ"

    def test_duplicate_concept_409(self, authed):
        c, h = authed
        c.post(f"{BASE}/concepts", json={"name": "concepto abc"}, headers=h)
        r = c.post(f"{BASE}/concepts", json={"name": "CONCEPTO ABC"}, headers=h)
        assert r.status_code == 409

    def test_name_too_short(self, authed):
        c, h = authed
        r = c.post(f"{BASE}/concepts", json={"name": "X"}, headers=h)
        assert r.status_code == 422


class TestGetConcepts:
    def test_list_includes_seeds(self, authed):
        c, h = authed
        r = c.get(f"{BASE}/concepts", headers=h)
        assert r.status_code == 200
        assert len(r.json()) >= 30

    def test_category_id_filter_fallback_when_no_history(self, authed):
        """
        GET /concepts?category_id= sin historial de transacciones devuelve
        todos los conceptos como fallback.
        """
        c, h = authed
        cats = c.get(f"{BASE}/categories", headers=h).json()
        cat_id = cats[0]["id"]
        all_concepts = c.get(f"{BASE}/concepts", headers=h).json()
        filtered = c.get(f"{BASE}/concepts?category_id={cat_id}", headers=h).json()
        # Sin historial → fallback a todos
        assert len(filtered) == len(all_concepts)

    def test_get_by_id(self, authed):
        c, h = authed
        concepts = c.get(f"{BASE}/concepts", headers=h).json()
        cid = concepts[0]["id"]
        r = c.get(f"{BASE}/concepts/{cid}", headers=h)
        assert r.status_code == 200
        assert r.json()["id"] == cid

    def test_is_system_exposed_in_response(self, authed):
        """is_system se expone en ConceptResponse para que el frontend muestre el candado."""
        c, h = authed
        concepts = c.get(f"{BASE}/concepts", headers=h).json()
        assert concepts, "No hay conceptos"
        assert "is_system" in concepts[0]
        # Los conceptos del sistema deben tener is_system=True
        system_names = {"TRANSFERENCIA", "AJUSTE DE SALDO", "PAGO DE TARJETA"}
        sys_concepts = [x for x in concepts if x["name"] in system_names]
        assert sys_concepts, "Deben existir conceptos del sistema"
        assert all(x["is_system"] is True for x in sys_concepts)


class TestUpdateConcept:
    def test_update_normalizes_uppercase(self, authed):
        c, h = authed
        r = c.post(f"{BASE}/concepts", json={"name": "concepto test"}, headers=h)
        cid = r.json()["id"]
        r2 = c.patch(f"{BASE}/concepts/{cid}", json={"name": "concepto actualizado"}, headers=h)
        assert r2.status_code == 200
        assert r2.json()["name"] == "CONCEPTO ACTUALIZADO"

    def test_cannot_update_system_concept(self, authed):
        """Los conceptos del sistema no pueden renombrarse."""
        c, h = authed
        concepts = c.get(f"{BASE}/concepts", headers=h).json()
        # Buscar concepto del sistema — como is_system no viene en la respuesta,
        # usamos nombres conocidos del seed
        system_names = {"TRANSFERENCIA", "AJUSTE DE SALDO", "PAGO DE TARJETA"}
        sys_concept = next((x for x in concepts if x["name"] in system_names), None)
        if not sys_concept:
            pytest.skip("No se encontró concepto del sistema conocido")
        r = c.patch(f"{BASE}/concepts/{sys_concept['id']}", json={"name": "hackeado"}, headers=h)
        # El backend devuelve 403 para conceptos del sistema
        # Pero el frontend no puede saberlo de antemano (BUG: is_system falta en response)
        assert r.status_code == 403


class TestDeleteConcept:
    def test_delete_custom_concept(self, authed):
        c, h = authed
        r = c.post(f"{BASE}/concepts", json={"name": "borrar esto xyz"}, headers=h)
        cid = r.json()["id"]
        r2 = c.delete(f"{BASE}/concepts/{cid}", headers=h)
        assert r2.status_code == 204

    def test_cannot_delete_system_concept(self, authed):
        c, h = authed
        concepts = c.get(f"{BASE}/concepts", headers=h).json()
        system_names = {"TRANSFERENCIA", "AJUSTE DE SALDO", "PAGO DE TARJETA"}
        sys_concept = next((x for x in concepts if x["name"] in system_names), None)
        if not sys_concept:
            pytest.skip("No se encontró concepto del sistema")
        r = c.delete(f"{BASE}/concepts/{sys_concept['id']}", headers=h)
        assert r.status_code == 403
