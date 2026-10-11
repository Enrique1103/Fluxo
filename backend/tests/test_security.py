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


# ── Recuperar contraseña ──────────────────────────────────────────────────────

def _capture_emails(monkeypatch):
    sent = []
    from app.core import mailer
    monkeypatch.setattr(mailer, "send_email", lambda to, subject, text, html=None: sent.append((to, text)) or True)
    return sent


def _token_from(text):
    return text.split("token=")[1].split()[0]


def test_recuperar_contrasena_completo(client, registered_user, monkeypatch):
    sent = _capture_emails(monkeypatch)
    r = client.post("/api/v1/auth/forgot-password", json={"email": registered_user["email"]})
    assert r.status_code == 202
    assert len(sent) == 1 and sent[0][0] == registered_user["email"]
    token = _token_from(sent[0][1])

    # El token de recuperación no sirve para entrar a la app
    assert client.get("/api/v1/users/me", headers={"Authorization": f"Bearer {token}"}).status_code == 401

    r = client.post("/api/v1/auth/reset-password", json={"token": token, "new_password": "Nueva1234!"})
    assert r.status_code == 204
    assert _login(client, registered_user["email"], "Nueva1234!").status_code == 200
    assert _login(client, registered_user["email"], registered_user["password"]).status_code == 401

    # Un solo uso: el mismo enlace ya no sirve
    r = client.post("/api/v1/auth/reset-password", json={"token": token, "new_password": "Otra1234!"})
    assert r.status_code == 401


def test_recuperar_email_inexistente_responde_igual(client, monkeypatch):
    sent = _capture_emails(monkeypatch)
    r = client.post("/api/v1/auth/forgot-password", json={"email": "nadie@example.com"})
    assert r.status_code == 202
    assert sent == []


def test_token_de_login_no_sirve_para_resetear(client, auth_headers):
    token = auth_headers["Authorization"].split()[1]
    r = client.post("/api/v1/auth/reset-password", json={"token": token, "new_password": "Nueva1234!"})
    assert r.status_code == 401


def test_recuperar_contrasena_valida_fortaleza(client, registered_user, monkeypatch):
    sent = _capture_emails(monkeypatch)
    client.post("/api/v1/auth/forgot-password", json={"email": registered_user["email"]})
    r = client.post("/api/v1/auth/reset-password", json={"token": _token_from(sent[0][1]), "new_password": "simple123"})
    assert r.status_code == 422


def test_recuperar_contrasena_limita_pedidos(client, registered_user, monkeypatch):
    _capture_emails(monkeypatch)
    for _ in range(3):
        assert client.post("/api/v1/auth/forgot-password", json={"email": registered_user["email"]}).status_code == 202
    assert client.post("/api/v1/auth/forgot-password", json={"email": registered_user["email"]}).status_code == 429


def test_mailer_usa_brevo_si_hay_clave(monkeypatch):
    import json as _json
    from app.core import mailer
    calls = []

    class _Resp:
        def __enter__(self): return self
        def __exit__(self, *a): return False

    def fake_urlopen(req, timeout):
        calls.append((req.full_url, req.headers, _json.loads(req.data)))
        return _Resp()

    monkeypatch.setenv("BREVO_API_KEY", "clave-de-prueba")
    monkeypatch.setenv("MAIL_FROM", "Fluxo <soporte@example.com>")
    monkeypatch.setattr(mailer.urllib.request, "urlopen", fake_urlopen)
    assert mailer.send_email("a@example.com", "Asunto", "texto", "<p>html</p>")
    url, headers, body = calls[0]
    assert url == "https://api.brevo.com/v3/smtp/email"
    assert headers["Api-key"] == "clave-de-prueba"
    assert body["sender"] == {"name": "Fluxo", "email": "soporte@example.com"}
    assert body["to"] == [{"email": "a@example.com"}]
