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
    "posicao": None, "total_grupo": None, "pares_com_dados": None, "serie": [],
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
        "pares_com_dados": sum(1 for m in pares if capt.get(m)),
        "serie": serie,
    }


# ── camada DB (fina; verificada via endpoints) ───────────────────────────────
from sqlalchemy.orm import Session

from app.services.fpm_service import CAPITAIS_IBGE, faixa_para_populacao


def _base_grupos(db: "Session"):
    """2 queries batched: refs de município (com população mais recente) e todas
    as linhas de captação da janela."""
    from app.models.captacao_federal import CaptacaoFederalAnual
    from app.services.pares_service import carregar_refs

    refs = carregar_refs(db)

    capt_rows = (
        db.query(CaptacaoFederalAnual)
        .filter(CaptacaoFederalAnual.ano >= ANO_INICIO)
        .all()
    )
    capt: dict[int, dict[int, dict]] = {}
    for r in capt_rows:
        capt.setdefault(r.municipio_id, {})[r.ano] = {
            "firmado": float(r.valor_firmado), "via_emenda": float(r.valor_via_emenda),
            "desembolsado": float(r.valor_desembolsado), "qtd": r.qtd_convenios,
        }
    return refs, capt


def _pares_de(municipio_id: int, refs: dict):
    """(meta faixa/uf, pares mesma faixa+UF, nacional mesma faixa) — exclui o
    próprio município, capitais e municípios demo dos grupos. Grupos ILIMITADOS:
    aqui eles são amostra estatística (média/posição), não linhas de gráfico."""
    from app.services.pares_service import eh_capital, mesma_faixa

    foco = refs[municipio_id]
    faixa = faixa_para_populacao(foco.populacao)
    pares, nacional = set(), set()
    for mid, ref in refs.items():
        if mid == municipio_id or ref.is_demo or eh_capital(ref):
            continue
        if not mesma_faixa(foco, ref):
            continue
        nacional.add(mid)
        if ref.estado == foco.estado:
            pares.add(mid)
    return {"faixa": faixa, "uf": foco.estado}, pares, nacional


def calcular_diagnostico(db: "Session", municipio_id: int) -> dict:
    from datetime import date

    from app.models.municipio import Municipio

    municipio = db.get(Municipio, municipio_id)
    if municipio is None:
        return {**_CAMPOS_VAZIOS, "motivo": "municipio_nao_encontrado"}
    if not municipio.codigo_ibge:
        return {**_CAMPOS_VAZIOS, "motivo": "sem_codigo_ibge"}
    if municipio.codigo_ibge in CAPITAIS_IBGE:
        return {**_CAMPOS_VAZIOS, "motivo": "capital", "nao_aplicavel": True}

    refs, capt = _base_grupos(db)
    if municipio_id not in refs or refs[municipio_id].populacao is None:
        return {**_CAMPOS_VAZIOS, "motivo": "sem_populacao"}

    meta, pares, nacional = _pares_de(municipio_id, refs)
    diag = montar_diagnostico(municipio_id, pares, nacional, capt, date.today().year)
    faixa = meta["faixa"]
    return {**diag, "uf": meta["uf"], "faixa_pop_min": faixa.pop_min,
            "faixa_pop_max": faixa.pop_max, "coeficiente": faixa.coeficiente}


_CHAVES_RESUMO = ("disponivel", "motivo", "ano_referencia", "voce_firmado",
                  "media_pares", "dinheiro_na_mesa", "acima_da_media", "total_grupo")


def calcular_resumo(db: "Session", municipio_id: int) -> dict:
    diag = calcular_diagnostico(db, municipio_id)
    return {k: diag[k] for k in _CHAVES_RESUMO}


def _fmt_moeda(v: float) -> str:
    if abs(v) >= 1e6:
        milhoes = f"{v / 1e6:.1f}".replace(".", ",")
        return f"R$ {milhoes} milhões"
    return "R$ " + f"{v:,.0f}".replace(",", ".")


def gerar_notificacoes_captacao(db: "Session", municipio_ids: list, usuario_id: int) -> int:
    """Notificação única na primeira carga do diagnóstico por município (padrão
    gerar_notificacoes_fpm): warning se abaixo da média dos pares, success se
    acima. Batched: grupos e captação carregados uma vez para todos os mids."""
    from datetime import date

    from app.models.notificacao import Notificacao
    from app.services.pares_service import eh_capital

    existentes = db.query(Notificacao).filter(Notificacao.titulo.like("Captação%")).all()
    ja_notificados = {
        n.municipio_ids[0] for n in existentes
        if n.municipio_ids and len(n.municipio_ids) == 1
    }

    refs, capt = _base_grupos(db)
    ano_corrente = date.today().year
    criadas = 0
    for mid in municipio_ids:
        # mesmo guard de calcular_diagnostico: refs agora inclui município sem
        # população (outerjoin), então a checagem precisa olhar o campo.
        if mid in ja_notificados or mid not in refs or refs[mid].populacao is None:
            continue
        if eh_capital(refs[mid]):
            continue
        _, pares, nacional = _pares_de(mid, refs)
        diag = montar_diagnostico(mid, pares, nacional, capt, ano_corrente)
        if not diag["disponivel"] or diag["media_pares"] is None:
            continue
        if diag["acima_da_media"]:
            tipo = "success"
            titulo = "Captação federal: acima da média dos pares"
            mensagem = (
                f"Em {diag['ano_referencia']}, municípios do seu porte captaram em média "
                f"{_fmt_moeda(diag['media_pares'])} em convênios federais; o seu captou "
                f"{_fmt_moeda(diag['voce_firmado'])}. Veja a página Dinheiro na Mesa."
            )
        else:
            tipo = "warning"
            titulo = f"Captação federal: {_fmt_moeda(diag['dinheiro_na_mesa'])} na mesa"
            mensagem = (
                f"Em {diag['ano_referencia']}, municípios do seu porte captaram em média "
                f"{_fmt_moeda(diag['media_pares'])} em convênios federais; o seu captou "
                f"{_fmt_moeda(diag['voce_firmado'])}. Veja a página Dinheiro na Mesa."
            )
        db.add(Notificacao(titulo=titulo, mensagem=mensagem, tipo=tipo,
                           municipio_ids=[mid], criado_por=usuario_id))
        criadas += 1
    if criadas:
        db.commit()
    return criadas
