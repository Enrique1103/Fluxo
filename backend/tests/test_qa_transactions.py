"""
QA: cuentas, transacciones, transferencias, crédito, planes de cuotas y
aislamiento entre usuarios.

Nota: el fixture `client` reutiliza UNA sesión SQLAlchemy entre requests.
En producción cada request tiene su sesión (y un error descarta los cambios
sin commit). Para reproducir eso, después de cada request que debe fallar
llamamos a db.rollback() (helper `_fail`).
"""
from datetime import date

import pytest

from tests.conftest import BASE, REG, LOG, next_email, any_concept

TX = f"{BASE}/transactions"
ACC = f"{BASE}/accounts"
PLANS = f"{BASE}/instalment-plans"
EXT = f"{BASE}/external-accounts"

TODAY = date.today()


def _prev_month(n: int = 1) -> date:
    y, m = TODAY.year, TODAY.month - n
    while m <= 0:
        m += 12
        y -= 1
    return date(y, m, 15)


PAST = _prev_month(2)   # mes anterior: no exige tasa de cambio del mes actual


def _bal(c, h, acc_id) -> float:
    r = c.get(f"{ACC}/{acc_id}", headers=h)
    assert r.status_code == 200, r.text
    return float(r.json()["balance"])


def _tx(c, h, acc, cat, amount, typ, cid=None, d=TODAY, **extra):
    body = {"account_id": acc, "category_id": cat, "concept_id": cid,
            "amount": str(amount), "type": typ, "date": str(d), **extra}
    return c.post(TX, json=body, headers=h)


def _ok(r, code=201):
    assert r.status_code == code, r.text
    return r.json() if r.content else None


def _fail(db, r, *codes):
    db.rollback()
    assert r.status_code in codes, f"{r.status_code}: {r.text}"
    return r


def _acc(c, h, name, typ="cash", cur="UYU", balance="0.00", limit=None):
    body = {"name": name, "type": typ, "currency": cur, "balance": balance}
    if limit is not None:
        body["credit_limit"] = limit
    return _ok(c.post(ACC, json=body, headers=h))


@pytest.fixture
def ctx(authed, seeds):
    c, h = authed
    cid, cat = seeds
    return c, h, cid, cat


@pytest.fixture
def credit(ctx):
    c, h, _, _ = ctx
    return _acc(c, h, "Visa", "credit", limit="10000.00")


@pytest.fixture
def user_b(client):
    data = {"name": "Otro", "email": next_email(), "password": "Test1234!", "currency_default": "UYU"}
    _ok(client.post(REG, json=data))
    r = client.post(LOG, data={"username": data["email"], "password": data["password"]})
    h = {"Authorization": f"Bearer {r.json()['access_token']}"}
    cid = any_concept(client, h)["id"]
    cat = client.get(f"{BASE}/categories", headers=h).json()[0]["id"]
    acc = _acc(client, h, "Cuenta B", balance="1000.00")
    return h, cid, cat, acc


# ─── Transacciones básicas y edición ──────────────────────────────────────────

class TestBasicFlows:
    def test_expense_income_balance(self, ctx, cash_account):
        c, h, cid, cat = ctx
        a = cash_account["id"]
        _ok(_tx(c, h, a, cat, 1000, "expense", cid))
        _ok(_tx(c, h, a, cat, 250.50, "income", cid))
        assert _bal(c, h, a) == pytest.approx(9250.50)

    def test_expense_without_concept_422(self, ctx, cash_account, db):
        """El concepto es obligatorio: sin concepto no se registra (y el saldo no cambia)."""
        c, h, _, cat = ctx
        _fail(db, _tx(c, h, cash_account["id"], cat, 10, "expense"), 422)
        assert _bal(c, h, cash_account["id"]) == pytest.approx(10000)

    def test_transfer_without_concept_uses_transferencia(self, ctx, cash_account, debit_account):
        c, h, _, cat = ctx
        t = _ok(_tx(c, h, cash_account["id"], cat, 10, "transfer", transfer_to_account_id=debit_account["id"]))
        concepts = {x["id"]: x for x in c.get(f"{BASE}/concepts", headers=h).json()}
        assert concepts[t["concept_id"]]["name"] == "Transferencia"

    def test_edit_expense_amount_up_and_down(self, ctx, cash_account):
        c, h, cid, cat = ctx
        a = cash_account["id"]
        t = _ok(_tx(c, h, a, cat, 1000, "expense", cid))
        _ok(c.patch(f"{TX}/{t['id']}", json={"amount": "3000"}, headers=h), 200)
        assert _bal(c, h, a) == pytest.approx(7000)
        _ok(c.patch(f"{TX}/{t['id']}", json={"amount": "500"}, headers=h), 200)
        assert _bal(c, h, a) == pytest.approx(9500)

    def test_edit_expense_over_balance_rejected_and_balance_untouched(self, ctx, cash_account, db):
        c, h, cid, cat = ctx
        a = cash_account["id"]
        t = _ok(_tx(c, h, a, cat, 1000, "expense", cid))
        _fail(db, c.patch(f"{TX}/{t['id']}", json={"amount": "20000"}, headers=h), 422)
        assert _bal(c, h, a) == pytest.approx(9000)

    def test_edit_income_amount(self, ctx, cash_account):
        c, h, cid, cat = ctx
        a = cash_account["id"]
        t = _ok(_tx(c, h, a, cat, 1000, "income", cid))
        _ok(c.patch(f"{TX}/{t['id']}", json={"amount": "400"}, headers=h), 200)
        assert _bal(c, h, a) == pytest.approx(10400)

    def test_delete_twice_404(self, ctx, cash_account, db):
        c, h, cid, cat = ctx
        t = _ok(_tx(c, h, cash_account["id"], cat, 100, "expense", cid))
        _ok(c.delete(f"{TX}/{t['id']}", headers=h), 204)
        _fail(db, c.delete(f"{TX}/{t['id']}", headers=h), 404)
        assert _bal(c, h, cash_account["id"]) == pytest.approx(10000)

    def test_deleted_tx_not_listed_nor_gettable(self, ctx, cash_account, db):
        c, h, cid, cat = ctx
        t = _ok(_tx(c, h, cash_account["id"], cat, 100, "expense", cid))
        _ok(c.delete(f"{TX}/{t['id']}", headers=h), 204)
        assert c.get(TX, headers=h).json() == []
        assert c.get(f"{ACC}/{cash_account['id']}/transactions", headers=h).json() == []
        _fail(db, c.get(f"{TX}/{t['id']}", headers=h), 404)
        _fail(db, c.patch(f"{TX}/{t['id']}", json={"amount": "5"}, headers=h), 404)

    def test_edit_income_down_cannot_make_cash_negative(self, ctx, db):
        c, h, cid, cat = ctx
        a = _acc(c, h, "Billetera", balance="0.00")["id"]
        t = _ok(_tx(c, h, a, cat, 1000, "income", cid))
        _ok(_tx(c, h, a, cat, 1000, "expense", cid))
        r = c.patch(f"{TX}/{t['id']}", json={"amount": "100"}, headers=h)
        db.rollback()
        assert r.status_code == 422
        assert _bal(c, h, a) >= 0

    def test_delete_spent_income_cannot_make_cash_negative(self, ctx, db):
        c, h, cid, cat = ctx
        a = _acc(c, h, "Billetera", balance="0.00")["id"]
        t = _ok(_tx(c, h, a, cat, 1000, "income", cid))
        _ok(_tx(c, h, a, cat, 1000, "expense", cid))
        r = c.delete(f"{TX}/{t['id']}", headers=h)
        db.rollback()
        assert r.status_code == 422
        assert _bal(c, h, a) >= 0


# ─── Transferencias ───────────────────────────────────────────────────────────

class TestTransfers:
    def test_internal_transfer_with_commission_and_delete(self, ctx, cash_account, debit_account):
        c, h, cid, cat = ctx
        s, d = cash_account["id"], debit_account["id"]
        t = _ok(_tx(c, h, s, cat, 1000, "transfer", cid, transfer_to_account_id=d, commission="50"))
        assert _bal(c, h, s) == pytest.approx(8950)
        assert _bal(c, h, d) == pytest.approx(51000)
        # Lista global: solo el SOURCE
        assert len(c.get(TX, headers=h).json()) == 1
        # Vista de la cuenta destino: ve la pata DESTINATION
        legs = c.get(f"{ACC}/{d}/transactions", headers=h).json()
        assert len(legs) == 1 and legs[0]["transfer_role"] == "destination"
        _ok(c.delete(f"{TX}/{t['id']}", headers=h), 204)
        assert _bal(c, h, s) == pytest.approx(10000)
        assert _bal(c, h, d) == pytest.approx(50000)

    def test_delete_transfer_via_destination_leg(self, ctx, cash_account, debit_account):
        c, h, cid, cat = ctx
        s, d = cash_account["id"], debit_account["id"]
        t = _ok(_tx(c, h, s, cat, 1000, "transfer", cid, transfer_to_account_id=d, commission="10"))
        _ok(c.delete(f"{TX}/{t['transfer_id']}", headers=h), 204)
        assert _bal(c, h, s) == pytest.approx(10000)
        assert _bal(c, h, d) == pytest.approx(50000)
        assert c.get(f"{ACC}/{s}/transactions", headers=h).json() == []

    def test_commission_counts_for_insufficient_funds(self, ctx, cash_account, debit_account, db):
        c, h, cid, cat = ctx
        _fail(db, _tx(c, h, cash_account["id"], cat, 10000, "transfer", cid,
                      transfer_to_account_id=debit_account["id"], commission="1"), 422)
        assert _bal(c, h, cash_account["id"]) == pytest.approx(10000)
        assert _bal(c, h, debit_account["id"]) == pytest.approx(50000)

    def test_cannot_edit_transfer_leg(self, ctx, cash_account, debit_account, db):
        c, h, cid, cat = ctx
        t = _ok(_tx(c, h, cash_account["id"], cat, 100, "transfer", cid,
                    transfer_to_account_id=debit_account["id"]))
        _fail(db, c.patch(f"{TX}/{t['id']}", json={"amount": "5"}, headers=h), 422)
        _fail(db, c.patch(f"{TX}/{t['transfer_id']}", json={"amount": "5"}, headers=h), 422)

    def test_cross_currency_with_destination_amount(self, ctx, cash_account):
        c, h, cid, cat = ctx
        usd = _acc(c, h, "USD", cur="USD", balance="0.00")["id"]
        t = _ok(_tx(c, h, cash_account["id"], cat, 4000, "transfer", cid, d=PAST,
                    transfer_to_account_id=usd, destination_amount="100"))
        assert _bal(c, h, cash_account["id"]) == pytest.approx(6000)
        assert _bal(c, h, usd) == pytest.approx(100)
        _ok(c.delete(f"{TX}/{t['id']}", headers=h), 204)
        assert _bal(c, h, cash_account["id"]) == pytest.approx(10000)
        assert _bal(c, h, usd) == pytest.approx(0)

    def test_cross_currency_without_rate_or_dest_amount_422(self, ctx, cash_account, db):
        c, h, cid, cat = ctx
        usd = _acc(c, h, "USD", cur="USD", balance="0.00")["id"]
        _fail(db, _tx(c, h, cash_account["id"], cat, 4000, "transfer", cid, d=PAST,
                      transfer_to_account_id=usd), 422)
        assert _bal(c, h, cash_account["id"]) == pytest.approx(10000)

    def test_destination_amount_rejected_for_external(self, ctx, cash_account, db):
        c, h, cid, cat = ctx
        ext = _ok(c.post(EXT, json={"name": "Juan", "owner_name": "Juan Perez"}, headers=h))
        _fail(db, _tx(c, h, cash_account["id"], cat, 100, "transfer", cid,
                      external_account_id=ext["id"], destination_amount="5"), 422)

    def test_external_transfer_with_commission_and_delete(self, ctx, cash_account):
        c, h, cid, cat = ctx
        ext = _ok(c.post(EXT, json={"name": "Juan", "owner_name": "Juan Perez"}, headers=h))
        t = _ok(_tx(c, h, cash_account["id"], cat, 1000, "transfer", cid,
                    external_account_id=ext["id"], commission="20"))
        assert t["transfer_id"] is None and t["transfer_role"] == "source"
        assert _bal(c, h, cash_account["id"]) == pytest.approx(8980)
        _ok(c.delete(f"{TX}/{t['id']}", headers=h), 204)
        assert _bal(c, h, cash_account["id"]) == pytest.approx(10000)

    def test_delete_transfer_after_destination_spent(self, ctx, cash_account, db):
        c, h, cid, cat = ctx
        dest = _acc(c, h, "Billetera", balance="0.00")["id"]
        t = _ok(_tx(c, h, cash_account["id"], cat, 1000, "transfer", cid, transfer_to_account_id=dest))
        _ok(_tx(c, h, dest, cat, 1000, "expense", cid))
        r = c.delete(f"{TX}/{t['id']}", headers=h)
        db.rollback()
        assert r.status_code == 422
        assert _bal(c, h, dest) >= 0


# ─── Cuentas de crédito ───────────────────────────────────────────────────────

class TestCredit:
    def test_expense_within_limit_and_over_limit(self, ctx, credit, db):
        c, h, cid, cat = ctx
        _ok(_tx(c, h, credit["id"], cat, 9000, "expense", cid))
        assert _bal(c, h, credit["id"]) == pytest.approx(-9000)
        _fail(db, _tx(c, h, credit["id"], cat, 1001, "expense", cid), 422)
        _ok(_tx(c, h, credit["id"], cat, 1000, "expense", cid))
        assert _bal(c, h, credit["id"]) == pytest.approx(-10000)

    def test_pay_card_and_overpay(self, ctx, credit, debit_account, db):
        c, h, cid, cat = ctx
        _ok(_tx(c, h, credit["id"], cat, 3000, "expense", cid))
        _ok(_tx(c, h, debit_account["id"], cat, 2000, "transfer", cid, transfer_to_account_id=credit["id"]))
        assert _bal(c, h, credit["id"]) == pytest.approx(-1000)
        _fail(db, _tx(c, h, debit_account["id"], cat, 1001, "transfer", cid,
                      transfer_to_account_id=credit["id"]), 422)
        assert _bal(c, h, debit_account["id"]) == pytest.approx(48000)
        _fail(db, _tx(c, h, credit["id"], cat, 1001, "income", cid), 422)

    def test_edit_credit_expense_over_limit_rejected(self, ctx, credit, db):
        c, h, cid, cat = ctx
        t = _ok(_tx(c, h, credit["id"], cat, 5000, "expense", cid))
        _fail(db, c.patch(f"{TX}/{t['id']}", json={"amount": "10001"}, headers=h), 422)
        _ok(c.patch(f"{TX}/{t['id']}", json={"amount": "10000"}, headers=h), 200)
        assert _bal(c, h, credit["id"]) == pytest.approx(-10000)

    def test_cash_advance_from_credit(self, ctx, credit, cash_account):
        c, h, cid, cat = ctx
        t = _ok(_tx(c, h, credit["id"], cat, 2000, "transfer", cid, transfer_to_account_id=cash_account["id"]))
        assert _bal(c, h, credit["id"]) == pytest.approx(-2000)
        _ok(c.delete(f"{TX}/{t['id']}", headers=h), 204)
        assert _bal(c, h, credit["id"]) == pytest.approx(0)

    def test_delete_paid_credit_expense_cannot_make_balance_positive(self, ctx, credit, debit_account, db):
        c, h, cid, cat = ctx
        t = _ok(_tx(c, h, credit["id"], cat, 1000, "expense", cid))
        _ok(_tx(c, h, debit_account["id"], cat, 1000, "transfer", cid, transfer_to_account_id=credit["id"]))
        r = c.delete(f"{TX}/{t['id']}", headers=h)
        db.rollback()
        assert _bal(c, h, credit["id"]) <= 0

    def test_patch_credit_balance_positive_rejected(self, ctx, credit, db):
        c, h, _, _ = ctx
        r = c.patch(f"{ACC}/{credit['id']}", json={"balance": "5000"}, headers=h)
        db.rollback()
        assert r.status_code == 422
        assert _bal(c, h, credit["id"]) <= 0

    def test_patch_type_to_credit_requires_limit(self, ctx, db):
        c, h, cid, cat = ctx
        a = _acc(c, h, "Convertida", balance="0.00")["id"]
        r = c.patch(f"{ACC}/{a}", json={"type": "credit"}, headers=h)
        db.rollback()
        if r.status_code == 200:
            r2 = _tx(c, h, a, cat, 10, "expense", cid)
            db.rollback()
            assert r2.status_code != 500, "gasto en tarjeta sin límite → 500"
        assert r.status_code == 422

    def test_patch_cash_negative_balance_rejected(self, ctx, db):
        c, h, _, _ = ctx
        a = _acc(c, h, "Caja", balance="100.00")["id"]
        r = c.patch(f"{ACC}/{a}", json={"balance": "-500"}, headers=h)
        db.rollback()
        assert r.status_code == 422

    def test_patch_credit_limit_on_cash_ignored_or_rejected(self, ctx, cash_account, db):
        c, h, _, _ = ctx
        r = c.patch(f"{ACC}/{cash_account['id']}", json={"credit_limit": "500"}, headers=h)
        db.rollback()
        assert r.status_code == 422 or r.json()["credit_limit"] is None

    def test_lower_credit_limit_below_debt_rejected(self, ctx, credit, db):
        c, h, cid, cat = ctx
        _ok(_tx(c, h, credit["id"], cat, 8000, "expense", cid))
        r = c.patch(f"{ACC}/{credit['id']}", json={"credit_limit": "1000"}, headers=h)
        db.rollback()
        assert r.status_code in (409, 422)

    def test_cannot_change_type_with_transactions(self, ctx, credit, db):
        c, h, cid, cat = ctx
        _ok(_tx(c, h, credit["id"], cat, 100, "expense", cid))
        _fail(db, c.patch(f"{ACC}/{credit['id']}", json={"type": "cash"}, headers=h), 409)
        _fail(db, c.patch(f"{ACC}/{credit['id']}", json={"balance": "0"}, headers=h), 409)


# ─── Borrado de cuentas ───────────────────────────────────────────────────────

class TestAccountDeletion:
    def test_cannot_delete_with_active_tx_then_can_after(self, ctx, cash_account, db):
        c, h, cid, cat = ctx
        a = cash_account["id"]
        t = _ok(_tx(c, h, a, cat, 100, "expense", cid))
        _fail(db, c.delete(f"{ACC}/{a}", headers=h), 409)
        _ok(c.delete(f"{TX}/{t['id']}", headers=h), 204)
        _ok(c.delete(f"{ACC}/{a}", headers=h), 204)
        _fail(db, c.get(f"{ACC}/{a}", headers=h), 404)
        assert all(x["id"] != a for x in c.get(ACC, headers=h).json())
        # nombre reutilizable
        _acc(c, h, "Efectivo")
        # no se puede operar sobre la cuenta borrada
        _fail(db, _tx(c, h, a, cat, 1, "income", cid), 404)

    def test_cannot_delete_destination_account_of_transfer(self, ctx, cash_account, debit_account, db):
        c, h, cid, cat = ctx
        _ok(_tx(c, h, cash_account["id"], cat, 100, "transfer", cid, transfer_to_account_id=debit_account["id"]))
        _fail(db, c.delete(f"{ACC}/{debit_account['id']}", headers=h), 409)

    def test_transfer_to_deleted_account_404(self, ctx, cash_account, db):
        c, h, cid, cat = ctx
        b = _acc(c, h, "Temporal")["id"]
        _ok(c.delete(f"{ACC}/{b}", headers=h), 204)
        _fail(db, _tx(c, h, cash_account["id"], cat, 100, "transfer", cid, transfer_to_account_id=b), 404)
        assert _bal(c, h, cash_account["id"]) == pytest.approx(10000)


# ─── Planes de cuotas ─────────────────────────────────────────────────────────

def _plan(acc, cat, cid=None, n=3, total="3000.00", start=TODAY):
    return {"account_id": acc, "category_id": cat, "concept_id": cid, "description": "Tele",
            "total_amount": total, "n_cuotas": n, "fecha_inicio": str(start)}


class TestInstalmentPlans:
    def test_plan_cents_distribution_and_cancel(self, ctx, credit):
        c, h, cid, cat = ctx
        p = _ok(c.post(PLANS, json=_plan(credit["id"], cat, cid, n=3, total="1000.00"), headers=h))
        assert _bal(c, h, credit["id"]) == pytest.approx(-1000)
        txs = c.get(f"{ACC}/{credit['id']}/transactions", headers=h).json()
        assert sorted(float(t["amount"]) for t in txs) == [333.33, 333.33, 333.34]
        assert p["cuotas_pagadas"] == 1 and p["cuotas_restantes"] == 2
        _ok(c.delete(f"{PLANS}/{p['id']}", headers=h), 204)
        # se revierten solo las 2 cuotas futuras
        assert _bal(c, h, credit["id"]) == pytest.approx(-333.33, abs=0.011)
        assert len(c.get(f"{ACC}/{credit['id']}/transactions", headers=h).json()) == 1

    def test_plan_over_credit_limit_rejected_atomically(self, ctx, credit, db):
        c, h, cid, cat = ctx
        _fail(db, c.post(PLANS, json=_plan(credit["id"], cat, cid, total="10001.00"), headers=h), 422)
        assert _bal(c, h, credit["id"]) == pytest.approx(0)
        assert c.get(PLANS, headers=h).json() == []

    def test_plan_requires_credit_account(self, ctx, cash_account, db):
        c, h, cid, cat = ctx
        r = c.post(PLANS, json=_plan(cash_account["id"], cat, cid), headers=h)
        db.rollback()
        assert 400 <= r.status_code < 500

    def test_cannot_edit_plan_cuota(self, ctx, credit, db):
        c, h, cid, cat = ctx
        _ok(c.post(PLANS, json=_plan(credit["id"], cat, cid), headers=h))
        t = c.get(TX, headers=h).json()[0]
        r = c.patch(f"{TX}/{t['id']}", json={"amount": "1"}, headers=h)
        db.rollback()
        assert 400 <= r.status_code < 500

    def test_cancel_twice_404(self, ctx, credit, db):
        c, h, cid, cat = ctx
        p = _ok(c.post(PLANS, json=_plan(credit["id"], cat, cid), headers=h))
        _ok(c.delete(f"{PLANS}/{p['id']}", headers=h), 204)
        _fail(db, c.delete(f"{PLANS}/{p['id']}", headers=h), 404)
        assert _bal(c, h, credit["id"]) == pytest.approx(-1000)

    def test_delete_single_plan_cuota_restores_card(self, ctx, credit, db):
        """'Eliminar solo esta cuota' es una opción de la pantalla: se permite y devuelve el monto."""
        c, h, cid, cat = ctx
        _ok(c.post(PLANS, json=_plan(credit["id"], cat, cid), headers=h))
        before = _bal(c, h, credit["id"])
        t = c.get(TX, headers=h).json()[0]
        assert c.delete(f"{TX}/{t['id']}", headers=h).status_code == 204
        assert _bal(c, h, credit["id"]) == before + float(t["amount"])

    def test_cancel_after_paying_card_not_positive(self, ctx, credit, debit_account, db):
        c, h, cid, cat = ctx
        p = _ok(c.post(PLANS, json=_plan(credit["id"], cat, cid), headers=h))
        _ok(_tx(c, h, debit_account["id"], cat, 3000, "transfer", cid, transfer_to_account_id=credit["id"]))
        c.delete(f"{PLANS}/{p['id']}", headers=h)
        db.rollback()
        assert _bal(c, h, credit["id"]) <= 0


# ─── Aislamiento entre usuarios ───────────────────────────────────────────────

class TestOwnership:
    def test_b_cannot_touch_a_account(self, ctx, cash_account, user_b, db):
        c, h, cid, cat = ctx
        hb, cid_b, cat_b, acc_b = user_b
        a = cash_account["id"]
        _fail(db, c.get(f"{ACC}/{a}", headers=hb), 403, 404)
        _fail(db, c.patch(f"{ACC}/{a}", json={"name": "Hack", "balance": "1"}, headers=hb), 403, 404)
        _fail(db, c.delete(f"{ACC}/{a}", headers=hb), 403, 404)
        _fail(db, c.get(f"{ACC}/{a}/transactions", headers=hb), 403, 404)
        assert all(x["id"] != a for x in c.get(ACC, headers=hb).json())
        got = c.get(f"{ACC}/{a}", headers=h).json()
        assert got["name"] == "Efectivo" and float(got["balance"]) == 10000

    def test_b_cannot_use_a_account_category_concept(self, ctx, cash_account, user_b, db):
        c, h, cid, cat = ctx
        hb, cid_b, cat_b, acc_b = user_b
        a = cash_account["id"]
        # B gasta desde la cuenta de A
        _fail(db, _tx(c, hb, a, cat_b, 100, "expense", cid_b), 403, 404)
        # B transfiere a la cuenta de A / desde la de A
        _fail(db, _tx(c, hb, acc_b["id"], cat_b, 100, "transfer", cid_b, transfer_to_account_id=a), 403, 404)
        _fail(db, _tx(c, hb, a, cat_b, 100, "transfer", cid_b, transfer_to_account_id=acc_b["id"]), 403, 404)
        # B usa categoría / concepto de A
        # (la categoría ya no se elige: sale del concepto, así que no se puede "usar" la de A)
        _fail(db, _tx(c, hb, acc_b["id"], cat_b, 100, "expense", cid), 403, 404)
        assert _bal(c, h, a) == pytest.approx(10000)
        assert _bal(c, hb, acc_b["id"]) == pytest.approx(1000)

    def test_b_cannot_use_a_external_account(self, ctx, user_b, db):
        c, h, cid, cat = ctx
        hb, cid_b, cat_b, acc_b = user_b
        ext = _ok(c.post(EXT, json={"name": "Juan", "owner_name": "Juan Perez"}, headers=h))
        _fail(db, _tx(c, hb, acc_b["id"], cat_b, 100, "transfer", cid_b,
                      external_account_id=ext["id"]), 403, 404)
        assert _bal(c, hb, acc_b["id"]) == pytest.approx(1000)

    def test_b_cannot_read_edit_delete_a_transactions(self, ctx, cash_account, debit_account, user_b, db):
        c, h, cid, cat = ctx
        hb, cid_b, cat_b, _ = user_b
        e = _ok(_tx(c, h, cash_account["id"], cat, 100, "expense", cid))
        t = _ok(_tx(c, h, cash_account["id"], cat, 100, "transfer", cid,
                    transfer_to_account_id=debit_account["id"]))
        for tid in (e["id"], t["id"], t["transfer_id"]):
            _fail(db, c.get(f"{TX}/{tid}", headers=hb), 403, 404)
            _fail(db, c.patch(f"{TX}/{tid}", json={"amount": "1"}, headers=hb), 403, 404)
            _fail(db, c.delete(f"{TX}/{tid}", headers=hb), 403, 404)
        # Ni re-categorizar con su propia categoría
        _fail(db, c.patch(f"{TX}/{e['id']}", json={"category_id": cat_b}, headers=hb), 403, 404)
        assert c.get(TX, headers=hb).json() == []
        assert c.get(TX, headers=hb, params={"account_id": cash_account["id"]}).json() == []
        assert _bal(c, h, cash_account["id"]) == pytest.approx(9800)
        assert _bal(c, h, debit_account["id"]) == pytest.approx(50100)

    def test_a_cannot_recategorize_with_b_category_or_concept(self, ctx, cash_account, user_b, db):
        c, h, cid, cat = ctx
        hb, cid_b, cat_b, _ = user_b
        e = _ok(_tx(c, h, cash_account["id"], cat, 100, "expense", cid))
        # category_id ya no se edita (sale del concepto): se ignora
        _ok(c.patch(f"{TX}/{e['id']}", json={"category_id": cat_b}, headers=h), 200)
        _fail(db, c.patch(f"{TX}/{e['id']}", json={"concept_id": cid_b}, headers=h), 403, 404)
        got = c.get(f"{TX}/{e['id']}", headers=h).json()
        assert got["category_id"] == cat and got["concept_id"] == cid

    def test_b_cannot_touch_a_plans(self, ctx, credit, user_b, db):
        c, h, cid, cat = ctx
        hb, cid_b, cat_b, _ = user_b
        p = _ok(c.post(PLANS, json=_plan(credit["id"], cat, cid), headers=h))
        _fail(db, c.get(f"{PLANS}/{p['id']}", headers=hb), 403, 404)
        _fail(db, c.patch(f"{PLANS}/{p['id']}", json={"description": "x"}, headers=hb), 403, 404)
        _fail(db, c.delete(f"{PLANS}/{p['id']}", headers=hb), 403, 404)
        assert c.get(PLANS, headers=hb).json() == []
        # B no puede crear un plan sobre la tarjeta de A
        _fail(db, c.post(PLANS, json=_plan(credit["id"], cat_b, cid_b), headers=hb), 403, 404)
        assert _bal(c, h, credit["id"]) == pytest.approx(-3000)
        assert c.get(f"{PLANS}/{p['id']}", headers=h).json()["description"] == "Tele"
