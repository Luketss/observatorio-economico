"""Dinheiro na Mesa — captação federal vs. municípios pares.

Pares = mesma faixa populacional do FPM (DL 1.881/81) + mesma UF; média
nacional da mesma faixa como referência secundária. Métrica principal:
valor firmado (VL_REPASSE_CONV) no último ano civil completo. Município do
grupo sem linha de captação = captação zero (o grupo vem da população)."""

ANO_INICIO = 2019

_CAMPOS_VAZIOS = {
    "disponivel": False, "motivo": None, "nao_aplicavel": False,
    "ano_referencia": None, "voce_firmado": None, "via_emenda": None,
    "desembolsado": None, "qtd_convenios": None, "media_pares": None,
    "media_nacional": None, "dinheiro_na_mesa": None, "acima_da_media": None,
    "posicao": None, "total_grupo": None, "serie": [],
    "uf": None, "faixa_pop_min": None, "faixa_pop_max": None, "coeficiente": None,
}


def media(valores: list) -> float | None:
    return (sum(valores) / len(valores)) if valores else None


def posicao_no_grupo(valor: float, valores_pares: list) -> int:
    """Posição no ranking de captação do grupo (1 = maior; o próprio incluído)."""
    return 1 + sum(1 for v in valores_pares if v > valor)


def montar_diagnostico(municipio_id: int, pares: set, nacional: set,
                       capt: dict, ano_corrente: int) -> dict:
    """Núcleo puro do diagnóstico. `capt`: mid → ano → {"firmado","via_emenda",
    "desembolsado","qtd"}. Ver docstring do módulo para a semântica de zero."""
    if not any(capt.get(m) for m in (pares | {municipio_id})):
        return {**_CAMPOS_VAZIOS, "motivo": "sem_dados"}

    def _valor(mid, ano, campo="firmado"):
        return (capt.get(mid) or {}).get(ano, {}).get(campo, 0.0) or 0.0

    anos = list(range(ANO_INICIO, ano_corrente + 1))
    ano_ref = ano_corrente - 1

    serie = []
    for ano in anos:
        vals_pares = [_valor(m, ano) for m in pares]
        m_pares = media(vals_pares)
        serie.append({
            "ano": ano,
            "voce": _valor(municipio_id, ano),
            "media_pares": round(m_pares, 2) if m_pares is not None else None,
            "via_emenda": _valor(municipio_id, ano, "via_emenda"),
            "desembolsado": _valor(municipio_id, ano, "desembolsado"),
            "qtd_convenios": int(_valor(municipio_id, ano, "qtd")),
            "parcial": ano == ano_corrente,
        })

    voce_ref = _valor(municipio_id, ano_ref)
    pares_ref = [_valor(m, ano_ref) for m in pares]
    nacional_ref = [_valor(m, ano_ref) for m in nacional]
    media_pares = media(pares_ref)
    media_nacional = media(nacional_ref)
    delta = (media_pares - voce_ref) if media_pares is not None else None
    return {
        **_CAMPOS_VAZIOS,
        "disponivel": True,
        "ano_referencia": ano_ref,
        "voce_firmado": voce_ref,
        "via_emenda": _valor(municipio_id, ano_ref, "via_emenda"),
        "desembolsado": _valor(municipio_id, ano_ref, "desembolsado"),
        "qtd_convenios": int(_valor(municipio_id, ano_ref, "qtd")),
        "media_pares": round(media_pares, 2) if media_pares is not None else None,
        "media_nacional": round(media_nacional, 2) if media_nacional is not None else None,
        "dinheiro_na_mesa": round(delta, 2) if delta is not None and delta > 0 else 0.0,
        "acima_da_media": bool(delta is not None and delta <= 0),
        "posicao": posicao_no_grupo(voce_ref, pares_ref),
        "total_grupo": len(pares) + 1,
        "serie": serie,
    }
