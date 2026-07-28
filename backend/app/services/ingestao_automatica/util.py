"""Helpers compartilhados das fontes automáticas (CSV bulk)."""
import contextlib
import io
import re
import unicodedata
import zipfile
from datetime import date

import requests


def parse_valor_br(s) -> float | None:
    """'1.234,56' / '1234,56' / '1234' → float; vazio ou '-' → None."""
    s = (s or "").strip()
    if not s or set(s) <= {"-"}:
        return None
    try:
        return float(s.replace(".", "").replace(",", "."))
    except ValueError:
        return None


def indices_colunas(header: list[str], obrigatorias: list[str], arquivo: str) -> dict[str, int]:
    """Header → {nome: índice}; ValueError audível se o layout do CSV mudou."""
    idx = {(c or "").strip(): i for i, c in enumerate(header)}
    faltando = [c for c in obrigatorias if c not in idx]
    if faltando:
        raise ValueError(f"{arquivo}: colunas ausentes {faltando} — layout mudou?")
    return idx


def baixar_zip(url: str, destino: str, timeout: tuple[int, int] = (30, 600)) -> str:
    """Download em streaming para disco (arquivos de até ~200 MB)."""
    with requests.get(url, stream=True, timeout=timeout,
                      headers={"User-Agent": "Mozilla/5.0"}) as resp:
        resp.raise_for_status()
        with open(destino, "wb") as f:
            for chunk in resp.iter_content(chunk_size=1024 * 1024):
                f.write(chunk)
    return destino


@contextlib.contextmanager
def linhas_zip(caminho: str, encoding: str = "utf-8-sig"):
    """Abre o primeiro CSV do zip como iterador de linhas de texto (streaming —
    nunca carrega o arquivo inteiro em memória). Context manager para fechar
    também o handle do ZIP — senão a limpeza do TemporaryDirectory falha no
    Windows com o arquivo ainda aberto."""
    with zipfile.ZipFile(caminho) as zf:
        nome = zf.namelist()[0]
        with zf.open(nome) as bruto:
            yield io.TextIOWrapper(bruto, encoding=encoding, newline="")


def eh_nao_publicado(exc) -> bool:
    """True se a exceção HTTP significa 'competência ainda não publicada' no
    host de download da CGU (dadosabertos-download.cgu.gov.br): lá 403 é o
    AccessDenied do S3 para objeto INEXISTENTE, não bloqueio de cliente —
    confirmado em 2026-07 (mês impossível também responde 403; meses
    publicados respondem 200 com o mesmo User-Agent)."""
    resp = getattr(exc, "response", None)
    return resp is not None and resp.status_code in (403, 404)


def agrupar_competencias(anomes: list[str]) -> str:
    """['202512','202601','202606'] → '202512–202601, 202606' (faixas de
    meses consecutivos, atravessando a virada de ano)."""
    def _prox(a: int, m: int) -> tuple[int, int]:
        return (a, m + 1) if m < 12 else (a + 1, 1)

    pares = sorted({(int(s[:4]), int(s[4:6])) for s in anomes})
    grupos: list[list[tuple[int, int]]] = []
    for par in pares:
        if grupos and par == _prox(*grupos[-1][1]):
            grupos[-1][1] = par
        else:
            grupos.append([par, par])

    def _fmt(p: tuple[int, int]) -> str:
        return f"{p[0]}{p[1]:02d}"

    return ", ".join(_fmt(a) if a == b else f"{_fmt(a)}–{_fmt(b)}" for a, b in grupos)


def msg_nao_publicadas(rotulo: str, anomes: list[str]) -> str | None:
    """Aviso único e legível para competências não publicadas, no lugar de um
    '403 Forbidden' técnico por mês."""
    if not anomes:
        return None
    faixa = agrupar_competencias(anomes)
    if len(set(anomes)) > 1:
        return f"{rotulo}: competências {faixa} ainda não publicadas pelo Portal da Transparência"
    return f"{rotulo}: competência {faixa} ainda não publicada pelo Portal da Transparência"


def norm_nome_municipio(s) -> str:
    """Normaliza nome de município para match entre a grafia IBGE do banco e
    grafias históricas de CSVs federais (acentos, caixa, hífens, 'th', s/z).
    Aplicar nos DOIS lados do match. (Movido de fpm_stn._norm_nome.)"""
    s = unicodedata.normalize("NFD", s or "")
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    s = s.lower().replace("-", " ").replace("'", " ").replace("’", " ")
    s = re.sub(r"\s+", " ", s).strip()
    return s.replace("th", "t").replace("z", "s")


def competencias_janela(anos=None, inicio=(2022, 1), meses_default=12, hoje=None):
    """Competências (ano, mes) de fontes mensais. Com `anos`, todos os meses
    desses anos; sem, as últimas `meses_default`. Sempre clampado entre
    `inicio` e o mês ANTERIOR a `hoje` (o mês corrente nunca está publicado)."""
    hoje = hoje or date.today()
    fim_ano, fim_mes = (hoje.year, hoje.month - 1) if hoje.month > 1 else (hoje.year - 1, 12)

    def _le(a, b):  # (ano, mes) <= (ano, mes)
        return a[0] < b[0] or (a[0] == b[0] and a[1] <= b[1])

    if anos:
        candidatas = [(a, m) for a in sorted(set(anos)) for m in range(1, 13)]
    else:
        candidatas = []
        a, m = fim_ano, fim_mes
        for _ in range(meses_default):
            candidatas.append((a, m))
            a, m = (a, m - 1) if m > 1 else (a - 1, 12)
        candidatas.reverse()
    return [c for c in candidatas if _le(inicio, c) and _le(c, (fim_ano, fim_mes))]
