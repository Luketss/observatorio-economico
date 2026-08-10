"""Fonte com arquivo: IPS — Índice de Progresso Social (ipsbrasil.org.br).

O site é uma SPA sem URL estável de download (verificado 2026-07-27 e
2026-08-10) — o admin baixa o ips_brasil_municipios_{ano}.xlsx na UI do site
e envia pela tela de coletas; o blob trafega pelo banco (ingestao_arquivo)
porque API e worker não compartilham filesystem. Aceita também o CSV já
convertido (';', utf-8-sig). UPSERT por (municipio_id, ano): reenviar o
arquivo corrige dados. Reusa o COLUMN_MAP do CLI ingestao/carregar_ips."""
import csv
import io

from ingestao.carregar_ips import COLUMN_MAP

COLUNAS_ESSENCIAIS = ("Código IBGE", "UF")


def _para_float(v) -> float | None:
    """Aceita número (XLSX) e string com vírgula decimal (CSV)."""
    if v is None:
        return None
    if isinstance(v, (int, float)):
        return float(v)
    s = str(v).strip().replace(",", ".")
    if not s:
        return None
    try:
        return float(s)
    except ValueError:
        return None


def ler_linhas(conteudo: bytes) -> list[dict]:
    """Bytes do upload → dicts header→valor. XLSX (zip 'PK') ou CSV ';'."""
    if conteudo[:2] == b"PK":
        return _ler_xlsx(conteudo)
    return _ler_csv(conteudo)


def _ler_xlsx(conteudo: bytes) -> list[dict]:
    import openpyxl

    wb = openpyxl.load_workbook(io.BytesIO(conteudo), read_only=True, data_only=True)
    ws = wb[wb.sheetnames[0]]
    # o XLSX do site declara dimensão errada (A1) — sem isto só a 1ª célula sai
    ws.reset_dimensions()
    linhas = ws.iter_rows(values_only=True)
    header = [str(h).strip() if h is not None else "" for h in next(linhas, [])]
    return [dict(zip(header, row)) for row in linhas]


def _ler_csv(conteudo: bytes) -> list[dict]:
    return list(csv.DictReader(io.StringIO(conteudo.decode("utf-8-sig")), delimiter=";"))


def validar_headers(linhas: list[dict]) -> str | None:
    """None se ok; mensagem legível se o arquivo não parece o IPS nacional."""
    if not linhas:
        return "arquivo vazio ou sem linhas de dados — o IPS nacional tem ~5.570 municípios"
    headers = set(linhas[0].keys())
    faltando = [c for c in COLUNAS_ESSENCIAIS if c not in headers]
    if faltando or not headers & set(COLUMN_MAP):
        cols = ", ".join(f"'{c}'" for c in faltando) or "as colunas de métricas"
        return f"arquivo não parece ser o IPS nacional — colunas ausentes: {cols}"
    return None


def identificacao(row: dict) -> tuple[str | None, str, str]:
    """(codigo_ibge, nome sem o sufixo ' (UF)', UF em caixa alta)."""
    codigo = str(row.get("Código IBGE") or "").strip()
    nome = str(row.get("Município") or row.get("Municipio") or "").strip()
    if "(" in nome:
        nome = nome[: nome.index("(")].strip()
    uf = str(row.get("UF") or "").strip().upper()
    return (codigo or None, nome, uf)


def linha_para_kwargs(row: dict, municipio_id: int, ano: int) -> dict:
    """Kwargs prontos para IpsMunicipio(**kwargs) — mesma semântica do CLI."""
    kwargs = {"municipio_id": municipio_id, "ano": ano}
    kwargs["area_km2"] = _para_float(row.get("Área (km²)", row.get("Area (km2)")))
    populacao = _para_float(row.get("População 2022", row.get("Populacao 2022")))
    kwargs["populacao"] = int(populacao) if populacao is not None else None
    kwargs["pib_per_capita"] = _para_float(row.get("PIB per capita 2021"))
    for coluna, campo in COLUMN_MAP.items():
        if coluna in row and campo not in kwargs:
            kwargs[campo] = _para_float(row[coluna])
    return kwargs
