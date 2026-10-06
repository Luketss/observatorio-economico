# MFA por app autenticador (TOTP), opcional para ADMIN_GLOBAL — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir que o ADMIN_GLOBAL cadastre um segundo fator TOTP (app autenticador) na própria conta, com códigos de recuperação, e que o login dele passe a exigir o código depois da senha; quem não cadastra não percebe mudança.

**Architecture:** Login em duas etapas com token intermediário: `/auth/login` devolve `{ mfa_obrigatorio, mfa_token }` (JWT `type: "mfa"`, 5 min) quando o usuário tem MFA ativo; `POST /auth/mfa/verificar` troca `mfa_token` + código (TOTP ou recuperação) pelos tokens normais. Segredo TOTP cifrado com Fernet (`MFA_ENCRYPTION_KEY`) numa tabela 1:1 `usuario_mfa`. Rotas de cadastro `/auth/mfa/*` só para ADMIN_GLOBAL. Frontend: segunda etapa na `LoginPage`, `MfaModal` no menu do usuário, coluna/ação no admin de usuários.

**Tech Stack:** FastAPI + SQLAlchemy 2 + Alembic + Pydantic v2; `pyotp`, `qrcode` (SVG, sem Pillow), `cryptography` (Fernet) — dependências novas; React 19 + Vitest 2 + jsdom + @testing-library/react.

**Spec:** `docs/superpowers/specs/2026-10-06-mfa-totp-admin-global-design.md`

## Global Constraints

- Branch de trabalho: `feat/mfa-totp` (criar de `main` no início). Repo `C:\Users\lucas\Documents\projetos\dashboard_prefeituras`; backend em `backend/` (venv em `venv/`; testes da raiz: `venv/Scripts/python -m pytest backend/tests -o addopts="" -q`); frontend em `frontend-observatorio/` (`npx vitest run`, `npx eslint <arquivos>`).
- **Opcional e só ADMIN_GLOBAL cadastra**: rotas `/auth/mfa/configurar|ativar|desativar|status` com `Depends(require_role("ADMIN_GLOBAL"))`. `/auth/mfa/verificar` é pública (só `mfa_token`). `POST /usuarios/{id}/mfa/zerar` com `require_role("ADMIN_GLOBAL")`, 400 ao tentar na própria conta.
- **Token intermediário**: `create_mfa_token(subject)` em `core/security.py`: claims `sub`, `type: "mfa"`, `jti` (uuid4 hex), `exp` = 5 min, `iat`. `get_current_user` já rejeita `type != "access"` — teste garante que `mfa_token` não abre `/auth/me`.
- **Modelo** `usuario_mfa` (1:1, CASCADE): `usuario_id` PK/FK, `segredo_cifrado Text`, `ativo Boolean default false`, `ativado_em tz|null`, `ultimo_passo_usado BigInteger|null`, `codigos_recuperacao JSON` (lista de hashes bcrypt), `criado_em`, `atualizado_em`. Migração `0042_usuario_mfa` (down_revision `0041_demanda_status_historico`).
- **Cifra**: `core/mfa_crypto.py` com `cifrar(texto) -> str`, `decifrar(token) -> str`, `chave_configurada() -> bool`; Fernet com `settings.MFA_ENCRYPTION_KEY` (`str = ""`). Sem chave: `MfaIndisponivel` (AppException, `status_code=503`, `code="MFA_INDISPONIVEL"`) nas rotas de cadastro e em `verificar`; login sem MFA segue normal.
- **TOTP**: `pyotp.TOTP(segredo)`, passo 30 s, janela ±1 passo, anti-replay por `ultimo_passo_usado` (aceita só passo > último usado). Códigos de recuperação: 10 × `XXXX-XXXX`, alfabeto `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`, hash bcrypt (`hash_password`/`verify_password` existentes), consumidos ao usar, mostrados uma única vez.
- **Falhas**: 5 falhas no mesmo `jti` invalidam o `mfa_token` (contador em memória por processo com TTL 5 min; aceito pela spec). `LoginAudit.motivo`: `"mfa_ok"` no sucesso, `"mfa_invalido"` na falha; `last_login` só no 2º fator. `acao_audit`: `"mfa_ativado"`, `"mfa_desativado"` (ator = o próprio), `"mfa_zerado"` (alvo).
- **Front**: `AuthContext.login` devolve `{ mfa: true, mfaToken }` ou `{ mfa: false }`; novo `verificarMfa(mfaToken, codigo)`. `LoginPage` com etapa `codigo` (6 dígitos ou `XXXX-XXXX`), "Voltar", erro inline. `MfaModal` (ADMIN_GLOBAL) com 3 passos; botão "Segurança" ao lado de "Alterar senha" em `DashboardLayout`. `UsuariosAdminPage` ganha coluna MFA e ação "Zerar MFA" (só global, só se ativo, nunca em si mesmo).
- Erros do backend chegam como `{ error: { code, message } }` (ver `app/api/error_handlers.py`); o front lê `err?.response?.data?.error?.message`.
- Python: aspas ASCII retas no código; SQLAlchemy ORM; sem `??=`/`||=` no front; sem dependência nova no front.
- Commits em ASCII (sem acento), `tipo(escopo): descricao`, terminando com `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>` (copiar caractere a caractere). Nunca stage `.claude/settings.local.json`.
- Gates: backend suite verde (hoje 660); `npx vitest run` verde (hoje 574); lint sem erro novo nos arquivos tocados.

## Review Focus

1. Código TOTP reutilizado dentro da janela (replay) → 401, mesmo que ainda válido no relógio. Teste em Task 2.
2. Celular 30 s adiantado ou atrasado → código do passo vizinho aceito uma vez. Teste em Task 2.
3. `mfa_token` apresentado como Bearer em rota protegida → 401. Teste em Task 3.
4. Servidor sem `MFA_ENCRYPTION_KEY`: cadastro → 503 claro; login de quem não tem MFA → 200 normal. Testes em Tasks 1 e 3.
5. Código com espaços/traço digitado ("123 456", "abcd-efgh" minúsculo) → normalizado (dígitos; maiúsculas) antes de comparar. Teste em Task 2.
6. Admin tenta zerar o próprio MFA → 400 e nada muda. Teste em Task 4.
7. Login na segunda etapa com token invalidado por 5 falhas → front volta à etapa senha com aviso. Teste em Task 5.

---

### Task 1: Dependências, chave de cifra, modelo e migração

**Files:**
- Modify: `backend/requirements.txt`
- Modify: `backend/app/core/config.py` (nova env)
- Create: `backend/app/core/mfa_crypto.py`
- Create: `backend/app/models/usuario_mfa.py`
- Modify: `backend/app/models/usuario.py` (relationship)
- Modify: `backend/app/models/__init__.py`, `backend/alembic/env.py` (registro)
- Create: `backend/alembic/versions/0042_usuario_mfa.py`
- Test: `backend/tests/test_mfa_crypto.py`

**Interfaces:**
- Consumes: `app.core.config.settings`, `app.core.exceptions.AppException`.
- Produces: `settings.MFA_ENCRYPTION_KEY: str`; `app.core.mfa_crypto.{MfaIndisponivel, chave_configurada, cifrar, decifrar, exigir_chave}`; modelo `app.models.usuario_mfa.UsuarioMfa` e `Usuario.mfa` (relationship 1:1).

- [ ] **Step 1: Instalar e pinar dependências**

Run (da raiz): `venv/Scripts/python -m pip install pyotp qrcode cryptography` e depois `venv/Scripts/python -m pip freeze | grep -iE "^(pyotp|qrcode|cryptography)=="`.

Acrescentar ao final de `backend/requirements.txt` as três linhas com as versões exatas instaladas, no formato dos demais (ex.: `pyotp==2.9.0`, `qrcode==8.0`, `cryptography==43.0.3` — usar o que o `pip freeze` imprimir).

- [ ] **Step 2: Escrever os testes (falhando)**

Criar `backend/tests/test_mfa_crypto.py`:

```python
"""Cifra em repouso do segredo TOTP (Fernet) e guarda de chave ausente."""
import pytest
from cryptography.fernet import Fernet

import app.core.mfa_crypto as mfa_crypto
from app.core.exceptions import AppException


@pytest.fixture()
def com_chave(monkeypatch):
    monkeypatch.setattr(mfa_crypto.settings, "MFA_ENCRYPTION_KEY", Fernet.generate_key().decode())


@pytest.fixture()
def sem_chave(monkeypatch):
    monkeypatch.setattr(mfa_crypto.settings, "MFA_ENCRYPTION_KEY", "")


def test_round_trip_e_valor_cifrado_nao_contem_o_segredo(com_chave):
    segredo = "JBSWY3DPEHPK3PXP"
    token = mfa_crypto.cifrar(segredo)
    assert segredo not in token
    assert mfa_crypto.decifrar(token) == segredo


def test_cifrar_duas_vezes_gera_tokens_diferentes(com_chave):
    assert mfa_crypto.cifrar("ABC") != mfa_crypto.cifrar("ABC")


def test_chave_configurada(com_chave, monkeypatch):
    assert mfa_crypto.chave_configurada() is True
    monkeypatch.setattr(mfa_crypto.settings, "MFA_ENCRYPTION_KEY", "")
    assert mfa_crypto.chave_configurada() is False


def test_sem_chave_cifrar_e_decifrar_levantam_503(sem_chave):
    with pytest.raises(mfa_crypto.MfaIndisponivel) as exc:
        mfa_crypto.cifrar("x")
    assert exc.value.status_code == 503
    assert exc.value.code == "MFA_INDISPONIVEL"
    with pytest.raises(mfa_crypto.MfaIndisponivel):
        mfa_crypto.decifrar("x")
    with pytest.raises(mfa_crypto.MfaIndisponivel):
        mfa_crypto.exigir_chave()
    assert issubclass(mfa_crypto.MfaIndisponivel, AppException)


def test_chave_invalida_levanta_503(monkeypatch):
    monkeypatch.setattr(mfa_crypto.settings, "MFA_ENCRYPTION_KEY", "nao-e-fernet")
    with pytest.raises(mfa_crypto.MfaIndisponivel):
        mfa_crypto.cifrar("x")


def test_token_corrompido_levanta_unauthorized(com_chave):
    from app.core.exceptions import UnauthorizedException
    with pytest.raises(UnauthorizedException):
        mfa_crypto.decifrar("gAAAAABtoken-invalido")


def test_modelo_usuario_mfa_registrado():
    import app.models  # noqa: F401
    from app.models.usuario_mfa import UsuarioMfa
    from app.models.usuario import Usuario
    assert UsuarioMfa.__tablename__ == "usuario_mfa"
    cols = {c.name for c in UsuarioMfa.__table__.columns}
    assert cols == {
        "usuario_id", "segredo_cifrado", "ativo", "ativado_em",
        "ultimo_passo_usado", "codigos_recuperacao", "criado_em", "atualizado_em",
    }
    fk = list(UsuarioMfa.__table__.c.usuario_id.foreign_keys)[0]
    assert fk.ondelete == "CASCADE"
    assert "mfa" in Usuario.__mapper__.relationships
```

- [ ] **Step 3: Rodar e confirmar que falha**

Run: `venv/Scripts/python -m pytest backend/tests/test_mfa_crypto.py -o addopts="" -q`
Expected: FAIL na coleta com `ModuleNotFoundError: No module named 'app.core.mfa_crypto'`.

- [ ] **Step 4: Env em `config.py`**

Em `backend/app/core/config.py`, após `REFRESH_TOKEN_EXPIRE_DAYS: int = Field(default=7)`, acrescentar:

```python
    # MFA (TOTP): chave Fernet para cifrar o segredo em repouso. Gerar uma vez com
    #   python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
    # Vazia = MFA indisponivel (cadastro/verificacao respondem 503; login sem MFA segue normal).
    # NUNCA rotacionar sem zerar os MFAs cadastrados (docs/mfa.md).
    MFA_ENCRYPTION_KEY: str = ""
```

- [ ] **Step 5: `core/mfa_crypto.py`**

```python
"""Cifra em repouso do segredo TOTP (Fernet). Sem chave configurada, MFA fica indisponivel."""
from cryptography.fernet import Fernet, InvalidToken

from app.core.config import settings
from app.core.exceptions import AppException, UnauthorizedException


class MfaIndisponivel(AppException):
    def __init__(self, message: str = "MFA indisponivel no servidor (MFA_ENCRYPTION_KEY ausente ou invalida)"):
        super().__init__(code="MFA_INDISPONIVEL", message=message, status_code=503)


def chave_configurada() -> bool:
    return bool((settings.MFA_ENCRYPTION_KEY or "").strip())


def exigir_chave() -> None:
    if not chave_configurada():
        raise MfaIndisponivel()


def _fernet() -> Fernet:
    exigir_chave()
    try:
        return Fernet(settings.MFA_ENCRYPTION_KEY.strip().encode())
    except (ValueError, TypeError) as exc:
        raise MfaIndisponivel() from exc


def cifrar(texto: str) -> str:
    return _fernet().encrypt(texto.encode()).decode()


def decifrar(token: str) -> str:
    try:
        return _fernet().decrypt(token.encode()).decode()
    except InvalidToken as exc:
        raise UnauthorizedException("Segredo MFA invalido; zere e recadastre o MFA") from exc
```

- [ ] **Step 6: Modelo `UsuarioMfa` e relationship**

Criar `backend/app/models/usuario_mfa.py`:

```python
from datetime import datetime

from app.db.base import Base
from sqlalchemy import JSON, BigInteger, Boolean, DateTime, ForeignKey, Integer, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship


class UsuarioMfa(Base):
    """Segundo fator TOTP do usuario (1:1). Segredo cifrado com Fernet; codigos
    de recuperacao como hashes bcrypt (consumidos ao usar)."""

    __tablename__ = "usuario_mfa"

    usuario_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("usuarios.id", ondelete="CASCADE"), primary_key=True
    )
    segredo_cifrado: Mapped[str] = mapped_column(Text, nullable=False)
    ativo: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="0")
    ativado_em: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    ultimo_passo_usado: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    codigos_recuperacao: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    criado_em: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    atualizado_em: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    usuario = relationship("Usuario", back_populates="mfa")
```

Em `backend/app/models/usuario.py`, após `role = relationship("Role", back_populates="usuarios")`, acrescentar:

```python
    mfa = relationship(
        "UsuarioMfa", back_populates="usuario", uselist=False,
        cascade="all, delete-orphan", passive_deletes=True,
    )
```

Em `backend/app/models/__init__.py`: acrescentar `from app.models.usuario_mfa import UsuarioMfa` logo após `from app.models.usuario import Usuario` e `"UsuarioMfa",` em `__all__` após `"Usuario",`. Em `backend/alembic/env.py`, no bloco `from app.models import (`, acrescentar `usuario_mfa,` após `usuario,`.

- [ ] **Step 7: Migração**

Criar `backend/alembic/versions/0042_usuario_mfa.py`:

```python
"""usuario_mfa: segundo fator TOTP (1:1 com usuarios)

Segredo cifrado (Fernet), codigos de recuperacao (hashes bcrypt em JSON),
anti-replay por ultimo_passo_usado. Spec 2026-10-06-mfa-totp-admin-global.

Revision ID: 0042_usuario_mfa
Revises: 0041_demanda_status_historico
Create Date: 2026-10-06
"""

import sqlalchemy as sa
from alembic import op


revision = "0042_usuario_mfa"
down_revision = "0041_demanda_status_historico"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "usuario_mfa",
        sa.Column(
            "usuario_id", sa.Integer(),
            sa.ForeignKey("usuarios.id", ondelete="CASCADE"), primary_key=True,
        ),
        sa.Column("segredo_cifrado", sa.Text(), nullable=False),
        sa.Column("ativo", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("ativado_em", sa.DateTime(timezone=True), nullable=True),
        sa.Column("ultimo_passo_usado", sa.BigInteger(), nullable=True),
        sa.Column("codigos_recuperacao", sa.JSON(), nullable=False, server_default="[]"),
        sa.Column(
            "criado_em", sa.DateTime(timezone=True),
            server_default=sa.func.now(), nullable=False,
        ),
        sa.Column(
            "atualizado_em", sa.DateTime(timezone=True),
            server_default=sa.func.now(), nullable=False,
        ),
    )


def downgrade():
    op.drop_table("usuario_mfa")
```

- [ ] **Step 8: Rodar e confirmar que passa**

Run: `venv/Scripts/python -m pytest backend/tests/test_mfa_crypto.py -o addopts="" -q`
Expected: 7 passed.

Run: `venv/Scripts/python -m pytest backend/tests -o addopts="" -q`
Expected: 660 + 7 passed.

Run (checagem da migração, sem banco): `cd backend && ../venv/Scripts/python -c "import importlib.util,sys; spec=importlib.util.spec_from_file_location('m','alembic/versions/0042_usuario_mfa.py'); m=importlib.util.module_from_spec(spec); spec.loader.exec_module(m); print(m.revision, m.down_revision)"`
Expected: `0042_usuario_mfa 0041_demanda_status_historico`.

- [ ] **Step 9: Commit**

```bash
git add backend/requirements.txt backend/app/core/config.py backend/app/core/mfa_crypto.py backend/app/models/usuario_mfa.py backend/app/models/usuario.py backend/app/models/__init__.py backend/alembic/env.py backend/alembic/versions/0042_usuario_mfa.py backend/tests/test_mfa_crypto.py
git commit -m "feat(mfa): deps pyotp/qrcode/cryptography, chave Fernet, modelo usuario_mfa e migracao 0042

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: `MfaService` — configurar, ativar, desativar, status, verificação de código

**Files:**
- Modify: `backend/app/core/security.py` (adicionar `create_mfa_token`)
- Create: `backend/app/services/mfa_service.py`
- Create: `backend/app/schemas/mfa.py`
- Test: `backend/tests/test_mfa_service.py`

**Interfaces:**
- Consumes (Task 1): `mfa_crypto.{cifrar, decifrar, exigir_chave}`, `UsuarioMfa`, `Usuario.mfa`; existentes `hash_password`, `verify_password`, `registrar_acao`, `UnauthorizedException`, `ConflictException`.
- Produces:
  - `security.create_mfa_token(subject: str) -> str` (claims `type: "mfa"`, `jti`, 5 min) e `MFA_TOKEN_EXPIRE_MINUTES = 5`.
  - `schemas.mfa.{MfaConfigurarOut, MfaCodigoIn, MfaDesativarIn, MfaStatusOut, MfaAtivarOut, MfaVerificarIn}`.
  - `services.mfa_service.MfaService(db)` com `status(user) -> dict`, `configurar(user) -> dict`, `ativar(user, codigo, request=None) -> list[str]`, `desativar(user, senha_atual, codigo, request=None) -> None`, `codigo_valido(mfa, codigo) -> bool` (TOTP ±1 anti-replay OU recuperação, consome), e helpers puros `normalizar_codigo(texto) -> str`, `gerar_codigos_recuperacao() -> list[str]`, `eh_codigo_recuperacao(texto) -> bool`.

- [ ] **Step 1: Escrever os testes (falhando)**

Criar `backend/tests/test_mfa_service.py`:

```python
"""MfaService: configurar/ativar/desativar/status e validacao de codigos (sqlite in-memory)."""
import time

import pyotp
import pytest
from cryptography.fernet import Fernet
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker

import app.core.mfa_crypto as mfa_crypto
import app.models  # noqa: F401
from app.core.exceptions import ConflictException, UnauthorizedException
from app.core.security import create_mfa_token, decode_token, hash_password
from app.db.base import Base
from app.models.acao_audit import AcaoAudit
from app.models.login_audit import LoginAudit
from app.models.municipio import Municipio
from app.models.role import Role
from app.models.usuario import Usuario
from app.models.usuario_mfa import UsuarioMfa
from app.services.mfa_service import (
    MfaService,
    eh_codigo_recuperacao,
    gerar_codigos_recuperacao,
    normalizar_codigo,
)


class _FakeClient:
    host = "10.0.0.1"


class _FakeRequest:
    headers = {"user-agent": "pytest"}
    client = _FakeClient()


TEMPO_FIXO = 1_900_000_000.0  # relogio congelado: TOTP e janela ficam deterministicos


@pytest.fixture(autouse=True)
def chave(monkeypatch):
    monkeypatch.setattr(mfa_crypto.settings, "MFA_ENCRYPTION_KEY", Fernet.generate_key().decode())
    # o servico usa time.time(); pyotp.now() usa datetime.now() (NAO congela) -> testes geram codigos com .at(int(time.time()))
    monkeypatch.setattr(time, "time", lambda: TEMPO_FIXO)


@pytest.fixture()
def db():
    engine = create_engine("sqlite://")

    @event.listens_for(engine, "connect")
    def _fk_on(dbapi_conn, _record):
        dbapi_conn.execute("PRAGMA foreign_keys=ON")

    Base.metadata.create_all(engine, tables=[
        Municipio.__table__, Role.__table__, Usuario.__table__, UsuarioMfa.__table__,
        LoginAudit.__table__, AcaoAudit.__table__,
    ])
    s = sessionmaker(bind=engine)()
    s.add(Role(nome="ADMIN_GLOBAL", builtin=True, permissoes={}))
    s.commit()
    yield s
    s.close()


def _admin(db):
    role = db.query(Role).filter(Role.nome == "ADMIN_GLOBAL").one()
    u = Usuario(nome="Admin", email="admin@x.com", senha_hash=hash_password("senha123"), role_id=role.id)
    db.add(u)
    db.commit()
    return u


def _ativar(db, user):
    svc = MfaService(db)
    cfg = svc.configurar(user)
    codigo = pyotp.TOTP(cfg["segredo"]).at(int(time.time()))
    codigos = svc.ativar(user, codigo, request=_FakeRequest())
    return svc, cfg["segredo"], codigos


# ---------- helpers puros ----------

def test_normalizar_codigo_remove_espacos_tracos_e_sobe_caixa():
    assert normalizar_codigo(" 123 456 ") == "123456"
    assert normalizar_codigo("abcd-efgh") == "ABCDEFGH"
    assert normalizar_codigo("ab cd-ef gh") == "ABCDEFGH"


def test_gerar_codigos_recuperacao_formato_e_unicidade():
    codigos = gerar_codigos_recuperacao()
    assert len(codigos) == 10 and len(set(codigos)) == 10
    for c in codigos:
        assert len(c) == 9 and c[4] == "-"
        assert all(ch in "ABCDEFGHJKLMNPQRSTUVWXYZ23456789" for ch in c.replace("-", ""))


def test_eh_codigo_recuperacao():
    assert eh_codigo_recuperacao("ABCD-EFGH") is True
    assert eh_codigo_recuperacao("abcdefgh") is True
    assert eh_codigo_recuperacao("123456") is False


# ---------- create_mfa_token ----------

def test_create_mfa_token_tem_type_mfa_jti_e_expira_em_5_min():
    tok = create_mfa_token("42")
    p = decode_token(tok)
    assert p["sub"] == "42" and p["type"] == "mfa" and len(p["jti"]) >= 16
    assert 290 <= p["exp"] - p["iat"] <= 310


# ---------- configurar / status ----------

def test_status_sem_mfa(db):
    u = _admin(db)
    assert MfaService(db).status(u) == {"ativo": False, "ativado_em": None, "codigos_restantes": 0}


def test_configurar_cria_pendente_cifrado_e_devolve_qr(db):
    u = _admin(db)
    out = MfaService(db).configurar(u)
    assert out["otpauth_url"].startswith("otpauth://totp/")
    assert "UAIZI%20NID" in out["otpauth_url"] or "UAIZI NID" in out["otpauth_url"]
    assert out["qr_svg"].lstrip().startswith("<svg") or "<svg" in out["qr_svg"][:200]
    db.refresh(u)
    assert u.mfa is not None and u.mfa.ativo is False
    assert out["segredo"] not in u.mfa.segredo_cifrado
    assert mfa_crypto.decifrar(u.mfa.segredo_cifrado) == out["segredo"]


def test_configurar_de_novo_antes_de_ativar_sobrescreve(db):
    u = _admin(db)
    svc = MfaService(db)
    a = svc.configurar(u)["segredo"]
    b = svc.configurar(u)["segredo"]
    assert a != b
    db.refresh(u)
    assert mfa_crypto.decifrar(u.mfa.segredo_cifrado) == b


def test_configurar_com_mfa_ativo_409(db):
    u = _admin(db)
    _ativar(db, u)
    with pytest.raises(ConflictException):
        MfaService(db).configurar(u)


# ---------- ativar ----------

def test_ativar_com_codigo_certo_devolve_10_codigos_e_audita(db):
    u = _admin(db)
    svc, segredo, codigos = _ativar(db, u)
    assert len(codigos) == 10
    db.refresh(u)
    assert u.mfa.ativo is True and u.mfa.ativado_em is not None
    assert len(u.mfa.codigos_recuperacao) == 10
    assert all(c not in u.mfa.codigos_recuperacao for c in codigos)  # so hashes
    assert db.query(AcaoAudit).filter(AcaoAudit.acao == "mfa_ativado").count() == 1
    assert svc.status(u)["codigos_restantes"] == 10


def test_ativar_com_codigo_errado_401_e_continua_pendente(db):
    u = _admin(db)
    svc = MfaService(db)
    svc.configurar(u)
    with pytest.raises(UnauthorizedException):
        svc.ativar(u, "000000", request=_FakeRequest())
    db.refresh(u)
    assert u.mfa.ativo is False


def test_ativar_sem_configurar_409(db):
    u = _admin(db)
    with pytest.raises(ConflictException):
        MfaService(db).ativar(u, "123456")


# ---------- codigo_valido (TOTP) ----------

def test_totp_janela_e_anti_replay(db):
    u = _admin(db)
    svc, segredo, _ = _ativar(db, u)
    totp = pyotp.TOTP(segredo)
    db.refresh(u)
    agora = int(time.time())
    passo_atual = agora // 30
    # o codigo usado no ativar foi o do passo atual -> replay recusado
    assert svc.codigo_valido(u.mfa, totp.at(passo_atual * 30)) is False
    # proximo passo (relogio do celular adiantado 30s) aceito uma vez
    prox = totp.at((passo_atual + 1) * 30)
    assert svc.codigo_valido(u.mfa, prox) is True
    assert svc.codigo_valido(u.mfa, prox) is False
    # passo anterior ao ultimo usado -> recusado mesmo dentro da janela
    assert svc.codigo_valido(u.mfa, totp.at(passo_atual * 30)) is False
    # fora da janela
    assert svc.codigo_valido(u.mfa, totp.at((passo_atual + 3) * 30)) is False


def test_totp_aceita_com_espacos(db):
    u = _admin(db)
    svc, segredo, _ = _ativar(db, u)
    db.refresh(u)
    prox = pyotp.TOTP(segredo).at(((int(time.time()) // 30) + 1) * 30)
    assert svc.codigo_valido(u.mfa, prox[:3] + " " + prox[3:]) is True


# ---------- codigo_valido (recuperacao) ----------

def test_codigo_recuperacao_consome_e_nao_repete(db):
    u = _admin(db)
    svc, _, codigos = _ativar(db, u)
    db.refresh(u)
    assert svc.codigo_valido(u.mfa, codigos[0].lower()) is True
    db.refresh(u)
    assert len(u.mfa.codigos_recuperacao) == 9
    assert svc.codigo_valido(u.mfa, codigos[0]) is False
    assert svc.codigo_valido(u.mfa, "ZZZZ-ZZZZ") is False


# ---------- desativar ----------

def test_desativar_exige_senha_e_codigo(db):
    u = _admin(db)
    svc, segredo, codigos = _ativar(db, u)
    db.refresh(u)
    with pytest.raises(UnauthorizedException):
        svc.desativar(u, "errada", codigos[1], request=_FakeRequest())
    with pytest.raises(UnauthorizedException):
        svc.desativar(u, "senha123", "000000", request=_FakeRequest())
    db.refresh(u)
    assert u.mfa is not None
    svc.desativar(u, "senha123", codigos[1], request=_FakeRequest())
    db.refresh(u)
    assert u.mfa is None
    assert db.query(AcaoAudit).filter(AcaoAudit.acao == "mfa_desativado").count() == 1


def test_desativar_sem_mfa_409(db):
    u = _admin(db)
    with pytest.raises(ConflictException):
        MfaService(db).desativar(u, "senha123", "123456")


# ---------- chave ausente ----------

def test_configurar_sem_chave_503(db, monkeypatch):
    u = _admin(db)
    monkeypatch.setattr(mfa_crypto.settings, "MFA_ENCRYPTION_KEY", "")
    with pytest.raises(mfa_crypto.MfaIndisponivel):
        MfaService(db).configurar(u)
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `venv/Scripts/python -m pytest backend/tests/test_mfa_service.py -o addopts="" -q`
Expected: FAIL na coleta com `ImportError: cannot import name 'create_mfa_token'` (ou `No module named 'app.services.mfa_service'`).

- [ ] **Step 3: `create_mfa_token` em `security.py`**

Em `backend/app/core/security.py`, após `create_refresh_token`, acrescentar (e `import uuid` no topo):

```python
MFA_TOKEN_EXPIRE_MINUTES = 5


def create_mfa_token(subject: str) -> str:
    """Token intermediario do login em duas etapas. type="mfa": get_current_user
    o rejeita, entao ele so serve para POST /auth/mfa/verificar."""
    now = datetime.now(timezone.utc)
    to_encode: Dict[str, Any] = {
        "sub": subject,
        "type": "mfa",
        "jti": uuid.uuid4().hex,
        "exp": now + timedelta(minutes=MFA_TOKEN_EXPIRE_MINUTES),
        "iat": now,
    }
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=ALGORITHM)
```

- [ ] **Step 4: Schemas**

Criar `backend/app/schemas/mfa.py`:

```python
from datetime import datetime

from pydantic import BaseModel, Field


class MfaStatusOut(BaseModel):
    ativo: bool
    ativado_em: datetime | None = None
    codigos_restantes: int = 0


class MfaConfigurarOut(BaseModel):
    otpauth_url: str
    segredo: str
    qr_svg: str


class MfaCodigoIn(BaseModel):
    codigo: str = Field(min_length=6, max_length=12)


class MfaDesativarIn(BaseModel):
    senha_atual: str
    codigo: str = Field(min_length=6, max_length=12)


class MfaAtivarOut(BaseModel):
    codigos_recuperacao: list[str]


class MfaVerificarIn(BaseModel):
    mfa_token: str
    codigo: str = Field(min_length=6, max_length=12)
```

- [ ] **Step 5: `services/mfa_service.py`**

```python
"""Segundo fator TOTP (app autenticador) — cadastro, validacao e codigos de recuperacao.

Spec: docs/superpowers/specs/2026-10-06-mfa-totp-admin-global-design.md
"""
import re
import secrets
import time
from datetime import datetime, timezone

import pyotp
import qrcode
from qrcode.image.svg import SvgPathImage
from sqlalchemy.orm import Session

from app.core.exceptions import ConflictException, UnauthorizedException
from app.core.mfa_crypto import cifrar, decifrar, exigir_chave
from app.core.security import hash_password, verify_password
from app.models.usuario import Usuario
from app.models.usuario_mfa import UsuarioMfa
from app.services.audit_service import registrar_acao

EMISSOR = "UAIZI NID"
PASSO_SEGUNDOS = 30
JANELA_PASSOS = 1
N_CODIGOS_RECUPERACAO = 10
ALFABETO_RECUPERACAO = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # sem 0/O/1/I
_RE_RECUPERACAO = re.compile(r"^[A-Z2-9]{8}$")


def normalizar_codigo(texto: str) -> str:
    return re.sub(r"[\s-]", "", texto or "").upper()


def eh_codigo_recuperacao(texto: str) -> bool:
    return bool(_RE_RECUPERACAO.match(normalizar_codigo(texto)))


def gerar_codigos_recuperacao() -> list[str]:
    def bloco():
        return "".join(secrets.choice(ALFABETO_RECUPERACAO) for _ in range(4))

    codigos: list[str] = []
    while len(codigos) < N_CODIGOS_RECUPERACAO:
        c = f"{bloco()}-{bloco()}"
        if c not in codigos:
            codigos.append(c)
    return codigos


class MfaService:
    def __init__(self, db: Session):
        self.db = db

    # ---------- consulta ----------

    def status(self, user: Usuario) -> dict:
        mfa = user.mfa
        if mfa is None or not mfa.ativo:
            return {"ativo": False, "ativado_em": None, "codigos_restantes": 0}
        return {
            "ativo": True,
            "ativado_em": mfa.ativado_em,
            "codigos_restantes": len(mfa.codigos_recuperacao or []),
        }

    # ---------- cadastro ----------

    def configurar(self, user: Usuario) -> dict:
        exigir_chave()
        if user.mfa is not None and user.mfa.ativo:
            raise ConflictException("MFA ja esta ativo; desative antes de reconfigurar.")
        segredo = pyotp.random_base32()
        if user.mfa is None:
            user.mfa = UsuarioMfa(segredo_cifrado=cifrar(segredo), ativo=False, codigos_recuperacao=[])
        else:
            user.mfa.segredo_cifrado = cifrar(segredo)
            user.mfa.ativo = False
            user.mfa.ultimo_passo_usado = None
            user.mfa.codigos_recuperacao = []
        self.db.add(user)
        self.db.commit()
        url = pyotp.TOTP(segredo).provisioning_uri(name=user.email, issuer_name=EMISSOR)
        qr_svg = qrcode.make(url, image_factory=SvgPathImage).to_string(encoding="unicode")
        return {"otpauth_url": url, "segredo": segredo, "qr_svg": qr_svg}

    def ativar(self, user: Usuario, codigo: str, request=None) -> list[str]:
        mfa = user.mfa
        if mfa is None or mfa.ativo:
            raise ConflictException("Nenhuma configuracao de MFA pendente.")
        if not self._totp_valido(mfa, codigo):
            raise UnauthorizedException("Codigo invalido")
        codigos = gerar_codigos_recuperacao()
        mfa.codigos_recuperacao = [hash_password(c) for c in codigos]
        mfa.ativo = True
        mfa.ativado_em = datetime.now(timezone.utc)
        self.db.add(mfa)
        self.db.commit()
        registrar_acao(self.db, categoria="acao", acao="mfa_ativado", ator=user, alvo=user, request=request)
        return codigos

    def desativar(self, user: Usuario, senha_atual: str, codigo: str, request=None) -> None:
        mfa = user.mfa
        if mfa is None or not mfa.ativo:
            raise ConflictException("MFA nao esta ativo.")
        if not verify_password(senha_atual, user.senha_hash):
            raise UnauthorizedException("Senha atual incorreta")
        if not self.codigo_valido(mfa, codigo):
            raise UnauthorizedException("Codigo invalido")
        self.db.delete(mfa)
        user.mfa = None
        self.db.commit()
        registrar_acao(self.db, categoria="acao", acao="mfa_desativado", ator=user, alvo=user, request=request)

    # ---------- validacao ----------

    def codigo_valido(self, mfa: UsuarioMfa, codigo: str) -> bool:
        """TOTP (janela +-1 passo, anti-replay) OU codigo de recuperacao (consome)."""
        if eh_codigo_recuperacao(codigo):
            return self._recuperacao_valida(mfa, codigo)
        return self._totp_valido(mfa, codigo)

    def _totp_valido(self, mfa: UsuarioMfa, codigo: str) -> bool:
        digitos = normalizar_codigo(codigo)
        if not digitos.isdigit() or len(digitos) != 6:
            return False
        totp = pyotp.TOTP(decifrar(mfa.segredo_cifrado))
        passo_atual = int(time.time()) // PASSO_SEGUNDOS
        ultimo = mfa.ultimo_passo_usado
        for delta in (0, 1, -1):
            passo = passo_atual + delta
            if ultimo is not None and passo <= ultimo:
                continue
            if secrets.compare_digest(totp.at(passo * PASSO_SEGUNDOS), digitos):
                mfa.ultimo_passo_usado = passo
                self.db.add(mfa)
                self.db.commit()
                return True
        return False

    def _recuperacao_valida(self, mfa: UsuarioMfa, codigo: str) -> bool:
        texto = normalizar_codigo(codigo)
        texto = f"{texto[:4]}-{texto[4:]}"
        restantes = list(mfa.codigos_recuperacao or [])
        for i, h in enumerate(restantes):
            if verify_password(texto, h):
                del restantes[i]
                mfa.codigos_recuperacao = restantes
                self.db.add(mfa)
                self.db.commit()
                return True
        return False
```

Observação: `hash_password` recebe o código no formato `XXXX-XXXX` (com traço) e `_recuperacao_valida` reconstrói o traço após normalizar, então "abcd-efgh", "ABCDEFGH" e "abcd efgh" batem.

- [ ] **Step 6: Rodar e confirmar que passa**

Run: `venv/Scripts/python -m pytest backend/tests/test_mfa_service.py -o addopts="" -q`
Expected: 17 passed. Se `test_configurar_cria_pendente_cifrado_e_devolve_qr` falhar no `qr_svg`, imprimir os 200 primeiros caracteres de `out["qr_svg"]` e ajustar SOMENTE a asserção para o prefixo real (`<?xml` + `<svg` são ambos aceitáveis), anotando no relatório.

- [ ] **Step 7: Suite completa + commit**

Run: `venv/Scripts/python -m pytest backend/tests -o addopts="" -q` → verde.

```bash
git add backend/app/core/security.py backend/app/services/mfa_service.py backend/app/schemas/mfa.py backend/tests/test_mfa_service.py
git commit -m "feat(mfa): MfaService (configurar/ativar/desativar/status, TOTP com anti-replay, codigos de recuperacao) e mfa_token

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: Login em duas etapas — `authenticate`, `POST /auth/mfa/verificar`, rotas de cadastro

**Files:**
- Modify: `backend/app/services/auth_service.py` (`authenticate` + novo `verificar_mfa`)
- Create: `backend/app/api/v1/routers/mfa.py`
- Modify: `backend/app/main.py` (import + `include_router`)
- Test: `backend/tests/test_mfa_login.py`

**Interfaces:**
- Consumes: Task 2 (`MfaService`, schemas, `create_mfa_token`), `decode_token`, `LoginAudit`, `require_role`, `limiter`, `origem_do_request`.
- Produces: `AuthService.authenticate` devolve `{"mfa_obrigatorio": True, "mfa_token": "..."}` quando MFA ativo; `AuthService.verificar_mfa(mfa_token, codigo, ip, user_agent) -> dict` (tokens); rotas `POST /auth/mfa/configurar`, `POST /auth/mfa/ativar`, `POST /auth/mfa/desativar`, `GET /auth/mfa/status` (ADMIN_GLOBAL, `5/minute`), `POST /auth/mfa/verificar` (pública, `10/minute`).

- [ ] **Step 1: Escrever os testes (falhando)**

Criar `backend/tests/test_mfa_login.py`:

```python
"""Login em duas etapas: authenticate -> mfa_token -> verificar; rotas /auth/mfa/*."""
import time

import pyotp
import pytest
from cryptography.fernet import Fernet
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker

import app.core.mfa_crypto as mfa_crypto
import app.models  # noqa: F401
import app.services.auth_service as auth_mod
from app.api.deps import get_current_user, require_role
from app.api.v1.routers.mfa import (
    mfa_ativar,
    mfa_configurar,
    mfa_desativar,
    mfa_status,
    mfa_verificar,
)
from app.core.exceptions import ForbiddenException, UnauthorizedException
from app.core.security import create_mfa_token, decode_token, hash_password
from app.db.base import Base
from app.models.acao_audit import AcaoAudit
from app.models.login_audit import LoginAudit
from app.models.municipio import Municipio
from app.models.role import Role
from app.models.usuario import Usuario
from app.models.usuario_mfa import UsuarioMfa
from app.schemas.mfa import MfaCodigoIn, MfaDesativarIn, MfaVerificarIn
from app.services.auth_service import AuthService
from app.services.mfa_service import MfaService


class _FakeClient:
    host = "10.0.0.1"


class _FakeRequest:
    headers = {"user-agent": "pytest"}
    client = _FakeClient()


TEMPO_FIXO = 1_900_000_000.0


@pytest.fixture(autouse=True)
def chave(monkeypatch):
    monkeypatch.setattr(mfa_crypto.settings, "MFA_ENCRYPTION_KEY", Fernet.generate_key().decode())
    monkeypatch.setattr(time, "time", lambda: TEMPO_FIXO)  # TOTP deterministico; gerar codigos com .at(int(time.time())), nunca .now()
    # Os handlers sao decorados com @limiter.limit; chamados direto com um Request
    # falso (sem .state/.app), o slowapi so e inofensivo com o limiter desligado.
    from app.core.rate_limit import limiter
    monkeypatch.setattr(limiter, "enabled", False)
    auth_mod._FALHAS_MFA.clear()


@pytest.fixture()
def db():
    engine = create_engine("sqlite://")

    @event.listens_for(engine, "connect")
    def _fk_on(dbapi_conn, _record):
        dbapi_conn.execute("PRAGMA foreign_keys=ON")

    Base.metadata.create_all(engine, tables=[
        Municipio.__table__, Role.__table__, Usuario.__table__, UsuarioMfa.__table__,
        LoginAudit.__table__, AcaoAudit.__table__,
    ])
    s = sessionmaker(bind=engine)()
    s.add(Role(nome="ADMIN_GLOBAL", builtin=True, permissoes={}))
    s.add(Role(nome="VISUALIZADOR", builtin=True, permissoes={}))
    s.commit()
    yield s
    s.close()


def _user(db, role="ADMIN_GLOBAL", email="admin@x.com"):
    r = db.query(Role).filter(Role.nome == role).one()
    u = Usuario(nome="U", email=email, senha_hash=hash_password("senha123"), role_id=r.id)
    db.add(u)
    db.commit()
    return u


def _ativar(db, user):
    svc = MfaService(db)
    seg = svc.configurar(user)["segredo"]
    codigos = svc.ativar(user, pyotp.TOTP(seg).at(int(time.time())))
    db.refresh(user)
    return seg, codigos


def _prox(seg):
    return pyotp.TOTP(seg).at(((int(time.time()) // 30) + 1) * 30)


# ---------- authenticate ----------

def test_login_sem_mfa_devolve_tokens_como_antes(db):
    _user(db)
    out = AuthService(db).authenticate("admin@x.com", "senha123", "1.1.1.1", "ua")
    assert "access_token" in out and "refresh_token" in out and "mfa_obrigatorio" not in out
    assert db.query(LoginAudit).filter(LoginAudit.motivo == "ok").count() == 1


def test_login_com_mfa_devolve_mfa_token_e_nao_audita_nem_atualiza_last_login(db):
    u = _user(db)
    _ativar(db, u)
    out = AuthService(db).authenticate("admin@x.com", "senha123", "1.1.1.1", "ua")
    assert out == {"mfa_obrigatorio": True, "mfa_token": out["mfa_token"]}
    p = decode_token(out["mfa_token"])
    assert p["type"] == "mfa" and p["sub"] == str(u.id)
    assert db.query(LoginAudit).count() == 0
    db.refresh(u)
    assert u.last_login is None


def test_login_senha_errada_com_mfa_ainda_401(db):
    u = _user(db)
    _ativar(db, u)
    with pytest.raises(UnauthorizedException):
        AuthService(db).authenticate("admin@x.com", "errada", None, None)


def test_login_sem_mfa_funciona_sem_chave_de_cifra(db, monkeypatch):
    _user(db)
    monkeypatch.setattr(mfa_crypto.settings, "MFA_ENCRYPTION_KEY", "")
    out = AuthService(db).authenticate("admin@x.com", "senha123", None, None)
    assert "access_token" in out


# ---------- verificar ----------

def test_verificar_totp_devolve_tokens_audita_e_atualiza_last_login(db):
    u = _user(db)
    seg, _ = _ativar(db, u)
    tok = AuthService(db).authenticate("admin@x.com", "senha123", None, None)["mfa_token"]
    out = AuthService(db).verificar_mfa(tok, _prox(seg), "1.1.1.1", "ua")
    assert decode_token(out["access_token"])["type"] == "access"
    assert decode_token(out["refresh_token"])["type"] == "refresh"
    db.refresh(u)
    assert u.last_login is not None
    assert db.query(LoginAudit).filter(LoginAudit.motivo == "mfa_ok").count() == 1


def test_verificar_codigo_recuperacao_consome(db):
    u = _user(db)
    _, codigos = _ativar(db, u)
    tok = AuthService(db).authenticate("admin@x.com", "senha123", None, None)["mfa_token"]
    AuthService(db).verificar_mfa(tok, codigos[0], None, None)
    db.refresh(u)
    assert len(u.mfa.codigos_recuperacao) == 9
    tok2 = create_mfa_token(str(u.id))
    with pytest.raises(UnauthorizedException):
        AuthService(db).verificar_mfa(tok2, codigos[0], None, None)


def test_verificar_replay_401_e_audita_invalido(db):
    u = _user(db)
    seg, _ = _ativar(db, u)
    tok = create_mfa_token(str(u.id))
    codigo = _prox(seg)
    AuthService(db).verificar_mfa(tok, codigo, None, None)
    tok2 = create_mfa_token(str(u.id))
    with pytest.raises(UnauthorizedException):
        AuthService(db).verificar_mfa(tok2, codigo, None, None)
    assert db.query(LoginAudit).filter(LoginAudit.motivo == "mfa_invalido").count() == 1


def test_verificar_5_falhas_invalidam_o_token(db):
    u = _user(db)
    _ativar(db, u)
    tok = create_mfa_token(str(u.id))
    for _ in range(5):
        with pytest.raises(UnauthorizedException):
            AuthService(db).verificar_mfa(tok, "000000", None, None)
    # 6a tentativa, mesmo com codigo certo, e recusada: token invalidado
    seg = mfa_crypto.decifrar(u.mfa.segredo_cifrado)
    with pytest.raises(UnauthorizedException) as exc:
        AuthService(db).verificar_mfa(tok, _prox(seg), None, None)
    assert "login" in exc.value.message.lower()


def test_verificar_token_errado_ou_expirado_401(db):
    u = _user(db)
    seg, _ = _ativar(db, u)
    from app.core.security import create_access_token
    with pytest.raises(UnauthorizedException):
        AuthService(db).verificar_mfa(create_access_token(str(u.id)), _prox(seg), None, None)
    with pytest.raises(UnauthorizedException):
        AuthService(db).verificar_mfa("nao-e-jwt", _prox(seg), None, None)


def test_verificar_usuario_sem_mfa_ativo_401(db):
    u = _user(db)
    with pytest.raises(UnauthorizedException):
        AuthService(db).verificar_mfa(create_mfa_token(str(u.id)), "123456", None, None)


def test_mfa_token_nao_abre_rota_protegida(db):
    u = _user(db)
    with pytest.raises(UnauthorizedException):
        get_current_user(token=create_mfa_token(str(u.id)), db=db)


def test_verificar_sem_chave_503(db, monkeypatch):
    u = _user(db)
    _ativar(db, u)
    tok = create_mfa_token(str(u.id))
    monkeypatch.setattr(mfa_crypto.settings, "MFA_ENCRYPTION_KEY", "")
    with pytest.raises(mfa_crypto.MfaIndisponivel):
        AuthService(db).verificar_mfa(tok, "123456", None, None)


# ---------- rotas ----------

def test_rotas_de_cadastro_exigem_admin_global():
    dep = require_role("ADMIN_GLOBAL")
    from types import SimpleNamespace
    with pytest.raises(ForbiddenException):
        dep(current_user=SimpleNamespace(role=SimpleNamespace(nome="ADMIN_MUNICIPIO")))


def test_handlers_configurar_ativar_status_desativar(db):
    u = _user(db)
    req = _FakeRequest()
    cfg = mfa_configurar(req, db=db, current_user=u)
    assert cfg.data.otpauth_url.startswith("otpauth://")
    st = mfa_status(req, db=db, current_user=u)
    assert st.data.ativo is False
    codigo = pyotp.TOTP(cfg.data.segredo).at(int(time.time()))
    ativ = mfa_ativar(req, MfaCodigoIn(codigo=codigo), db=db, current_user=u)
    assert len(ativ.data.codigos_recuperacao) == 10
    db.refresh(u)
    st = mfa_status(req, db=db, current_user=u)
    assert st.data.ativo is True and st.data.codigos_restantes == 10
    out = mfa_desativar(req, MfaDesativarIn(senha_atual="senha123", codigo=ativ.data.codigos_recuperacao[0]), db=db, current_user=u)
    assert out == {"ok": True}


def test_handler_verificar(db):
    u = _user(db)
    seg, _ = _ativar(db, u)
    tok = create_mfa_token(str(u.id))
    out = mfa_verificar(_FakeRequest(), MfaVerificarIn(mfa_token=tok, codigo=_prox(seg)), db=db)
    assert "access_token" in out


def test_rotas_registradas_no_app():
    from app.main import app
    paths = {r.path for r in app.routes if hasattr(r, "path")}
    for p in ("/api/v1/auth/mfa/configurar", "/api/v1/auth/mfa/ativar", "/api/v1/auth/mfa/desativar",
              "/api/v1/auth/mfa/status", "/api/v1/auth/mfa/verificar"):
        assert p in paths, p
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `venv/Scripts/python -m pytest backend/tests/test_mfa_login.py -o addopts="" -q`
Expected: FAIL na coleta (`No module named 'app.api.v1.routers.mfa'`).

- [ ] **Step 3: `AuthService.authenticate` em duas etapas + `verificar_mfa`**

Em `backend/app/services/auth_service.py`:

Imports: acrescentar `import time` e `from app.core.security import (…, create_mfa_token, …)`; `from app.core.mfa_crypto import exigir_chave`; `from app.models.usuario import Usuario`; `from app.services.mfa_service import MfaService`.

Logo após os imports, acrescentar o contador de falhas por `jti`:

```python
# Falhas de 2o fator por mfa_token (jti): 5 falhas invalidam o token. Em memoria,
# por processo, TTL 5 min (= validade do token). Aceito pela spec (volume baixo).
MFA_MAX_FALHAS = 5
_FALHAS_MFA: dict[str, tuple[int, float]] = {}


def _registrar_falha_mfa(jti: str) -> int:
    agora = time.time()
    for k, (_, exp) in list(_FALHAS_MFA.items()):
        if exp < agora:
            _FALHAS_MFA.pop(k, None)
    n, exp = _FALHAS_MFA.get(jti, (0, agora + 300))
    _FALHAS_MFA[jti] = (n + 1, exp)
    return n + 1


def _token_mfa_invalidado(jti: str) -> bool:
    n, exp = _FALHAS_MFA.get(jti, (0, 0))
    return exp >= time.time() and n >= MFA_MAX_FALHAS
```

Em `authenticate`, logo após o bloco `if not user.ativo: … raise UnauthorizedException("User is inactive")` e ANTES de `access_token = create_access_token(…)`, inserir:

```python
        # Segundo fator: nao emite tokens, nao audita, nao atualiza last_login
        # ate o codigo ser verificado em /auth/mfa/verificar.
        if user.mfa is not None and user.mfa.ativo:
            return {"mfa_obrigatorio": True, "mfa_token": create_mfa_token(str(user.id))}
```

Acrescentar o método (depois de `refresh`):

```python
    def verificar_mfa(self, mfa_token: str, codigo: str, ip: str | None, user_agent: str | None) -> dict:
        payload = decode_token(mfa_token)
        if not payload or payload.get("type") != "mfa" or not payload.get("jti"):
            raise UnauthorizedException("Sessao de verificacao invalida ou expirada; faca login de novo")
        jti = payload["jti"]
        if _token_mfa_invalidado(jti):
            raise UnauthorizedException("Muitas tentativas; faca login de novo")
        try:
            uid = int(payload.get("sub"))
        except (TypeError, ValueError):
            raise UnauthorizedException("Sessao de verificacao invalida")
        user = self.session.get(Usuario, uid)
        if not user or not user.ativo or user.mfa is None or not user.mfa.ativo:
            raise UnauthorizedException("Sessao de verificacao invalida")
        exigir_chave()
        if not MfaService(self.session).codigo_valido(user.mfa, codigo):
            self._record_attempt(user.id, user.email, False, "mfa_invalido", ip, user_agent)
            n = _registrar_falha_mfa(jti)
            if n >= MFA_MAX_FALHAS:
                raise UnauthorizedException("Muitas tentativas; faca login de novo")
            raise UnauthorizedException("Codigo invalido")
        access_token = create_access_token(
            subject=str(user.id),
            extra_data={"role": user.role.nome, "municipio_id": user.municipio_id},
        )
        refresh_token = create_refresh_token(subject=str(user.id))
        user.last_login = datetime.now(timezone.utc)
        self.session.add(user)
        self._record_attempt(user.id, user.email, True, "mfa_ok", ip, user_agent)
        return {"access_token": access_token, "refresh_token": refresh_token, "token_type": "bearer"}
```

- [ ] **Step 4: Router `routers/mfa.py`**

```python
"""Segundo fator TOTP: cadastro (so ADMIN_GLOBAL) e verificacao do login em duas etapas."""
from app.api.deps import get_db, require_role
from app.api.response import SuccessResponse
from app.core.rate_limit import limiter
from app.schemas.mfa import (
    MfaAtivarOut,
    MfaCodigoIn,
    MfaConfigurarOut,
    MfaDesativarIn,
    MfaStatusOut,
    MfaVerificarIn,
)
from app.services.audit_service import origem_do_request
from app.services.auth_service import AuthService
from app.services.mfa_service import MfaService
from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

router = APIRouter(prefix="/auth/mfa", tags=["MFA"])


@router.get("/status", response_model=SuccessResponse[MfaStatusOut])
@limiter.limit("30/minute")
def mfa_status(request: Request, db: Session = Depends(get_db), current_user=Depends(require_role("ADMIN_GLOBAL"))):
    return SuccessResponse(data=MfaStatusOut(**MfaService(db).status(current_user)))


@router.post("/configurar", response_model=SuccessResponse[MfaConfigurarOut])
@limiter.limit("5/minute")
def mfa_configurar(request: Request, db: Session = Depends(get_db), current_user=Depends(require_role("ADMIN_GLOBAL"))):
    return SuccessResponse(data=MfaConfigurarOut(**MfaService(db).configurar(current_user)))


@router.post("/ativar", response_model=SuccessResponse[MfaAtivarOut])
@limiter.limit("5/minute")
def mfa_ativar(request: Request, payload: MfaCodigoIn, db: Session = Depends(get_db), current_user=Depends(require_role("ADMIN_GLOBAL"))):
    codigos = MfaService(db).ativar(current_user, payload.codigo, request=request)
    return SuccessResponse(data=MfaAtivarOut(codigos_recuperacao=codigos))


@router.post("/desativar")
@limiter.limit("5/minute")
def mfa_desativar(request: Request, payload: MfaDesativarIn, db: Session = Depends(get_db), current_user=Depends(require_role("ADMIN_GLOBAL"))):
    MfaService(db).desativar(current_user, payload.senha_atual, payload.codigo, request=request)
    return {"ok": True}


@router.post("/verificar")
@limiter.limit("10/minute")
def mfa_verificar(request: Request, payload: MfaVerificarIn, db: Session = Depends(get_db)):
    ip, user_agent = origem_do_request(request)
    return AuthService(db).verificar_mfa(payload.mfa_token, payload.codigo, ip, user_agent)
```

Em `backend/app/main.py`: após `import app.api.v1.routers.export as export` (linha ~30) acrescentar `import app.api.v1.routers.mfa as mfa`; após `app.include_router(auth.router, prefix=API_PREFIX)` acrescentar `app.include_router(mfa.router, prefix=API_PREFIX)`.

- [ ] **Step 5: Rodar e confirmar que passa**

Run: `venv/Scripts/python -m pytest backend/tests/test_mfa_login.py -o addopts="" -q`
Expected: 16 passed. Se `SuccessResponse` não aceitar `data=` com um modelo Pydantic diretamente, conferir `app/api/response.py` e ajustar os handlers (não os testes).

- [ ] **Step 6: Suite completa + commit**

Run: `venv/Scripts/python -m pytest backend/tests -o addopts="" -q` → verde.

```bash
git add backend/app/services/auth_service.py backend/app/api/v1/routers/mfa.py backend/app/main.py backend/tests/test_mfa_login.py
git commit -m "feat(mfa): login em duas etapas com mfa_token, POST /auth/mfa/verificar e rotas de cadastro ADMIN_GLOBAL

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: Zerar MFA pelo admin e `mfa_ativo` na listagem de usuários

**Files:**
- Modify: `backend/app/schemas/usuario.py` (`UsuarioOut.mfa_ativo`)
- Modify: `backend/app/api/v1/routers/usuarios.py` (`_to_out` + rota `POST /{user_id}/mfa/zerar`)
- Test: `backend/tests/test_mfa_zerar.py`

**Interfaces:**
- Consumes: `UsuarioMfa`, `registrar_acao`, `require_role`, `NotFoundException`, `AppException`.
- Produces: `UsuarioOut.mfa_ativo: bool = False`; rota `POST /usuarios/{user_id}/mfa/zerar` (ADMIN_GLOBAL) → `{"ok": True}`; 400 (`AppException code="MFA_PROPRIO"`) ao zerar a própria conta; 404 usuário inexistente; idempotente quando não há MFA.

- [ ] **Step 1: Escrever os testes (falhando)**

Criar `backend/tests/test_mfa_zerar.py`:

```python
"""POST /usuarios/{id}/mfa/zerar e campo mfa_ativo na listagem."""
import time

import pyotp
import pytest
from cryptography.fernet import Fernet
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker

import app.core.mfa_crypto as mfa_crypto
import app.models  # noqa: F401
from app.api.v1.routers.usuarios import _to_out, zerar_mfa
from app.core.exceptions import AppException, NotFoundException
from app.core.security import hash_password
from app.db.base import Base
from app.models.acao_audit import AcaoAudit
from app.models.login_audit import LoginAudit
from app.models.municipio import Municipio
from app.models.role import Role
from app.models.usuario import Usuario
from app.models.usuario_mfa import UsuarioMfa
from app.services.mfa_service import MfaService


class _FakeClient:
    host = "10.0.0.1"


class _FakeRequest:
    headers = {"user-agent": "pytest"}
    client = _FakeClient()


@pytest.fixture(autouse=True)
def chave(monkeypatch):
    monkeypatch.setattr(mfa_crypto.settings, "MFA_ENCRYPTION_KEY", Fernet.generate_key().decode())


@pytest.fixture()
def db():
    engine = create_engine("sqlite://")

    @event.listens_for(engine, "connect")
    def _fk_on(dbapi_conn, _record):
        dbapi_conn.execute("PRAGMA foreign_keys=ON")

    Base.metadata.create_all(engine, tables=[
        Municipio.__table__, Role.__table__, Usuario.__table__, UsuarioMfa.__table__,
        LoginAudit.__table__, AcaoAudit.__table__,
    ])
    s = sessionmaker(bind=engine)()
    s.add(Role(nome="ADMIN_GLOBAL", builtin=True, permissoes={}))
    s.commit()
    yield s
    s.close()


def _admin(db, email):
    r = db.query(Role).filter(Role.nome == "ADMIN_GLOBAL").one()
    u = Usuario(nome=email, email=email, senha_hash=hash_password("x"), role_id=r.id)
    db.add(u)
    db.commit()
    return u


def _ativar(db, u):
    svc = MfaService(db)
    seg = svc.configurar(u)["segredo"]
    svc.ativar(u, pyotp.TOTP(seg).at(int(time.time())))
    db.refresh(u)


def test_to_out_expoe_mfa_ativo(db):
    u = _admin(db, "a@x.com")
    assert _to_out(u).mfa_ativo is False
    _ativar(db, u)
    assert _to_out(u).mfa_ativo is True


def test_zerar_apaga_mfa_e_audita(db):
    ator = _admin(db, "ator@x.com")
    alvo = _admin(db, "alvo@x.com")
    _ativar(db, alvo)
    out = zerar_mfa(alvo.id, _FakeRequest(), db=db, current_user=ator)
    assert out == {"ok": True}
    db.refresh(alvo)
    assert alvo.mfa is None
    linha = db.query(AcaoAudit).filter(AcaoAudit.acao == "mfa_zerado").one()
    assert linha.ator_email == "ator@x.com" and linha.alvo_email == "alvo@x.com"


def test_zerar_a_si_mesmo_400(db):
    ator = _admin(db, "ator@x.com")
    _ativar(db, ator)
    with pytest.raises(AppException) as exc:
        zerar_mfa(ator.id, _FakeRequest(), db=db, current_user=ator)
    assert exc.value.status_code == 400 and exc.value.code == "MFA_PROPRIO"
    db.refresh(ator)
    assert ator.mfa is not None


def test_zerar_usuario_inexistente_404_e_sem_mfa_e_idempotente(db):
    ator = _admin(db, "ator@x.com")
    with pytest.raises(NotFoundException):
        zerar_mfa(9999, _FakeRequest(), db=db, current_user=ator)
    alvo = _admin(db, "alvo@x.com")
    assert zerar_mfa(alvo.id, _FakeRequest(), db=db, current_user=ator) == {"ok": True}
    assert db.query(AcaoAudit).filter(AcaoAudit.acao == "mfa_zerado").count() == 0
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `venv/Scripts/python -m pytest backend/tests/test_mfa_zerar.py -o addopts="" -q`
Expected: FAIL na coleta (`cannot import name 'zerar_mfa'`).

- [ ] **Step 3: Schema e `_to_out`**

Em `backend/app/schemas/usuario.py`, classe `UsuarioOut`, após `ativo: bool` acrescentar `mfa_ativo: bool = False`.

Em `backend/app/api/v1/routers/usuarios.py`, `_to_out`:

```python
def _to_out(u: Usuario) -> UsuarioOut:
    return UsuarioOut(
        id=u.id,
        nome=u.nome,
        email=u.email,
        municipio_id=u.municipio_id,
        role=u.role.nome,
        ativo=u.ativo,
        mfa_ativo=bool(u.mfa is not None and u.mfa.ativo),
    )
```

- [ ] **Step 4: Rota `zerar_mfa`**

Em `routers/usuarios.py`: acrescentar `require_role` ao import de `app.api.deps` e `AppException` ao import de `app.core.exceptions`. Ao final do arquivo:

```python
@router.post("/{user_id}/mfa/zerar")
def zerar_mfa(
    user_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_role("ADMIN_GLOBAL")),
):
    """Caminho de emergencia: remove o 2o fator de outro usuario (perdeu o app e os
    codigos). Para a propria conta use /auth/mfa/desativar (exige senha + codigo)."""
    if user_id == current_user.id:
        raise AppException(code="MFA_PROPRIO", message="Use /auth/mfa/desativar para a propria conta.", status_code=400)
    alvo = db.get(Usuario, user_id)
    if not alvo:
        raise NotFoundException("Usuario nao encontrado")
    if alvo.mfa is None:
        return {"ok": True}
    db.delete(alvo.mfa)
    alvo.mfa = None
    db.commit()
    registrar_acao(db, categoria="acao", acao="mfa_zerado", ator=current_user, alvo=alvo, request=request)
    return {"ok": True}
```

- [ ] **Step 5: Rodar, suite, commit**

Run: `venv/Scripts/python -m pytest backend/tests/test_mfa_zerar.py -o addopts="" -q` → 4 passed.
Run: `venv/Scripts/python -m pytest backend/tests -o addopts="" -q` → verde (atenção a `test_usuarios_*` que comparam `UsuarioOut`: o campo novo tem default, então não quebram).

```bash
git add backend/app/schemas/usuario.py backend/app/api/v1/routers/usuarios.py backend/tests/test_mfa_zerar.py
git commit -m "feat(mfa): POST /usuarios/{id}/mfa/zerar (ADMIN_GLOBAL, auditado) e mfa_ativo na listagem

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: Frontend — `AuthContext` em duas etapas e `LoginPage` com código

**Files:**
- Modify: `frontend-observatorio/src/context/AuthContext.jsx`
- Modify: `frontend-observatorio/src/context/AuthContext.test.jsx` (acrescentar `describe`)
- Modify: `frontend-observatorio/src/pages/login/LoginPage.jsx`
- Create: `frontend-observatorio/src/pages/login/LoginPage.test.jsx`

**Interfaces:**
- Consumes: `POST /auth/login` (devolve `access_token` OU `{ mfa_obrigatorio, mfa_token }`), `POST /auth/mfa/verificar { mfa_token, codigo }`.
- Produces: `useAuth().login(email, senha) → Promise<{ mfa: boolean, mfaToken?: string }>`; `useAuth().verificarMfa(mfaToken, codigo) → Promise<void>`; `LoginPage` com estados `etapa: "senha" | "codigo"`.

- [ ] **Step 1: Testes do `AuthContext` (falhando)**

Em `src/context/AuthContext.test.jsx`, acrescentar ao final (a partir dos mocks já existentes de `api` e `identificarSessao`):

```jsx
function ProbeMfa() {
  const { user, loading, login, verificarMfa } = useAuth();
  const [res, setRes] = useState(null);
  if (loading) return <div>carregando</div>;
  return (
    <div>
      <div>{user ? user.nome : "sem-user"}</div>
      <div data-testid="res">{res ? JSON.stringify(res) : ""}</div>
      <button onClick={async () => setRes(await login("a@x", "s"))}>login</button>
      <button onClick={() => verificarMfa("tok-mfa", "123456")}>verificar</button>
    </div>
  );
}

describe("AuthContext — login em duas etapas (MFA)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.removeItem("access_token");
  });

  it("login com mfa_obrigatorio devolve { mfa: true, mfaToken } e NAO grava token nem carrega /auth/me", async () => {
    api.post.mockResolvedValueOnce({ data: { mfa_obrigatorio: true, mfa_token: "tok-mfa" } });
    render(<AuthProvider><ProbeMfa /></AuthProvider>);
    await screen.findByText("sem-user");
    fireEvent.click(screen.getByText("login"));
    await waitFor(() => expect(screen.getByTestId("res").textContent).toBe(JSON.stringify({ mfa: true, mfaToken: "tok-mfa" })));
    expect(localStorage.getItem("access_token")).toBeNull();
    expect(api.get).not.toHaveBeenCalled();
    expect(identificarSessao).not.toHaveBeenCalled();
  });

  it("login sem MFA devolve { mfa: false } e segue como antes", async () => {
    api.post.mockResolvedValueOnce({ data: { access_token: "t1" } });
    api.get.mockResolvedValueOnce({ data: { data: { id: 1, nome: "Ana", municipio_id: 7, role: "VISUALIZADOR" } } });
    render(<AuthProvider><ProbeMfa /></AuthProvider>);
    await screen.findByText("sem-user");
    fireEvent.click(screen.getByText("login"));
    await screen.findByText("Ana");
    expect(screen.getByTestId("res").textContent).toBe(JSON.stringify({ mfa: false }));
    expect(localStorage.getItem("access_token")).toBe("t1");
  });

  it("verificarMfa chama /auth/mfa/verificar, grava o token e carrega o usuario", async () => {
    api.post.mockResolvedValueOnce({ data: { access_token: "t2", refresh_token: "r2" } });
    api.get.mockResolvedValueOnce({ data: { data: { id: 1, nome: "Bia", municipio_id: null, role: "ADMIN_GLOBAL" } } });
    render(<AuthProvider><ProbeMfa /></AuthProvider>);
    await screen.findByText("sem-user");
    fireEvent.click(screen.getByText("verificar"));
    await screen.findByText("Bia");
    expect(api.post).toHaveBeenCalledWith("/auth/mfa/verificar", { mfa_token: "tok-mfa", codigo: "123456" });
    expect(localStorage.getItem("access_token")).toBe("t2");
    expect(identificarSessao).toHaveBeenCalledWith({ papel: "ADMIN_GLOBAL" });
  });
});
```

(Acrescentar `useState` ao import de React no topo do arquivo de teste: `import { useState } from "react";` e `waitFor` ao import de testing-library.)

- [ ] **Step 2: Teste da `LoginPage` (falhando)**

Criar `src/pages/login/LoginPage.test.jsx`:

```jsx
// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import LoginPage from "./LoginPage";

const auth = { login: vi.fn(), verificarMfa: vi.fn(), user: null, loading: false };
vi.mock("../../context/AuthContext", () => ({ useAuth: () => auth }));
vi.mock("framer-motion", () => ({ motion: new Proxy({}, { get: () => ({ children, ...p }) => <div {...Object.fromEntries(Object.entries(p).filter(([k]) => !["initial","animate","transition","exit","whileHover","whileTap"].includes(k)))}>{children}</div> }) }));
vi.mock("../../assets/bg.jpeg", () => ({ default: "" }));
vi.mock("../../assets/nid_fundo_transparente.png", () => ({ default: "" }));
vi.mock("../../assets/logo_uaizi.png", () => ({ default: "" }));

function montar() {
  return render(<MemoryRouter><LoginPage /></MemoryRouter>);
}

async function preencherELogar() {
  fireEvent.change(screen.getByLabelText("Email"), { target: { value: "a@x.gov.br" } });
  fireEvent.change(screen.getByLabelText("Senha"), { target: { value: "senha" } });
  fireEvent.click(screen.getByRole("button", { name: "Entrar" }));
}

beforeEach(() => {
  vi.clearAllMocks();
  auth.user = null;
});

describe("LoginPage — etapa de codigo (MFA)", () => {
  it("sem MFA nao mostra a etapa de codigo", async () => {
    auth.login.mockResolvedValueOnce({ mfa: false });
    montar();
    await preencherELogar();
    await waitFor(() => expect(auth.login).toHaveBeenCalledWith("a@x.gov.br", "senha"));
    expect(screen.queryByLabelText(/Código de verificação/i)).toBeNull();
  });

  it("com MFA mostra o campo de codigo e verifica", async () => {
    auth.login.mockResolvedValueOnce({ mfa: true, mfaToken: "tok" });
    auth.verificarMfa.mockResolvedValueOnce();
    montar();
    await preencherELogar();
    const campo = await screen.findByLabelText(/Código de verificação/i);
    expect(campo).toHaveAttribute("inputmode", "numeric");
    expect(campo).toHaveAttribute("autocomplete", "one-time-code");
    expect(document.activeElement).toBe(campo);
    fireEvent.change(campo, { target: { value: "123 456" } });
    fireEvent.click(screen.getByRole("button", { name: "Verificar" }));
    await waitFor(() => expect(auth.verificarMfa).toHaveBeenCalledWith("tok", "123 456"));
  });

  it("codigo invalido mostra erro inline e mantem a etapa", async () => {
    auth.login.mockResolvedValueOnce({ mfa: true, mfaToken: "tok" });
    auth.verificarMfa.mockRejectedValueOnce({ response: { status: 401, data: { error: { code: "UNAUTHORIZED", message: "Codigo invalido" } } } });
    montar();
    await preencherELogar();
    const campo = await screen.findByLabelText(/Código de verificação/i);
    fireEvent.change(campo, { target: { value: "000000" } });
    fireEvent.click(screen.getByRole("button", { name: "Verificar" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Código inválido");
    expect(screen.getByLabelText(/Código de verificação/i)).toBeInTheDocument();
  });

  it("token invalidado por muitas tentativas volta a etapa da senha com aviso", async () => {
    auth.login.mockResolvedValueOnce({ mfa: true, mfaToken: "tok" });
    auth.verificarMfa.mockRejectedValueOnce({ response: { status: 401, data: { error: { code: "UNAUTHORIZED", message: "Muitas tentativas; faca login de novo" } } } });
    montar();
    await preencherELogar();
    const campo = await screen.findByLabelText(/Código de verificação/i);
    fireEvent.change(campo, { target: { value: "000000" } });
    fireEvent.click(screen.getByRole("button", { name: "Verificar" }));
    await screen.findByLabelText("Senha");
    expect(screen.getByRole("alert")).toHaveTextContent(/faça login de novo/i);
  });

  it("link alterna para codigo de recuperacao e Voltar retorna a senha", async () => {
    auth.login.mockResolvedValueOnce({ mfa: true, mfaToken: "tok" });
    montar();
    await preencherELogar();
    await screen.findByLabelText(/Código de verificação/i);
    fireEvent.click(screen.getByRole("button", { name: /Usar código de recuperação/i }));
    const rec = screen.getByLabelText(/Código de recuperação/i);
    expect(rec).toHaveAttribute("placeholder", "XXXX-XXXX");
    fireEvent.click(screen.getByRole("button", { name: "Voltar" }));
    expect(await screen.findByLabelText("Senha")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("MFA indisponivel no servidor (503) mostra a mensagem do backend", async () => {
    auth.login.mockResolvedValueOnce({ mfa: true, mfaToken: "tok" });
    auth.verificarMfa.mockRejectedValueOnce({ response: { status: 503, data: { error: { code: "MFA_INDISPONIVEL", message: "MFA indisponivel no servidor" } } } });
    montar();
    await preencherELogar();
    const campo = await screen.findByLabelText(/Código de verificação/i);
    fireEvent.change(campo, { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "Verificar" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/indispon/i);
  });
});
```

- [ ] **Step 3: Rodar e confirmar que falha**

Run: `npx vitest run src/context/AuthContext.test.jsx src/pages/login/LoginPage.test.jsx`
Expected: os 5 antigos passam; os novos falham (`verificarMfa is not a function`; etapa de código não aparece).

- [ ] **Step 4: `AuthContext.jsx`**

Substituir a função `login` por:

```jsx
  const carregarUsuario = async () => {
    const me = await api.get("/auth/me");
    setUser(me.data.data);
  };

  // Devolve { mfa: true, mfaToken } quando o backend exige o 2o fator; nesse
  // caso nenhum token e gravado ate verificarMfa() concluir.
  const login = async (email, senha) => {
    const response = await api.post(
      "/auth/login",
      new URLSearchParams({ username: email, password: senha }),
      { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
    );
    const { access_token, mfa_obrigatorio, mfa_token } = response.data;
    if (mfa_obrigatorio) return { mfa: true, mfaToken: mfa_token };
    localStorage.setItem("access_token", access_token);
    await carregarUsuario();
    return { mfa: false };
  };

  const verificarMfa = async (mfaToken, codigo) => {
    const response = await api.post("/auth/mfa/verificar", { mfa_token: mfaToken, codigo });
    localStorage.setItem("access_token", response.data.access_token);
    await carregarUsuario();
  };
```

E no `value` do provider: `{ user, login, verificarMfa, logout, loading }`.

- [ ] **Step 5: `LoginPage.jsx` — etapa de código**

Estado novo após `const [loading, setLoading] = useState(false);`:

```jsx
  const [etapa, setEtapa] = useState("senha");       // "senha" | "codigo"
  const [mfaToken, setMfaToken] = useState(null);
  const [codigo, setCodigo] = useState("");
  const [usarRecuperacao, setUsarRecuperacao] = useState(false);
  const { verificarMfa } = useAuth();
```

(Trocar a primeira linha do componente por `const { login, verificarMfa, user, loading: authLoading } = useAuth();` e remover a linha `const { verificarMfa } = useAuth();` duplicada — fica um único `useAuth()`.)

Helper de mensagem de erro (fora do componente):

```jsx
function mensagemDoErro(err, padrao) {
  return err?.response?.data?.error?.message || err?.response?.data?.detail || padrao;
}
```

`handleSubmit` passa a:

```jsx
  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const r = await login(email, senha);
      if (r && r.mfa) {
        setMfaToken(r.mfaToken);
        setCodigo("");
        setUsarRecuperacao(false);
        setEtapa("codigo");
      }
    } catch {
      setError("Email ou senha incorretos. Verifique suas credenciais e tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  const voltarParaSenha = (aviso = "") => {
    setEtapa("senha");
    setMfaToken(null);
    setCodigo("");
    setUsarRecuperacao(false);
    setSenha("");
    setError(aviso);
  };

  const handleVerificar = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      await verificarMfa(mfaToken, codigo);
    } catch (err) {
      const msg = mensagemDoErro(err, "Código inválido");
      if (/login de novo|expirad/i.test(msg)) {
        voltarParaSenha("Sessão de verificação encerrada. Faça login de novo.");
      } else if (/indispon/i.test(msg)) {
        setError("MFA indisponível no servidor. Avise o administrador.");
      } else {
        setError("Código inválido. Confira o app autenticador e tente de novo.");
      }
    } finally {
      setLoading(false);
    }
  };
```

No JSX, o card passa a renderizar o formulário de senha quando `etapa === "senha"` (exatamente o `<form onSubmit={handleSubmit}>` atual) e, quando `etapa === "codigo"`, este formulário no lugar dele (mesmas classes dos inputs/botão):

```jsx
            <form onSubmit={handleVerificar} className="space-y-4" noValidate>
              <p className="text-xs text-slate-500">
                Sua conta tem verificação em duas etapas. Digite o código do app autenticador.
              </p>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="login-codigo" className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  {usarRecuperacao ? "Código de recuperação" : "Código de verificação"}
                </label>
                <input
                  id="login-codigo"
                  type="text"
                  value={codigo}
                  onChange={(e) => { setCodigo(e.target.value); if (error) setError(""); }}
                  required
                  autoFocus
                  inputMode={usarRecuperacao ? "text" : "numeric"}
                  autoComplete="one-time-code"
                  placeholder={usarRecuperacao ? "XXXX-XXXX" : "000000"}
                  maxLength={usarRecuperacao ? 9 : 7}
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white text-sm text-slate-800 placeholder-slate-300 tracking-[0.3em] text-center focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-shadow"
                  aria-required="true"
                />
              </div>
              {error && (
                <div role="alert" aria-live="polite" className="flex items-start gap-2.5 bg-red-50 border border-red-100 text-red-700 text-xs px-4 py-3 rounded-xl">
                  <ExclamationCircleIcon className="w-4 h-4 shrink-0 mt-0.5 text-red-500" aria-hidden="true" />
                  {error}
                </div>
              )}
              <button type="submit" disabled={loading || codigo.trim().length < 6} aria-busy={loading}
                className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl text-sm transition-all duration-200 shadow-lg shadow-blue-500/20 focus:outline-none focus:ring-2 focus:ring-blue-400/50 cursor-pointer mt-2">
                {loading ? "Verificando..." : "Verificar"}
              </button>
              <div className="flex items-center justify-between text-xs">
                <button type="button" onClick={() => voltarParaSenha("")} className="text-slate-500 hover:text-slate-700 cursor-pointer">
                  Voltar
                </button>
                <button type="button" onClick={() => { setUsarRecuperacao((v) => !v); setCodigo(""); setError(""); }} className="text-blue-600 hover:text-blue-700 cursor-pointer">
                  {usarRecuperacao ? "Usar código do app" : "Usar código de recuperação"}
                </button>
              </div>
            </form>
```

O erro de senha errada (etapa `senha`) continua no bloco de erro existente; o aviso de "faça login de novo" aparece nesse mesmo bloco porque `voltarParaSenha(aviso)` seta `error`. Trocar o `<h1>`/`<p>` do cabeçalho do card para refletir a etapa: em `codigo`, `h1` "Verificação em duas etapas" e `p` "Código do app autenticador".

- [ ] **Step 6: Rodar e confirmar que passa**

Run: `npx vitest run src/context/AuthContext.test.jsx src/pages/login/LoginPage.test.jsx`
Expected: PASS (5 + 3 no AuthContext; 6 na LoginPage). Se o mock do `framer-motion` reclamar de props, simplificar o mock para `motion: { div: (p) => <div>{p.children}</div> }` e anotar.

- [ ] **Step 7: Suite + lint + commit**

Run: `npx vitest run` → verde. `npx eslint src/context/AuthContext.jsx src/pages/login/LoginPage.jsx src/pages/login/LoginPage.test.jsx src/context/AuthContext.test.jsx` → sem erro novo.

```bash
git add src/context/AuthContext.jsx src/context/AuthContext.test.jsx src/pages/login/LoginPage.jsx src/pages/login/LoginPage.test.jsx
git commit -m "feat(mfa): login em duas etapas no front - AuthContext.verificarMfa e etapa de codigo na LoginPage

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

(git em `frontend-observatorio/`.)

---

### Task 6: Frontend — `MfaModal` e botão "Segurança" (ADMIN_GLOBAL)

**Files:**
- Create: `frontend-observatorio/src/components/MfaModal.jsx`
- Create: `frontend-observatorio/src/components/MfaModal.test.jsx`
- Modify: `frontend-observatorio/src/app/layouts/DashboardLayout.jsx` (botão + estado + render do modal)

**Interfaces:**
- Consumes: `GET /auth/mfa/status`, `POST /auth/mfa/configurar`, `POST /auth/mfa/ativar`, `POST /auth/mfa/desativar` (envelopes `{ data: … }` via `SuccessResponse`, exceto `desativar` → `{ ok: true }`), `useToast`, `useEscapeKey`.
- Produces: `MfaModal({ open, onClose })` (default export) com passos `status` → `qr` → `confirmar` → `codigos`; e estado `ativo` com "Desativar".

- [ ] **Step 1: Testes (falhando)**

Criar `src/components/MfaModal.test.jsx`:

```jsx
// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import MfaModal from "./MfaModal";
import api from "../services/api";

vi.mock("../services/api", () => ({ default: { get: vi.fn(), post: vi.fn() } }));
const addToast = vi.fn();
vi.mock("../context/ToastContext", () => ({ useToast: () => ({ addToast }) }));
vi.mock("framer-motion", () => ({
  AnimatePresence: ({ children }) => <>{children}</>,
  motion: { div: ({ children, ...p }) => <div onClick={p.onClick}>{children}</div>, form: ({ children, onSubmit }) => <form onSubmit={onSubmit}>{children}</form> },
}));

const statusInativo = { data: { data: { ativo: false, ativado_em: null, codigos_restantes: 0 } } };
const statusAtivo = { data: { data: { ativo: true, ativado_em: "2026-10-06T10:00:00Z", codigos_restantes: 10 } } };

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(navigator, { clipboard: { writeText: vi.fn(() => Promise.resolve()) } });
});

describe("MfaModal", () => {
  it("inativo: mostra Ativar; fluxo QR -> confirmar -> codigos; Concluir so apos copiar", async () => {
    api.get.mockResolvedValueOnce(statusInativo);
    api.post.mockResolvedValueOnce({ data: { data: { otpauth_url: "otpauth://totp/x", segredo: "JBSWY3DPEHPK3PXP", qr_svg: "<svg data-testid='qr'></svg>" } } });
    api.post.mockResolvedValueOnce({ data: { data: { codigos_recuperacao: ["AAAA-1111", "BBBB-2222"] } } });
    const onClose = vi.fn();
    render(<MfaModal open onClose={onClose} />);
    fireEvent.click(await screen.findByRole("button", { name: /Ativar verificação/i }));
    await screen.findByText("JBSWY3DPEHPK3PXP");
    expect(api.post).toHaveBeenCalledWith("/auth/mfa/configurar");
    const campo = screen.getByLabelText(/Código do app/i);
    fireEvent.change(campo, { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirmar" }));
    await screen.findByText("AAAA-1111");
    expect(api.post).toHaveBeenLastCalledWith("/auth/mfa/ativar", { codigo: "123456" });
    const concluir = screen.getByRole("button", { name: "Concluir" });
    expect(concluir).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: /Copiar todos/i }));
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith("AAAA-1111\nBBBB-2222"));
    await waitFor(() => expect(concluir).not.toBeDisabled());
    fireEvent.click(concluir);
    expect(onClose).toHaveBeenCalled();
  });

  it("marcar 'ja guardei' tambem habilita Concluir", async () => {
    api.get.mockResolvedValueOnce(statusInativo);
    api.post.mockResolvedValueOnce({ data: { data: { otpauth_url: "o", segredo: "S", qr_svg: "<svg></svg>" } } });
    api.post.mockResolvedValueOnce({ data: { data: { codigos_recuperacao: ["AAAA-1111"] } } });
    render(<MfaModal open onClose={() => {}} />);
    fireEvent.click(await screen.findByRole("button", { name: /Ativar verificação/i }));
    fireEvent.change(await screen.findByLabelText(/Código do app/i), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirmar" }));
    await screen.findByText("AAAA-1111");
    fireEvent.click(screen.getByLabelText(/Já guardei/i));
    expect(screen.getByRole("button", { name: "Concluir" })).not.toBeDisabled();
  });

  it("codigo errado no confirmar mostra erro e permanece no passo", async () => {
    api.get.mockResolvedValueOnce(statusInativo);
    api.post.mockResolvedValueOnce({ data: { data: { otpauth_url: "o", segredo: "S", qr_svg: "<svg></svg>" } } });
    api.post.mockRejectedValueOnce({ response: { status: 401, data: { error: { message: "Codigo invalido" } } } });
    render(<MfaModal open onClose={() => {}} />);
    fireEvent.click(await screen.findByRole("button", { name: /Ativar verificação/i }));
    fireEvent.change(await screen.findByLabelText(/Código do app/i), { target: { value: "000000" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirmar" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/inválido|invalido/i);
    expect(screen.getByLabelText(/Código do app/i)).toBeInTheDocument();
  });

  it("ativo: mostra data, codigos restantes e Desativar exige senha + codigo", async () => {
    api.get.mockResolvedValueOnce(statusAtivo);
    api.post.mockResolvedValueOnce({ data: { ok: true } });
    const onClose = vi.fn();
    render(<MfaModal open onClose={onClose} />);
    expect(await screen.findByText(/10 códigos de recuperação restantes/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Desativar/i }));
    fireEvent.change(screen.getByLabelText("Senha atual"), { target: { value: "senha" } });
    fireEvent.change(screen.getByLabelText(/Código/i), { target: { value: "AAAA-1111" } });
    fireEvent.click(screen.getByRole("button", { name: /Confirmar desativação/i }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith("/auth/mfa/desativar", { senha_atual: "senha", codigo: "AAAA-1111" }));
    expect(addToast).toHaveBeenCalledWith("Verificação em duas etapas desativada.", "success");
    expect(onClose).toHaveBeenCalled();
  });

  it("503 do servidor mostra 'indisponível' e esconde Ativar", async () => {
    api.get.mockRejectedValueOnce({ response: { status: 503, data: { error: { code: "MFA_INDISPONIVEL", message: "MFA indisponivel no servidor" } } } });
    render(<MfaModal open onClose={() => {}} />);
    expect(await screen.findByRole("alert")).toHaveTextContent(/indispon/i);
    expect(screen.queryByRole("button", { name: /Ativar verificação/i })).toBeNull();
  });

  it("409 ao configurar (ja ativo) e mostrado", async () => {
    api.get.mockResolvedValueOnce(statusInativo);
    api.post.mockRejectedValueOnce({ response: { status: 409, data: { error: { message: "MFA ja esta ativo" } } } });
    render(<MfaModal open onClose={() => {}} />);
    fireEvent.click(await screen.findByRole("button", { name: /Ativar verificação/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/ativo/i);
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run src/components/MfaModal.test.jsx`
Expected: FAIL com `Failed to resolve import "./MfaModal"`.

- [ ] **Step 3: `MfaModal.jsx`**

```jsx
// Verificação em duas etapas (TOTP) — só ADMIN_GLOBAL. Passos: status → qr →
// confirmar → codigos (mostrados uma única vez). Desativar exige senha + código.
// Spec: docs/superpowers/specs/2026-10-06-mfa-totp-admin-global-design.md
import { useCallback, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { XMarkIcon } from "@heroicons/react/24/outline";
import api from "../services/api";
import { useToast } from "../context/ToastContext";
import { useEscapeKey } from "../hooks/useEscapeKey";

function mensagemDoErro(err, padrao) {
  return err?.response?.data?.error?.message || err?.response?.data?.detail || padrao;
}

const inputCls =
  "w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--panel-2)] text-[var(--text)] text-sm outline-none focus:ring-2 focus:ring-blue-500";
const btnPrimario = "w-full py-2 rounded-lg text-sm font-medium cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed transition-opacity";
const btnSecundario = "px-3 py-2 rounded-lg text-sm border border-[var(--border)] text-[var(--text-dim)] hover:bg-[var(--panel-2)] cursor-pointer";

export default function MfaModal({ open, onClose }) {
  const { addToast } = useToast();
  const [passo, setPasso] = useState("status"); // status | qr | confirmar | codigos | desativar
  const [status, setStatus] = useState(null);
  const [config, setConfig] = useState(null);
  const [codigo, setCodigo] = useState("");
  const [senhaAtual, setSenhaAtual] = useState("");
  const [codigosRecuperacao, setCodigosRecuperacao] = useState([]);
  const [guardei, setGuardei] = useState(false);
  const [indisponivel, setIndisponivel] = useState(false);
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(false);

  const fechar = useCallback(() => {
    setPasso("status"); setConfig(null); setCodigo(""); setSenhaAtual("");
    setCodigosRecuperacao([]); setGuardei(false); setErro("");
    onClose();
  }, [onClose]);

  useEscapeKey(fechar, open && passo !== "codigos");

  useEffect(() => {
    if (!open) return;
    let vivo = true;
    setErro(""); setIndisponivel(false); setStatus(null);
    api.get("/auth/mfa/status")
      .then((r) => { if (vivo) setStatus(r.data.data); })
      .catch((err) => {
        if (!vivo) return;
        if (err?.response?.status === 503) setIndisponivel(true);
        setErro(mensagemDoErro(err, "Não foi possível consultar o status do MFA."));
      });
    return () => { vivo = false; };
  }, [open]);

  async function iniciar() {
    setErro(""); setCarregando(true);
    try {
      const r = await api.post("/auth/mfa/configurar");
      setConfig(r.data.data); setCodigo(""); setPasso("qr");
    } catch (err) {
      if (err?.response?.status === 503) setIndisponivel(true);
      setErro(mensagemDoErro(err, "Não foi possível iniciar a configuração."));
    } finally { setCarregando(false); }
  }

  async function confirmar(e) {
    e.preventDefault();
    setErro(""); setCarregando(true);
    try {
      const r = await api.post("/auth/mfa/ativar", { codigo });
      setCodigosRecuperacao(r.data.data.codigos_recuperacao || []);
      setGuardei(false); setPasso("codigos");
    } catch (err) {
      setErro(mensagemDoErro(err, "Código inválido."));
    } finally { setCarregando(false); }
  }

  async function copiarTodos() {
    try {
      await navigator.clipboard.writeText(codigosRecuperacao.join("\n"));
      setGuardei(true);
      addToast("Códigos copiados.", "success");
    } catch {
      setErro("Não foi possível copiar. Anote os códigos manualmente e marque 'Já guardei'.");
    }
  }

  async function desativar(e) {
    e.preventDefault();
    setErro(""); setCarregando(true);
    try {
      await api.post("/auth/mfa/desativar", { senha_atual: senhaAtual, codigo });
      addToast("Verificação em duas etapas desativada.", "success");
      fechar();
    } catch (err) {
      setErro(mensagemDoErro(err, "Não foi possível desativar."));
    } finally { setCarregando(false); }
  }

  function concluir() {
    addToast("Verificação em duas etapas ativada.", "success");
    fechar();
  }

  const alerta = erro && (
    <p className="text-xs" style={{ color: "var(--accent-2)" }} role="alert">{erro}</p>
  );

  return (
    <AnimatePresence>
      {open && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget && passo !== "codigos") fechar(); }}>
          <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
            className="w-full max-w-md rounded-2xl shadow-xl border border-[var(--border)] bg-[var(--panel)] p-5 space-y-3"
            role="dialog" aria-modal="true" aria-labelledby="mfa-titulo">
            <div className="flex items-center justify-between">
              <h2 id="mfa-titulo" className="text-sm font-semibold text-[var(--text)]">Segurança · verificação em duas etapas</h2>
              {passo !== "codigos" && (
                <button type="button" onClick={fechar} aria-label="Fechar"
                  className="p-1 rounded-lg text-[var(--text-mute)] hover:text-[var(--text-dim)] hover:bg-[var(--panel-2)] transition-colors cursor-pointer">
                  <XMarkIcon className="w-4 h-4" />
                </button>
              )}
            </div>

            {passo === "status" && (
              <div className="space-y-3 text-sm text-[var(--text-dim)]">
                {alerta}
                {status && !status.ativo && !indisponivel && (
                  <>
                    <p>Proteja sua conta exigindo um código do app autenticador (Google Authenticator, Authy, 1Password…) depois da senha.</p>
                    <button type="button" onClick={iniciar} disabled={carregando} className={btnPrimario} style={{ background: "var(--accent-1)", color: "var(--bg)" }}>
                      {carregando ? "Preparando..." : "Ativar verificação em duas etapas"}
                    </button>
                  </>
                )}
                {status && status.ativo && (
                  <>
                    <p>Ativa desde {status.ativado_em ? new Date(status.ativado_em).toLocaleDateString("pt-BR") : "—"}.</p>
                    <p>{status.codigos_restantes} códigos de recuperação restantes.</p>
                    <button type="button" onClick={() => { setErro(""); setCodigo(""); setSenhaAtual(""); setPasso("desativar"); }} className={btnSecundario}>
                      Desativar
                    </button>
                  </>
                )}
                {!status && !erro && <p>Carregando…</p>}
              </div>
            )}

            {passo === "qr" && config && (
              <form onSubmit={(e) => { e.preventDefault(); setPasso("confirmar"); }} className="space-y-3 text-sm text-[var(--text-dim)]">
                <p>1. Leia o QR no app autenticador ou digite o segredo manualmente.</p>
                <div className="flex justify-center bg-white rounded-xl p-3" dangerouslySetInnerHTML={{ __html: config.qr_svg }} />
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-xs break-all px-2 py-1 rounded bg-[var(--panel-2)] text-[var(--text)]">{config.segredo}</code>
                  <button type="button" className={btnSecundario} onClick={() => navigator.clipboard?.writeText(config.segredo)}>Copiar</button>
                </div>
                {alerta}
                <button type="submit" className={btnPrimario} style={{ background: "var(--accent-1)", color: "var(--bg)" }}>Já li o QR, continuar</button>
              </form>
            )}

            {passo === "confirmar" && (
              <form onSubmit={confirmar} className="space-y-3 text-sm text-[var(--text-dim)]">
                <p>2. Digite o código de 6 dígitos que o app mostra agora.</p>
                <input type="text" inputMode="numeric" autoComplete="one-time-code" aria-label="Código do app" placeholder="000000"
                  value={codigo} onChange={(e) => setCodigo(e.target.value)} required autoFocus maxLength={7} className={inputCls} />
                {alerta}
                <div className="flex gap-2">
                  <button type="button" className={btnSecundario} onClick={() => { setErro(""); setPasso("qr"); }}>Voltar</button>
                  <button type="submit" disabled={carregando || codigo.trim().length < 6} className={btnPrimario} style={{ background: "var(--accent-1)", color: "var(--bg)" }}>
                    {carregando ? "Verificando..." : "Confirmar"}
                  </button>
                </div>
              </form>
            )}

            {passo === "codigos" && (
              <div className="space-y-3 text-sm text-[var(--text-dim)]">
                <p>3. Guarde estes códigos de recuperação. <strong>Eles não aparecem de novo.</strong> Cada um vale uma vez, se você perder o app.</p>
                <ul className="grid grid-cols-2 gap-1 font-mono text-xs text-[var(--text)]">
                  {codigosRecuperacao.map((c) => <li key={c} className="px-2 py-1 rounded bg-[var(--panel-2)]">{c}</li>)}
                </ul>
                <div className="flex items-center gap-2">
                  <button type="button" className={btnSecundario} onClick={copiarTodos}>Copiar todos</button>
                  <label className="flex items-center gap-2 text-xs cursor-pointer">
                    <input type="checkbox" checked={guardei} onChange={(e) => setGuardei(e.target.checked)} aria-label="Já guardei os códigos" />
                    Já guardei os códigos
                  </label>
                </div>
                {alerta}
                <button type="button" onClick={concluir} disabled={!guardei} className={btnPrimario} style={{ background: "var(--accent-1)", color: "var(--bg)" }}>Concluir</button>
              </div>
            )}

            {passo === "desativar" && (
              <form onSubmit={desativar} className="space-y-3 text-sm text-[var(--text-dim)]">
                <p>Para desativar, confirme sua senha e um código do app (ou um código de recuperação).</p>
                <input type="password" aria-label="Senha atual" placeholder="Senha atual" value={senhaAtual} onChange={(e) => setSenhaAtual(e.target.value)} required autoComplete="current-password" className={inputCls} />
                <input type="text" aria-label="Código" placeholder="Código do app ou XXXX-XXXX" value={codigo} onChange={(e) => setCodigo(e.target.value)} required autoComplete="one-time-code" className={inputCls} />
                {alerta}
                <div className="flex gap-2">
                  <button type="button" className={btnSecundario} onClick={() => { setErro(""); setPasso("status"); }}>Voltar</button>
                  <button type="submit" disabled={carregando} className={btnPrimario} style={{ background: "var(--accent-2)", color: "var(--bg)" }}>
                    {carregando ? "Desativando..." : "Confirmar desativação"}
                  </button>
                </div>
              </form>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
```

Nota: o QR vem do backend como SVG gerado pela biblioteca `qrcode` (conteúdo controlado pelo servidor), por isso o `dangerouslySetInnerHTML` é aceitável aqui; não renderizar nada vindo do usuário por esse caminho.

- [ ] **Step 4: Botão "Segurança" em `DashboardLayout.jsx`**

- Import: acrescentar `ShieldCheckIcon` à lista de `@heroicons/react/24/outline` e `import MfaModal from "../../components/MfaModal";` após o import de `AlterarSenhaModal`.
- Estado: após `const [senhaOpen, setSenhaOpen] = useState(false);` acrescentar `const [mfaOpen, setMfaOpen] = useState(false);`.
- No bloco "Theme picker + logout", entre o botão de "Alterar senha" e o de "Sair", acrescentar:

```jsx
              {isGlobal && (
                <button
                  onClick={() => setMfaOpen(true)}
                  className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs cursor-pointer"
                  style={{ background: "var(--panel-2)", border: "1px solid var(--border)", color: "var(--text-dim)" }}
                  title="Segurança (verificação em duas etapas)"
                  aria-label="Segurança"
                >
                  <ShieldCheckIcon className="w-4 h-4" />
                </button>
              )}
```

- Após `<AlterarSenhaModal open={senhaOpen} onClose={() => setSenhaOpen(false)} />` acrescentar `{isGlobal && <MfaModal open={mfaOpen} onClose={() => setMfaOpen(false)} />}`.

- [ ] **Step 5: Rodar e confirmar que passa**

Run: `npx vitest run src/components/MfaModal.test.jsx` → 6 passed. Se o mock do `framer-motion` não repassar `onClick`/`onSubmit` como o teste espera, ajustar o mock (não o componente).

Run: `npx vitest run` → verde (há testes de `DashboardLayout`/`SidebarNav` que renderizam o layout; o novo botão só aparece para ADMIN_GLOBAL e o modal fecha por default, então não devem quebrar; se algum asserir a contagem de botões no rodapé, atualizar a contagem e anotar).

- [ ] **Step 6: Lint + commit**

Run: `npx eslint src/components/MfaModal.jsx src/components/MfaModal.test.jsx src/app/layouts/DashboardLayout.jsx` → sem erro novo.

```bash
git add src/components/MfaModal.jsx src/components/MfaModal.test.jsx src/app/layouts/DashboardLayout.jsx
git commit -m "feat(mfa): MfaModal (QR, confirmar, codigos de recuperacao, desativar) e botao Seguranca para ADMIN_GLOBAL

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: Frontend — coluna MFA e ação "Zerar MFA" em `UsuariosAdminPage`

**Files:**
- Modify: `frontend-observatorio/src/pages/admin/UsuariosAdminPage.jsx`

**Interfaces:**
- Consumes: `UsuarioOut.mfa_ativo` (Task 4), `POST /usuarios/{id}/mfa/zerar`.
- Produces: coluna "MFA" (ícone escudo verde quando ativo, traço quando não) e ação "Zerar MFA" (só `isGlobal`, só se `u.mfa_ativo`, nunca em `currentUser.id === u.id`) com linha de confirmação igual à de exclusão.

Sem teste de componente: a página não tem suite e exige muitos mocks; verificação por lint, build e checklist manual (Task 8). Ruling registrado no ledger pelo controller.

- [ ] **Step 1: Estado e handler**

Após `const [deleting, setDeleting] = useState(false);` acrescentar:

```jsx
  const [mfaConfirmId, setMfaConfirmId] = useState(null);
  const [zerandoMfa, setZerandoMfa] = useState(false);
```

Após `handleDelete`, acrescentar:

```jsx
  async function handleZerarMfa(id) {
    setZerandoMfa(true);
    try {
      await api.post(`/usuarios/${id}/mfa/zerar`);
      setUsuarios((prev) => prev.map((u) => (u.id === id ? { ...u, mfa_ativo: false } : u)));
      setMfaConfirmId(null);
      addToast("MFA zerado. O usuário entra só com a senha até recadastrar.", "success");
    } catch (err) {
      addToast(err?.response?.data?.error?.message || "Erro ao zerar MFA", "error");
    } finally {
      setZerandoMfa(false);
    }
  }
```

No `useEscapeKey` existente, incluir `if (mfaConfirmId) { setMfaConfirmId(null); return; }` antes do `if (deleteConfirmId)` e `mfaConfirmId` nas deps.

- [ ] **Step 2: Coluna e ação**

No `<thead>`, após `<th className="px-3 py-3 md:px-6 text-center">Ativo</th>` acrescentar `<th className="px-3 py-3 md:px-6 text-center">MFA</th>`; os `colSpan={6}` das linhas de vazio/confirmação passam a `7`.

Na linha do usuário, após o `<td>` de "Ativo":

```jsx
                        <td className="px-3 py-3 md:px-6 text-center">
                          {u.mfa_ativo ? (
                            <ShieldCheckIcon className="w-4 h-4 inline text-green-500" role="img" aria-label="MFA ativo" />
                          ) : (
                            <span className="text-slate-300" aria-label="Sem MFA">—</span>
                          )}
                        </td>
```

Dentro do `div.flex` de ações, antes do botão de excluir:

```jsx
                              {isGlobal && u.mfa_ativo && (
                                <button
                                  type="button"
                                  onClick={() => setMfaConfirmId(u.id)}
                                  aria-label={`Zerar MFA de ${u.nome}`}
                                  title="Zerar MFA (perdeu o app e os códigos)"
                                  className="p-2 rounded-lg text-[var(--text-mute)] hover:text-amber-500 hover:bg-[var(--panel-2)] transition-colors cursor-pointer"
                                >
                                  <ShieldExclamationIcon className="w-4 h-4" aria-hidden="true" />
                                </button>
                              )}
```

Após o bloco `{deleteConfirmId === u.id && (…)}`, acrescentar a confirmação:

```jsx
                      {mfaConfirmId === u.id && (
                        <tr key={`mfa-${u.id}`} className="bg-[var(--panel-2)]">
                          <td colSpan={7} className="px-6 py-3">
                            <div className="flex items-center gap-4 text-sm">
                              <span className="text-amber-700 font-medium">
                                Zerar o MFA de <strong>{u.nome}</strong>? Ele volta a entrar só com a senha até recadastrar.
                              </span>
                              <div className="flex gap-2 ml-auto">
                                <button type="button" onClick={() => setMfaConfirmId(null)}
                                  className="px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-white transition-colors text-xs cursor-pointer">
                                  Cancelar
                                </button>
                                <button type="button" onClick={() => handleZerarMfa(u.id)} disabled={zerandoMfa}
                                  className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white transition-colors text-xs disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer">
                                  {zerandoMfa ? "Zerando..." : "Zerar MFA"}
                                </button>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
```

Imports: acrescentar `ShieldCheckIcon, ShieldExclamationIcon` ao import de `@heroicons/react/24/outline` já existente no arquivo.

- [ ] **Step 3: Lint, build, suite, commit**

Run: `npx eslint src/pages/admin/UsuariosAdminPage.jsx` → sem erro novo; `npm run build` → OK; `npx vitest run` → verde.

```bash
git add src/pages/admin/UsuariosAdminPage.jsx
git commit -m "feat(mfa): coluna MFA e acao Zerar MFA no admin de usuarios (so ADMIN_GLOBAL)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: Documentação, env e checklist manual

**Files:**
- Modify: `README.md` (Backend environment variables), `AGENTS.md` (§14 Env vars)
- Modify: `docs/lgpd.md` (§2 (a) e §5)
- Create: `docs/mfa.md`

- [ ] **Step 1: README e AGENTS**

`README.md`, bloco "### Backend environment variables (Railway dashboard)": acrescentar a linha `MFA_ENCRYPTION_KEY=<fernet key — python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())">` após `ANTHROPIC_API_KEY=sk-ant-...`, e abaixo do bloco a frase: `MFA (TOTP) is optional and only ADMIN_GLOBAL can enroll; without MFA_ENCRYPTION_KEY the MFA endpoints answer 503 and plain login keeps working. See [docs/mfa.md](docs/mfa.md).`

`AGENTS.md` §14, linha `- **Env vars**: …`: acrescentar `, MFA_ENCRYPTION_KEY (opcional; MFA TOTP do ADMIN_GLOBAL, ver docs/mfa.md)` ao final da linha.

- [ ] **Step 2: `docs/lgpd.md`**

§2 (a) "Contas de usuário": após "município de vínculo e data do último login." acrescentar, no mesmo parágrafo: `Quando o usuário ativa a verificação em duas etapas, a plataforma guarda também o segredo TOTP cifrado em repouso (Fernet, chave fora do banco) e hashes bcrypt dos códigos de recuperação; nenhum dos dois é legível por quem acessa o banco.`

§5 (lista de medidas): acrescentar o bullet `- Segundo fator opcional por app autenticador (TOTP) para administradores da plataforma, com códigos de recuperação de uso único e registro das tentativas na trilha de logins.`

- [ ] **Step 3: `docs/mfa.md`**

````markdown
# Verificação em duas etapas (MFA TOTP) — runbook

Opcional. Só o ADMIN_GLOBAL cadastra, na própria conta, em **Segurança** (ícone de escudo ao
lado de "Alterar senha"). Spec: `docs/superpowers/specs/2026-10-06-mfa-totp-admin-global-design.md`.

## 1. Habilitar no servidor (uma vez)

1. Gerar a chave: `python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"`.
2. Railway → serviço `api` → Variables → `MFA_ENCRYPTION_KEY=<chave>` → redeploy.
3. Sem a variável, as rotas `/auth/mfa/*` respondem 503 "MFA indisponível" e o login normal segue.
4. **Nunca rotacionar a chave** com MFAs cadastrados: todos os segredos ficam ilegíveis e cada
   usuário precisa ser zerado e recadastrado (§3).

## 2. Cadastrar

1. Menu do usuário → Segurança → "Ativar verificação em duas etapas".
2. Ler o QR no app (Google Authenticator, Authy, 1Password…) ou digitar o segredo.
3. Digitar o código de 6 dígitos → Confirmar.
4. Copiar/guardar os **10 códigos de recuperação** (`XXXX-XXXX`, uso único, não aparecem de novo).
5. Próximos logins: senha → código. Janela de ±30 s; cada código vale uma vez.

## 3. Perdeu o app ou os códigos

- **Há outro ADMIN_GLOBAL**: Admin → Usuários → ícone de escudo laranja → "Zerar MFA" (auditado em
  `acao_audit` como `mfa_zerado`). O usuário entra só com a senha e recadastra.
- **Único ADMIN_GLOBAL**: no Postgres da Railway (`railway connect Postgres` ou o console):
  `DELETE FROM usuario_mfa WHERE usuario_id = (SELECT id FROM usuarios WHERE email = '<email>');`

## 4. Auditoria

- `login_audit.motivo`: `mfa_ok` (login completo com 2º fator), `mfa_invalido` (código errado/replay).
  O `last_login` só atualiza após o 2º fator.
- `acao_audit.acao`: `mfa_ativado`, `mfa_desativado`, `mfa_zerado`.
- 5 códigos errados no mesmo login invalidam a tentativa; o usuário recomeça pela senha.

## 5. Limites conhecidos

- Contador de falhas em memória por processo (com N réplicas, até 5×N tentativas por tentativa de login).
- Só TOTP nesta frente; código por e-mail chega com a frente de e-mail.
````

- [ ] **Step 4: Commit**

```bash
git add README.md AGENTS.md docs/lgpd.md docs/mfa.md
git commit -m "docs(mfa): env MFA_ENCRYPTION_KEY, runbook docs/mfa.md e LGPD (segredo cifrado, codigos de recuperacao)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

- [ ] **Step 5: Checklist manual (usuário, após deploy com a env)**

1. Login sem MFA continua igual para todos os papéis.
2. ADMIN_GLOBAL: Segurança → ativar com um app real → códigos exibidos → sair → login pede o código → entra; repetir o mesmo código → "Código inválido"; esperar o próximo → entra.
3. Usar um código de recuperação → entra; status mostra 9 restantes.
4. 5 códigos errados → volta à tela de senha com aviso.
5. Desativar com senha + código → login volta a ser só senha.
6. Admin → Usuários: coluna MFA, "Zerar MFA" em outro admin com MFA ativo; não aparece na própria linha.
7. `acao_audit` mostra `mfa_ativado`/`mfa_desativado`/`mfa_zerado`; `login_audit` mostra `mfa_ok`/`mfa_invalido`.

---

## Depois do plano

- Deploy: **migração 0042** roda no boot da `api`; setar `MFA_ENCRYPTION_KEY` no serviço `api` (Railway) antes ou depois do deploy (sem ela, 503 só nas rotas de MFA).
- Espelho no LEGIS e código por e-mail: frentes próprias.

---

## Errata de execução

- **Ruling 3 (Task 2, 06/10/2026):** `pyotp.TOTP.now()` usa `datetime.datetime.now()`, que NÃO é afetado por `monkeypatch.setattr(time, "time", ...)`; o serviço usa `time.time()`. Com o relógio congelado os códigos divergiam e 6 testes da Task 2 falhavam. Correção: todos os testes do plano geram códigos com `pyotp.TOTP(seg).at(int(time.time()))` (Tasks 2, 3 e 4) — mesma base de tempo do serviço, determinístico quando congelado e sem flake na virada de passo quando não congelado. O serviço (`_totp_valido` com `totp.at(passo * 30)`) está correto e não muda.
- **Ruling 4 (Task 6, 06/10/2026):** o componente `MfaModal` do plano tinha um passo "qr" separado ("Já li o QR, continuar") antes do campo de código, mas o teste do próprio plano vai de "Ativar verificação…" direto ao campo "Código do app" — inconsistência interna do plano. Resolução adotada: QR + segredo (com "Copiar") + campo de código + "Confirmar" numa única visão (padrão de cadastro de autenticadores; um clique a menos). Todos os elementos do passo 1 e 2 da spec §"MfaModal" continuam presentes; só a divisão em telas mudou. "Concluir" fecha o modal (como no código do plano).
