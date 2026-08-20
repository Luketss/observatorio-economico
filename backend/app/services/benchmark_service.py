"""Registry do Benchmark: os 10 indicadores comparáveis como série anual
uniforme `(municipio_id, ano, valor)`.

Cada consulta espelha a agregação do endpoint comparativo homônimo já
existente (mesma fonte de verdade dos precedentes F4/F5) — inclusive as
semânticas herdadas: ESTBAN soma saldos mensais do ano (como o
`/estban/comparativo` atual) e COMEX considera só exportações. Municípios
demo ficam fora do cross-município (pool de pares, cobertura, posição) —
dado fabricado não entra em analytics; a série do PRÓPRIO foco os inclui
via `incluir_demo=True`, paridade com /pib/comparativo.

`calcular_posicao` é puro de propósito — o router passa os valores do
último ano e o mapa de UFs (que já tem via `carregar_refs`)."""
from dataclasses import dataclass
from typing import Callable

from sqlalchemy import extract, func

from app.models.arrecadacao import ArrecadacaoMensal
from app.models.bolsa_familia import BolsaFamiliaResumo
from app.models.caged import CagedMovimentacao
from app.models.comex import ComexMensal
from app.models.estban import EstbanMensal
from app.models.inss import InssAnual
from app.models.municipio import Municipio
from app.models.pib import PibAnual
from app.models.pix import PixMensal
from app.models.rais import RaisVinculo
from app.models.vaf import VafAnual


@dataclass(frozen=True)
class IndicadorBenchmark:
    key: str
    label: str
    unidade: str  # brl | usd | numero | indice
    linhas: Callable  # (db, municipio_ids=None, anos=None, incluir_demo=False) -> [(mid, ano, valor)]


def _linhas_agregadas(col_mid, col_ano, expr_valor, filtros=()):
    """Fábrica da consulta anual agregada. Os filtros de município/ano incidem
    ANTES do group_by (são as chaves do grupo, então o recorte é válido).
    `incluir_demo` só dispensa o filtro de demo do cross-município (pool de
    cobertura/posição) — a série do próprio foco pode incluir demo."""
    def linhas(db, municipio_ids=None, anos=None, incluir_demo=False):
        q = (
            db.query(col_mid.label("mid"), col_ano.label("ano"), expr_valor.label("valor"))
            .join(Municipio, Municipio.id == col_mid)
        )
        if not incluir_demo:
            q = q.filter(Municipio.is_demo.is_(False))
        for f in filtros:
            q = q.filter(f)
        if municipio_ids is not None:
            q = q.filter(col_mid.in_(municipio_ids))
        if anos is not None:
            q = q.filter(col_ano.in_(anos))
        # extract("year", ...) volta Decimal/str dependendo do backend — int() normaliza.
        return [
            (r.mid, int(r.ano), float(r.valor))
            for r in q.group_by(col_mid, col_ano).order_by(col_mid, col_ano).all()
            if r.valor is not None
        ]
    return linhas


# max() no PIB/VAF: a unique key do PIB inclui tipo_dado (REAL/PROJETADO) —
# sum() dobraria o valor se os dois coexistissem num ano.
INDICADORES_BENCHMARK: dict[str, IndicadorBenchmark] = {
    "pib": IndicadorBenchmark("pib", "PIB Total", "brl", _linhas_agregadas(
        PibAnual.municipio_id, PibAnual.ano, func.max(PibAnual.pib_total))),
    # indice_participacao_municipal é a FRAÇÃO do IPM (o que a página VAF
    # plota); pct_ipm é a variação YoY pré-computada — plotá-la aqui rotulada
    # de "índice" mostrava a coisa errada no gráfico e no ranking.
    "vaf": IndicadorBenchmark("vaf", "VAF · Índice IPM", "indice", _linhas_agregadas(
        VafAnual.municipio_id, VafAnual.ano_base,
        func.max(VafAnual.indice_participacao_municipal))),
    "arrecadacao": IndicadorBenchmark("arrecadacao", "Arrecadação Total", "brl", _linhas_agregadas(
        ArrecadacaoMensal.municipio_id, ArrecadacaoMensal.ano, func.sum(ArrecadacaoMensal.valor_total))),
    "caged": IndicadorBenchmark("caged", "Saldo CAGED", "numero", _linhas_agregadas(
        CagedMovimentacao.municipio_id, CagedMovimentacao.ano, func.sum(CagedMovimentacao.saldo))),
    "rais": IndicadorBenchmark("rais", "Vínculos RAIS", "numero", _linhas_agregadas(
        RaisVinculo.municipio_id, RaisVinculo.ano, func.sum(RaisVinculo.total_vinculos))),
    "estban": IndicadorBenchmark("estban", "Crédito ESTBAN", "brl", _linhas_agregadas(
        EstbanMensal.municipio_id, extract("year", EstbanMensal.data_referencia),
        func.sum(EstbanMensal.valor_operacoes_credito))),
    "comex": IndicadorBenchmark("comex", "Exportações COMEX", "usd", _linhas_agregadas(
        ComexMensal.municipio_id, ComexMensal.ano, func.sum(ComexMensal.valor_usd),
        filtros=(func.lower(ComexMensal.tipo_operacao).in_(("exp", "export")),))),
    "pix": IndicadorBenchmark("pix", "Volume PIX", "brl", _linhas_agregadas(
        PixMensal.municipio_id, PixMensal.ano,
        func.sum(func.coalesce(PixMensal.vl_pagador_pf, 0) + func.coalesce(PixMensal.vl_pagador_pj, 0)))),
    "bolsa_familia": IndicadorBenchmark("bolsa_familia", "Bolsa Família (repasses)", "brl", _linhas_agregadas(
        BolsaFamiliaResumo.municipio_id, BolsaFamiliaResumo.ano, func.sum(BolsaFamiliaResumo.valor_total))),
    "inss": IndicadorBenchmark("inss", "Benefícios INSS", "brl", _linhas_agregadas(
        InssAnual.municipio_id, InssAnual.ano, func.sum(InssAnual.valor_anual))),
}


def calcular_posicao(
    valores: list[tuple[int, float]],
    estados: dict[int, str],
    foco_id: int,
    ano: int,
) -> dict | None:
    """Rank do foco no último ano — nacional e na UF do foco. `valores` já vem
    sem demo (saem das `linhas` do registry). Molde do /ips/ranking: rank =
    quantos têm valor MAIOR + 1; `total` = quem tem dado no ano."""
    por_mid = dict(valores)
    if foco_id not in por_mid:
        return None
    v_foco = por_mid[foco_id]
    uf = estados.get(foco_id)
    todos = list(por_mid.values())
    da_uf = [v for m, v in por_mid.items() if estados.get(m) == uf]
    return {
        "ano": ano,
        "nacional": {"rank": sum(1 for v in todos if v > v_foco) + 1, "total": len(todos)},
        "estadual": {"rank": sum(1 for v in da_uf if v > v_foco) + 1, "total": len(da_uf)},
    }
