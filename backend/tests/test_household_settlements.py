"""Balanceo del hogar: registrar el pago, confirmar que llegó, y reintegros."""
from datetime import date
from decimal import Decimal

import pytest

from tests.conftest import BASE
from tests.test_households import _register_and_login

HH = f"{BASE}/households"
TX = f"{BASE}/transactions"
TODAY = date.today()


def _acc(c, h, name="Caja", balance="10000"):
    r = c.post(f"{BASE}/accounts", json={"name": name, "type": "cash", "currency": "UYU", "balance": balance}, headers=h)
    assert r.status_code == 201, r.text
    return r.json()


def _concept(c, h, name):
    return next(x for x in c.get(f"{BASE}/concepts", headers=h).json() if x["name"] == name)


def _bal(c, h, acc_id):
    return Decimal(c.get(f"{BASE}/accounts/{acc_id}", headers=h).json()["balance"])


@pytest.fixture
def pair(authed):
    """Hogar de 2 (reparto igual). A paga 900 de súper compartido → B le debe 450 a A."""
    c, ha = authed
    hh = c.post(HH, json={"name": "Casa", "base_currency": "UYU", "split_type": "equal"}, headers=ha).json()
    hb = _register_and_login(c)
    code = c.post(f"{HH}/{hh['id']}/invite", headers=ha).json()["code"]
    m = c.post(f"{HH}/join", json={"code": code}, headers=hb).json()
    assert c.post(f"{HH}/{hh['id']}/members/{m['user_id']}/approve", headers=ha).status_code == 200
    acc_a, acc_b = _acc(c, ha), _acc(c, hb)
    r = c.post(TX, json={"account_id": acc_a["id"], "concept_id": _concept(c, ha, "Supermercado")["id"],
                         "amount": "900", "type": "expense", "date": str(TODAY), "household_ids": [hh["id"]]}, headers=ha)
    assert r.status_code == 201, r.text
    ids = {k: c.get(f"{BASE}/users/me", headers=h).json()["id"] for k, h in (("A", ha), ("B", hb))}
    return c, ha, hb, hh, acc_a, acc_b, ids


def _analytics(c, h, hh):
    r = c.get(f"{HH}/{hh['id']}/analytics", params={"year": TODAY.year, "month": TODAY.month}, headers=h)
    assert r.status_code == 200, r.text
    return r.json()


def _pay(c, hb, hh, acc_b, to, comment=None):
    return c.post(f"{HH}/{hh['id']}/settlements", json={
        "year": TODAY.year, "month": TODAY.month, "to_user_id": to,
        "account_id": acc_b["id"], "date": str(TODAY), "comment": comment,
    }, headers=hb)


def test_pay_and_confirm_settles_month(pair):
    c, ha, hb, hh, acc_a, acc_b, ids = pair
    body = _analytics(c, ha, hh)
    assert [(s["from_user_id"], s["to_user_id"], Decimal(s["amount"])) for s in body["settlement"]] == [
        (ids["B"], ids["A"], Decimal("450.00"))
    ]

    r = _pay(c, hb, hh, acc_b, ids["A"], comment="Balanceo octubre")
    assert r.status_code == 201, r.text
    assert _bal(c, hb, acc_b["id"]) == Decimal("9550.00")

    body = _analytics(c, ha, hh)
    assert body["settlement"] == []                       # la deuda quedó en cero
    [p] = body["settlement_payments"]
    assert p["confirmed"] is False and Decimal(p["amount"]) == Decimal("450.00")
    assert p["comment"] == "Balanceo octubre"

    # El balanceo no es gasto compartido: no cambia el total del hogar
    assert Decimal(body["total_shared"]) == Decimal("900.00")

    r = c.post(f"{HH}/{hh['id']}/settlements/{p['id']}/confirm", json={"account_id": acc_a["id"]}, headers=ha)
    assert r.status_code == 200, r.text
    assert _bal(c, ha, acc_a["id"]) == Decimal("9550.00")   # 10000 - 900 + 450
    assert _analytics(c, ha, hh)["settlement_payments"][0]["confirmed"] is True

    # A: el reintegro resta del gasto (gastó 900, le devolvieron 450 → 450) y no suma ingreso
    mb = c.get(f"{BASE}/analytics/monthly-breakdown", params={"year": TODAY.year, "month": TODAY.month}, headers=ha).json()
    assert mb["income"] == pytest.approx(0)
    assert mb["expenses"] == pytest.approx(450)
    # B: pagó 450 de balanceo como gasto
    mb_b = c.get(f"{BASE}/analytics/monthly-breakdown", params={"year": TODAY.year, "month": TODAY.month}, headers=hb).json()
    assert mb_b["expenses"] == pytest.approx(450)


def test_only_debtor_can_pay_and_only_creditor_can_confirm(pair):
    c, ha, hb, hh, acc_a, acc_b, ids = pair
    # A no le debe nada a B
    r = c.post(f"{HH}/{hh['id']}/settlements", json={
        "year": TODAY.year, "month": TODAY.month, "to_user_id": ids["B"],
        "account_id": acc_a["id"], "date": str(TODAY)}, headers=ha)
    assert r.status_code == 422
    assert _pay(c, hb, hh, acc_b, ids["A"]).status_code == 201
    # Pagar dos veces: ya no queda nada pendiente
    assert _pay(c, hb, hh, acc_b, ids["A"]).status_code == 422
    sid = _analytics(c, ha, hh)["settlement_payments"][0]["id"]
    # B no puede confirmar su propio pago, ni usar la cuenta de A
    assert c.post(f"{HH}/{hh['id']}/settlements/{sid}/confirm", json={"account_id": acc_b["id"]}, headers=hb).status_code == 422
    assert c.post(f"{HH}/{hh['id']}/settlements/{sid}/confirm", json={"account_id": acc_b["id"]}, headers=ha).status_code in (403, 404)
    assert c.post(f"{HH}/{hh['id']}/settlements/{sid}/confirm", json={"account_id": acc_a["id"]}, headers=ha).status_code == 200
    assert c.post(f"{HH}/{hh['id']}/settlements/{sid}/confirm", json={"account_id": acc_a["id"]}, headers=ha).status_code == 422


def test_deleting_payment_reopens_debt(pair):
    c, ha, hb, hh, acc_a, acc_b, ids = pair
    assert _pay(c, hb, hh, acc_b, ids["A"]).status_code == 201
    tx = next(t for t in c.get(TX, headers=hb).json() if t["type"] == "expense")
    assert c.delete(f"{TX}/{tx['id']}", headers=hb).status_code == 204
    body = _analytics(c, ha, hh)
    assert body["settlement_payments"] == []
    assert Decimal(body["settlement"][0]["amount"]) == Decimal("450.00")


def test_non_member_cannot_pay(pair, client):
    c, ha, hb, hh, acc_a, acc_b, ids = pair
    hx = _register_and_login(c)
    acc_x = _acc(c, hx)
    assert _pay(c, hx, hh, acc_x, ids["A"]).status_code == 403


class TestRefundConcept:
    def test_refund_concept_only_for_income_and_reduces_expense(self, authed, cash_account):
        c, h = authed
        cats = {x["name"]: x["id"] for x in c.get(f"{BASE}/categories", headers=h).json()}
        r = c.post(f"{BASE}/concepts", json={"name": "Devolución Súper", "category_id": cats["Alimentación"],
                                              "is_refund": True}, headers=h)
        assert r.status_code == 201 and r.json()["is_refund"] is True
        ref = r.json()
        # Aparece al cargar un ingreso, no al cargar un gasto
        assert ref["id"] in [x["id"] for x in c.get(f"{BASE}/concepts?type=income", headers=h).json()]
        assert ref["id"] not in [x["id"] for x in c.get(f"{BASE}/concepts?type=expense", headers=h).json()]
        sup = _concept(c, h, "Supermercado")
        acc = cash_account["id"]
        assert c.post(TX, json={"account_id": acc, "concept_id": sup["id"], "amount": "1000",
                                "type": "expense", "date": str(TODAY)}, headers=h).status_code == 201
        assert c.post(TX, json={"account_id": acc, "concept_id": ref["id"], "amount": "300",
                                "type": "expense", "date": str(TODAY)}, headers=h).status_code == 422
        t = c.post(TX, json={"account_id": acc, "concept_id": ref["id"], "amount": "300",
                             "type": "income", "date": str(TODAY)}, headers=h)
        assert t.status_code == 201 and t.json()["is_refund"] is True
        mb = c.get(f"{BASE}/analytics/monthly-breakdown", params={"year": TODAY.year, "month": TODAY.month}, headers=h).json()
        assert mb["income"] == pytest.approx(0)
        assert mb["expenses"] == pytest.approx(700)
        assert {x["name"]: x["total"] for x in mb["categories"]}["Alimentación"] == pytest.approx(700)
        s = c.get(f"{BASE}/summary", headers=h).json()
        assert float(s["expense_this_month"]) == pytest.approx(700)
        assert float(s["income_this_month"]) == pytest.approx(0)
        # El saldo de la cuenta sí suma (la plata entró)
        assert _bal(c, h, acc) == Decimal("9300.00")
