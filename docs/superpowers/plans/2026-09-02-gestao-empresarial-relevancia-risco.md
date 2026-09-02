# Gestão Empresarial — Relevância e risco calculados (sub-frente A) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar à Gestão Empresarial uma relevância explicável (score 0–100 com fatores visíveis) e um risco calculado por sinais (com nível), derivados na leitura no backend e usados na tela (chips, 5 KPIs, busca/ordenação/filtro, breakdown no drawer) — sem migração e sem tocar na avaliação manual.

**Architecture:** Serviço puro `app/services/gestao_empresarial.py` (funções `calcular_relevancia`/`calcular_risco` sem relógio, `enriquecer` com consultas em lote) → schemas `RelevanciaOut`/`RiscoOut` obrigatórios em `EmpresaRetencaoLeanOut`/`Out` com serialização explícita no router (listagem ordenada por relevância; detalhe reaproveita o perfil RFB lido pelo `enriquecer`; POST/PUT devolvem enriquecido) → front: `GestaoEmpresarialTab` (chips, KPIs, toolbar no cliente) e `EmpresaDrawer` (blocos Relevância e Sinais na aba Perfil, fatores RFB sob o PlanGate já existente).

**Tech Stack:** FastAPI + SQLAlchemy 2 + Pydantic v2 (backend; testes pytest no estilo da casa: handlers chamados direto com fixture SQLite em memória, `MagicMock` para "não consulta"); React 19 + Vitest/jsdom + Testing Library (front; mocks de `../../services/api`, `AuthContext`, `ViewAsContext`, `ToastContext`, `PlanContext.Provider`).

**Spec:** `docs/superpowers/specs/2026-09-02-gestao-empresarial-relevancia-risco-design.md`

## Global Constraints

- **Sem migração.** Nada é persistido: score, faixa, fatores, sinais e nível são derivados a cada leitura.
- **Pesos e limiares são constantes do serviço** (sem configuração por município), documentados com a tabela da spec no docstring do módulo. Faixas: `alta ≥ 60`, `media 30–59`, `baixa < 30`. `DIAS_SEM_CONTATO = 90`, `DIAS_DEMANDA_ABERTA = 30`.
- **Funções puras recebem `hoje: date`** e nunca leem o relógio; só `enriquecer(db, cadastros, hoje=None)` cai em `date.today()`.
- **Permissões, plano (`desenvolvimento_economico.retencao`), view-as e tenant do router intocados.** `status_risco` e `potencial_expansao` continuam manuais, com a mesma semântica.
- **Chaves e enums exatos** (o front depende delas): fatores `empregos | porte | tempo | capital | expansao | situacao`; `origem ∈ cadastro | rfb`; faixa `alta | media | baixa`; sinais `proxima_acao_vencida | sem_contato_90d | demanda_aberta_30d | rfb_irregular | rfb_baixada`; nível `alto | atencao | nenhum`.
- **Fatores RFB no front ficam dentro do PlanGate `planKey="empresas"` JÁ existente** da seção "Base RFB" do drawer (um único gate; o teste existente `getByText("Disponível apenas no plano pago")` continua valendo).
- **Toda resposta de `/retencao` vem enriquecida** (`relevancia` e `risco` obrigatórios nos schemas). O front usa optional chaining (`e.relevancia?.score`) porque os testes existentes mockam a lista sem enriquecimento.
- **Gates de teste:** backend `venv/Scripts/python -m pytest backend/tests -p no:warnings` da raiz do repo (baseline **506**; NÃO acrescentar `-q`: o `backend/pytest.ini` já tem `addopts = -q` e um segundo `-q` esconde a linha de resumo); frontend `npx vitest run` de `frontend-observatorio/` (baseline **422**). Os dois devem terminar verdes ao fim de cada task.
- Lint do repo JÁ FALHA (não é gate): arquivos novos limpos; modificados sem erro NOVO vs base.
- **Working copy é CRLF** (`core.autocrlf=true`). Arquivos novos: gravar e depois normalizar para CRLF (`python -c "p='<arquivo>';b=open(p,'rb').read().replace(b'\r\n',b'\n').replace(b'\n',b'\r\n');open(p,'wb').write(b)"`). Patches em arquivos existentes via Edit tool ou script Python; **não** usar heredoc bash com JSX/Python (já falhou nesta base).
- Copy pt-BR. Commits convencionais com subject **sem acentos** e trailers:
  `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>` e
  `Claude-Session: https://claude.ai/code/session_01D1oaq9U7h3wirgFgCef7sv`.
- Branch de trabalho: `feat/gestao-empresarial-relevancia-risco` a partir de `main` (merge ff local ao final; push é do usuário).

---

### Task 1: Serviço puro `gestao_empresarial.py` + testes unitários

**Files:**
- Create: `backend/app/services/gestao_empresarial.py`
- Test: `backend/tests/test_gestao_empresarial_score.py`

**Interfaces:**
- Consumes: modelos `EmpresaRetencao`, `ContatoEmpresa`, `VisitaRetencao`, `DemandaEmpresa` (`app/models/desenvolvimento_economico.py`) e `Empresa` (`app/models/empresa.py`). Campos usados: cadastro `id, nome, municipio_id, cnpj_basico, num_empregos, potencial_expansao, proxima_acao, proxima_acao_data, criado_em (datetime)`; perfil RFB `situacao, porte, data_inicio, capital_social`.
- Produces (Task 2 depende):
  - dataclasses `Fator(chave, rotulo, pontos, maximo, origem)`, `Relevancia(score, faixa, parcial, fatores: tuple[Fator, ...])`, `Sinal(chave, rotulo, desde: date | None)`, `Risco(nivel, sinais: tuple[Sinal, ...])`, `Enriquecimento(relevancia, risco, perfil_rfb: Empresa | None)`;
  - `faixa_de(score: int) -> str`;
  - `calcular_relevancia(cadastro, perfil_rfb, hoje: date) -> Relevancia`;
  - `calcular_risco(cadastro, perfil_rfb, ultimo_contato: date | None, demanda_aberta_desde: date | None, hoje: date) -> Risco`;
  - `enriquecer(db, cadastros, hoje=None) -> dict[int, Enriquecimento]` (chave = `cadastro.id`);
  - `ordenar_por_relevancia(cadastros, enriquecido) -> list`.
  - **Desvio consciente da spec 3.1:** o valor do dicionário é `Enriquecimento` (relevância, risco **e** o perfil RFB lido) em vez de `tuple[Relevancia, Risco]`, para a spec 3.3 ("detalhe reaproveita o perfil já carregado — uma única leitura") valer sem segunda consulta.

- [ ] **Step 1: Escrever o teste unitário (falhando)**

Criar `backend/tests/test_gestao_empresarial_score.py`:

```python
"""Relevância e risco calculados — funções puras, sem DB.
Cada faixa de cada fator com as fronteiras da spec; sinais um a um com as
fronteiras de 90 e 30 dias; nível por contagem e por rfb_baixada."""
from datetime import date, datetime, timedelta
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest

from app.services.gestao_empresarial import (
    DIAS_DEMANDA_ABERTA,
    DIAS_SEM_CONTATO,
    Enriquecimento,
    calcular_relevancia,
    calcular_risco,
    enriquecer,
    faixa_de,
    ordenar_por_relevancia,
)

HOJE = date(2026, 9, 2)
RECENTE = datetime(2026, 8, 20, 12, 0)  # cadastro com < 90 dias: não dispara "sem contato"


def cadastro(**kw):
    base = dict(id=1, nome="ACME", municipio_id=1, cnpj_basico=None, num_empregos=None,
                potencial_expansao="baixo", proxima_acao=None, proxima_acao_data=None,
                criado_em=RECENTE)
    base.update(kw)
    return SimpleNamespace(**base)


def perfil(**kw):
    base = dict(situacao="02", porte=None, data_inicio=None, capital_social=None)
    base.update(kw)
    return SimpleNamespace(**base)


def pontos(rel, chave):
    return next(f.pontos for f in rel.fatores if f.chave == chave)


def _anos_atras(anos, dias=0):
    return date(HOJE.year - anos, HOJE.month, HOJE.day) + timedelta(days=dias)


# ── relevância: fatores ──────────────────────────────────────────────────────

@pytest.mark.parametrize("n,esperado", [
    (None, 0), (0, 0), (1, 10), (9, 10), (10, 20), (49, 20), (50, 30), (99, 30),
    (100, 36), (499, 36), (500, 40), (5000, 40),
])
def test_fator_empregos(n, esperado):
    assert pontos(calcular_relevancia(cadastro(num_empregos=n), None, HOJE), "empregos") == esperado


def test_fator_empregos_ausente_tem_rotulo_nao_informado():
    rel = calcular_relevancia(cadastro(num_empregos=None), None, HOJE)
    f = next(f for f in rel.fatores if f.chave == "empregos")
    assert (f.rotulo, f.maximo, f.origem) == ("Empregos: não informado", 40, "cadastro")
    rel42 = calcular_relevancia(cadastro(num_empregos=42), None, HOJE)
    assert next(f for f in rel42.fatores if f.chave == "empregos").rotulo == "Empregos informados: 42"


@pytest.mark.parametrize("porte,esperado", [(None, 0), ("", 0), ("00", 0), ("01", 6), ("03", 12), ("05", 20)])
def test_fator_porte(porte, esperado):
    assert pontos(calcular_relevancia(cadastro(), perfil(porte=porte), HOJE), "porte") == esperado


@pytest.mark.parametrize("inicio,esperado", [
    (None, 0), (HOJE, 3), (_anos_atras(2, +1), 3), (_anos_atras(2), 7), (_anos_atras(5, +1), 7),
    (_anos_atras(5), 11), (_anos_atras(10, +1), 11), (_anos_atras(10), 15), (date(1990, 1, 1), 15),
])
def test_fator_tempo(inicio, esperado):
    assert pontos(calcular_relevancia(cadastro(), perfil(data_inicio=inicio), HOJE), "tempo") == esperado


@pytest.mark.parametrize("capital,esperado", [
    (None, 0), (0, 0), (10_000, 0), (10_000.01, 3), (100_000, 3), (100_000.01, 6),
    (1_000_000, 6), (1_000_000.01, 8), (10_000_000, 8), (10_000_000.01, 10), (120e9, 10),
])
def test_fator_capital(capital, esperado):
    assert pontos(calcular_relevancia(cadastro(), perfil(capital_social=capital), HOJE), "capital") == esperado


@pytest.mark.parametrize("exp,esperado", [("baixo", 0), ("medio", 8), ("alto", 15), ("xyz", 0)])
def test_fator_expansao(exp, esperado):
    assert pontos(calcular_relevancia(cadastro(potencial_expansao=exp), None, HOJE), "expansao") == esperado


def test_score_maximo_100_ordem_dos_fatores_e_faixa_alta():
    rel = calcular_relevancia(
        cadastro(num_empregos=500, potencial_expansao="alto"),
        perfil(porte="05", data_inicio=date(2000, 1, 1), capital_social=50e6), HOJE,
    )
    assert (rel.score, rel.faixa, rel.parcial) == (100, "alta", False)
    assert [f.chave for f in rel.fatores] == ["empregos", "porte", "tempo", "capital", "expansao"]
    assert sum(f.maximo for f in rel.fatores) == 100


# ── relevância: modificador de situação ──────────────────────────────────────

def test_situacao_inapta_divide_por_2_com_fator_explicativo():
    rel = calcular_relevancia(cadastro(num_empregos=1), perfil(situacao="04", porte="01"), HOJE)  # 16 → 8
    assert rel.score == 8
    sit = rel.fatores[-1]
    assert (sit.chave, sit.pontos, sit.maximo, sit.origem) == ("situacao", -8, 0, "rfb")
    assert sit.rotulo == "inapta na RFB: score reduzido pela metade"


def test_situacao_suspensa_arredonda_para_baixo():
    rel = calcular_relevancia(cadastro(num_empregos=1),
                              perfil(situacao="03", porte="01", capital_social=50_000), HOJE)  # 19 → 9
    assert rel.score == 9 and rel.fatores[-1].pontos == -10
    assert rel.fatores[-1].rotulo == "suspensa na RFB: score reduzido pela metade"


def test_situacao_baixada_zera():
    rel = calcular_relevancia(cadastro(num_empregos=500, potencial_expansao="alto"),
                              perfil(situacao="08", porte="05"), HOJE)  # 75 → 0
    assert (rel.score, rel.faixa) == (0, "baixa")
    assert (rel.fatores[-1].rotulo, rel.fatores[-1].pontos) == ("baixada na RFB: score zerado", -75)


def test_situacao_nula_zera():
    rel = calcular_relevancia(cadastro(num_empregos=1), perfil(situacao="01"), HOJE)
    assert rel.score == 0 and rel.fatores[-1].rotulo == "nula na RFB: score zerado"


@pytest.mark.parametrize("sit", ["02", "", None, "99"])
def test_situacao_ativa_ou_desconhecida_nao_modifica(sit):
    rel = calcular_relevancia(cadastro(num_empregos=1), perfil(situacao=sit, porte="01"), HOJE)
    assert rel.score == 16 and all(f.chave != "situacao" for f in rel.fatores)


# ── relevância: sem vínculo e faixas ─────────────────────────────────────────

def test_sem_vinculo_rfb_parcial_maximo_55():
    rel = calcular_relevancia(cadastro(num_empregos=500, potencial_expansao="alto"), None, HOJE)
    assert (rel.score, rel.parcial) == (55, True)
    rfb = [f for f in rel.fatores if f.origem == "rfb"]
    assert [f.chave for f in rfb] == ["porte", "tempo", "capital"]
    assert [f.pontos for f in rfb] == [0, 0, 0]
    assert all(f.rotulo.endswith("sem vínculo RFB") for f in rfb)


@pytest.mark.parametrize("score,faixa", [
    (0, "baixa"), (29, "baixa"), (30, "media"), (59, "media"), (60, "alta"), (100, "alta"),
])
def test_faixas(score, faixa):
    assert faixa_de(score) == faixa


# ── risco: sinais ────────────────────────────────────────────────────────────

def test_sem_sinais_nivel_nenhum():
    r = calcular_risco(cadastro(), None, None, None, HOJE)
    assert (r.nivel, r.sinais) == ("nenhum", ())


def test_proxima_acao_vencida_so_com_texto_e_data_passada():
    ontem = HOJE - timedelta(days=1)
    r = calcular_risco(cadastro(proxima_acao="Ligar", proxima_acao_data=ontem), None, None, None, HOJE)
    assert [(s.chave, s.desde) for s in r.sinais] == [("proxima_acao_vencida", ontem)]
    assert r.nivel == "atencao"
    assert calcular_risco(cadastro(proxima_acao="Ligar", proxima_acao_data=HOJE), None, None, None, HOJE).sinais == ()
    assert calcular_risco(cadastro(proxima_acao=None, proxima_acao_data=ontem), None, None, None, HOJE).sinais == ()


def test_sem_contato_90d_fronteira_com_contato():
    limite = HOJE - timedelta(days=DIAS_SEM_CONTATO)
    assert calcular_risco(cadastro(), None, limite, None, HOJE).sinais == ()  # exatamente 90 dias: não
    r = calcular_risco(cadastro(), None, limite - timedelta(days=1), None, HOJE)
    assert [(s.chave, s.desde) for s in r.sinais] == [("sem_contato_90d", limite - timedelta(days=1))]


def test_sem_contato_nunca_depende_da_data_do_cadastro():
    limite = HOJE - timedelta(days=DIAS_SEM_CONTATO)
    no_limite = cadastro(criado_em=datetime.combine(limite, datetime.min.time()))
    assert calcular_risco(no_limite, None, None, None, HOJE).sinais == ()  # criado há exatamente 90 dias: não
    antigo = cadastro(criado_em=datetime.combine(limite - timedelta(days=1), datetime.min.time()))
    r = calcular_risco(antigo, None, None, None, HOJE)
    assert [(s.chave, s.desde) for s in r.sinais] == [("sem_contato_90d", limite - timedelta(days=1))]


def test_demanda_aberta_30d_fronteira():
    limite = HOJE - timedelta(days=DIAS_DEMANDA_ABERTA)
    assert calcular_risco(cadastro(), None, None, limite + timedelta(days=1), HOJE).sinais == ()
    r = calcular_risco(cadastro(), None, None, limite, HOJE)
    assert [(s.chave, s.desde) for s in r.sinais] == [("demanda_aberta_30d", limite)]


@pytest.mark.parametrize("sit,chave", [
    ("03", "rfb_irregular"), ("04", "rfb_irregular"), ("08", "rfb_baixada"), ("01", "rfb_baixada"),
])
def test_sinais_rfb_mutuamente_exclusivos(sit, chave):
    r = calcular_risco(cadastro(), perfil(situacao=sit), None, None, HOJE)
    assert [(s.chave, s.desde) for s in r.sinais] == [(chave, None)]


def test_rfb_ativa_e_sem_vinculo_nao_geram_sinal_rfb():
    assert calcular_risco(cadastro(), perfil(situacao="02"), None, None, HOJE).sinais == ()
    assert calcular_risco(cadastro(), None, None, None, HOJE).sinais == ()


# ── risco: nível ─────────────────────────────────────────────────────────────

def test_rfb_baixada_sozinha_e_nivel_alto():
    assert calcular_risco(cadastro(), perfil(situacao="08"), None, None, HOJE).nivel == "alto"


def test_dois_sinais_e_nivel_alto():
    ontem = HOJE - timedelta(days=1)
    r = calcular_risco(cadastro(proxima_acao="x", proxima_acao_data=ontem), None, None,
                       HOJE - timedelta(days=40), HOJE)
    assert r.nivel == "alto" and [s.chave for s in r.sinais] == ["proxima_acao_vencida", "demanda_aberta_30d"]


# ── enriquecer / ordenar ─────────────────────────────────────────────────────

def test_enriquecer_lista_vazia_nao_consulta():
    db = MagicMock()
    assert enriquecer(db, [], hoje=HOJE) == {}
    db.query.assert_not_called()


def test_ordenar_por_relevancia_desempata_por_nome_sem_caso():
    a, b, c = cadastro(id=1, nome="beta"), cadastro(id=2, nome="Alfa"), cadastro(id=3, nome="Zeta", num_empregos=500)
    calc = {x.id: Enriquecimento(calcular_relevancia(x, None, HOJE),
                                 calcular_risco(x, None, None, None, HOJE), None) for x in (a, b, c)}
    assert [x.nome for x in ordenar_por_relevancia([a, b, c], calc)] == ["Zeta", "Alfa", "beta"]
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `venv/Scripts/python -m pytest backend/tests/test_gestao_empresarial_score.py -p no:warnings`
Expected: erro de coleta `ModuleNotFoundError: No module named 'app.services.gestao_empresarial'`.

- [ ] **Step 3: Implementar o serviço**

Criar `backend/app/services/gestao_empresarial.py`:

```python
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
```

- [ ] **Step 4: Rodar e ver passar**

Run: `venv/Scripts/python -m pytest backend/tests/test_gestao_empresarial_score.py -p no:warnings`
Expected: todos passam (≈ 70 casos com as parametrizações).

- [ ] **Step 5: Normalizar CRLF e commitar**

```bash
git add backend/app/services/gestao_empresarial.py backend/tests/test_gestao_empresarial_score.py
git commit -m "feat(gestao-empresarial): servico puro de relevancia (0-100) e risco por sinais"
```
(com os trailers das Global Constraints no corpo.)

---

### Task 2: Schemas + serialização enriquecida no router + testes de endpoint

**Files:**
- Modify: `backend/app/schemas/desenvolvimento_economico.py` (inserir schemas novos antes de `class EmpresaRetencaoOut` ~linha 165; acrescentar campos em `EmpresaRetencaoOut` e `EmpresaRetencaoLeanOut`)
- Modify: `backend/app/api/v1/routers/desenvolvimento_economico.py` (imports linhas 1-49; helpers após `_apply_tenant` ~linha 70; handlers `listar_retencao` 157-168, `detalhe_retencao` 171-204, `criar_retencao` 207-225, `atualizar_retencao` 228-247)
- Test: `backend/tests/test_gestao_empresarial_endpoints.py` (acrescentar ao fim; fixture `ctx` e helper `_criar_empresa` já existem)

**Interfaces:**
- Consumes (Task 1): `enriquecer(db, cadastros) -> dict[int, Enriquecimento]` com `.relevancia`, `.risco`, `.perfil_rfb`; `ordenar_por_relevancia(cadastros, enriquecido)`.
- Produces (Tasks 3-4 dependem do JSON): `EmpresaRetencaoLeanOut` e `EmpresaRetencaoOut` com `relevancia: {score, faixa, parcial, fatores: [{chave, rotulo, pontos, maximo, origem}]}` e `risco: {nivel, sinais: [{chave, rotulo, desde}]}`; `GET /retencao` ordenado por score desc + nome; POST/PUT devolvem `LeanOut` enriquecido; detalhe com `perfil_rfb` vindo do `enriquecer`.

- [ ] **Step 1: Escrever os testes de endpoint (falhando)**

Acrescentar ao fim de `backend/tests/test_gestao_empresarial_endpoints.py`:

```python
# ── relevância e risco calculados (sub-frente A) ─────────────────────────────

def test_listagem_enriquecida_ordenada_por_relevancia_e_nome(ctx):
    from app.api.v1.routers.desenvolvimento_economico import listar_retencao
    db, _, u1, *_ = ctx
    _criar_empresa(db, u1, nome="beta")                                        # 0 pontos
    _criar_empresa(db, u1, nome="Alfa")                                        # 0 pontos
    _criar_empresa(db, u1, nome="Zeta", num_empregos=600, potencial_expansao="alto")  # 40 + 15 = 55
    lista = listar_retencao(municipio_id=None, db=db, current_user=u1)
    assert [e.nome for e in lista] == ["Zeta", "Alfa", "beta"]
    assert [e.relevancia.score for e in lista] == [55, 0, 0]
    assert lista[0].relevancia.faixa == "media" and lista[0].relevancia.parcial is True
    assert lista[0].risco.nivel == "nenhum" and lista[0].risco.sinais == []
    assert {f.chave for f in lista[0].relevancia.fatores} == {"empregos", "porte", "tempo", "capital", "expansao"}


def test_detalhe_traz_relevancia_risco_e_perfil_rfb_numa_leitura(ctx):
    from app.api.v1.routers.desenvolvimento_economico import detalhe_retencao
    db, _, u1, _, m1, _ = ctx
    db.add(Empresa(municipio_id=m1.id, cnpj_basico="12345678", razao_social="ACME LTDA",
                   situacao="02", porte="03", data_inicio=date(2010, 1, 5), capital_social=150_000.0))
    db.commit()
    e = _criar_empresa(db, u1, cnpj_basico="12345678", num_empregos=42, potencial_expansao="alto",
                       proxima_acao="Ligar", proxima_acao_data=date(2026, 1, 1))
    det = detalhe_retencao(e.id, db=db, current_user=u1)
    assert det.perfil_rfb is not None and det.perfil_rfb.razao_social == "ACME LTDA"
    # 20 (empregos) + 12 (EPP) + 15 (10+ anos) + 6 (150 mil) + 15 (alto) = 68
    assert (det.relevancia.score, det.relevancia.faixa, det.relevancia.parcial) == (68, "alta", False)
    assert [s.chave for s in det.risco.sinais][0] == "proxima_acao_vencida"
    assert det.risco.sinais[0].desde == date(2026, 1, 1)


def test_post_e_put_devolvem_enriquecido(ctx):
    from app.api.v1.routers.desenvolvimento_economico import atualizar_retencao
    db, _, u1, *_ = ctx
    out = _criar_empresa(db, u1, num_empregos=10)
    assert out.relevancia.score == 20 and out.risco.nivel == "nenhum"
    upd = atualizar_retencao(out.id, EmpresaRetencaoUpdate(potencial_expansao="alto"), db=db, current_user=u1)
    assert upd.relevancia.score == 35


def test_enriquecer_casa_o_perfil_do_municipio_certo(ctx):
    from app.services.gestao_empresarial import enriquecer
    db, _, u1, u2, m1, m2 = ctx
    db.add_all([
        Empresa(municipio_id=m1.id, cnpj_basico="12345678", razao_social="Filial 1", situacao="02", porte="01"),
        Empresa(municipio_id=m2.id, cnpj_basico="12345678", razao_social="Filial 2", situacao="02", porte="05"),
    ])
    db.commit()
    e1 = _criar_empresa(db, u1, cnpj_basico="12345678")
    e2 = _criar_empresa(db, u2, cnpj_basico="12345678")
    cadastros = db.query(EmpresaRetencao).filter(EmpresaRetencao.id.in_([e1.id, e2.id])).all()
    calc = enriquecer(db, cadastros)
    assert calc[e1.id].perfil_rfb.razao_social == "Filial 1" and calc[e1.id].relevancia.score == 6
    assert calc[e2.id].perfil_rfb.razao_social == "Filial 2" and calc[e2.id].relevancia.score == 20


def test_enriquecer_usa_contatos_visitas_e_demandas(ctx):
    from datetime import timedelta
    from app.api.v1.routers.desenvolvimento_economico import (
        adicionar_contato, adicionar_demanda, adicionar_visita, detalhe_retencao,
    )
    from app.schemas.desenvolvimento_economico import VisitaRetencaoCreate
    db, _, u1, *_ = ctx
    hoje = date.today()
    e = _criar_empresa(db, u1)
    adicionar_contato(e.id, ContatoEmpresaCreate(data=hoje - timedelta(days=200)), db=db, current_user=u1)
    adicionar_visita(e.id, VisitaRetencaoCreate(data_visita=hoje - timedelta(days=10)), db=db, current_user=u1)
    adicionar_demanda(e.id, DemandaEmpresaCreate(descricao="Via", data_registro=hoje - timedelta(days=45)),
                      db=db, current_user=u1)
    det = detalhe_retencao(e.id, db=db, current_user=u1)
    chaves = [s.chave for s in det.risco.sinais]
    assert "sem_contato_90d" not in chaves          # a visita de 10 dias atrás conta como contato
    assert chaves == ["demanda_aberta_30d"] and det.risco.nivel == "atencao"
    assert det.risco.sinais[0].desde == hoje - timedelta(days=45)
```

(`adicionar_visita(empresa_id, data: VisitaRetencaoCreate, db, current_user)` — router linhas 266-287; `VisitaRetencaoCreate` só exige `data_visita`.)

- [ ] **Step 2: Rodar e ver falhar**

Run: `venv/Scripts/python -m pytest backend/tests/test_gestao_empresarial_endpoints.py -p no:warnings`
Expected: os 5 testes novos falham (`AttributeError: ... 'relevancia'`); os antigos continuam passando.

- [ ] **Step 3: Schemas**

Em `backend/app/schemas/desenvolvimento_economico.py`, inserir antes de `class EmpresaRetencaoOut(BaseModel):`:

```python
# ── relevância e risco calculados (derivados na leitura) ──────────────────

class FatorOut(BaseModel):
    chave: str
    rotulo: str
    pontos: int
    maximo: int
    origem: Literal["cadastro", "rfb"]


class RelevanciaOut(BaseModel):
    score: int
    faixa: Literal["alta", "media", "baixa"]
    parcial: bool
    fatores: List[FatorOut]


class SinalOut(BaseModel):
    chave: str
    rotulo: str
    desde: Optional[date] = None


class RiscoOut(BaseModel):
    nivel: Literal["alto", "atencao", "nenhum"]
    sinais: List[SinalOut]


```

Em `EmpresaRetencaoOut`, logo após `perfil_rfb: Optional[EmpresaOut] = None`, e em `EmpresaRetencaoLeanOut`, logo após `proxima_acao_data: Optional[date] = None`, acrescentar (obrigatórios — toda resposta vem enriquecida):

```python
    relevancia: RelevanciaOut
    risco: RiscoOut
```

- [ ] **Step 4: Router — helpers e handlers**

Imports (topo de `backend/app/api/v1/routers/desenvolvimento_economico.py`): acrescentar

```python
from dataclasses import asdict

from sqlalchemy import inspect as sa_inspect
```
e, após o bloco `from app.schemas.empresa import EmpresaOut`:
```python
from app.services.gestao_empresarial import Enriquecimento, enriquecer, ordenar_por_relevancia
```
(`EmpresaOut` deixa de ser usado no detalhe; remover o import se o lint acusar.)

Após `_apply_tenant`, acrescentar:

```python
def _colunas(obj) -> dict:
    """Colunas mapeadas do ORM como dict — os schemas enriquecidos têm campos
    obrigatórios que o ORM não tem, então a serialização é explícita."""
    return {a.key: getattr(obj, a.key) for a in sa_inspect(type(obj)).column_attrs}


def _lean_out(empresa: EmpresaRetencao, calc: Enriquecimento) -> EmpresaRetencaoLeanOut:
    return EmpresaRetencaoLeanOut.model_validate(
        {**_colunas(empresa), "relevancia": asdict(calc.relevancia), "risco": asdict(calc.risco)},
        from_attributes=True,
    )


def _lean_enriquecido(db: Session, empresa: EmpresaRetencao) -> EmpresaRetencaoLeanOut:
    return _lean_out(empresa, enriquecer(db, [empresa])[empresa.id])
```

`listar_retencao`: trocar a última linha `return query.order_by(EmpresaRetencao.nome).all()` por

```python
    empresas = query.all()
    calc = enriquecer(db, empresas)
    # Ordem de relevância decrescente com desempate por nome (antes: só nome).
    return [_lean_out(e, calc[e.id]) for e in ordenar_por_relevancia(empresas, calc)]
```

`detalhe_retencao`: substituir do `out = EmpresaRetencaoOut.model_validate(empresa)` até o `return out` por

```python
    calc = enriquecer(db, [empresa])[empresa.id]  # perfil RFB lido uma única vez, aqui
    return EmpresaRetencaoOut.model_validate(
        {
            **_colunas(empresa),
            "visitas": empresa.visitas,
            "contatos": empresa.contatos,
            "demandas": empresa.demandas,
            "perfil_rfb": calc.perfil_rfb,
            "relevancia": asdict(calc.relevancia),
            "risco": asdict(calc.risco),
        },
        from_attributes=True,
    )
```

`criar_retencao` e `atualizar_retencao`: trocar o `return empresa` final por `return _lean_enriquecido(db, empresa)`.

- [ ] **Step 5: Rodar os testes do módulo e a suíte inteira**

Run: `venv/Scripts/python -m pytest backend/tests/test_gestao_empresarial_endpoints.py backend/tests/test_gestao_empresarial_schemas.py backend/tests/test_gestao_empresarial_score.py -p no:warnings`
Expected: todos passam (os testes antigos continuam lendo `out.id`, `out.cnpj_basico`, `e.nome` do `LeanOut`).

Run: `venv/Scripts/python -m pytest backend/tests -p no:warnings`
Expected: `N passed` com N ≥ 506 + testes novos das Tasks 1-2, zero falhas.

- [ ] **Step 6: Commit**

```bash
git add backend/app/schemas/desenvolvimento_economico.py backend/app/api/v1/routers/desenvolvimento_economico.py backend/tests/test_gestao_empresarial_endpoints.py
git commit -m "feat(gestao-empresarial): retencao devolve relevancia e risco calculados; lista ordenada por relevancia"
```

---

### Task 3: `GestaoEmpresarialTab` — chips, 5 KPIs, busca/ordenação/filtro

**Files:**
- Modify: `frontend-observatorio/src/pages/desenvolvimento-economico/GestaoEmpresarialTab.jsx` (imports; constantes após `EXPANSAO_CONFIG`; estado/memo após `deleteConfirmId`; bloco `kpis`; JSX "KPI row", "Toolbar" e "Company cards")
- Test: `frontend-observatorio/src/pages/desenvolvimento-economico/GestaoEmpresarialTab.test.jsx` (acrescentar um `describe`; os 2 testes existentes ficam)

**Interfaces:**
- Consumes (Task 2): itens da lista com `relevancia?.score|faixa|parcial` e `risco?.nivel|sinais[]` (optional chaining obrigatório: o mock existente não os envia).
- Produces: nada consumido por outra task (a Task 4 é independente).

- [ ] **Step 1: Escrever os testes (falhando)**

Acrescentar ao fim de `GestaoEmpresarialTab.test.jsx` (o mock de `api.get` do topo devolve `[{id:1, nome:"ACME", ...}]` para `/retencao`; nos testes novos sobrescreve-se `api.get.mockImplementation`):

```jsx
import { fireEvent, within } from "@testing-library/react";

const LISTA = [
  { id: 2, nome: "Bar do Zé", setor: "Serviços", status_risco: "alto", potencial_expansao: "baixo", num_empregos: 3,
    relevancia: { score: 10, faixa: "baixa", parcial: true, fatores: [] },
    risco: { nivel: "nenhum", sinais: [] } },
  { id: 3, nome: "Câmara Fria", setor: "Logística", status_risco: "medio", potencial_expansao: "medio", num_empregos: 120,
    relevancia: { score: 44, faixa: "media", parcial: false, fatores: [] },
    risco: { nivel: "atencao", sinais: [{ chave: "rfb_irregular", rotulo: "Situação inapta na RFB", desde: null }] } },
  { id: 1, nome: "ACME", setor: "Indústria", status_risco: "baixo", potencial_expansao: "alto", num_empregos: 42,
    relevancia: { score: 68, faixa: "alta", parcial: false, fatores: [] },
    risco: { nivel: "alto", sinais: [
      { chave: "proxima_acao_vencida", rotulo: "Próxima ação vencida", desde: "2026-08-01" },
      { chave: "sem_contato_90d", rotulo: "Sem contato há mais de 90 dias", desde: "2026-05-01" },
    ] } },
];

const nomesNaTela = () => screen.getAllByRole("heading", { level: 4 }).map((h) => h.textContent);
// Só o <p> do KPI: "Em risco" e "Alta relevância" também são <option> do filtro.
const kpi = (label) => screen.getAllByText(label).find((el) => el.tagName === "P").nextElementSibling.textContent;

describe("GestaoEmpresarialTab — relevância e risco calculados", () => {
  beforeEach(() => {
    viewAsState.viewAsId = 42;
    api.get.mockImplementation((url) => Promise.resolve({ data: url.endsWith("/retencao") ? LISTA : {} }));
  });

  it("cards mostram chip de relevância (com 'parcial' sem vínculo RFB) e chips curtos por sinal", async () => {
    montar();
    await waitFor(() => expect(screen.getByText("ACME")).toBeInTheDocument());
    expect(screen.getByText("Relevância 68 · Alta")).toBeInTheDocument();
    const parcial = screen.getByText("Relevância 10 · Baixa · parcial");
    expect(parcial).toHaveAttribute("title", "sem vínculo com a base RFB");
    expect(screen.getByText("Ação vencida")).toBeInTheDocument();
    expect(screen.getByText("Sem contato 90d+")).toBeInTheDocument();
    expect(screen.getByText("RFB irregular")).toBeInTheDocument();
    expect(screen.getByText("Risco alto")).toBeInTheDocument(); // chip manual continua (Bar do Zé)
  });

  it("5 KPIs: 'Em risco' conta manual alto OU calculado alto", async () => {
    montar();
    await waitFor(() => expect(screen.getByText("ACME")).toBeInTheDocument());
    expect(kpi("Total de empresas")).toBe("3");
    expect(kpi("Em risco")).toBe("2");          // ACME (calculado alto) + Bar do Zé (manual alto)
    expect(kpi("Alta relevância")).toBe("1");
    expect(kpi("Alto potencial")).toBe("1");
    expect(kpi("Total empregos")).toBe("165");
  });

  it("ordem padrão é relevância decrescente, mesmo que a API venha em outra ordem", async () => {
    montar();
    await waitFor(() => expect(screen.getByText("ACME")).toBeInTheDocument());
    expect(nomesNaTela()).toEqual(["ACME", "Câmara Fria", "Bar do Zé"]);
  });

  it("ordenação por Nome e por Risco (alto → atenção → nenhum)", async () => {
    montar();
    await waitFor(() => expect(screen.getByText("ACME")).toBeInTheDocument());
    fireEvent.change(screen.getByRole("combobox", { name: "Ordenar por" }), { target: { value: "nome" } });
    expect(nomesNaTela()).toEqual(["ACME", "Bar do Zé", "Câmara Fria"]);
    fireEvent.change(screen.getByRole("combobox", { name: "Ordenar por" }), { target: { value: "risco" } });
    expect(nomesNaTela()).toEqual(["ACME", "Câmara Fria", "Bar do Zé"]);
  });

  it("busca ignora acento e caixa (nome ou setor) e mostra estado vazio", async () => {
    montar();
    await waitFor(() => expect(screen.getByText("ACME")).toBeInTheDocument());
    const busca = screen.getByRole("textbox", { name: "Buscar empresa" });
    fireEvent.change(busca, { target: { value: "camara" } });
    expect(nomesNaTela()).toEqual(["Câmara Fria"]);
    fireEvent.change(busca, { target: { value: "LOGIST" } });
    expect(nomesNaTela()).toEqual(["Câmara Fria"]);
    fireEvent.change(busca, { target: { value: "zzz" } });
    expect(screen.getByText("Nenhuma empresa corresponde ao filtro.")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 4 })).toBeNull();
  });

  it("filtros Em risco / Alta relevância / Sem vínculo RFB", async () => {
    montar();
    await waitFor(() => expect(screen.getByText("ACME")).toBeInTheDocument());
    const filtro = screen.getByRole("combobox", { name: "Filtrar empresas" });
    fireEvent.change(filtro, { target: { value: "risco" } });
    expect(nomesNaTela()).toEqual(["ACME", "Bar do Zé"]);
    fireEvent.change(filtro, { target: { value: "alta" } });
    expect(nomesNaTela()).toEqual(["ACME"]);
    fireEvent.change(filtro, { target: { value: "sem_rfb" } });
    expect(nomesNaTela()).toEqual(["Bar do Zé"]);
    fireEvent.change(filtro, { target: { value: "todas" } });
    expect(nomesNaTela()).toHaveLength(3);
  });

  it("lista sem enriquecimento (mock antigo) não quebra: KPIs calculados valem 0", async () => {
    api.get.mockImplementation((url) => Promise.resolve({
      data: url.endsWith("/retencao") ? [{ id: 1, nome: "ACME", status_risco: "baixo", potencial_expansao: "baixo" }] : {},
    }));
    montar();
    await waitFor(() => expect(screen.getByText("ACME")).toBeInTheDocument());
    expect(kpi("Em risco")).toBe("0");
    expect(kpi("Alta relevância")).toBe("0");
    expect(screen.queryByText(/^Relevância \d/)).toBeNull(); // só o chip; a <option> "Relevância" não conta
  });
});
```

Nota: o `import { fireEvent, within }` vai junto ao `import { render, screen, waitFor }` já existente na linha 3 (mesclar num só import; `within` só se usado).

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/pages/desenvolvimento-economico/GestaoEmpresarialTab.test.jsx` (de `frontend-observatorio/`)
Expected: os 7 novos falham (chips/KPIs/combobox inexistentes); os 2 antigos passam.

- [ ] **Step 3: Implementar na aba**

Em `GestaoEmpresarialTab.jsx`:

1. Import: `import { useEffect, useMemo, useState, useCallback, useContext } from "react";` e `import NidSelect from "../../components/nid/NidSelect";`.

2. Após `EXPANSAO_CONFIG`:

```jsx
// Relevância e risco calculados no backend (derivados na leitura). Tons por
// tokens: alta accent-5, média accent-4, baixa text-dim; sinais em accent-4,
// accent-2 quando o nível é alto ou a empresa está baixada na RFB.
const FAIXA_CONFIG = {
  alta:  { label: "Alta",  color: "var(--accent-5)" },
  media: { label: "Média", color: "var(--accent-4)" },
  baixa: { label: "Baixa", color: "var(--text-dim)" },
};
const SINAL_LABEL = {
  proxima_acao_vencida: "Ação vencida",
  sem_contato_90d: "Sem contato 90d+",
  demanda_aberta_30d: "Demanda aberta 30d+",
  rfb_irregular: "RFB irregular",
  rfb_baixada: "RFB baixada",
};
const NIVEL_ORDEM = { alto: 0, atencao: 1, nenhum: 2 };
const normalizar = (s) => (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
// "Em risco" = avaliação manual alta OU nível calculado alto.
const emRisco = (e) => e.status_risco === "alto" || e.risco?.nivel === "alto";
const porNome = (a, b) => a.nome.localeCompare(b.nome, "pt-BR", { sensitivity: "base" });
const score = (e) => e.relevancia?.score ?? 0;

function ChipRelevancia({ relevancia }) {
  if (!relevancia) return null;
  const faixa = FAIXA_CONFIG[relevancia.faixa] || FAIXA_CONFIG.baixa;
  return (
    <span
      className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-[var(--panel-2)]"
      style={{ color: faixa.color }}
      title={relevancia.parcial ? "sem vínculo com a base RFB" : undefined}
    >
      Relevância {relevancia.score} · {faixa.label}{relevancia.parcial ? " · parcial" : ""}
    </span>
  );
}

function ChipsSinais({ risco }) {
  if (!risco?.sinais?.length) return null;
  return risco.sinais.map((s) => (
    <span
      key={s.chave}
      className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-[var(--panel-2)]"
      style={{ color: risco.nivel === "alto" || s.chave === "rfb_baixada" ? "var(--accent-2)" : "var(--accent-4)" }}
    >
      {SINAL_LABEL[s.chave] || s.rotulo}
    </span>
  ));
}
```

3. Após `const [deleteConfirmId, setDeleteConfirmId] = useState(null);`:

```jsx
  // Busca, ordenação e filtro no cliente sobre a lista já carregada (a ordem
  // inicial do backend já é a de relevância; reordenar aqui mantém a regra
  // visível mesmo com mocks/listas antigas).
  const [busca, setBusca] = useState("");
  const [ordem, setOrdem] = useState("relevancia"); // relevancia | nome | risco
  const [filtro, setFiltro] = useState("todas");    // todas | risco | alta | sem_rfb

  const visiveis = useMemo(() => {
    const q = normalizar(busca.trim());
    const lista = empresas.filter((e) => {
      if (q && !normalizar(e.nome).includes(q) && !normalizar(e.setor).includes(q)) return false;
      if (filtro === "risco") return emRisco(e);
      if (filtro === "alta") return e.relevancia?.faixa === "alta";
      if (filtro === "sem_rfb") return Boolean(e.relevancia?.parcial);
      return true;
    });
    if (ordem === "nome") return [...lista].sort(porNome);
    if (ordem === "risco") {
      return [...lista].sort((a, b) =>
        (NIVEL_ORDEM[a.risco?.nivel] ?? 2) - (NIVEL_ORDEM[b.risco?.nivel] ?? 2) || score(b) - score(a) || porNome(a, b));
    }
    return [...lista].sort((a, b) => score(b) - score(a) || porNome(a, b));
  }, [empresas, busca, ordem, filtro]);
```

4. Substituir o objeto `kpis` por:

```jsx
  const kpis = {
    total: empresas.length,
    emRisco: empresas.filter(emRisco).length,
    altaRelevancia: empresas.filter((e) => e.relevancia?.faixa === "alta").length,
    altoExpansao: empresas.filter((e) => e.potencial_expansao === "alto").length,
    totalEmpregos: empresas.reduce((s, e) => s + (e.num_empregos || 0), 0),
  };
```

5. Substituir o bloco `{/* KPI row */}` inteiro por:

```jsx
      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
        {[
          { label: "Total de empresas", value: kpis.total, color: "text-[var(--text)]" },
          { label: "Em risco", value: kpis.emRisco, color: "text-red-600" },
          { label: "Alta relevância", value: kpis.altaRelevancia, color: "text-[var(--accent-5)]" },
          { label: "Alto potencial", value: kpis.altoExpansao, color: "text-blue-600" },
          { label: "Total empregos", value: kpis.totalEmpregos.toLocaleString("pt-BR"), color: "text-green-600" },
        ].map((k) => (
          <div key={k.label} className="bg-[var(--panel)] rounded-xl border border-[var(--border)] p-4">
            <p className="text-xs text-slate-400 uppercase tracking-wider">{k.label}</p>
            <p className={`text-2xl font-extrabold mt-1 ${k.color}`}>{k.value}</p>
          </div>
        ))}
      </div>
```

6. Substituir o bloco `{/* Toolbar */}` por:

```jsx
      {/* Toolbar: busca, ordenação e filtro (cliente) + Nova Empresa */}
      <div className="flex flex-wrap items-center gap-2">
        <input
          aria-label="Buscar empresa"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por nome ou setor…"
          className="px-3 py-1.5 rounded-xl border border-[var(--border)] text-sm bg-[var(--panel)] text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-1)] min-w-[220px]"
        />
        <NidSelect value={ordem} onChange={(e) => setOrdem(e.target.value)} ariaLabel="Ordenar por">
          <option value="relevancia">Relevância</option>
          <option value="nome">Nome</option>
          <option value="risco">Risco</option>
        </NidSelect>
        <NidSelect value={filtro} onChange={(e) => setFiltro(e.target.value)} ariaLabel="Filtrar empresas">
          <option value="todas">Todas</option>
          <option value="risco">Em risco</option>
          <option value="alta">Alta relevância</option>
          <option value="sem_rfb">Sem vínculo RFB</option>
        </NidSelect>
        {canCriar && (
          <button
            onClick={openCreate}
            className="ml-auto flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-colors cursor-pointer"
          >
            <PlusIcon className="w-4 h-4" />
            Nova Empresa
          </button>
        )}
      </div>
```

7. No bloco `{/* Company cards */}`: trocar o ternário para três estados e iterar `visiveis`:

```jsx
      {empresas.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <p className="text-sm">Nenhuma empresa monitorada ainda.</p>
          {canCriar && <p className="text-xs mt-1">Clique em "Nova Empresa" para começar.</p>}
        </div>
      ) : visiveis.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <p className="text-sm">Nenhuma empresa corresponde ao filtro.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {visiveis.map((empresa) => {
```
e, dentro do card, substituir o `<div className="flex flex-wrap gap-1.5">` dos dois chips por:

```jsx
                  <div className="flex flex-wrap gap-1.5">
                    <ChipRelevancia relevancia={empresa.relevancia} />
                    <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${risco.color}`}>{risco.label}</span>
                    <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${expansao.color}`}>{expansao.label}</span>
                    <ChipsSinais risco={empresa.risco} />
                  </div>
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/pages/desenvolvimento-economico/GestaoEmpresarialTab.test.jsx`
Expected: 9 passed (2 antigos + 7 novos).

- [ ] **Step 5: Commit**

```bash
git add frontend-observatorio/src/pages/desenvolvimento-economico/GestaoEmpresarialTab.jsx frontend-observatorio/src/pages/desenvolvimento-economico/GestaoEmpresarialTab.test.jsx
git commit -m "feat(gestao-empresarial): chips de relevancia e sinais, 5 KPIs e busca/ordenacao/filtro na aba"
```

---

### Task 4: `EmpresaDrawer` — blocos Relevância e Sinais de risco na aba Perfil

**Files:**
- Modify: `frontend-observatorio/src/pages/desenvolvimento-economico/EmpresaDrawer.jsx` (constantes após `SITUACAO_RFB` ~linha 26; componentes antes de `export default`; aba Perfil ~linhas 205-237)
- Test: `frontend-observatorio/src/pages/desenvolvimento-economico/EmpresaDrawer.test.jsx` (ampliar `DETALHE`/`EMPRESA`; acrescentar um `describe`)

**Interfaces:**
- Consumes (Task 2): `detalhe.relevancia` / `detalhe.risco` (e, enquanto o detalhe não chegou, `empresa.relevancia` / `empresa.risco` do card). `fatores[].origem` decide o bloco; `fatores[].maximo === 0` é o modificador de situação.
- Produces: nada.

- [ ] **Step 1: Escrever os testes (falhando)**

Em `EmpresaDrawer.test.jsx`, ampliar as constantes:

```jsx
const RELEVANCIA = {
  score: 61, faixa: "alta", parcial: false,
  fatores: [
    { chave: "empregos", rotulo: "Empregos informados: 42", pontos: 20, maximo: 40, origem: "cadastro" },
    { chave: "porte", rotulo: "Porte RFB: empresa de pequeno porte", pontos: 12, maximo: 20, origem: "rfb" },
    { chave: "tempo", rotulo: "Tempo de atividade: 16 ano(s)", pontos: 15, maximo: 15, origem: "rfb" },
    { chave: "capital", rotulo: "Capital social: R$ 150.000", pontos: 6, maximo: 10, origem: "rfb" },
    { chave: "expansao", rotulo: "Potencial de expansão: médio", pontos: 8, maximo: 15, origem: "cadastro" },
  ],
};
const RISCO = { nivel: "atencao", sinais: [{ chave: "proxima_acao_vencida", rotulo: "Próxima ação vencida", desde: "2026-08-01" }] };
```
e acrescentar `relevancia: RELEVANCIA, risco: RISCO` ao objeto `DETALHE` (após `perfil_rfb: {...}`). `EMPRESA` fica sem os campos (prova o fallback).

Acrescentar ao fim do arquivo:

```jsx
describe("EmpresaDrawer — relevância e sinais calculados", () => {
  it("bloco Relevância: score, faixa, barra e fatores de cadastro; fatores RFB dentro da seção Base RFB", () => {
    montar();
    const bloco = screen.getByRole("region", { name: "Relevância" });
    expect(within(bloco).getByText("61")).toBeInTheDocument();
    expect(within(bloco).getByText("Alta")).toBeInTheDocument();
    expect(within(bloco).getByRole("progressbar")).toHaveAttribute("aria-valuenow", "61");
    expect(within(bloco).getByText("Empregos informados: 42")).toBeInTheDocument();
    expect(within(bloco).getByText("20/40")).toBeInTheDocument();
    expect(within(bloco).queryByText(/Porte RFB/)).toBeNull(); // fatores RFB não ficam no bloco
    const rfb = screen.getByText("Base RFB").closest("div");
    expect(within(rfb).getByText("Porte RFB: empresa de pequeno porte")).toBeInTheDocument();
    expect(within(rfb).getByText("12/20")).toBeInTheDocument();
    expect(within(rfb).getByText("15/15")).toBeInTheDocument();
  });

  it("bloco Sinais de risco lista rótulo e data de referência", () => {
    montar();
    const bloco = screen.getByRole("region", { name: "Sinais de risco" });
    expect(bloco.textContent).toContain("atenção");
    expect(within(bloco).getByText(/Próxima ação vencida/)).toBeInTheDocument();
    expect(bloco.textContent).toContain("desde 01/08/2026");
  });

  it("dicas de dado ausente: empregos não informados e sem vínculo RFB (parcial); nenhum sinal", () => {
    const parcial = {
      ...DETALHE, perfil_rfb: null,
      relevancia: { score: 8, faixa: "baixa", parcial: true, fatores: [
        { chave: "empregos", rotulo: "Empregos: não informado", pontos: 0, maximo: 40, origem: "cadastro" },
        { chave: "porte", rotulo: "Porte RFB: sem vínculo RFB", pontos: 0, maximo: 20, origem: "rfb" },
        { chave: "tempo", rotulo: "Tempo de atividade: sem vínculo RFB", pontos: 0, maximo: 15, origem: "rfb" },
        { chave: "capital", rotulo: "Capital social: sem vínculo RFB", pontos: 0, maximo: 10, origem: "rfb" },
        { chave: "expansao", rotulo: "Potencial de expansão: médio", pontos: 8, maximo: 15, origem: "cadastro" },
      ] },
      risco: { nivel: "nenhum", sinais: [] },
    };
    render(<EmpresaDrawer empresa={EMPRESA} detalhe={parcial} onClose={() => {}} onChanged={vi.fn()} canEditar={true} />);
    expect(screen.getByText(/Baixa · parcial/)).toBeInTheDocument();
    expect(screen.getByText(/informe os empregos para refinar/)).toBeInTheDocument();
    expect(screen.getByText(/vincule à base RFB no formulário/)).toBeInTheDocument();
    expect(screen.getByText("Nenhum sinal de risco calculado.")).toBeInTheDocument();
  });

  it("modificador de situação aparece com pontos negativos e sem máximo", () => {
    const baixada = {
      ...DETALHE,
      relevancia: { ...RELEVANCIA, score: 0, faixa: "baixa", fatores: [
        ...RELEVANCIA.fatores,
        { chave: "situacao", rotulo: "baixada na RFB: score zerado", pontos: -61, maximo: 0, origem: "rfb" },
      ] },
    };
    render(<EmpresaDrawer empresa={EMPRESA} detalhe={baixada} onClose={() => {}} onChanged={vi.fn()} canEditar={true} />);
    const rfb = screen.getByText("Base RFB").closest("div");
    expect(within(rfb).getByText("baixada na RFB: score zerado")).toBeInTheDocument();
    expect(within(rfb).getByText("-61")).toBeInTheDocument();
  });

  it("sem plano 'empresas' os fatores RFB ficam sob o mesmo PlanGate da Base RFB (um único cadeado)", () => {
    render(
      <PlanContext.Provider value={{ modulos: [], canAccess: (k) => k !== "empresas" }}>
        <EmpresaDrawer empresa={EMPRESA} detalhe={DETALHE} onClose={() => {}} onChanged={vi.fn()} canEditar={true} />
      </PlanContext.Provider>
    );
    expect(screen.getAllByText("Disponível apenas no plano pago")).toHaveLength(1);
    expect(screen.getByRole("region", { name: "Relevância" }).textContent).toContain("61"); // score e cadastro visíveis
  });

  it("enquanto o detalhe não chegou, usa relevância/risco do card", () => {
    render(<EmpresaDrawer empresa={{ ...EMPRESA, relevancia: RELEVANCIA, risco: RISCO }} detalhe={null}
      onClose={() => {}} onChanged={vi.fn()} canEditar={true} />);
    expect(screen.getByRole("region", { name: "Relevância" }).textContent).toContain("61");
  });
});
```
(`within` vem de `@testing-library/react` — acrescentar ao import da linha 3.)

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/pages/desenvolvimento-economico/EmpresaDrawer.test.jsx`
Expected: os 6 novos falham (`Unable to find role="region"`); os 7 antigos passam.

- [ ] **Step 3: Implementar no drawer**

Após `const SITUACAO_RFB = {...};`:

```jsx
const FAIXA_CONFIG = {
  alta:  { label: "Alta",  color: "var(--accent-5)" },
  media: { label: "Média", color: "var(--accent-4)" },
  baixa: { label: "Baixa", color: "var(--text-dim)" },
};
const NIVEL_LABEL = { alto: "alto", atencao: "atenção", nenhum: "nenhum" };
```

Antes de `export default function EmpresaDrawer(...)`:

```jsx
// Linha "rótulo …… pontos/máximo". Fator de cadastro zerado por dado ausente
// vira dica; o modificador de situação (maximo 0) mostra só os pontos.
function LinhaFator({ f }) {
  const dica = f.chave === "empregos" && f.pontos === 0 ? " — informe os empregos para refinar" : "";
  return (
    <li className="flex justify-between gap-2 text-xs">
      <span className="text-[var(--text-dim)]">{f.rotulo}{dica}</span>
      <span className="text-[var(--text)] tabular-nums shrink-0">{f.maximo > 0 ? `${f.pontos}/${f.maximo}` : String(f.pontos)}</span>
    </li>
  );
}

// Score, faixa, barra e fatores de cadastro. Os fatores RFB ficam na seção
// Base RFB (sob o PlanGate "empresas" já existente) — ver FatoresRfb.
function BlocoRelevancia({ relevancia }) {
  if (!relevancia) return null;
  const faixa = FAIXA_CONFIG[relevancia.faixa] || FAIXA_CONFIG.baixa;
  const cadastro = relevancia.fatores.filter((f) => f.origem === "cadastro");
  return (
    <section aria-label="Relevância" className="rounded-xl border border-[var(--border)] bg-[var(--panel-2)] p-3 space-y-2">
      <div className="flex items-baseline gap-2">
        <p className="text-xs font-semibold text-[var(--text-dim)] uppercase tracking-wider">Relevância</p>
        <span className="text-xl font-extrabold" style={{ color: faixa.color }}>{relevancia.score}</span>
        <span className="text-xs" style={{ color: faixa.color }}>{faixa.label}{relevancia.parcial ? " · parcial" : ""}</span>
      </div>
      <div className="h-1.5 rounded-full bg-[var(--panel)] overflow-hidden" role="progressbar"
        aria-valuenow={relevancia.score} aria-valuemin={0} aria-valuemax={100}>
        <div className="h-full rounded-full" style={{ width: `${relevancia.score}%`, background: faixa.color }} />
      </div>
      <ul className="space-y-1">{cadastro.map((f) => <LinhaFator key={f.chave} f={f} />)}</ul>
      {relevancia.parcial && (
        <p className="text-xs text-slate-400">parcial — vincule à base RFB no formulário de edição.</p>
      )}
    </section>
  );
}

function FatoresRfb({ relevancia }) {
  const rfb = relevancia?.fatores?.filter((f) => f.origem === "rfb") ?? [];
  if (rfb.length === 0) return null;
  return (
    <div className="pt-2 space-y-1">
      <p className="text-[11px] text-slate-400 uppercase tracking-wider">Na relevância</p>
      <ul className="space-y-1">{rfb.map((f) => <LinhaFator key={f.chave} f={f} />)}</ul>
    </div>
  );
}

function BlocoSinais({ risco }) {
  if (!risco) return null;
  return (
    <section aria-label="Sinais de risco" className="rounded-xl border border-[var(--border)] bg-[var(--panel-2)] p-3 space-y-1.5">
      <p className="text-xs font-semibold text-[var(--text-dim)] uppercase tracking-wider">
        Sinais de risco{risco.nivel !== "nenhum" && ` · ${NIVEL_LABEL[risco.nivel] || risco.nivel}`}
      </p>
      {risco.sinais.length === 0 ? (
        <p className="text-xs text-slate-400">Nenhum sinal de risco calculado.</p>
      ) : (
        <ul className="space-y-1">
          {risco.sinais.map((s) => (
            <li key={s.chave} className="text-xs text-[var(--text)]">
              {s.rotulo}{s.desde && <span className="text-slate-400"> · desde {fmtDate(s.desde)}</span>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
```

Dentro de `EmpresaDrawer`, após `const proximaAcaoData = ...`:

```jsx
  // Enquanto o detalhe não chegou, o card já traz relevância/risco (LeanOut).
  const relevancia = det?.relevancia ?? empresa?.relevancia ?? null;
  const riscoCalc = det?.risco ?? empresa?.risco ?? null;
```

Na aba Perfil (`{aba === 0 && (`), logo após `<div className="space-y-3">`, inserir antes do bloco de empregos:

```jsx
              <BlocoRelevancia relevancia={relevancia} />
              <BlocoSinais risco={riscoCalc} />
```

E dentro do `<PlanGate planKey="empresas">` da Base RFB, logo após o fechamento do ternário `det?.perfil_rfb ? (...) : (...)` e antes do `</div>` que fecha `border-t border-[var(--border)] pt-3 space-y-1.5`, inserir:

```jsx
                  <FatoresRfb relevancia={relevancia} />
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/pages/desenvolvimento-economico/EmpresaDrawer.test.jsx`
Expected: 13 passed (7 antigos + 6 novos). (`getByText("Base RFB").closest("div")` é o `div.border-t … space-y-1.5` que envolve o `<p>Base RFB</p>`, a `<dl>` e o `FatoresRfb`.)

- [ ] **Step 5: Suíte completa do front e commit**

Run: `npx vitest run` (de `frontend-observatorio/`)
Expected: `Tests  N passed` com N = 422 + 7 (Task 3) + 6 (Task 4) = 435, zero falhas.

```bash
git add frontend-observatorio/src/pages/desenvolvimento-economico/EmpresaDrawer.jsx frontend-observatorio/src/pages/desenvolvimento-economico/EmpresaDrawer.test.jsx
git commit -m "feat(gestao-empresarial): blocos Relevancia e Sinais de risco na aba Perfil do drawer"
```

---

### Task 5: Fechamento — suítes completas e checklist visual

**Files:** nenhum novo.

- [ ] **Step 1: Suítes completas**

Run (raiz): `venv/Scripts/python -m pytest backend/tests -p no:warnings` → esperado ≥ 506 + ~70 (Task 1) + 5 (Task 2), zero falhas.
Run (`frontend-observatorio/`): `npx vitest run` → esperado 435, zero falhas.

- [ ] **Step 2: Anotar para o relato final (não é código)**

- Sem migração; deploy api + front juntos (o front passa a esperar `relevancia`/`risco` nas respostas de `/retencao`; um front novo contra api velha só perde chips/KPIs calculados, sem quebrar — optional chaining).
- Checklist visual: chip "Relevância N · Faixa" nos cards; 5 KPIs; busca/ordenação/filtro; drawer com bloco Relevância (score, barra, fatores), fatores RFB dentro da Base RFB (cadeado do plano) e bloco Sinais; nos municípios demo quase tudo acende "Sem contato 90d+" (nível atenção) — esperado, o KPI "Em risco" só conta nível alto.
