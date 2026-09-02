"""Relevância e risco calculados da Gestão Empresarial — derivados na leitura.

Spec: docs/superpowers/specs/2026-09-02-gestao-empresarial-relevancia-risco-design.md
Nada é persistido. `calcular_relevancia`/`calcular_risco` são puras (recebem
`hoje`); `enriquecer` faz as consultas em lote e casa tudo em Python.
Reutilizado pelas sub-frentes B (descoberta na base RFB) e C (agenda).

Relevância (0–100):
| fator    | origem   | pontos                                                              |
| empregos | cadastro | 1–9: 10 · 10–49: 20 · 50–99: 30 · 100–499: 36 · 500+: 40 · 0/vazio: 0 |
| porte    | rfb      | 01 ME: 6 · 03 EPP: 12 · 05 Demais: 20 · 00/vazio: 0                 |
| tempo    | rfb      | < 2 anos: 3 · 2 a < 5: 7 · 5 a < 10: 11 · 10+: 15 · sem data: 0     |
| capital  | rfb      | ≤ 10 mil: 0 · ≤ 100 mil: 3 · ≤ 1 mi: 6 · ≤ 10 mi: 8 · > 10 mi: 10   |
| expansao | cadastro | baixo: 0 · medio: 8 · alto: 15                                      |
Modificador `situacao` (rfb), sobre a soma: 02 mantém · 03/04 divide por 2
(piso) · 08/01 zera — aparece como fator de `maximo` 0 com pontos negativos.
Sem vínculo RFB: fatores rfb valem 0 ("sem vínculo RFB"), `parcial = True`.
Faixas: alta ≥ 60 · media 30–59 · baixa < 30.

Risco: sinais `proxima_acao_vencida`, `sem_contato_90d`, `demanda_aberta_30d`,
`rfb_irregular` (03/04), `rfb_baixada` (08/01). Nível: alto com rfb_baixada
ou 2+ sinais · atencao com 1 · nenhum com 0.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timedelta
from typing import Iterable

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.desenvolvimento_economico import ContatoEmpresa, DemandaEmpresa, VisitaRetencao
from app.models.empresa import Empresa

# ── pesos e limiares (constantes: sem configuração por município) ───────────
PONTOS_EMPREGOS = ((500, 40), (100, 36), (50, 30), (10, 20), (1, 10))   # (mínimo, pontos), maior primeiro
PONTOS_PORTE = {"01": 6, "03": 12, "05": 20}
PONTOS_TEMPO = ((10, 15), (5, 11), (2, 7), (0, 3))                       # (anos completos mínimos, pontos)
PONTOS_CAPITAL = ((10_000_000, 10), (1_000_000, 8), (100_000, 6), (10_000, 3))  # (acima de, pontos); ≤ 10 mil → 0
PONTOS_EXPANSAO = {"baixo": 0, "medio": 8, "alto": 15}
MAXIMOS = {"empregos": 40, "porte": 20, "tempo": 15, "capital": 10, "expansao": 15}
SITUACAO_REDUZ = {"03": "suspensa", "04": "inapta"}
SITUACAO_ZERA = {"08": "baixada", "01": "nula"}
FAIXA_ALTA = 60
FAIXA_MEDIA = 30
DIAS_SEM_CONTATO = 90
DIAS_DEMANDA_ABERTA = 30

ROTULO_PORTE = {"01": "microempresa", "03": "empresa de pequeno porte", "05": "demais"}
ROTULO_EXPANSAO = {"baixo": "baixo", "medio": "médio", "alto": "alto"}


@dataclass(frozen=True)
class Fator:
    chave: str
    rotulo: str
    pontos: int
    maximo: int
    origem: str  # "cadastro" | "rfb"


@dataclass(frozen=True)
class Relevancia:
    score: int
    faixa: str  # "alta" | "media" | "baixa"
    parcial: bool
    fatores: tuple[Fator, ...]


@dataclass(frozen=True)
class Sinal:
    chave: str
    rotulo: str
    desde: date | None


@dataclass(frozen=True)
class Risco:
    nivel: str  # "alto" | "atencao" | "nenhum"
    sinais: tuple[Sinal, ...]


@dataclass(frozen=True)
class Enriquecimento:
    relevancia: Relevancia
    risco: Risco
    perfil_rfb: Empresa | None  # reaproveitado pelo detalhe: uma única leitura do perfil


# ── helpers ─────────────────────────────────────────────────────────────────

def _como_date(v) -> date | None:
    if v is None:
        return None
    if isinstance(v, datetime):
        return v.date()
    if isinstance(v, date):
        return v
    return date.fromisoformat(str(v)[:10])


def _anos_completos(inicio: date, hoje: date) -> int:
    anos = hoje.year - inicio.year - ((hoje.month, hoje.day) < (inicio.month, inicio.day))
    return max(anos, 0)


def _fmt_brl(v: float) -> str:
    return f"{v:,.0f}".replace(",", ".")


def faixa_de(score: int) -> str:
    if score >= FAIXA_ALTA:
        return "alta"
    if score >= FAIXA_MEDIA:
        return "media"
    return "baixa"


# ── relevância ──────────────────────────────────────────────────────────────

def _fator_empregos(n) -> Fator:
    n = int(n or 0)
    pts = next((p for minimo, p in PONTOS_EMPREGOS if n >= minimo), 0)
    rotulo = f"Empregos informados: {n}" if n > 0 else "Empregos: não informado"
    return Fator("empregos", rotulo, pts, MAXIMOS["empregos"], "cadastro")


def _fator_porte(porte, vinculado: bool) -> Fator:
    if not vinculado:
        return Fator("porte", "Porte RFB: sem vínculo RFB", 0, MAXIMOS["porte"], "rfb")
    porte = (porte or "").strip()
    pts = PONTOS_PORTE.get(porte, 0)
    rotulo = f"Porte RFB: {ROTULO_PORTE[porte]}" if porte in ROTULO_PORTE else "Porte RFB: não informado"
    return Fator("porte", rotulo, pts, MAXIMOS["porte"], "rfb")


def _fator_tempo(data_inicio, vinculado: bool, hoje: date) -> Fator:
    if not vinculado:
        return Fator("tempo", "Tempo de atividade: sem vínculo RFB", 0, MAXIMOS["tempo"], "rfb")
    inicio = _como_date(data_inicio)
    if inicio is None:
        return Fator("tempo", "Tempo de atividade: sem data de abertura", 0, MAXIMOS["tempo"], "rfb")
    anos = _anos_completos(inicio, hoje)
    pts = next((p for minimo, p in PONTOS_TEMPO if anos >= minimo), 0)
    return Fator("tempo", f"Tempo de atividade: {anos} ano(s)", pts, MAXIMOS["tempo"], "rfb")


def _fator_capital(capital, vinculado: bool) -> Fator:
    if not vinculado:
        return Fator("capital", "Capital social: sem vínculo RFB", 0, MAXIMOS["capital"], "rfb")
    if capital is None:
        return Fator("capital", "Capital social: não informado", 0, MAXIMOS["capital"], "rfb")
    valor = float(capital)
    pts = next((p for acima_de, p in PONTOS_CAPITAL if valor > acima_de), 0)
    return Fator("capital", f"Capital social: R$ {_fmt_brl(valor)}", pts, MAXIMOS["capital"], "rfb")


def _fator_expansao(potencial) -> Fator:
    chave = (potencial or "").strip()
    pts = PONTOS_EXPANSAO.get(chave, 0)
    rotulo = f"Potencial de expansão: {ROTULO_EXPANSAO.get(chave, 'não informado')}"
    return Fator("expansao", rotulo, pts, MAXIMOS["expansao"], "cadastro")


def calcular_relevancia(cadastro, perfil_rfb, hoje: date) -> Relevancia:
    """Score 0–100 explicável. `cadastro` é um EmpresaRetencao (ou objeto com
    os mesmos atributos); `perfil_rfb` é a linha de `empresas` casada por
    (municipio_id, cnpj_basico) ou None (sem vínculo → parcial)."""
    vinculado = perfil_rfb is not None
    fatores = [
        _fator_empregos(cadastro.num_empregos),
        _fator_porte(perfil_rfb.porte if vinculado else None, vinculado),
        _fator_tempo(perfil_rfb.data_inicio if vinculado else None, vinculado, hoje),
        _fator_capital(perfil_rfb.capital_social if vinculado else None, vinculado),
        _fator_expansao(cadastro.potencial_expansao),
    ]
    bruto = sum(f.pontos for f in fatores)
    score = bruto
    if vinculado:
        sit = (perfil_rfb.situacao or "").strip()
        if sit in SITUACAO_ZERA:
            score = 0
            fatores.append(Fator("situacao", f"{SITUACAO_ZERA[sit]} na RFB: score zerado",
                                 score - bruto, 0, "rfb"))
        elif sit in SITUACAO_REDUZ:
            score = bruto // 2
            fatores.append(Fator("situacao", f"{SITUACAO_REDUZ[sit]} na RFB: score reduzido pela metade",
                                 score - bruto, 0, "rfb"))
    return Relevancia(score=score, faixa=faixa_de(score), parcial=not vinculado, fatores=tuple(fatores))


# ── risco ───────────────────────────────────────────────────────────────────

def calcular_risco(cadastro, perfil_rfb, ultimo_contato: date | None,
                   demanda_aberta_desde: date | None, hoje: date) -> Risco:
    """Sinais + nível. `ultimo_contato` = maior data entre contatos e visitas
    (ou None); `demanda_aberta_desde` = menor data_registro entre demandas não
    resolvidas (ou None). `desde` de cada sinal é a data de referência que a
    agenda (sub-frente C) vai usar."""
    sinais: list[Sinal] = []

    acao_data = _como_date(cadastro.proxima_acao_data)
    if cadastro.proxima_acao and acao_data is not None and acao_data < hoje:
        sinais.append(Sinal("proxima_acao_vencida", "Próxima ação vencida", acao_data))

    limite_contato = hoje - timedelta(days=DIAS_SEM_CONTATO)
    rotulo_contato = f"Sem contato há mais de {DIAS_SEM_CONTATO} dias"
    if ultimo_contato is None:
        criado = _como_date(cadastro.criado_em)
        # Cadastro novo sem contato ainda não é sinal: só dispara quando o
        # cadastro em si já tem mais de 90 dias.
        if criado is None or criado < limite_contato:
            sinais.append(Sinal("sem_contato_90d", rotulo_contato, criado))
    elif ultimo_contato < limite_contato:
        sinais.append(Sinal("sem_contato_90d", rotulo_contato, ultimo_contato))

    if demanda_aberta_desde is not None and demanda_aberta_desde <= hoje - timedelta(days=DIAS_DEMANDA_ABERTA):
        sinais.append(Sinal("demanda_aberta_30d", f"Demanda aberta há mais de {DIAS_DEMANDA_ABERTA} dias",
                            demanda_aberta_desde))

    if perfil_rfb is not None:
        sit = (perfil_rfb.situacao or "").strip()
        if sit in SITUACAO_ZERA:
            sinais.append(Sinal("rfb_baixada", f"Situação {SITUACAO_ZERA[sit]} na RFB", None))
        elif sit in SITUACAO_REDUZ:
            sinais.append(Sinal("rfb_irregular", f"Situação {SITUACAO_REDUZ[sit]} na RFB", None))

    if any(s.chave == "rfb_baixada" for s in sinais) or len(sinais) >= 2:
        nivel = "alto"
    elif sinais:
        nivel = "atencao"
    else:
        nivel = "nenhum"
    return Risco(nivel=nivel, sinais=tuple(sinais))


# ── lote ────────────────────────────────────────────────────────────────────

def enriquecer(db: Session, cadastros: Iterable, hoje: date | None = None) -> dict[int, Enriquecimento]:
    """Relevância + risco (+ perfil RFB lido) por `cadastro.id`, com consultas
    em lote independentes do tamanho da lista:
    1. perfis `Empresa` por municipio_id IN + cnpj_basico IN, casados em Python
       por (municipio_id, cnpj_basico) — sem IN de tupla (SQLite dos testes);
    2. último contato: max(ContatoEmpresa.data) e max(VisitaRetencao.data_visita)
       por empresa_id, combinados em Python;
    3. demanda aberta mais antiga: min(DemandaEmpresa.data_registro) com
       status != 'resolvida' por empresa_id.
    Lista vazia devolve {} sem consultar."""
    cadastros = list(cadastros)
    if not cadastros:
        return {}
    hoje = hoje or date.today()
    ids = [c.id for c in cadastros]

    perfis: dict[tuple[int, str], Empresa] = {}
    pares = {(c.municipio_id, c.cnpj_basico) for c in cadastros if c.cnpj_basico}
    if pares:
        mids = {m for m, _ in pares}
        raizes = {r for _, r in pares}
        for e in db.query(Empresa).filter(Empresa.municipio_id.in_(mids), Empresa.cnpj_basico.in_(raizes)):
            perfis.setdefault((e.municipio_id, e.cnpj_basico), e)

    ultimo: dict[int, date] = {}
    for eid, d in (db.query(ContatoEmpresa.empresa_id, func.max(ContatoEmpresa.data))
                   .filter(ContatoEmpresa.empresa_id.in_(ids)).group_by(ContatoEmpresa.empresa_id)):
        d = _como_date(d)
        if d is not None:
            ultimo[eid] = d
    for eid, d in (db.query(VisitaRetencao.empresa_id, func.max(VisitaRetencao.data_visita))
                   .filter(VisitaRetencao.empresa_id.in_(ids)).group_by(VisitaRetencao.empresa_id)):
        d = _como_date(d)
        if d is not None and (eid not in ultimo or d > ultimo[eid]):
            ultimo[eid] = d

    aberta: dict[int, date] = {}
    for eid, d in (db.query(DemandaEmpresa.empresa_id, func.min(DemandaEmpresa.data_registro))
                   .filter(DemandaEmpresa.empresa_id.in_(ids), DemandaEmpresa.status != "resolvida")
                   .group_by(DemandaEmpresa.empresa_id)):
        d = _como_date(d)
        if d is not None:
            aberta[eid] = d

    out: dict[int, Enriquecimento] = {}
    for c in cadastros:
        perfil = perfis.get((c.municipio_id, c.cnpj_basico)) if c.cnpj_basico else None
        out[c.id] = Enriquecimento(
            relevancia=calcular_relevancia(c, perfil, hoje),
            risco=calcular_risco(c, perfil, ultimo.get(c.id), aberta.get(c.id), hoje),
            perfil_rfb=perfil,
        )
    return out


def ordenar_por_relevancia(cadastros: Iterable, enriquecido: dict[int, Enriquecimento]) -> list:
    """Score decrescente; desempate por nome sem distinguir maiúsculas."""
    return sorted(cadastros, key=lambda c: (-enriquecido[c.id].relevancia.score, (c.nome or "").casefold()))
