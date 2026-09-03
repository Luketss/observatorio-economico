# Gestão Empresarial — Agenda do gestor (sub-frente C) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Uma aba "Agenda" na Gestão Empresarial com KPIs e seis blocos (ações vencidas, próximas N dias, sem data, demandas abertas com dias em aberto e "status desde", sem contato 90 d+, contatos e visitas recentes), alimentada por `GET /retencao/agenda` que reaproveita os sinais de risco; e um histórico de mudanças de status das demandas (tabela nova, migração 0041) gravado no backend e visível no drawer.

**Architecture:** Backend primeiro: modelo `DemandaStatusHistorico` + migração `0041` → gravação no POST/PUT de demandas e `historico` no `DemandaEmpresaOut` → serviço puro `agenda(db, cadastros, hoje, dias)` em `gestao_empresarial.py` (usa `enriquecer` para vencidas/sem contato e consultas em lote para demandas e contatos) → endpoint `GET /retencao/agenda?dias=7|14|30` declarado antes de `/retencao/{empresa_id}`. Front depois: componente novo `AgendaTab.jsx`, terceira aba na `GestaoEmpresarialTab` com `abrirPorId`, e "desde"/"ver histórico" na aba Demandas do drawer.

**Tech Stack:** FastAPI + SQLAlchemy 2 + Alembic + Pydantic v2 (backend; testes pytest com handlers chamados direto e fixture SQLite em memória); React 19 + Vitest/jsdom + Testing Library (front).

**Spec:** `docs/superpowers/specs/2026-09-03-gestao-empresarial-agenda-design.md`

## Global Constraints

- **Migração `0041_demanda_status_historico`** (`down_revision = '0040_cidade_inteligente'`), tabela `demanda_status_historico` com as colunas exatas da spec §1.1 (`id`, `demanda_id` FK CASCADE, `municipio_id`, `de` nullable, `para`, `alterado_por` FK SET NULL, `alterado_em` tz). Roda no deploy da api; worker não é afetado.
- **Gravação do histórico:** linha inicial (`de=None, para=status`) no POST; no PUT só quando `status` veio no payload **e** é diferente do atual; nada é gravado ao editar descrição/responsável. Sempre no mesmo commit da demanda.
- **`DemandaEmpresaOut.historico: List[DemandaStatusOut]`** com `{de, para, alterado_em, alterado_por_nome}`; detalhe carrega `demandas.historico.usuario` com `selectinload` (sem N+1).
- **Agenda:** `dias ∈ (7, 14, 30)` (outro → 422 no handler); tenant igual a `listar_retencao` (não-global → próprio município; global com `municipio_id`; global sem → agenda vazia sem consultar); `hoje = hoje_local()` passado pelo router. Regras exatas da spec §2.2/§2.3: vencidas e sem contato vêm dos sinais `proxima_acao_vencida`/`sem_contato_90d` de `enriquecer`; próximas = `hoje <= data <= hoje + dias` (`dias 0` = hoje); sem data = texto sem data; demandas não resolvidas com `dias_em_aberto`, `status_desde` (último histórico ou `data_registro`) e `sinal_30d = data_registro <= hoje − DIAS_DEMANDA_ABERTA`; contatos e visitas dos últimos `DIAS_CONTATOS_RECENTES = 30`, mesclados, limite 50. Lista de cadastros vazia → agenda vazia sem consultar.
- **Rotas estáticas `/retencao/agenda` ANTES de `/retencao/{empresa_id}`** (teste de ordem já existe para `descobrir`; estende-se).
- **Front:** aba "Agenda" sem PlanGate; cada item é um botão que abre o drawer via `onAbrirEmpresa(empresa_id)`; seletor 7 · 14 · 30 com `role="tablist"`/`aria-selected`; estados carregando (`role="status"`), erro (`role="alert"` "Não foi possível carregar a agenda."), vazio por bloco e aviso geral; respostas superadas ignoradas. Drawer: "desde dd/mm/aaaa" e "ver histórico" (`aria-expanded`).
- **Chaves e rótulos exatos:** status `aberta | em_andamento | resolvida` (rótulos "Aberta", "Em andamento", "Resolvida"); tipos de contato `reuniao | ligacao | email | visita_tecnica | outro` (rótulos "Reunião", "Ligação", "E-mail", "Visita técnica", "Outro"); visita = "Visita".
- **Gates de teste:** backend `venv/Scripts/python -m pytest backend/tests -p no:warnings` da raiz (baseline **599**; NÃO acrescentar `-q`); frontend `npx vitest run` de `frontend-observatorio/` (baseline **449**). Os dois verdes ao fim de cada task.
- Lint do repo JÁ FALHA (não é gate): arquivos novos limpos; modificados sem erro NOVO.
- **Working copy é CRLF** (`core.autocrlf=true`): arquivos novos gravados e normalizados para CRLF (`venv/Scripts/python -c "p='<arquivo>';b=open(p,'rb').read().replace(b'\r\n',b'\n').replace(b'\n',b'\r\n');open(p,'wb').write(b)"`); edições via Edit tool; **não** usar heredoc bash com JSX/Python.
- Copy pt-BR. Commits convencionais com subject **sem acentos** e trailers `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>` e `Claude-Session: https://claude.ai/code/session_01D1oaq9U7h3wirgFgCef7sv` (mensagem via `git commit -F <arquivo>`). Stage só os arquivos da task (`.claude/settings.local.json`, `dados/` e `docs/superpowers/plans/2026-05-06-ips-feature.md` são alterações locais alheias).
- Branch de trabalho: `feat/gestao-empresarial-agenda` a partir de `main` (merge ff local ao final; push é do usuário).

---

### Task 1: Modelo `DemandaStatusHistorico` + migração `0041`

**Files:**
- Modify: `backend/app/models/desenvolvimento_economico.py` (classe nova após `DemandaEmpresa`, antes de `class CaptacaoRecurso` ~linha 154; relationship `historico` em `DemandaEmpresa` ~linha 149)
- Create: `backend/alembic/versions/0041_demanda_status_historico.py`
- Test: `backend/tests/test_gestao_empresarial_models.py` (fixture ganha a tabela; 2 testes novos)

**Interfaces:**
- Produces (Tasks 2–3 dependem): `DemandaStatusHistorico(id, demanda_id, municipio_id, de, para, alterado_por, alterado_em)` com `demanda` e `usuario` relationships e a property `alterado_por_nome`; `DemandaEmpresa.historico` (lista ordenada por `alterado_em`, cascade delete-orphan).

- [ ] **Step 1: Escrever os testes (falhando)**

Em `backend/tests/test_gestao_empresarial_models.py`: acrescentar `from datetime import date, datetime, timezone` após `import pytest`; acrescentar `DemandaStatusHistorico,` ao import de `app.models.desenvolvimento_economico` (ordem alfabética: após `DemandaEmpresa,`); acrescentar `DemandaStatusHistorico.__table__,` à lista `tables=[...]` da fixture (após `DemandaEmpresa.__table__,`). Acrescentar ao fim:

```python
def test_historico_de_status_ordena_por_data_e_apaga_em_cascata(db):
    e = db.query(EmpresaRetencao).one()
    d = DemandaEmpresa(empresa_id=e.id, municipio_id=e.municipio_id, descricao="Via", data_registro=date(2026, 8, 1))
    db.add(d)
    db.flush()
    db.add_all([
        DemandaStatusHistorico(demanda_id=d.id, municipio_id=e.municipio_id, de="aberta", para="em_andamento",
                               alterado_em=datetime(2026, 8, 10, 12, tzinfo=timezone.utc)),
        DemandaStatusHistorico(demanda_id=d.id, municipio_id=e.municipio_id, de=None, para="aberta",
                               alterado_em=datetime(2026, 8, 1, 12, tzinfo=timezone.utc)),
    ])
    db.commit()
    db.refresh(d)
    assert [(h.de, h.para) for h in d.historico] == [(None, "aberta"), ("aberta", "em_andamento")]
    assert d.historico[0].alterado_por_nome is None  # sem usuário
    db.delete(d)
    db.commit()
    assert db.query(DemandaStatusHistorico).count() == 0


def test_migracao_0041_encadeia_no_head_anterior():
    from pathlib import Path
    arquivo = Path(__file__).resolve().parents[1] / "alembic" / "versions" / "0041_demanda_status_historico.py"
    texto = arquivo.read_text(encoding="utf-8")
    assert "revision = '0041_demanda_status_historico'" in texto
    assert "down_revision = '0040_cidade_inteligente'" in texto
    assert "op.create_table('demanda_status_historico'" in texto
    assert "['demanda_empresa.id'], ondelete='CASCADE'" in texto
    assert "['usuarios.id'], ondelete='SET NULL'" in texto
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `venv/Scripts/python -m pytest backend/tests/test_gestao_empresarial_models.py -p no:warnings`
Expected: `ImportError: cannot import name 'DemandaStatusHistorico'`.

- [ ] **Step 3: Modelo**

Em `backend/app/models/desenvolvimento_economico.py`, dentro de `DemandaEmpresa`, após `    empresa = relationship("EmpresaRetencao", back_populates="demandas")`:

```python
    historico = relationship(
        "DemandaStatusHistorico",
        back_populates="demanda",
        cascade="all, delete-orphan",
        order_by="DemandaStatusHistorico.alterado_em",
    )
```

E, logo após a classe `DemandaEmpresa` (antes do comentário/classe `CaptacaoRecurso`):

```python
class DemandaStatusHistorico(Base):
    """Transições de status de uma demanda (Gestão Empresarial, sub-frente C).

    Uma linha na criação (`de` nulo, `para` = status inicial) e uma a cada
    mudança de status. Apagar a demanda apaga o histórico (CASCADE); apagar o
    usuário mantém a linha (SET NULL)."""
    __tablename__ = "demanda_status_historico"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    demanda_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("demanda_empresa.id", ondelete="CASCADE"), nullable=False, index=True
    )
    municipio_id: Mapped[int] = mapped_column(Integer, ForeignKey("municipios.id"), nullable=False, index=True)
    de: Mapped[str | None] = mapped_column(String(20), nullable=True)
    para: Mapped[str] = mapped_column(String(20), nullable=False)
    alterado_por: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("usuarios.id", ondelete="SET NULL"), nullable=True
    )
    alterado_em: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc)
    )

    demanda = relationship("DemandaEmpresa", back_populates="historico")
    usuario = relationship("Usuario")

    @property
    def alterado_por_nome(self) -> str | None:
        return self.usuario.nome if self.usuario is not None else None
```

- [ ] **Step 4: Migração**

Criar `backend/alembic/versions/0041_demanda_status_historico.py`:

```python
"""demanda_status_historico: transicoes de status das demandas (Gestao Empresarial)

Revision ID: 0041_demanda_status_historico
Revises: 0040_cidade_inteligente
Create Date: 2026-09-03

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '0041_demanda_status_historico'
down_revision = '0040_cidade_inteligente'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table('demanda_status_historico',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('demanda_id', sa.Integer(), nullable=False),
    sa.Column('municipio_id', sa.Integer(), nullable=False),
    sa.Column('de', sa.String(length=20), nullable=True),
    sa.Column('para', sa.String(length=20), nullable=False),
    sa.Column('alterado_por', sa.Integer(), nullable=True),
    sa.Column('alterado_em', sa.DateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['alterado_por'], ['usuarios.id'], ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['demanda_id'], ['demanda_empresa.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['municipio_id'], ['municipios.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_demanda_status_historico_demanda_id'), 'demanda_status_historico', ['demanda_id'], unique=False)
    op.create_index(op.f('ix_demanda_status_historico_id'), 'demanda_status_historico', ['id'], unique=False)
    op.create_index(op.f('ix_demanda_status_historico_municipio_id'), 'demanda_status_historico', ['municipio_id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_demanda_status_historico_municipio_id'), table_name='demanda_status_historico')
    op.drop_index(op.f('ix_demanda_status_historico_id'), table_name='demanda_status_historico')
    op.drop_index(op.f('ix_demanda_status_historico_demanda_id'), table_name='demanda_status_historico')
    op.drop_table('demanda_status_historico')
```

- [ ] **Step 5: Rodar e ver passar; head do alembic; suíte**

Run: `venv/Scripts/python -m pytest backend/tests/test_gestao_empresarial_models.py -p no:warnings` → todos passam.
Run (de `backend/`): `../venv/Scripts/alembic heads` → `0041_demanda_status_historico (head)` (único head).
Run (raiz): `venv/Scripts/python -m pytest backend/tests -p no:warnings` → `601 passed`.

- [ ] **Step 6: CRLF na migração e commit**

```bash
git add backend/app/models/desenvolvimento_economico.py backend/alembic/versions/0041_demanda_status_historico.py backend/tests/test_gestao_empresarial_models.py
git commit -F <msg>   # "feat(gestao-empresarial): modelo e migracao 0041 do historico de status das demandas"
```

---

### Task 2: Gravação do histórico no POST/PUT e `historico` na leitura

**Files:**
- Modify: `backend/app/schemas/desenvolvimento_economico.py` (schema novo antes de `DemandaEmpresaOut` ~linha 125; campo em `DemandaEmpresaOut`)
- Modify: `backend/app/api/v1/routers/desenvolvimento_economico.py` (import do modelo; helper; `adicionar_demanda` ~452; `atualizar_demanda` ~476; `selectinload` do detalhe ~267)
- Test: `backend/tests/test_gestao_empresarial_endpoints.py` (fixture ganha a tabela; 4 testes)

**Interfaces:**
- Consumes (Task 1): `DemandaStatusHistorico`, `DemandaEmpresa.historico`, `alterado_por_nome`.
- Produces (Task 7 depende do JSON): `DemandaEmpresaOut.historico: [{de, para, alterado_em, alterado_por_nome}]` no detalhe e nas respostas de POST/PUT de demanda.

- [ ] **Step 1: Escrever os testes (falhando)**

Em `test_gestao_empresarial_endpoints.py`: acrescentar `DemandaStatusHistorico,` ao import de modelos (após `DemandaEmpresa,`) e `DemandaStatusHistorico.__table__,` à lista `tables=[...]` da fixture `ctx` (após `DemandaEmpresa.__table__,`). Acrescentar ao fim:

```python
# ── histórico de status das demandas (sub-frente C) ─────────────────────────

def test_post_demanda_grava_linha_inicial_do_historico(ctx):
    from app.api.v1.routers.desenvolvimento_economico import adicionar_demanda
    db, _, u1, *_ = ctx
    e = _criar_empresa(db, u1)
    d = adicionar_demanda(e.id, DemandaEmpresaCreate(descricao="Via", data_registro=date(2026, 8, 1)),
                          db=db, current_user=u1)
    assert [(h.de, h.para, h.alterado_por) for h in d.historico] == [(None, "aberta", u1.id)]
    assert d.historico[0].alterado_por_nome == "U1"


def test_put_grava_transicao_so_quando_o_status_muda(ctx):
    from app.api.v1.routers.desenvolvimento_economico import adicionar_demanda, atualizar_demanda
    db, _, u1, *_ = ctx
    e = _criar_empresa(db, u1)
    d = adicionar_demanda(e.id, DemandaEmpresaCreate(descricao="Via", data_registro=date(2026, 8, 1)),
                          db=db, current_user=u1)
    atualizar_demanda(d.id, DemandaEmpresaUpdate(descricao="Via pública"), db=db, current_user=u1)   # só descrição
    atualizar_demanda(d.id, DemandaEmpresaUpdate(status="aberta"), db=db, current_user=u1)           # mesmo status
    upd = atualizar_demanda(d.id, DemandaEmpresaUpdate(status="em_andamento"), db=db, current_user=u1)
    assert [(h.de, h.para) for h in upd.historico] == [(None, "aberta"), ("aberta", "em_andamento")]
    assert upd.historico[-1].alterado_por == u1.id
    assert db.query(DemandaStatusHistorico).filter_by(demanda_id=d.id).count() == 2


def test_detalhe_traz_historico_das_demandas_com_nome_do_usuario(ctx):
    from app.api.v1.routers.desenvolvimento_economico import adicionar_demanda, atualizar_demanda, detalhe_retencao
    db, _, u1, *_ = ctx
    e = _criar_empresa(db, u1)
    d = adicionar_demanda(e.id, DemandaEmpresaCreate(descricao="Via", data_registro=date(2026, 8, 1)),
                          db=db, current_user=u1)
    atualizar_demanda(d.id, DemandaEmpresaUpdate(status="resolvida"), db=db, current_user=u1)
    det = detalhe_retencao(e.id, db=db, current_user=u1)
    hist = det.demandas[0].historico
    assert [(h.de, h.para, h.alterado_por_nome) for h in hist] == [(None, "aberta", "U1"), ("aberta", "resolvida", "U1")]
    assert hist[0].alterado_em is not None


def test_demanda_antiga_sem_historico_continua_valida(ctx):
    from app.api.v1.routers.desenvolvimento_economico import detalhe_retencao
    db, _, u1, *_ = ctx
    e = _criar_empresa(db, u1)
    db.add(DemandaEmpresa(empresa_id=e.id, municipio_id=e.municipio_id, descricao="Antiga", data_registro=date(2026, 7, 1)))
    db.commit()
    det = detalhe_retencao(e.id, db=db, current_user=u1)
    assert det.demandas[0].historico == []
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `venv/Scripts/python -m pytest backend/tests/test_gestao_empresarial_endpoints.py -p no:warnings`
Expected: 3 dos 4 novos falham — a relationship `historico` já existe (Task 1), mas nada a grava (`[] == [(None, "aberta", u1.id)]` no primeiro e no segundo) e `DemandaEmpresaOut` ainda não tem o campo (`AttributeError: historico` no terceiro); `test_demanda_antiga_sem_historico_continua_valida` também falha pelo campo ausente. Os antigos passam.

- [ ] **Step 3: Schemas**

Em `backend/app/schemas/desenvolvimento_economico.py`, antes de `class DemandaEmpresaOut(BaseModel):`:

```python
class DemandaStatusOut(BaseModel):
    de: Optional[str] = None
    para: str
    alterado_em: datetime
    alterado_por_nome: Optional[str] = None

    class Config:
        from_attributes = True


```

Em `DemandaEmpresaOut`, após `atualizado_em: datetime`:

```python
    historico: List[DemandaStatusOut] = []
```

- [ ] **Step 4: Router**

Import: acrescentar `DemandaStatusHistorico,` ao bloco `from app.models.desenvolvimento_economico import (...)` (após `DemandaEmpresa,`).

Após `_lean_enriquecido` (antes da seção do Funil), acrescentar:

```python
def _registrar_status_demanda(db: Session, demanda: DemandaEmpresa, de: str | None, para: str,
                              usuario_id: int | None) -> None:
    """Uma linha de histórico por transição (sub-frente C). Não faz commit:
    entra no mesmo commit da demanda."""
    db.add(DemandaStatusHistorico(
        demanda_id=demanda.id, municipio_id=demanda.municipio_id,
        de=de, para=para, alterado_por=usuario_id,
    ))
```

`adicionar_demanda`: trocar

```python
    db.add(demanda)
    db.commit()
    db.refresh(demanda)
    return demanda
```
por
```python
    db.add(demanda)
    db.flush()  # id da demanda para a linha inicial do histórico
    _registrar_status_demanda(db, demanda, None, demanda.status, current_user.id)
    db.commit()
    db.refresh(demanda)
    return demanda
```

`atualizar_demanda`: trocar

```python
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(demanda, field, value)
    db.commit()
    db.refresh(demanda)
    return demanda
```
por
```python
    campos = data.model_dump(exclude_unset=True)
    status_antigo = demanda.status
    for field, value in campos.items():
        setattr(demanda, field, value)
    if "status" in campos and campos["status"] != status_antigo:
        _registrar_status_demanda(db, demanda, status_antigo, campos["status"], current_user.id)
    db.commit()
    db.refresh(demanda)
    return demanda
```

`detalhe_retencao`: trocar `            selectinload(EmpresaRetencao.demandas),` por

```python
            selectinload(EmpresaRetencao.demandas)
            .selectinload(DemandaEmpresa.historico)
            .selectinload(DemandaStatusHistorico.usuario),
```

- [ ] **Step 5: Rodar e ver passar; suíte**

Run: `venv/Scripts/python -m pytest backend/tests/test_gestao_empresarial_endpoints.py -p no:warnings` → todos passam.
Run: `venv/Scripts/python -m pytest backend/tests -p no:warnings` → `605 passed`.

- [ ] **Step 6: Commit**

```bash
git add backend/app/schemas/desenvolvimento_economico.py backend/app/api/v1/routers/desenvolvimento_economico.py backend/tests/test_gestao_empresarial_endpoints.py
git commit -F <msg>   # "feat(gestao-empresarial): historico de status gravado no POST/PUT de demandas e devolvido no detalhe"
```

---

### Task 3: Serviço `agenda` + dataclasses + testes

**Files:**
- Modify: `backend/app/services/gestao_empresarial.py` (imports; seção nova ao final)
- Test: `backend/tests/test_gestao_empresarial_agenda.py`

**Interfaces:**
- Consumes: `enriquecer`, `_como_date`, `DIAS_DEMANDA_ABERTA`, `hoje_local`; modelos `DemandaEmpresa` (+ `historico`), `ContatoEmpresa`, `VisitaRetencao`.
- Produces (Task 4 depende): `JANELAS_AGENDA = (7, 14, 30)`, `DIAS_CONTATOS_RECENTES = 30`, `LIMITE_CONTATOS_RECENTES = 50`; dataclasses `ItemAcao`, `ItemDemanda`, `ItemSemContato`, `ItemContato`, `AgendaKpis`, `Agenda`; `agenda_vazia(hoje, dias) -> Agenda`; `agenda(db, cadastros, hoje=None, dias=7) -> Agenda` (`ValueError` para `dias` fora de `JANELAS_AGENDA`).

- [ ] **Step 1: Escrever os testes (falhando)**

Criar `backend/tests/test_gestao_empresarial_agenda.py`:

```python
"""Agenda do gestor (serviço puro sobre fixture SQLite, `hoje` fixo):
vencidas e sem contato vêm dos sinais; próximas, sem data, demandas e
contatos recentes são calculados aqui."""
from datetime import date, datetime, timedelta, timezone
from unittest.mock import MagicMock

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

import app.models  # noqa: F401
from app.db.base import Base
from app.models.desenvolvimento_economico import (
    ContatoEmpresa, DemandaEmpresa, DemandaStatusHistorico, EmpresaRetencao, VisitaRetencao,
)
from app.models.empresa import Empresa
from app.models.municipio import Municipio
from app.services.gestao_empresarial import JANELAS_AGENDA, agenda, agenda_vazia

HOJE = date(2026, 9, 3)
ANTIGO = datetime(2025, 1, 1, 12, tzinfo=timezone.utc)      # cadastro velho: sem contato dispara
RECENTE = datetime(2026, 8, 25, 12, tzinfo=timezone.utc)    # cadastro novo: sem contato não dispara


@pytest.fixture()
def db():
    engine = create_engine("sqlite://")
    Base.metadata.create_all(engine, tables=[
        Municipio.__table__, Empresa.__table__, EmpresaRetencao.__table__, ContatoEmpresa.__table__,
        VisitaRetencao.__table__, DemandaEmpresa.__table__, DemandaStatusHistorico.__table__,
    ])
    sessao = sessionmaker(bind=engine)()
    m = Municipio(nome="Alfa", estado="MG")
    sessao.add(m)
    sessao.flush()
    sessao.info["mid"] = m.id
    yield sessao
    sessao.close()


def _emp(db, nome, criado_em=RECENTE, **kw):
    e = EmpresaRetencao(municipio_id=db.info["mid"], nome=nome, criado_em=criado_em, **kw)
    db.add(e)
    db.flush()
    return e


def _todas(db):
    return db.query(EmpresaRetencao).all()


def test_vencidas_vem_do_sinal_com_dias_de_atraso_e_ordem(db):
    _emp(db, "A", proxima_acao="Ligar", proxima_acao_data=HOJE - timedelta(days=4), responsavel="Ana")
    _emp(db, "B", proxima_acao="Visitar", proxima_acao_data=HOJE - timedelta(days=10))
    _emp(db, "C", proxima_acao="Hoje", proxima_acao_data=HOJE)               # não é vencida: é próxima com dias 0
    _emp(db, "D", proxima_acao=None, proxima_acao_data=HOJE - timedelta(days=3))  # sem texto: não é ação
    db.commit()
    ag = agenda(db, _todas(db), hoje=HOJE, dias=7)
    assert [(i.empresa_nome, i.dias, i.responsavel) for i in ag.vencidas] == [("B", 10, None), ("A", 4, "Ana")]
    assert [(i.empresa_nome, i.dias) for i in ag.proximas] == [("C", 0)]
    assert ag.kpis.vencidas == 2 and ag.kpis.proximas == 1


def test_proximas_respeita_a_janela_nas_fronteiras(db):
    _emp(db, "Dentro7", proxima_acao="x", proxima_acao_data=HOJE + timedelta(days=7))
    _emp(db, "Fora7", proxima_acao="x", proxima_acao_data=HOJE + timedelta(days=8))
    _emp(db, "Dentro14", proxima_acao="x", proxima_acao_data=HOJE + timedelta(days=14))
    db.commit()
    assert [i.empresa_nome for i in agenda(db, _todas(db), hoje=HOJE, dias=7).proximas] == ["Dentro7"]
    assert [i.empresa_nome for i in agenda(db, _todas(db), hoje=HOJE, dias=14).proximas] == ["Dentro7", "Fora7", "Dentro14"]
    assert agenda(db, _todas(db), hoje=HOJE, dias=30).kpis.proximas == 3


def test_sem_data_e_ordem_por_nome(db):
    _emp(db, "Zeta", proxima_acao="Enviar proposta")
    _emp(db, "Alfa", proxima_acao="Cobrar retorno")
    _emp(db, "Sem", proxima_acao=None)
    db.commit()
    ag = agenda(db, _todas(db), hoje=HOJE)
    assert [(i.empresa_nome, i.proxima_acao, i.proxima_acao_data, i.dias) for i in ag.sem_data] == \
        [("Alfa", "Cobrar retorno", None, None), ("Zeta", "Enviar proposta", None, None)]
    assert ag.kpis.sem_data == 2


def test_demandas_abertas_com_dias_status_desde_e_sinal_30d(db):
    e = _emp(db, "ACME")
    d45 = DemandaEmpresa(empresa_id=e.id, municipio_id=e.municipio_id, descricao="Via", status="em_andamento",
                         data_registro=HOJE - timedelta(days=45), responsavel="Obras")
    d29 = DemandaEmpresa(empresa_id=e.id, municipio_id=e.municipio_id, descricao="Placa", data_registro=HOJE - timedelta(days=29))
    d30 = DemandaEmpresa(empresa_id=e.id, municipio_id=e.municipio_id, descricao="Poda", data_registro=HOJE - timedelta(days=30))
    res = DemandaEmpresa(empresa_id=e.id, municipio_id=e.municipio_id, descricao="Feita", status="resolvida",
                         data_registro=HOJE - timedelta(days=60))
    db.add_all([d45, d29, d30, res])
    db.flush()
    db.add_all([
        DemandaStatusHistorico(demanda_id=d45.id, municipio_id=e.municipio_id, de=None, para="aberta",
                               alterado_em=datetime(2026, 7, 20, 12, tzinfo=timezone.utc)),
        DemandaStatusHistorico(demanda_id=d45.id, municipio_id=e.municipio_id, de="aberta", para="em_andamento",
                               alterado_em=datetime(2026, 8, 10, 15, tzinfo=timezone.utc)),
    ])
    db.commit()
    ag = agenda(db, _todas(db), hoje=HOJE)
    itens = {i.descricao: i for i in ag.demandas}
    assert [i.descricao for i in ag.demandas] == ["Via", "Poda", "Placa"]          # dias em aberto desc
    assert (itens["Via"].dias_em_aberto, itens["Via"].status_desde, itens["Via"].sinal_30d, itens["Via"].responsavel) == \
        (45, date(2026, 8, 10), True, "Obras")
    assert (itens["Poda"].status_desde, itens["Poda"].sinal_30d) == (HOJE - timedelta(days=30), True)   # sem histórico → data_registro
    assert itens["Placa"].sinal_30d is False
    assert ag.kpis.demandas_abertas == 3
    assert itens["Via"].empresa_nome == "ACME" and itens["Via"].demanda_id == d45.id


def test_demandas_de_empresa_fora_dos_cadastros_nao_entram(db):
    dentro = _emp(db, "Dentro")
    fora = _emp(db, "Fora")
    db.add(DemandaEmpresa(empresa_id=fora.id, municipio_id=fora.municipio_id, descricao="X", data_registro=HOJE))
    db.commit()
    ag = agenda(db, [dentro], hoje=HOJE)
    assert ag.demandas == () and ag.kpis.demandas_abertas == 0


def test_sem_contato_vem_do_sinal(db):
    velha = _emp(db, "Velha", criado_em=ANTIGO)                     # nunca teve contato, cadastro antigo → entra
    _emp(db, "Nova", criado_em=RECENTE)                              # cadastro recente → não entra
    com = _emp(db, "Contatada", criado_em=ANTIGO)
    db.add(ContatoEmpresa(empresa_id=com.id, municipio_id=com.municipio_id, data=HOJE - timedelta(days=100), tipo="ligacao"))
    ok = _emp(db, "EmDia", criado_em=ANTIGO)
    db.add(VisitaRetencao(empresa_id=ok.id, municipio_id=ok.municipio_id, data_visita=HOJE - timedelta(days=5)))
    db.commit()
    ag = agenda(db, _todas(db), hoje=HOJE)
    assert [(i.empresa_nome, i.desde, i.dias) for i in ag.sem_contato] == [
        ("Velha", date(2025, 1, 1), (HOJE - date(2025, 1, 1)).days),
        ("Contatada", HOJE - timedelta(days=100), 100),
    ]
    assert ag.kpis.sem_contato == 2
    assert velha.id in {i.empresa_id for i in ag.sem_contato}


def test_contatos_recentes_mescla_ordena_e_corta_em_30_dias(db):
    e = _emp(db, "ACME")
    db.add_all([
        ContatoEmpresa(empresa_id=e.id, municipio_id=e.municipio_id, data=HOJE - timedelta(days=1), tipo="ligacao",
                       responsavel="Ana", observacoes="Retorno"),
        VisitaRetencao(empresa_id=e.id, municipio_id=e.municipio_id, data_visita=HOJE - timedelta(days=3), responsavel="Bia"),
        ContatoEmpresa(empresa_id=e.id, municipio_id=e.municipio_id, data=HOJE - timedelta(days=30), tipo="email"),   # no limite: entra
        ContatoEmpresa(empresa_id=e.id, municipio_id=e.municipio_id, data=HOJE - timedelta(days=31), tipo="outro"),   # fora
    ])
    db.commit()
    ag = agenda(db, _todas(db), hoje=HOJE)
    assert [(i.tipo, i.subtipo, i.data, i.responsavel, i.observacoes) for i in ag.contatos_recentes] == [
        ("contato", "ligacao", HOJE - timedelta(days=1), "Ana", "Retorno"),
        ("visita", None, HOJE - timedelta(days=3), "Bia", None),
        ("contato", "email", HOJE - timedelta(days=30), None, None),
    ]
    assert ag.contatos_recentes[0].empresa_nome == "ACME"


def test_contatos_recentes_limite_50(db):
    e = _emp(db, "ACME")
    db.add_all([ContatoEmpresa(empresa_id=e.id, municipio_id=e.municipio_id, data=HOJE - timedelta(days=i % 20), tipo="outro")
                for i in range(60)])
    db.commit()
    assert len(agenda(db, _todas(db), hoje=HOJE).contatos_recentes) == 50


def test_janela_invalida_e_lista_vazia(db):
    with pytest.raises(ValueError):
        agenda(db, [], hoje=HOJE, dias=10)
    assert JANELAS_AGENDA == (7, 14, 30)
    mock = MagicMock()
    ag = agenda(mock, [], hoje=HOJE, dias=14)
    assert ag == agenda_vazia(HOJE, 14)
    assert ag.kpis.vencidas == 0 and ag.contatos_recentes == () and ag.dias == 14 and ag.hoje == HOJE
    mock.query.assert_not_called()
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `venv/Scripts/python -m pytest backend/tests/test_gestao_empresarial_agenda.py -p no:warnings`
Expected: `ImportError: cannot import name 'JANELAS_AGENDA'`.

- [ ] **Step 3: Implementar no serviço**

Imports em `backend/app/services/gestao_empresarial.py`: `from sqlalchemy.orm import Session` → `from sqlalchemy.orm import Session, selectinload`.

Acrescentar ao final do módulo:

```python
# ── agenda do gestor (sub-frente C) ─────────────────────────────────────────
# Vencidas e sem contato vêm dos sinais de risco (uma leitura via enriquecer);
# próximas, sem data, demandas abertas e contatos recentes são calculados aqui
# sobre os cadastros já filtrados por tenant pelo router.

JANELAS_AGENDA = (7, 14, 30)
DIAS_CONTATOS_RECENTES = 30
LIMITE_CONTATOS_RECENTES = 50


@dataclass(frozen=True)
class ItemAcao:
    empresa_id: int
    empresa_nome: str
    proxima_acao: str
    proxima_acao_data: date | None
    dias: int | None            # vencidas: atraso; próximas: faltam (0 = hoje); sem data: None
    responsavel: str | None


@dataclass(frozen=True)
class ItemDemanda:
    demanda_id: int
    empresa_id: int
    empresa_nome: str
    descricao: str
    status: str
    data_registro: date
    dias_em_aberto: int
    status_desde: date
    responsavel: str | None
    sinal_30d: bool


@dataclass(frozen=True)
class ItemSemContato:
    empresa_id: int
    empresa_nome: str
    desde: date | None
    dias: int | None


@dataclass(frozen=True)
class ItemContato:
    empresa_id: int
    empresa_nome: str
    tipo: str                   # "contato" | "visita"
    subtipo: str | None         # tipo do contato (reuniao|ligacao|email|visita_tecnica|outro) ou None
    data: date
    responsavel: str | None
    observacoes: str | None


@dataclass(frozen=True)
class AgendaKpis:
    vencidas: int
    proximas: int
    sem_data: int
    demandas_abertas: int
    sem_contato: int


@dataclass(frozen=True)
class Agenda:
    hoje: date
    dias: int
    kpis: AgendaKpis
    vencidas: tuple[ItemAcao, ...]
    proximas: tuple[ItemAcao, ...]
    sem_data: tuple[ItemAcao, ...]
    demandas: tuple[ItemDemanda, ...]
    sem_contato: tuple[ItemSemContato, ...]
    contatos_recentes: tuple[ItemContato, ...]


def agenda_vazia(hoje: date, dias: int) -> Agenda:
    return Agenda(hoje, dias, AgendaKpis(0, 0, 0, 0, 0), (), (), (), (), (), ())


def _nome(c) -> str:
    return (c.nome or "").casefold()


def agenda(db: Session, cadastros: Iterable, hoje: date | None = None, dias: int = 7) -> Agenda:
    if dias not in JANELAS_AGENDA:
        raise ValueError(f"dias inválido: {dias!r} (aceitos: {JANELAS_AGENDA})")
    cadastros = list(cadastros)
    hoje = hoje or hoje_local()
    if not cadastros:
        return agenda_vazia(hoje, dias)

    calc = enriquecer(db, cadastros, hoje=hoje)
    nome_de = {c.id: c.nome for c in cadastros}
    ids = list(nome_de)

    vencidas: list[ItemAcao] = []
    sem_contato: list[ItemSemContato] = []
    for c in cadastros:
        for s in calc[c.id].risco.sinais:
            if s.chave == "proxima_acao_vencida":
                vencidas.append(ItemAcao(c.id, c.nome, c.proxima_acao, s.desde, (hoje - s.desde).days, c.responsavel))
            elif s.chave == "sem_contato_90d":
                dias_sem = (hoje - s.desde).days if s.desde is not None else None
                sem_contato.append(ItemSemContato(c.id, c.nome, s.desde, dias_sem))
    vencidas.sort(key=lambda i: (-i.dias, i.empresa_nome.casefold()))
    sem_contato.sort(key=lambda i: (-(i.dias or 0), i.empresa_nome.casefold()))

    limite = hoje + timedelta(days=dias)
    proximas: list[ItemAcao] = []
    sem_data: list[ItemAcao] = []
    for c in cadastros:
        if not c.proxima_acao:
            continue
        data = _como_date(c.proxima_acao_data)
        if data is None:
            sem_data.append(ItemAcao(c.id, c.nome, c.proxima_acao, None, None, c.responsavel))
        elif hoje <= data <= limite:
            proximas.append(ItemAcao(c.id, c.nome, c.proxima_acao, data, (data - hoje).days, c.responsavel))
    proximas.sort(key=lambda i: (i.proxima_acao_data, i.empresa_nome.casefold()))
    sem_data.sort(key=lambda i: i.empresa_nome.casefold())

    demandas: list[ItemDemanda] = []
    linhas = (
        db.query(DemandaEmpresa)
        .options(selectinload(DemandaEmpresa.historico))
        .filter(DemandaEmpresa.empresa_id.in_(ids), DemandaEmpresa.status != "resolvida")
        .all()
    )
    for d in linhas:
        registro = _como_date(d.data_registro)
        ultimo = d.historico[-1] if d.historico else None
        desde = _como_date(ultimo.alterado_em) if ultimo is not None else registro
        demandas.append(ItemDemanda(
            d.id, d.empresa_id, nome_de.get(d.empresa_id, ""), d.descricao, d.status, registro,
            (hoje - registro).days, desde, d.responsavel,
            registro <= hoje - timedelta(days=DIAS_DEMANDA_ABERTA),
        ))
    demandas.sort(key=lambda i: (-i.dias_em_aberto, i.empresa_nome.casefold()))

    corte = hoje - timedelta(days=DIAS_CONTATOS_RECENTES)
    recentes: list[ItemContato] = []
    for k in db.query(ContatoEmpresa).filter(ContatoEmpresa.empresa_id.in_(ids), ContatoEmpresa.data >= corte):
        recentes.append(ItemContato(k.empresa_id, nome_de.get(k.empresa_id, ""), "contato", k.tipo,
                                    _como_date(k.data), k.responsavel, k.observacoes))
    for v in db.query(VisitaRetencao).filter(VisitaRetencao.empresa_id.in_(ids), VisitaRetencao.data_visita >= corte):
        recentes.append(ItemContato(v.empresa_id, nome_de.get(v.empresa_id, ""), "visita", None,
                                    _como_date(v.data_visita), v.responsavel, v.observacoes))
    recentes.sort(key=lambda i: (-i.data.toordinal(), i.empresa_nome.casefold()))
    recentes = recentes[:LIMITE_CONTATOS_RECENTES]

    kpis = AgendaKpis(len(vencidas), len(proximas), len(sem_data), len(demandas), len(sem_contato))
    return Agenda(hoje, dias, kpis, tuple(vencidas), tuple(proximas), tuple(sem_data),
                  tuple(demandas), tuple(sem_contato), tuple(recentes))
```

- [ ] **Step 4: Rodar e ver passar; suíte**

Run: `venv/Scripts/python -m pytest backend/tests/test_gestao_empresarial_agenda.py backend/tests/test_gestao_empresarial_score.py -p no:warnings` → todos passam (9 novos).
Run: `venv/Scripts/python -m pytest backend/tests -p no:warnings` → `614 passed`.

- [ ] **Step 5: CRLF no teste novo e commit**

```bash
git add backend/app/services/gestao_empresarial.py backend/tests/test_gestao_empresarial_agenda.py
git commit -F <msg>   # "feat(gestao-empresarial): servico agenda() — vencidas, proximas, sem data, demandas abertas, sem contato e contatos recentes"
```

---

### Task 4: Schemas + endpoint `GET /retencao/agenda`

**Files:**
- Modify: `backend/app/schemas/desenvolvimento_economico.py` (acrescentar ao final)
- Modify: `backend/app/api/v1/routers/desenvolvimento_economico.py` (imports; handler inserido após `descobrir_divisoes` e ANTES de `@router.get("/retencao/{empresa_id}"`)
- Test: `backend/tests/test_gestao_empresarial_endpoints.py` (3 testes + extensão do teste de ordem)

**Interfaces:**
- Consumes (Task 3): `agenda`, `agenda_vazia`, `JANELAS_AGENDA`.
- Produces (Tasks 5–6 dependem do JSON): `AgendaOut` exatamente como a spec §2.1 (`hoje`, `dias`, `kpis{vencidas, proximas, sem_data, demandas_abertas, sem_contato}`, `vencidas[]`, `proximas[]`, `sem_data[]`, `demandas[]`, `sem_contato[]`, `contatos_recentes[]`).

- [ ] **Step 1: Escrever os testes (falhando)**

Acrescentar ao fim de `test_gestao_empresarial_endpoints.py`:

```python
# ── agenda (sub-frente C) ────────────────────────────────────────────────────

def test_agenda_respeita_tenant_e_view_as(ctx):
    from datetime import timedelta
    from app.api.v1.routers.desenvolvimento_economico import agenda_retencao
    from app.core.datas import hoje_local
    db, admin, u1, u2, m1, m2 = ctx
    hoje = hoje_local()
    _criar_empresa(db, u1, nome="Alfa Co", proxima_acao="Ligar", proxima_acao_data=hoje - timedelta(days=2))
    _criar_empresa(db, u2, nome="Beta Co", proxima_acao="Visitar", proxima_acao_data=hoje + timedelta(days=3))
    a1 = agenda_retencao(dias=7, municipio_id=None, db=db, current_user=u1)
    assert [i.empresa_nome for i in a1.vencidas] == ["Alfa Co"] and a1.proximas == []
    assert (a1.kpis.vencidas, a1.dias, a1.hoje) == (1, 7, hoje)
    a2 = agenda_retencao(dias=7, municipio_id=m2.id, db=db, current_user=admin)
    assert [(i.empresa_nome, i.dias) for i in a2.proximas] == [("Beta Co", 3)] and a2.vencidas == []
    u1_ignora = agenda_retencao(dias=7, municipio_id=m2.id, db=db, current_user=u1)
    assert [i.empresa_nome for i in u1_ignora.vencidas] == ["Alfa Co"]


def test_agenda_admin_sem_municipio_e_vazia_e_dias_invalido_e_422(ctx):
    from fastapi import HTTPException
    from app.api.v1.routers.desenvolvimento_economico import agenda_retencao
    db, admin, u1, *_ = ctx
    _criar_empresa(db, u1, nome="Alfa Co")
    vazia = agenda_retencao(dias=30, municipio_id=None, db=db, current_user=admin)
    assert vazia.kpis.sem_contato == 0 and vazia.sem_contato == [] and vazia.dias == 30
    with pytest.raises(HTTPException) as exc:
        agenda_retencao(dias=10, municipio_id=None, db=db, current_user=u1)
    assert exc.value.status_code == 422


def test_agenda_devolve_demandas_e_contatos_recentes(ctx):
    from datetime import timedelta
    from app.api.v1.routers.desenvolvimento_economico import adicionar_contato, adicionar_demanda, agenda_retencao
    from app.core.datas import hoje_local
    db, _, u1, *_ = ctx
    hoje = hoje_local()
    e = _criar_empresa(db, u1, nome="Alfa Co")
    adicionar_demanda(e.id, DemandaEmpresaCreate(descricao="Via", data_registro=hoje - timedelta(days=40)),
                      db=db, current_user=u1)
    adicionar_contato(e.id, ContatoEmpresaCreate(data=hoje - timedelta(days=2), tipo="email"), db=db, current_user=u1)
    ag = agenda_retencao(dias=7, municipio_id=None, db=db, current_user=u1)
    assert [(d.descricao, d.dias_em_aberto, d.sinal_30d) for d in ag.demandas] == [("Via", 40, True)]
    # A linha inicial do histórico foi gravada agora pelo POST (Task 2): "desde" é
    # a data de hoje, não data_registro. Tolerância de 1 dia: alterado_em é UTC e
    # hoje_local é BRT (entre 21h e 0h em Brasília as datas diferem).
    assert abs((ag.demandas[0].status_desde - hoje).days) <= 1
    assert [(c.tipo, c.subtipo, c.empresa_nome) for c in ag.contatos_recentes] == [("contato", "email", "Alfa Co")]
    assert ag.kpis.demandas_abertas == 1
```

E estender `test_rotas_de_descoberta_vem_antes_do_detalhe_por_id` com uma linha:

```python
    assert caminhos.index(f"{base}/agenda") < caminhos.index(base + "/{empresa_id}")
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `venv/Scripts/python -m pytest backend/tests/test_gestao_empresarial_endpoints.py -p no:warnings`
Expected: os 3 novos e o de ordem falham (`ImportError: cannot import name 'agenda_retencao'` / `ValueError ... not in list`).

- [ ] **Step 3: Schemas**

Acrescentar ao final de `backend/app/schemas/desenvolvimento_economico.py`:

```python


# ── agenda do gestor (sub-frente C) ────────────────────────────────────────

class ItemAcaoOut(BaseModel):
    empresa_id: int
    empresa_nome: str
    proxima_acao: str
    proxima_acao_data: Optional[date] = None
    dias: Optional[int] = None
    responsavel: Optional[str] = None


class ItemDemandaOut(BaseModel):
    demanda_id: int
    empresa_id: int
    empresa_nome: str
    descricao: str
    status: str
    data_registro: date
    dias_em_aberto: int
    status_desde: date
    responsavel: Optional[str] = None
    sinal_30d: bool


class ItemSemContatoOut(BaseModel):
    empresa_id: int
    empresa_nome: str
    desde: Optional[date] = None
    dias: Optional[int] = None


class ItemContatoOut(BaseModel):
    empresa_id: int
    empresa_nome: str
    tipo: Literal["contato", "visita"]
    subtipo: Optional[str] = None
    data: date
    responsavel: Optional[str] = None
    observacoes: Optional[str] = None


class AgendaKpisOut(BaseModel):
    vencidas: int
    proximas: int
    sem_data: int
    demandas_abertas: int
    sem_contato: int


class AgendaOut(BaseModel):
    hoje: date
    dias: int
    kpis: AgendaKpisOut
    vencidas: List[ItemAcaoOut]
    proximas: List[ItemAcaoOut]
    sem_data: List[ItemAcaoOut]
    demandas: List[ItemDemandaOut]
    sem_contato: List[ItemSemContatoOut]
    contatos_recentes: List[ItemContatoOut]
```

- [ ] **Step 4: Router**

Imports: acrescentar `AgendaOut,` ao bloco de schemas (ordem alfabética: antes de `CaptacaoRecursoCreate,`); trocar a linha de import do serviço por
`from app.services.gestao_empresarial import JANELAS_AGENDA, Enriquecimento, agenda, agenda_vazia, descobrir, divisoes_disponiveis, enriquecer, ordenar_por_relevancia`.

Inserir após `descobrir_divisoes` (antes de `@router.get("/retencao/{empresa_id}", ...)`):

```python
@router.get("/retencao/agenda", response_model=AgendaOut)
def agenda_retencao(
    dias: int = Query(7),
    municipio_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    """Agenda do gestor: ações vencidas, próximas N dias, sem data, demandas
    abertas, sem contato 90 d+ e contatos recentes. Mesmo tenant de
    /retencao; ADMIN_GLOBAL sem view-as recebe a agenda vazia. Rota estática
    ANTES de /retencao/{empresa_id}."""
    if dias not in JANELAS_AGENDA:
        raise HTTPException(status_code=422, detail=f"dias deve ser um de {list(JANELAS_AGENDA)}")
    hoje = hoje_local()
    query = db.query(EmpresaRetencao)
    if current_user.role.nome != "ADMIN_GLOBAL":
        query = query.filter(EmpresaRetencao.municipio_id == current_user.municipio_id)
    elif municipio_id is not None:
        query = query.filter(EmpresaRetencao.municipio_id == municipio_id)
    else:
        return AgendaOut(**asdict(agenda_vazia(hoje, dias)))
    return AgendaOut(**asdict(agenda(db, query.all(), hoje=hoje, dias=dias)))


```

- [ ] **Step 5: Rodar e ver passar; suíte**

Run: `venv/Scripts/python -m pytest backend/tests/test_gestao_empresarial_endpoints.py -p no:warnings` → todos passam.
Run: `venv/Scripts/python -m pytest backend/tests -p no:warnings` → `617 passed`.

- [ ] **Step 6: Commit**

```bash
git add backend/app/schemas/desenvolvimento_economico.py backend/app/api/v1/routers/desenvolvimento_economico.py backend/tests/test_gestao_empresarial_endpoints.py
git commit -F <msg>   # "feat(gestao-empresarial): endpoint GET /retencao/agenda (7/14/30 dias) com tenant e view-as"
```

---

### Task 5: Componente `AgendaTab.jsx`

**Files:**
- Create: `frontend-observatorio/src/pages/desenvolvimento-economico/AgendaTab.jsx`
- Test: `frontend-observatorio/src/pages/desenvolvimento-economico/AgendaTab.test.jsx`

**Interfaces:**
- Consumes (Task 4): `GET /desenvolvimento-economico/retencao/agenda?dias=` com o JSON de `AgendaOut`.
- Produces (Task 6 depende): `export default function AgendaTab({ onAbrirEmpresa, refreshKey = 0 })`.

- [ ] **Step 1: Escrever os testes (falhando)**

Criar `AgendaTab.test.jsx`:

```jsx
// @vitest-environment jsdom
//
// Aba "Agenda" da Gestão Empresarial: KPIs e seis blocos a partir de
// /retencao/agenda; seletor 7 · 14 · 30; cada item abre a empresa; vazios
// explícitos e erro audível.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent, within } from "@testing-library/react";

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
import AgendaTab from "./AgendaTab";

const URL = "/desenvolvimento-economico/retencao/agenda";
const KPIS_ZERO = { vencidas: 0, proximas: 0, sem_data: 0, demandas_abertas: 0, sem_contato: 0 };
const VAZIA = { hoje: "2026-09-03", dias: 7, kpis: KPIS_ZERO, vencidas: [], proximas: [], sem_data: [], demandas: [], sem_contato: [], contatos_recentes: [] };
const CHEIA = {
  hoje: "2026-09-03", dias: 7,
  kpis: { vencidas: 1, proximas: 1, sem_data: 1, demandas_abertas: 1, sem_contato: 1 },
  vencidas: [{ empresa_id: 7, empresa_nome: "ACME", proxima_acao: "Ligar", proxima_acao_data: "2026-08-30", dias: 4, responsavel: "Ana" }],
  proximas: [{ empresa_id: 9, empresa_nome: "Beta", proxima_acao: "Visita", proxima_acao_data: "2026-09-05", dias: 2, responsavel: null }],
  sem_data: [{ empresa_id: 3, empresa_nome: "Gama", proxima_acao: "Enviar proposta", responsavel: null }],
  demandas: [{ demanda_id: 5, empresa_id: 7, empresa_nome: "ACME", descricao: "Iluminação da via", status: "em_andamento",
    data_registro: "2026-07-20", dias_em_aberto: 45, status_desde: "2026-08-10", responsavel: "Obras", sinal_30d: true }],
  sem_contato: [{ empresa_id: 11, empresa_nome: "Delta", desde: "2026-05-02", dias: 124 }],
  contatos_recentes: [{ empresa_id: 7, empresa_nome: "ACME", tipo: "contato", subtipo: "ligacao", data: "2026-09-01",
    responsavel: "Ana", observacoes: "Retorno sobre alvará" }],
};

const params = () => api.get.mock.calls.filter(([u]) => u === URL).map(([, cfg]) => cfg?.params ?? {});
const regiao = (nome) => screen.getByRole("region", { name: nome });
// Só o <p> do KPI: os títulos dos blocos repetem o texto num <h3>.
const kpi = (label) => screen.getAllByText(label).find((el) => el.tagName === "P").nextElementSibling.textContent;

beforeEach(() => {
  vi.clearAllMocks();
  Object.keys(respostas).forEach((k) => delete respostas[k]);
  respostas[URL] = () => CHEIA;
});

const montar = (props = {}) => render(<AgendaTab onAbrirEmpresa={props.onAbrirEmpresa || vi.fn()} refreshKey={props.refreshKey ?? 0} />);
const esperar = () => waitFor(() => expect(regiao("Ações vencidas")).toBeInTheDocument());

describe("AgendaTab", () => {
  it("KPIs e blocos a partir do payload; padrão 7 dias", async () => {
    montar();
    await esperar();
    expect(params()[0]).toEqual({ dias: 7 });
    expect(kpi("Ações vencidas")).toBe("1");
    expect(kpi("Próximos 7 dias")).toBe("1");
    expect(kpi("Sem data")).toBe("1");
    expect(kpi("Demandas abertas")).toBe("1");
    expect(kpi("Sem contato 90 d+")).toBe("1");
    expect(within(regiao("Ações vencidas")).getByText(/Ligar · venceu há 4 dias · Ana/)).toBeInTheDocument();
    expect(within(regiao("Próximos 7 dias")).getByText(/Visita · em 2 dias \(05\/09\/2026\)/)).toBeInTheDocument();
    expect(within(regiao("Sem data marcada")).getByText(/Enviar proposta/)).toBeInTheDocument();
    expect(within(regiao("Demandas abertas")).getByText(/Iluminação da via · Em andamento desde 10\/08\/2026 · 45 dias em aberto/)).toBeInTheDocument();
    expect(within(regiao("Demandas abertas")).getByText("30 d+")).toBeInTheDocument();
    expect(within(regiao("Sem contato há 90 dias ou mais")).getByText(/desde 02\/05\/2026 · 124 dias/)).toBeInTheDocument();
    expect(within(regiao("Contatos e visitas recentes")).getByText(/01\/09\/2026 · Ligação · Ana — Retorno sobre alvará/)).toBeInTheDocument();
  });

  it("seletor de janela envia dias e atualiza os rótulos", async () => {
    respostas[URL] = ({ dias }) => ({ ...CHEIA, dias, kpis: { ...CHEIA.kpis, proximas: dias === 14 ? 3 : 1 } });
    montar();
    await esperar();
    fireEvent.click(screen.getByRole("tab", { name: "14 dias" }));
    await waitFor(() => expect(params().at(-1)).toEqual({ dias: 14 }));
    await waitFor(() => expect(kpi("Próximos 14 dias")).toBe("3"));
    expect(screen.getByRole("tab", { name: "14 dias" })).toHaveAttribute("aria-selected", "true");
    expect(within(regiao("Próximos 14 dias")).getByText(/Visita/)).toBeInTheDocument();
  });

  it("clicar num item abre a empresa", async () => {
    const onAbrirEmpresa = vi.fn();
    montar({ onAbrirEmpresa });
    await esperar();
    fireEvent.click(within(regiao("Sem contato há 90 dias ou mais")).getByRole("button", { name: "Abrir Delta" }));
    expect(onAbrirEmpresa).toHaveBeenCalledWith(11);
    fireEvent.click(within(regiao("Demandas abertas")).getByRole("button", { name: "Abrir ACME" }));
    expect(onAbrirEmpresa).toHaveBeenLastCalledWith(7);
  });

  it("vazio geral e frases por bloco", async () => {
    respostas[URL] = () => VAZIA;
    montar();
    await esperar();
    expect(screen.getByText(/Nada na agenda: nenhuma ação, demanda aberta ou contato recente/)).toBeInTheDocument();
    expect(within(regiao("Ações vencidas")).getByText("Nenhuma ação vencida.")).toBeInTheDocument();
    expect(within(regiao("Próximos 7 dias")).getByText("Nada nos próximos 7 dias.")).toBeInTheDocument();
    expect(within(regiao("Sem data marcada")).getByText("Todas as ações têm data.")).toBeInTheDocument();
    expect(within(regiao("Demandas abertas")).getByText("Nenhuma demanda aberta.")).toBeInTheDocument();
    expect(within(regiao("Sem contato há 90 dias ou mais")).getByText("Todas as empresas tiveram contato nos últimos 90 dias.")).toBeInTheDocument();
    expect(within(regiao("Contatos e visitas recentes")).getByText("Nenhum contato ou visita nos últimos 30 dias.")).toBeInTheDocument();
  });

  it("vazio por bloco não mostra o aviso geral", async () => {
    respostas[URL] = () => ({ ...CHEIA, proximas: [], kpis: { ...CHEIA.kpis, proximas: 0 } });
    montar();
    await esperar();
    expect(screen.queryByText(/Nada na agenda/)).toBeNull();
    expect(within(regiao("Próximos 7 dias")).getByText("Nada nos próximos 7 dias.")).toBeInTheDocument();
  });

  it("erro de carga é avisado", async () => {
    respostas[URL] = () => Promise.reject(new Error("500"));
    montar();
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Não foi possível carregar a agenda."));
    expect(screen.queryByRole("region", { name: "Ações vencidas" })).toBeNull();
  });

  it("refreshKey recarrega", async () => {
    const { rerender } = render(<AgendaTab onAbrirEmpresa={vi.fn()} refreshKey={0} />);
    await esperar();
    const antes = params().length;
    rerender(<AgendaTab onAbrirEmpresa={vi.fn()} refreshKey={1} />);
    await waitFor(() => expect(params().length).toBe(antes + 1));
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run (de `frontend-observatorio/`): `npx vitest run src/pages/desenvolvimento-economico/AgendaTab.test.jsx`
Expected: falha ao resolver `./AgendaTab`.

- [ ] **Step 3: Implementar o componente**

Criar `AgendaTab.jsx`:

```jsx
import { useEffect, useState } from "react";
import api from "../../services/api";

// Aba "Agenda" da Gestão Empresarial: o trabalho do dia do gestor, montado
// pelo backend (/retencao/agenda) a partir dos sinais de risco e dos
// registros de ações, demandas, contatos e visitas. Só navega: cada item
// abre o drawer da empresa, onde tudo é editado.
const URL = "/desenvolvimento-economico/retencao/agenda";
const JANELAS = [7, 14, 30];
const ERRO = "Não foi possível carregar a agenda.";
const TIPO_CONTATO = { reuniao: "Reunião", ligacao: "Ligação", email: "E-mail", visita_tecnica: "Visita técnica", outro: "Outro" };
const STATUS_LABEL = { aberta: "Aberta", em_andamento: "Em andamento", resolvida: "Resolvida" };

function fmtDate(d) {
  if (!d) return "—";
  return new Date(d + "T00:00:00").toLocaleDateString("pt-BR");
}
const plural = (n, um, muitos) => `${n} ${n === 1 ? um : muitos}`;

function Bloco({ titulo, vazio, itens, children }) {
  return (
    <section aria-label={titulo} className="bg-[var(--panel)] rounded-xl border border-[var(--border)] p-4 space-y-2">
      <h3 className="text-xs font-semibold text-[var(--text-dim)] uppercase tracking-wider">
        {titulo}{itens.length > 0 && <span className="ml-2 text-slate-400 normal-case tracking-normal">{itens.length}</span>}
      </h3>
      {itens.length === 0 ? <p className="text-xs text-slate-400">{vazio}</p> : <ul className="space-y-1">{children}</ul>}
    </section>
  );
}

function Item({ onClick, empresa, tom, children }) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        aria-label={`Abrir ${empresa}`}
        className="w-full text-left text-xs rounded-lg px-2 py-1.5 hover:bg-[var(--panel-2)] cursor-pointer"
      >
        <span className="font-medium text-[var(--text)]">{empresa}</span>
        <span className="text-[var(--text-dim)]"> · </span>
        <span className="text-[var(--text-dim)]" style={tom ? { color: tom } : undefined}>{children}</span>
      </button>
    </li>
  );
}

export default function AgendaTab({ onAbrirEmpresa, refreshKey = 0 }) {
  const [dias, setDias] = useState(7);
  const [agenda, setAgenda] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(null);

  // Recarrega ao mudar a janela ou quando o pai sinaliza mudança (salvar
  // cadastro, alterações no drawer); resposta superada é ignorada.
  useEffect(() => {
    let vivo = true;
    setCarregando(true);
    setErro(null);
    api.get(URL, { params: { dias } })
      .then((res) => { if (vivo) setAgenda(res.data); })
      .catch(() => { if (vivo) setErro(ERRO); })
      .finally(() => { if (vivo) setCarregando(false); });
    return () => { vivo = false; };
  }, [dias, refreshKey]);

  const a = agenda;
  const k = a?.kpis;
  const listas = a ? [a.vencidas, a.proximas, a.sem_data, a.demandas, a.sem_contato, a.contatos_recentes] : [];
  const tudoVazio = Boolean(a) && listas.every((l) => (l || []).length === 0);
  const abrir = (id) => () => onAbrirEmpresa(id);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <span className="text-xs text-[var(--text-mute)]">Janela</span>
        <div className="flex" style={{ gap: 6 }} role="tablist" aria-label="Janela da agenda">
          {JANELAS.map((n) => (
            <button
              key={n}
              type="button"
              role="tab"
              aria-selected={dias === n}
              onClick={() => setDias(n)}
              className={`nid-tab ${dias === n ? "active" : ""}`}
            >
              {n} dias
            </button>
          ))}
        </div>
      </div>

      {erro && <p role="alert" className="text-sm" style={{ color: "var(--accent-2)" }}>{erro}</p>}
      {carregando && !erro && <p role="status" className="text-sm text-slate-400">Carregando…</p>}

      {!carregando && !erro && a && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
            {[
              { label: "Ações vencidas", value: k.vencidas, color: "text-red-600" },
              { label: `Próximos ${dias} dias`, value: k.proximas, color: "text-[var(--text)]" },
              { label: "Sem data", value: k.sem_data, color: "text-[var(--text)]" },
              { label: "Demandas abertas", value: k.demandas_abertas, color: "text-amber-500" },
              { label: "Sem contato 90 d+", value: k.sem_contato, color: "text-[var(--text)]" },
            ].map((x) => (
              <div key={x.label} className="bg-[var(--panel)] rounded-xl border border-[var(--border)] p-4">
                <p className="text-xs text-slate-400 uppercase tracking-wider">{x.label}</p>
                <p className={`text-2xl font-extrabold mt-1 ${x.color}`}>{x.value}</p>
              </div>
            ))}
          </div>

          {tudoVazio && (
            <p className="text-sm text-slate-400 text-center py-4">
              Nada na agenda: nenhuma ação, demanda aberta ou contato recente. Registre próximas ações e contatos no
              drawer de cada empresa.
            </p>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Bloco titulo="Ações vencidas" vazio="Nenhuma ação vencida." itens={a.vencidas}>
              {a.vencidas.map((i) => (
                <Item key={`v-${i.empresa_id}`} empresa={i.empresa_nome} onClick={abrir(i.empresa_id)} tom="var(--accent-2)">
                  {i.proxima_acao} · venceu há {plural(i.dias, "dia", "dias")}{i.responsavel && ` · ${i.responsavel}`}
                </Item>
              ))}
            </Bloco>
            <Bloco titulo={`Próximos ${dias} dias`} vazio={`Nada nos próximos ${dias} dias.`} itens={a.proximas}>
              {a.proximas.map((i) => (
                <Item key={`p-${i.empresa_id}`} empresa={i.empresa_nome} onClick={abrir(i.empresa_id)}>
                  {i.proxima_acao} · {i.dias === 0 ? "hoje" : `em ${plural(i.dias, "dia", "dias")}`} ({fmtDate(i.proxima_acao_data)}){i.responsavel && ` · ${i.responsavel}`}
                </Item>
              ))}
            </Bloco>
            <Bloco titulo="Sem data marcada" vazio="Todas as ações têm data." itens={a.sem_data}>
              {a.sem_data.map((i) => (
                <Item key={`s-${i.empresa_id}`} empresa={i.empresa_nome} onClick={abrir(i.empresa_id)}>
                  {i.proxima_acao}{i.responsavel && ` · ${i.responsavel}`}
                </Item>
              ))}
            </Bloco>
            <Bloco titulo="Demandas abertas" vazio="Nenhuma demanda aberta." itens={a.demandas}>
              {a.demandas.map((i) => (
                <Item key={`d-${i.demanda_id}`} empresa={i.empresa_nome} onClick={abrir(i.empresa_id)}>
                  {i.descricao} · {STATUS_LABEL[i.status] || i.status} desde {fmtDate(i.status_desde)} · {plural(i.dias_em_aberto, "dia", "dias")} em aberto
                  {i.sinal_30d && (
                    <span className="ml-1 px-1.5 rounded-full text-[10px] font-medium" style={{ color: "var(--accent-4)", background: "var(--panel-2)" }}>30 d+</span>
                  )}
                </Item>
              ))}
            </Bloco>
            <Bloco titulo="Sem contato há 90 dias ou mais" vazio="Todas as empresas tiveram contato nos últimos 90 dias." itens={a.sem_contato}>
              {a.sem_contato.map((i) => (
                <Item key={`c-${i.empresa_id}`} empresa={i.empresa_nome} onClick={abrir(i.empresa_id)}>
                  {i.desde ? `desde ${fmtDate(i.desde)} · ${plural(i.dias, "dia", "dias")}` : "sem contato registrado"}
                </Item>
              ))}
            </Bloco>
            <Bloco titulo="Contatos e visitas recentes" vazio="Nenhum contato ou visita nos últimos 30 dias." itens={a.contatos_recentes}>
              {a.contatos_recentes.map((i, idx) => (
                <Item key={`r-${idx}`} empresa={i.empresa_nome} onClick={abrir(i.empresa_id)}>
                  {fmtDate(i.data)} · {i.tipo === "visita" ? "Visita" : (TIPO_CONTATO[i.subtipo] || "Contato")}{i.responsavel && ` · ${i.responsavel}`}{i.observacoes && ` — ${i.observacoes}`}
                </Item>
              ))}
            </Bloco>
          </div>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/pages/desenvolvimento-economico/AgendaTab.test.jsx` → 7 passed.

- [ ] **Step 5: CRLF nos dois arquivos e commit**

```bash
git add frontend-observatorio/src/pages/desenvolvimento-economico/AgendaTab.jsx frontend-observatorio/src/pages/desenvolvimento-economico/AgendaTab.test.jsx
git commit -F <msg>   # "feat(gestao-empresarial): componente AgendaTab (KPIs, seis blocos, janela 7/14/30)"
```

---

### Task 6: Terceira aba na `GestaoEmpresarialTab`

**Files:**
- Modify: `frontend-observatorio/src/pages/desenvolvimento-economico/GestaoEmpresarialTab.jsx` (import ~linha 21; estado ~130; `load` ~162; `abrirEmpresa` ~187; `handleSubmit` ~239; `NidTabBar`/abas ~303–329; `EmpresaDrawer` `onChanged` ~460)
- Test: `frontend-observatorio/src/pages/desenvolvimento-economico/GestaoEmpresarialTab.test.jsx` (acrescentar um `describe`)

**Interfaces:**
- Consumes (Task 5): `AgendaTab({ onAbrirEmpresa, refreshKey })`.
- Produces: nada.

- [ ] **Step 1: Escrever os testes (falhando)**

Acrescentar ao fim de `GestaoEmpresarialTab.test.jsx`:

```jsx
describe("GestaoEmpresarialTab — aba Agenda", () => {
  const AGENDA = {
    hoje: "2026-09-03", dias: 7,
    kpis: { vencidas: 1, proximas: 0, sem_data: 0, demandas_abertas: 0, sem_contato: 0 },
    vencidas: [{ empresa_id: 1, empresa_nome: "ACME", proxima_acao: "Ligar", proxima_acao_data: "2026-08-30", dias: 4, responsavel: null }],
    proximas: [], sem_data: [], demandas: [], sem_contato: [], contatos_recentes: [],
  };
  const chamadasAgenda = () => api.get.mock.calls.filter(([u]) => u.endsWith("/retencao/agenda"));

  beforeEach(() => {
    authState.user = { role: "GESTOR", municipio_id: 1, permissoes: { retencao: ["criar", "editar"] } };
    api.get.mockImplementation((url) => Promise.resolve({
      data: url.endsWith("/retencao") ? LISTA
        : url.endsWith("/retencao/agenda") ? AGENDA
        : url.endsWith("/retencao/1") ? { ...LISTA.find((e) => e.id === 1), visitas: [], contatos: [], demandas: [] }
        : {},
    }));
  });

  it("a aba Agenda carrega /retencao/agenda e some ao voltar", async () => {
    montar();
    await waitFor(() => expect(screen.getByText("ACME")).toBeInTheDocument());
    expect(chamadasAgenda()).toHaveLength(0);
    fireEvent.click(screen.getByRole("tab", { name: "Agenda" }));
    await waitFor(() => expect(screen.getByRole("region", { name: "Ações vencidas" })).toBeInTheDocument());
    expect(chamadasAgenda().at(-1)[1].params).toEqual({ dias: 7 });
    fireEvent.click(screen.getByRole("tab", { name: "Acompanhadas" }));
    expect(screen.queryByRole("region", { name: "Ações vencidas" })).toBeNull();
  });

  it("clicar num item da agenda abre o drawer da empresa da lista", async () => {
    montar();
    await waitFor(() => expect(screen.getByText("ACME")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("tab", { name: "Agenda" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Abrir ACME" })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Abrir ACME" }));
    await waitFor(() => expect(api.get.mock.calls.some(([u]) => u.endsWith("/retencao/1"))).toBe(true));  // loadDetalhe da empresa 1
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/pages/desenvolvimento-economico/GestaoEmpresarialTab.test.jsx`
Expected: os 2 novos falham (`Unable to find role="tab" and name "Agenda"`); os 12 antigos passam.

- [ ] **Step 3: Implementar**

1. Import — após `import DescobrirRfb from "./DescobrirRfb";`: `import AgendaTab from "./AgendaTab";`
2. Estado — após `const [refreshDescoberta, setRefreshDescoberta] = useState(0);`:
```jsx
  // Incrementado ao salvar cadastro e a cada alteração feita no drawer
  // (contato, visita, demanda, próxima ação): a agenda depende de tudo isso.
  const [refreshAgenda, setRefreshAgenda] = useState(0);
```
3. `load()` passa a devolver a lista — trocar o corpo por:
```jsx
  async function load() {
    try {
      const res = await api.get("/desenvolvimento-economico/retencao");
      const lista = res.data || [];
      setEmpresas(lista);
      return lista;
    } catch (err) {
      console.error(err);
      return [];
    } finally {
      setLoading(false);
    }
  }
```
4. Após `abrirEmpresa`:
```jsx
  // A agenda só conhece o id: acha a empresa na lista já carregada; se a
  // lista ainda não chegou (ou está velha), recarrega e procura de novo.
  async function abrirPorId(id) {
    const achada = empresas.find((e) => e.id === id) || (await load()).find((e) => e.id === id);
    if (achada) abrirEmpresa(achada);
    else addToast("Empresa não encontrada — atualize a página", "error");
  }
```
5. `handleSubmit` — após `setRefreshDescoberta((n) => n + 1);` acrescentar `setRefreshAgenda((n) => n + 1);`
6. `NidTabBar` — `tabs={["Acompanhadas", "Descobrir na base RFB", "Agenda"]}`; logo após o bloco `{aba === 1 && (...)}` (antes de `{aba === 0 && (<>`), inserir:
```jsx
      {aba === 2 && (
        <AgendaTab onAbrirEmpresa={abrirPorId} refreshKey={refreshAgenda} />
      )}

```
7. `EmpresaDrawer` — `onChanged={async (id) => { await loadDetalhe(id); await load(); }}` → `onChanged={async (id) => { await loadDetalhe(id); await load(); setRefreshAgenda((n) => n + 1); }}`

- [ ] **Step 4: Rodar e ver passar; suíte do front**

Run: `npx vitest run src/pages/desenvolvimento-economico/GestaoEmpresarialTab.test.jsx` → 14 passed.
Run: `npx vitest run` → `458 passed` (449 + 7 + 2).

- [ ] **Step 5: Commit**

```bash
git add frontend-observatorio/src/pages/desenvolvimento-economico/GestaoEmpresarialTab.jsx frontend-observatorio/src/pages/desenvolvimento-economico/GestaoEmpresarialTab.test.jsx
git commit -F <msg>   # "feat(gestao-empresarial): aba Agenda na Gestao Empresarial com abertura da empresa por id"
```

---

### Task 7: "Desde" e "ver histórico" na aba Demandas do drawer

**Files:**
- Modify: `frontend-observatorio/src/pages/desenvolvimento-economico/EmpresaDrawer.jsx` (helpers após `fmtBRL`; estado após `acaoForm`; aba Demandas, bloco de cada demanda)
- Test: `frontend-observatorio/src/pages/desenvolvimento-economico/EmpresaDrawer.test.jsx` (ampliar `DETALHE.demandas`; 2 testes)

**Interfaces:**
- Consumes (Task 2): `detalhe.demandas[].historico[{de, para, alterado_em, alterado_por_nome}]`.
- Produces: nada.

- [ ] **Step 1: Escrever os testes (falhando)**

Em `EmpresaDrawer.test.jsx`, trocar a linha `demandas: [{ id: 3, descricao: "Iluminação da via", status: "aberta", data_registro: "2026-08-02", responsavel: null }],` por:

```jsx
  demandas: [
    { id: 3, descricao: "Iluminação da via", status: "aberta", data_registro: "2026-08-02", responsavel: null,
      historico: [
        { de: null, para: "aberta", alterado_em: "2026-08-02T12:00:00+00:00", alterado_por_nome: "Ana" },
      ] },
    { id: 4, descricao: "Poda de árvores", status: "em_andamento", data_registro: "2026-07-01", responsavel: null,
      historico: [] },
  ],
```

Acrescentar ao fim do arquivo:

```jsx
describe("EmpresaDrawer — histórico de status das demandas", () => {
  it("mostra 'desde' pela última transição e expande o histórico", () => {
    montar();
    fireEvent.click(screen.getByRole("tab", { name: /Demandas/ }));
    expect(screen.getByText(/Aberta desde 02\/08\/2026/)).toBeInTheDocument();
    const botao = screen.getByRole("button", { name: "ver histórico de Iluminação da via" });
    expect(botao).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(botao);
    expect(botao).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText(/criada como Aberta · Ana/)).toBeInTheDocument();
  });

  it("demanda sem histórico usa a data de registro e avisa", () => {
    montar();
    fireEvent.click(screen.getByRole("tab", { name: /Demandas/ }));
    expect(screen.getByText(/Em andamento desde 01\/07\/2026/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "ver histórico de Poda de árvores" }));
    expect(screen.getByText("Sem histórico registrado (anterior a set/2026).")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/pages/desenvolvimento-economico/EmpresaDrawer.test.jsx`
Expected: os 2 novos falham; os 13 antigos passam (o teste "muda status da demanda via PUT" continua achando `Status da demanda Iluminação da via`).

- [ ] **Step 3: Implementar**

Após `function fmtBRL(v) {...}`:

```jsx
function fmtDateTime(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
const rotuloStatus = (s) => STATUS_DEMANDA[s]?.label || s;
// "Status desde": última transição do histórico; demandas anteriores à
// migração 0041 não têm histórico e caem na data de registro.
const statusDesde = (d) => (d.historico?.length ? d.historico[d.historico.length - 1].alterado_em.slice(0, 10) : d.data_registro);
```

Estado, após `const [acaoForm, setAcaoForm] = useState(null); ...`:

```jsx
  const [historicoAberto, setHistoricoAberto] = useState({}); // { [demandaId]: bool }
```

Na aba Demandas, logo após o `<p className="text-[11px] text-slate-400">{fmtDate(d.data_registro)}{d.responsavel && ` · ${d.responsavel}`}</p>` de cada demanda, inserir:

```jsx
                        <p className="text-[11px] text-slate-400">
                          {st.label} desde {fmtDate(statusDesde(d))}
                          {" · "}
                          <button
                            type="button"
                            aria-label={`ver histórico de ${d.descricao}`}
                            aria-expanded={Boolean(historicoAberto[d.id])}
                            onClick={() => setHistoricoAberto((p) => ({ ...p, [d.id]: !p[d.id] }))}
                            className="text-blue-600 hover:text-blue-700 cursor-pointer"
                          >
                            {historicoAberto[d.id] ? "ocultar histórico" : "ver histórico"}
                          </button>
                        </p>
                        {historicoAberto[d.id] && (
                          (d.historico || []).length === 0 ? (
                            <p className="text-[11px] text-slate-400">Sem histórico registrado (anterior a set/2026).</p>
                          ) : (
                            <ul className="text-[11px] text-[var(--text-dim)] space-y-0.5">
                              {d.historico.map((h, i) => (
                                <li key={i}>
                                  {fmtDateTime(h.alterado_em)} · {h.de ? `${rotuloStatus(h.de)} → ${rotuloStatus(h.para)}` : `criada como ${rotuloStatus(h.para)}`}{h.alterado_por_nome && ` · ${h.alterado_por_nome}`}
                                </li>
                              ))}
                            </ul>
                          )
                        )}
```

- [ ] **Step 4: Rodar e ver passar; suíte do front**

Run: `npx vitest run src/pages/desenvolvimento-economico/EmpresaDrawer.test.jsx` → 15 passed.
Run: `npx vitest run` → `460 passed`.

- [ ] **Step 5: Commit**

```bash
git add frontend-observatorio/src/pages/desenvolvimento-economico/EmpresaDrawer.jsx frontend-observatorio/src/pages/desenvolvimento-economico/EmpresaDrawer.test.jsx
git commit -F <msg>   # "feat(gestao-empresarial): status desde e historico de transicoes na aba Demandas do drawer"
```

---

### Task 8: Fechamento — suítes completas e notas de deploy

**Files:** nenhum novo.

- [ ] **Step 1: Suítes completas**

Run (raiz): `venv/Scripts/python -m pytest backend/tests -p no:warnings` → `617 passed`.
Run (`frontend-observatorio/`): `npx vitest run` → `460 passed`.
Run (`backend/`): `../venv/Scripts/alembic heads` → `0041_demanda_status_historico (head)`.

- [ ] **Step 2: Anotar para o relato final (não é código)**

- **Migração `0041`** roda no deploy da api (worker não é afetado); deploy api + front juntos. Front novo contra api velha: aba Agenda mostra o alerta de erro; drawer mostra "Sem histórico registrado".
- Demandas anteriores ao deploy não têm histórico: "desde" cai em `data_registro` e o drawer avisa.
- Checklist visual: aba Agenda com KPIs e seis blocos; seletor 7/14/30; clique abre o drawer; registrar contato/mudar status no drawer atualiza a agenda ao fechar; drawer mostra "desde" e "ver histórico"; municípios demo listam quase todas as empresas em "Sem contato 90 d+" (esperado); base de produção nasce quase vazia (0 demandas, 0 próximas ações) — o aviso geral orienta o que registrar.
