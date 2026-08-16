# Trilha de Auditoria + Doc LGPD — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Completar a trilha de auditoria (ações administrativas sobre usuários + leituras de dados pessoais) com retenção aplicada por purga automática, tela admin com abas, e o documento institucional de LGPD.

**Architecture:** Tabela nova `acao_audit` gravada explicitamente pelos handlers (padrão `LoginAudit`), serviço `audit_service.py` com helpers puros testáveis sem DB, purga no lifespan do FastAPI, endpoint + aba novos na tela `/admin/login-audit`. Migração 0037 também corrige a FK do `login_audit` (SET NULL) que hoje estoura no hard delete de usuário.

**Tech Stack:** FastAPI + SQLAlchemy 2.0 + Alembic (backend), React + Tailwind (front), pytest + vitest/jsdom.

**Spec:** `docs/superpowers/specs/2026-08-16-auditoria-lgpd-design.md`

## Global Constraints

- Copy de UI e docs em pt-BR; commits sem acento (padrão do repo).
- Nenhuma dependência nova (backend e front).
- Migração nova = `0037_acao_audit`, `down_revision = "0036_ingestao_arquivo"`.
- **Falha de auditoria NUNCA propaga para a operação principal** (padrão `_record_attempt` de `auth_service.py`).
- **Valor de senha jamais aparece em `detalhe`** — só o nome do campo.
- Gates: `venv/Scripts/python -m pytest backend/tests -q` (rodar da raiz do repo) e `npx vitest run` (de `frontend-observatorio/`) verdes. `npm run lint` global JÁ FALHA (débito) — critério é nenhum erro NOVO nos arquivos tocados.
- Padrão de teste backend: **sem TestClient, sem Postgres**. Lógica pura com fakes; contrato de rota via `app.openapi()`; comportamento de banco (FK, purga) via **sqlite in-memory hermético** (exceção deliberada e contida — o conftest só seta env vars, não abre conexão).
- Testes que precisam de modelos devem importar `app.models` (registra todos os mappers antes do `create_all`).

---

### Task 1: Modelo `AcaoAudit` + fix da FK do `LoginAudit` + migração 0037

**Files:**
- Create: `backend/app/models/acao_audit.py`
- Modify: `backend/app/models/__init__.py` (import + `__all__`)
- Modify: `backend/app/models/login_audit.py:12-14` (FK ganha `ondelete="SET NULL"`)
- Create: `backend/alembic/versions/0037_acao_audit.py`
- Test: `backend/tests/test_acao_audit_model.py`

**Interfaces:**
- Produces: modelo `AcaoAudit` (tabela `acao_audit`) com colunas `id, categoria, acao, ator_id, ator_email, alvo_usuario_id, alvo_email, municipio_id, detalhe, ip, user_agent, criado_em`. Vocabulário: `categoria` ∈ {`"acao"`, `"leitura"`}; `acao` ∈ {`"usuario_criado"`, `"usuario_atualizado"`, `"usuario_excluido"`, `"usuarios_listados"`, `"auditoria_consultada"`}.
- Produces: fixture-padrão de sqlite in-memory (copiável pelos tasks 3–5).

- [ ] **Step 1: Escrever os testes que falham**

```python
# backend/tests/test_acao_audit_model.py
"""Comportamento de banco do AcaoAudit e da FK corrigida do LoginAudit.

Exceção deliberada ao padrão "sem DB": sqlite in-memory hermético com
PRAGMA foreign_keys=ON — é a única forma de testar ondelete=SET NULL e
a purga sem Postgres. Valida o METADATA dos modelos; a migração 0037
espelha o mesmo DDL (conferida por revisão, não por este teste).
"""
import pytest
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker

import app.models  # noqa: F401 — registra todos os mappers
from app.db.base import Base
from app.models.acao_audit import AcaoAudit
from app.models.login_audit import LoginAudit
from app.models.municipio import Municipio
from app.models.role import Role
from app.models.usuario import Usuario


@pytest.fixture()
def db():
    engine = create_engine("sqlite://")

    @event.listens_for(engine, "connect")
    def _fk_on(dbapi_conn, _record):
        dbapi_conn.execute("PRAGMA foreign_keys=ON")

    Base.metadata.create_all(
        engine,
        tables=[
            Municipio.__table__, Role.__table__, Usuario.__table__,
            LoginAudit.__table__, AcaoAudit.__table__,
        ],
    )
    session = sessionmaker(bind=engine)()
    yield session
    session.close()


def _novo_usuario(db, email="ator@x.com", role_nome="ADMIN_GLOBAL"):
    role = db.query(Role).filter(Role.nome == role_nome).first()
    if not role:
        role = Role(nome=role_nome, builtin=True, permissoes={})
        db.add(role)
        db.flush()
    u = Usuario(nome="Teste", email=email, senha_hash="x", role_id=role.id)
    db.add(u)
    db.commit()
    return u


def test_excluir_ator_seta_null_e_preserva_snapshot(db):
    ator = _novo_usuario(db)
    db.add(AcaoAudit(
        categoria="acao", acao="usuario_criado",
        ator_id=ator.id, ator_email=ator.email,
    ))
    db.commit()

    db.delete(ator)
    db.commit()

    linha = db.query(AcaoAudit).one()
    assert linha.ator_id is None
    assert linha.ator_email == "ator@x.com"


def test_excluir_usuario_com_login_audit_nao_estoura(db):
    u = _novo_usuario(db, email="logou@x.com")
    db.add(LoginAudit(
        usuario_id=u.id, email_tentado=u.email, sucesso=True, motivo="ok",
    ))
    db.commit()

    db.delete(u)
    db.commit()  # antes do fix (FK sem ondelete) isto estourava

    linha = db.query(LoginAudit).one()
    assert linha.usuario_id is None
    assert linha.email_tentado == "logou@x.com"
```

- [ ] **Step 2: Rodar e ver falhar**

Run (da raiz): `venv/Scripts/python -m pytest backend/tests/test_acao_audit_model.py -v`
Expected: FAIL — `ModuleNotFoundError: app.models.acao_audit` (1º teste) e FK error no 2º.

- [ ] **Step 3: Implementar modelo + fix + migração**

```python
# backend/app/models/acao_audit.py
from app.db.base import Base
from sqlalchemy import DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func


class AcaoAudit(Base):
    """Trilha de ações administrativas e leituras de dados pessoais.

    Espelha LoginAudit/IngestaoAudit: quem fez o quê, sobre quem, quando.
    `categoria` dirige a retenção (acao = 5 anos, leitura = 12 meses).
    Snapshots de e-mail sobrevivem ao hard delete de ator/alvo (FK SET NULL).
    """

    __tablename__ = "acao_audit"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    # 'acao' | 'leitura'
    categoria: Mapped[str] = mapped_column(String(10), nullable=False, index=True)
    # 'usuario_criado' | 'usuario_atualizado' | 'usuario_excluido'
    # | 'usuarios_listados' | 'auditoria_consultada'
    acao: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    ator_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("usuarios.id", ondelete="SET NULL"),
        nullable=True, index=True,
    )
    ator_email: Mapped[str] = mapped_column(String(150), nullable=False)
    alvo_usuario_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("usuarios.id", ondelete="SET NULL"),
        nullable=True, index=True,
    )
    alvo_email: Mapped[str | None] = mapped_column(String(150), nullable=True)
    municipio_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("municipios.id", ondelete="SET NULL"), nullable=True
    )
    detalhe: Mapped[str | None] = mapped_column(Text, nullable=True)
    ip: Mapped[str | None] = mapped_column(String(64), nullable=True)
    user_agent: Mapped[str | None] = mapped_column(String(512), nullable=True)
    criado_em: Mapped[object] = mapped_column(
        DateTime(timezone=True), server_default=func.now(),
        nullable=False, index=True,
    )
```

Em `backend/app/models/login_audit.py`, a FK vira:

```python
    usuario_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("usuarios.id", ondelete="SET NULL"),
        nullable=True, index=True,
    )
```

Em `backend/app/models/__init__.py`: adicionar `from app.models.acao_audit import AcaoAudit` junto aos imports de audit (linha ~13) e `"AcaoAudit"` no `__all__` (junto de `"IngestaoAudit"`).

```python
# backend/alembic/versions/0037_acao_audit.py
"""acao_audit table + login_audit FK ondelete

Trilha de acoes administrativas (CRUD de usuarios) e leituras de dados
pessoais (listagens). Tambem corrige a FK login_audit.usuario_id para
SET NULL — sem isso, hard delete de usuario com historico de login
estoura FK.

Revision ID: 0037_acao_audit
Revises: 0036_ingestao_arquivo
Create Date: 2026-08-16
"""

import sqlalchemy as sa
from alembic import op


revision = "0037_acao_audit"
down_revision = "0036_ingestao_arquivo"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "acao_audit",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("categoria", sa.String(length=10), nullable=False),
        sa.Column("acao", sa.String(length=40), nullable=False),
        sa.Column(
            "ator_id", sa.Integer(),
            sa.ForeignKey("usuarios.id", ondelete="SET NULL"), nullable=True,
        ),
        sa.Column("ator_email", sa.String(length=150), nullable=False),
        sa.Column(
            "alvo_usuario_id", sa.Integer(),
            sa.ForeignKey("usuarios.id", ondelete="SET NULL"), nullable=True,
        ),
        sa.Column("alvo_email", sa.String(length=150), nullable=True),
        sa.Column(
            "municipio_id", sa.Integer(),
            sa.ForeignKey("municipios.id", ondelete="SET NULL"), nullable=True,
        ),
        sa.Column("detalhe", sa.Text(), nullable=True),
        sa.Column("ip", sa.String(length=64), nullable=True),
        sa.Column("user_agent", sa.String(length=512), nullable=True),
        sa.Column(
            "criado_em", sa.DateTime(timezone=True),
            server_default=sa.func.now(), nullable=False,
        ),
    )
    for col in ("id", "categoria", "acao", "ator_id", "alvo_usuario_id", "criado_em"):
        op.create_index(f"ix_acao_audit_{col}", "acao_audit", [col])

    op.drop_constraint("login_audit_usuario_id_fkey", "login_audit", type_="foreignkey")
    op.create_foreign_key(
        "login_audit_usuario_id_fkey", "login_audit", "usuarios",
        ["usuario_id"], ["id"], ondelete="SET NULL",
    )


def downgrade():
    op.drop_constraint("login_audit_usuario_id_fkey", "login_audit", type_="foreignkey")
    op.create_foreign_key(
        "login_audit_usuario_id_fkey", "login_audit", "usuarios",
        ["usuario_id"], ["id"],
    )
    for col in ("criado_em", "alvo_usuario_id", "ator_id", "acao", "categoria", "id"):
        op.drop_index(f"ix_acao_audit_{col}", table_name="acao_audit")
    op.drop_table("acao_audit")
```

- [ ] **Step 4: Rodar e ver passar**

Run: `venv/Scripts/python -m pytest backend/tests/test_acao_audit_model.py -v`
Expected: 2 PASS.

- [ ] **Step 5: Suíte inteira (regressão)**

Run: `venv/Scripts/python -m pytest backend/tests -q`
Expected: verde (confiar no exit code).

- [ ] **Step 6: Commit**

```bash
git add backend/app/models/acao_audit.py backend/app/models/__init__.py backend/app/models/login_audit.py backend/alembic/versions/0037_acao_audit.py backend/tests/test_acao_audit_model.py
git commit -m "feat(auditoria): modelo acao_audit + FK SET NULL no login_audit (migracao 0037)"
```

---

### Task 2: `audit_service.py` — helpers puros + `registrar_acao`

**Files:**
- Create: `backend/app/services/audit_service.py`
- Modify: `backend/app/api/v1/routers/auth.py:24-30` (extração de IP vira chamada ao helper)
- Test: `backend/tests/test_audit_service.py`

**Interfaces:**
- Consumes: `AcaoAudit` (Task 1).
- Produces (usadas nos Tasks 3–5):
  - `origem_do_request(request) -> tuple[str | None, str | None]` — `(ip, user_agent)`
  - `montar_detalhe_atualizacao(campos: list[str], *, role_de=None, role_para=None, ativo_de=None, ativo_para=None) -> str`
  - `registrar_acao(db, *, categoria: str, acao: str, ator, alvo=None, alvo_email: str | None = None, municipio_id: int | None = None, detalhe: str | None = None, request=None) -> None`
  - Constantes `RETENCAO_ACESSOS_MESES = 12`, `RETENCAO_ACOES_ANOS = 5`

- [ ] **Step 1: Escrever os testes que falham**

```python
# backend/tests/test_audit_service.py
"""Helpers do audit_service — lógica pura, fakes, sem DB."""
from app.services.audit_service import (
    montar_detalhe_atualizacao,
    origem_do_request,
    registrar_acao,
)


class _FakeClient:
    host = "10.0.0.1"


class _FakeRequest:
    def __init__(self, headers=None, client=_FakeClient()):
        self.headers = headers or {}
        self.client = client


class _FakeDB:
    def __init__(self, fail=False):
        self.added, self.commits, self.rollbacks = [], 0, 0
        self._fail = fail

    def add(self, obj):
        if self._fail:
            raise RuntimeError("boom")
        self.added.append(obj)

    def commit(self):
        self.commits += 1

    def rollback(self):
        self.rollbacks += 1


class _FakeUser:
    def __init__(self, id=1, email="ator@x.com", municipio_id=None):
        self.id, self.email, self.municipio_id = id, email, municipio_id


def test_origem_prefere_x_forwarded_for():
    req = _FakeRequest(headers={"x-forwarded-for": "1.2.3.4, 10.0.0.9",
                                "user-agent": "UA"})
    assert origem_do_request(req) == ("1.2.3.4", "UA")


def test_origem_fallback_socket_e_request_none():
    assert origem_do_request(_FakeRequest()) == ("10.0.0.1", None)
    assert origem_do_request(None) == (None, None)


def test_detalhe_lista_campos_sem_valores():
    d = montar_detalhe_atualizacao(["senha", "nome"])
    assert "senha" in d and "nome" in d
    assert "campos:" in d


def test_detalhe_role_e_ativo_de_para():
    d = montar_detalhe_atualizacao(
        ["role_id", "ativo"],
        role_de="VISUALIZADOR", role_para="ADMIN_MUNICIPIO",
        ativo_de=True, ativo_para=False,
    )
    assert "VISUALIZADOR → ADMIN_MUNICIPIO" in d
    assert "ativo: True → False" in d


def test_detalhe_role_igual_nao_aparece():
    d = montar_detalhe_atualizacao(["nome"], role_de="X", role_para="X")
    assert "role:" not in d


def test_registrar_acao_grava_snapshots():
    db = _FakeDB()
    ator = _FakeUser()
    alvo = _FakeUser(id=2, email="alvo@x.com", municipio_id=7)
    registrar_acao(
        db, categoria="acao", acao="usuario_criado", ator=ator, alvo=alvo,
        request=_FakeRequest(headers={"user-agent": "UA"}),
    )
    assert db.commits == 1
    linha = db.added[0]
    assert (linha.ator_id, linha.ator_email) == (1, "ator@x.com")
    assert (linha.alvo_usuario_id, linha.alvo_email) == (2, "alvo@x.com")
    assert linha.municipio_id == 7  # herdado do alvo
    assert linha.ip == "10.0.0.1"


def test_registrar_acao_nunca_propaga_falha():
    db = _FakeDB(fail=True)
    registrar_acao(db, categoria="acao", acao="usuario_criado",
                   ator=_FakeUser())  # não pode levantar
    assert db.rollbacks == 1
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `venv/Scripts/python -m pytest backend/tests/test_audit_service.py -v`
Expected: FAIL — `ModuleNotFoundError: app.services.audit_service`.

- [ ] **Step 3: Implementar o serviço**

```python
# backend/app/services/audit_service.py
"""Trilha de auditoria de ações administrativas e leituras de dados pessoais.

Regra de ouro (mesma do LoginAudit em auth_service): falha de auditoria
NUNCA quebra a operação principal — logar, rollback e seguir.
"""
import logging

from app.models.acao_audit import AcaoAudit

logger = logging.getLogger("app.audit")

# Prazos de retenção — docs/lgpd.md referencia estes nomes; mudar lá junto.
RETENCAO_ACESSOS_MESES = 12  # login_audit + acao_audit categoria 'leitura'
RETENCAO_ACOES_ANOS = 5      # acao_audit categoria 'acao'


def origem_do_request(request) -> tuple[str | None, str | None]:
    """(ip, user_agent) — x-forwarded-for do proxy primeiro, fallback para o
    peer do socket. Mesma regra do login (router auth)."""
    if request is None:
        return None, None
    fwd = request.headers.get("x-forwarded-for")
    ip = fwd.split(",")[0].strip() if fwd else (
        request.client.host if request.client else None
    )
    return ip, request.headers.get("user-agent")


def montar_detalhe_atualizacao(
    campos: list[str],
    *,
    role_de: str | None = None,
    role_para: str | None = None,
    ativo_de: bool | None = None,
    ativo_para: bool | None = None,
) -> str:
    """Diff legível do PUT de usuário. NUNCA inclui valores — só nomes de
    campos; exceções não sensíveis: role e ativo ganham de→para."""
    partes = []
    if campos:
        partes.append(f"campos: {', '.join(sorted(campos))}")
    if role_de is not None and role_para is not None and role_de != role_para:
        partes.append(f"role: {role_de} → {role_para}")
    if ativo_de is not None and ativo_para is not None and ativo_de != ativo_para:
        partes.append(f"ativo: {ativo_de} → {ativo_para}")
    return " | ".join(partes)


def registrar_acao(
    db,
    *,
    categoria: str,
    acao: str,
    ator,
    alvo=None,
    alvo_email: str | None = None,
    municipio_id: int | None = None,
    detalhe: str | None = None,
    request=None,
) -> None:
    """Persiste uma linha de auditoria. `alvo` (Usuario vivo) tem precedência;
    para alvo já excluído, passar só `alvo_email`/`municipio_id` (o id não
    pode ser referenciado — a linha registra o vínculo pelo snapshot)."""
    try:
        ip, user_agent = origem_do_request(request)
        db.add(AcaoAudit(
            categoria=categoria,
            acao=acao,
            ator_id=ator.id,
            ator_email=ator.email,
            alvo_usuario_id=alvo.id if alvo is not None else None,
            alvo_email=alvo.email if alvo is not None else alvo_email,
            municipio_id=(
                municipio_id if municipio_id is not None
                else (alvo.municipio_id if alvo is not None else None)
            ),
            detalhe=detalhe,
            ip=ip,
            user_agent=user_agent,
        ))
        db.commit()
    except Exception:
        logger.exception("Falha ao registrar auditoria (%s/%s)", categoria, acao)
        try:
            db.rollback()
        except Exception:
            pass
```

Em `backend/app/api/v1/routers/auth.py`, substituir as linhas 24-30 (extração inline de ip/user_agent) por:

```python
    from app.services.audit_service import origem_do_request  # import no topo do arquivo

    ip, user_agent = origem_do_request(request)
```

(mantendo a chamada `service.authenticate(..., ip=ip, user_agent=user_agent)` como está).

- [ ] **Step 4: Rodar e ver passar**

Run: `venv/Scripts/python -m pytest backend/tests/test_audit_service.py backend/tests -q`
Expected: novos testes PASS e suíte verde (auth intocado em comportamento).

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/audit_service.py backend/app/api/v1/routers/auth.py backend/tests/test_audit_service.py
git commit -m "feat(auditoria): audit_service com registrar_acao e helpers puros"
```

---

### Task 3: Purga automática + lifespan

**Files:**
- Modify: `backend/app/services/audit_service.py` (adicionar `cortes_retencao` + `purgar_auditoria`)
- Modify: `backend/app/main.py:58` (FastAPI ganha `lifespan`)
- Test: `backend/tests/test_audit_purga.py`

**Interfaces:**
- Consumes: `AcaoAudit`, `LoginAudit`, constantes de retenção (Tasks 1–2).
- Produces: `cortes_retencao(agora=None) -> tuple[datetime, datetime]` e `purgar_auditoria(db, agora=None) -> dict` (`{"login_audit": n, "leituras": n, "acoes": n}`; `{}` em falha).

- [ ] **Step 1: Escrever os testes que falham**

```python
# backend/tests/test_audit_purga.py
"""Purga de auditoria: cortes puros + comportamento real em sqlite."""
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

import app.models  # noqa: F401
from app.db.base import Base
from app.models.acao_audit import AcaoAudit
from app.models.login_audit import LoginAudit
from app.models.municipio import Municipio
from app.models.role import Role
from app.models.usuario import Usuario
from app.services.audit_service import cortes_retencao, purgar_auditoria

AGORA = datetime(2026, 8, 16, 12, 0, tzinfo=timezone.utc)


@pytest.fixture()
def db():
    engine = create_engine("sqlite://")
    Base.metadata.create_all(
        engine,
        tables=[
            Municipio.__table__, Role.__table__, Usuario.__table__,
            LoginAudit.__table__, AcaoAudit.__table__,
        ],
    )
    session = sessionmaker(bind=engine)()
    yield session
    session.close()


def test_cortes_12_meses_e_5_anos():
    corte_acessos, corte_acoes = cortes_retencao(AGORA)
    assert corte_acessos == AGORA - timedelta(days=365)
    assert corte_acoes == AGORA - timedelta(days=5 * 365)


def _linha(categoria, meses_atras):
    return AcaoAudit(
        categoria=categoria, acao="usuario_criado", ator_email="a@x.com",
        criado_em=AGORA - timedelta(days=30 * meses_atras),
    )


def test_purga_respeita_os_dois_prazos(db):
    db.add(_linha("leitura", meses_atras=13))   # some (>12m)
    db.add(_linha("leitura", meses_atras=1))    # fica
    db.add(_linha("acao", meses_atras=13))      # fica (<5a)
    db.add(_linha("acao", meses_atras=6 * 12))  # some (>5a)
    db.add(LoginAudit(
        email_tentado="a@x.com", sucesso=True,
        criado_em=AGORA - timedelta(days=400),  # some (>12m)
    ))
    db.commit()

    contagens = purgar_auditoria(db, agora=AGORA)

    assert contagens == {"login_audit": 1, "leituras": 1, "acoes": 1}
    restantes = {(l.categoria, l.criado_em) for l in db.query(AcaoAudit).all()}
    assert len(restantes) == 2
    assert db.query(LoginAudit).count() == 0


def test_purga_engole_falha():
    class _DBQuebrado:
        def query(self, *_):
            raise RuntimeError("sem banco")

        def rollback(self):
            pass

    assert purgar_auditoria(_DBQuebrado()) == {}
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `venv/Scripts/python -m pytest backend/tests/test_audit_purga.py -v`
Expected: FAIL — `ImportError: cortes_retencao`.

- [ ] **Step 3: Implementar purga + lifespan**

Adicionar ao `audit_service.py` (imports: `from datetime import datetime, timedelta, timezone`; `from app.models.login_audit import LoginAudit`):

```python
def cortes_retencao(agora: datetime | None = None) -> tuple[datetime, datetime]:
    """(corte_acessos, corte_acoes): registros ANTERIORES ao corte são
    purgados. 12 meses ≈ 365 dias, 5 anos ≈ 5×365 — aproximação declarada
    em docs/lgpd.md."""
    agora = agora or datetime.now(timezone.utc)
    return agora - timedelta(days=365), agora - timedelta(days=5 * 365)


def purgar_auditoria(db, agora: datetime | None = None) -> dict:
    """Aplica a retenção (RETENCAO_ACESSOS_MESES / RETENCAO_ACOES_ANOS).
    Devolve contagens por classe; {} em falha (logada, nunca propaga)."""
    try:
        corte_acessos, corte_acoes = cortes_retencao(agora)
        n_login = (
            db.query(LoginAudit)
            .filter(LoginAudit.criado_em < corte_acessos)
            .delete(synchronize_session=False)
        )
        n_leituras = (
            db.query(AcaoAudit)
            .filter(AcaoAudit.categoria == "leitura",
                    AcaoAudit.criado_em < corte_acessos)
            .delete(synchronize_session=False)
        )
        n_acoes = (
            db.query(AcaoAudit)
            .filter(AcaoAudit.categoria == "acao",
                    AcaoAudit.criado_em < corte_acoes)
            .delete(synchronize_session=False)
        )
        db.commit()
        if n_login or n_leituras or n_acoes:
            logger.info(
                "Purga de auditoria: login=%s leituras=%s acoes=%s",
                n_login, n_leituras, n_acoes,
            )
        return {"login_audit": n_login, "leituras": n_leituras, "acoes": n_acoes}
    except Exception:
        logger.exception("Purga de auditoria falhou")
        try:
            db.rollback()
        except Exception:
            pass
        return {}
```

Em `backend/app/main.py`, antes da criação do `app` (linha 58):

```python
import logging
from contextlib import asynccontextmanager

_logger = logging.getLogger("app.main")


@asynccontextmanager
async def lifespan(_app):
    # Purga de retenção da auditoria (docs/lgpd.md). Railway redeploya a cada
    # push, então "no startup" honra os prazos na prática. Nunca derruba o boot.
    try:
        from app.db.session import SessionLocal
        from app.services.audit_service import purgar_auditoria

        db = SessionLocal()
        try:
            purgar_auditoria(db)
        finally:
            db.close()
    except Exception:
        _logger.exception("Purga de auditoria indisponível no startup")
    yield


app = FastAPI(
    title="Observatório Econômico API", version="1.0.0",
    lifespan=lifespan, **_docs_kwargs,
)
```

(O lifespan só roda quando o servidor sobe — `app.openapi()` nos testes não o dispara.)

- [ ] **Step 4: Rodar e ver passar**

Run: `venv/Scripts/python -m pytest backend/tests/test_audit_purga.py backend/tests -q`
Expected: novos PASS + suíte verde.

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/audit_service.py backend/app/main.py backend/tests/test_audit_purga.py
git commit -m "feat(auditoria): purga de retencao (12m acessos / 5a acoes) no startup"
```

---

### Task 4: Auditoria das mutações de usuários (POST/PUT/DELETE)

**Files:**
- Modify: `backend/app/api/v1/routers/usuarios.py:122-195` (os 3 handlers)
- Test: `backend/tests/test_usuarios_auditoria.py`

**Interfaces:**
- Consumes: `registrar_acao`, `montar_detalhe_atualizacao` (Task 2); fixture sqlite (padrão do Task 1).
- Produces: eventos `usuario_criado`, `usuario_atualizado`, `usuario_excluido` gravados em `acao_audit`.

- [ ] **Step 1: Escrever os testes que falham**

```python
# backend/tests/test_usuarios_auditoria.py
"""Handlers de usuários gravam trilha em acao_audit (sqlite in-memory,
handlers chamados direto — sem TestClient, padrão do repo)."""
import pytest
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker

import app.models  # noqa: F401
from app.api.v1.routers.usuarios import (
    atualizar_usuario,
    criar_usuario,
    deletar_usuario,
)
from app.db.base import Base
from app.models.acao_audit import AcaoAudit
from app.models.login_audit import LoginAudit
from app.models.municipio import Municipio
from app.models.role import Role
from app.models.usuario import Usuario
from app.schemas.usuario import UsuarioCreate, UsuarioUpdate


class _FakeClient:
    host = "10.0.0.1"


class _FakeRequest:
    headers = {"user-agent": "pytest"}
    client = _FakeClient()


@pytest.fixture()
def db():
    engine = create_engine("sqlite://")

    @event.listens_for(engine, "connect")
    def _fk_on(dbapi_conn, _record):
        dbapi_conn.execute("PRAGMA foreign_keys=ON")

    Base.metadata.create_all(
        engine,
        tables=[
            Municipio.__table__, Role.__table__, Usuario.__table__,
            LoginAudit.__table__, AcaoAudit.__table__,
        ],
    )
    session = sessionmaker(bind=engine)()
    session.add(Role(nome="ADMIN_GLOBAL", builtin=True, permissoes={}))
    session.add(Role(nome="VISUALIZADOR", builtin=True, permissoes={}))
    session.commit()
    yield session
    session.close()


def _ator(db):
    role = db.query(Role).filter(Role.nome == "ADMIN_GLOBAL").one()
    u = Usuario(nome="Ator", email="ator@x.com", senha_hash="x", role_id=role.id)
    db.add(u)
    db.commit()
    return u


def _criar_alvo(db, ator):
    role = db.query(Role).filter(Role.nome == "VISUALIZADOR").one()
    payload = UsuarioCreate(
        nome="Alvo", email="alvo@x.com", senha="segredo123", role_id=role.id,
    )
    resp = criar_usuario(payload, _FakeRequest(), db=db, current_user=ator)
    return resp.data.id


def test_criar_usuario_gera_evento(db):
    ator = _ator(db)
    _criar_alvo(db, ator)

    linha = db.query(AcaoAudit).filter(AcaoAudit.acao == "usuario_criado").one()
    assert linha.categoria == "acao"
    assert linha.ator_email == "ator@x.com"
    assert linha.alvo_email == "alvo@x.com"
    assert "VISUALIZADOR" in (linha.detalhe or "")


def test_atualizar_com_senha_nao_vaza_valor(db):
    ator = _ator(db)
    alvo_id = _criar_alvo(db, ator)

    atualizar_usuario(
        alvo_id,
        UsuarioUpdate(senha="novaSenha456", nome="Renomeado"),
        _FakeRequest(), db=db, current_user=ator,
    )

    linha = db.query(AcaoAudit).filter(
        AcaoAudit.acao == "usuario_atualizado"
    ).one()
    assert "senha" in linha.detalhe and "nome" in linha.detalhe
    assert "novaSenha456" not in linha.detalhe


def test_atualizar_role_registra_de_para(db):
    ator = _ator(db)
    alvo_id = _criar_alvo(db, ator)
    role_global = db.query(Role).filter(Role.nome == "ADMIN_GLOBAL").one()

    atualizar_usuario(
        alvo_id, UsuarioUpdate(role_id=role_global.id),
        _FakeRequest(), db=db, current_user=ator,
    )

    linha = db.query(AcaoAudit).filter(
        AcaoAudit.acao == "usuario_atualizado"
    ).one()
    assert "VISUALIZADOR → ADMIN_GLOBAL" in linha.detalhe


def test_excluir_usuario_com_historico(db):
    ator = _ator(db)
    alvo_id = _criar_alvo(db, ator)
    db.add(LoginAudit(usuario_id=alvo_id, email_tentado="alvo@x.com", sucesso=True))
    db.commit()

    deletar_usuario(alvo_id, _FakeRequest(), db=db, current_user=ator)

    linha = db.query(AcaoAudit).filter(AcaoAudit.acao == "usuario_excluido").one()
    assert linha.alvo_usuario_id is None       # alvo já não existe
    assert linha.alvo_email == "alvo@x.com"    # snapshot preserva identidade
    assert f"usuario_id: {alvo_id}" in linha.detalhe
    assert db.query(Usuario).filter(Usuario.id == alvo_id).count() == 0
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `venv/Scripts/python -m pytest backend/tests/test_usuarios_auditoria.py -v`
Expected: FAIL — `TypeError` (handlers ainda não recebem `request`) e/ou zero linhas em `acao_audit`.

- [ ] **Step 3: Instrumentar os handlers**

Em `usuarios.py`, imports novos no topo: `from fastapi import APIRouter, Depends, Request` e `from app.services.audit_service import montar_detalhe_atualizacao, registrar_acao`.

`criar_usuario` — assinatura ganha `request: Request` (segundo parâmetro, após `data`); antes do `return`:

```python
    usuario = service.create(data)
    registrar_acao(
        db, categoria="acao", acao="usuario_criado",
        ator=current_user, alvo=usuario,
        detalhe=f"role: {usuario.role.nome} | municipio: {usuario.municipio_id}",
        request=request,
    )
    return SuccessResponse(data=_to_out(usuario))
```

`atualizar_usuario` — assinatura ganha `request: Request` (após `data`); capturar estado ANTES do update e registrar depois:

```python
    alvo = service.get_by_id(user_id)
    payload = data.model_dump(exclude_unset=True)
    role_de, ativo_de = alvo.role.nome, alvo.ativo
    # ... validações existentes intocadas ...
    usuario = service.update(user_id, data)
    registrar_acao(
        db, categoria="acao", acao="usuario_atualizado",
        ator=current_user, alvo=usuario,
        detalhe=montar_detalhe_atualizacao(
            list(payload.keys()),
            role_de=role_de, role_para=usuario.role.nome,
            ativo_de=ativo_de, ativo_para=usuario.ativo,
        ),
        request=request,
    )
    return SuccessResponse(data=_to_out(usuario))
```

`deletar_usuario` — assinatura ganha `request: Request` (após `user_id`); o `get_by_id` sai do `if` (o snapshot é necessário sempre):

```python
    service = UsuarioService(db)
    alvo = service.get_by_id(user_id)
    if not _is_global(current_user):
        _exigir_gerencia(current_user, alvo)
    alvo_email, alvo_mun, alvo_role = alvo.email, alvo.municipio_id, alvo.role.nome
    service.delete(user_id, current_user.id)
    # alvo_usuario_id fica None de propósito: o usuário já não existe e a FK
    # não pode apontar para ele — o vínculo sobrevive no snapshot + detalhe.
    registrar_acao(
        db, categoria="acao", acao="usuario_excluido",
        ator=current_user, alvo_email=alvo_email, municipio_id=alvo_mun,
        detalhe=f"usuario_id: {user_id} | role: {alvo_role}",
        request=request,
    )
    return {"ok": True}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `venv/Scripts/python -m pytest backend/tests/test_usuarios_auditoria.py backend/tests -q`
Expected: novos PASS + suíte verde (atenção a `test_usuarios_escopo.py`/`test_usuarios_delegacao.py` — funções puras, não afetadas).

- [ ] **Step 5: Commit**

```bash
git add backend/app/api/v1/routers/usuarios.py backend/tests/test_usuarios_auditoria.py
git commit -m "feat(auditoria): CRUD de usuarios grava trilha em acao_audit"
```

---

### Task 5: Eventos de leitura + endpoint `GET /admin/auditoria/acoes`

**Files:**
- Create: `backend/app/schemas/acao_audit.py`
- Modify: `backend/app/api/v1/routers/usuarios.py:97-119` (`listar_usuarios` ganha `request` + evento)
- Modify: `backend/app/api/v1/routers/login_audit.py` (GET existente ganha evento; router novo `router_acoes`)
- Modify: `backend/app/main.py` (registrar `login_audit.router_acoes`)
- Test: `backend/tests/test_auditoria_endpoint.py`

**Interfaces:**
- Consumes: `registrar_acao` (Task 2), `AcaoAudit` (Task 1).
- Produces: `AcaoAuditOut(id, categoria, acao, ator_id, ator_email, ator_nome, alvo_usuario_id, alvo_email, municipio_id, detalhe, ip, criado_em)`; rota `GET /api/v1/admin/auditoria/acoes` com query params `skip, limit, categoria, acao, email` (o Task 6 consome esse contrato).

- [ ] **Step 1: Escrever os testes que falham**

```python
# backend/tests/test_auditoria_endpoint.py
"""Contrato OpenAPI da rota nova + filtros do handler em sqlite."""
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

import app.models  # noqa: F401
from app.db.base import Base
from app.models.acao_audit import AcaoAudit
from app.models.login_audit import LoginAudit
from app.models.municipio import Municipio
from app.models.role import Role
from app.models.usuario import Usuario


def test_rota_acoes_existe_e_pagina_acao_audit_out():
    from app.main import app
    schema = app.openapi()
    op = schema["paths"]["/api/v1/admin/auditoria/acoes"]["get"]
    resp = op["responses"]["200"]["content"]["application/json"]["schema"]
    assert resp["$ref"].endswith("PaginatedResponse_AcaoAuditOut_")


@pytest.fixture()
def db():
    engine = create_engine("sqlite://")
    Base.metadata.create_all(
        engine,
        tables=[
            Municipio.__table__, Role.__table__, Usuario.__table__,
            LoginAudit.__table__, AcaoAudit.__table__,
        ],
    )
    session = sessionmaker(bind=engine)()
    role = Role(nome="ADMIN_GLOBAL", builtin=True, permissoes={})
    session.add(role)
    session.flush()
    session.add(Usuario(nome="Admin", email="admin@x.com", senha_hash="x",
                        role_id=role.id))
    session.commit()
    yield session
    session.close()


class _FakeRequest:
    headers = {}
    client = None


def test_filtros_categoria_e_email(db):
    from app.api.v1.routers.login_audit import listar_acoes_audit

    admin = db.query(Usuario).one()
    db.add(AcaoAudit(categoria="acao", acao="usuario_criado",
                     ator_email="admin@x.com", alvo_email="a@x.com"))
    db.add(AcaoAudit(categoria="leitura", acao="usuarios_listados",
                     ator_email="outro@x.com"))
    db.commit()

    resp = listar_acoes_audit(
        _FakeRequest(), categoria="acao", db=db, current_user=admin,
    )
    assert resp.total == 1
    assert resp.items[0].acao == "usuario_criado"

    resp = listar_acoes_audit(
        _FakeRequest(), email="outro", db=db, current_user=admin,
    )
    assert resp.total == 1
    assert resp.items[0].acao == "usuarios_listados"


def test_consulta_gera_evento_de_leitura(db):
    from app.api.v1.routers.login_audit import listar_acoes_audit

    admin = db.query(Usuario).one()
    listar_acoes_audit(_FakeRequest(), db=db, current_user=admin)

    linha = db.query(AcaoAudit).filter(
        AcaoAudit.acao == "auditoria_consultada"
    ).one()
    assert linha.categoria == "leitura"
    assert linha.detalhe == "acoes"


def test_rota_acoes_exige_admin_global():
    """403 para não-global — testa a dependency factory direto (padrão do
    repo, test_access_control.py): o Depends do handler é require_role."""
    import inspect
    from types import SimpleNamespace

    from app.api.v1.routers.login_audit import listar_acoes_audit
    from app.core.exceptions import ForbiddenException

    dep = inspect.signature(listar_acoes_audit).parameters["current_user"].default
    nao_global = SimpleNamespace(role=SimpleNamespace(nome="VISUALIZADOR"))
    with pytest.raises(ForbiddenException):
        dep.dependency(current_user=nao_global)
    admin = SimpleNamespace(role=SimpleNamespace(nome="ADMIN_GLOBAL"))
    assert dep.dependency(current_user=admin) is admin
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `venv/Scripts/python -m pytest backend/tests/test_auditoria_endpoint.py -v`
Expected: FAIL — rota inexistente no OpenAPI; `ImportError: listar_acoes_audit`.

- [ ] **Step 3: Implementar schema, rota e eventos de leitura**

```python
# backend/app/schemas/acao_audit.py
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict


class AcaoAuditOut(BaseModel):
    id: int
    categoria: str
    acao: str
    ator_id: Optional[int] = None
    ator_email: str
    ator_nome: Optional[str] = None  # nome atual, se a conta ainda existe
    alvo_usuario_id: Optional[int] = None
    alvo_email: Optional[str] = None
    municipio_id: Optional[int] = None
    detalhe: Optional[str] = None
    ip: Optional[str] = None
    criado_em: datetime

    model_config = ConfigDict(from_attributes=True)
```

Em `login_audit.py` (imports novos: `Request` do fastapi, `or_` do sqlalchemy, `AcaoAudit`, `AcaoAuditOut`, `registrar_acao`):

```python
router_acoes = APIRouter(prefix="/admin/auditoria", tags=["Admin - Auditoria"])


@router_acoes.get("/acoes", response_model=PaginatedResponse[AcaoAuditOut])
def listar_acoes_audit(
    request: Request,
    skip: int = 0,
    limit: int = 20,
    categoria: str | None = None,
    acao: str | None = None,
    email: str | None = None,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_role("ADMIN_GLOBAL")),
):
    query = (
        db.query(AcaoAudit, Usuario.nome)
        .outerjoin(Usuario, AcaoAudit.ator_id == Usuario.id)
    )
    if categoria:
        query = query.filter(AcaoAudit.categoria == categoria)
    if acao:
        query = query.filter(AcaoAudit.acao == acao)
    if email:
        like = f"%{email}%"
        query = query.filter(or_(
            AcaoAudit.ator_email.ilike(like),
            AcaoAudit.alvo_email.ilike(like),
        ))

    total = query.count()
    rows = (
        query.order_by(AcaoAudit.criado_em.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )
    items = [
        AcaoAuditOut(
            id=a.id, categoria=a.categoria, acao=a.acao,
            ator_id=a.ator_id, ator_email=a.ator_email, ator_nome=nome,
            alvo_usuario_id=a.alvo_usuario_id, alvo_email=a.alvo_email,
            municipio_id=a.municipio_id, detalhe=a.detalhe, ip=a.ip,
            criado_em=a.criado_em,
        )
        for a, nome in rows
    ]

    registrar_acao(db, categoria="leitura", acao="auditoria_consultada",
                   ator=current_user, detalhe="acoes", request=request)
    return PaginatedResponse(items=items, total=total, skip=skip, limit=limit)
```

No GET existente `listar_login_audit`: assinatura ganha `request: Request` (primeiro parâmetro) e, antes do `return`:

```python
    registrar_acao(db, categoria="leitura", acao="auditoria_consultada",
                   ator=current_user, detalhe="logins", request=request)
```

Em `usuarios.py`, `listar_usuarios`: assinatura ganha `request: Request` (primeiro parâmetro) e, antes do `return`:

```python
    registrar_acao(
        db, categoria="leitura", acao="usuarios_listados", ator=current_user,
        detalhe=f"total: {total} | municipio_filter: {municipio_filter}",
        request=request,
    )
```

Em `main.py`, logo após o include do `login_audit.router` (linha 115):

```python
app.include_router(login_audit.router_acoes, prefix=API_PREFIX)
```

- [ ] **Step 4: Rodar e ver passar**

Run: `venv/Scripts/python -m pytest backend/tests/test_auditoria_endpoint.py backend/tests -q`
Expected: novos PASS + suíte verde.

- [ ] **Step 5: Commit**

```bash
git add backend/app/schemas/acao_audit.py backend/app/api/v1/routers/login_audit.py backend/app/api/v1/routers/usuarios.py backend/app/main.py backend/tests/test_auditoria_endpoint.py
git commit -m "feat(auditoria): eventos de leitura + GET /admin/auditoria/acoes"
```

---

### Task 6: Front — página "Auditoria" com abas Logins | Ações

**Files:**
- Create: `frontend-observatorio/src/pages/admin/AcoesAuditTab.jsx`
- Modify: `frontend-observatorio/src/pages/admin/LoginAuditAdminPage.jsx` (título, abas, conteúdo atual vira aba Logins)
- Test: `frontend-observatorio/src/pages/admin/AcoesAuditTab.test.jsx`

**Interfaces:**
- Consumes: `GET /admin/auditoria/acoes` com params `skip, limit, categoria, acao, email` → `{items: AcaoAuditOut[], total}` (Task 5).
- Produces: componente `<AcoesAuditTab />` sem props; página com estado `tab` (`"logins"` | `"acoes"`).

- [ ] **Step 1: Escrever o teste que falha**

```jsx
// frontend-observatorio/src/pages/admin/AcoesAuditTab.test.jsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";

vi.mock("../../services/api", () => ({
  default: { get: vi.fn() },
}));

import AcoesAuditTab from "./AcoesAuditTab";
import api from "../../services/api";

const LINHA = {
  id: 1,
  categoria: "acao",
  acao: "usuario_criado",
  ator_id: 1,
  ator_email: "admin@x.com",
  ator_nome: "Admin",
  alvo_usuario_id: 2,
  alvo_email: "novo@x.com",
  municipio_id: null,
  detalhe: "role: VISUALIZADOR | municipio: None",
  ip: "1.2.3.4",
  criado_em: "2026-08-16T12:00:00Z",
};

describe("AcoesAuditTab", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.get.mockResolvedValue({ data: { items: [LINHA], total: 1 } });
  });

  it("carrega e exibe as linhas da trilha", async () => {
    render(<AcoesAuditTab />);
    await waitFor(() => {
      expect(screen.getByText("admin@x.com")).toBeInTheDocument();
    });
    expect(screen.getByText("novo@x.com")).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith(
      "/admin/auditoria/acoes",
      expect.objectContaining({
        params: expect.objectContaining({ skip: 0, limit: 25 }),
      })
    );
  });

  it("filtro de categoria refaz a busca com o param", async () => {
    render(<AcoesAuditTab />);
    await waitFor(() => expect(api.get).toHaveBeenCalled());

    fireEvent.change(screen.getByLabelText("Filtrar por categoria"), {
      target: { value: "leitura" },
    });

    await waitFor(() => {
      expect(api.get).toHaveBeenLastCalledWith(
        "/admin/auditoria/acoes",
        expect.objectContaining({
          params: expect.objectContaining({ categoria: "leitura" }),
        })
      );
    });
  });

  it("erro de rede mostra mensagem", async () => {
    api.get.mockRejectedValueOnce(new Error("boom"));
    render(<AcoesAuditTab />);
    await waitFor(() => {
      expect(
        screen.getByText("Não foi possível carregar a trilha de ações.")
      ).toBeInTheDocument();
    });
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run (de `frontend-observatorio/`): `npx vitest run src/pages/admin/AcoesAuditTab.test.jsx`
Expected: FAIL — módulo `AcoesAuditTab` não existe.

- [ ] **Step 3: Implementar o componente**

```jsx
// frontend-observatorio/src/pages/admin/AcoesAuditTab.jsx
import { useEffect, useState } from "react";
import { ChevronLeftIcon, ChevronRightIcon } from "@heroicons/react/24/outline";
import api from "../../services/api";

const PAGE_SIZE = 25;

const fmtDateTime = (d) =>
  d
    ? new Date(d).toLocaleString("pt-BR", {
        day: "2-digit", month: "2-digit", year: "numeric",
        hour: "2-digit", minute: "2-digit",
      })
    : "—";

const ACAO_LABELS = {
  usuario_criado: "Usuário criado",
  usuario_atualizado: "Usuário atualizado",
  usuario_excluido: "Usuário excluído",
  usuarios_listados: "Usuários listados",
  auditoria_consultada: "Auditoria consultada",
};

const CATEGORIA_OPTIONS = [
  { value: "", label: "Todas as categorias" },
  { value: "acao", label: "Ações" },
  { value: "leitura", label: "Leituras" },
];

const ACAO_OPTIONS = [
  { value: "", label: "Todos os eventos" },
  ...Object.entries(ACAO_LABELS).map(([value, label]) => ({ value, label })),
];

export default function AcoesAuditTab() {
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [categoria, setCategoria] = useState("");
  const [acao, setAcao] = useState("");
  const [emailInput, setEmailInput] = useState("");
  const [emailQuery, setEmailQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setEmailQuery(emailInput.trim()), 350);
    return () => clearTimeout(t);
  }, [emailInput]);

  useEffect(() => {
    setPage(0);
  }, [categoria, acao, emailQuery]);

  useEffect(() => {
    const params = { skip: page * PAGE_SIZE, limit: PAGE_SIZE };
    if (categoria) params.categoria = categoria;
    if (acao) params.acao = acao;
    if (emailQuery) params.email = emailQuery;

    setLoading(true);
    setError(false);
    api
      .get("/admin/auditoria/acoes", { params })
      .then((r) => {
        setRows(r.data?.items || []);
        setTotal(r.data?.total || 0);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [page, categoria, acao, emailQuery]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-6">
      {/* Filtros */}
      <div className="flex items-center gap-3 flex-wrap">
        <select
          value={categoria}
          onChange={(e) => setCategoria(e.target.value)}
          aria-label="Filtrar por categoria"
          className="text-sm rounded-lg border border-[var(--border)] bg-[var(--panel)] text-[var(--text)] px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {CATEGORIA_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <select
          value={acao}
          onChange={(e) => setAcao(e.target.value)}
          aria-label="Filtrar por evento"
          className="text-sm rounded-lg border border-[var(--border)] bg-[var(--panel)] text-[var(--text)] px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {ACAO_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <input
          type="search"
          value={emailInput}
          onChange={(e) => setEmailInput(e.target.value)}
          placeholder="Buscar por e-mail (ator ou alvo)..."
          aria-label="Buscar por e-mail"
          className="text-sm rounded-lg border border-[var(--border)] bg-[var(--panel)] text-[var(--text)] px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-[240px]"
        />
      </div>

      {/* Tabela */}
      <div className="bg-[var(--panel)] rounded-2xl border border-[var(--border)] overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-[var(--text-mute)] text-sm animate-pulse">
            Carregando...
          </div>
        ) : error ? (
          <div className="p-8 text-center text-red-400 text-sm">
            Não foi possível carregar a trilha de ações.
          </div>
        ) : rows.length === 0 ? (
          <div className="p-8 text-center text-[var(--text-mute)] text-sm">
            Nenhum registro de ação encontrado.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)]">
                  {["Data / Hora", "Ator", "Evento", "Alvo", "Detalhe", "IP"].map((h) => (
                    <th
                      key={h}
                      className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider first:px-6"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {rows.map((r) => (
                  <tr key={r.id} className="hover:bg-[var(--panel-2)]/40 transition-colors">
                    <td className="px-6 py-3 text-[var(--text-dim)] text-xs whitespace-nowrap">
                      {fmtDateTime(r.criado_em)}
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-medium text-[var(--text)]">{r.ator_email}</span>
                      {r.ator_nome && (
                        <span className="block text-xs text-[var(--text-mute)]">{r.ator_nome}</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center text-xs font-semibold px-2 py-0.5 rounded-full bg-[var(--panel-2)] ${
                          r.categoria === "acao" ? "text-amber-400" : "text-sky-400"
                        }`}
                      >
                        {ACAO_LABELS[r.acao] || r.acao}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[var(--text-dim)]">
                      {r.alvo_email || "—"}
                    </td>
                    <td className="px-4 py-3 text-[var(--text-mute)] text-xs max-w-md">
                      <div className="truncate" title={r.detalhe || ""}>
                        {r.detalhe || "—"}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-[var(--text-dim)] text-xs font-mono">
                      {r.ip || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Paginação */}
      {!loading && !error && total > 0 && (
        <div className="flex items-center justify-between text-xs text-[var(--text-mute)]">
          <span>
            {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} de {total}
          </span>
          {totalPages > 1 && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                aria-label="Página anterior"
                className="p-1.5 rounded-lg border border-[var(--border)] text-[var(--text-dim)] hover:bg-[var(--panel-2)] disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ChevronLeftIcon className="w-3.5 h-3.5" />
              </button>
              <span>{page + 1} / {totalPages}</span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                aria-label="Próxima página"
                className="p-1.5 rounded-lg border border-[var(--border)] text-[var(--text-dim)] hover:bg-[var(--panel-2)] disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ChevronRightIcon className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Rodar o teste do componente e ver passar**

Run: `npx vitest run src/pages/admin/AcoesAuditTab.test.jsx`
Expected: 3 PASS.

- [ ] **Step 5: Integrar as abas na página**

Em `LoginAuditAdminPage.jsx`:
1. `import AcoesAuditTab from "./AcoesAuditTab";` e estado `const [tab, setTab] = useState("logins");`
2. Header: `<h1>` vira `Auditoria`; subtítulo vira `Logins, ações administrativas e leituras de dados pessoais — quem fez o quê, quando.`
3. Logo abaixo do header, as abas (mesmo estilo pill dos FILTERS):

```jsx
      <div className="flex items-center gap-2">
        {[
          { value: "logins", label: "Logins" },
          { value: "acoes", label: "Ações" },
        ].map((t) => (
          <button
            key={t.value}
            onClick={() => setTab(t.value)}
            className={`text-xs font-semibold px-4 py-1.5 rounded-full border transition-colors ${
              tab === t.value
                ? "bg-blue-600 border-blue-600 text-white"
                : "border-[var(--border)] text-[var(--text-dim)] hover:bg-[var(--panel-2)]"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
```

4. Todo o conteúdo atual (summary cards + filtros + tabela + paginação) fica envolvido em `{tab === "logins" && (<> ... </>)}`; adicionar `{tab === "acoes" && <AcoesAuditTab />}` na sequência. Nada do conteúdo de Logins muda.

- [ ] **Step 6: Suíte front inteira**

Run: `npx vitest run`
Expected: verde (189 + 3 novos = 192).

- [ ] **Step 7: Commit**

```bash
git add frontend-observatorio/src/pages/admin/AcoesAuditTab.jsx frontend-observatorio/src/pages/admin/AcoesAuditTab.test.jsx frontend-observatorio/src/pages/admin/LoginAuditAdminPage.jsx
git commit -m "feat(auditoria): pagina Auditoria com abas Logins e Acoes"
```

---

### Task 7: Documento institucional `docs/lgpd.md`

**Files:**
- Create: `docs/lgpd.md`

**Interfaces:**
- Consumes: constantes `RETENCAO_ACESSOS_MESES`/`RETENCAO_ACOES_ANOS` e comportamento real implementado nos Tasks 1–5 (o doc só afirma o que o código faz).

- [ ] **Step 1: Verificar fatos antes de afirmar**

Rodar e anotar os resultados (o doc só pode afirmar o que for confirmado):

```bash
grep -in "socio\|cpf" backend/app/models/empresa.py   # esperado: nenhum match → afirmar "sem quadro societário/CPF"
grep -n "bcrypt" backend/app/core/security.py          # esperado: CryptContext bcrypt
```

Se `empresa.py` TIVER coluna de sócio/CPF, ajustar a seção 2 do doc para declarar esse dado e sua base legal (dado público da RFB) — não omitir.

- [ ] **Step 2: Escrever o documento**

Criar `docs/lgpd.md` com EXATAMENTE estas 7 seções, em prosa institucional pt-BR (sem jargão de código fora da seção 4). Conteúdo obrigatório por seção:

1. **Papéis e responsabilidades (art. 39 e 42 da LGPD)** — prefeitura contratante = controladora (decide finalidades); plataforma = operadora (trata em nome da controladora, segundo este documento e o contrato). A operadora não usa dados pessoais para finalidade própria.
2. **Inventário de dados pessoais tratados (art. 37)** — três classes: (a) contas de usuário: nome, e-mail, hash de senha (bcrypt — a senha em claro nunca é armazenada), papel/role, município de vínculo, data do último login; (b) registros de acesso e ações: e-mail, endereço IP, identificador de navegador (user-agent), ação realizada, data/hora — tabelas `login_audit` e `acao_audit`; (c) notificações internas ao usuário. Delimitação: os indicadores do observatório (PIB, CAGED, FPM etc.) são **agregados públicos por município** e não constituem dados pessoais; o módulo de empresas trata dado cadastral **de pessoa jurídica** da base pública da Receita Federal (afirmar "sem quadro societário e sem CPF" APENAS se o Step 1 confirmou).
3. **Bases legais (art. 7º)** — contas: execução de contrato e procedimentos preliminares (art. 7º, V); registros de acesso: cumprimento de obrigação legal (art. 15 do Marco Civil da Internet — guarda mínima de 6 meses) e legítimo interesse em segurança da informação (art. 7º, IX).
4. **Retenção e descarte** — acessos (logins e leituras): **12 meses**; ações administrativas: **5 anos**; purga automática na inicialização da aplicação (constantes `RETENCAO_ACESSOS_MESES` e `RETENCAO_ACOES_ANOS` em `backend/app/services/audit_service.py` — este documento e o código mudam juntos). Aproximação declarada: 12 meses = 365 dias, 5 anos = 1.825 dias. Exclusão de conta: remoção definitiva do cadastro; a trilha de auditoria preserva apenas o e-mail (snapshot) pelos prazos acima, com base no art. 16, I (cumprimento de obrigação legal) e legítimo interesse.
5. **Medidas de segurança (art. 46)** — senhas com bcrypt e defesa contra enumeração por tempo de resposta; autenticação por token JWT; controle de acesso por papéis com negação por padrão (fail-closed) e escopo por município; rate limiting; TLS em trânsito (infraestrutura Railway); documentação da API desabilitada em produção; trilha de auditoria de logins, ações administrativas e leituras de dados pessoais; logs de aplicação com ID de correlação.
6. **Direitos do titular (art. 18) e canal de atendimento** — confirmação de tratamento, acesso, correção, eliminação, informação sobre compartilhamento. Fluxo: o titular aciona a prefeitura (controladora), que aciona a operadora pelo canal de atendimento **definido no contrato de prestação de serviços** (decisão do usuário em 2026-08-16: o doc NÃO fixa um e-mail; escrever exatamente "pelo canal de atendimento definido no contrato" — não inventar endereço). Prazo de resposta da operadora à controladora: 15 dias.
7. **Incidentes de segurança (art. 48)** — detecção via trilha de auditoria e logs; comunicação à controladora em prazo razoável com descrição da natureza dos dados afetados, titulares envolvidos e medidas tomadas; avaliação conjunta da necessidade de comunicação à ANPD e aos titulares.

O documento NÃO deve conter: seção de pendências internas, nomes de branch/commit, promessas de funcionalidades futuras (2FA etc.).

- [ ] **Step 3: Revisar consistência doc↔código**

Conferir que: os prazos citados batem com `cortes_retencao`; os nomes de tabela citados existem; a lista de eventos da seção 2(b) bate com o vocabulário do modelo (5 eventos + login).

- [ ] **Step 4: Commit**

```bash
git add docs/lgpd.md
git commit -m "docs(lgpd): documento institucional de tratamento de dados pessoais"
```

---

### Task 8: Gates finais e verificação

**Files:** nenhum novo (correções pontuais se algo falhar).

- [ ] **Step 1: Suíte backend completa**

Run (da raiz): `venv/Scripts/python -m pytest backend/tests -q`
Expected: verde (exit code 0). A suíte `tests/` da RAIZ tem falhas pré-existentes e NÃO é gate.

- [ ] **Step 2: Suíte front completa**

Run (de `frontend-observatorio/`): `npx vitest run`
Expected: verde, 192 testes.

- [ ] **Step 3: Lint só dos arquivos tocados**

Run (de `frontend-observatorio/`): `npx eslint src/pages/admin/AcoesAuditTab.jsx src/pages/admin/LoginAuditAdminPage.jsx`
Expected: nenhum erro NOVO (comparar com o estado do arquivo no commit base se houver dúvida; a suite global de lint já quebra e não é gate).

- [ ] **Step 4: Conferência de paridade migração↔modelo**

Ler `0037_acao_audit.py` e `acao_audit.py` lado a lado: mesmas colunas, mesmos tamanhos de String, mesmos `ondelete`. O teste sqlite valida o modelo; esta leitura valida a migração.

- [ ] **Step 5: Relatório final**

Reportar: contagem das suítes, arquivos criados/modificados, e as duas pendências de deploy do usuário — `railway up` da api (migração 0037 roda no deploy) e smoke manual: logar como ADMIN_GLOBAL, criar/editar/excluir um usuário de teste e conferir a aba Ações.
