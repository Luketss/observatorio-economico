# Gestão Empresarial (Fase 3) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fundir a base Empresas (CNPJ/RFB) com Retenção & Expansão na experiência "Gestão Empresarial": vínculo RFB + perfil no drawer, contatos e demandas estruturados, próxima ação, tudo na URL atual.

**Architecture:** Backend primeiro (migração `0038`: 3 colunas em `empresa_retencao` + tabelas `contato_empresa`/`demanda_empresa`; CRUDs espelhando o padrão das visitas; detalhe enriquecido com `perfil_rfb`; `GET /empresas/buscar`; view-as na leitura). Frontend depois: a tela atual é renomeada para `GestaoEmpresarialTab`, o drawer vira componente próprio com 3 abas (`EmpresaDrawer`), e o formulário ganha autocomplete de vínculo (`BuscaEmpresaRfb`).

**Tech Stack:** FastAPI + SQLAlchemy 2 + Alembic + Pydantic (backend; testes pytest no estilo da casa: handlers chamados direto com fixture sqlite, sem TestClient); React 19 + Vitest/jsdom + Testing Library (front).

**Spec:** `docs/superpowers/specs/2026-08-19-gestao-empresarial-design.md`

## Global Constraints

- **URL e chaves intocadas:** rota `/app/desenvolvimento-economico/retencao`, chave de plano `desenvolvimento_economico.retencao` e área de permissão `retencao` NÃO mudam (só o label exibido vira "Gestão Empresarial").
- **Enums exatos:** `tipo` de contato ∈ `reuniao|ligacao|email|visita_tecnica|outro` (default `reuniao`); `status` de demanda ∈ `aberta|em_andamento|resolvida` (default `aberta`). Validação por `Literal` nos schemas.
- **Padrões do router existente preservados:** escrita com `require_permissao("retencao", verbo)`, checagem inline de tenant (`role.nome != "ADMIN_GLOBAL" and item.municipio_id != user.municipio_id` → `ForbiddenException("Acesso negado")`), `_exigir_municipio` na criação, `model_dump(exclude_unset=True)` no PUT.
- **Gates de teste:** backend `venv/Scripts/python -m pytest backend/tests -q` da raiz do repo (baseline 406; a suite `tests/` da raiz NÃO é gate); frontend `npx vitest run` de `frontend-observatorio/` (baseline 267). Ambos devem terminar verdes.
- Lint do repo JÁ FALHA (não é gate): arquivos novos limpos (exceto o falso-positivo conhecido `motion unused`); modificados sem erro NOVO vs base.
- Copy pt-BR. Commits convencionais + trailers padrão da sessão. Alembic head atual: `0037_acao_audit`.
- **Nota de deploy (para o relato final):** a migração `0038` roda no deploy da api; worker não é afetado.

---

### Task 1: Models + migração `0038_gestao_empresarial`

**Files:**
- Modify: `backend/app/models/desenvolvimento_economico.py` (EmpresaRetencao ~linhas 41-66; novas classes após VisitaRetencao)
- Create: `backend/alembic/versions/0038_gestao_empresarial.py`
- Test: `backend/tests/test_gestao_empresarial_models.py`

**Interfaces:**
- Consumes: estilo existente do módulo (`VisitaRetencao` como molde; imports `Column, Integer, String, Text, Date, DateTime, ForeignKey, relationship, datetime` já presentes no arquivo).
- Produces (Tasks 2-3 dependem): `EmpresaRetencao` ganha `cnpj_basico` (String(8), index, nullable), `proxima_acao` (Text), `proxima_acao_data` (Date) e relationships `contatos`/`demandas` (cascade `all, delete-orphan`); classes `ContatoEmpresa` (tabela `contato_empresa`) e `DemandaEmpresa` (tabela `demanda_empresa`) com colunas exatas abaixo.

- [ ] **Step 1: Escrever o teste de modelo (falhando)**

Criar `backend/tests/test_gestao_empresarial_models.py` (fixture sqlite no estilo de `test_auditoria_endpoint.py`):

```python
"""Modelos novos da Gestão Empresarial: colunas, relationships e cascade."""
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

import app.models  # noqa: F401
from app.db.base import Base
from app.models.desenvolvimento_economico import (
    ContatoEmpresa,
    DemandaEmpresa,
    EmpresaRetencao,
    VisitaRetencao,
)
from app.models.municipio import Municipio
from app.models.role import Role
from app.models.usuario import Usuario


@pytest.fixture()
def db():
    engine = create_engine("sqlite://")
    Base.metadata.create_all(
        engine,
        tables=[
            Municipio.__table__, Role.__table__, Usuario.__table__,
            EmpresaRetencao.__table__, VisitaRetencao.__table__,
            ContatoEmpresa.__table__, DemandaEmpresa.__table__,
        ],
    )
    session = sessionmaker(bind=engine)()
    m = Municipio(nome="Teste", uf="MG")
    session.add(m)
    session.flush()
    session.add(EmpresaRetencao(municipio_id=m.id, nome="ACME"))
    session.commit()
    yield session
    session.close()


def test_colunas_novas_da_empresa(db):
    e = db.query(EmpresaRetencao).one()
    assert e.cnpj_basico is None
    assert e.proxima_acao is None
    assert e.proxima_acao_data is None
    e.cnpj_basico = "12345678"
    e.proxima_acao = "Agendar reunião"
    db.commit()
    assert db.query(EmpresaRetencao).one().cnpj_basico == "12345678"


def test_relationships_e_defaults(db):
    from datetime import date
    e = db.query(EmpresaRetencao).one()
    e.contatos.append(ContatoEmpresa(municipio_id=e.municipio_id, data=date(2026, 8, 1)))
    e.demandas.append(DemandaEmpresa(
        municipio_id=e.municipio_id, descricao="Acesso pavimentado",
        data_registro=date(2026, 8, 2),
    ))
    db.commit()
    e = db.query(EmpresaRetencao).one()
    assert e.contatos[0].tipo == "reuniao"
    assert e.demandas[0].status == "aberta"


def test_cascade_delete(db):
    from datetime import date
    e = db.query(EmpresaRetencao).one()
    e.contatos.append(ContatoEmpresa(municipio_id=e.municipio_id, data=date(2026, 8, 1)))
    e.demandas.append(DemandaEmpresa(
        municipio_id=e.municipio_id, descricao="X", data_registro=date(2026, 8, 2),
    ))
    db.commit()
    db.delete(e)
    db.commit()
    assert db.query(ContatoEmpresa).count() == 0
    assert db.query(DemandaEmpresa).count() == 0
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run (da raiz do repo): `venv/Scripts/python -m pytest backend/tests/test_gestao_empresarial_models.py -q`
Expected: FAIL — `ImportError: cannot import name 'ContatoEmpresa'`.

- [ ] **Step 3: Implementar os models**

Em `backend/app/models/desenvolvimento_economico.py`:

1. Em `EmpresaRetencao`, adicionar após a coluna `cnpj` (mantendo o estilo do arquivo):

```python
    cnpj_basico = Column(String(8), nullable=True, index=True)  # raiz normalizada — vínculo lógico com `empresas`
```

e após `responsavel`:

```python
    proxima_acao = Column(Text, nullable=True)
    proxima_acao_data = Column(Date, nullable=True)
```

e junto ao relationship `visitas`:

```python
    contatos = relationship("ContatoEmpresa", back_populates="empresa", cascade="all, delete-orphan")
    demandas = relationship("DemandaEmpresa", back_populates="empresa", cascade="all, delete-orphan")
```

2. Após a classe `VisitaRetencao`, adicionar (molde: a própria `VisitaRetencao`; usar os mesmos imports do arquivo):

```python
class ContatoEmpresa(Base):
    """Registro de contato/reunião com a empresa (Gestão Empresarial)."""
    __tablename__ = "contato_empresa"

    id = Column(Integer, primary_key=True, index=True)
    empresa_id = Column(Integer, ForeignKey("empresa_retencao.id", ondelete="CASCADE"), nullable=False, index=True)
    municipio_id = Column(Integer, ForeignKey("municipios.id"), nullable=False, index=True)
    criado_por = Column(Integer, ForeignKey("usuarios.id"), nullable=True)
    data = Column(Date, nullable=False)
    tipo = Column(String(20), nullable=False, default="reuniao")  # reuniao|ligacao|email|visita_tecnica|outro
    responsavel = Column(String(150), nullable=True)
    observacoes = Column(Text, nullable=True)
    criado_em = Column(DateTime(timezone=True), default=datetime.utcnow)
    atualizado_em = Column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)

    empresa = relationship("EmpresaRetencao", back_populates="contatos")


class DemandaEmpresa(Base):
    """Demanda apresentada pela empresa (Gestão Empresarial)."""
    __tablename__ = "demanda_empresa"

    id = Column(Integer, primary_key=True, index=True)
    empresa_id = Column(Integer, ForeignKey("empresa_retencao.id", ondelete="CASCADE"), nullable=False, index=True)
    municipio_id = Column(Integer, ForeignKey("municipios.id"), nullable=False, index=True)
    criado_por = Column(Integer, ForeignKey("usuarios.id"), nullable=True)
    descricao = Column(Text, nullable=False)
    status = Column(String(20), nullable=False, default="aberta")  # aberta|em_andamento|resolvida
    data_registro = Column(Date, nullable=False)
    responsavel = Column(String(150), nullable=True)
    criado_em = Column(DateTime(timezone=True), default=datetime.utcnow)
    atualizado_em = Column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)

    empresa = relationship("EmpresaRetencao", back_populates="demandas")
```

(Se `Date`/`Text` não estiverem no import do topo do arquivo, adicioná-los — `VisitaRetencao` já usa ambos, então devem existir.)

- [ ] **Step 4: Escrever a migração**

Antes, abrir `backend/alembic/versions/a06cfa9f29a7_add_desenvolvimento_economico_tables.py` e espelhar o estilo (naming de índices, server_default etc.). Criar `backend/alembic/versions/0038_gestao_empresarial.py`:

```python
"""gestao empresarial: vinculo RFB, proxima acao, contatos e demandas

Revision ID: 0038_gestao_empresarial
Revises: 0037_acao_audit
Create Date: 2026-08-19
"""
import sqlalchemy as sa
from alembic import op

revision = "0038_gestao_empresarial"
down_revision = "0037_acao_audit"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("empresa_retencao", sa.Column("cnpj_basico", sa.String(length=8), nullable=True))
    op.add_column("empresa_retencao", sa.Column("proxima_acao", sa.Text(), nullable=True))
    op.add_column("empresa_retencao", sa.Column("proxima_acao_data", sa.Date(), nullable=True))
    op.create_index(op.f("ix_empresa_retencao_cnpj_basico"), "empresa_retencao", ["cnpj_basico"])

    op.create_table(
        "contato_empresa",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("empresa_id", sa.Integer(), nullable=False),
        sa.Column("municipio_id", sa.Integer(), nullable=False),
        sa.Column("criado_por", sa.Integer(), nullable=True),
        sa.Column("data", sa.Date(), nullable=False),
        sa.Column("tipo", sa.String(length=20), nullable=False, server_default="reuniao"),
        sa.Column("responsavel", sa.String(length=150), nullable=True),
        sa.Column("observacoes", sa.Text(), nullable=True),
        sa.Column("criado_em", sa.DateTime(timezone=True), nullable=True),
        sa.Column("atualizado_em", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["empresa_id"], ["empresa_retencao.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["municipio_id"], ["municipios.id"]),
        sa.ForeignKeyConstraint(["criado_por"], ["usuarios.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_contato_empresa_id"), "contato_empresa", ["id"])
    op.create_index(op.f("ix_contato_empresa_empresa_id"), "contato_empresa", ["empresa_id"])
    op.create_index(op.f("ix_contato_empresa_municipio_id"), "contato_empresa", ["municipio_id"])

    op.create_table(
        "demanda_empresa",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("empresa_id", sa.Integer(), nullable=False),
        sa.Column("municipio_id", sa.Integer(), nullable=False),
        sa.Column("criado_por", sa.Integer(), nullable=True),
        sa.Column("descricao", sa.Text(), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="aberta"),
        sa.Column("data_registro", sa.Date(), nullable=False),
        sa.Column("responsavel", sa.String(length=150), nullable=True),
        sa.Column("criado_em", sa.DateTime(timezone=True), nullable=True),
        sa.Column("atualizado_em", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["empresa_id"], ["empresa_retencao.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["municipio_id"], ["municipios.id"]),
        sa.ForeignKeyConstraint(["criado_por"], ["usuarios.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_demanda_empresa_id"), "demanda_empresa", ["id"])
    op.create_index(op.f("ix_demanda_empresa_empresa_id"), "demanda_empresa", ["empresa_id"])
    op.create_index(op.f("ix_demanda_empresa_municipio_id"), "demanda_empresa", ["municipio_id"])


def downgrade() -> None:
    op.drop_table("demanda_empresa")
    op.drop_table("contato_empresa")
    op.drop_index(op.f("ix_empresa_retencao_cnpj_basico"), table_name="empresa_retencao")
    op.drop_column("empresa_retencao", "proxima_acao_data")
    op.drop_column("empresa_retencao", "proxima_acao")
    op.drop_column("empresa_retencao", "cnpj_basico")
```

(Se `a06cfa9f29a7` usar outro estilo de revision id/índices, seguir o estilo dele — o conteúdo lógico acima é o requisito.)

- [ ] **Step 5: Rodar os testes e a suite backend**

Run: `venv/Scripts/python -m pytest backend/tests/test_gestao_empresarial_models.py -q`
Expected: PASS (3 testes).
Run: `venv/Scripts/python -m pytest backend/tests -q`
Expected: PASS — 406 + 3 = 409, zero falhas.

- [ ] **Step 6: Commit**

```bash
git add backend/app/models/desenvolvimento_economico.py backend/alembic/versions/0038_gestao_empresarial.py backend/tests/test_gestao_empresarial_models.py
git commit -m "feat(gestao-empresarial): models de contatos/demandas + vinculo RFB e proxima acao (migracao 0038)"
```

---

### Task 2: Helper de CNPJ + schemas novos

**Files:**
- Create: `backend/app/core/cnpj.py`
- Modify: `backend/app/schemas/desenvolvimento_economico.py:55-129` (bloco Retenção)
- Test: `backend/tests/test_gestao_empresarial_schemas.py`

**Interfaces:**
- Consumes: `EmpresaOut` de `app.schemas.empresa` (schema existente, hoje órfão).
- Produces (Task 3 depende):
  - `cnpj_para_basico(valor: str | None) -> str | None` em `app.core.cnpj` — strip de tudo que não é dígito; devolve os 8 primeiros se sobrarem ≥8 dígitos, senão `None`.
  - Schemas: `ContatoEmpresaCreate/Update/Out`, `DemandaEmpresaCreate/Update/Out` (shapes abaixo); `EmpresaRetencaoCreate/Update` ganham `cnpj_basico`, `proxima_acao`, `proxima_acao_data`; `EmpresaRetencaoLeanOut` ganha os 3; `EmpresaRetencaoOut` ganha os 3 + `contatos`, `demandas`, `perfil_rfb`.

- [ ] **Step 1: Escrever os testes (falhando)**

Criar `backend/tests/test_gestao_empresarial_schemas.py`:

```python
"""Helper de CNPJ e validação dos schemas novos da Gestão Empresarial."""
from datetime import date

import pytest
from pydantic import ValidationError

from app.core.cnpj import cnpj_para_basico
from app.schemas.desenvolvimento_economico import (
    ContatoEmpresaCreate,
    DemandaEmpresaCreate,
    DemandaEmpresaUpdate,
    EmpresaRetencaoCreate,
    EmpresaRetencaoOut,
)


def test_cnpj_para_basico():
    assert cnpj_para_basico("12.345.678/0001-90") == "12345678"
    assert cnpj_para_basico("12345678000190") == "12345678"
    assert cnpj_para_basico("12345678") == "12345678"
    assert cnpj_para_basico("1234567") is None
    assert cnpj_para_basico("") is None
    assert cnpj_para_basico(None) is None


def test_contato_tipo_valido_e_default():
    c = ContatoEmpresaCreate(data=date(2026, 8, 1))
    assert c.tipo == "reuniao"
    c2 = ContatoEmpresaCreate(data=date(2026, 8, 1), tipo="visita_tecnica")
    assert c2.tipo == "visita_tecnica"


def test_contato_tipo_invalido_rejeitado():
    with pytest.raises(ValidationError):
        ContatoEmpresaCreate(data=date(2026, 8, 1), tipo="almoco")


def test_demanda_status_default_e_invalido():
    d = DemandaEmpresaCreate(descricao="X", data_registro=date(2026, 8, 1))
    assert d.status == "aberta"
    with pytest.raises(ValidationError):
        DemandaEmpresaUpdate(status="cancelada")


def test_empresa_create_com_campos_novos():
    e = EmpresaRetencaoCreate(nome="ACME", cnpj_basico="12345678",
                              proxima_acao="Ligar", proxima_acao_data=date(2026, 9, 1))
    assert e.cnpj_basico == "12345678"


def test_empresa_out_tem_novos_campos_opcionais():
    campos = EmpresaRetencaoOut.model_fields
    for f in ("cnpj_basico", "proxima_acao", "proxima_acao_data",
              "contatos", "demandas", "perfil_rfb"):
        assert f in campos
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `venv/Scripts/python -m pytest backend/tests/test_gestao_empresarial_schemas.py -q`
Expected: FAIL — `ModuleNotFoundError: app.core.cnpj`.

- [ ] **Step 3: Implementar helper e schemas**

Criar `backend/app/core/cnpj.py`:

```python
import re


def cnpj_para_basico(valor: str | None) -> str | None:
    """Normaliza um CNPJ digitado para a raiz de 8 dígitos usada pela base RFB
    (`empresas.cnpj_basico`). Aceita máscara ou dígitos; devolve None quando o
    texto não contém pelo menos 8 dígitos."""
    if not valor:
        return None
    digitos = re.sub(r"\D", "", valor)
    return digitos[:8] if len(digitos) >= 8 else None
```

Em `backend/app/schemas/desenvolvimento_economico.py`:
1. No topo: `from typing import Literal` (juntar ao import existente de `typing`) e `from app.schemas.empresa import EmpresaOut`.
2. No bloco Retenção, ANTES de `EmpresaRetencaoCreate`, adicionar:

```python
TipoContato = Literal["reuniao", "ligacao", "email", "visita_tecnica", "outro"]
StatusDemanda = Literal["aberta", "em_andamento", "resolvida"]


class ContatoEmpresaCreate(BaseModel):
    data: date
    tipo: TipoContato = "reuniao"
    responsavel: Optional[str] = None
    observacoes: Optional[str] = None


class ContatoEmpresaUpdate(BaseModel):
    data: Optional[date] = None
    tipo: Optional[TipoContato] = None
    responsavel: Optional[str] = None
    observacoes: Optional[str] = None


class ContatoEmpresaOut(BaseModel):
    id: int
    empresa_id: int
    data: date
    tipo: str
    responsavel: Optional[str] = None
    observacoes: Optional[str] = None
    criado_em: datetime
    atualizado_em: datetime

    class Config:
        from_attributes = True


class DemandaEmpresaCreate(BaseModel):
    descricao: str
    status: StatusDemanda = "aberta"
    data_registro: date
    responsavel: Optional[str] = None


class DemandaEmpresaUpdate(BaseModel):
    descricao: Optional[str] = None
    status: Optional[StatusDemanda] = None
    data_registro: Optional[date] = None
    responsavel: Optional[str] = None


class DemandaEmpresaOut(BaseModel):
    id: int
    empresa_id: int
    descricao: str
    status: str
    data_registro: date
    responsavel: Optional[str] = None
    criado_em: datetime
    atualizado_em: datetime

    class Config:
        from_attributes = True
```

3. Em `EmpresaRetencaoCreate` e `EmpresaRetencaoUpdate`, adicionar:

```python
    cnpj_basico: Optional[str] = None
    proxima_acao: Optional[str] = None
    proxima_acao_data: Optional[date] = None
```

4. Em `EmpresaRetencaoLeanOut`, adicionar os mesmos 3 campos opcionais.
5. Em `EmpresaRetencaoOut`, adicionar os 3 + :

```python
    contatos: List[ContatoEmpresaOut] = []
    demandas: List[DemandaEmpresaOut] = []
    perfil_rfb: Optional[EmpresaOut] = None
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `venv/Scripts/python -m pytest backend/tests/test_gestao_empresarial_schemas.py -q`
Expected: PASS (6 testes).

- [ ] **Step 5: Commit**

```bash
git add backend/app/core/cnpj.py backend/app/schemas/desenvolvimento_economico.py backend/tests/test_gestao_empresarial_schemas.py
git commit -m "feat(gestao-empresarial): schemas de contatos/demandas e helper de normalizacao de CNPJ"
```

---

### Task 3: Endpoints de retenção — CRUDs, detalhe enriquecido, derivação de CNPJ, view-as

**Files:**
- Modify: `backend/app/api/v1/routers/desenvolvimento_economico.py` (seção 3.2, linhas 144-264 da versão atual)
- Test: `backend/tests/test_gestao_empresarial_endpoints.py`

**Interfaces:**
- Consumes: models (Task 1: `ContatoEmpresa`, `DemandaEmpresa`), schemas + `cnpj_para_basico` (Task 2), `Empresa` de `app.models.empresa`, `EmpresaOut` de `app.schemas.empresa`.
- Produces (Tasks 5-6 dependem — rotas exatas):
  - `GET /desenvolvimento-economico/retencao?municipio_id=` (view-as p/ ADMIN_GLOBAL)
  - `GET /desenvolvimento-economico/retencao/{id}` → `EmpresaRetencaoOut` com `contatos`, `demandas`, `perfil_rfb`
  - `POST /retencao` e `PUT /retencao/{id}` aceitam `cnpj_basico`/`proxima_acao`/`proxima_acao_data`; quando `cnpj_basico` não vem no payload mas `cnpj` vem, o backend deriva via `cnpj_para_basico`
  - `POST /retencao/{id}/contatos` · `PUT /retencao/contatos/{id}` · `DELETE /retencao/contatos/{id}`
  - `POST /retencao/{id}/demandas` · `PUT /retencao/demandas/{id}` · `DELETE /retencao/demandas/{id}`

- [ ] **Step 1: Escrever os testes (falhando)**

Criar `backend/tests/test_gestao_empresarial_endpoints.py` (handlers chamados direto, fixture sqlite; molde: `test_auditoria_endpoint.py`):

```python
"""Endpoints da Gestão Empresarial: CRUDs de contatos/demandas, detalhe com
perfil_rfb, derivação de cnpj_basico e view-as na listagem."""
from datetime import date

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

import app.models  # noqa: F401
from app.core.exceptions import ForbiddenException
from app.db.base import Base
from app.models.desenvolvimento_economico import (
    ContatoEmpresa, DemandaEmpresa, EmpresaRetencao, VisitaRetencao,
)
from app.models.empresa import Empresa
from app.models.municipio import Municipio
from app.models.role import Role
from app.models.usuario import Usuario
from app.schemas.desenvolvimento_economico import (
    ContatoEmpresaCreate, ContatoEmpresaUpdate,
    DemandaEmpresaCreate, DemandaEmpresaUpdate,
    EmpresaRetencaoCreate, EmpresaRetencaoUpdate,
)


@pytest.fixture()
def ctx():
    engine = create_engine("sqlite://")
    Base.metadata.create_all(engine, tables=[
        Municipio.__table__, Role.__table__, Usuario.__table__,
        EmpresaRetencao.__table__, VisitaRetencao.__table__,
        ContatoEmpresa.__table__, DemandaEmpresa.__table__, Empresa.__table__,
    ])
    db = sessionmaker(bind=engine)()
    role_g = Role(nome="ADMIN_GLOBAL", builtin=True, permissoes={})
    role_m = Role(nome="GESTOR", builtin=False,
                  permissoes={"retencao": ["criar", "editar", "excluir"]})
    m1 = Municipio(nome="Alfa", uf="MG")
    m2 = Municipio(nome="Beta", uf="MG")
    db.add_all([role_g, role_m, m1, m2])
    db.flush()
    admin = Usuario(nome="G", email="g@x.com", senha_hash="x", role_id=role_g.id)
    u1 = Usuario(nome="U1", email="u1@x.com", senha_hash="x", role_id=role_m.id, municipio_id=m1.id)
    u2 = Usuario(nome="U2", email="u2@x.com", senha_hash="x", role_id=role_m.id, municipio_id=m2.id)
    db.add_all([admin, u1, u2])
    db.commit()
    yield db, admin, u1, u2, m1, m2
    db.close()


def _criar_empresa(db, user, **kw):
    from app.api.v1.routers.desenvolvimento_economico import criar_retencao
    data = EmpresaRetencaoCreate(nome=kw.pop("nome", "ACME"), **kw)
    return criar_retencao(data, db=db, current_user=user)


def test_criar_deriva_cnpj_basico_do_cnpj(ctx):
    db, _, u1, *_ = ctx
    out = _criar_empresa(db, u1, cnpj="12.345.678/0001-90")
    assert out.cnpj_basico == "12345678"


def test_criar_respeita_cnpj_basico_explicito(ctx):
    db, _, u1, *_ = ctx
    out = _criar_empresa(db, u1, cnpj="99.999.999/0001-99", cnpj_basico="12345678")
    assert out.cnpj_basico == "12345678"


def test_update_parcial_nao_apaga_cnpj_basico(ctx):
    from app.api.v1.routers.desenvolvimento_economico import atualizar_retencao
    db, _, u1, *_ = ctx
    out = _criar_empresa(db, u1, cnpj_basico="12345678")
    upd = atualizar_retencao(out.id, EmpresaRetencaoUpdate(nome="ACME 2"), db=db, current_user=u1)
    assert upd.cnpj_basico == "12345678"


def test_detalhe_inclui_perfil_rfb_contatos_demandas(ctx):
    from app.api.v1.routers.desenvolvimento_economico import (
        adicionar_contato, adicionar_demanda, detalhe_retencao,
    )
    db, _, u1, _, m1, _ = ctx
    db.add(Empresa(municipio_id=m1.id, cnpj_basico="12345678",
                   razao_social="ACME LTDA", situacao="02", porte="03"))
    db.commit()
    e = _criar_empresa(db, u1, cnpj_basico="12345678")
    adicionar_contato(e.id, ContatoEmpresaCreate(data=date(2026, 8, 1), tipo="ligacao"),
                      db=db, current_user=u1)
    adicionar_demanda(e.id, DemandaEmpresaCreate(descricao="Iluminação",
                      data_registro=date(2026, 8, 2)), db=db, current_user=u1)
    det = detalhe_retencao(e.id, db=db, current_user=u1)
    assert det.perfil_rfb is not None and det.perfil_rfb.razao_social == "ACME LTDA"
    assert len(det.contatos) == 1 and det.contatos[0].tipo == "ligacao"
    assert len(det.demandas) == 1 and det.demandas[0].status == "aberta"


def test_detalhe_sem_vinculo_perfil_none(ctx):
    from app.api.v1.routers.desenvolvimento_economico import detalhe_retencao
    db, _, u1, *_ = ctx
    e = _criar_empresa(db, u1)
    det = detalhe_retencao(e.id, db=db, current_user=u1)
    assert det.perfil_rfb is None


def test_contato_update_e_delete_com_tenant(ctx):
    from app.api.v1.routers.desenvolvimento_economico import (
        adicionar_contato, atualizar_contato, deletar_contato,
    )
    db, _, u1, u2, *_ = ctx
    e = _criar_empresa(db, u1)
    c = adicionar_contato(e.id, ContatoEmpresaCreate(data=date(2026, 8, 1)),
                          db=db, current_user=u1)
    upd = atualizar_contato(c.id, ContatoEmpresaUpdate(tipo="email"), db=db, current_user=u1)
    assert upd.tipo == "email"
    with pytest.raises(ForbiddenException):
        atualizar_contato(c.id, ContatoEmpresaUpdate(tipo="outro"), db=db, current_user=u2)
    assert deletar_contato(c.id, db=db, current_user=u1) == {"ok": True}


def test_demanda_muda_status_e_tenant(ctx):
    from app.api.v1.routers.desenvolvimento_economico import (
        adicionar_demanda, atualizar_demanda, deletar_demanda,
    )
    db, _, u1, u2, *_ = ctx
    e = _criar_empresa(db, u1)
    d = adicionar_demanda(e.id, DemandaEmpresaCreate(descricao="X",
                          data_registro=date(2026, 8, 1)), db=db, current_user=u1)
    upd = atualizar_demanda(d.id, DemandaEmpresaUpdate(status="resolvida"), db=db, current_user=u1)
    assert upd.status == "resolvida"
    with pytest.raises(ForbiddenException):
        deletar_demanda(d.id, db=db, current_user=u2)


def test_listar_view_as_para_global(ctx):
    from app.api.v1.routers.desenvolvimento_economico import listar_retencao
    db, admin, u1, u2, m1, m2 = ctx
    _criar_empresa(db, u1, nome="Alfa Co")
    _criar_empresa(db, u2, nome="Beta Co")
    todos = listar_retencao(municipio_id=None, db=db, current_user=admin)
    assert len(todos) == 2
    so_m1 = listar_retencao(municipio_id=m1.id, db=db, current_user=admin)
    assert [e.nome for e in so_m1] == ["Alfa Co"]
    u1_ignora_param = listar_retencao(municipio_id=m2.id, db=db, current_user=u1)
    assert [e.nome for e in u1_ignora_param] == ["Alfa Co"]


def test_rotas_novas_no_openapi():
    from app.main import app
    paths = app.openapi()["paths"]
    assert "/api/v1/desenvolvimento-economico/retencao/{empresa_id}/contatos" in paths
    assert "/api/v1/desenvolvimento-economico/retencao/contatos/{contato_id}" in paths
    assert "/api/v1/desenvolvimento-economico/retencao/{empresa_id}/demandas" in paths
    assert "/api/v1/desenvolvimento-economico/retencao/demandas/{demanda_id}" in paths
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `venv/Scripts/python -m pytest backend/tests/test_gestao_empresarial_endpoints.py -q`
Expected: FAIL — imports de handlers inexistentes (`adicionar_contato`, ...).

- [ ] **Step 3: Implementar no router**

Em `backend/app/api/v1/routers/desenvolvimento_economico.py`:

1. Imports: adicionar `Query` ao import do fastapi; `ContatoEmpresa, DemandaEmpresa` ao import de models; `ContatoEmpresaCreate/Update/Out, DemandaEmpresaCreate/Update/Out` ao import de schemas; `from app.core.cnpj import cnpj_para_basico`; `from app.models.empresa import Empresa`; `from app.schemas.empresa import EmpresaOut`.

2. `listar_retencao` (linha 146) ganha view-as:

```python
@router.get("/retencao", response_model=List[EmpresaRetencaoLeanOut])
def listar_retencao(
    municipio_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    query = db.query(EmpresaRetencao)
    if current_user.role.nome != "ADMIN_GLOBAL":
        query = query.filter(EmpresaRetencao.municipio_id == current_user.municipio_id)
    elif municipio_id is not None:
        query = query.filter(EmpresaRetencao.municipio_id == municipio_id)
    return query.order_by(EmpresaRetencao.nome).all()
```

3. `detalhe_retencao` passa a carregar tudo e montar `perfil_rfb`:

```python
@router.get("/retencao/{empresa_id}", response_model=EmpresaRetencaoOut)
def detalhe_retencao(
    empresa_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    empresa = (
        db.query(EmpresaRetencao)
        .options(
            selectinload(EmpresaRetencao.visitas),
            selectinload(EmpresaRetencao.contatos),
            selectinload(EmpresaRetencao.demandas),
        )
        .filter(EmpresaRetencao.id == empresa_id)
        .first()
    )
    if not empresa:
        raise NotFoundException("Empresa não encontrada")
    if current_user.role.nome != "ADMIN_GLOBAL" and empresa.municipio_id != current_user.municipio_id:
        raise ForbiddenException("Acesso negado")
    empresa.visitas.sort(key=lambda v: v.data_visita)
    empresa.contatos.sort(key=lambda c: c.data)
    empresa.demandas.sort(key=lambda d: d.data_registro)
    out = EmpresaRetencaoOut.model_validate(empresa)
    if empresa.cnpj_basico:
        perfil = (
            db.query(Empresa)
            .filter(Empresa.municipio_id == empresa.municipio_id,
                    Empresa.cnpj_basico == empresa.cnpj_basico)
            .first()
        )
        if perfil:
            out.perfil_rfb = EmpresaOut.model_validate(perfil)
    return out
```

4. Derivação no create/update — em `criar_retencao`, antes de construir o objeto:

```python
    payload = data.model_dump()
    if payload.get("cnpj_basico") is None:
        payload["cnpj_basico"] = cnpj_para_basico(payload.get("cnpj"))
    empresa = EmpresaRetencao(
        **payload,
        municipio_id=_municipio_id(current_user),
        criado_por=current_user.id,
    )
```

Em `atualizar_retencao`, substituir o loop de campos por:

```python
    campos = data.model_dump(exclude_unset=True)
    if "cnpj" in campos and "cnpj_basico" not in campos:
        campos["cnpj_basico"] = cnpj_para_basico(campos.get("cnpj"))
    for field, value in campos.items():
        setattr(empresa, field, value)
```

5. Após os endpoints de visitas, adicionar os CRUDs novos (molde: `adicionar_visita`/`deletar_visita` + o PUT do funil):

```python
@router.post("/retencao/{empresa_id}/contatos", response_model=ContatoEmpresaOut)
def adicionar_contato(
    empresa_id: int,
    data: ContatoEmpresaCreate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_permissao("retencao", "editar")),
):
    empresa = db.get(EmpresaRetencao, empresa_id)
    if not empresa:
        raise NotFoundException("Empresa não encontrada")
    if current_user.role.nome != "ADMIN_GLOBAL" and empresa.municipio_id != current_user.municipio_id:
        raise ForbiddenException("Acesso negado")
    contato = ContatoEmpresa(
        **data.model_dump(),
        empresa_id=empresa_id,
        municipio_id=empresa.municipio_id,
        criado_por=current_user.id,
    )
    db.add(contato)
    db.commit()
    db.refresh(contato)
    return contato


@router.put("/retencao/contatos/{contato_id}", response_model=ContatoEmpresaOut)
def atualizar_contato(
    contato_id: int,
    data: ContatoEmpresaUpdate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_permissao("retencao", "editar")),
):
    contato = db.get(ContatoEmpresa, contato_id)
    if not contato:
        raise NotFoundException("Contato não encontrado")
    if current_user.role.nome != "ADMIN_GLOBAL" and contato.municipio_id != current_user.municipio_id:
        raise ForbiddenException("Acesso negado")
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(contato, field, value)
    db.commit()
    db.refresh(contato)
    return contato


@router.delete("/retencao/contatos/{contato_id}")
def deletar_contato(
    contato_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_permissao("retencao", "editar")),
):
    contato = db.get(ContatoEmpresa, contato_id)
    if not contato:
        raise NotFoundException("Contato não encontrado")
    if current_user.role.nome != "ADMIN_GLOBAL" and contato.municipio_id != current_user.municipio_id:
        raise ForbiddenException("Acesso negado")
    db.delete(contato)
    db.commit()
    return {"ok": True}
```

e o trio de demandas:

```python
@router.post("/retencao/{empresa_id}/demandas", response_model=DemandaEmpresaOut)
def adicionar_demanda(
    empresa_id: int,
    data: DemandaEmpresaCreate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_permissao("retencao", "editar")),
):
    empresa = db.get(EmpresaRetencao, empresa_id)
    if not empresa:
        raise NotFoundException("Empresa não encontrada")
    if current_user.role.nome != "ADMIN_GLOBAL" and empresa.municipio_id != current_user.municipio_id:
        raise ForbiddenException("Acesso negado")
    demanda = DemandaEmpresa(
        **data.model_dump(),
        empresa_id=empresa_id,
        municipio_id=empresa.municipio_id,
        criado_por=current_user.id,
    )
    db.add(demanda)
    db.commit()
    db.refresh(demanda)
    return demanda


@router.put("/retencao/demandas/{demanda_id}", response_model=DemandaEmpresaOut)
def atualizar_demanda(
    demanda_id: int,
    data: DemandaEmpresaUpdate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_permissao("retencao", "editar")),
):
    demanda = db.get(DemandaEmpresa, demanda_id)
    if not demanda:
        raise NotFoundException("Demanda não encontrada")
    if current_user.role.nome != "ADMIN_GLOBAL" and demanda.municipio_id != current_user.municipio_id:
        raise ForbiddenException("Acesso negado")
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(demanda, field, value)
    db.commit()
    db.refresh(demanda)
    return demanda


@router.delete("/retencao/demandas/{demanda_id}")
def deletar_demanda(
    demanda_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_permissao("retencao", "editar")),
):
    demanda = db.get(DemandaEmpresa, demanda_id)
    if not demanda:
        raise NotFoundException("Demanda não encontrada")
    if current_user.role.nome != "ADMIN_GLOBAL" and demanda.municipio_id != current_user.municipio_id:
        raise ForbiddenException("Acesso negado")
    db.delete(demanda)
    db.commit()
    return {"ok": True}
```

- [ ] **Step 4: Rodar e confirmar; suite completa**

Run: `venv/Scripts/python -m pytest backend/tests/test_gestao_empresarial_endpoints.py -q`
Expected: PASS (10 testes).
Run: `venv/Scripts/python -m pytest backend/tests -q`
Expected: PASS — 409 + 16 = 425 (3 models + 6 schemas + 10 endpoints − sobreposição zero; reportar o número exato), zero falhas.

- [ ] **Step 5: Commit**

```bash
git add backend/app/api/v1/routers/desenvolvimento_economico.py backend/tests/test_gestao_empresarial_endpoints.py
git commit -m "feat(gestao-empresarial): CRUDs de contatos/demandas, detalhe com perfil RFB e view-as na listagem"
```

---

### Task 4: `GET /empresas/buscar` + labels "Gestão Empresarial"

**Files:**
- Modify: `backend/app/api/v1/routers/empresas.py` (novo endpoint; imports)
- Modify: `backend/app/core/permissions.py` (AREA_LABELS)
- Modify: `frontend-observatorio/src/pages/admin/RolesAdminPage.jsx` (label espelhado da área `retencao`)
- Test: `backend/tests/test_empresas_buscar.py`

**Interfaces:**
- Consumes: `Empresa` model, `EmpresaOut` schema, `scoped_modulo("empresas")` (padrão do router).
- Produces (Task 6 depende): `GET /empresas/buscar?q=` → `List[EmpresaOut]`, máx. 10; `q` com `min_length=2`; match por `ilike` em `razao_social`/`nome_fantasia`, OU por prefixo de `cnpj_basico` quando `q` tiver ≥3 dígitos; `mid None` (ADMIN_GLOBAL sem view-as) → `[]`.

- [ ] **Step 1: Escrever os testes (falhando)**

Criar `backend/tests/test_empresas_buscar.py`:

```python
"""Busca de empresa individual para o autocomplete da Gestão Empresarial."""
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

import app.models  # noqa: F401
from app.db.base import Base
from app.models.empresa import Empresa
from app.models.municipio import Municipio


@pytest.fixture()
def db():
    engine = create_engine("sqlite://")
    Base.metadata.create_all(engine, tables=[Municipio.__table__, Empresa.__table__])
    session = sessionmaker(bind=engine)()
    m = Municipio(nome="Alfa", uf="MG")
    session.add(m)
    session.flush()
    session.add_all([
        Empresa(municipio_id=m.id, cnpj_basico="12345678", razao_social="ACME LTDA",
                nome_fantasia="ACME"),
        Empresa(municipio_id=m.id, cnpj_basico="87654321", razao_social="BETA COMERCIO"),
    ])
    session.commit()
    session.mid = m.id
    yield session
    session.close()


def test_busca_por_nome(db):
    from app.api.v1.routers.empresas import buscar_empresas
    r = buscar_empresas(q="acme", mid=db.mid, db=db)
    assert [e.razao_social for e in r] == ["ACME LTDA"]


def test_busca_por_cnpj(db):
    from app.api.v1.routers.empresas import buscar_empresas
    r = buscar_empresas(q="12.345", mid=db.mid, db=db)
    assert [e.cnpj_basico for e in r] == ["12345678"]


def test_sem_modulo_devolve_vazio(db):
    from app.api.v1.routers.empresas import buscar_empresas
    assert buscar_empresas(q="acme", mid=None, db=db) == []


def test_rota_no_openapi_e_label_renomeado():
    from app.core.permissions import AREA_LABELS
    from app.main import app
    assert "/api/v1/empresas/buscar" in app.openapi()["paths"]
    assert AREA_LABELS["retencao"] == "Gestão Empresarial"
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `venv/Scripts/python -m pytest backend/tests/test_empresas_buscar.py -q`
Expected: FAIL — `ImportError: buscar_empresas`.

- [ ] **Step 3: Implementar**

Em `backend/app/api/v1/routers/empresas.py` (mirar o estilo dos endpoints existentes; adicionar `or_` ao import de sqlalchemy e `re` no topo se ausentes; `EmpresaOut` ao import de schemas):

```python
@router.get("/buscar", response_model=List[EmpresaOut])
def buscar_empresas(
    q: str = Query(min_length=2),
    mid: int | None = Depends(scoped_modulo("empresas")),
    db: Session = Depends(get_db),
):
    """Autocomplete da Gestão Empresarial: match por nome ou raiz de CNPJ."""
    if mid is None:
        return []
    digitos = re.sub(r"\D", "", q)
    query = db.query(Empresa).filter(Empresa.municipio_id == mid)
    if len(digitos) >= 3:
        query = query.filter(Empresa.cnpj_basico.like(f"{digitos[:8]}%"))
    else:
        like = f"%{q}%"
        query = query.filter(or_(
            Empresa.razao_social.ilike(like),
            Empresa.nome_fantasia.ilike(like),
        ))
    return query.order_by(Empresa.razao_social).limit(10).all()
```

Em `backend/app/core/permissions.py`: `AREA_LABELS["retencao"]` → `"Gestão Empresarial"`.
Em `frontend-observatorio/src/pages/admin/RolesAdminPage.jsx`: no array local de áreas, o label de `retencao` → `"Gestão Empresarial"` (só o label; a key não muda).

- [ ] **Step 4: Rodar e confirmar; suites**

Run: `venv/Scripts/python -m pytest backend/tests/test_empresas_buscar.py -q` → PASS (4 testes).
Run: `venv/Scripts/python -m pytest backend/tests -q` → PASS, zero falhas (reportar total).
Run (de `frontend-observatorio/`): `npx vitest run` → 267/267 (o label do RolesAdminPage não tem teste — confirmar zero regressões).

- [ ] **Step 5: Commit**

```bash
git add backend/app/api/v1/routers/empresas.py backend/app/core/permissions.py backend/tests/test_empresas_buscar.py frontend-observatorio/src/pages/admin/RolesAdminPage.jsx
git commit -m "feat(gestao-empresarial): busca de empresa RFB para autocomplete e label da area renomeado"
```

---

### Task 5: Frontend — `EmpresaDrawer` com abas + página renomeada

**Files:**
- Create: `frontend-observatorio/src/pages/desenvolvimento-economico/EmpresaDrawer.jsx`
- Create (rename via `git mv`): `frontend-observatorio/src/pages/desenvolvimento-economico/RetencaoTab.jsx` → `GestaoEmpresarialTab.jsx`
- Modify: `frontend-observatorio/src/app/router/AppRouter.jsx` (import do componente renomeado; a ROTA não muda)
- Test: `frontend-observatorio/src/pages/desenvolvimento-economico/EmpresaDrawer.test.jsx`

**Interfaces:**
- Consumes: endpoints da Task 3; `NidDrawer`, `NidTabBar`, `PlanGate`, `useToast`, `api`.
- Produces (Task 6 depende): `export default function EmpresaDrawer({ empresa, detalhe, onClose, onChanged, canEditar })` — `empresa` = item lean da lista (ou null p/ fechado); `detalhe` = payload de `GET /retencao/{id}` (ou undefined enquanto carrega); `onChanged(empresaId)` recarrega detalhe+lista na página. A página exporta `default GestaoEmpresarialTab`.

- [ ] **Step 1: Escrever os testes do drawer (falhando)**

Criar `EmpresaDrawer.test.jsx`:

```jsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("../../services/api", () => ({
  default: { get: vi.fn(), post: vi.fn(() => Promise.resolve({ data: {} })),
             put: vi.fn(() => Promise.resolve({ data: {} })),
             delete: vi.fn(() => Promise.resolve({ data: { ok: true } })) },
}));
vi.mock("../../context/ToastContext", () => ({ useToast: () => ({ addToast: vi.fn() }) }));

import api from "../../services/api";
import { PlanContext } from "../../context/PlanContext";
import EmpresaDrawer from "./EmpresaDrawer";

const EMPRESA = { id: 7, nome: "ACME", setor: "Indústria", status_risco: "alto",
  potencial_expansao: "medio", num_empregos: 42, proxima_acao: "Agendar reunião",
  proxima_acao_data: "2026-09-01" };
const DETALHE = {
  ...EMPRESA,
  visitas: [{ id: 1, data_visita: "2026-08-01", responsavel: "Ana", observacoes: "ok", foto_base64: null }],
  contatos: [{ id: 2, data: "2026-08-05", tipo: "ligacao", responsavel: "Bia", observacoes: null }],
  demandas: [{ id: 3, descricao: "Iluminação da via", status: "aberta", data_registro: "2026-08-02", responsavel: null }],
  perfil_rfb: { id: 9, cnpj_basico: "12345678", razao_social: "ACME LTDA",
    nome_fantasia: "ACME", situacao: "02", porte: "03", cnae_fiscal: "1011101",
    capital_social: 150000, data_inicio: "2010-01-05", opcao_simples: true, opcao_mei: false },
};

function montar(props = {}) {
  return render(
    <EmpresaDrawer empresa={EMPRESA} detalhe={DETALHE} onClose={() => {}}
      onChanged={props.onChanged || vi.fn()} canEditar={props.canEditar ?? true} />
  );
}

beforeEach(() => vi.clearAllMocks());

describe("EmpresaDrawer — abas", () => {
  it("mostra as 3 abas com Perfil ativo por padrão, incluindo a seção RFB", () => {
    montar();
    expect(screen.getByRole("tab", { name: /Perfil/ })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Contatos & Visitas/ })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Demandas/ })).toBeInTheDocument();
    expect(screen.getByText("ACME LTDA")).toBeInTheDocument(); // razão social RFB
    expect(screen.getByText("Agendar reunião")).toBeInTheDocument(); // próxima ação
  });

  it("aba Contatos & Visitas mescla os dois tipos em ordem cronológica", () => {
    montar();
    fireEvent.click(screen.getByRole("tab", { name: /Contatos & Visitas/ }));
    const itens = screen.getAllByTestId("timeline-item");
    expect(itens).toHaveLength(2);
    expect(itens[0].textContent).toContain("Visita");   // 01/08 antes de
    expect(itens[1].textContent).toContain("Ligação");  // 05/08
  });

  it("registra contato novo via POST", async () => {
    const onChanged = vi.fn();
    montar({ onChanged });
    fireEvent.click(screen.getByRole("tab", { name: /Contatos & Visitas/ }));
    fireEvent.change(screen.getByLabelText("Data do contato"), { target: { value: "2026-08-10" } });
    fireEvent.click(screen.getByRole("button", { name: "Registrar contato" }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      "/desenvolvimento-economico/retencao/7/contatos",
      expect.objectContaining({ data: "2026-08-10", tipo: "reuniao" })
    ));
    await waitFor(() => expect(onChanged).toHaveBeenCalledWith(7));
  });

  it("muda status da demanda via PUT", async () => {
    montar();
    fireEvent.click(screen.getByRole("tab", { name: /Demandas/ }));
    fireEvent.change(screen.getByLabelText("Status da demanda Iluminação da via"),
      { target: { value: "resolvida" } });
    await waitFor(() => expect(api.put).toHaveBeenCalledWith(
      "/desenvolvimento-economico/retencao/demandas/3",
      { status: "resolvida" }
    ));
  });

  it("sem canEditar não há formulários nem selects de status", () => {
    montar({ canEditar: false });
    fireEvent.click(screen.getByRole("tab", { name: /Demandas/ }));
    expect(screen.queryByRole("button", { name: /Registrar/ })).toBeNull();
    expect(screen.queryByLabelText(/Status da demanda/)).toBeNull();
  });

  it("seção RFB fica sob PlanGate quando o plano não inclui empresas", () => {
    render(
      <PlanContext.Provider value={{ modulos: [], canAccess: (k) => k !== "empresas" }}>
        <EmpresaDrawer empresa={EMPRESA} detalhe={DETALHE} onClose={() => {}}
          onChanged={vi.fn()} canEditar={true} />
      </PlanContext.Provider>
    );
    expect(screen.getByText("Disponível apenas no plano pago")).toBeInTheDocument();
  });
});
```

Nota sobre as queries de aba: se o `NidTabBar` real não expuser `role="tab"` nos botões, ajustar as queries para o que o componente renderiza (fonte de verdade é `src/components/nid/NidTabBar.jsx`) — nunca mudar o componente para caber no teste.

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run src/pages/desenvolvimento-economico/EmpresaDrawer.test.jsx`
Expected: FAIL — módulo `./EmpresaDrawer` não existe.

- [ ] **Step 3: Implementar `EmpresaDrawer.jsx`**

Conteúdo completo (visual segue o drawer atual do RetencaoTab — timeline com bolinha azul, inputs `text-xs`, botões azuis):

```jsx
import { useState } from "react";
import { CameraIcon, PencilIcon, TrashIcon } from "@heroicons/react/24/outline";
import api from "../../services/api";
import { useToast } from "../../context/ToastContext";
import NidDrawer from "../../components/nid/NidDrawer";
import NidTabBar from "../../components/nid/NidTabBar";
import PlanGate from "../../components/PlanGate";

const RISCO_CONFIG = {
  baixo: { label: "Risco baixo", color: "bg-[var(--panel-2)] text-green-400" },
  medio: { label: "Risco médio", color: "bg-[var(--panel-2)] text-amber-400" },
  alto: { label: "Risco alto", color: "bg-[var(--panel-2)] text-red-400" },
};
const EXPANSAO_CONFIG = {
  baixo: { label: "Expansão baixa", color: "bg-[var(--panel-2)] text-[var(--text-dim)]" },
  medio: { label: "Expansão média", color: "bg-[var(--panel-2)] text-amber-400" },
  alto: { label: "Expansão alta", color: "bg-[var(--panel-2)] text-blue-400" },
};
const TIPO_CONTATO = { reuniao: "Reunião", ligacao: "Ligação", email: "E-mail", visita_tecnica: "Visita técnica", outro: "Outro" };
const STATUS_DEMANDA = {
  aberta: { label: "Aberta", cls: "bg-[var(--panel-2)] text-amber-400" },
  em_andamento: { label: "Em andamento", cls: "bg-[var(--panel-2)] text-blue-400" },
  resolvida: { label: "Resolvida", cls: "bg-[var(--panel-2)] text-green-400" },
};
const PORTE_RFB = { "00": "Não informado", "01": "Micro", "03": "Pequena", "05": "Média", "07": "Grande" };
const SITUACAO_RFB = { "01": "Nula", "02": "Ativa", "03": "Suspensa", "04": "Inapta", "08": "Baixada" };
const ABAS = ["Perfil", "Contatos & Visitas", "Demandas"];

const inputCls = "w-full px-3 py-1.5 rounded-lg border border-[var(--border)] text-xs bg-[var(--panel-2)] text-[var(--text)] focus:outline-none focus:ring-1 focus:ring-blue-500";

function fmtDate(d) {
  if (!d) return "";
  return new Date(d + "T00:00:00").toLocaleDateString("pt-BR");
}

function fmtBRL(v) {
  if (v == null) return "—";
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

const defaultContato = { data: "", tipo: "reuniao", responsavel: "", observacoes: "" };
const defaultVisita = { data_visita: "", responsavel: "", observacoes: "", foto_base64: "" };
const defaultDemanda = { descricao: "", data_registro: "", responsavel: "" };

export default function EmpresaDrawer({ empresa, detalhe, onClose, onChanged, canEditar }) {
  const { addToast } = useToast();
  const [aba, setAba] = useState(0);
  const [contatoForm, setContatoForm] = useState(defaultContato);
  const [visitaForm, setVisitaForm] = useState(defaultVisita);
  const [demandaForm, setDemandaForm] = useState(defaultDemanda);
  const [editingDemandaId, setEditingDemandaId] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const [acaoForm, setAcaoForm] = useState(null); // null = exibindo; {proxima_acao, proxima_acao_data} = editando

  const det = detalhe;
  const risco = empresa ? RISCO_CONFIG[empresa.status_risco] || RISCO_CONFIG.baixo : null;
  const expansao = empresa ? EXPANSAO_CONFIG[empresa.potencial_expansao] || EXPANSAO_CONFIG.baixo : null;
  const fotoHero = det?.visitas?.find((v) => v.foto_base64)?.foto_base64 || null;

  async function chamar(fn, okMsg, errMsg) {
    setSalvando(true);
    try {
      await fn();
      addToast(okMsg, "success");
      onChanged(empresa.id);
    } catch {
      addToast(errMsg, "error");
    } finally {
      setSalvando(false);
    }
  }

  const addContato = () => {
    if (!contatoForm.data) { addToast("Informe a data do contato", "error"); return; }
    chamar(async () => {
      await api.post(`/desenvolvimento-economico/retencao/${empresa.id}/contatos`, {
        ...contatoForm,
        responsavel: contatoForm.responsavel || null,
        observacoes: contatoForm.observacoes || null,
      });
      setContatoForm(defaultContato);
    }, "Contato registrado", "Erro ao registrar contato");
  };

  const addVisita = () => {
    if (!visitaForm.data_visita) { addToast("Informe a data da visita", "error"); return; }
    chamar(async () => {
      await api.post(`/desenvolvimento-economico/retencao/${empresa.id}/visitas`, {
        ...visitaForm, foto_base64: visitaForm.foto_base64 || null,
      });
      setVisitaForm(defaultVisita);
    }, "Visita registrada", "Erro ao registrar visita");
  };

  const addDemanda = () => {
    if (!demandaForm.descricao || !demandaForm.data_registro) {
      addToast("Informe descrição e data da demanda", "error"); return;
    }
    const payload = { ...demandaForm, responsavel: demandaForm.responsavel || null };
    chamar(async () => {
      if (editingDemandaId) {
        await api.put(`/desenvolvimento-economico/retencao/demandas/${editingDemandaId}`, payload);
      } else {
        await api.post(`/desenvolvimento-economico/retencao/${empresa.id}/demandas`, payload);
      }
      setDemandaForm(defaultDemanda);
      setEditingDemandaId(null);
    }, editingDemandaId ? "Demanda atualizada" : "Demanda registrada", "Erro ao salvar demanda");
  };

  const mudarStatusDemanda = (demanda, status) =>
    chamar(() => api.put(`/desenvolvimento-economico/retencao/demandas/${demanda.id}`, { status }),
      "Status atualizado", "Erro ao atualizar demanda");

  const excluir = (rota, okMsg) =>
    chamar(() => api.delete(rota), okMsg, "Erro ao excluir");

  const salvarAcao = () =>
    chamar(async () => {
      await api.put(`/desenvolvimento-economico/retencao/${empresa.id}`, {
        proxima_acao: acaoForm.proxima_acao || null,
        proxima_acao_data: acaoForm.proxima_acao_data || null,
      });
      setAcaoForm(null);
    }, "Próxima ação salva", "Erro ao salvar");

  function handleFotoChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setVisitaForm((p) => ({ ...p, foto_base64: ev.target.result }));
    reader.readAsDataURL(file);
  }

  const timeline = det
    ? [
        ...(det.visitas || []).map((v) => ({ kind: "visita", data: v.data_visita, item: v })),
        ...(det.contatos || []).map((c) => ({ kind: "contato", data: c.data, item: c })),
      ].sort((a, b) => (a.data < b.data ? -1 : 1))
    : null;

  return (
    <NidDrawer
      open={!!empresa}
      onClose={onClose}
      ariaLabel={empresa ? `Detalhes da empresa ${empresa.nome}` : "Detalhes da empresa"}
      hero={fotoHero && (
        <img src={fotoHero} alt={`Foto de visita a ${empresa.nome}`}
          style={{ width: "100%", height: 200, objectFit: "cover", display: "block" }} />
      )}
    >
      {empresa && (
        <div className="space-y-4">
          <div className="pr-8">
            <h2 className="text-lg font-bold text-[var(--text)] leading-snug">{empresa.nome}</h2>
            {empresa.setor && <p className="text-xs text-slate-400 mt-1">{empresa.setor}</p>}
          </div>
          <div className="flex flex-wrap gap-1.5">
            <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${risco.color}`}>{risco.label}</span>
            <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${expansao.color}`}>{expansao.label}</span>
          </div>

          {/* Próxima ação */}
          <div className="rounded-xl border border-[var(--border)] bg-[var(--panel-2)] p-3 space-y-2">
            <p className="text-xs font-semibold text-[var(--text-dim)] uppercase tracking-wider">Próxima ação</p>
            {acaoForm ? (
              <div className="space-y-2">
                <input aria-label="Próxima ação" value={acaoForm.proxima_acao}
                  onChange={(e) => setAcaoForm((p) => ({ ...p, proxima_acao: e.target.value }))}
                  className={inputCls} />
                <input aria-label="Data da próxima ação" type="date" value={acaoForm.proxima_acao_data}
                  onChange={(e) => setAcaoForm((p) => ({ ...p, proxima_acao_data: e.target.value }))}
                  className={inputCls} />
                <div className="flex gap-2">
                  <button type="button" onClick={salvarAcao} disabled={salvando}
                    className="flex-1 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium disabled:opacity-50 cursor-pointer">Salvar</button>
                  <button type="button" onClick={() => setAcaoForm(null)}
                    className="px-3 py-1.5 rounded-lg border border-[var(--border)] text-xs text-[var(--text-dim)] cursor-pointer">Cancelar</button>
                </div>
              </div>
            ) : (
              <div className="flex items-start justify-between gap-2">
                <p className="text-xs text-[var(--text)]">
                  {empresa.proxima_acao
                    ? <>{empresa.proxima_acao}{empresa.proxima_acao_data && <span className="text-slate-400"> · {fmtDate(empresa.proxima_acao_data)}</span>}</>
                    : <span className="text-slate-400">Nenhuma ação planejada.</span>}
                </p>
                {canEditar && (
                  <button type="button"
                    onClick={() => setAcaoForm({
                      proxima_acao: empresa.proxima_acao || "",
                      proxima_acao_data: empresa.proxima_acao_data || "",
                    })}
                    className="text-xs text-blue-600 hover:text-blue-700 font-medium shrink-0 cursor-pointer">Editar</button>
                )}
              </div>
            )}
          </div>

          <NidTabBar tabs={ABAS} value={aba} onChange={setAba} ariaLabel="Seções da empresa" />

          {/* ── Aba Perfil ── */}
          {aba === 0 && (
            <div className="space-y-3">
              {empresa.num_empregos != null && (
                <p className="text-xs text-slate-400">{empresa.num_empregos.toLocaleString("pt-BR")} emprego(s)</p>
              )}
              {empresa.responsavel && (
                <p className="text-xs text-slate-400">Responsável: {empresa.responsavel}</p>
              )}
              <PlanGate planKey="empresas">
                <div className="border-t border-[var(--border)] pt-3 space-y-1.5">
                  <p className="text-xs font-semibold text-[var(--text-dim)] uppercase tracking-wider">Base RFB</p>
                  {det?.perfil_rfb ? (
                    <dl className="text-xs text-[var(--text-dim)] space-y-1">
                      <div><dt className="inline text-slate-400">Razão social: </dt><dd className="inline text-[var(--text)]">{det.perfil_rfb.razao_social}</dd></div>
                      {det.perfil_rfb.nome_fantasia && <div><dt className="inline text-slate-400">Nome fantasia: </dt><dd className="inline">{det.perfil_rfb.nome_fantasia}</dd></div>}
                      <div><dt className="inline text-slate-400">Situação: </dt><dd className="inline">{SITUACAO_RFB[det.perfil_rfb.situacao] || det.perfil_rfb.situacao || "—"}</dd></div>
                      <div><dt className="inline text-slate-400">Porte: </dt><dd className="inline">{PORTE_RFB[det.perfil_rfb.porte] || det.perfil_rfb.porte || "—"}</dd></div>
                      <div><dt className="inline text-slate-400">CNAE: </dt><dd className="inline">{det.perfil_rfb.cnae_fiscal || "—"}</dd></div>
                      <div><dt className="inline text-slate-400">Capital social: </dt><dd className="inline">{fmtBRL(det.perfil_rfb.capital_social)}</dd></div>
                      <div><dt className="inline text-slate-400">Abertura: </dt><dd className="inline">{det.perfil_rfb.data_inicio ? fmtDate(det.perfil_rfb.data_inicio) : "—"}</dd></div>
                    </dl>
                  ) : (
                    <p className="text-xs text-slate-400">
                      {empresa.cnpj_basico
                        ? "Sem dados da RFB para este CNPJ neste município."
                        : "Empresa sem vínculo com a base CNPJ — vincule no formulário de edição."}
                    </p>
                  )}
                </div>
              </PlanGate>
            </div>
          )}

          {/* ── Aba Contatos & Visitas ── */}
          {aba === 1 && (
            <div className="space-y-4">
              {timeline == null ? (
                <div className="flex justify-center py-2">
                  <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : timeline.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-2">Nenhum contato ou visita registrado.</p>
              ) : (
                <div className="space-y-3">
                  {timeline.map(({ kind, item }) => (
                    <div key={`${kind}-${item.id}`} data-testid="timeline-item" className="flex gap-3">
                      <div className="flex flex-col items-center">
                        <div className={`w-2 h-2 rounded-full mt-1 shrink-0 ${kind === "visita" ? "bg-blue-500" : "bg-violet-500"}`} />
                        <div className="w-px flex-1 bg-[var(--panel-2)] mt-1" />
                      </div>
                      <div className="flex-1 pb-2 space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-xs font-medium text-[var(--text-dim)]">
                            <span className="font-semibold">{kind === "visita" ? "Visita" : TIPO_CONTATO[item.tipo] || "Contato"}</span>
                            {" · "}{fmtDate(kind === "visita" ? item.data_visita : item.data)}
                          </p>
                          {canEditar && (
                            <button type="button"
                              onClick={() => excluir(
                                kind === "visita"
                                  ? `/desenvolvimento-economico/retencao/visitas/${item.id}`
                                  : `/desenvolvimento-economico/retencao/contatos/${item.id}`,
                                kind === "visita" ? "Visita removida" : "Contato removido")}
                              className="p-1 rounded text-slate-300 hover:text-red-500 transition-colors cursor-pointer"
                              aria-label={`Excluir ${kind === "visita" ? "visita" : "contato"} de ${fmtDate(kind === "visita" ? item.data_visita : item.data)}`}>
                              <TrashIcon className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                        {item.responsavel && <p className="text-xs text-slate-400">{item.responsavel}</p>}
                        {item.observacoes && <p className="text-xs text-[var(--text-dim)]">{item.observacoes}</p>}
                        {item.foto_base64 && (
                          <img src={item.foto_base64} alt="Foto da visita" className="w-16 h-16 object-cover rounded mt-1" />
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {canEditar && (
                <div className="border-t border-[var(--border)] pt-3 space-y-2">
                  <p className="text-xs font-semibold text-[var(--text-dim)] uppercase tracking-wider">Registrar contato</p>
                  <input aria-label="Data do contato" type="date" value={contatoForm.data}
                    onChange={(e) => setContatoForm((p) => ({ ...p, data: e.target.value }))} className={inputCls} />
                  <select aria-label="Tipo do contato" value={contatoForm.tipo}
                    onChange={(e) => setContatoForm((p) => ({ ...p, tipo: e.target.value }))} className={inputCls}>
                    {Object.entries(TIPO_CONTATO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                  <input value={contatoForm.responsavel} placeholder="Responsável"
                    onChange={(e) => setContatoForm((p) => ({ ...p, responsavel: e.target.value }))} className={inputCls} />
                  <textarea value={contatoForm.observacoes} placeholder="Observações" rows={2}
                    onChange={(e) => setContatoForm((p) => ({ ...p, observacoes: e.target.value }))}
                    className={`${inputCls} resize-none`} />
                  <button type="button" onClick={addContato} disabled={salvando}
                    className="w-full py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium disabled:opacity-50 cursor-pointer">
                    Registrar contato
                  </button>

                  <p className="text-xs font-semibold text-[var(--text-dim)] uppercase tracking-wider pt-2">Registrar visita</p>
                  <input aria-label="Data da visita" type="date" value={visitaForm.data_visita}
                    onChange={(e) => setVisitaForm((p) => ({ ...p, data_visita: e.target.value }))} className={inputCls} />
                  <input value={visitaForm.responsavel} placeholder="Responsável"
                    onChange={(e) => setVisitaForm((p) => ({ ...p, responsavel: e.target.value }))} className={inputCls} />
                  <textarea value={visitaForm.observacoes} placeholder="Observações" rows={2}
                    onChange={(e) => setVisitaForm((p) => ({ ...p, observacoes: e.target.value }))}
                    className={`${inputCls} resize-none`} />
                  <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-400 hover:text-slate-600">
                    <CameraIcon className="w-4 h-4" />
                    {visitaForm.foto_base64 ? "Foto selecionada ✓" : "Adicionar foto"}
                    <input type="file" accept="image/*" className="hidden" onChange={handleFotoChange} />
                  </label>
                  <button type="button" onClick={addVisita} disabled={salvando}
                    className="w-full py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium disabled:opacity-50 cursor-pointer">
                    Registrar visita
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ── Aba Demandas ── */}
          {aba === 2 && (
            <div className="space-y-4">
              {det == null ? (
                <div className="flex justify-center py-2">
                  <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : (det.demandas || []).length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-2">Nenhuma demanda registrada.</p>
              ) : (
                <div className="space-y-3">
                  {det.demandas.map((d) => {
                    const st = STATUS_DEMANDA[d.status] || STATUS_DEMANDA.aberta;
                    return (
                      <div key={d.id} className="rounded-xl border border-[var(--border)] p-3 space-y-1.5">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-xs text-[var(--text)] flex-1">{d.descricao}</p>
                          {canEditar && (
                            <div className="flex gap-1 shrink-0">
                              <button type="button"
                                onClick={() => {
                                  setEditingDemandaId(d.id);
                                  setDemandaForm({ descricao: d.descricao, data_registro: d.data_registro, responsavel: d.responsavel || "" });
                                }}
                                className="p-1 rounded text-slate-300 hover:text-blue-500 transition-colors cursor-pointer"
                                aria-label={`Editar demanda ${d.descricao}`}>
                                <PencilIcon className="w-3 h-3" />
                              </button>
                              <button type="button"
                                onClick={() => excluir(`/desenvolvimento-economico/retencao/demandas/${d.id}`, "Demanda removida")}
                                className="p-1 rounded text-slate-300 hover:text-red-500 transition-colors cursor-pointer"
                                aria-label={`Excluir demanda ${d.descricao}`}>
                                <TrashIcon className="w-3 h-3" />
                              </button>
                            </div>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-400">
                          {fmtDate(d.data_registro)}{d.responsavel && ` · ${d.responsavel}`}
                        </p>
                        {canEditar ? (
                          <select aria-label={`Status da demanda ${d.descricao}`} value={d.status}
                            onChange={(e) => mudarStatusDemanda(d, e.target.value)} className={inputCls}>
                            {Object.entries(STATUS_DEMANDA).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                          </select>
                        ) : (
                          <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${st.cls}`}>{st.label}</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {canEditar && (
                <div className="border-t border-[var(--border)] pt-3 space-y-2">
                  <p className="text-xs font-semibold text-[var(--text-dim)] uppercase tracking-wider">
                    {editingDemandaId ? "Editar demanda" : "Registrar demanda"}
                  </p>
                  <textarea aria-label="Descrição da demanda" value={demandaForm.descricao}
                    placeholder="Descrição *" rows={2}
                    onChange={(e) => setDemandaForm((p) => ({ ...p, descricao: e.target.value }))}
                    className={`${inputCls} resize-none`} />
                  <input aria-label="Data da demanda" type="date" value={demandaForm.data_registro}
                    onChange={(e) => setDemandaForm((p) => ({ ...p, data_registro: e.target.value }))} className={inputCls} />
                  <input value={demandaForm.responsavel} placeholder="Responsável"
                    onChange={(e) => setDemandaForm((p) => ({ ...p, responsavel: e.target.value }))} className={inputCls} />
                  <button type="button" onClick={addDemanda} disabled={salvando}
                    className="w-full py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium disabled:opacity-50 cursor-pointer">
                    {editingDemandaId ? "Salvar demanda" : "Registrar demanda"}
                  </button>
                  {editingDemandaId && (
                    <button type="button"
                      onClick={() => { setEditingDemandaId(null); setDemandaForm(defaultDemanda); }}
                      className="w-full py-1.5 rounded-lg border border-[var(--border)] text-xs text-[var(--text-dim)] cursor-pointer">
                      Cancelar edição
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </NidDrawer>
  );
}
```

- [ ] **Step 4: Renomear a página e ligá-la ao drawer**

1. `git mv frontend-observatorio/src/pages/desenvolvimento-economico/RetencaoTab.jsx frontend-observatorio/src/pages/desenvolvimento-economico/GestaoEmpresarialTab.jsx`
2. No arquivo renomeado:
   - função `RetencaoTab` → `GestaoEmpresarialTab`; h1 → `Gestão Empresarial`; abaixo do h1, adicionar o subtítulo (mesma estrutura de header do ProjetosPage — div envolvendo h1 + p):
     `<p className="text-xs mt-0.5 text-[var(--text-dim)]">Relacionamento com empresas — perfil, contatos, demandas, retenção e expansão.</p>`
   - **Substituir o bloco do drawer inline inteiro** (o IIFE `{(() => { ... })()}` com `<NidDrawer>`) por:

```jsx
      <EmpresaDrawer
        empresa={viewingEmpresa}
        detalhe={viewingEmpresa ? detalhe[viewingEmpresa.id] : null}
        onClose={() => setViewingEmpresa(null)}
        onChanged={async (id) => { await loadDetalhe(id); await load(); }}
        canEditar={canEditar}
      />
```

   - Remover do arquivo o que migrou para o drawer: `defaultVisitaForm`, estados `visitaForm/savingVisita/deletingVisitaId`, `handleFotoChange`, `handleAddVisita`, `handleDeleteVisita`, e os imports que ficarem órfãos (`CameraIcon`, `InformationCircleIcon` se o guard mudar, `NidDrawer`). `RISCO_CONFIG`/`EXPANSAO_CONFIG` continuam usados pelos cards — ficam.
   - Adicionar `import EmpresaDrawer from "./EmpresaDrawer";`.
   - **Guard ADMIN_GLOBAL** → padrão view-as: `import { useViewAs } from "../../context/ViewAsContext";` e `import SelecioneMunicipio from "../../components/nid/SelecioneMunicipio";`; substituir o bloco `if (isGlobal) {...}` por:

```jsx
  const { viewAsId } = useViewAs();
  const needsMunicipio = isGlobal && viewAsId == null;
```

(declarado junto aos hooks no topo) e

```jsx
  if (needsMunicipio) {
    return (
      <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="space-y-6">
        {header}
        <SelecioneMunicipio />
      </motion.div>
    );
  }
```

(`canCriar` continua `usePermissao("retencao","criar") && !isGlobal` — global não cria.)
   - No card, após o bloco de `num_empregos`, adicionar:

```jsx
                  {empresa.proxima_acao && (
                    <p className="text-xs text-slate-400">
                      <span className="font-medium text-[var(--text-dim)]">Próxima ação:</span> {empresa.proxima_acao}
                      {empresa.proxima_acao_data && ` · ${fmtDate(empresa.proxima_acao_data)}`}
                    </p>
                  )}
```

   - Botão "Ver histórico de visitas" → "Ver detalhes".
3. `AppRouter.jsx`: import `RetencaoTab` → `GestaoEmpresarialTab` (mesma rota `element={<GestaoEmpresarialTab />}`).

- [ ] **Step 5: Rodar testes do drawer + suite completa**

Run: `npx vitest run src/pages/desenvolvimento-economico/EmpresaDrawer.test.jsx` → PASS (6 testes).
Run: `npx vitest run` → **FALHA ESPERADA em `titulosPaginas.test.js`** (título "Retenção & Expansão" sumiu — a Task 6 atualiza o teste). Nenhuma OUTRA falha é aceitável. Se preferir suite verde por task: a atualização do caso RetencaoTab em `titulosPaginas.test.js` pode ser antecipada para esta task (trocar o caso para `["./desenvolvimento-economico/GestaoEmpresarialTab.jsx", "Gestão Empresarial", "Retenção & Expansão"]`) — nesse caso rodar verde já aqui e reportar a antecipação.

- [ ] **Step 6: Commit**

```bash
git add -A frontend-observatorio/src/pages/desenvolvimento-economico/ frontend-observatorio/src/app/router/AppRouter.jsx frontend-observatorio/src/pages/titulosPaginas.test.js
git commit -m "feat(gestao-empresarial): drawer com abas (perfil RFB, contatos e visitas, demandas) e pagina renomeada"
```

---

### Task 6: Frontend — autocomplete de vínculo RFB + navegação/títulos

**Files:**
- Create: `frontend-observatorio/src/pages/desenvolvimento-economico/BuscaEmpresaRfb.jsx`
- Modify: `frontend-observatorio/src/pages/desenvolvimento-economico/GestaoEmpresarialTab.jsx` (formulário)
- Modify: `frontend-observatorio/src/app/layouts/navStructure.jsx` (label do item)
- Modify: `frontend-observatorio/src/app/layouts/navStructure.test.js` (labels)
- Modify: `frontend-observatorio/src/pages/titulosPaginas.test.js` (caso da página, se não antecipado na Task 5)
- Test: `frontend-observatorio/src/pages/desenvolvimento-economico/BuscaEmpresaRfb.test.jsx`

**Interfaces:**
- Consumes: `GET /empresas/buscar?q=` (Task 4); `canAccess` do `PlanContext` (via `useContext(PlanContext)`).
- Produces: `export default function BuscaEmpresaRfb({ onSelect, disabled })` — input com debounce 300ms; dropdown de `<button type="button">` (NUNCA input aninhado em button — lição do MunicipioPicker); `onSelect(empresaRfb)` com o objeto `EmpresaOut` escolhido.

- [ ] **Step 1: Escrever os testes do autocomplete (falhando)**

```jsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";

vi.mock("../../services/api", () => ({
  default: { get: vi.fn(() => Promise.resolve({ data: [
    { id: 9, cnpj_basico: "12345678", razao_social: "ACME LTDA", nome_fantasia: "ACME" },
  ] })) },
}));

import api from "../../services/api";
import BuscaEmpresaRfb from "./BuscaEmpresaRfb";

beforeEach(() => { vi.useFakeTimers(); vi.clearAllMocks(); });
afterEach(() => vi.useRealTimers());

describe("BuscaEmpresaRfb", () => {
  it("busca com debounce e entrega a empresa escolhida", async () => {
    const onSelect = vi.fn();
    render(<BuscaEmpresaRfb onSelect={onSelect} />);
    fireEvent.change(screen.getByLabelText("Buscar empresa na base CNPJ"), { target: { value: "acme" } });
    expect(api.get).not.toHaveBeenCalled(); // ainda no debounce
    await act(() => vi.advanceTimersByTimeAsync(350));
    expect(api.get).toHaveBeenCalledWith("/empresas/buscar", { params: { q: "acme" } });
    const opcao = await screen.findByRole("button", { name: /ACME LTDA/ });
    fireEvent.click(opcao);
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ cnpj_basico: "12345678" }));
  });

  it("menos de 2 caracteres não busca", async () => {
    render(<BuscaEmpresaRfb onSelect={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Buscar empresa na base CNPJ"), { target: { value: "a" } });
    await act(() => vi.advanceTimersByTimeAsync(350));
    expect(api.get).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run src/pages/desenvolvimento-economico/BuscaEmpresaRfb.test.jsx`
Expected: FAIL — módulo inexistente.

- [ ] **Step 3: Implementar `BuscaEmpresaRfb.jsx`**

```jsx
import { useEffect, useRef, useState } from "react";
import api from "../../services/api";

/** Autocomplete da base CNPJ (RFB). Dropdown de <button> — nunca aninhar
 *  input em button (lição do MunicipioPicker: espaço dispara click sintético). */
export default function BuscaEmpresaRfb({ onSelect, disabled }) {
  const [q, setQ] = useState("");
  const [resultados, setResultados] = useState(null);
  const [buscando, setBuscando] = useState(false);
  const timer = useRef(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (q.trim().length < 2) { setResultados(null); return undefined; }
    timer.current = setTimeout(async () => {
      setBuscando(true);
      try {
        const res = await api.get("/empresas/buscar", { params: { q: q.trim() } });
        setResultados(res.data || []);
      } catch {
        setResultados([]);
      } finally {
        setBuscando(false);
      }
    }, 300);
    return () => clearTimeout(timer.current);
  }, [q]);

  return (
    <div className="relative">
      <input
        aria-label="Buscar empresa na base CNPJ"
        value={q}
        disabled={disabled}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Buscar por nome ou CNPJ…"
        className="w-full px-3 py-2 rounded-lg border border-[var(--border)] text-sm bg-[var(--panel-2)] text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      {buscando && <p className="text-[11px] text-slate-400 mt-1">Buscando…</p>}
      {resultados && !buscando && (
        resultados.length === 0 ? (
          <p className="text-[11px] text-slate-400 mt-1">Nenhuma empresa encontrada.</p>
        ) : (
          <div className="absolute z-10 left-0 right-0 mt-1 rounded-xl border border-[var(--border)] bg-[var(--panel)] shadow-xl overflow-hidden">
            {resultados.map((e) => (
              <button
                key={e.id}
                type="button"
                onClick={() => { onSelect(e); setQ(""); setResultados(null); }}
                className="w-full text-left px-3 py-2 text-xs text-[var(--text)] hover:bg-[var(--panel-2)] cursor-pointer"
              >
                <span className="font-medium">{e.razao_social}</span>
                <span className="text-slate-400"> · {e.cnpj_basico}</span>
              </button>
            ))}
          </div>
        )
      )}
    </div>
  );
}
```

- [ ] **Step 4: Integrar no formulário + navegação/títulos**

1. Em `GestaoEmpresarialTab.jsx`:
   - `defaultForm` ganha `cnpj_basico: null`; `openEdit` copia `cnpj_basico: e.cnpj_basico || null`; o payload do `handleSubmit` já envia o form inteiro (inclui `cnpj_basico`).
   - Imports: `BuscaEmpresaRfb`, `{ useContext }` do react e `{ PlanContext }` de `"../../context/PlanContext"`; no componente: `const { canAccess } = useContext(PlanContext);`.
   - No formulário, logo após o campo CNPJ, adicionar:

```jsx
                {canAccess("empresas") && (
                  <div className="md:col-span-2 flex flex-col gap-1">
                    <label className="text-xs font-semibold text-[var(--text-dim)] uppercase tracking-wider">Vínculo com a base CNPJ</label>
                    {form.cnpj_basico ? (
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-1 rounded-full text-[11px] font-medium bg-[var(--panel-2)] text-green-400">
                          Vinculada · {form.cnpj_basico}
                        </span>
                        <button type="button" onClick={() => setForm((p) => ({ ...p, cnpj_basico: null }))}
                          className="text-xs text-red-500 hover:text-red-600 cursor-pointer">Desvincular</button>
                      </div>
                    ) : (
                      <BuscaEmpresaRfb onSelect={(e) => setForm((p) => ({
                        ...p,
                        cnpj_basico: e.cnpj_basico,
                        nome: p.nome || e.razao_social,
                      }))} />
                    )}
                  </div>
                )}
```

2. `navStructure.jsx`: label do item `/app/desenvolvimento-economico/retencao` → `"Gestão Empresarial"` (rota/chave intocadas).
3. `navStructure.test.js`: em labels, `toContain("Retenção & Expansão")` → `toContain("Gestão Empresarial")` e adicionar `not.toContain("Retenção & Expansão")`.
4. `titulosPaginas.test.js` (se não antecipado na Task 5): caso vira `["./desenvolvimento-economico/GestaoEmpresarialTab.jsx", "Gestão Empresarial", "Retenção & Expansão"]`.

- [ ] **Step 5: Rodar tudo**

Run: `npx vitest run src/pages/desenvolvimento-economico/BuscaEmpresaRfb.test.jsx` → PASS (2 testes).
Run: `npx vitest run` → PASS, zero falhas (267 baseline + 6 drawer + 2 autocomplete = 275; reportar exato).

- [ ] **Step 6: Commit**

```bash
git add frontend-observatorio/src/pages/desenvolvimento-economico/ frontend-observatorio/src/app/layouts/navStructure.jsx frontend-observatorio/src/app/layouts/navStructure.test.js frontend-observatorio/src/pages/titulosPaginas.test.js
git commit -m "feat(gestao-empresarial): autocomplete de vinculo RFB no formulario e item da sidebar renomeado"
```

---

### Task 7: Verificação final

**Files:** nenhum novo; commit só se houver correção.

- [ ] **Step 1: Suites completas**

Run: `venv/Scripts/python -m pytest backend/tests -q` (da raiz) → zero falhas (reportar total ≈ 429).
Run: `npx vitest run` (de `frontend-observatorio/`) → zero falhas (reportar total ≈ 275).

- [ ] **Step 2: Lint comparativo (front)**

Novos (`EmpresaDrawer.jsx`, `BuscaEmpresaRfb.jsx`, testes): zero erros além do falso-positivo `motion unused` SE usarem motion (não usam — então zero). Modificados (`GestaoEmpresarialTab.jsx` renomeado, `AppRouter.jsx`, `navStructure.jsx`, `RolesAdminPage.jsx`): comparar contagem com a versão base via `git show <base>:<path> | npx eslint --stdin --stdin-filename <path>` — nenhum erro novo (no arquivo renomeado, comparar com o `RetencaoTab.jsx` da base).

- [ ] **Step 3: Reconfirmar invariantes de navegação**

Run: `npx vitest run src/app/layouts/navStructure.test.js` → PASS (rotas e chaves congeladas; só o label mudou).

- [ ] **Step 4: Relato final (sem commit)**

Registrar as pendências do usuário: push + **deploy da api com a migração 0038** (observar o `alembic upgrade` no log) + checklist visual (drawer com 3 abas nos temas, autocomplete free/pro, view-as como ADMIN_GLOBAL, timeline mesclada).
