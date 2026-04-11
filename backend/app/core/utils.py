import unicodedata
import re


def slugify(text: str) -> str:
    """
    Convierte un nombre a slug URL-safe.
    "Hogar y Construcción" → "hogar-construccion"
    """
    normalized = unicodedata.normalize("NFKD", text)
    ascii_text = normalized.encode("ascii", "ignore").decode("ascii")
    slug = re.sub(r"[^\w\s-]", "", ascii_text.lower())
    slug = re.sub(r"[-\s]+", "-", slug).strip("-")
    return slug[:60]


def normalize_concept(text: str) -> str:
    """Conceptos siempre en MAYÚSCULAS: 'netflix' → 'NETFLIX'"""
    return text.strip().upper()


def normalize_category(text: str) -> str:
    """Categorías en Title Case: 'alimentación' → 'Alimentación'"""
    return text.strip().title()
