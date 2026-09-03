# Gestão Empresarial — Descoberta na base RFB (sub-frente B) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Uma aba "Descobrir na base RFB" na Gestão Empresarial que lista, por score RFB decrescente calculado no banco, as empresas do município ainda não acompanhadas, com filtros de situação, porte, divisão CNAE e busca, paginação e um botão "Acompanhar" que abre o formulário Nova Empresa já preenchido e vinculado.

**Architecture:** Backend primeiro: `hoje_local()` (fuso fixo −3) e `CNAE_SECAO` movido para `app/core/`; no serviço `gestao_empresarial.py`, uma expressão SQL `expressao_score_rfb(hoje)` que espelha `calcular_relevancia` sem cadastro (máximo 45), `descobrir(...)` com `NOT EXISTS` sobre `empresa_retencao`, filtros e paginação, e `divisoes_disponiveis(...)`; dois endpoints `GET /retencao/descobrir` e `GET /retencao/descobrir/divisoes` declarados ANTES de `/retencao/{empresa_id}`. Front depois: componente novo `DescobrirRfb.jsx` (filtros, tabela, carregar mais, estados) e a `GestaoEmpresarialTab` ganha `NidTabBar` com duas abas, `openCreate(prefill)` e recarga da descoberta após salvar.

**Tech Stack:** FastAPI + SQLAlchemy 2 (`case`, `exists`, `cast`) + Pydantic v2 (backend; testes pytest com handlers chamados direto e fixture SQLite em memória); React 19 + Vitest/jsdom + Testing Library (front; mocks de `../../services/api`, `AuthContext`, `ViewAsContext`, `ToastContext`, `PlanContext.Provider`).

**Spec:** `docs/superpowers/specs/2026-09-03-gestao-empresarial-descoberta-rfb-design.md`

## Global Constraints

- **Sem migração.** Nada é persistido; o score é calculado na consulta.
- **Score RFB = espelho SQL de `calcular_relevancia` sem cadastro** (porte 01/03/05 → 6/12/20; tempo por datas de corte 10/5/2 anos → 15/11/7, com data → 3, sem data → 0; capital > 10 mi/1 mi/100 mil/10 mil → 10/8/6/3, senão 0; situação 08/01 zera, 03/04 divide por 2 com divisão inteira). Máximo **45**. O teste de consistência SQL × Python é obrigatório e deve cobrir todas as combinações da spec §2.
- **Universo da descoberta:** `empresas` do município SEM linha em `empresa_retencao` com o mesmo `(municipio_id, cnpj_basico)`; ordem `score DESC, razao_social ASC, cnpj_basico ASC`; `total` conta o mesmo universo filtrado.
- **Parâmetros exatos** (spec §1.1): `situacao` padrão `"02"` (códigos `01 02 03 04 08` ou `"todas"`), `porte` opcional (`00 01 03 05 07`), `divisao` opcional (`^\d{2}$`), `q` opcional (menos de 2 caracteres = ignorado; ≥ 3 dígitos → prefixo de `cnpj_basico`; senão `ILIKE` em razão social ou nome fantasia), `limit` 20 (1–100), `offset` ≥ 0. Código inválido de `situacao`/`porte` → **422**.
- **Rotas estáticas `/retencao/descobrir` e `/retencao/descobrir/divisoes` declaradas ANTES de `/retencao/{empresa_id}`** (Starlette casa em ordem de declaração; `{empresa_id}` é `int` e devolveria 422 para "descobrir"). Teste de ordem obrigatório.
- **Plano e escopo:** dependência `mid: int | None = Depends(scoped_modulo("empresas"))` nos dois endpoints (impõe o plano `empresas` no servidor e resolve município/view-as); `mid` nulo → `total 0` / `[]`.
- **`hoje_local()`** (`app/core/datas.py`, fuso fixo −3, sem `tzdata`) é o padrão de `enriquecer` e de `descobrir`; o router passa `hoje=hoje_local()` explicitamente.
- **Front:** `DescobrirRfb` só é montado quando `canAccess("empresas")`; sem o plano, um placeholder estático sob o `PlanGate` (nenhuma chamada à API). "Acompanhar" só com `canCriar`. Prefill: `nome = razao_social`, `cnpj_basico`, `setor = divisao_descricao || ""`. Respostas superadas ignoradas por flag de cleanup. Tokens `var(--accent-4)` (03/04) e `var(--accent-2)` (08/01) na situação.
- **Sem mudanças** em `EmpresasPage`, `BuscaEmpresaRfb`, `EmpresaDrawer`, rotas, sidebar, chaves de plano, permissões.
- **Gates de teste:** backend `venv/Scripts/python -m pytest backend/tests -p no:warnings` da raiz do repo (baseline **584**; NÃO acrescentar `-q`: o `backend/pytest.ini` já tem `addopts = -q` e um segundo `-q` esconde a linha de resumo); frontend `npx vitest run` de `frontend-observatorio/` (baseline **435**). Os dois verdes ao fim de cada task.
- Lint do repo JÁ FALHA (não é gate): arquivos novos limpos; modificados sem erro NOVO vs base (o falso-positivo `motion unused` é pré-existente).
- **Working copy é CRLF** (`core.autocrlf=true`). Arquivos novos: gravar e normalizar para CRLF (`venv/Scripts/python -c "p='<arquivo>';b=open(p,'rb').read().replace(b'\r\n',b'\n').replace(b'\n',b'\r\n');open(p,'wb').write(b)"`). Edições em arquivos existentes via Edit tool (preserva terminadores); **não** usar heredoc bash com JSX/Python.
- Copy pt-BR. Commits convencionais com subject **sem acentos** e trailers `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>` e `Claude-Session: https://claude.ai/code/session_01D1oaq9U7h3wirgFgCef7sv` (mensagem via `git commit -F <arquivo>`). Stage só os arquivos da task (`.claude/settings.local.json`, `dados/` e `docs/superpowers/plans/2026-05-06-ips-feature.md` são alterações locais alheias).
- Branch de trabalho: `feat/gestao-empresarial-descoberta-rfb` a partir de `main` (merge ff local ao final; push é do usuário).

---

### Task 1: `hoje_local()` + `CNAE_SECAO` compartilhado

**Files:**
- Create: `backend/app/core/datas.py`
- Create: `backend/app/core/cnae.py`
- Modify: `backend/app/api/v1/routers/empresas.py` (remover o dicionário `CNAE_SECAO` das linhas 27–88 e importar de `app.core.cnae`)
- Modify: `backend/app/services/gestao_empresarial.py:27` (import) e `:253` (`hoje = hoje or date.today()`)
- Modify: `backend/app/api/v1/routers/desenvolvimento_economico.py` (import + `hoje=hoje_local()` nas 3 chamadas de `enriquecer`: `_lean_enriquecido`, `listar_retencao`, `detalhe_retencao`)
- Test: `backend/tests/test_datas.py`

**Interfaces:**
- Consumes: nada novo.
- Produces (Tasks 2–3 dependem): `app.core.datas.hoje_local() -> date`, `app.core.datas.FUSO_BRASIL`; `app.core.cnae.CNAE_SECAO: dict[str, str]` (mesmo conteúdo de hoje; `routers/empresas.py` continua expondo o nome via import).

- [ ] **Step 1: Escrever os testes (falhando)**

Criar `backend/tests/test_datas.py`:

```python
"""hoje_local(): o servidor roda em UTC, o usuário está em Brasília (fuso
fixo -3, sem horário de verão desde 2019). Entre 21h e 0h em Brasília,
date.today() já é amanhã — hoje_local() não."""
from datetime import date, datetime, timezone
from types import SimpleNamespace
from unittest.mock import MagicMock

import app.core.datas as datas


class _RelogioFixo(datetime):
    utc_fixo = datetime(2026, 9, 2, 23, 30, tzinfo=timezone.utc)

    @classmethod
    def now(cls, tz=None):
        return cls.utc_fixo.astimezone(tz) if tz else cls.utc_fixo.replace(tzinfo=None)


def test_hoje_local_as_23h30_utc_ainda_e_o_mesmo_dia_no_brasil(monkeypatch):
    monkeypatch.setattr(datas, "datetime", _RelogioFixo)
    assert datas.hoje_local() == date(2026, 9, 2)


def test_hoje_local_as_02h_utc_e_o_dia_anterior_no_brasil(monkeypatch):
    class Relogio(_RelogioFixo):
        utc_fixo = datetime(2026, 9, 3, 2, 0, tzinfo=timezone.utc)   # 23h de 02/09 em Brasília
    monkeypatch.setattr(datas, "datetime", Relogio)
    assert datas.hoje_local() == date(2026, 9, 2)
    assert date(2026, 9, 3) == Relogio.utc_fixo.date()               # date.today() diria 03/09


def test_enriquecer_sem_hoje_usa_hoje_local(monkeypatch):
    import app.services.gestao_empresarial as ge
    relogio = MagicMock(return_value=date(2026, 9, 2))
    monkeypatch.setattr(ge, "hoje_local", relogio)
    cadastro = SimpleNamespace(id=1, nome="A", municipio_id=1, cnpj_basico=None, num_empregos=None,
                               potencial_expansao="baixo", proxima_acao=None, proxima_acao_data=None,
                               criado_em=datetime(2026, 8, 1))
    db = MagicMock()   # MagicMock é iterável vazio: as agregações não devolvem linhas
    calc = ge.enriquecer(db, [cadastro])
    relogio.assert_called_once()
    assert calc[1].risco.nivel == "nenhum"


def test_cnae_secao_mora_em_app_core_e_o_router_reexporta():
    from app.core.cnae import CNAE_SECAO
    from app.api.v1.routers.empresas import CNAE_SECAO as do_router
    assert CNAE_SECAO["47"] == "Comércio varejista" and CNAE_SECAO["25"] == "Fabricação de produtos de metal"
    assert do_router is CNAE_SECAO
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `venv/Scripts/python -m pytest backend/tests/test_datas.py -p no:warnings`
Expected: erro de coleta `ModuleNotFoundError: No module named 'app.core.datas'`.

- [ ] **Step 3: Criar `app/core/datas.py` e `app/core/cnae.py`**

`backend/app/core/datas.py`:

```python
"""Data de referência "hoje" no fuso do Brasil.

O servidor (Railway) roda em UTC; entre 21h e 0h em Brasília, `date.today()`
já é amanhã — uma próxima ação que vence hoje apareceria vencida três horas
antes e os limiares de 90/30 dias andariam um dia. Fuso fixo -3: o Brasil
não tem horário de verão desde 2019, e assim não dependemos de `tzdata`
(ausente no Windows de desenvolvimento).
"""
from datetime import date, datetime, timedelta, timezone

FUSO_BRASIL = timezone(timedelta(hours=-3), name="Brasil (fixo -3)")


def hoje_local() -> date:
    return datetime.now(FUSO_BRASIL).date()
```

`backend/app/core/cnae.py`: mover o bloco de `backend/app/api/v1/routers/empresas.py` que começa em `# CNAE division (2 digits) → section description` e termina na linha `}` após `"99": "Organismos internacionais",` (linhas 27–88), sem alterar uma entrada sequer, com este cabeçalho:

```python
"""Divisão CNAE (2 primeiros dígitos do cnae_fiscal) → descrição da seção.
Compartilhado por /empresas/por_cnae_secao e pela descoberta na base RFB."""

# CNAE division (2 digits) → section description
CNAE_SECAO = {
    ...  # conteúdo idêntico ao que estava em routers/empresas.py
}
```

Em `routers/empresas.py`, no lugar do bloco removido não fica nada; acrescentar após `from app.api.deps import get_current_user, get_db, scoped_modulo`:

```python
from app.core.cnae import CNAE_SECAO
```

- [ ] **Step 4: `hoje_local` como padrão e passado pelo router**

`backend/app/services/gestao_empresarial.py`: após `from datetime import date, datetime, timedelta` acrescentar `from app.core.datas import hoje_local` (junto aos imports de `app.`), e trocar `hoje = hoje or date.today()` por `hoje = hoje or hoje_local()`.

`backend/app/api/v1/routers/desenvolvimento_economico.py`: acrescentar `from app.core.datas import hoje_local` após `from app.core.cnpj import cnpj_para_basico`; trocar as três chamadas:
- em `_lean_enriquecido`: `enriquecer(db, [empresa])` → `enriquecer(db, [empresa], hoje=hoje_local())`
- em `listar_retencao`: `calc = enriquecer(db, empresas)` → `calc = enriquecer(db, empresas, hoje=hoje_local())`
- em `detalhe_retencao`: `calc = enriquecer(db, [empresa])[empresa.id]` → `calc = enriquecer(db, [empresa], hoje=hoje_local())[empresa.id]`

- [ ] **Step 5: Rodar e ver passar; suíte inteira**

Run: `venv/Scripts/python -m pytest backend/tests/test_datas.py backend/tests/test_gestao_empresarial_score.py backend/tests/test_gestao_empresarial_endpoints.py -p no:warnings`
Expected: todos passam.
Run: `venv/Scripts/python -m pytest backend/tests -p no:warnings` → `588 passed` (584 + 4).

- [ ] **Step 6: CRLF nos arquivos novos e commit**

```bash
git add backend/app/core/datas.py backend/app/core/cnae.py backend/app/api/v1/routers/empresas.py backend/app/services/gestao_empresarial.py backend/app/api/v1/routers/desenvolvimento_economico.py backend/tests/test_datas.py
git commit -F <msg>   # "feat(core): hoje_local() no fuso do Brasil e CNAE_SECAO compartilhado em app/core"
```

---

### Task 2: Serviço — score RFB em SQL, `descobrir` e `divisoes_disponiveis`

**Files:**
- Modify: `backend/app/services/gestao_empresarial.py` (imports; seção nova ao final do módulo)
- Test: `backend/tests/test_gestao_empresarial_descoberta.py`

**Interfaces:**
- Consumes (Task 1): `hoje_local`. Constantes já existentes no módulo: `PONTOS_PORTE`, `PONTOS_TEMPO`, `PONTOS_CAPITAL`, `SITUACAO_REDUZ`, `SITUACAO_ZERA`; modelos `Empresa`, `EmpresaRetencao`.
- Produces (Task 3 depende):
  - `SITUACOES_RFB = ("01", "02", "03", "04", "08")`, `PORTES_RFB = ("00", "01", "03", "05", "07")`;
  - `_datas_de_corte(hoje) -> tuple[date, date, date]` (corte10, corte5, corte2);
  - `expressao_score_rfb(hoje: date)` → elemento SQLAlchemy rotulado `score`;
  - `descobrir(db, municipio_id, *, situacao="02", porte=None, divisao=None, q=None, limit=20, offset=0, hoje=None) -> tuple[int, list]` — `(total, linhas)`, cada linha `(Empresa, score:int)`; `ValueError` para `situacao`/`porte` inválidos;
  - `divisoes_disponiveis(db, municipio_id) -> list[tuple[str, int]]`.

- [ ] **Step 1: Escrever os testes (falhando)**

Criar `backend/tests/test_gestao_empresarial_descoberta.py`:

```python
"""Descoberta na base RFB: o score SQL espelha calcular_relevancia sem
cadastro (máximo 45); universo exclui acompanhadas; filtros, ordem e
paginação."""
import itertools
from datetime import date, timedelta
from types import SimpleNamespace

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

import app.models  # noqa: F401
from app.db.base import Base
from app.models.desenvolvimento_economico import EmpresaRetencao
from app.models.empresa import Empresa
from app.models.municipio import Municipio
from app.services.gestao_empresarial import (
    _datas_de_corte,
    calcular_relevancia,
    descobrir,
    divisoes_disponiveis,
    expressao_score_rfb,
)

HOJE = date(2026, 9, 2)
SEM_CADASTRO = SimpleNamespace(num_empregos=None, potencial_expansao="baixo")


@pytest.fixture()
def db():
    engine = create_engine("sqlite://")
    Base.metadata.create_all(engine, tables=[Municipio.__table__, Empresa.__table__, EmpresaRetencao.__table__])
    sessao = sessionmaker(bind=engine)()
    yield sessao
    sessao.close()


def _municipio(db, nome="Alfa"):
    m = Municipio(nome=nome, estado="MG")
    db.add(m)
    db.flush()
    return m


def _empresa(db, m, raiz, **kw):
    base = dict(municipio_id=m.id, cnpj_basico=raiz, razao_social=f"Empresa {raiz}", situacao="02")
    base.update(kw)
    e = Empresa(**base)
    db.add(e)
    db.flush()
    return e


def _acompanhar(db, m, raiz):
    db.add(EmpresaRetencao(municipio_id=m.id, nome=f"Acompanhada {raiz}", cnpj_basico=raiz))
    db.flush()


# ── consistência SQL × Python ────────────────────────────────────────────────

PORTES = [None, "00", "01", "03", "05"]
SITUACOES = ["02", "03", "04", "08", "01", None]
CAPITAIS = [None, 10_000.0, 10_000.01, 100_000.01, 1_000_000.01, 10_000_000.01]


def _datas_amostra():
    c10, c5, c2 = _datas_de_corte(HOJE)
    return [None, HOJE, c2 + timedelta(days=1), c2, c5, c10, date(1990, 1, 1)]


def test_score_sql_igual_ao_python_em_todas_as_combinacoes(db):
    m = _municipio(db)
    combos = list(itertools.product(PORTES, SITUACOES, CAPITAIS, _datas_amostra()))
    for i, (porte, sit, cap, ini) in enumerate(combos):
        _empresa(db, m, f"{i:08d}", porte=porte, situacao=sit, capital_social=cap, data_inicio=ini)
    db.commit()
    lidos = {e.cnpj_basico: int(s) for e, s in
             db.query(Empresa, expressao_score_rfb(HOJE)).filter(Empresa.municipio_id == m.id)}
    divergencias = []
    for i, (porte, sit, cap, ini) in enumerate(combos):
        perfil = SimpleNamespace(porte=porte, situacao=sit, capital_social=cap, data_inicio=ini)
        esperado = calcular_relevancia(SEM_CADASTRO, perfil, HOJE).score
        if lidos[f"{i:08d}"] != esperado:
            divergencias.append((porte, sit, cap, ini, lidos[f"{i:08d}"], esperado))
    assert divergencias == []
    assert max(lidos.values()) == 45


def test_datas_de_corte_em_29_de_fevereiro():
    assert _datas_de_corte(date(2028, 2, 29)) == (date(2018, 2, 28), date(2023, 2, 28), date(2026, 2, 28))
    assert _datas_de_corte(HOJE) == (date(2016, 9, 2), date(2021, 9, 2), date(2024, 9, 2))


# ── descobrir ────────────────────────────────────────────────────────────────

def test_descobrir_exclui_acompanhadas_so_do_mesmo_municipio(db):
    m1, m2 = _municipio(db, "Alfa"), _municipio(db, "Beta")
    _empresa(db, m1, "11111111", porte="05")
    _empresa(db, m1, "22222222", porte="01")
    _empresa(db, m2, "11111111", porte="05")
    _acompanhar(db, m1, "11111111")
    db.commit()
    total, linhas = descobrir(db, m1.id, hoje=HOJE)
    assert total == 1 and [e.cnpj_basico for e, _ in linhas] == ["22222222"]
    total2, linhas2 = descobrir(db, m2.id, hoje=HOJE)   # a mesma raiz em outro município segue descoberta
    assert total2 == 1 and linhas2[0][0].cnpj_basico == "11111111"


def test_descobrir_ordena_por_score_desc_e_razao_social(db):
    m = _municipio(db)
    _empresa(db, m, "00000001", razao_social="Zeta", porte="05", capital_social=5e6, data_inicio=date(2000, 1, 1))  # 20+15+8 = 43
    _empresa(db, m, "00000002", razao_social="Beta", porte="01")                                                     # 6
    _empresa(db, m, "00000003", razao_social="Alfa", porte="01")                                                     # 6
    _empresa(db, m, "00000004", razao_social="Gama", porte="05", situacao="04", capital_social=5e6, data_inicio=date(2000, 1, 1))  # 43 // 2 = 21
    db.commit()
    _, linhas = descobrir(db, m.id, situacao="todas", hoje=HOJE)
    assert [(e.razao_social, int(s)) for e, s in linhas] == [("Zeta", 43), ("Gama", 21), ("Alfa", 6), ("Beta", 6)]


def test_descobrir_situacao_padrao_ativas_e_filtros(db):
    m = _municipio(db)
    _empresa(db, m, "11111111", razao_social="Padaria Pão", nome_fantasia="Pão Quente", porte="01", cnae_fiscal="4721102")
    _empresa(db, m, "12345678", razao_social="Metal Forte", porte="05", cnae_fiscal="2511000")
    _empresa(db, m, "22222222", razao_social="Baixada SA", porte="05", situacao="08", cnae_fiscal="2511000")
    db.commit()
    nomes = lambda **kw: [e.razao_social for e, _ in descobrir(db, m.id, hoje=HOJE, **kw)[1]]
    assert descobrir(db, m.id, hoje=HOJE)[0] == 2                     # "02" por padrão
    assert descobrir(db, m.id, situacao="todas", hoje=HOJE)[0] == 3
    assert nomes(situacao="08") == ["Baixada SA"]
    assert nomes(porte="05") == ["Metal Forte"]
    assert nomes(divisao="47") == ["Padaria Pão"]
    assert nomes(q="quente") == ["Padaria Pão"]                        # nome fantasia, sem distinguir caixa
    assert nomes(q="1234") == ["Metal Forte"]                          # 3+ dígitos: prefixo da raiz
    assert descobrir(db, m.id, q="p", hoje=HOJE)[0] == 2               # < 2 caracteres: filtro ignorado


def test_descobrir_rejeita_codigos_invalidos(db):
    m = _municipio(db)
    with pytest.raises(ValueError):
        descobrir(db, m.id, situacao="99", hoje=HOJE)
    with pytest.raises(ValueError):
        descobrir(db, m.id, porte="09", hoje=HOJE)


def test_descobrir_pagina_com_total_estavel_e_sem_repetir(db):
    m = _municipio(db)
    for i in range(7):
        _empresa(db, m, f"{i:08d}", razao_social=f"E{i}")
    db.commit()
    total, p1 = descobrir(db, m.id, limit=3, offset=0, hoje=HOJE)
    _, p2 = descobrir(db, m.id, limit=3, offset=3, hoje=HOJE)
    _, p3 = descobrir(db, m.id, limit=3, offset=6, hoje=HOJE)
    assert (total, len(p1), len(p2), len(p3)) == (7, 3, 3, 1)
    assert len({e.cnpj_basico for e, _ in p1 + p2 + p3}) == 7


def test_divisoes_disponiveis_so_ativas_nao_acompanhadas_com_cnae(db):
    m = _municipio(db)
    _empresa(db, m, "00000001", cnae_fiscal="4721102")
    _empresa(db, m, "00000002", cnae_fiscal="4711302")
    _empresa(db, m, "00000003", cnae_fiscal="2511000", situacao="08")   # baixada: fora
    _empresa(db, m, "00000004", cnae_fiscal=None)                       # sem CNAE: fora
    _empresa(db, m, "00000005", cnae_fiscal="8599604")
    _acompanhar(db, m, "00000005")                                      # acompanhada: fora
    db.commit()
    assert sorted(divisoes_disponiveis(db, m.id)) == [("47", 2)]
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `venv/Scripts/python -m pytest backend/tests/test_gestao_empresarial_descoberta.py -p no:warnings`
Expected: `ImportError: cannot import name '_datas_de_corte'`.

- [ ] **Step 3: Implementar no serviço**

Em `backend/app/services/gestao_empresarial.py`:

Imports — trocar `from sqlalchemy import func` por `from sqlalchemy import Integer, case, cast, exists, func, or_`; acrescentar `import re` ao topo (após `from __future__ import annotations`); trocar o import dos modelos por `from app.models.desenvolvimento_economico import ContatoEmpresa, DemandaEmpresa, EmpresaRetencao, VisitaRetencao`.

Acrescentar ao final do módulo:

```python
# ── descoberta na base RFB (sub-frente B) ───────────────────────────────────
# Espelho SQL de calcular_relevancia para linhas de `empresas` SEM cadastro
# (0 pontos de empregos e potencial): porte + tempo + capital, ajustado pela
# situação. Máximo 45. test_gestao_empresarial_descoberta.py compara SQL e
# Python combinação a combinação — alterou uma regra, alterou as duas.

SITUACOES_RFB = ("01", "02", "03", "04", "08")
PORTES_RFB = ("00", "01", "03", "05", "07")


def _menos_anos(hoje: date, anos: int) -> date:
    """`hoje` N anos atrás; 29/02 vira 28/02. Como os cortes são 2, 5 e 10
    anos, o ano de destino de um 29/02 nunca é bissexto — `_anos_completos`
    e o corte concordam em todos os casos."""
    try:
        return hoje.replace(year=hoje.year - anos)
    except ValueError:
        return hoje.replace(year=hoje.year - anos, day=28)


def _datas_de_corte(hoje: date) -> tuple[date, date, date]:
    """(corte10, corte5, corte2): `data_inicio <= corteN` ⟺ N anos completos."""
    return _menos_anos(hoje, 10), _menos_anos(hoje, 5), _menos_anos(hoje, 2)


def expressao_score_rfb(hoje: date):
    corte10, corte5, corte2 = _datas_de_corte(hoje)
    pontos_tempo = dict(PONTOS_TEMPO)  # {10: 15, 5: 11, 2: 7, 0: 3}
    porte = case(dict(PONTOS_PORTE), value=Empresa.porte, else_=0)
    tempo = case(
        (Empresa.data_inicio <= corte10, pontos_tempo[10]),
        (Empresa.data_inicio <= corte5, pontos_tempo[5]),
        (Empresa.data_inicio <= corte2, pontos_tempo[2]),
        (Empresa.data_inicio.isnot(None), pontos_tempo[0]),
        else_=0,
    )
    capital = case(
        *[(Empresa.capital_social > acima_de, pts) for acima_de, pts in PONTOS_CAPITAL],
        else_=0,
    )
    bruto = porte + tempo + capital
    # `bruto // 2` do Python. SQLAlchemy 2 faz divisão real com `/` (21.5) e
    # CAST(21.5 AS INTEGER) arredonda no Postgres e trunca no SQLite — então
    # tira-se o resto antes de dividir: (43 - 1) / 2 = 21.0 → 21 nos dois.
    metade = cast((bruto - (bruto % 2)) / 2, Integer)
    return case(
        (Empresa.situacao.in_(list(SITUACAO_ZERA)), 0),
        (Empresa.situacao.in_(list(SITUACAO_REDUZ)), metade),
        else_=bruto,
    ).label("score")


def _filtros_descoberta(municipio_id: int, situacao: str, porte: str | None,
                        divisao: str | None, q: str | None) -> list:
    filtros = [
        Empresa.municipio_id == municipio_id,
        ~exists().where(
            EmpresaRetencao.municipio_id == Empresa.municipio_id,
            EmpresaRetencao.cnpj_basico == Empresa.cnpj_basico,
        ),
    ]
    if situacao != "todas":
        filtros.append(Empresa.situacao == situacao)
    if porte:
        filtros.append(Empresa.porte == porte)
    if divisao:
        filtros.append(Empresa.cnae_fiscal.like(f"{divisao}%"))
    termo = (q or "").strip()
    if len(termo) >= 2:
        digitos = re.sub(r"\D", "", termo)
        if len(digitos) >= 3:
            filtros.append(Empresa.cnpj_basico.like(f"{digitos[:8]}%"))
        else:
            like = f"%{termo}%"
            filtros.append(or_(Empresa.razao_social.ilike(like), Empresa.nome_fantasia.ilike(like)))
    return filtros


def descobrir(db: Session, municipio_id: int, *, situacao: str = "02", porte: str | None = None,
              divisao: str | None = None, q: str | None = None, limit: int = 20, offset: int = 0,
              hoje: date | None = None) -> tuple[int, list]:
    """Empresas da base RFB do município ainda não acompanhadas, por score RFB
    decrescente (desempate por razão social e raiz, para paginar de forma
    estável). Devolve (total, linhas); cada linha é (Empresa, score)."""
    if situacao != "todas" and situacao not in SITUACOES_RFB:
        raise ValueError(f"situacao inválida: {situacao!r}")
    if porte is not None and porte not in PORTES_RFB:
        raise ValueError(f"porte inválido: {porte!r}")
    hoje = hoje or hoje_local()
    filtros = _filtros_descoberta(municipio_id, situacao, porte, divisao, q)
    total = db.query(func.count(Empresa.id)).filter(*filtros).scalar() or 0
    score = expressao_score_rfb(hoje)
    linhas = (
        db.query(Empresa, score)
        .filter(*filtros)
        .order_by(score.desc(), Empresa.razao_social.asc(), Empresa.cnpj_basico.asc())
        .offset(offset)
        .limit(limit)
        .all()
    )
    return int(total), [(e, int(s)) for e, s in linhas]


def divisoes_disponiveis(db: Session, municipio_id: int) -> list[tuple[str, int]]:
    """Divisões CNAE (2 dígitos) entre as ativas não acompanhadas, com contagem."""
    divisao = func.substr(Empresa.cnae_fiscal, 1, 2)
    filtros = _filtros_descoberta(municipio_id, "02", None, None, None) + [Empresa.cnae_fiscal.isnot(None)]
    rows = db.query(divisao, func.count(Empresa.id)).filter(*filtros).group_by(divisao).all()
    return [(str(d), int(n)) for d, n in rows]
```

- [ ] **Step 4: Rodar e ver passar; suíte inteira**

Run: `venv/Scripts/python -m pytest backend/tests/test_gestao_empresarial_descoberta.py backend/tests/test_gestao_empresarial_score.py -p no:warnings`
Expected: todos passam (a consistência cobre 1.260 combinações).
Run: `venv/Scripts/python -m pytest backend/tests -p no:warnings` → `596 passed` (588 + 8).

- [ ] **Step 5: CRLF no teste novo e commit**

```bash
git add backend/app/services/gestao_empresarial.py backend/tests/test_gestao_empresarial_descoberta.py
git commit -F <msg>   # "feat(gestao-empresarial): score RFB em SQL, descobrir() e divisoes_disponiveis()"
```

---

### Task 3: Schemas + endpoints `/retencao/descobrir` e `/retencao/descobrir/divisoes`

**Files:**
- Modify: `backend/app/schemas/desenvolvimento_economico.py` (acrescentar ao final)
- Modify: `backend/app/api/v1/routers/desenvolvimento_economico.py` (imports; dois handlers inseridos ENTRE `listar_retencao` e `detalhe_retencao`)
- Test: `backend/tests/test_gestao_empresarial_endpoints.py` (acrescentar ao fim; fixture `ctx` e `_criar_empresa` já existem)

**Interfaces:**
- Consumes (Tasks 1–2): `hoje_local`, `CNAE_SECAO`, `descobrir`, `divisoes_disponiveis`, `scoped_modulo` (`app.api.deps`).
- Produces (Tasks 4–5 dependem do JSON): `GET /desenvolvimento-economico/retencao/descobrir?situacao&porte&divisao&q&limit&offset` → `{total, itens: [{cnpj_basico, razao_social, nome_fantasia, situacao, porte, cnae_fiscal, divisao, divisao_descricao, capital_social, data_inicio, score}]}`; `GET /desenvolvimento-economico/retencao/descobrir/divisoes` → `[{divisao, descricao, total}]` ordenado por descrição.

- [ ] **Step 1: Escrever os testes (falhando)**

Acrescentar ao fim de `backend/tests/test_gestao_empresarial_endpoints.py`:

```python
# ── descoberta na base RFB (sub-frente B) ────────────────────────────────────

def _args_descobrir(**kw):
    base = dict(situacao="02", porte=None, divisao=None, q=None, limit=20, offset=0)
    base.update(kw)
    return base


def test_descobrir_retencao_devolve_pagina_com_divisao_e_score(ctx):
    from app.api.v1.routers.desenvolvimento_economico import descobrir_divisoes, descobrir_retencao
    db, _, u1, _, m1, _ = ctx
    db.add_all([
        Empresa(municipio_id=m1.id, cnpj_basico="11111111", razao_social="Metal Forte", situacao="02",
                porte="05", cnae_fiscal="2511000", capital_social=5e6, data_inicio=date(2000, 1, 1)),
        Empresa(municipio_id=m1.id, cnpj_basico="22222222", razao_social="Padaria", situacao="02",
                porte="01", cnae_fiscal="4721102"),
    ])
    db.commit()
    _criar_empresa(db, u1, nome="Padaria acompanhada", cnpj_basico="22222222")
    page = descobrir_retencao(**_args_descobrir(), mid=m1.id, db=db)
    assert page.total == 1
    item = page.itens[0]
    assert (item.razao_social, item.divisao, item.divisao_descricao, item.score) == \
        ("Metal Forte", "25", "Fabricação de produtos de metal", 43)
    assert item.data_inicio == date(2000, 1, 1) and item.capital_social == 5e6
    divs = descobrir_divisoes(mid=m1.id, db=db)
    assert [(d.divisao, d.descricao, d.total) for d in divs] == [("25", "Fabricação de produtos de metal", 1)]


def test_descobrir_retencao_sem_municipio_e_codigo_invalido(ctx):
    from fastapi import HTTPException
    from app.api.v1.routers.desenvolvimento_economico import descobrir_divisoes, descobrir_retencao
    db, *_ = ctx
    assert descobrir_retencao(**_args_descobrir(), mid=None, db=db).total == 0
    assert descobrir_divisoes(mid=None, db=db) == []
    with pytest.raises(HTTPException) as exc:
        descobrir_retencao(**_args_descobrir(situacao="99"), mid=1, db=db)
    assert exc.value.status_code == 422


def test_rotas_de_descoberta_vem_antes_do_detalhe_por_id():
    from app.main import app
    caminhos = [getattr(r, "path", "") for r in app.router.routes]
    base = "/api/v1/desenvolvimento-economico/retencao"
    assert caminhos.index(f"{base}/descobrir") < caminhos.index(base + "/{empresa_id}")
    assert caminhos.index(f"{base}/descobrir/divisoes") < caminhos.index(base + "/{empresa_id}")
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `venv/Scripts/python -m pytest backend/tests/test_gestao_empresarial_endpoints.py -p no:warnings`
Expected: os 3 novos falham (`ImportError: cannot import name 'descobrir_retencao'` / `ValueError: ... is not in list`); os antigos passam.

- [ ] **Step 3: Schemas**

Acrescentar ao final de `backend/app/schemas/desenvolvimento_economico.py`:

```python


# ── descoberta na base RFB (sub-frente B) ──────────────────────────────────

class DescobertaItem(BaseModel):
    cnpj_basico: str
    razao_social: str
    nome_fantasia: Optional[str] = None
    situacao: Optional[str] = None
    porte: Optional[str] = None
    cnae_fiscal: Optional[str] = None
    divisao: Optional[str] = None
    divisao_descricao: Optional[str] = None
    capital_social: Optional[float] = None
    data_inicio: Optional[date] = None
    score: int


class DescobertaPage(BaseModel):
    total: int
    itens: List[DescobertaItem]


class DivisaoCnaeOut(BaseModel):
    divisao: str
    descricao: str
    total: int
```

- [ ] **Step 4: Router**

Imports em `backend/app/api/v1/routers/desenvolvimento_economico.py`:
- `from fastapi import APIRouter, Depends, Query` → `from fastapi import APIRouter, Depends, HTTPException, Query`
- `from app.api.deps import get_current_user, get_db, require_permissao` → `from app.api.deps import get_current_user, get_db, require_permissao, scoped_modulo`
- acrescentar `from app.core.cnae import CNAE_SECAO` (após o import de `app.core.cnpj`)
- no bloco `from app.schemas.desenvolvimento_economico import (...)` acrescentar, em ordem alfabética, `DescobertaItem,`, `DescobertaPage,`, `DivisaoCnaeOut,`
- `from app.services.gestao_empresarial import Enriquecimento, enriquecer, ordenar_por_relevancia` → `from app.services.gestao_empresarial import Enriquecimento, descobrir, divisoes_disponiveis, enriquecer, ordenar_por_relevancia`

Inserir IMEDIATAMENTE após o `return [...]` final de `listar_retencao` e ANTES de `@router.get("/retencao/{empresa_id}", ...)`:

```python
def _divisao_cnae(cnae_fiscal: str | None) -> tuple[str | None, str | None]:
    if not cnae_fiscal:
        return None, None
    div = cnae_fiscal[:2]
    return div, CNAE_SECAO.get(div, f"Divisão {div}")


# Rotas estáticas de /retencao ficam ANTES de /retencao/{empresa_id}: o
# Starlette casa em ordem de declaração e `{empresa_id}` é int — "descobrir"
# viraria 422. test_rotas_de_descoberta_vem_antes_do_detalhe_por_id guarda isso.
@router.get("/retencao/descobrir", response_model=DescobertaPage)
def descobrir_retencao(
    situacao: str = Query("02"),
    porte: str | None = Query(None),
    divisao: str | None = Query(None, pattern=r"^\d{2}$"),
    q: str | None = Query(None),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    mid: int | None = Depends(scoped_modulo("empresas")),
    db: Session = Depends(get_db),
):
    """Empresas da base RFB do município ainda não acompanhadas, por score RFB
    decrescente (espelho SQL de calcular_relevancia sem cadastro; máximo 45).
    Plano `empresas` e escopo/view-as pela dependência; sem município → vazio."""
    if mid is None:
        return DescobertaPage(total=0, itens=[])
    try:
        total, linhas = descobrir(db, mid, situacao=situacao, porte=porte, divisao=divisao,
                                  q=q, limit=limit, offset=offset, hoje=hoje_local())
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    itens = []
    for e, score in linhas:
        div, descricao = _divisao_cnae(e.cnae_fiscal)
        itens.append(DescobertaItem(
            cnpj_basico=e.cnpj_basico, razao_social=e.razao_social, nome_fantasia=e.nome_fantasia,
            situacao=e.situacao, porte=e.porte, cnae_fiscal=e.cnae_fiscal,
            divisao=div, divisao_descricao=descricao,
            capital_social=e.capital_social, data_inicio=e.data_inicio, score=score,
        ))
    return DescobertaPage(total=total, itens=itens)


@router.get("/retencao/descobrir/divisoes", response_model=List[DivisaoCnaeOut])
def descobrir_divisoes(
    mid: int | None = Depends(scoped_modulo("empresas")),
    db: Session = Depends(get_db),
):
    """Divisões CNAE presentes entre as ativas não acompanhadas — popula o
    filtro da aba Descobrir uma vez por montagem."""
    if mid is None:
        return []
    itens = [
        DivisaoCnaeOut(divisao=d, descricao=CNAE_SECAO.get(d, f"Divisão {d}"), total=n)
        for d, n in divisoes_disponiveis(db, mid)
    ]
    return sorted(itens, key=lambda i: i.descricao)


```

- [ ] **Step 5: Rodar e ver passar; suíte inteira**

Run: `venv/Scripts/python -m pytest backend/tests/test_gestao_empresarial_endpoints.py -p no:warnings`
Expected: todos passam (Metal Forte: 20 + 15 + 8 = 43 com `hoje_local()` real, abertura em 2000).
Run: `venv/Scripts/python -m pytest backend/tests -p no:warnings` → `599 passed` (596 + 3).

- [ ] **Step 6: Commit**

```bash
git add backend/app/schemas/desenvolvimento_economico.py backend/app/api/v1/routers/desenvolvimento_economico.py backend/tests/test_gestao_empresarial_endpoints.py
git commit -F <msg>   # "feat(gestao-empresarial): endpoints de descoberta na base RFB (ranking paginado e divisoes CNAE)"
```

---

### Task 4: Componente `DescobrirRfb.jsx`

**Files:**
- Create: `frontend-observatorio/src/pages/desenvolvimento-economico/DescobrirRfb.jsx`
- Test: `frontend-observatorio/src/pages/desenvolvimento-economico/DescobrirRfb.test.jsx`

**Interfaces:**
- Consumes (Task 3): os dois endpoints acima via `api.get`; `NidSelect` (`src/components/nid/NidSelect.jsx`: props `value`, `onChange(e)`, `ariaLabel`, `children`).
- Produces (Task 5 depende): `export default function DescobrirRfb({ onAcompanhar, canCriar, refreshKey = 0 })` — `onAcompanhar(item)` recebe o item da API inteiro; `refreshKey` mudando recarrega divisões e primeira página.

- [ ] **Step 1: Escrever os testes (falhando)**

Criar `DescobrirRfb.test.jsx`:

```jsx
// @vitest-environment jsdom
//
// Aba "Descobrir na base RFB": ranking paginado das empresas ainda não
// acompanhadas, filtros, busca com debounce, carregar mais, acompanhar,
// estados vazio e de erro.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent, act } from "@testing-library/react";

// respostas[url] pode ser um valor, uma função dos params ou uma promise.
const respostas = {};
vi.mock("../../services/api", () => ({
  default: {
    get: vi.fn((url, cfg) => {
      const r = respostas[url];
      const data = typeof r === "function" ? r(cfg?.params ?? {}) : r;
      return Promise.resolve(data).then((d) => ({ data: d }));
    }),
  },
}));

import api from "../../services/api";
import DescobrirRfb from "./DescobrirRfb";

const BASE = "/desenvolvimento-economico/retencao/descobrir";
const ITENS = [
  { cnpj_basico: "11111111", razao_social: "Metal Forte", nome_fantasia: null, situacao: "02", porte: "05",
    cnae_fiscal: "2511000", divisao: "25", divisao_descricao: "Fabricação de produtos de metal",
    capital_social: 5000000, data_inicio: "2000-01-05", score: 43 },
  { cnpj_basico: "22222222", razao_social: "Padaria Pão", nome_fantasia: "Pão Quente", situacao: "04", porte: "01",
    cnae_fiscal: "4721102", divisao: "47", divisao_descricao: "Comércio varejista",
    capital_social: null, data_inicio: null, score: 3 },
];
const TERCEIRA = { ...ITENS[0], cnpj_basico: "33333333", razao_social: "Terceira" };

const params = (url) => api.get.mock.calls.filter(([u]) => u === url).map(([, cfg]) => cfg?.params ?? {});
const ultimo = () => params(BASE).at(-1);
const cell = (nome) => screen.getByRole("cell", { name: nome });

beforeEach(() => {
  vi.clearAllMocks();
  Object.keys(respostas).forEach((k) => delete respostas[k]);
  respostas[`${BASE}/divisoes`] = [
    { divisao: "25", descricao: "Fabricação de produtos de metal", total: 1 },
    { divisao: "47", descricao: "Comércio varejista", total: 8123 },
  ];
  respostas[BASE] = ({ offset }) => ({ total: 45, itens: offset === 0 ? ITENS : [TERCEIRA] });
});
afterEach(() => vi.useRealTimers());

const montar = (props = {}) => render(
  <DescobrirRfb onAcompanhar={props.onAcompanhar || vi.fn()} canCriar={props.canCriar ?? true} refreshKey={props.refreshKey ?? 0} />
);
const esperarLinhas = () => waitFor(() => expect(screen.getByText("Metal Forte")).toBeInTheDocument());

describe("DescobrirRfb", () => {
  it("lista com divisão, porte, ano, capital, situação e score; padrão situação 02, 20 por página", async () => {
    montar();
    await esperarLinhas();
    expect(ultimo()).toEqual({ situacao: "02", limit: 20, offset: 0 });
    expect(cell("Fabricação de produtos de metal")).toBeInTheDocument();
    expect(cell("Média")).toBeInTheDocument();
    expect(cell("2000")).toBeInTheDocument();
    expect(cell("R$ 5.000.000")).toBeInTheDocument();
    expect(cell("Inapta")).toBeInTheDocument();
    expect(cell("43")).toBeInTheDocument();
    expect(cell("Padaria Pão · Pão Quente")).toBeInTheDocument();   // nome acessível da célula junta os dois spans
    expect(screen.getByText(/45 empresas na base RFB ainda não acompanhadas/)).toBeInTheDocument();
  });

  it("filtros e busca enviam os parâmetros; busca só com 2+ caracteres e com debounce", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    montar();
    await esperarLinhas();
    fireEvent.change(screen.getByRole("combobox", { name: "Situação cadastral" }), { target: { value: "todas" } });
    await waitFor(() => expect(ultimo()).toEqual({ situacao: "todas", limit: 20, offset: 0 }));
    fireEvent.change(screen.getByRole("combobox", { name: "Porte" }), { target: { value: "05" } });
    await waitFor(() => expect(ultimo()).toEqual({ situacao: "todas", porte: "05", limit: 20, offset: 0 }));
    await waitFor(() => expect(screen.getByRole("option", { name: "Comércio varejista · 8.123" })).toBeInTheDocument());
    fireEvent.change(screen.getByRole("combobox", { name: "Divisão CNAE" }), { target: { value: "47" } });
    await waitFor(() => expect(ultimo()).toEqual({ situacao: "todas", porte: "05", divisao: "47", limit: 20, offset: 0 }));

    const chamadasAntes = params(BASE).length;
    const busca = screen.getByRole("textbox", { name: "Buscar na base RFB" });
    fireEvent.change(busca, { target: { value: "p" } });
    await act(async () => { await vi.advanceTimersByTimeAsync(350); });
    expect(params(BASE).length).toBe(chamadasAntes);              // 1 caractere: nada enviado
    fireEvent.change(busca, { target: { value: "padaria" } });
    await act(async () => { await vi.advanceTimersByTimeAsync(350); });
    await waitFor(() => expect(ultimo()).toEqual({ situacao: "todas", porte: "05", divisao: "47", q: "padaria", limit: 20, offset: 0 }));
  });

  it("Carregar mais envia offset = itens carregados e anexa", async () => {
    montar();
    await esperarLinhas();
    fireEvent.click(screen.getByRole("button", { name: /Carregar mais/ }));
    await waitFor(() => expect(screen.getByText("Terceira")).toBeInTheDocument());
    expect(ultimo()).toEqual({ situacao: "02", limit: 20, offset: 2 });
    expect(screen.getByText("Metal Forte")).toBeInTheDocument();       // anexou, não substituiu
  });

  it("sem mais páginas o botão Carregar mais não aparece", async () => {
    respostas[BASE] = () => ({ total: 2, itens: ITENS });
    montar();
    await esperarLinhas();
    expect(screen.queryByRole("button", { name: /Carregar mais/ })).toBeNull();
  });

  it("Acompanhar chama onAcompanhar com o item inteiro", async () => {
    const onAcompanhar = vi.fn();
    montar({ onAcompanhar });
    await esperarLinhas();
    fireEvent.click(screen.getByRole("button", { name: "Acompanhar Metal Forte" }));
    expect(onAcompanhar).toHaveBeenCalledWith(ITENS[0]);
  });

  it("sem canCriar não há botão Acompanhar", async () => {
    montar({ canCriar: false });
    await esperarLinhas();
    expect(screen.queryByRole("button", { name: /^Acompanhar/ })).toBeNull();
  });

  it("refreshKey recarrega a primeira página", async () => {
    const { rerender } = render(<DescobrirRfb onAcompanhar={vi.fn()} canCriar refreshKey={0} />);
    await esperarLinhas();
    const antes = params(BASE).length;
    rerender(<DescobrirRfb onAcompanhar={vi.fn()} canCriar refreshKey={1} />);
    await waitFor(() => expect(params(BASE).length).toBe(antes + 1));
    expect(ultimo()).toEqual({ situacao: "02", limit: 20, offset: 0 });
  });

  it("estado vazio distingue 'sem filtro' de 'filtro sem resultado'", async () => {
    respostas[BASE] = () => ({ total: 0, itens: [] });
    montar();
    await waitFor(() => expect(screen.getByText(/já estão acompanhadas — ou a base ainda não foi coletada/)).toBeInTheDocument());
    fireEvent.change(screen.getByRole("combobox", { name: "Porte" }), { target: { value: "05" } });
    await waitFor(() => expect(screen.getByText("Nenhuma empresa da base RFB corresponde aos filtros.")).toBeInTheDocument());
  });

  it("erro de carga é avisado", async () => {
    respostas[BASE] = () => Promise.reject(new Error("500"));
    montar();
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Não foi possível carregar a base RFB."));
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run (de `frontend-observatorio/`): `npx vitest run src/pages/desenvolvimento-economico/DescobrirRfb.test.jsx`
Expected: falha ao resolver `./DescobrirRfb`.

- [ ] **Step 3: Implementar o componente**

Criar `DescobrirRfb.jsx`:

```jsx
import { useEffect, useRef, useState } from "react";
import api from "../../services/api";
import NidSelect from "../../components/nid/NidSelect";

// Aba "Descobrir na base RFB": empresas do município ainda não acompanhadas,
// por score RFB decrescente (0–45: porte, tempo, capital, situação), com
// filtros no servidor e paginação por "Carregar mais".
const BASE = "/desenvolvimento-economico/retencao/descobrir";
const POR_PAGINA = 20;
const SITUACOES = [
  { value: "02", label: "Ativas" }, { value: "03", label: "Suspensas" }, { value: "04", label: "Inaptas" },
  { value: "08", label: "Baixadas" }, { value: "01", label: "Nulas" }, { value: "todas", label: "Todas" },
];
const PORTES = [
  { value: "", label: "Todos os portes" }, { value: "01", label: "Micro" }, { value: "03", label: "Pequena" },
  { value: "05", label: "Média" }, { value: "07", label: "Grande" }, { value: "00", label: "Não informado" },
];
const PORTE_RFB = { "00": "Não informado", "01": "Micro", "03": "Pequena", "05": "Média", "07": "Grande" };
const SITUACAO_RFB = { "01": "Nula", "02": "Ativa", "03": "Suspensa", "04": "Inapta", "08": "Baixada" };
const ERRO_CARGA = "Não foi possível carregar a base RFB.";

function fmtBRL(v) {
  if (v == null) return "—";
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}
const fmtInt = (n) => Number(n || 0).toLocaleString("pt-BR");
function corSituacao(s) {
  if (s === "08" || s === "01") return "var(--accent-2)";
  if (s === "03" || s === "04") return "var(--accent-4)";
  return undefined;
}

export default function DescobrirRfb({ onAcompanhar, canCriar, refreshKey = 0 }) {
  const [situacao, setSituacao] = useState("02");
  const [porte, setPorte] = useState("");
  const [divisao, setDivisao] = useState("");
  const [busca, setBusca] = useState("");
  const [q, setQ] = useState("");                 // busca com debounce; "" = sem filtro
  const [divisoes, setDivisoes] = useState([]);
  const [itens, setItens] = useState([]);
  const [total, setTotal] = useState(0);
  const [carregando, setCarregando] = useState(true);
  const [carregandoMais, setCarregandoMais] = useState(false);
  const [erro, setErro] = useState(null);
  // Versão da primeira página: um "Carregar mais" em voo não anexa em cima
  // de outro filtro.
  const versaoRef = useRef(0);

  // Divisões CNAE presentes no município (uma vez por montagem / recarga).
  useEffect(() => {
    let vivo = true;
    api.get(`${BASE}/divisoes`)
      .then((res) => { if (vivo) setDivisoes(Array.isArray(res.data) ? res.data : []); })
      .catch(() => { if (vivo) setDivisoes([]); });
    return () => { vivo = false; };
  }, [refreshKey]);

  // Debounce da busca: só envia com 2+ caracteres.
  useEffect(() => {
    const t = setTimeout(() => {
      const termo = busca.trim();
      setQ(termo.length >= 2 ? termo : "");
    }, 300);
    return () => clearTimeout(t);
  }, [busca]);

  const params = (offset) => ({
    situacao,
    ...(porte ? { porte } : {}),
    ...(divisao ? { divisao } : {}),
    ...(q ? { q } : {}),
    limit: POR_PAGINA,
    offset,
  });

  // Primeira página a cada mudança de filtro ou refreshKey; resposta superada
  // (filtro mudou antes de ela chegar) é ignorada pelo cleanup.
  useEffect(() => {
    let vivo = true;
    versaoRef.current += 1;
    setCarregando(true);
    setErro(null);
    api.get(BASE, { params: params(0) })
      .then((res) => {
        if (!vivo) return;
        setItens(res.data?.itens ?? []);
        setTotal(res.data?.total ?? 0);
      })
      .catch(() => { if (vivo) setErro(ERRO_CARGA); })
      .finally(() => { if (vivo) setCarregando(false); });
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [situacao, porte, divisao, q, refreshKey]);

  async function carregarMais() {
    const versao = versaoRef.current;
    setCarregandoMais(true);
    try {
      const res = await api.get(BASE, { params: params(itens.length) });
      if (versao !== versaoRef.current) return;
      setItens((prev) => [...prev, ...(res.data?.itens ?? [])]);
      setTotal(res.data?.total ?? total);
    } catch {
      if (versao === versaoRef.current) setErro(ERRO_CARGA);
    } finally {
      setCarregandoMais(false);
    }
  }

  const semFiltro = situacao === "02" && !porte && !divisao && !q;
  const inputCls = "px-3 py-1.5 rounded-xl border border-[var(--border)] text-sm bg-[var(--panel)] text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-1)] min-w-[220px]";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <NidSelect value={situacao} onChange={(e) => setSituacao(e.target.value)} ariaLabel="Situação cadastral">
          {SITUACOES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </NidSelect>
        <NidSelect value={porte} onChange={(e) => setPorte(e.target.value)} ariaLabel="Porte">
          {PORTES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
        </NidSelect>
        <NidSelect value={divisao} onChange={(e) => setDivisao(e.target.value)} ariaLabel="Divisão CNAE">
          <option value="">Todas as divisões CNAE</option>
          {divisoes.map((d) => (
            <option key={d.divisao} value={d.divisao}>{d.descricao} · {fmtInt(d.total)}</option>
          ))}
        </NidSelect>
        <input
          aria-label="Buscar na base RFB"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por nome ou CNPJ…"
          className={inputCls}
        />
      </div>

      <div>
        <p className="text-sm text-[var(--text)]">{fmtInt(total)} empresas na base RFB ainda não acompanhadas</p>
        <p className="text-xs text-slate-400">
          Score RFB de 0 a 45: porte, tempo de atividade, capital e situação — os pontos de empregos e potencial
          entram quando a empresa é acompanhada.
        </p>
      </div>

      {erro && <p role="alert" className="text-sm" style={{ color: "var(--accent-2)" }}>{erro}</p>}
      {carregando && !erro && <p role="status" className="text-sm text-slate-400">Carregando…</p>}

      {!carregando && !erro && itens.length === 0 && (
        <p className="text-sm text-slate-400 py-8 text-center">
          {semFiltro
            ? "Todas as empresas da base RFB deste município já estão acompanhadas — ou a base ainda não foi coletada."
            : "Nenhuma empresa da base RFB corresponde aos filtros."}
        </p>
      )}

      {!carregando && itens.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-slate-400 uppercase tracking-wider">
                <th className="px-3 py-2">Empresa</th>
                <th className="px-3 py-2">Divisão CNAE</th>
                <th className="px-3 py-2">Porte</th>
                <th className="px-3 py-2">Desde</th>
                <th className="px-3 py-2">Capital</th>
                <th className="px-3 py-2">Situação</th>
                <th className="px-3 py-2 text-right">Score</th>
                {canCriar && <th className="px-3 py-2" aria-label="Ações" />}
              </tr>
            </thead>
            <tbody>
              {itens.map((e) => (
                <tr key={e.cnpj_basico} className="border-t border-[var(--border)]">
                  <td className="px-3 py-2">
                    <span className="font-medium text-[var(--text)]">{e.razao_social}</span>
                    {e.nome_fantasia && <span className="text-slate-400"> · {e.nome_fantasia}</span>}
                  </td>
                  <td className="px-3 py-2 text-[var(--text-dim)]">{e.divisao_descricao || "—"}</td>
                  <td className="px-3 py-2 text-[var(--text-dim)]">{PORTE_RFB[e.porte] || "—"}</td>
                  <td className="px-3 py-2 text-[var(--text-dim)]">{e.data_inicio ? e.data_inicio.slice(0, 4) : "—"}</td>
                  <td className="px-3 py-2 text-[var(--text-dim)]">{fmtBRL(e.capital_social)}</td>
                  <td className="px-3 py-2" style={{ color: corSituacao(e.situacao) }}>{SITUACAO_RFB[e.situacao] || e.situacao || "—"}</td>
                  <td className="px-3 py-2 text-right font-bold text-[var(--text)] tabular-nums" title="porte + tempo + capital, ajustado pela situação">{e.score}</td>
                  {canCriar && (
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => onAcompanhar(e)}
                        aria-label={`Acompanhar ${e.razao_social}`}
                        className="text-xs text-blue-600 hover:text-blue-700 font-medium cursor-pointer"
                      >
                        Acompanhar
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!carregando && itens.length < total && (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={carregarMais}
            disabled={carregandoMais}
            className="px-4 py-2 rounded-lg border border-[var(--border)] text-sm text-[var(--text-dim)] hover:bg-[var(--panel-2)] disabled:opacity-50 cursor-pointer"
          >
            {carregandoMais ? "Carregando…" : `Carregar mais (${fmtInt(itens.length)} de ${fmtInt(total)})`}
          </button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/pages/desenvolvimento-economico/DescobrirRfb.test.jsx`
Expected: 9 passed.

- [ ] **Step 5: CRLF nos dois arquivos e commit**

```bash
git add frontend-observatorio/src/pages/desenvolvimento-economico/DescobrirRfb.jsx frontend-observatorio/src/pages/desenvolvimento-economico/DescobrirRfb.test.jsx
git commit -F <msg>   # "feat(gestao-empresarial): componente DescobrirRfb (ranking paginado da base RFB com filtros)"
```

---

### Task 5: Abas na `GestaoEmpresarialTab` + Acompanhar preenchido

**Files:**
- Modify: `frontend-observatorio/src/pages/desenvolvimento-economico/GestaoEmpresarialTab.jsx` (imports 17–21; estado após `deleteConfirmId`; `openCreate` ~184; `handleSubmit` ~227; JSX após `{header}` ~291 e antes de `{/* Detail drawer */}` ~415)
- Test: `frontend-observatorio/src/pages/desenvolvimento-economico/GestaoEmpresarialTab.test.jsx` (acrescentar um `describe`; os 9 testes existentes ficam)

**Interfaces:**
- Consumes (Task 4): `DescobrirRfb({ onAcompanhar, canCriar, refreshKey })`; `NidTabBar` (`tabs` strings, `value` índice, `onChange(índice)`, `ariaLabel`); `PlanGate` (`planKey`); `canAccess` já vem de `useContext(PlanContext)` neste arquivo.
- Produces: nada.

- [ ] **Step 1: Escrever os testes (falhando)**

Em `GestaoEmpresarialTab.test.jsx`: acrescentar `import { PlanContext } from "../../context/PlanContext";` após `import api from "../../services/api";` e, ao fim do arquivo:

```jsx
describe("GestaoEmpresarialTab — aba Descobrir na base RFB", () => {
  const ITEM = { cnpj_basico: "11111111", razao_social: "Metal Forte", nome_fantasia: null, situacao: "02", porte: "05",
    cnae_fiscal: "2511000", divisao: "25", divisao_descricao: "Fabricação de produtos de metal",
    capital_social: 5000000, data_inicio: "2000-01-05", score: 43 };
  const chamadas = (sufixo) => api.get.mock.calls.filter(([u]) => u.endsWith(sufixo)).length;

  beforeEach(() => {
    authState.user = { role: "GESTOR", municipio_id: 1, permissoes: { retencao: ["criar", "editar"] } };
    api.get.mockImplementation((url) => Promise.resolve({
      data: url.endsWith("/retencao") ? LISTA
        : url.endsWith("/descobrir/divisoes") ? [{ divisao: "25", descricao: "Fabricação de produtos de metal", total: 1 }]
        : url.endsWith("/descobrir") ? { total: 1, itens: [ITEM] }
        : {},
    }));
    api.post = vi.fn(() => Promise.resolve({ data: {} }));
  });

  it("Acompanhadas por padrão; a aba Descobrir carrega a base RFB e esconde os cards", async () => {
    montar();
    await waitFor(() => expect(screen.getByText("ACME")).toBeInTheDocument());
    expect(chamadas("/descobrir")).toBe(0);
    fireEvent.click(screen.getByRole("tab", { name: "Descobrir na base RFB" }));
    await waitFor(() => expect(screen.getByText("Metal Forte")).toBeInTheDocument());
    expect(screen.queryByText("ACME")).toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: "Acompanhadas" }));
    expect(screen.getByText("ACME")).toBeInTheDocument();
  });

  it("Acompanhar abre Nova Empresa preenchido e vinculado; salvar recarrega a lista e a descoberta", async () => {
    montar();
    await waitFor(() => expect(screen.getByText("ACME")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("tab", { name: "Descobrir na base RFB" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Acompanhar Metal Forte" })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Acompanhar Metal Forte" }));
    expect(screen.getByRole("heading", { name: "Nova Empresa" })).toBeInTheDocument();
    expect(screen.getByDisplayValue("Metal Forte")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Fabricação de produtos de metal")).toBeInTheDocument();
    expect(screen.getByText(/Vinculada · 11111111/)).toBeInTheDocument();

    const listasAntes = chamadas("/retencao");
    const descobertasAntes = chamadas("/descobrir");
    fireEvent.click(screen.getByRole("button", { name: "Adicionar" }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      "/desenvolvimento-economico/retencao",
      expect.objectContaining({ nome: "Metal Forte", cnpj_basico: "11111111", setor: "Fabricação de produtos de metal" }),
    ));
    await waitFor(() => expect(chamadas("/retencao")).toBe(listasAntes + 1));
    await waitFor(() => expect(chamadas("/descobrir")).toBe(descobertasAntes + 1));
  });

  it("sem o plano empresas a aba Descobrir mostra o cadeado e não chama a API", async () => {
    render(
      <PlanContext.Provider value={{ modulos: [], canAccess: (k) => k !== "empresas" }}>
        <MemoryRouter><GestaoEmpresarialTab /></MemoryRouter>
      </PlanContext.Provider>
    );
    await waitFor(() => expect(screen.getByText("ACME")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("tab", { name: "Descobrir na base RFB" }));
    expect(screen.getByText("Disponível apenas no plano pago")).toBeInTheDocument();
    expect(chamadas("/descobrir")).toBe(0);
    expect(chamadas("/descobrir/divisoes")).toBe(0);
  });
});
```

(`LISTA` é a constante já definida no topo do arquivo pelos testes da sub-frente A.)

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/pages/desenvolvimento-economico/GestaoEmpresarialTab.test.jsx`
Expected: os 3 novos falham (`Unable to find role="tab"`); os 9 antigos passam.

- [ ] **Step 3: Implementar na aba**

1. Imports — após `import NidSelect from "../../components/nid/NidSelect";` acrescentar:

```jsx
import NidTabBar from "../../components/nid/NidTabBar";
import PlanGate from "../../components/PlanGate";
import DescobrirRfb from "./DescobrirRfb";
```

2. Estado — após `const [deleteConfirmId, setDeleteConfirmId] = useState(null);`:

```jsx
  // Abas: 0 = Acompanhadas (o que existe), 1 = Descobrir na base RFB.
  const [aba, setAba] = useState(0);
  // Incrementado ao salvar um cadastro: a empresa some do ranking da descoberta.
  const [refreshDescoberta, setRefreshDescoberta] = useState(0);
```

3. `openCreate` — substituir a função inteira por:

```jsx
  // `prefill` vem do "Acompanhar" da descoberta: nome, vínculo RFB e setor
  // (divisão CNAE) já preenchidos; o gestor completa o resto antes de salvar.
  function openCreate(prefill = null) {
    setEditingId(null);
    setForm(prefill ? { ...defaultForm, ...prefill } : defaultForm);
    setFormError(null);
    setShowForm(true);
  }
```
e trocar `onClick={openCreate}` do botão "Nova Empresa" por `onClick={() => openCreate()}` (senão o evento de clique viraria `prefill`).

4. `handleSubmit` — trocar

```jsx
      closeForm();
      await load();
```
por
```jsx
      closeForm();
      await load();
      setRefreshDescoberta((n) => n + 1);
```

5. JSX — no `return` principal, entre a linha `      {header}` e a linha `      {/* KPI row */}` (é a única ocorrência de `{header}` seguida do comentário KPI row), inserir:

```jsx
      <NidTabBar
        tabs={["Acompanhadas", "Descobrir na base RFB"]}
        value={aba}
        onChange={setAba}
        ariaLabel="Seções da Gestão Empresarial"
      />

      {aba === 1 && (
        <PlanGate planKey="empresas">
          {canAccess("empresas") ? (
            <DescobrirRfb
              canCriar={canCriar}
              refreshKey={refreshDescoberta}
              onAcompanhar={(e) => openCreate({
                nome: e.razao_social,
                cnpj_basico: e.cnpj_basico,
                setor: e.divisao_descricao || "",
              })}
            />
          ) : (
            // Sem o plano, nada é montado (nem chamada à API); o cadeado do
            // PlanGate aparece sobre este espaço.
            <div className="h-40" aria-hidden="true" />
          )}
        </PlanGate>
      )}

      {aba === 0 && (<>
```
e, substituindo o trecho
```jsx
        </div>
      )}

      {/* Detail drawer */}
```
por
```jsx
        </div>
      )}
      </>)}

      {/* Detail drawer */}
```
(O bloco KPI row → Toolbar → Company cards fica dentro do fragmento sem reindentação, para o diff ficar legível; drawer, modal de exclusão e formulário continuam fora das abas.)

- [ ] **Step 4: Rodar e ver passar; suíte inteira do front**

Run: `npx vitest run src/pages/desenvolvimento-economico/GestaoEmpresarialTab.test.jsx`
Expected: 12 passed.
Run: `npx vitest run` → `447 passed` (435 + 9 + 3).

- [ ] **Step 5: Commit**

```bash
git add frontend-observatorio/src/pages/desenvolvimento-economico/GestaoEmpresarialTab.jsx frontend-observatorio/src/pages/desenvolvimento-economico/GestaoEmpresarialTab.test.jsx
git commit -F <msg>   # "feat(gestao-empresarial): abas Acompanhadas / Descobrir na base RFB e Acompanhar com formulario preenchido"
```

---

### Task 6: Fechamento — suítes completas e notas de deploy

**Files:** nenhum novo.

- [ ] **Step 1: Suítes completas**

Run (raiz): `venv/Scripts/python -m pytest backend/tests -p no:warnings` → esperado `599 passed`.
Run (`frontend-observatorio/`): `npx vitest run` → esperado `447 passed`.

- [ ] **Step 2: Anotar para o relato final (não é código)**

- Sem migração; deploy api + front juntos (o front novo chama dois endpoints novos; contra api velha a aba Descobrir mostra o alerta "Não foi possível carregar a base RFB" e o resto segue funcionando).
- `hoje_local()` muda a data de referência dos sinais de risco entre 21h e 0h em Brasília (antes: dia seguinte, em UTC).
- Checklist visual: abas Acompanhadas / Descobrir; ranking com score, filtros e "Carregar mais"; Acompanhar → formulário com nome, setor e chip "Vinculada"; salvar → linha some do ranking e card aparece; município sem coleta CNPJ (Conceição do Pará, Igaratinga, Carmo do Cajuru) mostra o estado vazio explícito; ADMIN_GLOBAL em view-as vê o ranking sem "Acompanhar".
