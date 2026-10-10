"""Historial / trazabilidad de movimientos."""
from tests.conftest import BASE
from tests.test_transactions import tx_setup, TODAY  # noqa: F401

TX = f"{BASE}/transactions"


def _expense(c, h, acc, cid, cat):
    r = c.post(TX, json={"account_id": acc, "concept_id": cid, "category_id": cat,
                         "amount": "1000.00", "type": "expense", "date": TODAY, "description": "súper"}, headers=h)
    assert r.status_code == 201
    return r.json()


def test_create_update_delete_are_recorded(tx_setup):
    c, h, acc, cid, cat = tx_setup
    tx = _expense(c, h, acc, cid, cat)
    c.patch(f"{TX}/{tx['id']}", json={"amount": 800, "description": "feria"}, headers=h)
    c.patch(f"{TX}/{tx['id']}", json={"amount": 800}, headers=h)  # sin cambios → no se registra
    assert c.delete(f"{TX}/{tx['id']}", headers=h).status_code == 204

    hist = c.get(f"{TX}/{tx['id']}/history", headers=h).json()
    assert [e["action"] for e in hist] == ["create", "update", "delete"]
    assert hist[0]["snapshot"]["amount"] == "1000.00"
    assert hist[0]["snapshot"]["account_balance"] == "9000.00"
    assert hist[1]["changes"] == {"amount": ["1000.00", "800.00"], "description": ["súper", "feria"]}
    assert hist[1]["snapshot"]["account_balance"] == "9200.00"
    assert hist[2]["snapshot"]["amount"] == "800.00"

    recent = c.get(f"{TX}/history", headers=h).json()
    assert recent[0]["action"] == "delete"


def test_history_is_private(tx_setup, client):
    c, h, acc, cid, cat = tx_setup
    tx = _expense(c, h, acc, cid, cat)
    c.post(f"{BASE}/users/register", json={"name": "Otro", "email": "otro@example.com",
                                           "password": "Test1234!", "currency_default": "UYU"})
    tok = c.post(f"{BASE}/auth/login", data={"username": "otro@example.com", "password": "Test1234!"}).json()["access_token"]
    r = c.get(f"{TX}/{tx['id']}/history", headers={"Authorization": f"Bearer {tok}"})
    assert r.status_code in (403, 404)
    assert c.get(f"{TX}/history", headers={"Authorization": f"Bearer {tok}"}).json() == []
