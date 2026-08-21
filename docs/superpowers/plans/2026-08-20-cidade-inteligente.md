# Cidade Inteligente v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Módulo novo de acompanhamento genérico de certificações de cidade (ISO/ABNT e afins): 2 tabelas, router com gate de plano `cidade_inteligente`, página no Eixo 2 com cards de progresso e drawer de requisitos.

**Architecture:** Migração 0040 cria `certificacao_cidade` + `certificacao_requisito` (CASCADE); router `/cidade-inteligente` replica os moldes da F3 (listagem view-as via `get_current_user`, escrita via `require_permissao("cidade_inteligente", ...)` com tenancy inline) e devolve contadores de progresso agregados; front ganha `CidadeInteligentePage` (cards) + `CertificacaoDrawer` (NidDrawer com tabela de requisitos e CRUD inline); navegação/plano/permissões ganham a chave nova com invariantes atualizados de propósito.

**Tech Stack:** FastAPI + SQLAlchemy 2 + Alembic + Pydantic v2 + pytest (handlers diretos, sqlite in-memory); React 19 + react-router-dom v7 + Tailwind tokens + Vitest/Testing Library.

**Spec:** `docs/superpowers/specs/2026-08-20-cidade-inteligente-design.md`

## Global Constraints

- Sem seed de norma: NENHUM indicador ISO/ABNT embutido (conteúdo protegido).
- Chave de plano/permissão/rota: `cidade_inteligente` / `/app/cidade-inteligente` / prefixo backend `/cidade-inteligente`. Label sidebar e título: "Cidade Inteligente".
- Status de requisito: `pendente | em_andamento | atendido` (Literal no schema; default `pendente`).
- `evidencia_url`: aceita só `http://`/`https://` (400 legível), `""` normaliza para None (update com `""` limpa) — mesma regra do link do marco (`marcos.py`).
- Invariantes de nav mudam DE PROPÓSITO na Task 4: `NAV_FLAT` 32 → 33, `ROTA_MODULO` ganha o par novo — testes atualizados no MESMO commit do navStructure.
- Git: `git add` caminho a caminho, NUNCA `-A`/`.`. Proibido: .claude/settings.local.json, dados/, node_modules/. Todo commit termina com:
  `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`
  `Claude-Session: https://claude.ai/code/session_01N95ZNhrEvp4fMuUrkksoaq`
- Suites: backend `venv/Scripts/python -m pytest backend/tests -q` da RAIZ via Bash/git-bash (NUNCA PowerShell); frontend `npx vitest run` de frontend-observatorio/. Baselines: back 467, front 386 — só crescem.
- Lint não é gate; critério: arquivo tocado sem erro NOVO vs base (falso-positivo `motion` unused aceito; `react-hooks/set-state-in-effect` NOVO é erro real).

---

## Estrutura de arquivos

| Arquivo | Papel | Task |
|---|---|---|
| Create `backend/alembic/versions/0040_cidade_inteligente.py` | Migração | 1 |
| Create `backend/app/models/cidade_inteligente.py` | 2 models | 1 |
| Test `backend/tests/test_cidade_inteligente_models.py` | roundtrip + cascade | 1 |
| Create `backend/app/schemas/cidade_inteligente.py` | schemas | 2 |
| Create `backend/app/api/v1/routers/cidade_inteligente.py` | router | 2 |
| Modify `backend/app/main.py` | import + include_router | 2 |
| Test `backend/tests/test_cidade_inteligente_endpoints.py` | 12 testes | 2 |
| Create `frontend-observatorio/src/pages/cidade-inteligente/CidadeInteligentePage.jsx` | página | 3 |
| Create `frontend-observatorio/src/pages/cidade-inteligente/CertificacaoDrawer.jsx` | drawer | 3 |
| Test `.../CidadeInteligentePage.test.jsx` + `.../CertificacaoDrawer.test.jsx` | 8 testes | 3 |
| Modify `navStructure.jsx`, `navStructure.test.js`, `AppRouter.jsx`, `PlanoConfigAdminPage.jsx`, `RolesAdminPage.jsx`, `titulosPaginas.test.js` | integração | 4 |

Branch: `feat/cidade-inteligente` a partir de `main`.

---

### Task 1: Migração 0040 + models

**Files:**
- Create: `backend/alembic/versions/0040_cidade_inteligente.py`
- Create: `backend/app/models/cidade_inteligente.py`
- Modify: `backend/app/models/__init__.py` (import dos 2 models, padrão do arquivo)
- Test: `backend/tests/test_cidade_inteligente_models.py`

**Interfaces:**
- Produces (Task 2 consome): models `CertificacaoCidade` (campos: id, municipio_id, nome, entidade, descricao, ativo, criado_em, atualizado_em; relationship `requisitos` cascade delete-orphan) e `CertificacaoRequisito` (id, certificacao_id, titulo, categoria, status, responsavel, evidencia_url, evidencia_nota, criado_em, atualizado_em; relationship `certificacao`).

- [ ] **Step 1: Teste que falha**

```python
"""Models do Cidade Inteligente: roundtrip e cascade de requisitos."""
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

import app.models  # noqa: F401
from app.db.base import Base
from app.models.cidade_inteligente import CertificacaoCidade, CertificacaoRequisito
from app.models.municipio import Municipio


@pytest.fixture()
def db():
    engine = create_engine("sqlite://")
    Base.metadata.create_all(engine, tables=[
        Municipio.__table__, CertificacaoCidade.__table__, CertificacaoRequisito.__table__,
    ])
    s = sessionmaker(bind=engine)()
    yield s
    s.close()


def test_roundtrip_com_defaults(db):
    m = Municipio(nome="Alfa", estado="MG")
    db.add(m); db.flush()
    cert = CertificacaoCidade(municipio_id=m.id, nome="ABNT NBR ISO 37122", entidade="ABNT")
    cert.requisitos.append(CertificacaoRequisito(titulo="Plano diretor digital"))
    db.add(cert); db.commit()

    salvo = db.query(CertificacaoCidade).one()
    assert salvo.ativo is True
    assert salvo.criado_em is not None
    req = salvo.requisitos[0]
    assert req.status == "pendente"
    assert req.evidencia_url is None


def test_delete_certificacao_leva_requisitos(db):
    m = Municipio(nome="Alfa", estado="MG")
    db.add(m); db.flush()
    cert = CertificacaoCidade(municipio_id=m.id, nome="Selo X")
    cert.requisitos.append(CertificacaoRequisito(titulo="R1"))
    db.add(cert); db.commit()

    db.delete(cert); db.commit()
    assert db.query(CertificacaoRequisito).count() == 0
```

- [ ] **Step 2: Rodar e ver falhar**

Run (Bash, raiz): `venv/Scripts/python -m pytest backend/tests/test_cidade_inteligente_models.py -q`
Expected: FAIL — módulo inexistente

- [ ] **Step 3: Models**

Criar `backend/app/models/cidade_inteligente.py`:

```python
from datetime import date, datetime, timezone

from app.db.base import Base
from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship


class CertificacaoCidade(Base):
    """Certificação/selo de cidade que o município acompanha (ISO/ABNT e
    afins). Estrutura genérica de propósito: nada da norma é embutido —
    as listas de indicadores ISO/ABNT são conteúdo protegido."""
    __tablename__ = "certificacao_cidade"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    municipio_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("municipios.id"), nullable=False, index=True
    )

    nome: Mapped[str] = mapped_column(String(150), nullable=False)
    entidade: Mapped[str | None] = mapped_column(String(100), nullable=True)
    descricao: Mapped[str | None] = mapped_column(Text, nullable=True)
    ativo: Mapped[bool] = mapped_column(Boolean, default=True)

    criado_em: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    atualizado_em: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    municipio = relationship("Municipio")
    requisitos = relationship(
        "CertificacaoRequisito", back_populates="certificacao", cascade="all, delete-orphan"
    )


class CertificacaoRequisito(Base):
    """Requisito perseguido dentro de uma certificação."""
    __tablename__ = "certificacao_requisito"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    certificacao_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("certificacao_cidade.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )

    titulo: Mapped[str] = mapped_column(String(200), nullable=False)
    categoria: Mapped[str | None] = mapped_column(String(100), nullable=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pendente")  # pendente|em_andamento|atendido
    responsavel: Mapped[str | None] = mapped_column(String(120), nullable=True)
    evidencia_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    evidencia_nota: Mapped[str | None] = mapped_column(Text, nullable=True)

    criado_em: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    atualizado_em: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    certificacao = relationship("CertificacaoCidade", back_populates="requisitos")
```

Registrar no `backend/app/models/__init__.py` seguindo o padrão do arquivo (import das 2 classes).

- [ ] **Step 4: Migração**

Criar `backend/alembic/versions/0040_cidade_inteligente.py` (formato exato da 0038):

```python
"""cidade inteligente: certificacoes de cidade e requisitos

Revision ID: 0040_cidade_inteligente
Revises: 0039_marco_link
Create Date: 2026-08-20

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '0040_cidade_inteligente'
down_revision = '0039_marco_link'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table('certificacao_cidade',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('municipio_id', sa.Integer(), nullable=False),
    sa.Column('nome', sa.String(length=150), nullable=False),
    sa.Column('entidade', sa.String(length=100), nullable=True),
    sa.Column('descricao', sa.Text(), nullable=True),
    sa.Column('ativo', sa.Boolean(), nullable=True),
    sa.Column('criado_em', sa.DateTime(timezone=True), nullable=False),
    sa.Column('atualizado_em', sa.DateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['municipio_id'], ['municipios.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_certificacao_cidade_id'), 'certificacao_cidade', ['id'], unique=False)
    op.create_index(op.f('ix_certificacao_cidade_municipio_id'), 'certificacao_cidade', ['municipio_id'], unique=False)

    op.create_table('certificacao_requisito',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('certificacao_id', sa.Integer(), nullable=False),
    sa.Column('titulo', sa.String(length=200), nullable=False),
    sa.Column('categoria', sa.String(length=100), nullable=True),
    sa.Column('status', sa.String(length=20), nullable=False, server_default='pendente'),
    sa.Column('responsavel', sa.String(length=120), nullable=True),
    sa.Column('evidencia_url', sa.Text(), nullable=True),
    sa.Column('evidencia_nota', sa.Text(), nullable=True),
    sa.Column('criado_em', sa.DateTime(timezone=True), nullable=False),
    sa.Column('atualizado_em', sa.DateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['certificacao_id'], ['certificacao_cidade.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_certificacao_requisito_certificacao_id'), 'certificacao_requisito', ['certificacao_id'], unique=False)
    op.create_index(op.f('ix_certificacao_requisito_id'), 'certificacao_requisito', ['id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_certificacao_requisito_id'), table_name='certificacao_requisito')
    op.drop_index(op.f('ix_certificacao_requisito_certificacao_id'), table_name='certificacao_requisito')
    op.drop_table('certificacao_requisito')

    op.drop_index(op.f('ix_certificacao_cidade_municipio_id'), table_name='certificacao_cidade')
    op.drop_index(op.f('ix_certificacao_cidade_id'), table_name='certificacao_cidade')
    op.drop_table('certificacao_cidade')
```

- [ ] **Step 5: Rodar os testes novos e ver passar**

Run: `venv/Scripts/python -m pytest backend/tests/test_cidade_inteligente_models.py -q`
Expected: PASS (2)

- [ ] **Step 6: Suite backend completa**

Run: `venv/Scripts/python -m pytest backend/tests -q`
Expected: 467 + 2 = 469 (reportar o exato)

- [ ] **Step 7: Commit**

```bash
git add backend/alembic/versions/0040_cidade_inteligente.py backend/app/models/cidade_inteligente.py backend/app/models/__init__.py backend/tests/test_cidade_inteligente_models.py
git commit -m "feat(cidade-inteligente): models e migracao 0040 (certificacoes e requisitos)"
```
(trailers das Global Constraints)

---

### Task 2: Schemas + router + registro

**Files:**
- Create: `backend/app/schemas/cidade_inteligente.py`
- Create: `backend/app/api/v1/routers/cidade_inteligente.py`
- Modify: `backend/app/main.py` (import ~L8 + include_router após benchmark.router ~L148)
- Test: `backend/tests/test_cidade_inteligente_endpoints.py`

**Interfaces:**
- Consumes (Task 1): `CertificacaoCidade`, `CertificacaoRequisito`.
- Consumes (existentes): `scoped_modulo`, `require_permissao`, `get_current_user`, `get_db` de `app.api.deps`; `NotFoundException`, `ForbiddenException` de `app.core.exceptions`.
- Produces (Task 3): `GET /cidade-inteligente/certificacoes` → `[CertificacaoResumoOut{id, nome, entidade, descricao, total, atendidos, em_andamento, pendentes}]`; `GET /cidade-inteligente/certificacoes/{id}` → `CertificacaoOut` (mesmos campos + `requisitos: [RequisitoOut]`); POST/PUT/DELETE de certificação e `POST /certificacoes/{id}/requisitos`, `PUT/DELETE /requisitos/{rid}`.

- [ ] **Step 1: Teste que falha**

Criar `backend/tests/test_cidade_inteligente_endpoints.py`:

```python
"""Endpoints do Cidade Inteligente: CRUD, tenancy, permissões, progresso,
validação de evidência e view-as — moldes da F3 (contatos/demandas)."""
import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

import app.models  # noqa: F401
from app.core.exceptions import ForbiddenException, NotFoundException
from app.db.base import Base
from app.models.cidade_inteligente import CertificacaoCidade, CertificacaoRequisito
from app.models.municipio import Municipio
from app.models.role import Role
from app.models.usuario import Usuario
from app.schemas.cidade_inteligente import (
    CertificacaoCreate, CertificacaoUpdate, RequisitoCreate, RequisitoUpdate,
)


@pytest.fixture()
def ctx():
    engine = create_engine("sqlite://")
    Base.metadata.create_all(engine, tables=[
        Municipio.__table__, Role.__table__, Usuario.__table__,
        CertificacaoCidade.__table__, CertificacaoRequisito.__table__,
    ])
    db = sessionmaker(bind=engine)()
    role_g = Role(nome="ADMIN_GLOBAL", builtin=True, permissoes={})
    role_m = Role(nome="GESTOR", builtin=False,
                  permissoes={"cidade_inteligente": ["criar", "editar", "excluir"]})
    role_sem = Role(nome="LEITOR", builtin=False, permissoes={})
    m1 = Municipio(nome="Alfa", estado="MG")
    m2 = Municipio(nome="Beta", estado="MG")
    db.add_all([role_g, role_m, role_sem, m1, m2])
    db.flush()
    admin = Usuario(nome="G", email="g@x.com", senha_hash="x", role_id=role_g.id)
    u1 = Usuario(nome="U1", email="u1@x.com", senha_hash="x", role_id=role_m.id, municipio_id=m1.id)
    u2 = Usuario(nome="U2", email="u2@x.com", senha_hash="x", role_id=role_m.id, municipio_id=m2.id)
    leitor = Usuario(nome="L", email="l@x.com", senha_hash="x", role_id=role_sem.id, municipio_id=m1.id)
    db.add_all([admin, u1, u2, leitor])
    db.commit()
    yield db, admin, u1, u2, leitor, m1, m2
    db.close()


def _criar_cert(db, user, **kw):
    from app.api.v1.routers.cidade_inteligente import criar_certificacao
    data = CertificacaoCreate(nome=kw.pop("nome", "ISO 37122"), **kw)
    return criar_certificacao(data, db=db, current_user=user)


def _add_req(db, user, cert_id, **kw):
    from app.api.v1.routers.cidade_inteligente import adicionar_requisito
    data = RequisitoCreate(titulo=kw.pop("titulo", "R"), **kw)
    return adicionar_requisito(cert_id, data, db=db, current_user=user)


def test_criar_e_listar_com_contadores(ctx):
    from app.api.v1.routers.cidade_inteligente import listar_certificacoes
    db, _, u1, *_ = ctx
    cert = _criar_cert(db, u1, entidade="ABNT")
    _add_req(db, u1, cert.id, titulo="A", status="atendido")
    _add_req(db, u1, cert.id, titulo="B", status="em_andamento")
    _add_req(db, u1, cert.id, titulo="C")
    out = listar_certificacoes(municipio_id=None, db=db, current_user=u1)
    assert len(out) == 1
    r = out[0]
    assert (r.total, r.atendidos, r.em_andamento, r.pendentes) == (3, 1, 1, 1)


def test_listar_nao_vaza_outro_municipio(ctx):
    from app.api.v1.routers.cidade_inteligente import listar_certificacoes
    db, _, u1, u2, *_ = ctx
    _criar_cert(db, u1)
    # u2 não vê a certificação de m1; e o query param não fura o escopo
    assert listar_certificacoes(municipio_id=None, db=db, current_user=u2) == []
    assert listar_certificacoes(municipio_id=1, db=db, current_user=u2) == []


def test_view_as_global_le_por_municipio(ctx):
    from app.api.v1.routers.cidade_inteligente import listar_certificacoes
    db, admin, u1, _, _, m1, m2 = ctx
    _criar_cert(db, u1)
    assert len(listar_certificacoes(municipio_id=m1.id, db=db, current_user=admin)) == 1
    assert listar_certificacoes(municipio_id=m2.id, db=db, current_user=admin) == []


def test_detalhe_com_requisitos_e_tenancy(ctx):
    from app.api.v1.routers.cidade_inteligente import detalhe_certificacao
    db, _, u1, u2, *_ = ctx
    cert = _criar_cert(db, u1)
    _add_req(db, u1, cert.id, titulo="Z", categoria="Energia")
    out = detalhe_certificacao(cert.id, db=db, current_user=u1)
    assert [r.titulo for r in out.requisitos] == ["Z"]
    with pytest.raises(ForbiddenException):
        detalhe_certificacao(cert.id, db=db, current_user=u2)


def test_sem_permissao_nao_cria(ctx):
    db, _, _, _, leitor, *_ = ctx
    with pytest.raises(HTTPException) as exc:
        _criar_cert(db, leitor)
    assert exc.value.status_code == 403


def test_status_invalido_rejeitado_no_schema():
    with pytest.raises(Exception):
        RequisitoCreate(titulo="X", status="feito")


def test_evidencia_url_validada(ctx):
    db, _, u1, *_ = ctx
    cert = _criar_cert(db, u1)
    with pytest.raises(HTTPException) as exc:
        _add_req(db, u1, cert.id, evidencia_url="ftp://x")
    assert exc.value.status_code == 400
    ok = _add_req(db, u1, cert.id, evidencia_url="https://doc.gov.br/x")
    assert ok.evidencia_url == "https://doc.gov.br/x"
    vazio = _add_req(db, u1, cert.id, evidencia_url="")
    assert vazio.evidencia_url is None


def test_update_requisito_e_limpar_evidencia(ctx):
    from app.api.v1.routers.cidade_inteligente import atualizar_requisito
    db, _, u1, *_ = ctx
    cert = _criar_cert(db, u1)
    req = _add_req(db, u1, cert.id, evidencia_url="https://x.gov.br")
    upd = atualizar_requisito(req.id, RequisitoUpdate(status="atendido"), db=db, current_user=u1)
    assert upd.status == "atendido" and upd.evidencia_url == "https://x.gov.br"
    limpo = atualizar_requisito(req.id, RequisitoUpdate(evidencia_url=""), db=db, current_user=u1)
    assert limpo.evidencia_url is None


def test_update_requisito_tenancy(ctx):
    from app.api.v1.routers.cidade_inteligente import atualizar_requisito
    db, _, u1, u2, *_ = ctx
    cert = _criar_cert(db, u1)
    req = _add_req(db, u1, cert.id)
    with pytest.raises(ForbiddenException):
        atualizar_requisito(req.id, RequisitoUpdate(status="atendido"), db=db, current_user=u2)


def test_excluir_certificacao_leva_requisitos(ctx):
    from app.api.v1.routers.cidade_inteligente import excluir_certificacao
    db, _, u1, *_ = ctx
    cert = _criar_cert(db, u1)
    _add_req(db, u1, cert.id)
    excluir_certificacao(cert.id, db=db, current_user=u1)
    assert db.query(CertificacaoRequisito).count() == 0


def test_atualizar_certificacao(ctx):
    from app.api.v1.routers.cidade_inteligente import atualizar_certificacao
    db, _, u1, *_ = ctx
    cert = _criar_cert(db, u1)
    upd = atualizar_certificacao(cert.id, CertificacaoUpdate(descricao="meta 2027"), db=db, current_user=u1)
    assert upd.descricao == "meta 2027" and upd.nome == "ISO 37122"


def test_rota_registrada_no_app():
    from app.main import app
    paths = app.openapi()["paths"]
    assert "/api/v1/cidade-inteligente/certificacoes" in paths
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `venv/Scripts/python -m pytest backend/tests/test_cidade_inteligente_endpoints.py -q`
Expected: FAIL — schemas/router inexistentes

- [ ] **Step 3: Schemas**

Criar `backend/app/schemas/cidade_inteligente.py`:

```python
"""Schemas do Cidade Inteligente. Status como Literal: valor fora do enum
morre na validação, não no banco."""
from typing import Literal, Optional

from pydantic import BaseModel

StatusRequisito = Literal["pendente", "em_andamento", "atendido"]


class RequisitoCreate(BaseModel):
    titulo: str
    categoria: Optional[str] = None
    status: StatusRequisito = "pendente"
    responsavel: Optional[str] = None
    evidencia_url: Optional[str] = None
    evidencia_nota: Optional[str] = None


class RequisitoUpdate(BaseModel):
    titulo: Optional[str] = None
    categoria: Optional[str] = None
    status: Optional[StatusRequisito] = None
    responsavel: Optional[str] = None
    evidencia_url: Optional[str] = None
    evidencia_nota: Optional[str] = None


class RequisitoOut(BaseModel):
    id: int
    certificacao_id: int
    titulo: str
    categoria: Optional[str]
    status: str
    responsavel: Optional[str]
    evidencia_url: Optional[str]
    evidencia_nota: Optional[str]

    model_config = {"from_attributes": True}


class CertificacaoCreate(BaseModel):
    nome: str
    entidade: Optional[str] = None
    descricao: Optional[str] = None


class CertificacaoUpdate(BaseModel):
    nome: Optional[str] = None
    entidade: Optional[str] = None
    descricao: Optional[str] = None
    ativo: Optional[bool] = None


class CertificacaoResumoOut(BaseModel):
    id: int
    nome: str
    entidade: Optional[str]
    descricao: Optional[str]
    total: int
    atendidos: int
    em_andamento: int
    pendentes: int

    model_config = {"from_attributes": True}


class CertificacaoOut(CertificacaoResumoOut):
    requisitos: list[RequisitoOut] = []
```

- [ ] **Step 4: Router**

Criar `backend/app/api/v1/routers/cidade_inteligente.py`:

```python
"""Cidade Inteligente — acompanhamento genérico de certificações de cidade.
Leitura com gate de plano (scoped_modulo) e view-as; escrita por permissão
de área + tenancy inline (moldes da Gestão Empresarial/F3)."""
from app.api.deps import get_current_user, get_db, require_permissao, scoped_modulo
from app.core.exceptions import ForbiddenException, NotFoundException
from app.models.cidade_inteligente import CertificacaoCidade, CertificacaoRequisito
from app.models.usuario import Usuario
from app.schemas.cidade_inteligente import (
    CertificacaoCreate,
    CertificacaoOut,
    CertificacaoResumoOut,
    CertificacaoUpdate,
    RequisitoCreate,
    RequisitoOut,
    RequisitoUpdate,
)
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import case, func
from sqlalchemy.orm import Session, selectinload

router = APIRouter(prefix="/cidade-inteligente", tags=["Cidade Inteligente"])


def _normaliza_evidencia(url: str | None) -> str | None:
    """Mesma regra do link do marco: http(s) ou 400; '' limpa (vira None)."""
    if url is None:
        return None
    url = url.strip()
    if not url:
        return None
    if not (url.startswith("http://") or url.startswith("https://")):
        raise HTTPException(status_code=400, detail="Evidência deve começar com http:// ou https://.")
    return url


def _resumo_query(db: Session):
    return (
        db.query(
            CertificacaoCidade,
            func.count(CertificacaoRequisito.id).label("total"),
            func.sum(case((CertificacaoRequisito.status == "atendido", 1), else_=0)).label("atendidos"),
            func.sum(case((CertificacaoRequisito.status == "em_andamento", 1), else_=0)).label("em_andamento"),
            func.sum(case((CertificacaoRequisito.status == "pendente", 1), else_=0)).label("pendentes"),
        )
        .outerjoin(CertificacaoRequisito, CertificacaoRequisito.certificacao_id == CertificacaoCidade.id)
        .filter(CertificacaoCidade.ativo.is_(True))
        .group_by(CertificacaoCidade.id)
    )


def _resumo_out(cert, total, atendidos, em_andamento, pendentes) -> CertificacaoResumoOut:
    return CertificacaoResumoOut(
        id=cert.id, nome=cert.nome, entidade=cert.entidade, descricao=cert.descricao,
        total=int(total or 0), atendidos=int(atendidos or 0),
        em_andamento=int(em_andamento or 0), pendentes=int(pendentes or 0),
    )


@router.get("/certificacoes", response_model=list[CertificacaoResumoOut])
def listar_certificacoes(
    municipio_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    q = _resumo_query(db)
    if current_user.role.nome != "ADMIN_GLOBAL":
        q = q.filter(CertificacaoCidade.municipio_id == current_user.municipio_id)
    elif municipio_id is not None:
        q = q.filter(CertificacaoCidade.municipio_id == municipio_id)
    else:
        return []
    linhas = q.order_by(CertificacaoCidade.nome).all()
    return [_resumo_out(*linha) for linha in linhas]


@router.get("/certificacoes/{cert_id}", response_model=CertificacaoOut)
def detalhe_certificacao(
    cert_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    cert = (
        db.query(CertificacaoCidade)
        .options(selectinload(CertificacaoCidade.requisitos))
        .filter(CertificacaoCidade.id == cert_id)
        .first()
    )
    if not cert:
        raise NotFoundException("Certificação não encontrada")
    if current_user.role.nome != "ADMIN_GLOBAL" and cert.municipio_id != current_user.municipio_id:
        raise ForbiddenException("Acesso negado")
    reqs = sorted(cert.requisitos, key=lambda r: ((r.categoria or "").lower(), r.titulo.lower()))
    contagem = {"atendido": 0, "em_andamento": 0, "pendente": 0}
    for r in reqs:
        contagem[r.status] = contagem.get(r.status, 0) + 1
    return CertificacaoOut(
        id=cert.id, nome=cert.nome, entidade=cert.entidade, descricao=cert.descricao,
        total=len(reqs), atendidos=contagem["atendido"],
        em_andamento=contagem["em_andamento"], pendentes=contagem["pendente"],
        requisitos=[RequisitoOut.model_validate(r) for r in reqs],
    )


@router.post("/certificacoes", response_model=CertificacaoResumoOut)
def criar_certificacao(
    data: CertificacaoCreate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_permissao("cidade_inteligente", "criar")),
):
    cert = CertificacaoCidade(municipio_id=current_user.municipio_id, **data.model_dump())
    db.add(cert)
    db.commit()
    db.refresh(cert)
    return _resumo_out(cert, 0, 0, 0, 0)


@router.put("/certificacoes/{cert_id}", response_model=CertificacaoResumoOut)
def atualizar_certificacao(
    cert_id: int,
    data: CertificacaoUpdate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_permissao("cidade_inteligente", "editar")),
):
    cert = db.get(CertificacaoCidade, cert_id)
    if not cert:
        raise NotFoundException("Certificação não encontrada")
    if current_user.role.nome != "ADMIN_GLOBAL" and cert.municipio_id != current_user.municipio_id:
        raise ForbiddenException("Acesso negado")
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(cert, field, value)
    db.commit()
    db.refresh(cert)
    linha = _resumo_query(db).filter(CertificacaoCidade.id == cert.id).first()
    return _resumo_out(*linha)


@router.delete("/certificacoes/{cert_id}")
def excluir_certificacao(
    cert_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_permissao("cidade_inteligente", "excluir")),
):
    cert = db.get(CertificacaoCidade, cert_id)
    if not cert:
        raise NotFoundException("Certificação não encontrada")
    if current_user.role.nome != "ADMIN_GLOBAL" and cert.municipio_id != current_user.municipio_id:
        raise ForbiddenException("Acesso negado")
    db.delete(cert)
    db.commit()
    return {"ok": True}


@router.post("/certificacoes/{cert_id}/requisitos", response_model=RequisitoOut)
def adicionar_requisito(
    cert_id: int,
    data: RequisitoCreate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_permissao("cidade_inteligente", "editar")),
):
    cert = db.get(CertificacaoCidade, cert_id)
    if not cert:
        raise NotFoundException("Certificação não encontrada")
    if current_user.role.nome != "ADMIN_GLOBAL" and cert.municipio_id != current_user.municipio_id:
        raise ForbiddenException("Acesso negado")
    payload = data.model_dump()
    payload["evidencia_url"] = _normaliza_evidencia(payload.get("evidencia_url"))
    req = CertificacaoRequisito(certificacao_id=cert.id, **payload)
    db.add(req)
    db.commit()
    db.refresh(req)
    return req


@router.put("/requisitos/{req_id}", response_model=RequisitoOut)
def atualizar_requisito(
    req_id: int,
    data: RequisitoUpdate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_permissao("cidade_inteligente", "editar")),
):
    req = db.get(CertificacaoRequisito, req_id)
    if not req:
        raise NotFoundException("Requisito não encontrado")
    cert = db.get(CertificacaoCidade, req.certificacao_id)
    if current_user.role.nome != "ADMIN_GLOBAL" and cert.municipio_id != current_user.municipio_id:
        raise ForbiddenException("Acesso negado")
    campos = data.model_dump(exclude_unset=True)
    if "evidencia_url" in campos:
        campos["evidencia_url"] = _normaliza_evidencia(campos["evidencia_url"])
    for field, value in campos.items():
        setattr(req, field, value)
    db.commit()
    db.refresh(req)
    return req


@router.delete("/requisitos/{req_id}")
def excluir_requisito(
    req_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_permissao("cidade_inteligente", "editar")),
):
    req = db.get(CertificacaoRequisito, req_id)
    if not req:
        raise NotFoundException("Requisito não encontrado")
    cert = db.get(CertificacaoCidade, req.certificacao_id)
    if current_user.role.nome != "ADMIN_GLOBAL" and cert.municipio_id != current_user.municipio_id:
        raise ForbiddenException("Acesso negado")
    db.delete(req)
    db.commit()
    return {"ok": True}
```

**Nota de design (o reviewer vai perguntar):** a listagem usa `get_current_user` + filtro manual (padrão `listar_retencao` da F3) — o gate de plano da rota fica no front via NAV_FLAT e, para leitura scoped por plano, o precedente da casa é o benchmark; aqui seguimos o precedente F3/F4 da área porque a listagem precisa do view-as com `municipio_id`. ADMIN_GLOBAL sem `municipio_id` recebe `[]` (nunca a base inteira).

- [ ] **Step 5: Registrar no app**

`backend/app/main.py`: `import app.api.v1.routers.cidade_inteligente as cidade_inteligente` (bloco de imports) e `app.include_router(cidade_inteligente.router, prefix=API_PREFIX)` (após a linha do benchmark).

- [ ] **Step 6: Rodar e ver passar**

Run: `venv/Scripts/python -m pytest backend/tests/test_cidade_inteligente_endpoints.py -q`
Expected: PASS (12)

- [ ] **Step 7: Suite completa**

Run: `venv/Scripts/python -m pytest backend/tests -q`
Expected: 469 + 12 = 481 (reportar o exato)

- [ ] **Step 8: Commit**

```bash
git add backend/app/schemas/cidade_inteligente.py backend/app/api/v1/routers/cidade_inteligente.py backend/app/main.py backend/tests/test_cidade_inteligente_endpoints.py
git commit -m "feat(cidade-inteligente): router com CRUD, tenancy, permissoes e contadores de progresso"
```
(trailers)

---

### Task 3: Página + drawer (frontend)

**Files:**
- Create: `frontend-observatorio/src/pages/cidade-inteligente/CidadeInteligentePage.jsx`
- Create: `frontend-observatorio/src/pages/cidade-inteligente/CertificacaoDrawer.jsx`
- Test: `frontend-observatorio/src/pages/cidade-inteligente/CidadeInteligentePage.test.jsx`
- Test: `frontend-observatorio/src/pages/cidade-inteligente/CertificacaoDrawer.test.jsx`

**Interfaces:**
- Consumes (Task 2): endpoints acima. Consumes (existentes): `NidPageHeader`/`NidPanel` de `../../components/nid/Panel`; `NidDrawer` (`{open, onClose, ariaLabel, hero, footer, children}`); `NidTabBar`; `SelecioneMunicipio`; `useAuth`/`useViewAs`; `usePermissao(area, verbo)` de `../../hooks/usePermissao`; `api`.
- Produces (Task 4): default export `CidadeInteligentePage`.

Padrões vinculantes: guard `needsMunicipio = user?.role === "ADMIN_GLOBAL" && viewAsId == null` com early-return `SelecioneMunicipio` e `if (needsMunicipio) return;` no effect; escrita com `usePermissao("cidade_inteligente", verbo) && !isGlobal`; pills de status com tokens (atendido `var(--accent-5)`, em_andamento `var(--accent-4)`, pendente `var(--text-mute)`); barra de progresso simples (div com width %). O molde de layout/CRUD inline é o `EmpresaDrawer.jsx` da F3 — o implementador DEVE lê-lo antes.

- [ ] **Step 1: Testes que falham**

`CidadeInteligentePage.test.jsx`:

```jsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

const authState = { user: { role: "ADMIN_GLOBAL" } };
const viewAsState = { viewAsId: null };
vi.mock("../../context/AuthContext", () => ({ useAuth: () => authState }));
vi.mock("../../context/ViewAsContext", () => ({ useViewAs: () => viewAsState }));
vi.mock("../../context/ToastContext", () => ({ useToast: () => ({ addToast: vi.fn() }) }));
vi.mock("./CertificacaoDrawer", () => ({ default: () => null }));

const CERTS = [
  { id: 1, nome: "ISO 37122", entidade: "ABNT", descricao: null,
    total: 4, atendidos: 2, em_andamento: 1, pendentes: 1 },
];
vi.mock("../../services/api", () => ({
  default: { get: vi.fn(() => Promise.resolve({ data: CERTS })) },
}));

import api from "../../services/api";
import CidadeInteligentePage from "./CidadeInteligentePage";

beforeEach(() => {
  vi.clearAllMocks();
  authState.user = { role: "ADMIN_GLOBAL" };
  viewAsState.viewAsId = null;
});

describe("CidadeInteligentePage", () => {
  it("global sem view-as vê SelecioneMunicipio e não busca", () => {
    render(<CidadeInteligentePage />);
    expect(screen.getByText("Selecione um município")).toBeInTheDocument();
    expect(api.get).not.toHaveBeenCalled();
  });

  it("lista cards com progresso", async () => {
    authState.user = { role: "PREFEITO" };
    render(<CidadeInteligentePage />);
    expect(await screen.findByText("ISO 37122")).toBeInTheDocument();
    expect(screen.getByText("2 de 4 atendidos")).toBeInTheDocument();
  });

  it("usuário sem permissão de criar não vê o botão", async () => {
    authState.user = { role: "PREFEITO", permissoes: {} };
    render(<CidadeInteligentePage />);
    await screen.findByText("ISO 37122");
    expect(screen.queryByRole("button", { name: /Nova certificação/ })).toBeNull();
  });

  it("lista vazia mostra CTA", async () => {
    authState.user = { role: "PREFEITO" };
    api.get.mockResolvedValueOnce({ data: [] });
    render(<CidadeInteligentePage />);
    expect(await screen.findByText(/Nenhuma certificação/)).toBeInTheDocument();
  });
});
```

`CertificacaoDrawer.test.jsx` (mocks análogos; api.get do detalhe devolve `{...CERTS[0], requisitos: [{id: 10, certificacao_id: 1, titulo: "Plano diretor", categoria: "Governança", status: "atendido", responsavel: null, evidencia_url: "https://x.gov.br", evidencia_nota: null}, {id: 11, certificacao_id: 1, titulo: "Wi-Fi público", categoria: "Conectividade", status: "pendente", responsavel: null, evidencia_url: null, evidencia_nota: null}]}`):

```jsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

const authState = { user: { role: "PREFEITO", permissoes: { cidade_inteligente: ["criar", "editar", "excluir"] } } };
vi.mock("../../context/AuthContext", () => ({ useAuth: () => authState }));
vi.mock("../../context/ViewAsContext", () => ({ useViewAs: () => ({ viewAsId: null }) }));
vi.mock("../../context/ToastContext", () => ({ useToast: () => ({ addToast: vi.fn() }) }));

const DETALHE = {
  id: 1, nome: "ISO 37122", entidade: "ABNT", descricao: null,
  total: 2, atendidos: 1, em_andamento: 0, pendentes: 1,
  requisitos: [
    { id: 10, certificacao_id: 1, titulo: "Plano diretor", categoria: "Governança",
      status: "atendido", responsavel: null, evidencia_url: "https://x.gov.br", evidencia_nota: null },
    { id: 11, certificacao_id: 1, titulo: "Wi-Fi público", categoria: "Conectividade",
      status: "pendente", responsavel: null, evidencia_url: null, evidencia_nota: null },
  ],
};
vi.mock("../../services/api", () => ({
  default: { get: vi.fn(() => Promise.resolve({ data: DETALHE })) },
}));

import CertificacaoDrawer from "./CertificacaoDrawer";

const montar = () => render(<CertificacaoDrawer certId={1} onClose={() => {}} />);

beforeEach(() => {
  vi.clearAllMocks();
  authState.user = { role: "PREFEITO", permissoes: { cidade_inteligente: ["criar", "editar", "excluir"] } };
});

describe("CertificacaoDrawer", () => {
  it("renderiza requisitos com pill de status", async () => {
    montar();
    expect(await screen.findByText("Plano diretor")).toBeInTheDocument();
    expect(screen.getByText("Atendido")).toBeInTheDocument();
    expect(screen.getByText("Pendente")).toBeInTheDocument();
  });

  it("aba de status filtra a lista", async () => {
    montar();
    await screen.findByText("Plano diretor");
    fireEvent.click(screen.getByRole("tab", { name: /Atendidos/ }));
    expect(screen.getByText("Plano diretor")).toBeInTheDocument();
    expect(screen.queryByText("Wi-Fi público")).toBeNull();
  });

  it("Ver evidência só aparece quando há URL", async () => {
    montar();
    await screen.findByText("Plano diretor");
    const links = screen.getAllByRole("link", { name: /Ver evidência/ });
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAttribute("href", "https://x.gov.br");
  });

  it("ADMIN_GLOBAL não vê botões de escrita", async () => {
    authState.user = { role: "ADMIN_GLOBAL", permissoes: {} };
    montar();
    await screen.findByText("Plano diretor");
    expect(screen.queryByRole("button", { name: /Novo requisito/ })).toBeNull();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run src/pages/cidade-inteligente` (módulos inexistentes)

- [ ] **Step 3: Implementar `CidadeInteligentePage.jsx`**

Estrutura obrigatória (implementador escreve o JSX completo no padrão da casa, lendo EmpresaDrawer/GestaoEmpresarialTab como molde visual):

```jsx
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useAuth } from "../../context/AuthContext";
import { useViewAs } from "../../context/ViewAsContext";
import { usePermissao } from "../../hooks/usePermissao";
import api from "../../services/api";
import { NidPageHeader } from "../../components/nid/Panel";
import SelecioneMunicipio from "../../components/nid/SelecioneMunicipio";
import CertificacaoDrawer from "./CertificacaoDrawer";

export default function CidadeInteligentePage() {
  const { user } = useAuth();
  const { viewAsId } = useViewAs();
  const isGlobal = user?.role === "ADMIN_GLOBAL";
  const needsMunicipio = isGlobal && viewAsId == null;
  const canCriar = usePermissao("cidade_inteligente", "criar") && !isGlobal;

  const [certs, setCerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [aberta, setAberta] = useState(null);   // id da certificação no drawer
  const [criando, setCriando] = useState(false);

  const recarregar = () => {
    api.get("/cidade-inteligente/certificacoes")
      .then((r) => setCerts(r.data || []))
      .catch(() => setCerts([]))
      .finally(() => setLoading(false));
  };
  useEffect(() => {
    if (needsMunicipio) return;
    recarregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needsMunicipio]);

  if (needsMunicipio) {
    return (
      <div>
        <NidPageHeader title="Cidade Inteligente" sub="Certificações e selos que o município acompanha." />
        <SelecioneMunicipio />
      </div>
    );
  }
  // ... header + grid de cards (nome, entidade como eyebrow, barra de
  // progresso width `${(atendidos/total)*100 || 0}%`, texto
  // "X de Y atendidos", pills em_andamento/pendentes) + botão
  // "Nova certificação" (canCriar) abrindo form simples (nome/entidade/
  // descricao → POST, recarregar) + empty state "Nenhuma certificação
  // cadastrada ainda." com CTA quando canCriar + <CertificacaoDrawer
  // certId={aberta} onClose={() => { setAberta(null); recarregar(); }} />
}
```

- [ ] **Step 4: Implementar `CertificacaoDrawer.jsx`**

Contrato: `{ certId, onClose }` — quando `certId != null`, busca `GET /cidade-inteligente/certificacoes/${certId}` e abre `NidDrawer open ariaLabel="Detalhe da certificação"`. Conteúdo: hero com nome/entidade/descrição + progresso; `NidTabBar` de status ("Todos" + presentes, com counts); tabela/lista de requisitos (título, categoria, pill de status com tokens, responsável, "Ver evidência →" target _blank quando `evidencia_url`); escrita (`usePermissao("cidade_inteligente","editar") && !isGlobal`): form inline "Novo requisito" (titulo/categoria/status/responsavel/evidencia_url/evidencia_nota → POST), editar status por select na linha (PUT), excluir requisito (DELETE), editar/excluir certificação (PUT/DELETE + onClose). Erros de POST/PUT com `addToast` legível (catch — nunca silencioso).

- [ ] **Step 5: Rodar e ver passar** — `npx vitest run src/pages/cidade-inteligente` (8)

- [ ] **Step 6: Suite front completa** — `npx vitest run` — Expected: 386 + 8 = 394 (reportar o exato)

- [ ] **Step 7: Lint** — `npx eslint src/pages/cidade-inteligente/*.jsx` — nenhum erro (arquivos novos; `motion` só se usado).

- [ ] **Step 8: Commit**

```bash
git add frontend-observatorio/src/pages/cidade-inteligente/CidadeInteligentePage.jsx frontend-observatorio/src/pages/cidade-inteligente/CertificacaoDrawer.jsx frontend-observatorio/src/pages/cidade-inteligente/CidadeInteligentePage.test.jsx frontend-observatorio/src/pages/cidade-inteligente/CertificacaoDrawer.test.jsx
git commit -m "feat(cidade-inteligente): pagina com cards de progresso e drawer de requisitos"
```
(trailers)

---

### Task 4: Navegação, rota, plano e permissões

**Files:**
- Modify: `frontend-observatorio/src/app/layouts/navStructure.jsx` (seção "Indicadores & Cidade Int.", ~L51-57)
- Modify: `frontend-observatorio/src/app/layouts/navStructure.test.js` (~L57-58 e o map ROTA_MODULO)
- Modify: `frontend-observatorio/src/app/router/AppRouter.jsx` (import + Route)
- Modify: `frontend-observatorio/src/pages/admin/PlanoConfigAdminPage.jsx` (MODULOS, ~L5)
- Modify: `frontend-observatorio/src/pages/admin/RolesAdminPage.jsx` (AREAS, ~L10)
- Modify: `frontend-observatorio/src/pages/titulosPaginas.test.js` (caso novo)

**Interfaces:**
- Consumes (Task 3): `CidadeInteligentePage` default export.

- [ ] **Step 1: Atualizar os testes de invariante PRIMEIRO (falham)**

Em `navStructure.test.js`: `expect(NAV_FLAT).toHaveLength(33)` (comentário: `// 31 com chave + FPM e Análise Econômica sem = 33 navegáveis — Cidade Inteligente entrou em 20/08`); adicionar ao map congelado ROTA_MODULO o par `"/app/cidade-inteligente": "cidade_inteligente"`. Em `titulosPaginas.test.js`, adicionar ao array CASOS: `["./cidade-inteligente/CidadeInteligentePage.jsx", "Cidade Inteligente", null]`.

- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run src/app/layouts/navStructure.test.js src/pages/titulosPaginas.test.js`

- [ ] **Step 3: navStructure + rota + admin**

`navStructure.jsx` — na seção "Indicadores & Cidade Int.", após Indicadores Internos:

```jsx
{ type: "link", to: "/app/cidade-inteligente", label: "Cidade Inteligente", icon: CpuChipIcon, modulo: "cidade_inteligente" },
```
(import `CpuChipIcon` de @heroicons/react/24/outline junto aos demais.)

`AppRouter.jsx` — import da página + `<Route path="cidade-inteligente" element={<CidadeInteligentePage />} />` (junto às rotas irmãs).

`PlanoConfigAdminPage.jsx` — em MODULOS: `{ key: "cidade_inteligente", label: "Cidade Inteligente — Certificações ISO/ABNT" },`

`RolesAdminPage.jsx` — em AREAS: `["cidade_inteligente", "Cidade Inteligente"],`

- [ ] **Step 4: Rodar invariantes e ver passar** — mesmos 2 arquivos de teste

- [ ] **Step 5: Suite front completa** — `npx vitest run` — Expected: 394 + (casos novos dos invariantes; reportar o exato)

- [ ] **Step 6: Lint dos tocados** — nenhum erro novo vs base.

- [ ] **Step 7: Commit**

```bash
git add frontend-observatorio/src/app/layouts/navStructure.jsx frontend-observatorio/src/app/layouts/navStructure.test.js frontend-observatorio/src/app/router/AppRouter.jsx frontend-observatorio/src/pages/admin/PlanoConfigAdminPage.jsx frontend-observatorio/src/pages/admin/RolesAdminPage.jsx frontend-observatorio/src/pages/titulosPaginas.test.js
git commit -m "feat(nav): item Cidade Inteligente no Eixo 2 — chave de plano, permissao e invariantes a 33"
```
(trailers)
