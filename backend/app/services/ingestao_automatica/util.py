"""Helpers compartilhados das fontes automáticas (CSV bulk)."""
import contextlib
import io
import zipfile

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
