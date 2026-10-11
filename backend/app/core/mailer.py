"""Envío de emails por SMTP (sirve Gmail, Zoho, Brevo, Resend, etc.).

Variables de entorno:
  SMTP_HOST, SMTP_PORT (587 por defecto), SMTP_USER, SMTP_PASSWORD
  MAIL_FROM  (por defecto SMTP_USER), ej: "Fluxo <soporte@tudominio.com>"
Si SMTP_HOST no está configurado, el email no se envía y queda un aviso en el log.
"""
import logging
import os
import smtplib
from email.message import EmailMessage

logger = logging.getLogger("fluxo.mail")


def is_configured() -> bool:
    return bool(os.getenv("SMTP_HOST"))


def send_email(to: str, subject: str, text: str, html: str | None = None) -> bool:
    host = os.getenv("SMTP_HOST")
    if not host:
        logger.warning("SMTP no configurado: no se envió el email '%s'", subject)
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
