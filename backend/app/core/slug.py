"""Slug ASCII minusculo para nomes de arquivo (espelho de utils/exportar.js slugify no front)."""
import re
import unicodedata


def slugify(texto: str | None, max_len: int = 60) -> str:
    if not texto:
        return ""
    s = unicodedata.normalize("NFKD", str(texto))
    s = "".join(ch for ch in s if not unicodedata.combining(ch))
    s = re.sub(r"[^A-Za-z0-9]+", "-", s).strip("-").lower()
    return s[:max_len].strip("-")
