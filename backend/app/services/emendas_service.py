"""Radar de Emendas Parlamentares — núcleo de cálculo.

Pago total de uma emenda = pago no exercício + restos a pagar pagos. O total
municipal é um PISO: emendas com localidade Nacional/UF não são
municipalizáveis e ficam fora (ver emendas_portal.py)."""


def pct_pago(empenhado, pago_total) -> float | None:
    """% executado (pago_total / empenhado), clamp 0–100; None sem empenho."""
    if not empenhado or empenhado <= 0:
        return None
    return round(min(100.0, max(0.0, pago_total / empenhado * 100)), 1)


def _pago_total(e: dict) -> float:
    return (e.get("pago") or 0.0) + (e.get("resto_pago") or 0.0)


def montar_radar_puro(emendas: list) -> dict:
    """[{ano, codigo, numero, autor, tipo, funcao, empenhado, liquidado, pago,
    resto_pago}] → payload do radar (kpis, por_autor, por_funcao, emendas)."""
    if not emendas:
        return {"disponivel": False, "kpis": None, "por_autor": [], "por_funcao": [], "emendas": []}

    itens = []
    for e in emendas:
        pago_total = round(_pago_total(e), 2)
        itens.append({**e, "pago_total": pago_total,
                      "pct_pago": pct_pago(e.get("empenhado"), pago_total)})
    itens.sort(key=lambda e: (-e["ano"], -(e.get("empenhado") or 0.0)))

    total_empenhado = round(sum(e.get("empenhado") or 0.0 for e in itens), 2)
    pago_geral = round(sum(e["pago_total"] for e in itens), 2)

    por_autor: dict[str, dict] = {}
    for e in itens:
        a = por_autor.setdefault(e["autor"], {"autor": e["autor"], "num_emendas": 0,
                                              "empenhado": 0.0, "pago_total": 0.0})
        a["num_emendas"] += 1
        a["empenhado"] = round(a["empenhado"] + (e.get("empenhado") or 0.0), 2)
        a["pago_total"] = round(a["pago_total"] + e["pago_total"], 2)
    autores = sorted(por_autor.values(), key=lambda a: -a["empenhado"])
    for a in autores:
        a["pct_pago"] = pct_pago(a["empenhado"], a["pago_total"])

    por_funcao: dict[str, float] = {}
    for e in itens:
        if e.get("funcao"):
            por_funcao[e["funcao"]] = round(por_funcao.get(e["funcao"], 0.0) + (e.get("empenhado") or 0.0), 2)
    funcoes = [{"funcao": f, "empenhado": v}
               for f, v in sorted(por_funcao.items(), key=lambda kv: -kv[1])]

    top = autores[0] if autores else None
    return {
        "disponivel": True,
        "kpis": {
            "total_empenhado": total_empenhado,
            "pago_total": pago_geral,
            "pct_pago": pct_pago(total_empenhado, pago_geral),
            "num_emendas": len(itens),
            "num_parlamentares": len(autores),
            "top_autor": top["autor"] if top else None,
            "top_autor_valor": top["empenhado"] if top else None,
        },
        "por_autor": autores,
        "por_funcao": funcoes,
        "emendas": itens,
    }


# ── camada DB (fina; verificada via endpoints) ───────────────────────────────
from sqlalchemy.orm import Session


def _rows_para_dicts(rows) -> list:
    return [{
        "ano": r.ano, "codigo": r.codigo_emenda, "numero": r.numero_emenda,
        "autor": r.autor, "tipo": r.tipo_emenda, "funcao": r.funcao,
        "empenhado": float(r.valor_empenhado), "liquidado": float(r.valor_liquidado),
        "pago": float(r.valor_pago), "resto_pago": float(r.valor_resto_pago),
    } for r in rows]


def montar_radar(db: "Session", municipio_id: int, ano: int | None = None) -> dict:
    from app.models.emenda import EmendaParlamentar

    query = db.query(EmendaParlamentar).filter(EmendaParlamentar.municipio_id == municipio_id)
    anos = sorted({a for (a,) in
                   query.with_entities(EmendaParlamentar.ano).distinct().all()}, reverse=True)
    if ano is not None:
        query = query.filter(EmendaParlamentar.ano == ano)
    radar = montar_radar_puro(_rows_para_dicts(query.all()))
    return {**radar, "anos": anos}


def calcular_resumo_emendas(db: "Session", municipio_id: int) -> dict:
    from app.models.emenda import EmendaParlamentar

    rows = db.query(EmendaParlamentar).filter(
        EmendaParlamentar.municipio_id == municipio_id).all()
    if not rows:
        return {"disponivel": False, "ano": None, "total_empenhado": None,
                "num_parlamentares": None, "top_autor": None}
    ano = max(r.ano for r in rows)
    radar = montar_radar_puro(_rows_para_dicts([r for r in rows if r.ano == ano]))
    k = radar["kpis"]
    return {"disponivel": True, "ano": ano, "total_empenhado": k["total_empenhado"],
            "num_parlamentares": k["num_parlamentares"], "top_autor": k["top_autor"]}


def _fmt_moeda(v: float) -> str:
    if abs(v) >= 1e6:
        return "R$ " + f"{v / 1e6:.1f}".replace(".", ",") + " milhões"
    return "R$ " + f"{v:,.0f}".replace(",", ".")


def gerar_notificacoes_emendas(db: "Session", novidades: dict, usuario_id: int) -> int:
    """`novidades`: mid → lista de registros de emendas NOVAS do ano corrente
    (inseridas agora pela fonte). Dedup por (titulo, municipio_id)."""
    from app.models.notificacao import Notificacao

    existentes = db.query(Notificacao).filter(Notificacao.titulo.like("Emendas%")).all()
    titulos: set = {(n.titulo, n.municipio_ids[0]) for n in existentes
                    if n.municipio_ids and len(n.municipio_ids) == 1}

    criadas = 0
    for mid, regs in novidades.items():
        if not regs:
            continue
        total = sum(r["valor_empenhado"] for r in regs)
        ano = regs[0]["ano"]
        autores = sorted({r["autor"] for r in regs})
        sufixo = f" + {len(autores) - 1} outro(s)" if len(autores) > 1 else ""
        titulo = f"Emendas: {_fmt_moeda(total)} em novas emendas ({ano})"
        if (titulo, mid) in titulos:
            continue
        mensagem = (
            f"Foram identificadas {len(regs)} nova(s) emenda(s) parlamentar(es) "
            f"destinada(s) ao município em {ano} ({autores[0]}{sufixo}). "
            f"Veja a página Emendas."
        )
        db.add(Notificacao(titulo=titulo, mensagem=mensagem, tipo="success",
                           municipio_ids=[mid], criado_por=usuario_id))
        titulos.add((titulo, mid))
        criadas += 1
    if criadas:
        db.commit()
    return criadas
