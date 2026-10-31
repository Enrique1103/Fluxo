"""QA: auth, usuarios, categorías/conceptos, importación, reviews y admin.

Cada test documenta un bug que se encontró y ya está corregido (antes eran xfail).
Algunos activan PRAGMA foreign_keys=ON (fixture fk_on) para reproducir el
comportamiento de Postgres, donde las FK sí se validan.
"""
import io
import uuid
from datetime import date

import pytest

from tests.conftest import BASE, LOG, REG, next_email, engine, expense_category
from app.services import user_service

TODAY = str(date.today())
HH = f"{BASE}/households"
IMP = f"{BASE}/importacion"


# ── helpers ───────────────────────────────────────────────────────────────────

@pytest.fixture
def fk_on():
    with engine.connect() as conn:
        conn.exec_driver_sql("PRAGMA foreign_keys=ON")
    yield
    with engine.connect() as conn:
        conn.exec_driver_sql("PRAGMA foreign_keys=OFF")


@pytest.fixture
def admin(client, monkeypatch):
    monkeypatch.setattr(user_service, "ADMIN_PASSWORD", "AdminPass1!")
    monkeypatch.setattr(user_service, "ADMIN_EMAIL", "admin")
    r = client.post(LOG, data={"username": "admin", "password": "AdminPass1!"})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def _new_user(c, password="Test1234!"):
    email = next_email()
    r = c.post(REG, json={"name": "Otro", "email": email, "password": password})
    assert r.status_code == 201, r.text
    t = c.post(LOG, data={"username": email, "password": password}).json()["access_token"]
    return {"Authorization": f"Bearer {t}"}, r.json()["id"], email


def _account(c, h, balance="10000.00"):
    r = c.post(f"{BASE}/accounts", json={"name": f"Cta {uuid.uuid4().hex[:6]}", "type": "cash",
                                          "currency": "UYU", "balance": balance}, headers=h)
    assert r.status_code == 201, r.text
    return r.json()["id"]


def _tx(c, h, acc, concept_id=None, category_id=None, amount="100.00", hh=None):
    # El concepto es obligatorio y define la categoría. Si el test pide una
    # categoría puntual sin concepto, se crea un concepto dentro de esa categoría.
    body = {"amount": amount, "type": "expense", "date": TODAY, "account_id": acc}
    if not concept_id and category_id:
        concept_id = c.post(f"{BASE}/concepts", json={"name": f"Concepto {uuid.uuid4().hex[:6]}",
                            "category_id": category_id}, headers=h).json()["id"]
    if not concept_id:
        concept_id = next(x["id"] for x in c.get(f"{BASE}/concepts?type=expense", headers=h).json())
    body["concept_id"] = concept_id
    if hh:
        body["household_id"] = hh
    r = c.post(f"{BASE}/transactions", json=body, headers=h)
    assert r.status_code == 201, r.text
    return r.json()["id"]


def _household_with_member(c, admin_h):
    hh = c.post(HH, json={"name": "Casa", "base_currency": "UYU", "split_type": "equal"},
                headers=admin_h).json()["id"]
    code = c.post(f"{HH}/{hh}/invite", headers=admin_h).json()["code"]
    mh, mid, _ = _new_user(c)
    c.post(f"{HH}/join", json={"code": code}, headers=mh)
    c.post(f"{HH}/{hh}/members/{mid}/approve", headers=admin_h)
    return hh, mh, mid


# ── Auth ──────────────────────────────────────────────────────────────────────

class TestAuth:
    def test_logout_revokes_token(self, authed):
        c, h = authed
        assert c.post(f"{BASE}/auth/logout", headers=h).status_code == 204
        assert c.get(f"{BASE}/users/me", headers=h).status_code == 401

    def test_wrong_password_401(self, client, registered_user):
        r = client.post(LOG, data={"username": registered_user["email"], "password": "Nope1234!"})
        assert r.status_code == 401

    def test_duplicate_email_409(self, client, registered_user, user_data):
        assert client.post(REG, json=user_data).status_code == 409

    def test_garbage_token_401(self, client):
        assert client.get(f"{BASE}/users/me", headers={"Authorization": "Bearer x.y.z"}).status_code == 401

    def test_inactive_user_blocked(self, authed, registered_user, admin):
        c, h = authed
        r = c.patch(f"{BASE}/admin/users/{registered_user['id']}/toggle-active", headers=admin)
        assert r.status_code == 200 and r.json()["is_active"] is False
        assert c.get(f"{BASE}/users/me", headers=h).status_code == 403
        r = c.post(LOG, data={"username": registered_user["email"], "password": registered_user["password"]})
        assert r.status_code == 403


# ── Admin ─────────────────────────────────────────────────────────────────────

class TestAdmin:
    def test_user_token_cannot_access_admin(self, authed):
        c, h = authed
        assert c.get(f"{BASE}/admin/users", headers=h).status_code == 403
        assert c.get(f"{BASE}/admin/stats", headers=h).status_code == 403

    def test_no_token_401(self, client):
        assert client.get(f"{BASE}/admin/users").status_code == 401

    def test_admin_token_rejected_on_user_endpoints(self, client, admin):
        assert client.get(f"{BASE}/users/me", headers=admin).status_code == 401

    def test_admin_lists_users(self, client, admin, registered_user):
        r = client.get(f"{BASE}/admin/users", headers=admin)
        assert r.status_code == 200
        assert any(u["email"] == registered_user["email"] for u in r.json())

    def test_admin_bad_user_id_404(self, client, admin):
        r = client.get(f"{BASE}/admin/users/not-a-uuid", headers=admin)
        assert r.status_code in (404, 422)

    def test_admin_logout_revokes_token(self, client, admin):
        assert client.post(f"{BASE}/auth/logout", headers=admin).status_code == 204
        assert client.get(f"{BASE}/admin/users", headers=admin).status_code == 401


# ── Users ─────────────────────────────────────────────────────────────────────

class TestUsers:
    def test_update_name_currency(self, authed):
        c, h = authed
        r = c.patch(f"{BASE}/users/me", json={"name": "Nuevo", "currency_default": "USD"}, headers=h)
        assert r.status_code == 200
        assert r.json()["name"] == "Nuevo" and r.json()["currency_default"] == "USD"

    def test_change_password_requires_current(self, authed):
        c, h = authed
        r = c.patch(f"{BASE}/users/me", json={"new_password": "Nueva123!"}, headers=h)
        assert r.status_code == 401
        r = c.patch(f"{BASE}/users/me", json={"new_password": "Nueva123!", "current_password": "Mala1234!"}, headers=h)
        assert r.status_code == 401

    def test_change_password_ok(self, authed, registered_user):
        c, h = authed
        r = c.patch(f"{BASE}/users/me", json={"new_password": "Nueva123!",
                                              "current_password": registered_user["password"]}, headers=h)
        assert r.status_code == 200
        assert c.post(LOG, data={"username": registered_user["email"], "password": "Nueva123!"}).status_code == 200
        assert c.post(LOG, data={"username": registered_user["email"],
                                 "password": registered_user["password"]}).status_code == 401

    def test_delete_wrong_password(self, authed):
        c, h = authed
        r = c.request("DELETE", f"{BASE}/users/me", json={"password": "Mala1234!"}, headers=h)
        assert r.status_code == 401

    def test_delete_with_data_fk_enforced(self, fk_on, authed, registered_user, seeds):
        c, h = authed
        concept_id, _ = seeds
        acc = _account(c, h)
        _tx(c, h, acc, concept_id=concept_id)
        cats = c.get(f"{BASE}/categories", headers=h).json()
        c.post(f"{BASE}/budgets", json={"category_id": cats[3]["id"], "month": 1, "year": 2026,
                                        "amount": "1000.00"}, headers=h)
        r = c.request("DELETE", f"{BASE}/users/me", json={"password": registered_user["password"]}, headers=h)
        assert r.status_code == 204, r.text
        assert c.get(f"{BASE}/users/me", headers=h).status_code == 401
        # puede volver a registrarse con el mismo email
        assert c.post(REG, json={"name": "Again", "email": registered_user["email"],
                                 "password": "Test1234!"}).status_code == 201

    def test_delete_user_who_flagged_review(self, fk_on, authed, registered_user, seeds):
        c, admin_h = authed
        concept_id, _ = seeds
        hh, mh, _ = _household_with_member(c, admin_h)
        acc = _account(c, admin_h)
        tx = _tx(c, admin_h, acc, concept_id=concept_id, hh=hh)
        r = c.post(f"{HH}/{hh}/reviews", json={"transaction_id": tx, "household_id": hh,
                                               "flag_type": "monto_alto"}, headers=mh)
        assert r.status_code == 201, r.text
        r = c.request("DELETE", f"{BASE}/users/me", json={"password": "Test1234!"}, headers=mh)
        assert r.status_code == 204, r.text

    def test_delete_household_creator_promotes_admin(self, authed, registered_user):
        c, admin_h = authed
        hh, mh, mid = _household_with_member(c, admin_h)
        r = c.request("DELETE", f"{BASE}/users/me", json={"password": registered_user["password"]}, headers=admin_h)
        assert r.status_code == 204
        members = c.get(f"{HH}/{hh}/members", headers=mh).json()
        assert any(m["role"] == "admin" for m in members), members


# ── Categorías y conceptos ────────────────────────────────────────────────────

class TestCategories:
    def test_duplicate_name_case_insensitive_409(self, authed):
        c, h = authed
        assert c.post(f"{BASE}/categories", json={"name": "mascotas"}, headers=h).status_code == 201
        assert c.post(f"{BASE}/categories", json={"name": "MASCOTAS"}, headers=h).status_code == 409

    def test_same_slug_different_name(self, authed):
        c, h = authed
        assert c.post(f"{BASE}/categories", json={"name": "Café"}, headers=h).status_code == 201
        r = c.post(f"{BASE}/categories", json={"name": "Cafe"}, headers=h)
        assert r.status_code in (201, 409), r.text

    def test_same_name_other_user_ok_and_isolated(self, authed):
        c, h = authed
        cat = c.post(f"{BASE}/categories", json={"name": "Mascotas"}, headers=h).json()
        h2, _, _ = _new_user(c)
        assert c.post(f"{BASE}/categories", json={"name": "Mascotas"}, headers=h2).status_code == 201
        assert c.get(f"{BASE}/categories/{cat['id']}", headers=h2).status_code == 404
        assert c.patch(f"{BASE}/categories/{cat['id']}", json={"name": "X1"}, headers=h2).status_code == 404
        assert c.delete(f"{BASE}/categories/{cat['id']}", headers=h2).status_code == 404

    def test_delete_category_in_use_409(self, authed):
        c, h = authed
        cat = c.post(f"{BASE}/categories", json={"name": "Mascotas"}, headers=h).json()
        acc = _account(c, h)
        _tx(c, h, acc, category_id=cat["id"])
        assert c.delete(f"{BASE}/categories/{cat['id']}", headers=h).status_code == 409

    def test_rename_category(self, authed):
        c, h = authed
        cat = c.post(f"{BASE}/categories", json={"name": "Mascotas"}, headers=h).json()
        r = c.patch(f"{BASE}/categories/{cat['id']}", json={"name": "perros"}, headers=h)
        assert r.status_code == 200 and r.json()["name"] == "Perros" and r.json()["slug"] == "perros"

    def test_delete_seed_category_with_concepts(self, fk_on, authed):
        c, h = authed
        cats = c.get(f"{BASE}/categories", headers=h).json()
        aseo = next(x for x in cats if x["name"] == "Aseo")
        r = c.delete(f"{BASE}/categories/{aseo['id']}", headers=h)
        assert r.status_code in (204, 409), r.text

    def test_delete_category_with_only_deleted_tx(self, fk_on, authed):
        c, h = authed
        cat = c.post(f"{BASE}/categories", json={"name": "Mascotas"}, headers=h).json()
        acc = _account(c, h)
        tx = _tx(c, h, acc, category_id=cat["id"])
        assert c.delete(f"{BASE}/transactions/{tx}", headers=h).status_code == 204
        r = c.delete(f"{BASE}/categories/{cat['id']}", headers=h)
        assert r.status_code in (204, 409), r.text


class TestConcepts:
    def test_duplicate_concept_409(self, authed):
        c, h = authed
        assert c.post(f"{BASE}/concepts", json={"name": "perro", "category_id": expense_category(c, h)}, headers=h).status_code == 201
        assert c.post(f"{BASE}/concepts", json={"name": " PERRO ", "category_id": expense_category(c, h)}, headers=h).status_code == 409

    def test_concept_isolation(self, authed):
        c, h = authed
        con = c.post(f"{BASE}/concepts", json={"name": "perro", "category_id": expense_category(c, h)}, headers=h).json()
        h2, _, _ = _new_user(c)
        assert c.get(f"{BASE}/concepts/{con['id']}", headers=h2).status_code in (403, 404)
        assert c.delete(f"{BASE}/concepts/{con['id']}", headers=h2).status_code in (403, 404)

    def test_delete_concept_in_use_409(self, authed, seeds):
        c, h = authed
        _, cat = seeds
        con = c.post(f"{BASE}/concepts", json={"name": "perro", "category_id": expense_category(c, h)}, headers=h).json()
        acc = _account(c, h)
        _tx(c, h, acc, concept_id=con["id"])
        assert c.delete(f"{BASE}/concepts/{con['id']}", headers=h).status_code == 409

    def test_delete_concept_with_only_deleted_tx(self, fk_on, authed):
        c, h = authed
        con = c.post(f"{BASE}/concepts", json={"name": "perro", "category_id": expense_category(c, h)}, headers=h).json()
        acc = _account(c, h)
        tx = _tx(c, h, acc, concept_id=con["id"])
        assert c.delete(f"{BASE}/transactions/{tx}", headers=h).status_code == 204
        r = c.delete(f"{BASE}/concepts/{con['id']}", headers=h)
        assert r.status_code in (204, 409), r.text


# ── Importación ───────────────────────────────────────────────────────────────

def _brou(rows):
    header = "Fecha Movimiento,Fecha Valor,Referencia,Descripción,Débito,Crédito,Saldo,Código,Sucursal"
    return "\n".join([header] + rows).encode("utf-8")


def _parse(c, h, acc, data):
    r = c.post(f"{IMP}/parsear", files={"file": ("x.csv", io.BytesIO(data), "text/csv")},
               params={"banco": "brou", "cuenta_id": acc}, headers=h)
    assert r.status_code == 200, r.text
    return r.json()


def _confirm(c, h, acc, movs):
    return c.post(f"{IMP}/confirmar", json={"movimientos": movs, "cuenta_id": acc, "banco": "brou",
                                            "nombre_archivo": "x.csv"}, headers=h)


class TestImportacion:
    def test_reparse_after_confirm_marks_duplicates(self, authed):
        c, h = authed
        acc = _account(c, h, "20000.00")
        data = _brou(["01/04/2026,01/04/2026,R1,Supermercado ABC,500.00,,0,EXT,001"])
        movs = _parse(c, h, acc, data)["movimientos"]
        assert _confirm(c, h, acc, movs).json()["importados"] == 1
        assert _parse(c, h, acc, data)["duplicados"] == 1

    def test_confirm_same_batch_twice_no_duplicates(self, authed):
        c, h = authed
        acc = _account(c, h, "20000.00")
        movs = _parse(c, h, acc, _brou(["01/04/2026,01/04/2026,R1,Supermercado ABC,500.00,,0,EXT,001"]))["movimientos"]
        assert _confirm(c, h, acc, movs).json()["importados"] == 1
        assert _confirm(c, h, acc, movs).json()["importados"] == 0

    def test_identical_rows_different_reference_both_imported(self, authed):
        c, h = authed
        acc = _account(c, h, "20000.00")
        res = _parse(c, h, acc, _brou([
            "01/04/2026,01/04/2026,R1,Cafe Central,120.00,,0,EXT,001",
            "01/04/2026,01/04/2026,R2,Cafe Central,120.00,,0,EXT,001",
        ]))
        assert res["exitosos"] == 2

    def test_zero_amount_row_does_not_break_batch(self, authed):
        c, h = authed
        acc = _account(c, h, "20000.00")
        movs = [
            {"fecha": "2026-04-01", "monto": -100.0, "descripcion": "A", "estado": "validado", "import_hash": "h1"},
            {"fecha": "2026-04-02", "monto": 0.0, "descripcion": "B", "estado": "validado", "import_hash": "h2"},
        ]
        r = _confirm(c, h, acc, movs)
        assert r.status_code == 200, r.text
        assert r.json()["importados"] == 1

    def test_insufficient_funds_row_reported_balance_kept(self, authed):
        c, h = authed
        acc = _account(c, h, "100.00")
        movs = [{"fecha": "2026-04-01", "monto": -500.0, "descripcion": "X", "estado": "validado",
                 "import_hash": "h9"}]
        r = _confirm(c, h, acc, movs)
        assert r.status_code == 200 and r.json()["importados"] == 0
        a = c.get(f"{BASE}/accounts/{acc}", headers=h).json()
        assert float(a["balance"]) == 100.0

    def test_other_users_account_404(self, authed):
        c, h = authed
        h2, _, _ = _new_user(c)
        acc2 = _account(c, h2)
        r = _confirm(c, h, acc2, [{"fecha": "2026-04-01", "monto": 100.0, "estado": "validado"}])
        assert r.status_code == 404

    def test_learning_applies_on_next_parse(self, authed):
        c, h = authed
        acc = _account(c, h, "20000.00")
        data = _brou(["01/04/2026,01/04/2026,R1,ZAPATERIA PEPE,300.00,,0,EXT,001"])
        movs = _parse(c, h, acc, data)["movimientos"]
        assert movs[0]["categoria"] is None
        movs[0]["categoria"] = "Ocio"
        _confirm(c, h, acc, movs)
        data2 = _brou(["05/04/2026,05/04/2026,R2,ZAPATERIA PEPE,300.00,,0,EXT,001"])
        assert _parse(c, h, acc, data2)["movimientos"][0]["categoria"] == "Ocio"

    def test_learning_correction_wins(self, authed):
        c, h = authed
        acc = _account(c, h, "20000.00")
        for i, cat in enumerate(["Ocio", "Salud"]):
            data = _brou([f"0{i+1}/04/2026,0{i+1}/04/2026,R{i},ZAPATERIA PEPE,300.00,,0,EXT,001"])
            movs = _parse(c, h, acc, data)["movimientos"]
            movs[0]["categoria"] = cat
            _confirm(c, h, acc, movs)
        data = _brou(["09/04/2026,09/04/2026,R9,ZAPATERIA PEPE,300.00,,0,EXT,001"])
        assert _parse(c, h, acc, data)["movimientos"][0]["categoria"] == "Salud"

    def test_historial(self, authed):
        c, h = authed
        acc = _account(c, h, "20000.00")
        _confirm(c, h, acc, [{"fecha": "2026-04-01", "monto": 100.0, "estado": "validado"}])
        r = c.get(f"{IMP}/historial", headers=h)
        assert r.status_code == 200 and len(r.json()) == 1


# ── Reviews ───────────────────────────────────────────────────────────────────

class TestReviews:
    def test_author_can_delete_resolved_review(self, authed, seeds):
        """Comportamiento intencional desde commit bf718f1; test_reviews.py quedó desactualizado."""
        c, admin_h = authed
        concept_id, _ = seeds
        hh, mh, _ = _household_with_member(c, admin_h)
        tx = _tx(c, admin_h, _account(c, admin_h), concept_id=concept_id, hh=hh)
        rid = c.post(f"{HH}/{hh}/reviews", json={"transaction_id": tx, "household_id": hh,
                                                 "flag_type": "monto_alto"}, headers=mh).json()["id"]
        c.patch(f"{HH}/{hh}/reviews/{rid}", json={"status": "resuelta"}, headers=admin_h)
        assert c.delete(f"{HH}/{hh}/reviews/{rid}", headers=mh).status_code == 204

    def test_outsider_cannot_list_reviews(self, authed, seeds):
        c, admin_h = authed
        hh, _, _ = _household_with_member(c, admin_h)
        h3, _, _ = _new_user(c)
        assert c.get(f"{HH}/{hh}/reviews", headers=h3).status_code == 403

    def test_member_cannot_respond(self, authed, seeds):
        c, admin_h = authed
        concept_id, _ = seeds
        hh, mh, _ = _household_with_member(c, admin_h)
        tx = _tx(c, admin_h, _account(c, admin_h), concept_id=concept_id, hh=hh)
        rid = c.post(f"{HH}/{hh}/reviews", json={"transaction_id": tx, "household_id": hh,
                                                 "flag_type": "monto_alto"}, headers=admin_h).json()["id"]
        assert c.patch(f"{HH}/{hh}/reviews/{rid}", json={"status": "resuelta"}, headers=mh).status_code == 403
