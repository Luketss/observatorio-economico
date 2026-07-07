# Alerta de Faixa do FPM + Pipeline de Ingestão Automática — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Card + página + notificações que dizem ao prefeito a quantos habitantes ele está de mudar de faixa do FPM e quanto isso vale em R$/ano, alimentados por ingestão automática (IBGE + STN) dentro da plataforma, sem CSV manual.

**Architecture:** Duas tabelas novas (`populacao_municipio`, `fpm_mensal`) alimentadas por um novo pacote `app/services/ingestao_automatica/` (registro de fontes + 2 fetchers HTTP), disparado por endpoints admin. Um `fpm_service.py` com núcleo **puro** (faixas hardcoded, cálculo de alerta) e camada fina de DB, exposto via router `/fpm`. Frontend: card no Painel do Prefeito, página `/app/fpm`, seção "Fontes automáticas" em `/admin/fontes`.

**Tech Stack:** FastAPI + SQLAlchemy 2.0 (sync) + Alembic + PostgreSQL; `requests` (novo); React + Vite + Tailwind + componentes `nid` existentes; pytest (testes puros, sem DB/rede).

**Spec:** `docs/superpowers/specs/2026-07-06-fpm-faixa-alerta-design.md`

## Global Constraints

- Branch de trabalho: `feat/fpm-faixa-alerta` criada a partir de `feat/painel-prefeito`.
- Python roda pelo venv do repo: `..\venv\Scripts\python.exe` a partir de `backend/` (Windows).
- Testes: **pure logic only** — a suíte existente (`backend/tests`) nunca abre conexão de DB nem rede (ver `tests/conftest.py`). Toda lógica testável fica em funções puras; camada DB é fina e verificada manualmente na Task 12.
- Comando de teste: `cd backend` e `..\venv\Scripts\python.exe -m pytest tests/<arquivo> -v`.
- Migrations: chain continua de `0027_vaf_anual` → `0028_fpm_populacao`.
- Modelos: estilo SQLAlchemy 2.0 `Mapped/mapped_column`, FK para `municipios.id`, unique constraints nomeadas `uq_<tabela>_...` (padrão dos modelos existentes).
- FPM é **livre em todos os planos**: endpoints usam `municipio_scope` (NUNCA `scoped_modulo`); itens de nav SEM chave `modulo`.
- Todo texto de UI em pt-BR.
- Endpoints de ingestão: só `ADMIN_GLOBAL` (`require_role("ADMIN_GLOBAL")`).
- Nenhuma chamada de rede em teste; fixtures inline copiadas de respostas reais (verificadas em 2026-07-06).
- Contratos externos verificados em 2026-07-06:
  - IBGE: `GET https://servicodados.ibge.gov.br/api/v3/agregados/6579/periodos/{ano}/variaveis/9324?localidades=N6[{codigos separados por vírgula}]` — um ano por requisição (múltiplos anos com `|` retornou 500). Valores vêm como string.
  - STN: CSV `fpm-por-municipio.csv` (~30 MB, latin-1, `;`), resolvido via CKAN `package_show?id=3b5a779d-78f5-4602-a6b7-23ece6d60f27` (recurso cujo nome contém "FPM"). Header na primeira linha: `COD_MUN;Município;UF;Município - UF;Mês;1996;...;2026`. `COD_MUN` é código TCU (4 dígitos), **não IBGE** → match por (nome normalizado, UF). Meses futuros = `' -   '`. Valores pt-BR: `' 12.281.019,33 '`.

---

### Task 1: Modelos `PopulacaoMunicipio` + `FpmMensal` e migration 0028

**Files:**
- Create: `backend/app/models/populacao.py`
- Create: `backend/app/models/fpm.py`
- Modify: `backend/app/models/__init__.py` (adicionar imports + `__all__`)
- Create: `backend/alembic/versions/0028_fpm_populacao.py`

**Interfaces:**
- Consumes: `app.db.base.Base`, tabela `municipios` existente.
- Produces: `PopulacaoMunicipio(id, municipio_id, ano, populacao, fonte)` e `FpmMensal(id, municipio_id, ano, mes, valor)` — usados pelas Tasks 4, 6, 7.

- [ ] **Step 1: Criar branch de trabalho**

```bash
git checkout feat/painel-prefeito && git checkout -b feat/fpm-faixa-alerta
```

- [ ] **Step 2: Criar os dois modelos**

`backend/app/models/populacao.py`:

```python
from app.db.base import Base
from sqlalchemy import ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship


class PopulacaoMunicipio(Base):
    """Estimativa populacional anual do IBGE (agregado 6579), base do cálculo
    de faixa/coeficiente do FPM. `fonte` distingue estimativa de censo."""

    __tablename__ = "populacao_municipio"
    __table_args__ = (
        UniqueConstraint("municipio_id", "ano", name="uq_populacao_municipio_ano"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    municipio_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("municipios.id"), nullable=False, index=True
    )
    ano: Mapped[int] = mapped_column(Integer, index=True)
    populacao: Mapped[int] = mapped_column(Integer, nullable=False)
    fonte: Mapped[str] = mapped_column(String(60), nullable=False, default="Estimativa IBGE")

    municipio = relationship("Municipio")
```

`backend/app/models/fpm.py`:

```python
from app.db.base import Base
from sqlalchemy import Float, ForeignKey, Integer, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship


class FpmMensal(Base):
    """Repasse mensal (bruto) do FPM por município — fonte STN/Tesouro
    Transparente (Transferências Obrigatórias da União - por Município)."""

    __tablename__ = "fpm_mensal"
    __table_args__ = (
        UniqueConstraint("municipio_id", "ano", "mes", name="uq_fpm_mensal_municipio_ano_mes"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    municipio_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("municipios.id"), nullable=False, index=True
    )
    ano: Mapped[int] = mapped_column(Integer, index=True)
    mes: Mapped[int] = mapped_column(Integer, index=True)
    valor: Mapped[float] = mapped_column(Float, nullable=False)

    municipio = relationship("Municipio")
```

- [ ] **Step 3: Registrar em `backend/app/models/__init__.py`**

Adicionar junto aos demais imports:

```python
from app.models.populacao import PopulacaoMunicipio
from app.models.fpm import FpmMensal
```

E em `__all__` (no fim da lista):

```python
    "PopulacaoMunicipio",
    "FpmMensal",
```

- [ ] **Step 4: Criar a migration**

`backend/alembic/versions/0028_fpm_populacao.py`:

```python
"""add populacao_municipio and fpm_mensal tables

População estimada anual (IBGE, agregado 6579) e repasses mensais brutos do
FPM (STN). Bases do Alerta de Faixa do FPM.

Revision ID: 0028_fpm_populacao
Revises: 0027_vaf_anual
Create Date: 2026-07-06
"""

import sqlalchemy as sa
from alembic import op


revision = "0028_fpm_populacao"
down_revision = "0027_vaf_anual"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "populacao_municipio",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("municipio_id", sa.Integer(), nullable=False),
        sa.Column("ano", sa.Integer(), nullable=False),
        sa.Column("populacao", sa.Integer(), nullable=False),
        sa.Column("fonte", sa.String(length=60), nullable=False, server_default="Estimativa IBGE"),
        sa.ForeignKeyConstraint(["municipio_id"], ["municipios.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("municipio_id", "ano", name="uq_populacao_municipio_ano"),
    )
    op.create_index(op.f("ix_populacao_municipio_id"), "populacao_municipio", ["id"], unique=False)
    op.create_index(op.f("ix_populacao_municipio_municipio_id"), "populacao_municipio", ["municipio_id"], unique=False)
    op.create_index(op.f("ix_populacao_municipio_ano"), "populacao_municipio", ["ano"], unique=False)

    op.create_table(
        "fpm_mensal",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("municipio_id", sa.Integer(), nullable=False),
        sa.Column("ano", sa.Integer(), nullable=False),
        sa.Column("mes", sa.Integer(), nullable=False),
        sa.Column("valor", sa.Float(), nullable=False),
        sa.ForeignKeyConstraint(["municipio_id"], ["municipios.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("municipio_id", "ano", "mes", name="uq_fpm_mensal_municipio_ano_mes"),
    )
    op.create_index(op.f("ix_fpm_mensal_id"), "fpm_mensal", ["id"], unique=False)
    op.create_index(op.f("ix_fpm_mensal_municipio_id"), "fpm_mensal", ["municipio_id"], unique=False)
    op.create_index(op.f("ix_fpm_mensal_ano"), "fpm_mensal", ["ano"], unique=False)
    op.create_index(op.f("ix_fpm_mensal_mes"), "fpm_mensal", ["mes"], unique=False)


def downgrade():
    op.drop_index(op.f("ix_fpm_mensal_mes"), table_name="fpm_mensal")
    op.drop_index(op.f("ix_fpm_mensal_ano"), table_name="fpm_mensal")
    op.drop_index(op.f("ix_fpm_mensal_municipio_id"), table_name="fpm_mensal")
    op.drop_index(op.f("ix_fpm_mensal_id"), table_name="fpm_mensal")
    op.drop_table("fpm_mensal")
    op.drop_index(op.f("ix_populacao_municipio_ano"), table_name="populacao_municipio")
    op.drop_index(op.f("ix_populacao_municipio_municipio_id"), table_name="populacao_municipio")
    op.drop_index(op.f("ix_populacao_municipio_id"), table_name="populacao_municipio")
    op.drop_table("populacao_municipio")
```

- [ ] **Step 5: Rodar a migration**

Se o Postgres local não estiver rodando: `docker-compose up -d` na raiz do repo.

Run: `cd backend && ..\venv\Scripts\python.exe -m alembic upgrade head`
Expected: `Running upgrade 0027_vaf_anual -> 0028_fpm_populacao`

- [ ] **Step 6: Commit**

```bash
git add backend/app/models/populacao.py backend/app/models/fpm.py backend/app/models/__init__.py backend/alembic/versions/0028_fpm_populacao.py
git commit -m "feat(fpm): modelos populacao_municipio e fpm_mensal + migration 0028"
```

---

### Task 2: Núcleo puro do `fpm_service` (faixas, alerta)

**Files:**
- Create: `backend/app/services/fpm_service.py`
- Test: `backend/tests/test_fpm_service.py`

**Interfaces:**
- Consumes: nada (funções puras).
- Produces (usados pelas Tasks 3, 4, 6):
  - `FAIXAS_FPM: list[tuple[int, int | None, float]]` — (pop_min, pop_max|None, coeficiente)
  - `CAPITAIS_IBGE: frozenset[str]` — 27 códigos IBGE
  - `Faixa` (dataclass: `indice: int, pop_min: int, pop_max: int | None, coeficiente: float`)
  - `faixa_para_populacao(pop: int) -> Faixa`
  - `fpm_12m(fpm_meses: list[tuple[int, int, float]]) -> tuple[float | None, bool]` — (total anualizado, parcial)
  - `montar_alerta(pop_atual: tuple[int, int, str] | None, fpm_meses: list[tuple[int, int, float]], *, eh_capital: bool = False, limiar: float = 0.05) -> dict` — dict compatível com o schema `AlertaFpm` (Task 4), com `divergencia=None` e `faixas` preenchidas.

- [ ] **Step 1: Escrever os testes que falham**

`backend/tests/test_fpm_service.py`:

```python
"""Núcleo puro do Alerta de Faixa do FPM — faixas do FPM-Interior
(DL 1.881/81), distâncias, janela de 12 meses e montagem do alerta."""
import pytest

from app.services.fpm_service import (
    FAIXAS_FPM,
    Faixa,
    faixa_para_populacao,
    fpm_12m,
    montar_alerta,
)


# ── faixas ───────────────────────────────────────────────────────────────────
def test_faixas_tem_18_entradas_e_cobre_de_0_a_infinito():
    assert len(FAIXAS_FPM) == 18
    assert FAIXAS_FPM[0][0] == 0 and FAIXAS_FPM[0][2] == 0.6
    assert FAIXAS_FPM[-1][1] is None and FAIXAS_FPM[-1][2] == 4.0


@pytest.mark.parametrize("pop,coef", [
    (1, 0.6), (10_188, 0.6),          # fronteira superior da 1ª faixa
    (10_189, 0.8), (13_584, 0.8),     # fronteiras exatas da 2ª
    (13_585, 1.0),
    (156_216, 3.8),                   # última faixa finita
    (156_217, 4.0), (2_000_000, 4.0), # teto
])
def test_fronteiras_exatas_de_faixa(pop, coef):
    assert faixa_para_populacao(pop).coeficiente == coef


# ── fpm_12m ──────────────────────────────────────────────────────────────────
def test_fpm_12m_soma_ultimos_12_meses():
    meses = [(2025, m, 100_000.0) for m in range(1, 13)] + [(2024, 12, 999_999.0)]
    total, parcial = fpm_12m(meses)
    assert total == pytest.approx(1_200_000.0)
    assert parcial is False


def test_fpm_12m_anualiza_quando_ha_menos_de_12_meses():
    meses = [(2026, m, 100_000.0) for m in range(1, 7)]  # 6 meses
    total, parcial = fpm_12m(meses)
    assert total == pytest.approx(1_200_000.0)  # média 100k × 12
    assert parcial is True


def test_fpm_12m_sem_dados():
    assert fpm_12m([]) == (None, False)


# ── montar_alerta ────────────────────────────────────────────────────────────
FPM_1M_POR_PONTO = [(2025, m, 100_000.0) for m in range(1, 13)]  # 1,2M/ano


def test_alerta_oportunidade_com_valores():
    # pop 23.000 → faixa 1,2 (16.981–23.772); faltam 773 hab. (≤ 5% de 23.000)
    a = montar_alerta((2025, 23_000, "Estimativa IBGE"), FPM_1M_POR_PONTO)
    assert a["disponivel"] is True
    assert a["status"] == "oportunidade"
    assert a["coeficiente"] == 1.2
    assert a["hab_para_subir"] == 773
    assert a["hab_para_cair"] == 6_020
    assert a["fpm_12m"] == pytest.approx(1_200_000.0)
    assert a["valor_por_ponto"] == pytest.approx(1_000_000.0)
    assert a["ganho_proxima_faixa"] == pytest.approx(200_000.0)   # (1,4−1,2)×1M
    assert a["perda_faixa_anterior"] == pytest.approx(200_000.0)  # (1,2−1,0)×1M
    assert a["divergencia"] is None
    assert len(a["faixas"]) == 18
    assert [f for f in a["faixas"] if f["atual"]][0]["coeficiente"] == 1.2


def test_alerta_risco():
    # pop 10.200 → faixa 0,8 (piso 10.189); 12 hab. acima do piso
    a = montar_alerta((2025, 10_200, "Estimativa IBGE"), [])
    assert a["status"] == "risco"
    assert a["hab_para_cair"] == 12
    assert a["fpm_12m"] is None and a["ganho_proxima_faixa"] is None


def test_alerta_teto_sem_proxima_faixa():
    a = montar_alerta((2025, 200_000, "Estimativa IBGE"), [])
    assert a["status"] == "teto"
    assert a["coeficiente"] == 4.0
    assert a["hab_para_subir"] is None
    assert a["hab_para_cair"] == 43_784


def test_alerta_estavel_primeira_faixa_nao_tem_queda():
    a = montar_alerta((2025, 5_000, "Estimativa IBGE"), [])
    assert a["status"] == "estavel"
    assert a["hab_para_cair"] is None
    assert a["hab_para_subir"] == 5_189


def test_alerta_capital_nao_se_aplica():
    a = montar_alerta((2025, 500_000, "Estimativa IBGE"), [], eh_capital=True)
    assert a["disponivel"] is False and a["nao_aplicavel"] is True
    assert a["motivo"] == "fpm_capitais"


def test_alerta_sem_populacao():
    a = montar_alerta(None, [])
    assert a["disponivel"] is False and a["motivo"] == "sem_populacao"
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd backend && ..\venv\Scripts\python.exe -m pytest tests/test_fpm_service.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.services.fpm_service'`

- [ ] **Step 3: Implementar o núcleo**

`backend/app/services/fpm_service.py`:

```python
"""Alerta de Faixa do FPM — núcleo de cálculo.

O FPM-Interior é distribuído por 18 faixas populacionais fixas em lei
(Decreto-Lei 1.881/81). O coeficiente aqui é SEMPRE estimado pela população
(estimativa IBGE); o oficial é fixado pelo TCU e pode divergir nos municípios
protegidos por trava legal (LC 165/2019 e sucessoras) — ver `avaliar_divergencia`.
Capitais seguem o regime FPM-Capitais e ficam fora do cálculo.
"""
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
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd backend && ..\venv\Scripts\python.exe -m pytest tests/test_fpm_service.py -v`
Expected: PASS (todos)

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/fpm_service.py backend/tests/test_fpm_service.py
git commit -m "feat(fpm): nucleo puro do alerta de faixa (faixas DL 1.881/81, fpm_12m, montar_alerta)"
```

---

### Task 3: Divergência (trava legal) + evento de faixa para notificações

**Files:**
- Modify: `backend/app/services/fpm_service.py` (acrescentar funções)
- Test: `backend/tests/test_fpm_service.py` (acrescentar testes)

**Interfaces:**
- Produces (usados pelas Tasks 4 e 6):
  - `avaliar_divergencia(valores_estado: list[float], valor_municipio: float, minimo: int = 5, tolerancia: float = 0.10) -> bool | None`
  - `avaliar_evento_faixa(pops_por_ano: dict[int, int], limiar: float = 0.05) -> dict | None` — retorna `{"tipo": "success"|"warning", "titulo": str, "mensagem": str}` ou None.

- [ ] **Step 1: Acrescentar testes que falham** (no fim de `tests/test_fpm_service.py`)

```python
# ── divergência (trava legal) ────────────────────────────────────────────────
from app.services.fpm_service import avaliar_divergencia, avaliar_evento_faixa


def test_divergencia_none_com_menos_de_5_municipios():
    assert avaliar_divergencia([1e6, 1e6, 1e6, 1e6], 1.5e6) is None


def test_divergencia_true_quando_desvia_mais_de_10pct_da_mediana():
    assert avaliar_divergencia([1e6] * 5, 1.5e6) is True


def test_divergencia_false_dentro_da_tolerancia():
    assert avaliar_divergencia([1e6] * 5, 1.05e6) is False


# ── evento de faixa (notificações) ───────────────────────────────────────────
def test_evento_subiu_de_faixa():
    ev = avaliar_evento_faixa({2024: 10_100, 2025: 10_300})
    assert ev["tipo"] == "success"
    assert "0,8" in ev["mensagem"] and "2025" in ev["titulo"]


def test_evento_caiu_de_faixa():
    ev = avaliar_evento_faixa({2024: 10_300, 2025: 10_100})
    assert ev["tipo"] == "warning"


def test_evento_entrou_em_zona_de_oportunidade():
    # 2024: 1.189 hab. para subir (> 5% de 9.000) | 2025: 389 (≤ 5% de 9.800)
    ev = avaliar_evento_faixa({2024: 9_000, 2025: 9_800})
    assert ev["tipo"] == "success"
    assert "389" in ev["mensagem"]


def test_evento_none_quando_ja_estava_na_mesma_zona():
    assert avaliar_evento_faixa({2024: 9_800, 2025: 9_810}) is None


def test_evento_primeiro_ano_em_zona_notifica():
    ev = avaliar_evento_faixa({2025: 9_800})
    assert ev is not None and ev["tipo"] == "success"


def test_evento_none_sem_dados_ou_estavel():
    assert avaliar_evento_faixa({}) is None
    assert avaliar_evento_faixa({2024: 5_000, 2025: 5_050}) is None
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd backend && ..\venv\Scripts\python.exe -m pytest tests/test_fpm_service.py -v`
Expected: FAIL — `ImportError: cannot import name 'avaliar_divergencia'`

- [ ] **Step 3: Implementar** (acrescentar em `fpm_service.py`)

```python
import statistics


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


def avaliar_evento_faixa(pops_por_ano: dict[int, int], limiar: float = 0.05) -> dict | None:
    """Evento notificável após nova estimativa de população: mudança de faixa
    estimada vs ano anterior, ou entrada em zona de oportunidade/risco."""
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
    if zona and zona != zona_ant:
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
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd backend && ..\venv\Scripts\python.exe -m pytest tests/test_fpm_service.py -v`
Expected: PASS (todos)

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/fpm_service.py backend/tests/test_fpm_service.py
git commit -m "feat(fpm): guarda de divergencia (trava legal) e evento de faixa para notificacoes"
```

---

### Task 4: Schemas + camada DB do serviço (alerta, série, notificações)

**Files:**
- Create: `backend/app/schemas/fpm.py`
- Modify: `backend/app/services/fpm_service.py` (acrescentar camada DB no fim)

**Interfaces:**
- Consumes: `PopulacaoMunicipio`, `FpmMensal`, `Municipio`, `Notificacao` (models); núcleo puro das Tasks 2–3.
- Produces (usados pelas Tasks 5, 6, 8):
  - Schemas: `AlertaFpm`, `FaixaFpmOut`, `FpmSerie`, `FpmMesItem`, `FpmAnoItem`, `PopulacaoAnoItem`
  - `calcular_alerta(db: Session, municipio_id: int) -> dict`
  - `montar_serie(db: Session, municipio_id: int) -> dict`
  - `gerar_notificacoes_fpm(db: Session, municipio_ids: list[int], usuario_id: int) -> int`

Camada fina de DB — **sem teste unitário** (a suíte não abre DB); verificada nas Tasks 5 e 12.

- [ ] **Step 1: Criar `backend/app/schemas/fpm.py`**

```python
from pydantic import BaseModel


class FaixaFpmOut(BaseModel):
    pop_min: int
    pop_max: int | None = None
    coeficiente: float
    atual: bool = False


class AlertaFpm(BaseModel):
    """Payload do Alerta de Faixa do FPM. Coeficiente sempre ESTIMADO pela
    população; `divergencia=True` sinaliza que o oficial (TCU) deve diferir."""
    disponivel: bool
    motivo: str | None = None          # sem_codigo_ibge | sem_populacao | fpm_capitais | selecione_municipio
    nao_aplicavel: bool = False        # capital (regime FPM-Capitais)
    populacao: int | None = None
    ano_populacao: int | None = None
    fonte_populacao: str | None = None
    coeficiente: float | None = None
    status: str | None = None          # oportunidade | risco | estavel | teto
    hab_para_subir: int | None = None
    hab_para_cair: int | None = None
    fpm_12m: float | None = None
    fpm_12m_parcial: bool = False
    valor_por_ponto: float | None = None
    ganho_proxima_faixa: float | None = None
    perda_faixa_anterior: float | None = None
    divergencia: bool | None = None
    faixas: list[FaixaFpmOut] = []


class FpmMesItem(BaseModel):
    ano: int
    mes: int
    valor: float


class FpmAnoItem(BaseModel):
    ano: int
    valor_total: float
    meses: int


class PopulacaoAnoItem(BaseModel):
    ano: int
    populacao: int
    fonte: str


class FpmSerie(BaseModel):
    mensal: list[FpmMesItem] = []
    anual: list[FpmAnoItem] = []
    populacao: list[PopulacaoAnoItem] = []
```

- [ ] **Step 2: Acrescentar a camada DB no fim de `fpm_service.py`**

```python
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
        evento = avaliar_evento_faixa(pops)
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
```

- [ ] **Step 3: Rodar a suíte inteira (regressão)**

Run: `cd backend && ..\venv\Scripts\python.exe -m pytest -v`
Expected: PASS (todos — nada de DB tocado em import)

- [ ] **Step 4: Commit**

```bash
git add backend/app/schemas/fpm.py backend/app/services/fpm_service.py
git commit -m "feat(fpm): schemas e camada DB (calcular_alerta, montar_serie, notificacoes)"
```

---

### Task 5: Router `/fpm` + registro no `main.py`

**Files:**
- Create: `backend/app/api/v1/routers/fpm.py`
- Modify: `backend/app/main.py` (import + `include_router`)

**Interfaces:**
- Consumes: `municipio_scope` (deps), `calcular_alerta`, `montar_serie`, schemas `AlertaFpm`/`FpmSerie`.
- Produces: `GET /api/v1/fpm/alerta` e `GET /api/v1/fpm/serie` — consumidos pelas Tasks 9 e 10. **Sem** gating de módulo (FPM é livre em todos os planos — usa `municipio_scope`).

- [ ] **Step 1: Criar `backend/app/api/v1/routers/fpm.py`**

```python
from app.api.deps import get_db, municipio_scope
from app.schemas.fpm import AlertaFpm, FpmSerie
from app.services.fpm_service import calcular_alerta, montar_serie
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

# FPM é livre em todos os planos (decisão de produto): usa municipio_scope,
# não scoped_modulo — o alerta é o principal argumento de venda.
router = APIRouter(prefix="/fpm", tags=["FPM"])


@router.get("/alerta", response_model=AlertaFpm)
def alerta_fpm(
    mid: int | None = Depends(municipio_scope),
    db: Session = Depends(get_db),
):
    if mid is None:
        # ADMIN_GLOBAL sem município selecionado — front pede seleção.
        return AlertaFpm(disponivel=False, motivo="selecione_municipio")
    return AlertaFpm(**calcular_alerta(db, mid))


@router.get("/serie", response_model=FpmSerie)
def serie_fpm(
    mid: int | None = Depends(municipio_scope),
    db: Session = Depends(get_db),
):
    if mid is None:
        return FpmSerie()
    return FpmSerie(**montar_serie(db, mid))
```

- [ ] **Step 2: Registrar no `backend/app/main.py`**

Junto aos imports de routers:

```python
import app.api.v1.routers.fpm as fpm
```

Junto aos `include_router` (após a linha do `vaf`):

```python
app.include_router(fpm.router, prefix=API_PREFIX)
```

- [ ] **Step 3: Verificar com o servidor real**

Run (terminal 1): `cd backend && ..\venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000`
Run (terminal 2, com um usuário de município existente):

```bash
TOKEN=$(curl -s -X POST http://localhost:8000/api/v1/auth/login -H "Content-Type: application/x-www-form-urlencoded" -d "username=<email>&password=<senha>" | python -c "import sys,json;print(json.load(sys.stdin)['access_token'])")
curl -s http://localhost:8000/api/v1/fpm/alerta -H "Authorization: Bearer $TOKEN"
```

Expected: `{"disponivel":false,"motivo":"sem_populacao",...}` (tabelas ainda vazias) — e `/fpm/serie` retorna listas vazias.

- [ ] **Step 4: Commit**

```bash
git add backend/app/api/v1/routers/fpm.py backend/app/main.py
git commit -m "feat(fpm): endpoints /fpm/alerta e /fpm/serie (livres de gating de plano)"
```

---

### Task 6: Fundação `ingestao_automatica` + fonte População IBGE

**Files:**
- Modify: `backend/requirements.txt` (adicionar `requests==2.32.3`)
- Create: `backend/app/services/ingestao_automatica/__init__.py`
- Create: `backend/app/services/ingestao_automatica/base.py`
- Create: `backend/app/services/ingestao_automatica/populacao_ibge.py`
- Test: `backend/tests/test_ingestao_automatica.py`

**Interfaces:**
- Consumes: `PopulacaoMunicipio`, `gerar_notificacoes_fpm` (Task 4).
- Produces (usados pelas Tasks 7 e 8):
  - `ResumoIngestao` (dataclass: `dataset: str, municipios_ok: int, municipios_erro: int, linhas: int, notificacoes: int, erros: list[str]`)
  - `FonteAutomatica` (dataclass: `key, label, fonte, executar`) e `FONTES_AUTOMATICAS: dict[str, FonteAutomatica]`
  - `populacao_ibge.parse_populacao_ibge(payload) -> dict[str, dict[int, int]]`
  - `populacao_ibge.executar(db, municipios, anos=None, usuario_id=None, notificar=True) -> ResumoIngestao` (registrada com key `"populacao"`)

- [ ] **Step 1: Instalar e pinar `requests`**

Run: `venv\Scripts\pip.exe install requests==2.32.3` (da raiz do repo)
Adicionar linha `requests==2.32.3` ao fim de `backend/requirements.txt`.

- [ ] **Step 2: Escrever testes que falham**

`backend/tests/test_ingestao_automatica.py`:

```python
"""Parsers puros das fontes automáticas (IBGE / STN) — sem rede, sem DB.
Fixtures copiadas de respostas reais das APIs (2026-07-06)."""
from app.services.ingestao_automatica.populacao_ibge import parse_populacao_ibge

# Resposta real de GET .../agregados/6579/periodos/2024/variaveis/9324?localidades=N6[3122306,3126109]
PAYLOAD_IBGE = [{
    "id": "9324",
    "variavel": "População residente estimada",
    "unidade": "Pessoas",
    "resultados": [{
        "classificacoes": [],
        "series": [
            {"localidade": {"id": "3122306", "nivel": {"id": "N6", "nome": "Município"},
                            "nome": "Divinópolis (MG)"}, "serie": {"2024": "242328"}},
            {"localidade": {"id": "3126109", "nivel": {"id": "N6", "nome": "Município"},
                            "nome": "Formiga (MG)"}, "serie": {"2024": "70668"}},
        ],
    }],
}]


def test_parse_ibge_extrai_populacao_por_codigo_e_ano():
    out = parse_populacao_ibge(PAYLOAD_IBGE)
    assert out == {"3122306": {2024: 242328}, "3126109": {2024: 70668}}


def test_parse_ibge_ignora_valores_nao_numericos_e_payload_vazio():
    payload = [{"resultados": [{"series": [
        {"localidade": {"id": "9999999"}, "serie": {"2024": "...", "2025": "-"}},
    ]}]}]
    assert parse_populacao_ibge(payload) == {}
    assert parse_populacao_ibge([]) == {}
    assert parse_populacao_ibge(None) == {}
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `cd backend && ..\venv\Scripts\python.exe -m pytest tests/test_ingestao_automatica.py -v`
Expected: FAIL — `ModuleNotFoundError`

- [ ] **Step 4: Implementar a fundação**

`backend/app/services/ingestao_automatica/__init__.py`:

```python
"""Fontes automáticas de dados (APIs públicas) — pipeline in-app, sem CSV manual.

Importar as fontes aqui garante o auto-registro em FONTES_AUTOMATICAS."""
from app.services.ingestao_automatica.base import (  # noqa: F401
    FONTES_AUTOMATICAS,
    FonteAutomatica,
    ResumoIngestao,
)
from app.services.ingestao_automatica import populacao_ibge  # noqa: F401
```

`backend/app/services/ingestao_automatica/base.py`:

```python
from dataclasses import dataclass, field
from typing import Callable


@dataclass
class ResumoIngestao:
    dataset: str
    municipios_ok: int = 0
    municipios_erro: int = 0
    linhas: int = 0
    notificacoes: int = 0
    erros: list[str] = field(default_factory=list)


@dataclass(frozen=True)
class FonteAutomatica:
    key: str          # dataset key (ex.: "populacao")
    label: str        # nome exibido no admin
    fonte: str        # texto default para DatasetInfo.fonte
    executar: Callable  # (db, municipios, anos=None, usuario_id=None, notificar=True) -> ResumoIngestao


FONTES_AUTOMATICAS: dict[str, FonteAutomatica] = {}


def registrar(fonte: FonteAutomatica) -> FonteAutomatica:
    FONTES_AUTOMATICAS[fonte.key] = fonte
    return fonte
```

`backend/app/services/ingestao_automatica/populacao_ibge.py`:

```python
"""Fonte automática: População residente estimada (IBGE, agregado 6579).

Uma requisição por ano cobre todos os municípios (códigos separados por
vírgula). Ao final do upsert dispara as notificações de faixa do FPM."""
import logging
from datetime import date

import requests

from app.services.ingestao_automatica.base import FonteAutomatica, ResumoIngestao, registrar

logger = logging.getLogger(__name__)

IBGE_URL = (
    "https://servicodados.ibge.gov.br/api/v3/agregados/6579/"
    "periodos/{ano}/variaveis/9324?localidades=N6[{codigos}]"
)
_CHUNK = 100  # códigos por requisição


def parse_populacao_ibge(payload) -> dict[str, dict[int, int]]:
    """Payload da API de agregados → {codigo_ibge: {ano: populacao}}.
    Valores não numéricos ('...', '-') são ignorados."""
    out: dict[str, dict[int, int]] = {}
    for variavel in payload or []:
        for resultado in variavel.get("resultados", []):
            for serie in resultado.get("series", []):
                codigo = str((serie.get("localidade") or {}).get("id") or "")
                for ano_str, valor in (serie.get("serie") or {}).items():
                    try:
                        out.setdefault(codigo, {})[int(ano_str)] = int(valor)
                    except (TypeError, ValueError):
                        continue
    return {k: v for k, v in out.items() if v}


def _buscar_ano(ano: int, codigos: list[str]) -> list:
    payload: list = []
    for i in range(0, len(codigos), _CHUNK):
        chunk = codigos[i:i + _CHUNK]
        resp = requests.get(IBGE_URL.format(ano=ano, codigos=",".join(chunk)), timeout=60)
        resp.raise_for_status()
        payload.extend(resp.json() or [])
    return payload


def executar(db, municipios, anos=None, usuario_id=None, notificar=True) -> ResumoIngestao:
    from app.models.populacao import PopulacaoMunicipio

    resumo = ResumoIngestao(dataset="populacao")
    com_codigo = []
    for m in municipios:
        if m.codigo_ibge:
            com_codigo.append(m)
        else:
            resumo.municipios_erro += 1
            resumo.erros.append(f"{m.nome}/{m.estado}: sem codigo_ibge cadastrado")
    if not com_codigo:
        return resumo

    if anos is None:
        atual = date.today().year
        anos = list(range(atual - 5, atual + 1))

    por_codigo: dict[str, dict[int, int]] = {}
    for ano in anos:
        try:
            payload = _buscar_ano(ano, [m.codigo_ibge for m in com_codigo])
        except requests.RequestException as exc:
            resumo.erros.append(f"IBGE {ano}: {exc}")
            continue
        for codigo, serie in parse_populacao_ibge(payload).items():
            por_codigo.setdefault(codigo, {}).update(serie)

    atualizados: list[int] = []
    for m in com_codigo:
        serie = por_codigo.get(m.codigo_ibge)
        if not serie:
            resumo.municipios_erro += 1
            resumo.erros.append(f"{m.nome}/{m.estado}: IBGE não retornou dados")
            continue
        existentes = {
            r.ano: r
            for r in db.query(PopulacaoMunicipio)
            .filter(PopulacaoMunicipio.municipio_id == m.id)
            .all()
        }
        for ano, pop in sorted(serie.items()):
            reg = existentes.get(ano)
            if reg:
                reg.populacao = pop
            else:
                db.add(PopulacaoMunicipio(
                    municipio_id=m.id, ano=ano, populacao=pop, fonte="Estimativa IBGE",
                ))
            resumo.linhas += 1
        resumo.municipios_ok += 1
        atualizados.append(m.id)
    db.commit()

    if notificar and usuario_id and atualizados:
        from app.services.fpm_service import gerar_notificacoes_fpm

        resumo.notificacoes = gerar_notificacoes_fpm(db, atualizados, usuario_id)
    return resumo


registrar(FonteAutomatica(
    key="populacao",
    label="População (IBGE)",
    fonte="IBGE — Estimativas de População (agregado 6579)",
    executar=executar,
))
```

- [ ] **Step 5: Rodar e ver passar**

Run: `cd backend && ..\venv\Scripts\python.exe -m pytest tests/test_ingestao_automatica.py -v`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add backend/requirements.txt backend/app/services/ingestao_automatica/ backend/tests/test_ingestao_automatica.py
git commit -m "feat(ingestao): fundacao de fontes automaticas + populacao IBGE (agregado 6579)"
```

---

### Task 7: Fonte FPM STN (CSV por município via CKAN)

**Files:**
- Create: `backend/app/services/ingestao_automatica/fpm_stn.py`
- Modify: `backend/app/services/ingestao_automatica/__init__.py` (importar `fpm_stn`)
- Test: `backend/tests/test_ingestao_automatica.py` (acrescentar testes)

**Interfaces:**
- Consumes: `FpmMensal`, `base.registrar`.
- Produces: `fpm_stn.parse_fpm_csv(texto, alvo, anos=None) -> dict[int, list[tuple[int, int, float]]]`, `fpm_stn._parse_valor`, `fpm_stn._norm_nome`, `fpm_stn.executar(...)` (registrada com key `"fpm"`).

- [ ] **Step 1: Acrescentar testes que falham** (em `tests/test_ingestao_automatica.py`)

```python
# ── STN: FPM por município (CSV) ─────────────────────────────────────────────
from app.services.ingestao_automatica.fpm_stn import (
    _norm_nome,
    _parse_valor,
    parse_fpm_csv,
)

# Recorte real do fpm-por-municipio.csv da STN (latin-1, ';', meses futuros '-')
CSV_STN = (
    "COD_MUN;Município;UF;Município - UF;Mês;2025;2026\n"
    "4445;Divinópolis;MG;Divinópolis - MG;1; 11.281.019,33 ; 12.281.019,33 \n"
    "4445;Divinópolis;MG;Divinópolis - MG;7; 10.000.000,00 ; -   \n"
    "0643;Acrelândia;AC;Acrelândia - AC;1; 50.880,73 ; 60.000,00 \n"
)


def test_parse_valor_pt_br():
    assert _parse_valor(" 12.281.019,33 ") == 12281019.33
    assert _parse_valor(" -   ") is None
    assert _parse_valor("") is None
    assert _parse_valor(None) is None


def test_norm_nome_remove_acentos_e_caixa():
    assert _norm_nome("Divinópolis") == "divinopolis"
    assert _norm_nome("  SÃO PAULO ") == "sao paulo"


def test_parse_fpm_csv_filtra_por_nome_uf_e_pula_meses_futuros():
    alvo = {("divinopolis", "MG"): 42}
    out = parse_fpm_csv(CSV_STN, alvo)
    assert set(out.keys()) == {42}
    assert (2025, 1, 11281019.33) in out[42]
    assert (2026, 1, 12281019.33) in out[42]
    assert (2025, 7, 10000000.0) in out[42]
    # mês 7/2026 é ' -   ' → não entra
    assert not any(a == 2026 and m == 7 for a, m, _ in out[42])


def test_parse_fpm_csv_filtro_de_anos():
    alvo = {("divinopolis", "MG"): 42}
    out = parse_fpm_csv(CSV_STN, alvo, anos={2026})
    assert all(a == 2026 for a, _, _ in out[42])


def test_parse_fpm_csv_ignora_preambulo_antes_do_header():
    com_preambulo = "MINISTÉRIO DA FAZENDA;;\n;;\n" + CSV_STN
    out = parse_fpm_csv(com_preambulo, {("acrelandia", "AC"): 7})
    assert out == {7: [(2025, 1, 50880.73), (2026, 1, 60000.0)]}
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd backend && ..\venv\Scripts\python.exe -m pytest tests/test_ingestao_automatica.py -v`
Expected: FAIL — `ModuleNotFoundError: ... fpm_stn`

- [ ] **Step 3: Implementar `backend/app/services/ingestao_automatica/fpm_stn.py`**

```python
"""Fonte automática: repasses mensais do FPM por município (STN).

Fonte: Tesouro Transparente, dataset "Transferências Obrigatórias da União -
por Município" — CSV único (~30 MB, latin-1, ';') com todos os municípios,
colunas por ano (1996→corrente) e uma linha por (município, mês). O CSV não
traz código IBGE (COD_MUN é código TCU), então o match é (nome normalizado,
UF). URL resolvida via API CKAN com fallback para a URL fixa do recurso.
Valores são o repasse BRUTO (antes de retenções como FUNDEB)."""
import csv
import io
import logging
import unicodedata

import requests

from app.services.ingestao_automatica.base import FonteAutomatica, ResumoIngestao, registrar

logger = logging.getLogger(__name__)

CKAN_PACKAGE_SHOW = (
    "https://www.tesourotransparente.gov.br/ckan/api/3/action/package_show"
    "?id=3b5a779d-78f5-4602-a6b7-23ece6d60f27"
)
FPM_CSV_URL_FALLBACK = (
    "https://www.tesourotransparente.gov.br/ckan/dataset/"
    "3b5a779d-78f5-4602-a6b7-23ece6d60f27/resource/"
    "d69ff32a-6681-4114-81f0-233bb6b17f58/download/fpm-por-municipio.csv"
)


def _parse_valor(s) -> float | None:
    s = (s or "").strip()
    if not s or set(s) <= {"-"}:
        return None
    try:
        return float(s.replace(".", "").replace(",", "."))
    except ValueError:
        return None


def _norm_nome(s) -> str:
    s = unicodedata.normalize("NFD", s or "")
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return s.lower().strip()


def parse_fpm_csv(
    texto: str,
    alvo: dict[tuple[str, str], int],
    anos: set[int] | None = None,
) -> dict[int, list[tuple[int, int, float]]]:
    """CSV da STN → {municipio_id: [(ano, mes, valor), ...]} apenas para os
    municípios em `alvo` ({(nome_norm, UF): municipio_id})."""
    reader = csv.reader(io.StringIO(texto), delimiter=";")
    header = None
    for row in reader:
        if row and row[0].strip().upper() == "COD_MUN":
            header = row
            break
    if header is None:
        raise ValueError("CSV da STN sem header COD_MUN — layout mudou?")

    colunas_ano = {
        i: int(c.strip()) for i, c in enumerate(header) if c.strip().isdigit()
    }
    out: dict[int, list[tuple[int, int, float]]] = {}
    for row in reader:
        if len(row) < 6:
            continue
        mid = alvo.get((_norm_nome(row[1]), (row[2] or "").strip().upper()))
        if mid is None:
            continue
        try:
            mes = int(row[4])
        except (ValueError, IndexError):
            continue
        for idx, ano in colunas_ano.items():
            if anos and ano not in anos:
                continue
            valor = _parse_valor(row[idx]) if idx < len(row) else None
            if valor is None:
                continue
            out.setdefault(mid, []).append((ano, mes, valor))
    return out


def _url_csv() -> str:
    try:
        resp = requests.get(CKAN_PACKAGE_SHOW, timeout=30)
        resp.raise_for_status()
        for recurso in resp.json()["result"]["resources"]:
            if "FPM" in (recurso.get("name") or "") and "CAPITAIS" not in (recurso.get("name") or "").upper():
                return recurso["url"]
    except (requests.RequestException, KeyError, ValueError) as exc:
        logger.warning("CKAN indisponível (%s); usando URL fixa do CSV.", exc)
    return FPM_CSV_URL_FALLBACK


def executar(db, municipios, anos=None, usuario_id=None, notificar=True) -> ResumoIngestao:
    from app.models.fpm import FpmMensal

    resumo = ResumoIngestao(dataset="fpm")
    alvo = {(_norm_nome(m.nome), m.estado.upper()): m.id for m in municipios}
    if not alvo:
        return resumo

    resp = requests.get(_url_csv(), timeout=300)
    resp.raise_for_status()
    texto = resp.content.decode("latin-1")

    por_municipio = parse_fpm_csv(texto, alvo, set(anos) if anos else None)

    for m in municipios:
        linhas = por_municipio.get(m.id)
        if not linhas:
            resumo.municipios_erro += 1
            resumo.erros.append(f"{m.nome}/{m.estado}: não encontrado no CSV da STN")
            continue
        existentes = {
            (r.ano, r.mes): r
            for r in db.query(FpmMensal).filter(FpmMensal.municipio_id == m.id).all()
        }
        for ano, mes, valor in linhas:
            reg = existentes.get((ano, mes))
            if reg:
                reg.valor = valor
            else:
                db.add(FpmMensal(municipio_id=m.id, ano=ano, mes=mes, valor=valor))
            resumo.linhas += 1
        resumo.municipios_ok += 1
    db.commit()
    return resumo


registrar(FonteAutomatica(
    key="fpm",
    label="FPM — repasses (STN)",
    fonte="STN / Tesouro Transparente — Transferências Obrigatórias da União por Município (valores brutos)",
    executar=executar,
))
```

- [ ] **Step 4: Importar no `__init__.py` do pacote** (linha final)

```python
from app.services.ingestao_automatica import fpm_stn  # noqa: F401
```

- [ ] **Step 5: Rodar e ver passar (suíte inteira)**

Run: `cd backend && ..\venv\Scripts\python.exe -m pytest -v`
Expected: PASS (todos)

- [ ] **Step 6: Commit**

```bash
git add backend/app/services/ingestao_automatica/ backend/tests/test_ingestao_automatica.py
git commit -m "feat(ingestao): fonte automatica FPM por municipio (CSV STN via CKAN)"
```

---

### Task 8: Router `/ingestao-automatica` + auditoria + DatasetInfo

**Files:**
- Create: `backend/app/api/v1/routers/ingestao_automatica.py`
- Modify: `backend/app/main.py` (import + `include_router`)
- Modify: `backend/app/models/ingestao_audit.py` (comentário da coluna `acao`)

**Interfaces:**
- Consumes: `FONTES_AUTOMATICAS`, `record_ingestao_audit` (`app.services.municipio_management`), `DatasetInfo`, `require_role`.
- Produces: `GET /api/v1/ingestao-automatica/fontes` e `POST /api/v1/ingestao-automatica/{dataset_key}/executar` — consumidos pela Task 11.

- [ ] **Step 1: Criar `backend/app/api/v1/routers/ingestao_automatica.py`**

```python
from dataclasses import asdict
from datetime import datetime

import requests
from app.api.deps import get_db, require_role
from app.models.dataset_info import DatasetInfo
from app.models.ingestao_audit import IngestaoAudit
from app.models.municipio import Municipio
from app.services.ingestao_automatica import FONTES_AUTOMATICAS
from app.services.municipio_management import record_ingestao_audit
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

router = APIRouter(prefix="/ingestao-automatica", tags=["Ingestão Automática"])


class ExecutarIn(BaseModel):
    estado: str | None = None
    municipio_id: int | None = None
    anos: list[int] | None = None
    notificar: bool = True


@router.get("/fontes")
def listar_fontes(
    db: Session = Depends(get_db),
    current_user=Depends(require_role("ADMIN_GLOBAL")),
):
    out = []
    for key, fonte in FONTES_AUTOMATICAS.items():
        ultimo = (
            db.query(IngestaoAudit)
            .filter(IngestaoAudit.acao == "auto_ingest", IngestaoAudit.dataset == key)
            .order_by(IngestaoAudit.criado_em.desc())
            .first()
        )
        out.append({
            "key": key,
            "label": fonte.label,
            "fonte": fonte.fonte,
            "ultima_execucao": None if ultimo is None else {
                "criado_em": ultimo.criado_em,
                "status": ultimo.status,
                "num_linhas": ultimo.num_linhas,
                "detalhe": ultimo.detalhe,
            },
        })
    return out


def _atualizar_dataset_info(db: Session, key: str, fonte_label: str, fonte_texto: str) -> None:
    info = db.query(DatasetInfo).filter(DatasetInfo.dataset == key).first()
    if info is None:
        info = DatasetInfo(dataset=key, titulo=fonte_label, conteudo="")
        db.add(info)
    if not info.fonte:
        info.fonte = fonte_texto
    info.data_atualizacao = datetime.now().strftime("%d/%m/%Y")
    db.commit()


@router.post("/{dataset_key}/executar")
def executar_fonte(
    dataset_key: str,
    body: ExecutarIn,
    db: Session = Depends(get_db),
    current_user=Depends(require_role("ADMIN_GLOBAL")),
):
    fonte = FONTES_AUTOMATICAS.get(dataset_key)
    if fonte is None:
        raise HTTPException(status_code=404, detail=f"Fonte automática '{dataset_key}' não existe.")

    query = db.query(Municipio).filter(Municipio.ativo.is_(True))
    if body.municipio_id is not None:
        query = query.filter(Municipio.id == body.municipio_id)
    if body.estado:
        query = query.filter(Municipio.estado == body.estado.upper())
    municipios = query.all()
    if not municipios:
        raise HTTPException(status_code=404, detail="Nenhum município ativo para o filtro informado.")

    try:
        resumo = fonte.executar(
            db=db, municipios=municipios, anos=body.anos,
            usuario_id=current_user.id, notificar=body.notificar,
        )
    except requests.RequestException as exc:
        record_ingestao_audit(
            db, municipio_id=None, usuario_id=current_user.id, dataset=dataset_key,
            acao="auto_ingest", num_linhas=0, status="erro", detalhe=str(exc)[:1000],
        )
        raise HTTPException(status_code=502, detail=f"Falha ao acessar a fonte externa: {exc}")

    record_ingestao_audit(
        db,
        municipio_id=municipios[0].id if len(municipios) == 1 else None,
        usuario_id=current_user.id,
        dataset=dataset_key,
        acao="auto_ingest",
        num_linhas=resumo.linhas,
        status="ok" if not resumo.erros else "aviso",
        detalhe="; ".join(resumo.erros[:20]) or None,
    )
    _atualizar_dataset_info(db, dataset_key, fonte.label, fonte.fonte)
    return asdict(resumo)
```

- [ ] **Step 2: Atualizar o comentário de `acao` em `backend/app/models/ingestao_audit.py`**

Trocar a linha de comentário:

```python
    # 'reingest' | 'delete_dataset' | 'delete_ingestao' | 'auto_ingest'
```

- [ ] **Step 3: Registrar no `backend/app/main.py`**

```python
import app.api.v1.routers.ingestao_automatica as ingestao_automatica
```

E após a linha do `fpm`:

```python
app.include_router(ingestao_automatica.router, prefix=API_PREFIX)
```

- [ ] **Step 4: Verificar com o servidor real (ingestão de verdade, escopo mínimo)**

Com o backend rodando e `TOKEN` de um **ADMIN_GLOBAL**:

```bash
curl -s http://localhost:8000/api/v1/ingestao-automatica/fontes -H "Authorization: Bearer $TOKEN"
# Expected: [{"key":"populacao",...,"ultima_execucao":null},{"key":"fpm",...}]

curl -s -X POST http://localhost:8000/api/v1/ingestao-automatica/populacao/executar \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"municipio_id": <id de um município com codigo_ibge>}'
# Expected: {"dataset":"populacao","municipios_ok":1,...,"linhas":>0}
```

E `GET /fontes` novamente deve trazer `ultima_execucao` preenchida.

- [ ] **Step 5: Commit**

```bash
git add backend/app/api/v1/routers/ingestao_automatica.py backend/app/main.py backend/app/models/ingestao_audit.py
git commit -m "feat(ingestao): endpoints admin de fontes automaticas com auditoria e DatasetInfo"
```

---

### Task 9: Card `AlertaFpmCard` no Painel do Prefeito

**Files:**
- Create: `frontend-observatorio/src/components/AlertaFpmCard.jsx`
- Modify: `frontend-observatorio/src/pages/painel-prefeito/PainelPrefeitoPage.jsx` (import + render)

**Interfaces:**
- Consumes: `GET /fpm/alerta` (Task 5); `api` service (injeta token e `municipio_id` do view-as em GETs automaticamente).
- Produces: componente auto-contido `<AlertaFpmCard />` — não recebe props; não renderiza nada quando o alerta não está disponível.

- [ ] **Step 1: Criar `frontend-observatorio/src/components/AlertaFpmCard.jsx`**

```jsx
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowTrendingUpIcon, ArrowTrendingDownIcon, ScaleIcon } from "@heroicons/react/24/outline";
import api from "../services/api";

const fmtHab = (n) => Number(n).toLocaleString("pt-BR");
const fmtMi = (v) => {
  if (v == null) return null;
  if (Math.abs(v) >= 1e6) return `R$ ${(v / 1e6).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mi`;
  return `R$ ${(v / 1e3).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} mil`;
};

const TONS = {
  oportunidade: { border: "rgba(16,185,129,.45)", bg: "rgba(16,185,129,.08)", Icon: ArrowTrendingUpIcon, iconCls: "text-emerald-500" },
  risco: { border: "rgba(245,158,11,.45)", bg: "rgba(245,158,11,.08)", Icon: ArrowTrendingDownIcon, iconCls: "text-amber-500" },
  estavel: { border: "var(--border)", bg: "var(--panel)", Icon: ScaleIcon, iconCls: "text-[var(--text-mute)]" },
  teto: { border: "var(--border)", bg: "var(--panel)", Icon: ScaleIcon, iconCls: "text-[var(--text-mute)]" },
};

/** Frase-título do alerta conforme o status. */
function fraseAlerta(a) {
  if (a.status === "oportunidade") {
    return (
      <>Faltam <b>{fmtHab(a.hab_para_subir)} habitantes</b> para o próximo coeficiente do FPM
        {a.ganho_proxima_faixa != null && <> — vale <b>~{fmtMi(a.ganho_proxima_faixa)}/ano</b> a mais</>}.</>
    );
  }
  if (a.status === "risco") {
    return (
      <>Sua cidade está a <b>{fmtHab(a.hab_para_cair)} habitantes</b> de cair de faixa do FPM
        {a.perda_faixa_anterior != null && <> — <b>~{fmtMi(a.perda_faixa_anterior)}/ano</b> em risco</>}.</>
    );
  }
  if (a.status === "teto") {
    return <>Coeficiente máximo do FPM (<b>4,0</b>) — {a.hab_para_cair != null ? <>margem de {fmtHab(a.hab_para_cair)} habitantes acima do piso da faixa</> : "situação estável"}.</>;
  }
  return (
    <>Faixa estável no FPM (coeficiente <b>{Number(a.coeficiente).toLocaleString("pt-BR", { minimumFractionDigits: 1 })}</b>)
      {a.hab_para_subir != null && <> — próximo coeficiente a {fmtHab(a.hab_para_subir)} habitantes</>}.</>
  );
}

export default function AlertaFpmCard() {
  const [alerta, setAlerta] = useState(null);

  useEffect(() => {
    api.get("/fpm/alerta").then((r) => setAlerta(r.data)).catch(() => setAlerta(null));
  }, []);

  if (!alerta?.disponivel) return null;
  const tom = TONS[alerta.status] || TONS.estavel;
  const { Icon } = tom;

  return (
    <Link to="/app/fpm" className="block" aria-label="Ver detalhes do FPM">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl p-4 md:p-5 border transition-shadow hover:shadow-md"
        style={{ borderColor: tom.border, background: tom.bg }}
      >
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-xl bg-[var(--panel)] border border-[var(--border)] flex-shrink-0">
            <Icon className={`w-5 h-5 ${tom.iconCls}`} />
          </div>
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-wider font-semibold text-[var(--text-mute)]">
              Alerta de faixa do FPM
            </p>
            <p className="text-sm md:text-base mt-1 text-[var(--text)] leading-snug">
              {fraseAlerta(alerta)}
            </p>
            <p className="text-xs mt-1.5 text-[var(--text-dim)]">
              Estimativa IBGE {alerta.ano_populacao} · {fmtHab(alerta.populacao)} hab. · coeficiente estimado{" "}
              {Number(alerta.coeficiente).toLocaleString("pt-BR", { minimumFractionDigits: 1 })}
              {alerta.divergencia && " · valores estimados — o coeficiente oficial (TCU) pode diferir (trava legal)"}
              {alerta.fpm_12m_parcial && " · FPM anualizado (menos de 12 meses de dados)"}
            </p>
          </div>
        </div>
      </motion.div>
    </Link>
  );
}
```

- [ ] **Step 2: Inserir no `PainelPrefeitoPage.jsx`**

Adicionar o import junto aos demais componentes:

```jsx
import AlertaFpmCard from "../../components/AlertaFpmCard";
```

No JSX principal (return de ~linha 357), logo após o bloco do `PrioridadesPanel`:

```jsx
      {/* Alerta de faixa do FPM */}
      <div className="mb-7">
        <AlertaFpmCard />
      </div>
```

- [ ] **Step 3: Verificar visualmente**

Run: `cd frontend-observatorio && npm run dev` (backend rodando)
Expected: no Painel do Prefeito de um município **com** população ingerida, o card aparece com a frase e o tom certo; sem população, o card simplesmente não aparece (sem erro no console).

- [ ] **Step 4: Commit**

```bash
git add frontend-observatorio/src/components/AlertaFpmCard.jsx frontend-observatorio/src/pages/painel-prefeito/PainelPrefeitoPage.jsx
git commit -m "feat(fpm): card de alerta de faixa no Painel do Prefeito"
```

---

### Task 10: Página `/app/fpm` + rota + item de navegação

**Files:**
- Create: `frontend-observatorio/src/pages/fpm/FpmPage.jsx`
- Modify: `frontend-observatorio/src/app/router/AppRouter.jsx` (import + rota)
- Modify: `frontend-observatorio/src/app/layouts/DashboardLayout.jsx` (item no grupo Economia)

**Interfaces:**
- Consumes: `GET /fpm/alerta`, `GET /fpm/serie`; componentes existentes `NidPageHeader`, `NidPanel`, `KpiCard`, `InfoTooltip`, `AreaLineChart` (data = `[{label, value}]`), `fmtMoneyShort`, `fmtMoneyFull`, `fmtNumberShort`, `fmtNumber`; `fraseAlerta` NÃO é reutilizada (a página tem hero próprio).
- Produces: rota `/app/fpm` acessível pelo grupo Economia (item **sem** `modulo` → nunca bloqueado por plano).

- [ ] **Step 1: Criar `frontend-observatorio/src/pages/fpm/FpmPage.jsx`**

```jsx
import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import api from "../../services/api";
import { useAuth } from "../../context/AuthContext";
import { useViewAs } from "../../context/ViewAsContext";
import InfoTooltip from "../../components/InfoTooltip";
import KpiCard from "../../components/KpiCard";
import { NidPanel, NidPageHeader } from "../../components/nid/Panel";
import {
  AreaLineChart,
  fmtMoneyShort,
  fmtMoneyFull,
  fmtNumberShort,
  fmtNumber,
} from "../../components/nid/charts";

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const fmtHab = (n) => (n == null ? "—" : Number(n).toLocaleString("pt-BR"));
const fmtCoef = (c) => (c == null ? "—" : Number(c).toLocaleString("pt-BR", { minimumFractionDigits: 1 }));
const fmtMi = (v) => {
  if (v == null) return "—";
  if (Math.abs(v) >= 1e6) return `R$ ${(v / 1e6).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mi`;
  return `R$ ${(v / 1e3).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} mil`;
};

// ── Hero do alerta ───────────────────────────────────────────────────────────
function HeroAlerta({ a }) {
  const tons = {
    oportunidade: { cor: "rgba(16,185,129,.45)", bg: "rgba(16,185,129,.08)", titulo: "Oportunidade de subir de faixa" },
    risco: { cor: "rgba(245,158,11,.45)", bg: "rgba(245,158,11,.08)", titulo: "Risco de cair de faixa" },
    estavel: { cor: "var(--border)", bg: "var(--panel)", titulo: "Faixa estável" },
    teto: { cor: "var(--border)", bg: "var(--panel)", titulo: "Coeficiente máximo (4,0)" },
  };
  const t = tons[a.status] || tons.estavel;
  return (
    <div className="rounded-2xl p-6 border" style={{ borderColor: t.cor, background: t.bg }}>
      <p className="text-xs uppercase tracking-wider font-semibold text-[var(--text-mute)]">{t.titulo}</p>
      <p className="text-lg md:text-2xl font-bold mt-2 text-[var(--text)] leading-snug">
        {a.status === "oportunidade" && (
          <>Faltam {fmtHab(a.hab_para_subir)} habitantes para o próximo coeficiente
            {a.ganho_proxima_faixa != null && <> — vale ~{fmtMi(a.ganho_proxima_faixa)}/ano a mais</>}.</>
        )}
        {a.status === "risco" && (
          <>Sua cidade está a {fmtHab(a.hab_para_cair)} habitantes de cair de faixa
            {a.perda_faixa_anterior != null && <> — ~{fmtMi(a.perda_faixa_anterior)}/ano em risco</>}.</>
        )}
        {a.status === "teto" && <>O município já está na faixa máxima do FPM-Interior.</>}
        {a.status === "estavel" && (
          <>Próximo coeficiente a {fmtHab(a.hab_para_subir)} habitantes
            {a.ganho_proxima_faixa != null && <> (~{fmtMi(a.ganho_proxima_faixa)}/ano a mais)</>}.</>
        )}
      </p>
      <p className="text-sm mt-2 text-[var(--text-dim)]">
        Estimativa IBGE {a.ano_populacao}: {fmtHab(a.populacao)} habitantes · coeficiente estimado {fmtCoef(a.coeficiente)}.
        {a.divergencia && <> <b>Atenção:</b> valores estimados — o coeficiente oficial (TCU) pode diferir por trava legal.</>}
        {a.fpm_12m_parcial && <> FPM anualizado a partir de menos de 12 meses de dados.</>}
        {" "}Valores de repasse brutos (antes de retenções como FUNDEB).
      </p>
    </div>
  );
}

// ── Régua de faixas ──────────────────────────────────────────────────────────
function ReguaFaixas({ faixas, populacao }) {
  const idx = faixas.findIndex((f) => f.atual);
  if (idx < 0) return null;
  const vizinhas = faixas.slice(Math.max(0, idx - 1), Math.min(faixas.length, idx + 2));
  return (
    <div className="flex items-stretch gap-1.5">
      {vizinhas.map((f) => {
        const atual = f.atual;
        const pct = atual && f.pop_max != null
          ? Math.min(100, Math.max(0, ((populacao - f.pop_min) / (f.pop_max - f.pop_min)) * 100))
          : null;
        return (
          <div
            key={f.coeficiente}
            className={`rounded-xl border p-3 ${atual ? "flex-[2]" : "flex-1 opacity-70"}`}
            style={{ borderColor: atual ? "var(--accent-1)" : "var(--border)", background: "var(--panel)" }}
          >
            <div className="flex items-baseline justify-between">
              <span className="text-sm font-bold text-[var(--text)]">coef. {fmtCoef(f.coeficiente)}</span>
              {atual && <span className="text-xs font-semibold text-[var(--accent-1)]">sua faixa</span>}
            </div>
            <p className="text-xs text-[var(--text-dim)] mt-0.5">
              {fmtHab(f.pop_min)} – {f.pop_max != null ? fmtHab(f.pop_max) : "∞"} hab.
            </p>
            {atual && pct != null && (
              <div className="mt-2 h-2 rounded-full bg-[var(--panel-2)] relative overflow-hidden" aria-hidden>
                <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${pct}%`, background: "var(--accent-1)" }} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Página ───────────────────────────────────────────────────────────────────
export default function FpmPage() {
  const { user } = useAuth();
  const { viewAsId } = useViewAs();
  const needsMunicipio = user?.role === "ADMIN_GLOBAL" && viewAsId == null;

  const [alerta, setAlerta] = useState(null);
  const [serie, setSerie] = useState({ mensal: [], anual: [], populacao: [] });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (needsMunicipio) { setLoading(false); return; }
    Promise.all([api.get("/fpm/alerta"), api.get("/fpm/serie")])
      .then(([a, s]) => {
        setAlerta(a.data);
        setSerie(s.data || { mensal: [], anual: [], populacao: [] });
      })
      .catch((err) => console.error("Erro ao carregar FPM:", err))
      .finally(() => setLoading(false));
  }, [needsMunicipio]);

  // últimos 36 meses para o gráfico mensal
  const mensalChart = useMemo(
    () => serie.mensal.slice(-36).map((d) => ({
      label: `${MESES[d.mes - 1]}/${String(d.ano).slice(2)}`,
      value: d.valor,
    })),
    [serie.mensal]
  );

  const populacaoChart = useMemo(
    () => serie.populacao.map((d) => ({ label: String(d.ano), value: d.populacao })),
    [serie.populacao]
  );

  const proximaFaixa = useMemo(() => {
    const faixas = alerta?.faixas || [];
    const idx = faixas.findIndex((f) => f.atual);
    return idx >= 0 && idx + 1 < faixas.length ? faixas[idx + 1] : null;
  }, [alerta]);

  const anualDesc = useMemo(() => [...serie.anual].reverse(), [serie.anual]);

  if (needsMunicipio) {
    return (
      <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
        <NidPageHeader title="FPM" sub="Fundo de Participação dos Municípios" />
        <div className="mt-6 rounded-2xl p-10 text-center" style={{ background: "var(--panel)", border: "1px dashed var(--border-strong)" }}>
          <p className="text-base font-semibold text-[var(--text)]">Selecione um município</p>
          <p className="text-sm mt-1 text-[var(--text-dim)]">Use <b>"Ver como"</b> na administração de Municípios.</p>
        </div>
      </motion.div>
    );
  }

  if (loading) {
    return (
      <div className="space-y-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="nid-kpi" style={{ minHeight: 110, opacity: 0.4 }} />
        ))}
      </div>
    );
  }

  const indisponivel = !alerta?.disponivel;

  return (
    <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="space-y-6">
      <div className="flex items-center gap-2">
        <NidPageHeader title="FPM" sub="Fundo de Participação dos Municípios — faixa populacional e repasses" />
        <InfoTooltip dataset="fpm" />
      </div>

      {indisponivel ? (
        <div className="rounded-2xl p-10 text-center" style={{ background: "var(--panel)", border: "1px dashed var(--border-strong)" }}>
          <p className="text-base font-semibold text-[var(--text)]">
            {alerta?.nao_aplicavel ? "Não se aplica" : "Sem dados de população"}
          </p>
          <p className="text-sm mt-1 text-[var(--text-dim)]">
            {alerta?.motivo === "fpm_capitais" && "Capitais seguem o regime FPM-Capitais, fora das faixas do FPM-Interior."}
            {alerta?.motivo === "sem_codigo_ibge" && "Cadastre o código IBGE do município na administração."}
            {alerta?.motivo === "sem_populacao" && "Execute a fonte automática \"População (IBGE)\" em Administração → Fontes de Dados."}
          </p>
        </div>
      ) : (
        <>
          <HeroAlerta a={alerta} />
          <ReguaFaixas faixas={alerta.faixas} populacao={alerta.populacao} />

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <KpiCard label="FPM últimos 12 meses" value={alerta.fpm_12m != null ? fmtMoneyShort(alerta.fpm_12m) : "—"} sub={alerta.fpm_12m_parcial ? "anualizado (dados parciais)" : "repasse bruto"} dataset="fpm" indicadorKey="fpm_12m" />
            <KpiCard label="Coeficiente estimado" value={fmtCoef(alerta.coeficiente)} sub={alerta.divergencia ? "oficial pode diferir (trava)" : "pela população"} dataset="fpm" indicadorKey="coeficiente" />
            <KpiCard label="Valor por ponto de coeficiente" value={alerta.valor_por_ponto != null ? fmtMoneyShort(alerta.valor_por_ponto) : "—"} sub="R$/ano por 1,0 de coeficiente" dataset="fpm" indicadorKey="valor_por_ponto" />
            <KpiCard label="População" period={alerta.ano_populacao ? String(alerta.ano_populacao) : undefined} value={fmtHab(alerta.populacao)} sub={alerta.fonte_populacao || ""} dataset="fpm" indicadorKey="populacao" />
          </div>

          <NidPanel title="Repasses mensais do FPM" sub="Últimos 36 meses · valores brutos">
            <AreaLineChart
              data={mensalChart}
              height={280}
              label="FPM"
              color="var(--accent-1)"
              yFmt={fmtMoneyShort}
              tipFmt={fmtMoneyFull}
              emptyMessage='Sem repasses carregados — execute a fonte "FPM — repasses (STN)" em Administração → Fontes de Dados.'
            />
          </NidPanel>

          <NidPanel title="População estimada por ano" sub="Estimativas do IBGE · limite da próxima faixa marcado">
            <AreaLineChart
              data={populacaoChart}
              height={260}
              label="População"
              color="var(--accent-3)"
              yFmt={fmtNumberShort}
              tipFmt={fmtNumber}
              benchmark={proximaFaixa ? { value: proximaFaixa.pop_min, label: `próxima faixa (coef. ${fmtCoef(proximaFaixa.coeficiente)})` } : undefined}
              emptyMessage="Sem série de população carregada."
            />
          </NidPanel>

          <NidPanel title="Total anual" sub="Soma dos repasses por ano">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)] text-left">
                    <th className="px-3 py-2 font-semibold text-[var(--text-dim)]">Ano</th>
                    <th className="px-3 py-2 font-semibold text-[var(--text-dim)] text-right">Total (R$)</th>
                    <th className="px-3 py-2 font-semibold text-[var(--text-dim)] text-right">Meses com dado</th>
                  </tr>
                </thead>
                <tbody>
                  {anualDesc.map((a) => (
                    <tr key={a.ano} className="border-b border-[var(--border)] last:border-0">
                      <td className="px-3 py-2 font-medium text-[var(--text)]">{a.ano}</td>
                      <td className="px-3 py-2 text-right text-[var(--text)]">{fmtMoneyFull(a.valor_total)}</td>
                      <td className="px-3 py-2 text-right text-[var(--text-dim)]">{a.meses}</td>
                    </tr>
                  ))}
                  {anualDesc.length === 0 && (
                    <tr><td colSpan={3} className="px-3 py-6 text-center text-[var(--text-dim)]">Sem dados de repasse.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </NidPanel>
        </>
      )}
    </motion.div>
  );
}
```

- [ ] **Step 2: Rota em `AppRouter.jsx`**

Import junto aos demais:

```jsx
import FpmPage from "../../pages/fpm/FpmPage";
```

Rota (após a linha do `vaf`):

```jsx
          <Route path="fpm" element={<FpmPage />} />
```

- [ ] **Step 3: Item de nav em `DashboardLayout.jsx`**

No grupo `Economia`, após a linha do VAF (linha ~56) — **sem** chave `modulo` (FPM é livre em todos os planos; `isLocked` retorna false quando `modulo == null`):

```jsx
      { to: "/app/fpm", label: "FPM", icon: BanknotesIcon },
```

(`BanknotesIcon` já está importado no arquivo.)

- [ ] **Step 4: Verificar visualmente**

Run: frontend + backend rodando → abrir `/app/fpm`.
Expected: com dados ingeridos, hero + régua + 4 KPIs + 2 gráficos + tabela; sem dados de população, empty state com instrução; item "FPM" visível no grupo Economia sem cadeado em conta free.

- [ ] **Step 5: Commit**

```bash
git add frontend-observatorio/src/pages/fpm/FpmPage.jsx frontend-observatorio/src/app/router/AppRouter.jsx frontend-observatorio/src/app/layouts/DashboardLayout.jsx
git commit -m "feat(fpm): pagina /app/fpm com hero, regua de faixas, KPIs e series"
```

---

### Task 11: Seção "Fontes automáticas" em `/admin/fontes`

**Files:**
- Modify: `frontend-observatorio/src/pages/admin/DatasetFontesAdminPage.jsx`

**Interfaces:**
- Consumes: `GET /ingestao-automatica/fontes`, `POST /ingestao-automatica/{key}/executar` (Task 8); `useToast`.
- Produces: UI de disparo de ingestão para ADMIN_GLOBAL.

- [ ] **Step 1: Acrescentar estado e chamadas na página**

No topo do componente `DatasetFontesAdminPage`, junto aos outros `useState`:

```jsx
  const [autoFontes, setAutoFontes] = useState([]);
  const [notificar, setNotificar] = useState(true);
  const [runningKey, setRunningKey] = useState(null);
```

Função de carga (abaixo dos handlers existentes) + chamada no `useEffect` existente (adicionar `loadAutoFontes();` dentro dele):

```jsx
  const loadAutoFontes = () => {
    api.get("/ingestao-automatica/fontes")
      .then((r) => setAutoFontes(r.data || []))
      .catch(() => {});
  };
```

Handler de execução:

```jsx
  const handleExecutar = async (fonte) => {
    setRunningKey(fonte.key);
    try {
      const { data } = await api.post(`/ingestao-automatica/${fonte.key}/executar`, { notificar });
      addToast(
        `${fonte.label}: ${data.municipios_ok} município(s) atualizado(s), ${data.linhas} linha(s)` +
          (data.notificacoes ? `, ${data.notificacoes} notificação(ões)` : "") +
          (data.municipios_erro ? ` — ${data.municipios_erro} com erro` : ""),
        data.municipios_erro ? "warning" : "success"
      );
      loadAutoFontes();
    } catch (err) {
      addToast(err.response?.data?.detail || "Erro ao executar a fonte automática.", "error");
    } finally {
      setRunningKey(null);
    }
  };
```

- [ ] **Step 2: Renderizar a seção acima da tabela manual**

Inserir entre o header da página e o painel da tabela existente:

```jsx
      {autoFontes.length > 0 && (
        <div className="bg-[var(--panel)] rounded-2xl border border-[var(--border)] shadow-sm p-5 space-y-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <h2 className="text-lg font-bold text-[var(--text)]">Fontes automáticas</h2>
              <p className="text-sm text-[var(--text-mute)]">
                Buscam dados direto das APIs públicas — sem CSV. A execução grava auditoria e
                atualiza a data de atualização do dataset.
              </p>
            </div>
            <label className="flex items-center gap-2 text-sm text-[var(--text-dim)]">
              <input type="checkbox" checked={notificar} onChange={(e) => setNotificar(e.target.checked)} className="rounded" />
              Gerar notificações (faixa do FPM)
            </label>
          </div>
          <div className="space-y-2">
            {autoFontes.map((f) => (
              <div key={f.key} className="flex items-center justify-between gap-4 rounded-xl border border-[var(--border)] px-4 py-3 flex-wrap">
                <div className="min-w-0">
                  <p className="font-semibold text-[var(--text)]">{f.label}</p>
                  <p className="text-xs text-[var(--text-mute)] truncate">{f.fonte}</p>
                  <p className="text-xs mt-0.5 text-[var(--text-dim)]">
                    {f.ultima_execucao
                      ? `Última execução: ${new Date(f.ultima_execucao.criado_em).toLocaleString("pt-BR")} · ${f.ultima_execucao.status} · ${f.ultima_execucao.num_linhas} linhas`
                      : "Nunca executada"}
                  </p>
                </div>
                <button
                  onClick={() => handleExecutar(f)}
                  disabled={runningKey !== null}
                  className="px-4 py-2 text-sm rounded-lg bg-teal-600 hover:bg-teal-700 text-white transition-colors disabled:opacity-50"
                  aria-label={`Atualizar ${f.label} agora`}
                >
                  {runningKey === f.key ? "Executando..." : "Atualizar agora"}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
```

- [ ] **Step 3: Verificar visualmente**

Expected: em `/admin/fontes` (ADMIN_GLOBAL), a seção lista "População (IBGE)" e "FPM — repasses (STN)"; clicar "Atualizar agora" roda a ingestão real, mostra toast com o resumo e atualiza "Última execução". A ingestão do FPM pode levar ~1 min (CSV de 30 MB).

- [ ] **Step 4: Commit**

```bash
git add frontend-observatorio/src/pages/admin/DatasetFontesAdminPage.jsx
git commit -m "feat(ingestao): secao de fontes automaticas na pagina admin de fontes"
```

---

### Task 12: Verificação end-to-end com dados reais

**Files:** nenhum novo (correções pontuais se a verificação falhar).

- [ ] **Step 1: Suíte completa de testes**

Run: `cd backend && ..\venv\Scripts\python.exe -m pytest -v`
Expected: PASS (todos)

- [ ] **Step 2: Ingestões reais via admin**

Com backend + frontend rodando, logado como ADMIN_GLOBAL:
1. `/admin/fontes` → "Atualizar agora" em **População (IBGE)** → toast com `municipios_ok > 0`.
2. "Atualizar agora" em **FPM — repasses (STN)** → toast com `linhas > 0` (aguardar o download de ~30 MB).

- [ ] **Step 3: Conferir as superfícies**

1. Selecionar um município via "Ver como" → **Painel do Prefeito**: card do FPM visível com frase, tom e valores plausíveis (conferir ordem de grandeza: FPM 12m ÷ coeficiente ≈ mesmo valor entre municípios do mesmo estado).
2. **/app/fpm**: hero coerente com o card; régua com a faixa atual; gráfico mensal com os repasses; população com a linha de benchmark da próxima faixa; tabela anual.
3. **Sino de notificações**: se algum município caiu em zona de oportunidade/risco, a notificação aparece para usuário daquele município; re-executar a ingestão NÃO duplica a notificação.
4. **/admin/fontes**: "Última execução" preenchida para as duas fontes; `DatasetInfo.data_atualizacao` visível no InfoTooltip da página FPM.
5. Conta **free**: item FPM no nav sem cadeado; card e página acessíveis.

- [ ] **Step 4: Validar a tabela de faixas contra a fonte oficial**

Comparar `FAIXAS_FPM` com a Decisão Normativa vigente do TCU (ou cartilha STN "O que você precisa saber sobre transferências constitucionais — FPM"). Se houver divergência em qualquer limite, corrigir a constante e os testes de fronteira.

- [ ] **Step 5: Commit final (ajustes da verificação, se houver)**

```bash
git add -A && git commit -m "chore(fpm): ajustes da verificacao end-to-end"
```

---

## Self-Review (executado na escrita do plano)

1. **Spec coverage:** tabelas/migração (T1), faixas+cálculo+guardas (T2–T3), schemas+alerta+série+notificações com dedup (T4), endpoints livres de gating (T5), fundação + 2 fontes automáticas (T6–T7), endpoints admin+auditoria+DatasetInfo (T8), card no painel (T9), página+nav (T10), admin UI (T11), verificação e validação da tabela legal (T12). Edge cases do spec: sem codigo_ibge/sem população (T4/T10), capital (T2/T4), teto (T2), parcial <12 meses (T2), divergência/trava (T3/T4), falha de API externa (T6/T7/T8 — erro por município sem abortar + 502 auditado).
2. **Desvios conscientes do spec:** (a) testes de router com fixtures de DB substituídos por verificação manual — a suíte do projeto é pure-logic, sem harness de DB; (b) STN via CSV único do CKAN em vez de "API por município/ano" — verificado em 2026-07-06 que o dado público por município é o CSV; com isso o backfill default vira "todos os anos" (custa o mesmo download); (c) card auto-contido em vez de entrar no `Promise.all` do painel — integração de 1 linha, mesmo resultado.
3. **Type consistency:** nomes conferidos entre tasks — `montar_alerta`/`calcular_alerta`/`montar_serie`/`gerar_notificacoes_fpm`/`avaliar_*`, `ResumoIngestao(dataset, municipios_ok, municipios_erro, linhas, notificacoes, erros)`, keys `"populacao"`/`"fpm"`, payload `AlertaFpm` ↔ campos usados no front (`hab_para_subir`, `ganho_proxima_faixa`, `fpm_12m_parcial`, `divergencia`, `faixas[].atual`).
