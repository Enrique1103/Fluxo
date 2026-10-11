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


# Palabras que van en minúscula dentro de un nombre ("Extracción en el Abitab")
_CONECTORES = {"a", "al", "con", "de", "del", "e", "el", "en", "la", "las", "lo", "los",
               "o", "para", "por", "sin", "u", "un", "una", "y"}


def _capitalizar(palabra: str, primera: bool, respetar_siglas: bool) -> str:
    if not palabra:
        return palabra
    baja = palabra.lower()
    if not primera and baja in _CONECTORES:
        return baja
    # Siglas cortas y códigos se respetan (STM, UTE, 4K) salvo que todo el nombre venga
    # en mayúsculas (los conceptos viejos se guardaban así: "LUZ" → "Luz")
    if any(ch.isdigit() for ch in palabra) or (respetar_siglas and palabra.isupper() and len(palabra) <= 3):
        return palabra
    return baja[0].upper() + baja[1:]


def normalize_label(text: str) -> str:
    """
    Formato único para categorías y conceptos: cada palabra con mayúscula inicial,
    conectores en minúscula y siglas cortas como están.
    'FERIA' → 'Feria' · 'EXTRACCIÓN EN EL ABITAB' → 'Extracción en el Abitab' ·
    'recargar STM' → 'Recargar STM' · 'uber/taxi' → 'Uber/Taxi' · 'remesas-cuba' → 'Remesas-Cuba'
    """
    text = re.sub(r"\s+", " ", text.strip())
    respetar_siglas = not text.isupper()
    out = []
    for i, palabra in enumerate(text.split(" ")):
        partes = re.split(r"([/-])", palabra)
        out.append("".join(
            p if p in "/-" and p else _capitalizar(p, i == 0 or j > 0, respetar_siglas)
            for j, p in enumerate(partes)
        ))
    return " ".join(out)


def normalize_concept(text: str) -> str:
    return normalize_label(text)


def normalize_category(text: str) -> str:
    return normalize_label(text)
