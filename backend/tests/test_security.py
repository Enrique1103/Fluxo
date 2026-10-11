"""Seguridad: freno de intentos de login, CORS y cabeceras."""
from tests.conftest import LOG


def _login(client, email, password):
    return client.post(LOG, data={"username": email, "password": password})


def test_login_bloquea_tras_5_fallos(client, registered_user):
    email = registered_user["email"]
    for _ in range(5):
        assert _login(client, email, "Incorrecta1!").status_code == 401
    r = _login(client, email, "Incorrecta1!")
    assert r.status_code == 429
    assert "Retry-After" in r.headers
    # Bloqueado incluso con la contraseña correcta, hasta que pase la ventana
    assert _login(client, email, registered_user["password"]).status_code == 429


def test_login_correcto_reinicia_el_contador(client, registered_user):
    email = registered_user["email"]
    for _ in range(4):
        _login(client, email, "Incorrecta1!")
    assert _login(client, email, registered_user["password"]).status_code == 200
    for _ in range(4):
        assert _login(client, email, "Incorrecta1!").status_code == 401


def test_bloqueo_no_afecta_a_otro_email(client, registered_user):
    for _ in range(6):
        _login(client, "otro@example.com", "Incorrecta1!")
    assert _login(client, registered_user["email"], registered_user["password"]).status_code == 200


def test_cors_rechaza_sitios_ajenos(client):
    r = client.options(LOG, headers={
        "Origin": "https://sitio-malicioso.com",
        "Access-Control-Request-Method": "POST",
    })
    assert "access-control-allow-origin" not in r.headers


def test_cors_permite_el_frontend(client):
    for origin in ("https://fluxo-sage.vercel.app", "https://fluxo-git-rama-x.vercel.app", "http://localhost:5173"):
        r = client.options(LOG, headers={"Origin": origin, "Access-Control-Request-Method": "POST"})
        assert r.headers.get("access-control-allow-origin") == origin


def test_cabeceras_de_seguridad(client):
    r = _login(client, "nadie@example.com", "Incorrecta1!")
    assert r.headers["X-Content-Type-Options"] == "nosniff"
    assert r.headers["X-Frame-Options"] == "DENY"


def test_token_de_admin_no_sirve_como_usuario(client):
    from app.core import security
    token = security.create_access_token({"sub": "admin", "is_admin": True})
    r = client.get("/api/v1/users/me", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 401


def test_token_con_sub_invalido_da_401(client):
    from app.core import security
    token = security.create_access_token({"sub": "no-es-un-uuid", "is_admin": False})
    r = client.get("/api/v1/users/me", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 401
