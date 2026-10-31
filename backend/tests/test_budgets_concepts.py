"""Presupuestos por categoría o por concepto, y guardado en bloque (copia de un mes)."""
import uuid
from datetime import date

from tests.conftest import BASE, expense_category

BUD = f"{BASE}/budgets"
TODAY = date.today()


def _account(c, h):
    r = c.post(f"{BASE}/accounts", json={"name": f"Cta {uuid.uuid4().hex[:6]}", "type": "cash",
                                          "currency": "UYU", "balance": "100000.00"}, headers=h)
    assert r.status_code == 201, r.text
    return r.json()["id"]


def _concept(c, h, cat):
    r = c.post(f"{BASE}/concepts", json={"name": f"Concepto {uuid.uuid4().hex[:6]}", "category_id": cat}, headers=h)
    assert r.status_code == 201, r.text
    return r.json()["id"]


def _expense(c, h, acc, concept, amount):
    r = c.post(f"{BASE}/transactions", json={"amount": amount, "type": "expense", "date": TODAY.isoformat(),
                                             "account_id": acc, "concept_id": concept}, headers=h)
    assert r.status_code == 201, r.text


def _setup(authed):
    c, h = authed
    cat = expense_category(c, h)
    super_ = _concept(c, h, cat)
    feria = _concept(c, h, cat)
    acc = _account(c, h)
    _expense(c, h, acc, super_, "300.00")
    _expense(c, h, acc, feria, "200.00")
    return c, h, cat, super_, feria


def _period():
    return {"month": TODAY.month, "year": TODAY.year, "currency": "UYU"}


class TestBudgetScope:
    def test_category_budget_sums_all_concepts(self, authed):
        c, h, cat, _, _ = _setup(authed)
        r = c.post(BUD, json={"category_id": cat, "max_amount": "1000", **_period()}, headers=h)
        assert r.status_code == 201, r.text
        body = r.json()
        assert body["concept_id"] is None and body["concept_name"] is None
        assert float(body["spent"]) == 500.0

    def test_concept_budget_counts_only_that_concept(self, authed):
        c, h, cat, super_, _ = _setup(authed)
        r = c.post(BUD, json={"category_id": cat, "concept_id": super_, "max_amount": "400", **_period()}, headers=h)
        assert r.status_code == 201, r.text
        body = r.json()
        assert body["concept_id"] == super_
        assert body["concept_name"]
        assert body["category_id"] == cat
        assert float(body["spent"]) == 300.0

    def test_category_and_concept_budgets_coexist(self, authed):
        c, h, cat, super_, feria = _setup(authed)
        assert c.post(BUD, json={"category_id": cat, "max_amount": "1000", **_period()}, headers=h).status_code == 201
        assert c.post(BUD, json={"category_id": cat, "concept_id": super_, "max_amount": "400", **_period()},
                      headers=h).status_code == 201
        assert c.post(BUD, json={"category_id": cat, "concept_id": feria, "max_amount": "250", **_period()},
                      headers=h).status_code == 201
        # duplicados siguen bloqueados en cada nivel
        assert c.post(BUD, json={"category_id": cat, "max_amount": "1", **_period()}, headers=h).status_code == 409
        assert c.post(BUD, json={"category_id": cat, "concept_id": super_, "max_amount": "1", **_period()},
                      headers=h).status_code == 409
        assert len(c.get(BUD, params={"month": TODAY.month, "year": TODAY.year}, headers=h).json()) == 3

    def test_concept_of_other_user_rejected(self, authed, client):
        c, h, cat, super_, _ = _setup(authed)
        r = c.post(f"{BASE}/users/register", json={"name": "Otro", "email": f"o{uuid.uuid4().hex[:6]}@x.com",
                                                    "password": "Test1234!"})
        assert r.status_code == 201
        tok = c.post(f"{BASE}/auth/login", data={"username": r.json()["email"], "password": "Test1234!"}).json()
        h2 = {"Authorization": f"Bearer {tok['access_token']}"}
        other_cat = expense_category(c, h2)
        r = c.post(BUD, json={"category_id": other_cat, "concept_id": super_, "max_amount": "10", **_period()},
                   headers=h2)
        assert r.status_code == 404


class TestBudgetBulk:
    def test_copy_month_with_edits_and_upsert(self, authed):
        c, h, cat, super_, _ = _setup(authed)
        # Mes origen: uno de categoría y uno de concepto
        src = {"month": 1, "year": 2026, "currency": "UYU"}
        c.post(BUD, json={"category_id": cat, "max_amount": "1000", **src}, headers=h)
        c.post(BUD, json={"category_id": cat, "concept_id": super_, "max_amount": "400", **src}, headers=h)
        # Destino ya tiene el de categoría con otro monto: se actualiza, no se duplica
        c.post(BUD, json={"category_id": cat, "max_amount": "50", "month": 2, "year": 2026, "currency": "UYU"},
               headers=h)

        source = c.get(BUD, params={"month": 1, "year": 2026}, headers=h).json()
        items = [{"category_id": b["category_id"], "concept_id": b["concept_id"], "currency": b["currency"],
                  "max_amount": "1200" if b["concept_id"] is None else b["max_amount"]} for b in source]
        r = c.post(f"{BUD}/bulk", json={"month": 2, "year": 2026, "items": items}, headers=h)
        assert r.status_code == 200, r.text
        assert len(r.json()) == 2

        dest = c.get(BUD, params={"month": 2, "year": 2026}, headers=h).json()
        assert len(dest) == 2
        by_kind = {b["concept_id"]: float(b["max_amount"]) for b in dest}
        assert by_kind[None] == 1200.0
        assert by_kind[super_] == 400.0
        # el origen no cambia
        src_after = {b["concept_id"]: float(b["max_amount"]) for b in
                     c.get(BUD, params={"month": 1, "year": 2026}, headers=h).json()}
        assert src_after[None] == 1000.0

    def test_bulk_is_all_or_nothing(self, authed):
        c, h, cat, _, _ = _setup(authed)
        items = [{"category_id": cat, "max_amount": "100", "currency": "UYU"},
                 {"category_id": cat, "concept_id": str(uuid.uuid4()), "max_amount": "100", "currency": "UYU"}]
        r = c.post(f"{BUD}/bulk", json={"month": 5, "year": 2026, "items": items}, headers=h)
        assert r.status_code == 404
        assert c.get(BUD, params={"month": 5, "year": 2026}, headers=h).json() == []

    def test_bulk_validates_amounts(self, authed):
        c, h, cat, _, _ = _setup(authed)
        r = c.post(f"{BUD}/bulk", json={"month": 5, "year": 2026,
                                        "items": [{"category_id": cat, "max_amount": "0", "currency": "UYU"}]},
                   headers=h)
        assert r.status_code == 422


class TestBudgetMultiCategory:
    def test_multi_category_budget_sums_both(self, authed):
        c, h = authed
        cats = c.get(f"{BASE}/categories", headers=h).json()
        expense_cats = [x for x in cats if not x.get("is_system")][:2]
        assert len(expense_cats) >= 2, "Need at least 2 categories"
        cat1, cat2 = expense_cats[0], expense_cats[1]
        con1 = _concept(c, h, cat1["id"])
        con2 = _concept(c, h, cat2["id"])
        acc = _account(c, h)
        _expense(c, h, acc, con1, "400.00")
        _expense(c, h, acc, con2, "600.00")
        r = c.post(BUD, json={"category_id": cat1["id"], "extra_category_ids": [cat2["id"]],
                               "name": "Casa y comida", "max_amount": "2000", **_period()}, headers=h)
        assert r.status_code == 201, r.text
        body = r.json()
        assert body["extra_category_ids"] == [cat2["id"]]
        assert body["extra_category_names"] == [cat2["name"]]
        assert body["name"] == "Casa y comida"
        assert float(body["spent"]) == 1000.0  # 400 + 600

    def test_multi_category_no_overlap(self, authed):
        c, h = authed
        cats = c.get(f"{BASE}/categories", headers=h).json()
        expense_cats = [x for x in cats if not x.get("is_system")][:2]
        cat1, cat2 = expense_cats[0], expense_cats[1]
        r = c.post(BUD, json={"category_id": cat1["id"], "extra_category_ids": [cat2["id"]],
                               "max_amount": "2000", **_period()}, headers=h)
        assert r.status_code == 201
        # Otro presupuesto que incluye cat1 → rechazado
        r = c.post(BUD, json={"category_id": cat1["id"], "max_amount": "500", **_period()}, headers=h)
        assert r.status_code == 409, r.text

    def test_multi_category_copied_in_bulk(self, authed):
        c, h = authed
        cats = c.get(f"{BASE}/categories", headers=h).json()
        expense_cats = [x for x in cats if not x.get("is_system")][:2]
        cat1, cat2 = expense_cats[0], expense_cats[1]
        src = {"month": 3, "year": 2026, "currency": "UYU"}
        c.post(BUD, json={"category_id": cat1["id"], "extra_category_ids": [cat2["id"]],
                           "name": "Grupo", "max_amount": "5000", **src}, headers=h)
        source = c.get(BUD, params={"month": 3, "year": 2026}, headers=h).json()
        items = [{"category_id": b["category_id"], "extra_category_ids": b["extra_category_ids"],
                  "concept_id": b["concept_id"], "name": b["name"], "currency": b["currency"],
                  "max_amount": "6000"} for b in source]
        r = c.post(f"{BUD}/bulk", json={"month": 4, "year": 2026, "items": items}, headers=h)
        assert r.status_code == 200, r.text
        dest = c.get(BUD, params={"month": 4, "year": 2026}, headers=h).json()
        assert len(dest) == 1
        assert dest[0]["extra_category_ids"] == [cat2["id"]]
        assert dest[0]["name"] == "Grupo"
        assert float(dest[0]["max_amount"]) == 6000.0
