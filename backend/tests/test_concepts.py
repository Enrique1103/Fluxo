"""Tests de conceptos."""
import pytest
from tests.conftest import BASE, expense_category


class TestCreateConcept:
    def test_create_normalizes_name_format(self, authed):
        c, h = authed
        r = c.post(f"{BASE}/concepts", json={"name": "netflix", "category_id": expense_category(c, h)}, headers=h)
        # "netflix" ya existe en el seed — debería dar 409
        # (porque normalize_concept → "NETFLIX" y "NETFLIX" está en el seed)
        assert r.status_code == 409

    def test_create_unique_concept_ok(self, authed):
        c, h = authed
        r = c.post(f"{BASE}/concepts", json={"name": "mi concepto unico xyz", "category_id": expense_category(c, h)}, headers=h)
        assert r.status_code == 201
        assert r.json()["name"] == "Mi Concepto Unico Xyz"

    def test_duplicate_concept_409(self, authed):
        c, h = authed
        c.post(f"{BASE}/concepts", json={"name": "concepto abc", "category_id": expense_category(c, h)}, headers=h)
        r = c.post(f"{BASE}/concepts", json={"name": "CONCEPTO ABC", "category_id": expense_category(c, h)}, headers=h)
        assert r.status_code == 409

    def test_create_requires_category(self, authed):
        c, h = authed
        r = c.post(f"{BASE}/concepts", json={"name": "sin categoria xyz"}, headers=h)
        assert r.status_code == 422

    def test_create_with_foreign_category_404(self, authed, client):
        c, h = authed
        r = c.post(f"{BASE}/concepts", json={"name": "ajeno xyz",
                   "category_id": "00000000-0000-0000-0000-000000000001"}, headers=h)
        assert r.status_code == 404

    def test_name_too_short(self, authed):
        c, h = authed
        r = c.post(f"{BASE}/concepts", json={"name": "X", "category_id": expense_category(c, h)}, headers=h)
        assert r.status_code == 422


class TestGetConcepts:
    def test_list_includes_seeds(self, authed):
        c, h = authed
        r = c.get(f"{BASE}/concepts", headers=h)
        assert r.status_code == 200
        assert len(r.json()) >= 30

    def test_category_id_filter(self, authed):
        """GET /concepts?category_id= devuelve solo los conceptos de esa categoría."""
        c, h = authed
        cats = c.get(f"{BASE}/categories", headers=h).json()
        cat_id = next(x["id"] for x in cats if x["name"] == "Alimentación")
        filtered = c.get(f"{BASE}/concepts?category_id={cat_id}", headers=h).json()
        assert filtered and all(x["category_id"] == cat_id for x in filtered)
        assert "Supermercado" in [x["name"] for x in filtered]

    def test_every_seed_concept_has_category(self, authed):
        c, h = authed
        assert all(x["category_id"] for x in c.get(f"{BASE}/concepts", headers=h).json())

    def test_type_filter_hides_expense_concepts_from_income(self, authed):
        c, h = authed
        income = [x["name"] for x in c.get(f"{BASE}/concepts?type=income", headers=h).json()]
        expense = [x["name"] for x in c.get(f"{BASE}/concepts?type=expense", headers=h).json()]
        assert "Sueldo Base" in income and "Supermercado" not in income
        assert "Supermercado" in expense and "Sueldo Base" not in expense
        # Las categorías "any" (ej: Regalos) aparecen en ambos
        assert "Cumpleaños" in income and "Cumpleaños" in expense

    def test_type_filter_invalid_422(self, authed):
        c, h = authed
        assert c.get(f"{BASE}/concepts?type=foo", headers=h).status_code == 422

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
        system_names = {"Transferencia", "Ajuste de Saldo", "Pago de Tarjeta"}
        sys_concepts = [x for x in concepts if x["name"] in system_names]
        assert sys_concepts, "Deben existir conceptos del sistema"
        assert all(x["is_system"] is True for x in sys_concepts)


class TestUpdateConcept:
    def test_update_normalizes_name_format(self, authed):
        c, h = authed
        r = c.post(f"{BASE}/concepts", json={"name": "concepto test", "category_id": expense_category(c, h)}, headers=h)
        cid = r.json()["id"]
        r2 = c.patch(f"{BASE}/concepts/{cid}", json={"name": "concepto actualizado"}, headers=h)
        assert r2.status_code == 200
        assert r2.json()["name"] == "Concepto Actualizado"

    def test_cannot_update_system_concept(self, authed):
        """Los conceptos del sistema no pueden renombrarse."""
        c, h = authed
        concepts = c.get(f"{BASE}/concepts", headers=h).json()
        # Buscar concepto del sistema — como is_system no viene en la respuesta,
        # usamos nombres conocidos del seed
        system_names = {"Transferencia", "Ajuste de Saldo", "Pago de Tarjeta"}
        sys_concept = next((x for x in concepts if x["name"] in system_names), None)
        if not sys_concept:
            pytest.skip("No se encontró concepto del sistema conocido")
        r = c.patch(f"{BASE}/concepts/{sys_concept['id']}", json={"name": "hackeado"}, headers=h)
        # El backend devuelve 403 para conceptos del sistema
        # Pero el frontend no puede saberlo de antemano (BUG: is_system falta en response)
        assert r.status_code == 403


    def test_move_concept_moves_its_transactions(self, authed, cash_account):
        c, h = authed
        cats = {x["name"]: x["id"] for x in c.get(f"{BASE}/categories", headers=h).json()}
        con = c.post(f"{BASE}/concepts", json={"name": "Kiosco", "category_id": cats["Alimentación"]}, headers=h).json()
        t = c.post(f"{BASE}/transactions", json={"account_id": cash_account["id"], "concept_id": con["id"],
                   "amount": "50.00", "type": "expense", "date": "2026-01-15"}, headers=h).json()
        assert t["category_id"] == cats["Alimentación"]
        r = c.patch(f"{BASE}/concepts/{con['id']}", json={"category_id": cats["Ocio"]}, headers=h)
        assert r.status_code == 200 and r.json()["category_id"] == cats["Ocio"]
        assert c.get(f"{BASE}/transactions/{t['id']}", headers=h).json()["category_id"] == cats["Ocio"]


class TestDeleteConcept:
    def test_delete_custom_concept(self, authed):
        c, h = authed
        r = c.post(f"{BASE}/concepts", json={"name": "borrar esto xyz", "category_id": expense_category(c, h)}, headers=h)
        cid = r.json()["id"]
        r2 = c.delete(f"{BASE}/concepts/{cid}", headers=h)
        assert r2.status_code == 204

    def test_cannot_delete_system_concept(self, authed):
        c, h = authed
        concepts = c.get(f"{BASE}/concepts", headers=h).json()
        system_names = {"Transferencia", "Ajuste de Saldo", "Pago de Tarjeta"}
        sys_concept = next((x for x in concepts if x["name"] in system_names), None)
        if not sys_concept:
            pytest.skip("No se encontró concepto del sistema")
        r = c.delete(f"{BASE}/concepts/{sys_concept['id']}", headers=h)
        assert r.status_code == 403
