"""
Fixtures compartidas para todos los tests.
Usa SQLite in-memory para aislamiento total — sin tocar la BD de producción.
Cada test recibe una BD limpia (tablas recreadas).
"""
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import app.models  # noqa: F401 — registra todos los modelos en Base.metadata
from app.models.base import Base
from app.main import app
from app.core.database import get_db

DATABASE_URL = "sqlite:///:memory:"

# Motor con StaticPool: todos los TestClient comparten la misma BD in-memory
engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


@pytest.fixture(autouse=True)
def reset_db():
    """Recrea el schema antes de cada test y lo destruye al final."""
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


@pytest.fixture
def db():
    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture
def client(db):
    """TestClient de FastAPI con la BD de test inyectada."""
    def override_get_db():
        yield db

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app, raise_server_exceptions=False) as c:
        yield c
    app.dependency_overrides.clear()


# ─── Constantes ───────────────────────────────────────────────────────────────

BASE = "/api/v1"
REG  = f"{BASE}/users/register"
LOG  = f"{BASE}/auth/login"

_counter = 0


def next_email() -> str:
    global _counter
    _counter += 1
    return f"user{_counter}@example.com"


# ─── Fixtures de alto nivel ───────────────────────────────────────────────────

@pytest.fixture
def user_data():
    return {
        "name": "Test User",
        "email": next_email(),
        "password": "Test1234!",
        "currency_default": "UYU",
    }


@pytest.fixture
def registered_user(client, user_data):
    """Usuario registrado. Devuelve el payload original + id de la respuesta."""
    r = client.post(REG, json=user_data)
    assert r.status_code == 201, r.text
    return {**user_data, **r.json()}


@pytest.fixture
def auth_headers(client, registered_user):
    """Headers con Bearer token válido."""
    r = client.post(LOG, data={
        "username": registered_user["email"],
        "password": registered_user["password"],
    })
    assert r.status_code == 200, r.text
    token = r.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def authed(client, auth_headers):
    """Tupla (client, auth_headers) lista para usar en tests."""
    return client, auth_headers


@pytest.fixture
def cash_account(authed):
    """Cuenta efectivo UYU con saldo 10000."""
    c, h = authed
    r = c.post(f"{BASE}/accounts", json={
        "name": "Efectivo", "type": "cash", "currency": "UYU", "balance": "10000.00",
    }, headers=h)
    assert r.status_code == 201, r.text
    return r.json()


@pytest.fixture
def debit_account(authed):
    """Cuenta débito UYU con saldo 50000."""
    c, h = authed
    r = c.post(f"{BASE}/accounts", json={
        "name": "Debito", "type": "debit", "currency": "UYU", "balance": "50000.00",
    }, headers=h)
    assert r.status_code == 201, r.text
    return r.json()


@pytest.fixture
def seeds(authed):
    """
    Devuelve el primer concepto y categoría semilla disponibles.
    Returns: (concept_id, category_id)
    """
    c, h = authed
    concepts = c.get(f"{BASE}/concepts", headers=h).json()
    cats     = c.get(f"{BASE}/categories", headers=h).json()
    assert concepts, "No hay conceptos semilla"
    assert cats, "No hay categorias semilla"
    return concepts[0]["id"], cats[0]["id"]
