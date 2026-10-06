"""Templates de e-mail (string.Template; sem Jinja). Valores sao escapados no HTML.

Spec: docs/superpowers/specs/2026-10-06-email-resend-redefinicao-mfa-design.md, secao 1.
"""
import html
from functools import lru_cache
from pathlib import Path
from string import Template

PASTA = Path(__file__).resolve().parents[1] / "templates" / "email"

ASSUNTOS = {
    "redefinir_senha": "Redefinicao de senha - UAIZI NID",
    "codigo_verificacao": "Seu codigo de verificacao - UAIZI NID",
}


@lru_cache(maxsize=None)
def _ler(nome: str, extensao: str) -> Template:
    caminho = PASTA / f"{nome}.{extensao}"
    if not caminho.is_file():
        raise KeyError(f"template de e-mail desconhecido: {nome}.{extensao}")
    return Template(caminho.read_text(encoding="utf-8"))


def assunto(nome: str) -> str:
    return ASSUNTOS[nome]


def renderizar(template: str, **valores) -> tuple[str, str]:
    """(html, texto). O corpo do template entra em `$conteudo` do base."""
    if template not in ASSUNTOS:
        raise KeyError(f"template de e-mail desconhecido: {template}")
    valores_html = {k: html.escape(str(v), quote=True) for k, v in valores.items()}
    valores_txt = {k: str(v) for k, v in valores.items()}
    corpo_html = _ler(template, "html").safe_substitute(valores_html)
    corpo_txt = _ler(template, "txt").safe_substitute(valores_txt)
    pagina_html = _ler("base", "html").safe_substitute(conteudo=corpo_html)
    pagina_txt = _ler("base", "txt").safe_substitute(conteudo=corpo_txt)
    return pagina_html, pagina_txt
