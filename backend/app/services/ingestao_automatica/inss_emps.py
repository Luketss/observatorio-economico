"""Fonte automática: INSS — benefícios por município (EMPS/MPS).

XLSX anual nacional das Estatísticas Municipais da Previdência Social
(SÍNTESE/Dataprev): ben_municipios_especie_{ano}.xlsx (~3 MB, anos >= 2019).
Abas Qtd_dez{ano} (estoque de benefícios em dezembro) e Valor_Total_{ano}
(valor emitido no ano) — mesmas colunas A–M, header em 3 linhas mescladas,
dados a partir da linha cujo campo B é código IBGE de 7 dígitos.
REPLACE por (município, ano) com as 7 categorias-folha oficiais (subtotais
e Total ficam de fora — dupla contagem)."""
import io
from datetime import date

import requests

from app.services.ingestao_automatica.base import FonteAutomatica, ResumoIngestao, registrar
from app.services.ingestao_automatica.util import eh_nao_publicado

URL = "https://www.gov.br/previdencia/pt-br/assuntos/previdencia-social/arquivos/ben_municipios_especie_{ano}.xlsx"
INICIO_SERIE = 2019  # anos anteriores existem com nomes/paths antigos fora do padrão

# (índice 0-based na linha, nome da categoria) — só folhas mutuamente
# exclusivas: somam o Total (col 12); subtotais 3 e 10 ficam de fora.
CATEGORIAS: list[tuple[int, str]] = [
    (4, "Aposentadorias por idade"),
    (5, "Aposentadorias por invalidez"),
    (6, "Aposentadorias por tempo de contribuição"),
    (7, "Pensões por morte"),
    (8, "Auxílios"),
    (9, "Outros benefícios previdenciários"),
    (11, "Benefícios assistenciais"),
]


def parse_emps_aba(rows) -> dict[str, dict[str, float]]:
    """Linhas de uma aba do EMPS → {codigo_ibge: {categoria: valor}}.
    Linha de dados = campo B (índice 1) com código IBGE de 7 dígitos; o resto
    (headers mesclados, totais Brasil, rodapés) é ignorado."""
    out: dict[str, dict[str, float]] = {}
    for row in rows:
        codigo = str(row[1] if len(row) > 1 and row[1] is not None else "").strip()
        if not (codigo.isdigit() and len(codigo) == 7):
            continue
        vals: dict[str, float] = {}
        for idx, categoria in CATEGORIAS:
            v = row[idx] if len(row) > idx else None
            vals[categoria] = float(v) if v is not None and str(v).strip() != "" else 0.0
        out[codigo] = vals
    return out


def montar_registros(qtd_por_codigo, valor_por_codigo, alvo: dict[str, int], ano: int) -> list[dict]:
    """Casa Qtd × Valor por código IBGE dos municípios-alvo → dicts prontos
    para InssAnual(**d). Município ausente das DUAS abas fica de fora."""
    regs: list[dict] = []
    for codigo, mid in alvo.items():
        qtd = qtd_por_codigo.get(codigo)
        val = valor_por_codigo.get(codigo)
        if qtd is None and val is None:
            continue
        for _, categoria in CATEGORIAS:
            regs.append({
                "municipio_id": mid,
                "ano": ano,
                "categoria": categoria,
                "quantidade_beneficios": int((qtd or {}).get(categoria, 0.0)),
                "valor_anual": round((val or {}).get(categoria, 0.0), 2),
            })
    return regs


def achar_aba(sheetnames: list[str], prefixo: str) -> str | None:
    """Resolve aba por prefixo case-insensitive ('qtd', 'valor_total') — o
    sufixo varia entre anos (dez2024 vs dez24)."""
    for nome in sheetnames:
        if nome.lower().startswith(prefixo.lower()):
            return nome
    return None
