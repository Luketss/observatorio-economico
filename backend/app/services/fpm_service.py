"""Alerta de Faixa do FPM — núcleo de cálculo.

O FPM-Interior é distribuído por 18 faixas populacionais fixas em lei
(Decreto-Lei 1.881/81). O coeficiente aqui é SEMPRE estimado pela população
(estimativa IBGE); o oficial é fixado pelo TCU e pode divergir nos municípios
protegidos por trava legal (LC 165/2019 e sucessoras) — ver `avaliar_divergencia`.
Capitais seguem o regime FPM-Capitais e ficam fora do cálculo.
"""
import statistics
from dataclasses import dataclass

# (pop_min, pop_max, coeficiente) — DL 1.881/81, FPM-Interior.
FAIXAS_FPM: list[tuple[int, int | None, float]] = [
    (0, 10_188, 0.6),
    (10_189, 13_584, 0.8),
    (13_585, 16_980, 1.0),
    (16_981, 23_772, 1.2),
    (23_773, 30_564, 1.4),
    (30_565, 37_356, 1.6),
    (37_357, 44_148, 1.8),
    (44_149, 50_940, 2.0),
    (50_941, 61_128, 2.2),
    (61_129, 71_316, 2.4),
    (71_317, 81_504, 2.6),
    (81_505, 91_692, 2.8),
    (91_693, 101_880, 3.0),
    (101_881, 115_464, 3.2),
    (115_465, 129_048, 3.4),
    (129_049, 142_632, 3.6),
    (142_633, 156_216, 3.8),
    (156_217, None, 4.0),
]

# Códigos IBGE das 27 capitais — regime FPM-Capitais, fora destas faixas.
CAPITAIS_IBGE = frozenset({
    "1100205", "1200401", "1302603", "1400100", "1501402", "1600303",
    "1721000", "2111300", "2211001", "2304400", "2408102", "2507507",
    "2611606", "2704302", "2800308", "2927408", "3106200", "3205309",
    "3304557", "3550308", "4106902", "4205407", "4314902", "5002704",
    "5103403", "5208707", "5300108",
})


@dataclass(frozen=True)
class Faixa:
    indice: int
    pop_min: int
    pop_max: int | None
    coeficiente: float


def faixa_para_populacao(pop: int) -> Faixa:
    for i, (pop_min, pop_max, coef) in enumerate(FAIXAS_FPM):
        if pop_max is None or pop <= pop_max:
            return Faixa(indice=i, pop_min=pop_min, pop_max=pop_max, coeficiente=coef)
    raise ValueError(f"população inválida: {pop}")  # pragma: no cover


def fpm_12m(fpm_meses: list[tuple[int, int, float]]) -> tuple[float | None, bool]:
    """Soma dos 12 meses mais recentes com dados; com menos de 12 meses,
    anualiza pela média (× 12) e sinaliza parcial=True."""
    if not fpm_meses:
        return None, False
    ultimos = sorted(fpm_meses)[-12:]
    valores = [v for (_, _, v) in ultimos]
    if len(valores) >= 12:
        return sum(valores), False
    return (sum(valores) / len(valores)) * 12, True


def _zona(pop: int, faixa: Faixa, limiar: float) -> str | None:
    """'oportunidade' | 'risco' | None conforme distância às bordas da faixa."""
    hab_subir = (faixa.pop_max - pop + 1) if faixa.pop_max is not None else None
    hab_cair = (pop - faixa.pop_min + 1) if faixa.pop_min > 0 else None
    if hab_subir is not None and hab_subir <= limiar * pop:
        return "oportunidade"
    if hab_cair is not None and hab_cair <= limiar * pop:
        return "risco"
    return None


def _lista_faixas(faixa_atual: Faixa | None) -> list[dict]:
    return [
        {"pop_min": pop_min, "pop_max": pop_max, "coeficiente": coef,
         "atual": faixa_atual is not None and i == faixa_atual.indice}
        for i, (pop_min, pop_max, coef) in enumerate(FAIXAS_FPM)
    ]


def montar_alerta(
    pop_atual: tuple[int, int, str] | None,
    fpm_meses: list[tuple[int, int, float]],
    *,
    eh_capital: bool = False,
    limiar: float = 0.05,
) -> dict:
    """Monta o payload do alerta a partir de dados já carregados.

    pop_atual: (ano, populacao, fonte) mais recente, ou None.
    fpm_meses: [(ano, mes, valor)] em qualquer ordem.
    """
    base = {
        "disponivel": False, "motivo": None, "nao_aplicavel": False,
        "populacao": None, "ano_populacao": None, "fonte_populacao": None,
        "coeficiente": None, "status": None,
        "hab_para_subir": None, "hab_para_cair": None,
        "fpm_12m": None, "fpm_12m_parcial": False, "valor_por_ponto": None,
        "ganho_proxima_faixa": None, "perda_faixa_anterior": None,
        "divergencia": None, "faixas": _lista_faixas(None),
    }
    if eh_capital:
        return {**base, "nao_aplicavel": True, "motivo": "fpm_capitais"}
    if pop_atual is None:
        return {**base, "motivo": "sem_populacao"}

    ano, pop, fonte = pop_atual
    faixa = faixa_para_populacao(pop)
    hab_subir = (faixa.pop_max - pop + 1) if faixa.pop_max is not None else None
    hab_cair = (pop - faixa.pop_min + 1) if faixa.pop_min > 0 else None

    zona = _zona(pop, faixa, limiar)
    if zona:
        status = zona
    elif faixa.coeficiente == 4.0:
        status = "teto"
    else:
        status = "estavel"

    total_12m, parcial = fpm_12m(fpm_meses)
    valor_ponto = ganho = perda = None
    if total_12m:
        valor_ponto = total_12m / faixa.coeficiente
        if faixa.pop_max is not None:
            coef_proximo = FAIXAS_FPM[faixa.indice + 1][2]
            ganho = round((coef_proximo - faixa.coeficiente) * valor_ponto, 2)
        if faixa.indice > 0:
            coef_anterior = FAIXAS_FPM[faixa.indice - 1][2]
            perda = round((faixa.coeficiente - coef_anterior) * valor_ponto, 2)

    return {
        **base,
        "disponivel": True,
        "populacao": pop, "ano_populacao": ano, "fonte_populacao": fonte,
        "coeficiente": faixa.coeficiente, "status": status,
        "hab_para_subir": hab_subir, "hab_para_cair": hab_cair,
        "fpm_12m": total_12m, "fpm_12m_parcial": parcial,
        "valor_por_ponto": valor_ponto,
        "ganho_proxima_faixa": ganho, "perda_faixa_anterior": perda,
        "faixas": _lista_faixas(faixa),
    }


def avaliar_divergencia(
    valores_estado: list[float],
    valor_municipio: float,
    minimo: int = 5,
    tolerancia: float = 0.10,
) -> bool | None:
    """O valor por ponto de coeficiente deve ser ~igual entre municípios do
    mesmo estado. Desvio > tolerância da mediana ⇒ o coeficiente oficial
    provavelmente difere do estimado (trava legal). None = amostra pequena."""
    if len(valores_estado) < minimo:
        return None
    mediana = statistics.median(valores_estado)
    if mediana <= 0:
        return None
    return abs(valor_municipio - mediana) / mediana > tolerancia


def _fmt_hab(n: int) -> str:
    return f"{n:,}".replace(",", ".")


def _fmt_coef(c: float) -> str:
    return f"{c:.1f}".replace(".", ",")


def avaliar_evento_faixa(
    pops_por_ano: dict[int, int], limiar: float = 0.05, *, primeira_vez: bool = False
) -> dict | None:
    """Evento notificável após nova estimativa de população: mudança de faixa
    estimada vs ano anterior, ou entrada em zona de oportunidade/risco.

    `primeira_vez=True` (primeira carga de população do município): a zona
    atual notifica mesmo que o ano anterior já estivesse na mesma zona — caso
    contrário, quando vários anos chegam de uma vez (carga inicial), a
    supressão por `zona == zona_ant` esconderia uma zona de risco/oportunidade
    já vigente. Mudança de faixa continua tendo prioridade, inalterada."""
    anos = sorted(pops_por_ano)
    if not anos:
        return None
    ano = anos[-1]
    pop = pops_por_ano[ano]
    faixa = faixa_para_populacao(pop)

    faixa_ant = zona_ant = None
    if len(anos) > 1:
        pop_ant = pops_por_ano[anos[-2]]
        faixa_ant = faixa_para_populacao(pop_ant)
        zona_ant = _zona(pop_ant, faixa_ant, limiar)

    if faixa_ant is not None and faixa.coeficiente != faixa_ant.coeficiente:
        subiu = faixa.coeficiente > faixa_ant.coeficiente
        return {
            "tipo": "success" if subiu else "warning",
            "titulo": f"FPM: coeficiente estimado {'subiu' if subiu else 'caiu'} ({ano})",
            "mensagem": (
                f"A estimativa {ano} do IBGE ({_fmt_hab(pop)} hab.) leva o município à "
                f"faixa de coeficiente {_fmt_coef(faixa.coeficiente)} do FPM "
                f"(antes {_fmt_coef(faixa_ant.coeficiente)}). Veja a página FPM."
            ),
        }

    zona = _zona(pop, faixa, limiar)
    if zona and (primeira_vez or zona != zona_ant):
        if zona == "oportunidade":
            dist = faixa.pop_max - pop + 1
            return {
                "tipo": "success",
                "titulo": f"FPM: oportunidade de mudança de faixa ({ano})",
                "mensagem": (
                    f"Faltam {_fmt_hab(dist)} habitantes para o próximo coeficiente do FPM "
                    f"(estimativa IBGE {ano}: {_fmt_hab(pop)} hab.). Veja a página FPM."
                ),
            }
        dist = pop - faixa.pop_min + 1
        return {
            "tipo": "warning",
            "titulo": f"FPM: risco de queda de faixa ({ano})",
            "mensagem": (
                f"O município está a {_fmt_hab(dist)} habitantes de cair de faixa do FPM "
                f"(estimativa IBGE {ano}: {_fmt_hab(pop)} hab.). Veja a página FPM."
            ),
        }
    return None


# ── camada DB (fina; verificada via endpoints) ───────────────────────────────
from sqlalchemy.orm import Session


def _fpm_meses(db: "Session", municipio_id: int) -> list[tuple[int, int, float]]:
    from app.models.fpm import FpmMensal

    rows = (
        db.query(FpmMensal.ano, FpmMensal.mes, FpmMensal.valor)
        .filter(FpmMensal.municipio_id == municipio_id)
        .order_by(FpmMensal.ano, FpmMensal.mes)
        .all()
    )
    return [(a, m, float(v)) for a, m, v in rows]


def _pops(db: "Session", municipio_id: int) -> list:
    from app.models.populacao import PopulacaoMunicipio

    return (
        db.query(PopulacaoMunicipio)
        .filter(PopulacaoMunicipio.municipio_id == municipio_id)
        .order_by(PopulacaoMunicipio.ano)
        .all()
    )


def _divergencia_estado(db: "Session", municipio, valor_ponto: float) -> bool | None:
    """Mediana do valor-por-ponto entre municípios do mesmo estado com dados."""
    from app.models.municipio import Municipio

    vizinhos = (
        db.query(Municipio)
        .filter(Municipio.estado == municipio.estado, Municipio.ativo.is_(True))
        .all()
    )
    valores = []
    for v in vizinhos:
        pops = _pops(db, v.id)
        if not pops:
            continue
        total, _ = fpm_12m(_fpm_meses(db, v.id))
        if not total:
            continue
        coef = faixa_para_populacao(pops[-1].populacao).coeficiente
        valores.append(total / coef)
    return avaliar_divergencia(valores, valor_ponto)


def calcular_alerta(db: "Session", municipio_id: int) -> dict:
    from app.models.municipio import Municipio

    municipio = db.get(Municipio, municipio_id)
    vazio = montar_alerta(None, [])
    if municipio is None:
        return {**vazio, "motivo": "municipio_nao_encontrado"}
    if not municipio.codigo_ibge:
        return {**vazio, "motivo": "sem_codigo_ibge"}
    if municipio.codigo_ibge in CAPITAIS_IBGE:
        return montar_alerta(None, [], eh_capital=True)

    pops = _pops(db, municipio_id)
    if not pops:
        return {**vazio, "motivo": "sem_populacao"}

    ultimo = pops[-1]
    alerta = montar_alerta(
        (ultimo.ano, ultimo.populacao, ultimo.fonte), _fpm_meses(db, municipio_id)
    )
    if alerta["valor_por_ponto"]:
        alerta["divergencia"] = _divergencia_estado(db, municipio, alerta["valor_por_ponto"])
    return alerta


def montar_serie(db: "Session", municipio_id: int) -> dict:
    meses = _fpm_meses(db, municipio_id)
    anual: dict[int, dict] = {}
    for ano, _mes, valor in meses:
        item = anual.setdefault(ano, {"ano": ano, "valor_total": 0.0, "meses": 0})
        item["valor_total"] += valor
        item["meses"] += 1
    return {
        "mensal": [{"ano": a, "mes": m, "valor": v} for a, m, v in meses],
        "anual": [anual[a] for a in sorted(anual)],
        "populacao": [
            {"ano": p.ano, "populacao": p.populacao, "fonte": p.fonte}
            for p in _pops(db, municipio_id)
        ],
    }


def gerar_notificacoes_fpm(db: "Session", municipio_ids: list[int], usuario_id: int) -> int:
    """Cria Notificacao por município quando a última estimativa muda a faixa
    ou entra em zona de oportunidade/risco. Dedup por (titulo, municipio)."""
    from app.models.notificacao import Notificacao

    criadas = 0
    for mid in municipio_ids:
        pops = {p.ano: p.populacao for p in _pops(db, mid)}
        primeira_vez = not any(
            n.municipio_ids == [mid]
            for n in db.query(Notificacao).filter(Notificacao.titulo.like("FPM%")).all()
        )
        evento = avaliar_evento_faixa(pops, primeira_vez=primeira_vez)
        if not evento:
            continue
        ja_existe = any(
            n.municipio_ids == [mid]
            for n in db.query(Notificacao).filter(Notificacao.titulo == evento["titulo"]).all()
        )
        if ja_existe:
            continue
        db.add(Notificacao(
            titulo=evento["titulo"], mensagem=evento["mensagem"],
            tipo=evento["tipo"], municipio_ids=[mid], criado_por=usuario_id,
        ))
        criadas += 1
    if criadas:
        db.commit()
    return criadas
