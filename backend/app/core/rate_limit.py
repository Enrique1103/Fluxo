"""Freno de intentos de login fallidos (en memoria, por email y por IP).

Render corre una sola instancia, así que alcanza con memoria del proceso.
Si en el futuro hay varias instancias, esto debería pasar a Redis o a la DB.
"""
import os
import threading
import time

MAX_FAILURES = int(os.getenv("LOGIN_MAX_FAILURES", "5"))  # por email
# Por IP es más alto: varias personas pueden compartir la misma red
MAX_FAILURES_PER_IP = int(os.getenv("LOGIN_MAX_FAILURES_PER_IP", "20"))
WINDOW_SECONDS = int(os.getenv("LOGIN_WINDOW_SECONDS", "900"))  # 15 minutos

_lock = threading.Lock()
_failures: dict[str, list[float]] = {}


def _recent(key: str, now: float) -> list[float]:
    times = [t for t in _failures.get(key, []) if now - t < WINDOW_SECONDS]
    if times:
        _failures[key] = times
    else:
        _failures.pop(key, None)
    return times


def retry_after(limits: dict[str, int]) -> int:
    """{clave: máximo de fallos}. Segundos que faltan para reintentar; 0 si no está bloqueado."""
    now = time.time()
    with _lock:
        wait = 0
        for key, limit in limits.items():
            times = _recent(key, now)
            if len(times) >= limit:
                wait = max(wait, int(WINDOW_SECONDS - (now - times[-limit])) + 1)
        return wait


def register_failure(*keys: str) -> None:
    now = time.time()
    with _lock:
        for key in keys:
            _recent(key, now)
            _failures.setdefault(key, []).append(now)


def reset(*keys: str) -> None:
    with _lock:
        for key in keys:
            _failures.pop(key, None)


def clear_all() -> None:
    with _lock:
        _failures.clear()
