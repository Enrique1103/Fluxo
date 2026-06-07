"""Tests de transaction reviews (F06)."""
import pytest
from datetime import date
from tests.conftest import BASE, next_email

HH  = f"{BASE}/households"
TXN = f"{BASE}/transactions"
TODAY = date.today()


def _register_and_login(client) -> dict:
    email = next_email()
    client.post(f"{BASE}/users/register", json={
        "name": "Miembro",
        "email": email,
        "password": "Test1234!",
        "currency_default": "UYU",
    })
    r = client.post(f"{BASE}/auth/login", data={"username": email, "password": "Test1234!"})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def _reviews_url(hh_id: str) -> str:
    return f"{HH}/{hh_id}/reviews"


@pytest.fixture
def household_with_member(authed):
    """Admin crea hogar, segundo usuario se une y es aprobado. Devuelve (client, admin_h, member_h, hh_id)."""
    c, admin_h = authed

    # Crear hogar
    hh_r = c.post(HH, json={"name": "Hogar Reviews", "base_currency": "UYU", "split_type": "equal"}, headers=admin_h)
    assert hh_r.status_code == 201, hh_r.text
    hh_id = hh_r.json()["id"]

    # Generar invite y unir segundo usuario
    code = c.post(f"{HH}/{hh_id}/invite", headers=admin_h).json()["code"]
    member_h = _register_and_login(c)
    joined = c.post(f"{HH}/join", json={"code": code}, headers=member_h).json()
    user2_id = joined["user_id"]

    # Admin aprueba
    c.post(f"{HH}/{hh_id}/members/{user2_id}/approve", headers=admin_h)

    return c, admin_h, member_h, hh_id


@pytest.fixture
def shared_tx(household_with_member, seeds):
    """Transacción del hogar creada por el admin."""
    c, admin_h, member_h, hh_id = household_with_member
    concept_id, category_id = seeds

    # Cuenta para el admin
    acc = c.post(f"{BASE}/accounts", json={
        "name": "Débito Test", "type": "debit", "currency": "UYU", "balance": "50000.00",
    }, headers=admin_h).json()

    tx = c.post(TXN, json={
        "amount": "1500.00",
        "type": "expense",
        "date": str(TODAY),
        "account_id": acc["id"],
        "concept_id": concept_id,
        "category_id": category_id,
        "household_id": hh_id,
    }, headers=admin_h)
    assert tx.status_code == 201, tx.text
    return c, admin_h, member_h, hh_id, tx.json()["id"]


# ---------------------------------------------------------------------------
# Crear reviews
# ---------------------------------------------------------------------------

class TestCreateReview:
    def test_member_can_flag_shared_tx_201(self, shared_tx):
        c, admin_h, member_h, hh_id, tx_id = shared_tx
        r = c.post(_reviews_url(hh_id), json={
            "transaction_id": tx_id,
            "household_id": hh_id,
            "flag_type": "monto_alto",
            "comment": "¿Por qué tan caro?",
        }, headers=member_h)
        assert r.status_code == 201, r.text
        body = r.json()
        assert body["flag_type"] == "monto_alto"
        assert body["status"] == "pendiente"
        assert body["comment"] == "¿Por qué tan caro?"

    def test_create_without_comment_201(self, shared_tx):
        c, admin_h, member_h, hh_id, tx_id = shared_tx
        r = c.post(_reviews_url(hh_id), json={
            "transaction_id": tx_id,
            "household_id": hh_id,
            "flag_type": "innecesario",
        }, headers=admin_h)
        assert r.status_code == 201
        assert r.json()["comment"] is None

    def test_non_member_cannot_flag_403(self, shared_tx):
        c, admin_h, member_h, hh_id, tx_id = shared_tx
        outsider = _register_and_login(c)
        r = c.post(_reviews_url(hh_id), json={
            "transaction_id": tx_id,
            "household_id": hh_id,
            "flag_type": "sospechoso",
        }, headers=outsider)
        assert r.status_code == 403

    def test_tx_not_in_household_422(self, shared_tx, seeds):
        c, admin_h, member_h, hh_id, tx_id = shared_tx
        concept_id, category_id = seeds

        # Transacción personal (sin household_id)
        acc = c.post(f"{BASE}/accounts", json={
            "name": "Efectivo2", "type": "cash", "currency": "UYU", "balance": "5000.00",
        }, headers=admin_h).json()
        personal_tx = c.post(TXN, json={
            "amount": "200.00",
            "type": "expense",
            "date": str(TODAY),
            "account_id": acc["id"],
            "concept_id": concept_id,
            "category_id": category_id,
        }, headers=admin_h).json()

        r = c.post(_reviews_url(hh_id), json={
            "transaction_id": personal_tx["id"],
            "household_id": hh_id,
            "flag_type": "otra",
        }, headers=member_h)
        assert r.status_code == 422


# ---------------------------------------------------------------------------
# Listar reviews
# ---------------------------------------------------------------------------

class TestListReviews:
    def test_list_all_reviews_in_household(self, shared_tx):
        c, admin_h, member_h, hh_id, tx_id = shared_tx
        # Crear dos reviews
        c.post(_reviews_url(hh_id), json={
            "transaction_id": tx_id,
            "household_id": hh_id,
            "flag_type": "monto_alto",
        }, headers=member_h)
        c.post(_reviews_url(hh_id), json={
            "transaction_id": tx_id,
            "household_id": hh_id,
            "flag_type": "innecesario",
        }, headers=admin_h)

        r = c.get(_reviews_url(hh_id), headers=admin_h)
        assert r.status_code == 200
        assert len(r.json()) == 2

    def test_filter_by_status(self, shared_tx):
        c, admin_h, member_h, hh_id, tx_id = shared_tx
        r_create = c.post(_reviews_url(hh_id), json={
            "transaction_id": tx_id,
            "household_id": hh_id,
            "flag_type": "pregunta",
        }, headers=member_h)
        review_id = r_create.json()["id"]

        # Admin responde → estado "respondida"
        c.patch(f"{_reviews_url(hh_id)}/{review_id}", json={
            "status": "respondida",
            "response_comment": "Claro, era necesario",
        }, headers=admin_h)

        pending = c.get(_reviews_url(hh_id), params={"status": "pendiente"}, headers=admin_h)
        assert len(pending.json()) == 0

        answered = c.get(_reviews_url(hh_id), params={"status": "respondida"}, headers=admin_h)
        assert len(answered.json()) == 1

    def test_list_by_transaction(self, shared_tx):
        c, admin_h, member_h, hh_id, tx_id = shared_tx
        c.post(_reviews_url(hh_id), json={
            "transaction_id": tx_id,
            "household_id": hh_id,
            "flag_type": "categoria_incorrecta",
        }, headers=member_h)

        r = c.get(f"{_reviews_url(hh_id)}/transaction/{tx_id}", headers=admin_h)
        assert r.status_code == 200
        assert len(r.json()) >= 1

    def test_non_member_cannot_list_403(self, shared_tx):
        c, admin_h, member_h, hh_id, tx_id = shared_tx
        outsider = _register_and_login(c)
        r = c.get(_reviews_url(hh_id), headers=outsider)
        assert r.status_code == 403


# ---------------------------------------------------------------------------
# Responder reviews
# ---------------------------------------------------------------------------

class TestRespondReview:
    def test_admin_can_respond_200(self, shared_tx):
        c, admin_h, member_h, hh_id, tx_id = shared_tx
        rev_id = c.post(_reviews_url(hh_id), json={
            "transaction_id": tx_id,
            "household_id": hh_id,
            "flag_type": "sospechoso",
        }, headers=member_h).json()["id"]

        r = c.patch(f"{_reviews_url(hh_id)}/{rev_id}", json={
            "status": "resuelta",
            "response_comment": "Confirmado, se corrigió",
        }, headers=admin_h)
        assert r.status_code == 200
        body = r.json()
        assert body["status"] == "resuelta"
        assert body["response_comment"] == "Confirmado, se corrigió"
        assert body["response_at"] is not None

    def test_non_admin_cannot_respond_403(self, shared_tx):
        c, admin_h, member_h, hh_id, tx_id = shared_tx
        rev_id = c.post(_reviews_url(hh_id), json={
            "transaction_id": tx_id,
            "household_id": hh_id,
            "flag_type": "otra",
        }, headers=admin_h).json()["id"]

        r = c.patch(f"{_reviews_url(hh_id)}/{rev_id}", json={
            "status": "descartada",
        }, headers=member_h)
        assert r.status_code == 403

    def test_respond_already_resolved_409(self, shared_tx):
        c, admin_h, member_h, hh_id, tx_id = shared_tx
        rev_id = c.post(_reviews_url(hh_id), json={
            "transaction_id": tx_id,
            "household_id": hh_id,
            "flag_type": "monto_alto",
        }, headers=member_h).json()["id"]

        # Primera respuesta
        c.patch(f"{_reviews_url(hh_id)}/{rev_id}", json={"status": "resuelta"}, headers=admin_h)

        # Segunda respuesta sobre una ya resuelta → 409
        r = c.patch(f"{_reviews_url(hh_id)}/{rev_id}", json={"status": "descartada"}, headers=admin_h)
        assert r.status_code == 409


# ---------------------------------------------------------------------------
# Eliminar reviews
# ---------------------------------------------------------------------------

class TestDeleteReview:
    def test_author_can_delete_pending_204(self, shared_tx):
        c, admin_h, member_h, hh_id, tx_id = shared_tx
        rev_id = c.post(_reviews_url(hh_id), json={
            "transaction_id": tx_id,
            "household_id": hh_id,
            "flag_type": "innecesario",
        }, headers=member_h).json()["id"]

        r = c.delete(f"{_reviews_url(hh_id)}/{rev_id}", headers=member_h)
        assert r.status_code == 204

        # Ya no aparece en la lista
        remaining = c.get(_reviews_url(hh_id), headers=admin_h).json()
        ids = [rv["id"] for rv in remaining]
        assert rev_id not in ids

    def test_non_author_cannot_delete_403(self, shared_tx):
        c, admin_h, member_h, hh_id, tx_id = shared_tx
        rev_id = c.post(_reviews_url(hh_id), json={
            "transaction_id": tx_id,
            "household_id": hh_id,
            "flag_type": "innecesario",
        }, headers=member_h).json()["id"]

        # Admin intenta borrar la review del miembro → 403
        r = c.delete(f"{_reviews_url(hh_id)}/{rev_id}", headers=admin_h)
        assert r.status_code == 403

    def test_cannot_delete_resolved_review_409(self, shared_tx):
        c, admin_h, member_h, hh_id, tx_id = shared_tx
        rev_id = c.post(_reviews_url(hh_id), json={
            "transaction_id": tx_id,
            "household_id": hh_id,
            "flag_type": "monto_alto",
        }, headers=member_h).json()["id"]

        # Admin la resuelve
        c.patch(f"{_reviews_url(hh_id)}/{rev_id}", json={"status": "resuelta"}, headers=admin_h)

        # El autor intenta borrarla → 409
        r = c.delete(f"{_reviews_url(hh_id)}/{rev_id}", headers=member_h)
        assert r.status_code == 409
