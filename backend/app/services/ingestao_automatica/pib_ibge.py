"""Fonte automática: PIB dos Municípios (IBGE, agregado 5938).

A API retorna valores em "Mil Reais"; convertemos (×1000) e armazenamos em
R$ (reais cheios) — a unidade real da tabela pib_anual legada e a esperada
pelo frontend. Grava apenas tipo_dado="REAL"; linhas PROJETADO legadas ficam
intocadas. O IBGE publica com defasagem de ~2 anos; sem `anos`, usa os
últimos 6 disponíveis (períodos "-6")."""
import logging

import requests

from app.services.ingestao_automatica.base import FonteAutomatica, ResumoIngestao, registrar

logger = logging.getLogger(__name__)

# id da variável na API → coluna do model PibAnual (API em Mil Reais; gravado em R$)
VARIAVEIS = {
    "37": "pib_total",
    "513": "va_agropecuaria",
    "517": "va_industria",
    "6575": "va_servicos",
    "525": "va_governo",
}
IBGE_URL = (
    "https://servicodados.ibge.gov.br/api/v3/agregados/5938/"
    "periodos/{periodos}/variaveis/" + "|".join(VARIAVEIS) + "?localidades=N6[{codigos}]"
)
_CHUNK = 50  # códigos por requisição (URL menor que a do agregado 6579: 5 variáveis)


def parse_pib_ibge(payload) -> dict[str, dict[int, dict]]:
    """Payload da API → {codigo_ibge: {ano: {coluna: valor_float}}}.
    Converte Mil Reais (unidade da API) para R$ cheios (×1000 — unidade do
    banco legado). Valores não numéricos ('...', '-') são ignorados."""
    out: dict[str, dict[int, dict]] = {}
    for variavel in payload or []:
        coluna = VARIAVEIS.get(str(variavel.get("id")))
        if coluna is None:
            continue
        for resultado in variavel.get("resultados", []):
            for serie in resultado.get("series", []):
                codigo = str((serie.get("localidade") or {}).get("id") or "")
                for ano_str, valor in (serie.get("serie") or {}).items():
                    try:
                        out.setdefault(codigo, {}).setdefault(int(ano_str), {})[coluna] = float(valor) * 1000.0
                    except (TypeError, ValueError):
                        continue
    return {k: {a: v for a, v in anos.items() if v} for k, anos in out.items() if anos}


def executar(db, municipios, anos=None, usuario_id=None, notificar=True, progresso=None) -> ResumoIngestao:
    from app.models.pib import PibAnual
    from app.services.ingestao_automatica.populacao_ibge import codigo_ibge_valido

    resumo = ResumoIngestao(dataset="pib")
    com_codigo = []
    for m in municipios:
        if codigo_ibge_valido(m.codigo_ibge):
            com_codigo.append(m)
        else:
            resumo.municipios_erro += 1
            resumo.erros.append(f"{m.nome}/{m.estado}: codigo_ibge ausente/inválido")
    if not com_codigo:
        return resumo

    periodos = "|".join(str(a) for a in sorted(set(anos))) if anos else "-6"

    por_codigo: dict[str, dict[int, dict]] = {}
    codigos = [m.codigo_ibge.strip() for m in com_codigo]
    for i in range(0, len(codigos), _CHUNK):
        chunk = codigos[i:i + _CHUNK]
        if progresso:
            progresso(0, len(com_codigo), f"consultando IBGE (lote {i // _CHUNK + 1})")
        try:
            resp = requests.get(
                IBGE_URL.format(periodos=periodos, codigos=",".join(chunk)), timeout=120
            )
            resp.raise_for_status()
            for codigo, serie in parse_pib_ibge(resp.json()).items():
                por_codigo.setdefault(codigo, {}).update(serie)
        except requests.RequestException as exc:
            resumo.erros.append(f"IBGE PIB (lote {i // _CHUNK + 1}): {exc}")

    for i, m in enumerate(com_codigo, start=1):
        if progresso:
            progresso(i, len(com_codigo), "processando municípios")
        serie = por_codigo.get(m.codigo_ibge.strip())
        if not serie:
            resumo.municipios_erro += 1
            resumo.erros.append(f"{m.nome}/{m.estado}: IBGE não retornou PIB")
            continue
        existentes = {
            r.ano: r
            for r in db.query(PibAnual)
            .filter(PibAnual.municipio_id == m.id, PibAnual.tipo_dado == "REAL")
            .all()
        }
        for ano, valores in sorted(serie.items()):
            if "pib_total" not in valores:
                continue  # PIB_Total nunca deve ser null (GUIA)
            reg = existentes.get(ano)
            if reg:
                for coluna, valor in valores.items():
                    setattr(reg, coluna, valor)
            else:
                db.add(PibAnual(municipio_id=m.id, ano=ano, tipo_dado="REAL", **valores))
            resumo.linhas += 1
        resumo.municipios_ok += 1
        db.commit()
    return resumo


registrar(FonteAutomatica(
    key="pib",
    label="PIB Municipal (IBGE)",
    fonte="IBGE — Produto Interno Bruto dos Municípios (agregado 5938; armazenado em R$)",
    executar=executar,
))
