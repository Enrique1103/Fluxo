"""
Los 6 tipos de hogar (reparto equal/proportional × nivel expenses_only/expenses_and_goals/full)
con 3 miembros y gastos/ingresos reales. Verifica el reparto, la liquidación y qué datos
ve cada nivel.
"""
from datetime import date
from decimal import Decimal

import pytest

from tests.conftest import BASE, any_concept
from tests.test_households import _register_and_login

HH = f"{BASE}/households"
TX = f"{BASE}/transactions"
TODAY = date.today()


def _user(c, h, income: str):
    acc = c.post(f"{BASE}/accounts", json={"name": "Caja", "type": "cash", "currency": "UYU", "balance": "100000"}, headers=h).json()
    concept = any_concept(c, h)
    if Decimal(income) > 0:
        r = c.post(TX, json={"account_id": acc["id"], "concept_id": concept["id"], "category_id": concept["category_id"],
                             "amount": income, "type": "income", "date": str(TODAY)}, headers=h)
        assert r.status_code == 201, r.text
    return acc, concept


def _shared_expense(c, h, acc, concept, hh_id, amount):
    r = c.post(TX, json={"account_id": acc["id"], "concept_id": concept["id"], "category_id": concept["category_id"],
                         "amount": amount, "type": "expense", "date": str(TODAY), "household_ids": [hh_id]}, headers=h)
    assert r.status_code == 201, r.text
    assert r.json()["household_ids"] == [hh_id]


@pytest.fixture
def make_household(authed):
    """
    Crea un hogar del tipo pedido con 3 miembros:
      A (admin): ingreso 60.000, paga 900 de gastos compartidos
      B:         ingreso 30.000, paga 100
      C:         ingreso 10.000, no paga nada
    Total compartido = 1.000.
    """
    c, ha = authed

    def _make(split_type, level):
        hh = c.post(HH, json={"name": f"{split_type}-{level}", "base_currency": "UYU",
                              "split_type": split_type, "analysis_level": level}, headers=ha).json()
        users = {"A": ha}
        for name in ("B", "C"):
            h = _register_and_login(c)
            code = c.post(f"{HH}/{hh['id']}/invite", headers=ha).json()["code"]
            m = c.post(f"{HH}/join", json={"code": code}, headers=h).json()
            assert c.post(f"{HH}/{hh['id']}/members/{m['user_id']}/approve", headers=ha).status_code == 200
            users[name] = h
        ids = {}
        for name, income, paid in (("A", "60000", "900"), ("B", "30000", "100"), ("C", "10000", None)):
            h = users[name]
            acc, concept = _user(c, h, income)
            if paid:
                _shared_expense(c, h, acc, concept, hh["id"], paid)
            ids[name] = c.get(f"{BASE}/users/me", headers=h).json()["id"]
        body = c.get(f"{HH}/{hh['id']}/analytics", params={"year": TODAY.year, "month": TODAY.month}, headers=ha)
        assert body.status_code == 200, body.text
        return c, users, ids, hh, body.json()

    return _make


def _members(body):
    return {m["user_id"]: m for m in body["members"]}


def _settled(body, ids):
    """Saldo final de cada uno después de aplicar la liquidación (debe quedar en 0)."""
    bal = {uid: Decimal(m["balance"]) for uid, m in _members(body).items()}
    for s in body["settlement"]:
        bal[s["from_user_id"]] += Decimal(s["amount"])
        bal[s["to_user_id"]] -= Decimal(s["amount"])
    return bal


@pytest.mark.parametrize("level", ["expenses_only", "expenses_and_goals", "full"])
def test_equal_split(make_household, level):
    c, users, ids, hh, body = make_household("equal", level)
    m = _members(body)
    assert Decimal(body["total_shared"]) == Decimal("1000.00")
    should = sorted(Decimal(x["should_pay"]) for x in m.values())
    assert should == [Decimal("333.33"), Decimal("333.33"), Decimal("333.34")]  # suma exacta 1.000
    assert sum(should) == Decimal("1000.00")
    assert all(v == 0 for v in _settled(body, ids).values())
    # C no pagó nada → debe; A pagó de más → cobra
    assert Decimal(m[ids["C"]]["balance"]) < 0 < Decimal(m[ids["A"]]["balance"])
    if level != "full":
        # En partes iguales el % de ingreso de cada uno no se expone
        assert all(Decimal(x["income_pct"]) == 0 for x in m.values())


@pytest.mark.parametrize("level", ["expenses_only", "expenses_and_goals", "full"])
def test_proportional_split(make_household, level):
    c, users, ids, hh, body = make_household("proportional", level)
    m = _members(body)
    # Ingresos 60/30/10 → paga 600 / 300 / 100 de los 1.000
    assert Decimal(m[ids["A"]]["should_pay"]) == Decimal("600.00")
    assert Decimal(m[ids["B"]]["should_pay"]) == Decimal("300.00")
    assert Decimal(m[ids["C"]]["should_pay"]) == Decimal("100.00")
    assert Decimal(m[ids["A"]]["income_pct"]) == Decimal("60.00")
    assert all(v == 0 for v in _settled(body, ids).values())
    # B pagó 100 y debía 300 → debe 200; C debe 100; A cobra 300
    assert Decimal(m[ids["B"]]["balance"]) == Decimal("-200.00")
    assert Decimal(m[ids["A"]]["balance"]) == Decimal("300.00")


@pytest.mark.parametrize("split", ["equal", "proportional"])
@pytest.mark.parametrize("level,sees_incomes", [("expenses_only", False), ("expenses_and_goals", False), ("full", True)])
def test_level_visibility(make_household, split, level, sees_incomes):
    c, users, ids, hh, body = make_household(split, level)
    assert body["analysis_level"] == level
    if sees_incomes:
        assert Decimal(body["total_group_income"]) == Decimal("100000.00")
        assert Decimal(body["net_savings"]) == Decimal("99000.00")
        assert {x["user_id"] for x in body["member_incomes"]} == set(ids.values())
        # FULL ve los movimientos de todos los miembros (3 ingresos + 2 gastos)
        assert len(body["member_transactions"]) == 5
    else:
        assert body["member_incomes"] is None
        assert body["total_group_income"] is None
        assert body["net_savings"] is None
        assert body["member_transactions"] is None


def test_every_member_sees_the_same_settlement(make_household):
    c, users, ids, hh, body_a = make_household("proportional", "expenses_only")
    for name in ("B", "C"):
        body = c.get(f"{HH}/{hh['id']}/analytics", params={"year": TODAY.year, "month": TODAY.month}, headers=users[name]).json()
        assert body["settlement"] == body_a["settlement"]


def test_member_can_leave_and_stops_counting(make_household):
    c, users, ids, hh, _ = make_household("equal", "expenses_only")
    # B sale del hogar por su cuenta
    assert c.delete(f"{HH}/{hh['id']}/members/{ids['B']}", headers=users["B"]).status_code == 204
    body = c.get(f"{HH}/{hh['id']}/analytics", params={"year": TODAY.year, "month": TODAY.month}, headers=users["A"]).json()
    assert set(_members(body)) == {ids["A"], ids["C"]}
    # El gasto de B ya no entra: total 900 repartido entre A y C, y la lista coincide con el total
    assert Decimal(body["total_shared"]) == Decimal("900.00")
    assert sum(Decimal(e["amount"]) for e in body["shared_expenses"]) == Decimal("900.00")
    assert sum(Decimal(x["total"]) for x in body["expense_by_category"]) == Decimal("900.00")


def test_last_admin_cannot_leave(make_household):
    c, users, ids, hh, _ = make_household("equal", "expenses_only")
    r = c.delete(f"{HH}/{hh['id']}/members/{ids['A']}", headers=users["A"])
    assert r.status_code in (400, 409, 422)


def test_member_cannot_remove_others(make_household):
    c, users, ids, hh, _ = make_household("equal", "expenses_only")
    r = c.delete(f"{HH}/{hh['id']}/members/{ids['C']}", headers=users["B"])
    assert r.status_code == 403
