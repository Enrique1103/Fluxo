"""Envío de emails.

Dos formas, en este orden:
  1. BREVO_API_KEY: por la API de Brevo (HTTPS). Es la que sirve en Render gratis,
     que bloquea las conexiones SMTP salientes.
  2. SMTP_HOST, SMTP_PORT (587 por defecto), SMTP_USER, SMTP_PASSWORD.
MAIL_FROM (por defecto SMTP_USER), ej: "Fluxo <soporte@tudominio.com>". En Brevo, esa
dirección tiene que estar verificada como remitente.
Si no hay ninguna configurada, el email no se envía y queda un aviso en el log.
"""
import json
import logging
import os
import smtplib
import urllib.error
import urllib.request
from email.message import EmailMessage
from email.utils import parseaddr

logger = logging.getLogger("fluxo.mail")


def is_configured() -> bool:
    return bool(os.getenv("BREVO_API_KEY") or os.getenv("SMTP_HOST"))


def _send_brevo(api_key: str, to: str, subject: str, text: str, html: str | None) -> bool:
    name, address = parseaddr(os.getenv("MAIL_FROM") or os.getenv("SMTP_USER") or "")
    payload = {
        "sender": {"name": name or "Fluxo", "email": address},
        "to": [{"email": to}],
        "subject": subject,
        "textContent": text,
        **({"htmlContent": html} if html else {}),
    }
    req = urllib.request.Request(
        "https://api.brevo.com/v3/smtp/email",
        data=json.dumps(payload).encode(),
        headers={"api-key": api_key, "Content-Type": "application/json", "Accept": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=15):
            return True
    except urllib.error.HTTPError as e:
        logger.error("Brevo rechazó el email '%s': %s %s", subject, e.code, e.read()[:300])
    except Exception:
        logger.exception("No se pudo enviar el email '%s' por Brevo", subject)
    return False


def send_email(to: str, subject: str, text: str, html: str | None = None) -> bool:
    api_key = os.getenv("BREVO_API_KEY")
    if api_key:
        return _send_brevo(api_key, to, subject, text, html)
    host = os.getenv("SMTP_HOST")
    if not host:
        logger.warning("Email no configurado (falta BREVO_API_KEY o SMTP_HOST): no se envió '%s'", subject)
        return False
    port = int(os.getenv("SMTP_PORT", "587"))
    user = os.getenv("SMTP_USER")
    password = os.getenv("SMTP_PASSWORD")

    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = os.getenv("MAIL_FROM") or user or "no-reply@fluxo.app"
    msg["To"] = to
    msg.set_content(text)
    if html:
        msg.add_alternative(html, subtype="html")

    try:
        if port == 465:
            server = smtplib.SMTP_SSL(host, port, timeout=15)
        else:
            server = smtplib.SMTP(host, port, timeout=15)
            server.starttls()
        with server:
            if user and password:
                server.login(user, password)
            server.send_message(msg)
        return True
    except Exception:
        logger.exception("No se pudo enviar el email '%s'", subject)
        return False
