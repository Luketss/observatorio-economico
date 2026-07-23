# Roles com Permissões por Área + Alterar Senha — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Roles customizadas com matriz de permissões área × verbo (criar/editar/excluir) atribuíveis a usuários de município, delegação de gestão de usuários, troca de senha self-service e side menu por permissão.

**Architecture:** Permissões em JSON na tabela `roles` estendida (migration 0033); funções puras em `app/core/permissions.py`; dependency `require_permissao(area, verbo)` substitui checagens de nome de role nos routers de conteúdo; frontend consome o mapa `permissoes` via `/auth/me` com hook `usePermissao`.

**Tech Stack:** FastAPI + SQLAlchemy (sync) + Alembic + PostgreSQL; React + Vite + Tailwind; pytest (pure-logic) + vitest.

**Spec:** `docs/superpowers/specs/2026-07-23-roles-permissoes-municipio-design.md`

## Global Constraints

- Branch de trabalho: `feat/roles-permissoes` a partir de `main`.
- `backend/tests` NUNCA abre DB/rede (decisão de projeto) — todo teste novo é pure-logic.
- Rodar pytest de `backend/`: `..\venv\Scripts\python.exe -m pytest tests/<arquivo> -v`. O resumo "N passed" do pytest é engolido nesta máquina — **confie no exit code** (`$LASTEXITCODE`).
- `backend/.env` aponta para o Postgres da RAILWAY (DB de dev real). `alembic upgrade head` roda de `backend/`.
- bcrypt TEM que ser 3.2.2 (4+/5 quebra passlib na coleta do pytest). Não mexer em dependências.
- Frontend: `npm run build` como gate (eslint baseline sujo: "motion unused" e set-state-in-effect são falsos-positivos endêmicos — ignorar apenas esses).
- Roles builtin: `ADMIN_GLOBAL`, `ADMIN_MUNICIPIO`, `ANALISTA`, `VISUALIZADOR` (o seed tem 4 — ANALISTA existe no banco e vira builtin com `{}` como VISUALIZADOR).
- **Mudança de comportamento intencional** (aprovada no spec — bypass do global): ADMIN_GLOBAL passa a poder **editar/excluir** itens de desenvolvimento-econômico de qualquer município (hoje é bloqueado por `_check_pode_escrever`; em projetos.py ele já pode). **Criar** continua bloqueado onde o `municipio_id` vem do usuário (global não tem município).
- Commits com mensagem em pt-BR estilo `feat(escopo): descrição`, um por task no mínimo.

---

### Task 1: Núcleo de permissões (`app/core/permissions.py`)

**Files:**
- Create: `backend/app/core/permissions.py`
- Test: `backend/tests/test_permissions.py`

**Interfaces:**
- Consumes: nada (módulo folha; recebe objetos com `.nome`/`.permissoes` duck-typed).
- Produces (usados pelas Tasks 2–6):
  - `AREAS: tuple[str, ...]`, `VERBOS: tuple[str, ...]`, `AREA_LABELS: dict[str, str]`
  - `PERMISSOES_TODAS: dict[str, list[str]]`
  - `tem_permissao(role, area: str, verbo: str) -> bool`
  - `permissoes_efetivas(role) -> dict[str, list[str]]`
  - `valida_atribuicao(role_municipio_id: int | None, usuario_municipio_id: int | None) -> bool`
  - `pode_gerenciar_usuario(ator_role_nome: str, ator_municipio_id: int | None, alvo_role_nome: str, alvo_municipio_id: int | None) -> bool`
  - `erros_permissoes(permissoes) -> list[str]`

- [ ] **Step 1: Criar a branch**

```powershell
git checkout -b feat/roles-permissoes
```

- [ ] **Step 2: Escrever os testes que falham**

Criar `backend/tests/test_permissions.py`:

```python
"""Testes puros do núcleo de permissões (sem DB — usa stubs de Role)."""
from types import SimpleNamespace

from app.core.permissions import (
    AREA_LABELS,
    AREAS,
    PERMISSOES_TODAS,
    VERBOS,
    erros_permissoes,
    pode_gerenciar_usuario,
    permissoes_efetivas,
    tem_permissao,
    valida_atribuicao,
)


def role(nome="CUSTOM", permissoes=None):
    return SimpleNamespace(nome=nome, permissoes=permissoes or {})


# ── tem_permissao ────────────────────────────────────────────────────────

def test_admin_global_sempre_pode():
    assert tem_permissao(role("ADMIN_GLOBAL"), "projetos", "excluir") is True


def test_role_none_nunca_pode():
    assert tem_permissao(None, "projetos", "criar") is False


def test_verbo_presente_na_area():
    r = role(permissoes={"captacao": ["criar", "editar"]})
    assert tem_permissao(r, "captacao", "criar") is True
    assert tem_permissao(r, "captacao", "excluir") is False


def test_area_ausente():
    r = role(permissoes={"captacao": ["criar"]})
    assert tem_permissao(r, "projetos", "criar") is False


def test_permissoes_none_no_banco():
    r = SimpleNamespace(nome="CUSTOM", permissoes=None)
    assert tem_permissao(r, "projetos", "criar") is False


# ── permissoes_efetivas ──────────────────────────────────────────────────

def test_efetivas_admin_global_tudo():
    assert permissoes_efetivas(role("ADMIN_GLOBAL")) == PERMISSOES_TODAS


def test_efetivas_filtra_lixo():
    r = role(permissoes={"captacao": ["criar", "voar"], "narnia": ["editar"]})
    assert permissoes_efetivas(r) == {"captacao": ["criar"]}


def test_efetivas_role_none():
    assert permissoes_efetivas(None) == {}


# ── valida_atribuicao ────────────────────────────────────────────────────

def test_role_global_serve_para_todos():
    assert valida_atribuicao(None, 42) is True
    assert valida_atribuicao(None, None) is True


def test_role_municipal_exige_mesmo_municipio():
    assert valida_atribuicao(7, 7) is True
    assert valida_atribuicao(7, 8) is False
    assert valida_atribuicao(7, None) is False


# ── pode_gerenciar_usuario ───────────────────────────────────────────────

def test_global_gerencia_qualquer_um():
    assert pode_gerenciar_usuario("ADMIN_GLOBAL", None, "VISUALIZADOR", 9) is True


def test_delegado_nao_toca_admin_global():
    assert pode_gerenciar_usuario("CUSTOM", 7, "ADMIN_GLOBAL", None) is False


def test_delegado_nao_cruza_municipio():
    assert pode_gerenciar_usuario("CUSTOM", 7, "VISUALIZADOR", 8) is False


def test_delegado_gerencia_proprio_municipio():
    assert pode_gerenciar_usuario("CUSTOM", 7, "VISUALIZADOR", 7) is True


# ── erros_permissoes ─────────────────────────────────────────────────────

def test_payload_valido_sem_erros():
    assert erros_permissoes({"projetos": ["criar"], "mandato": []}) == []


def test_payload_nao_dict():
    assert erros_permissoes(["projetos"]) != []


def test_area_invalida():
    erros = erros_permissoes({"narnia": ["criar"]})
    assert any("narnia" in e for e in erros)


def test_verbo_invalido():
    erros = erros_permissoes({"projetos": ["voar"]})
    assert any("voar" in e for e in erros)


def test_verbos_nao_lista():
    assert erros_permissoes({"projetos": "criar"}) != []


# ── paridade de constantes ───────────────────────────────────────────────

def test_area_labels_cobre_todas_as_areas():
    assert set(AREA_LABELS) == set(AREAS)


def test_permissoes_todas_cobre_tudo():
    assert set(PERMISSOES_TODAS) == set(AREAS)
    for verbos in PERMISSOES_TODAS.values():
        assert list(verbos) == list(VERBOS)
```

- [ ] **Step 3: Rodar e ver falhar**

De `backend/`:

```powershell
..\venv\Scripts\python.exe -m pytest tests/test_permissions.py -v
```

Expected: exit code ≠ 0 (`ModuleNotFoundError: app.core.permissions`).

- [ ] **Step 4: Implementar `backend/app/core/permissions.py`**

```python
"""Núcleo de permissões por área × verbo.

Funções puras (sem DB): recebem o objeto Role (ou qualquer objeto com
.nome/.permissoes) e primitivos. ADMIN_GLOBAL tem bypass total — o JSON
de permissões dele é irrelevante.
"""

AREAS = (
    "projetos",
    "captacao",
    "funil",
    "escrita",
    "premiacoes",
    "retencao",
    "dados_internos",
    "mandato",
    "usuarios",
)

VERBOS = ("criar", "editar", "excluir")

AREA_LABELS = {
    "projetos": "Projetos",
    "captacao": "Captação de Recursos",
    "funil": "Funil de Investimentos",
    "escrita": "Escrita de Projetos",
    "premiacoes": "Premiações",
    "retencao": "Retenção & Expansão",
    "dados_internos": "Dados Internos",
    "mandato": "Timeline do Mandato",
    "usuarios": "Usuários do Município",
}

PERMISSOES_TODAS = {area: list(VERBOS) for area in AREAS}


def tem_permissao(role, area: str, verbo: str) -> bool:
    if role is None:
        return False
    if role.nome == "ADMIN_GLOBAL":
        return True
    permissoes = role.permissoes or {}
    return verbo in permissoes.get(area, [])


def permissoes_efetivas(role) -> dict:
    """Mapa completo e saneado para o /auth/me (áreas/verbos válidos apenas)."""
    if role is None:
        return {}
    if role.nome == "ADMIN_GLOBAL":
        return PERMISSOES_TODAS
    permissoes = role.permissoes or {}
    efetivas = {}
    for area in AREAS:
        verbos = [v for v in VERBOS if v in permissoes.get(area, [])]
        if verbos:
            efetivas[area] = verbos
    return efetivas


def valida_atribuicao(
    role_municipio_id: int | None, usuario_municipio_id: int | None
) -> bool:
    """Role global (municipio_id None) serve para qualquer usuário;
    role municipal só para usuário do mesmo município."""
    return role_municipio_id is None or role_municipio_id == usuario_municipio_id


def pode_gerenciar_usuario(
    ator_role_nome: str,
    ator_municipio_id: int | None,
    alvo_role_nome: str,
    alvo_municipio_id: int | None,
) -> bool:
    """Guardas anti-escalação da delegação de usuários."""
    if ator_role_nome == "ADMIN_GLOBAL":
        return True
    if alvo_role_nome == "ADMIN_GLOBAL":
        return False
    return alvo_municipio_id == ator_municipio_id


def erros_permissoes(permissoes) -> list[str]:
    """Valida o payload {area: [verbos]} do CRUD de roles. Retorna lista de erros."""
    if not isinstance(permissoes, dict):
        return ["permissoes deve ser um objeto {area: [verbos]}"]
    erros = []
    for area, verbos in permissoes.items():
        if area not in AREAS:
            erros.append(f"área inválida: {area}")
            continue
        if not isinstance(verbos, list):
            erros.append(f"verbos de '{area}' devem ser uma lista")
            continue
        for verbo in verbos:
            if verbo not in VERBOS:
                erros.append(f"verbo inválido em '{area}': {verbo}")
    return erros
```

- [ ] **Step 5: Rodar e ver passar**

```powershell
..\venv\Scripts\python.exe -m pytest tests/test_permissions.py -v
```

Expected: exit code 0.

- [ ] **Step 6: Commit**

```powershell
git add backend/app/core/permissions.py backend/tests/test_permissions.py
git commit -m "feat(permissions): nucleo puro de permissoes area x verbo"
```

---

### Task 2: Modelo Role estendido + migration 0033 + seed

**Files:**
- Modify: `backend/app/models/role.py`
- Create: `backend/alembic/versions/0033_roles_permissoes.py`
- Modify: `backend/app/db/seed.py`

**Interfaces:**
- Consumes: `PERMISSOES_TODAS` (Task 1, apenas no seed — a migration usa literal).
- Produces: colunas `Role.municipio_id: int | None`, `Role.builtin: bool`, `Role.permissoes: dict` (usadas pelas Tasks 3–6).

- [ ] **Step 1: Estender o modelo `backend/app/models/role.py`** (substituir o arquivo)

```python
from app.db.base import Base
from sqlalchemy import JSON, Boolean, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship


class Role(Base):
    __tablename__ = "roles"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    nome: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    descricao: Mapped[str] = mapped_column(String(255), nullable=True)

    # NULL = role do catálogo global; preenchido = role específica do município.
    municipio_id: Mapped[int | None] = mapped_column(
        Integer,
        ForeignKey("municipios.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    # Roles do sistema (ADMIN_GLOBAL etc.): imutáveis e indeletáveis via API.
    builtin: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    # {"area": ["criar", "editar", "excluir"], ...} — ver app.core.permissions.
    permissoes: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)

    usuarios = relationship("Usuario", back_populates="role")
```

- [ ] **Step 2: Criar `backend/alembic/versions/0033_roles_permissoes.py`**

```python
"""roles: municipio_id (catalogo hibrido), builtin e permissoes JSON

Roles builtin existentes sao marcadas e ADMIN_MUNICIPIO recebe todas as
permissoes (comportamento atual preservado). ADMIN_GLOBAL tem bypass em
codigo; VISUALIZADOR/ANALISTA ficam sem permissoes.

Revision ID: 0033_roles_permissoes
Revises: 0032_ingestao_job
Create Date: 2026-07-23
"""

import json

import sqlalchemy as sa
from alembic import op


revision = "0033_roles_permissoes"
down_revision = "0032_ingestao_job"
branch_labels = None
depends_on = None

# Copia literal de app.core.permissions.PERMISSOES_TODAS (migrations nao
# importam codigo da app — teste de paridade em test_permissions.py cobre
# a fonte; se as areas mudarem, nova migration de dados, nao editar esta).
PERMISSOES_TODAS = {
    area: ["criar", "editar", "excluir"]
    for area in (
        "projetos", "captacao", "funil", "escrita", "premiacoes",
        "retencao", "dados_internos", "mandato", "usuarios",
    )
}

BUILTIN = ("ADMIN_GLOBAL", "ADMIN_MUNICIPIO", "ANALISTA", "VISUALIZADOR")


def upgrade():
    op.add_column("roles", sa.Column("municipio_id", sa.Integer(), nullable=True))
    op.add_column(
        "roles",
        sa.Column("builtin", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.add_column(
        "roles",
        sa.Column("permissoes", sa.JSON(), nullable=False, server_default="{}"),
    )
    op.create_foreign_key(
        "fk_roles_municipio_id",
        "roles",
        "municipios",
        ["municipio_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.create_index(op.f("ix_roles_municipio_id"), "roles", ["municipio_id"])

    conn = op.get_bind()
    conn.execute(
        sa.text("UPDATE roles SET builtin = true WHERE nome = ANY(:nomes)"),
        {"nomes": list(BUILTIN)},
    )
    conn.execute(
        sa.text("UPDATE roles SET permissoes = :p WHERE nome = 'ADMIN_MUNICIPIO'"),
        {"p": json.dumps(PERMISSOES_TODAS)},
    )


def downgrade():
    op.drop_index(op.f("ix_roles_municipio_id"), table_name="roles")
    op.drop_constraint("fk_roles_municipio_id", "roles", type_="foreignkey")
    op.drop_column("roles", "permissoes")
    op.drop_column("roles", "builtin")
    op.drop_column("roles", "municipio_id")
```

- [ ] **Step 3: Atualizar `backend/app/db/seed.py`** (substituir `DEFAULT_ROLES` e `seed_roles`)

```python
from app.core.permissions import PERMISSOES_TODAS
from app.core.security import hash_password
from app.models.role import Role
from app.models.usuario import Usuario
from sqlalchemy.orm import Session

# nome -> permissoes. ADMIN_GLOBAL tem bypass em codigo (JSON irrelevante);
# ANALISTA e VISUALIZADOR sao somente-leitura.
DEFAULT_ROLES = {
    "ADMIN_GLOBAL": {},
    "ADMIN_MUNICIPIO": PERMISSOES_TODAS,
    "ANALISTA": {},
    "VISUALIZADOR": {},
}


def seed_roles(db: Session):
    for role_name, permissoes in DEFAULT_ROLES.items():
        existing = db.query(Role).filter(Role.nome == role_name).first()
        if not existing:
            db.add(
                Role(
                    nome=role_name,
                    descricao=f"Role {role_name}",
                    builtin=True,
                    permissoes=permissoes,
                )
            )
        else:
            existing.builtin = True
            if role_name == "ADMIN_MUNICIPIO" and not existing.permissoes:
                existing.permissoes = permissoes
    db.commit()
```

(`seed_admin_global` e `run_seed` ficam como estão.)

- [ ] **Step 4: Aplicar a migration na Railway**

De `backend/`:

```powershell
..\venv\Scripts\python.exe -m alembic upgrade head
```

Expected: `Running upgrade 0032_ingestao_job -> 0033_roles_permissoes`, exit 0.

- [ ] **Step 5: Verificar os dados migrados**

De `backend/`:

```powershell
..\venv\Scripts\python.exe -c "from app.db.session import SessionLocal; from app.models.role import Role; db=SessionLocal(); [print(r.nome, r.builtin, sorted((r.permissoes or {}).keys())[:3]) for r in db.query(Role).all()]"
```

Expected: 4 linhas, todas `True`; ADMIN_MUNICIPIO com áreas no JSON; demais `[]`.

- [ ] **Step 6: Conferir o cascade município × roles municipais**

O FK novo `roles.municipio_id` tem `ondelete=CASCADE`, mas `usuario.role_id` NÃO tem — se o
delete de município remover roles municipais antes dos usuários, o FK bloqueia. Inspecionar a
ordem do fluxo de exclusão:

```powershell
# de backend/
Select-String -Path app/services/municipio_management.py -Pattern "Usuario|delete|municipio" -Context 2
```

Verificar que os `Usuario` do município são deletados ANTES do delete do próprio município
(as roles municipais caem por cascade depois, já sem usuários apontando — `valida_atribuicao`
garante que só usuários daquele município usam a role). Se a ordem for outra, adicionar o
delete explícito de usuários antes. Registrar no commit o que foi encontrado. O clone de
município NÃO deve clonar roles (conferir que o fluxo de clone não toca a tabela `roles`).

- [ ] **Step 7: Rodar a suite para garantir que nada quebrou**

De `backend/`:

```powershell
..\venv\Scripts\python.exe -m pytest tests -q
```

Expected: exit code 0.

- [ ] **Step 8: Commit**

```powershell
git add backend/app/models/role.py backend/alembic/versions/0033_roles_permissoes.py backend/app/db/seed.py
git commit -m "feat(roles): migration 0033 - municipio_id, builtin e permissoes JSON"
```

---

### Task 3: `require_permissao` + rewiring dos routers de conteúdo

**Files:**
- Modify: `backend/app/api/deps.py` (adicionar factory após `require_role`, ~linha 58)
- Modify: `backend/app/api/v1/routers/desenvolvimento_economico.py`
- Modify: `backend/app/api/v1/routers/projetos.py`
- Modify: `backend/app/api/v1/routers/marcos.py`
- Modify: `backend/app/api/v1/routers/dados_internos.py`

**Interfaces:**
- Consumes: `tem_permissao` (Task 1).
- Produces: `require_permissao(area: str, verbo: str)` em `app.api.deps` — dependency factory que retorna o `Usuario` autenticado ou levanta `ForbiddenException` (403). Usada também nas Tasks 4–5.

- [ ] **Step 1: Adicionar a factory em `backend/app/api/deps.py`** (logo após `require_role`)

```python
def require_permissao(area: str, verbo: str):
    """Dependency factory: exige permissão (area, verbo) da role do usuário.
    ADMIN_GLOBAL tem bypass total (ver app.core.permissions.tem_permissao)."""
    from app.core.permissions import tem_permissao

    def checker(current_user: Usuario = Depends(get_current_user)) -> Usuario:
        if not tem_permissao(current_user.role, area, verbo):
            raise ForbiddenException(f"Sem permissão para {verbo} em {area}")
        return current_user

    return checker
```

- [ ] **Step 2: Rewire `desenvolvimento_economico.py`**

1. Substituir `_check_pode_escrever` (linhas 45-50) por:

```python
def _exigir_municipio(current_user: Usuario) -> None:
    """Criação usa o município do usuário — ADMIN_GLOBAL não tem um."""
    if current_user.municipio_id is None:
        raise ForbiddenException("ADMIN_GLOBAL não possui município associado")
```

2. Adicionar import: `from app.api.deps import get_current_user, get_db, require_permissao`.
3. Em CADA endpoint de escrita, trocar `current_user: Usuario = Depends(get_current_user)` pela dependency com a área/verbo corretos e remover a chamada `_check_pode_escrever(current_user)`; nos `POST` de criação, colocar `_exigir_municipio(current_user)` no lugar. Mapa completo (método → área/verbo):

| Endpoint | Dependency |
|---|---|
| `POST /funil` (`criar_funil`) | `require_permissao("funil", "criar")` + `_exigir_municipio` |
| `PUT /funil/{id}` (`atualizar_funil`) | `require_permissao("funil", "editar")` |
| `DELETE /funil/{id}` (`deletar_funil`) | `require_permissao("funil", "excluir")` |
| `POST /retencao` (`criar_retencao`) | `require_permissao("retencao", "criar")` + `_exigir_municipio` |
| `PUT /retencao/{id}` (`atualizar_retencao`) | `require_permissao("retencao", "editar")` |
| `DELETE /retencao/{id}` (`deletar_retencao`) | `require_permissao("retencao", "excluir")` |
| `POST /retencao/{id}/visitas` (`adicionar_visita`) | `require_permissao("retencao", "editar")` |
| `DELETE /retencao/visitas/{id}` (`deletar_visita`) | `require_permissao("retencao", "editar")` |
| `POST /captacao` (`criar_captacao`) | `require_permissao("captacao", "criar")` + `_exigir_municipio` |
| `PUT /captacao/{id}` (`atualizar_captacao`) | `require_permissao("captacao", "editar")` |
| `DELETE /captacao/{id}` (`deletar_captacao`) | `require_permissao("captacao", "excluir")` |
| `POST /escrita` (`criar_escrita`) | `require_permissao("escrita", "criar")` + `_exigir_municipio` |
| `PUT /escrita/{id}` (`atualizar_escrita`) | `require_permissao("escrita", "editar")` |
| `DELETE /escrita/{id}` (`deletar_escrita`) | `require_permissao("escrita", "excluir")` |
| `POST /premiacoes` (`criar_premiacao`) | `require_permissao("premiacoes", "criar")` + `_exigir_municipio` |
| `PUT /premiacoes/{id}` (`atualizar_premiacao`) | `require_permissao("premiacoes", "editar")` |
| `DELETE /premiacoes/{id}` (`deletar_premiacao`) | `require_permissao("premiacoes", "excluir")` |

Exemplo da transformação (padrão para todos — `criar_funil` e `atualizar_funil`):

```python
@router.post("/funil", response_model=InvestimentoFunilOut)
def criar_funil(
    data: InvestimentoFunilCreate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_permissao("funil", "criar")),
):
    _exigir_municipio(current_user)
    item = InvestimentoFunil(
        **data.model_dump(),
        municipio_id=_municipio_id(current_user),
        criado_por=current_user.id,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


@router.put("/funil/{item_id}", response_model=InvestimentoFunilOut)
def atualizar_funil(
    item_id: int,
    data: InvestimentoFunilUpdate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_permissao("funil", "editar")),
):
    item = db.get(InvestimentoFunil, item_id)
    if not item:
        raise NotFoundException("Lead não encontrado")
    if current_user.role.nome != "ADMIN_GLOBAL" and item.municipio_id != current_user.municipio_id:
        raise ForbiddenException("Acesso negado")
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(item, field, value)
    db.commit()
    db.refresh(item)
    return item
```

Os checks de tenant (`item.municipio_id != current_user.municipio_id`) NÃO mudam. Endpoints `GET` NÃO mudam.

- [ ] **Step 3: Rewire `projetos.py`** (só o bloco "Projetos (Acompanhamento)", linhas 210-283 — imagens/eixos/acervo continuam `require_role("ADMIN_GLOBAL")`)

- `criar_projeto` (linha 226): dependency `require_permissao("projetos", "criar")`; substituir os dois `if` de role (linhas 232-235) por:

```python
    if current_user.municipio_id is None:
        raise ForbiddenException("ADMIN_GLOBAL não possui município associado")
```

- `atualizar_projeto` (linha 247): dependency `require_permissao("projetos", "editar")`; remover o check de VISUALIZADOR (linhas 257-258); manter o check de tenant (linha 259-260).
- `deletar_projeto` (linha 268): dependency `require_permissao("projetos", "excluir")`; remover o check de VISUALIZADOR (linhas 277-278); manter o tenant.
- `selecionar_template` (linha 181): dependency `require_permissao("projetos", "criar")`; manter o check "ADMIN_GLOBAL não possui município associado" (linha 187-188) trocando a condição para `if current_user.municipio_id is None:`.
- Atualizar o import da linha 3: `from app.api.deps import get_current_user, get_db, require_permissao, require_role`.

- [ ] **Step 4: Rewire `marcos.py`**

- Import: `from app.api.deps import get_current_user, get_db, require_permissao`.
- `criar_marco` (linha 67): trocar `current_user=Depends(get_current_user)` por `current_user=Depends(require_permissao("mandato", "criar"))` e remover o check de VISUALIZADOR (linhas 73-74).
- `atualizar_marco` (linha 94): `require_permissao("mandato", "editar")`, remover linhas 101-102.
- `deletar_marco` (linha 124): `require_permissao("mandato", "excluir")`, remover linhas 130-131.
- `_resolve_mid` e os checks de tenant não mudam (ADMIN_GLOBAL continua criando marcos para qualquer município via `municipio_id` explícito).

- [ ] **Step 5: Rewire `dados_internos.py`**

Substituir `ROLES_WRITE` e `_assert_write` (linhas 23-28) por:

```python
def _assert_write(user: Usuario, verbo: str):
    from app.core.permissions import tem_permissao

    if not tem_permissao(user.role, "dados_internos", verbo):
        raise ForbiddenException(f"Sem permissão para {verbo} em dados_internos")
```

Atualizar as 9 chamadas `_assert_write(current_user)` com o verbo do endpoint:
`criar_indicador`/`criar_acao`/`criar_evento` → `"criar"`; `atualizar_indicador`/`atualizar_acao`/`atualizar_evento` → `"editar"`; `deletar_indicador`/`deletar_acao`/`deletar_evento` → `"excluir"`. `_assert_own` e `_scoped` não mudam.

- [ ] **Step 6: Sanidade — imports e suite**

De `backend/`:

```powershell
..\venv\Scripts\python.exe -c "import app.main"
..\venv\Scripts\python.exe -m pytest tests -q
```

Expected: exit code 0 nos dois.

- [ ] **Step 7: Commit**

```powershell
git add backend/app/api/deps.py backend/app/api/v1/routers/desenvolvimento_economico.py backend/app/api/v1/routers/projetos.py backend/app/api/v1/routers/marcos.py backend/app/api/v1/routers/dados_internos.py
git commit -m "feat(permissions): require_permissao nos routers de conteudo"
```

---

### Task 4: CRUD de roles (`/roles`, ADMIN_GLOBAL only)

**Files:**
- Create: `backend/app/schemas/role.py`
- Create: `backend/app/api/v1/routers/roles.py`
- Modify: `backend/app/main.py` (import + `include_router`, junto ao bloco das linhas 85-117)
- Test: `backend/tests/test_roles_schema.py`

**Interfaces:**
- Consumes: `erros_permissoes` (Task 1), `require_role` (existente em deps).
- Produces: endpoints `GET/POST/PUT/DELETE /api/v1/roles`; `RoleOut {id, nome, descricao, municipio_id, builtin, permissoes, usuarios_count}` — consumidos pelas Tasks 5 (validação de atribuição usa `Role` direto) e 9 (frontend).

- [ ] **Step 1: Teste de validação do schema (falha primeiro)**

Criar `backend/tests/test_roles_schema.py`:

```python
"""Validação pura dos schemas de Role (pydantic, sem DB)."""
import pytest
from app.schemas.role import RoleCreate, RoleUpdate


def test_create_valido():
    r = RoleCreate(nome="Assessor", permissoes={"captacao": ["criar", "editar"]})
    assert r.municipio_id is None
    assert r.permissoes == {"captacao": ["criar", "editar"]}


def test_create_area_invalida():
    with pytest.raises(ValueError):
        RoleCreate(nome="X", permissoes={"narnia": ["criar"]})


def test_create_verbo_invalido():
    with pytest.raises(ValueError):
        RoleCreate(nome="X", permissoes={"projetos": ["voar"]})


def test_create_nome_vazio():
    with pytest.raises(ValueError):
        RoleCreate(nome="  ", permissoes={})


def test_update_parcial_sem_permissoes():
    r = RoleUpdate(descricao="nova")
    assert r.model_dump(exclude_unset=True) == {"descricao": "nova"}


def test_update_permissoes_validadas():
    with pytest.raises(ValueError):
        RoleUpdate(permissoes={"projetos": ["voar"]})
```

Rodar de `backend/`: `..\venv\Scripts\python.exe -m pytest tests/test_roles_schema.py -v` → exit ≠ 0 (módulo não existe).

- [ ] **Step 2: Criar `backend/app/schemas/role.py`**

```python
from typing import Dict, List, Optional

from app.core.permissions import erros_permissoes
from pydantic import BaseModel, field_validator


def _valida_permissoes(v):
    erros = erros_permissoes(v)
    if erros:
        raise ValueError("; ".join(erros))
    return v


class RoleCreate(BaseModel):
    nome: str
    descricao: Optional[str] = None
    municipio_id: Optional[int] = None
    permissoes: Dict[str, List[str]] = {}

    @field_validator("nome")
    @classmethod
    def nome_nao_vazio(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("nome é obrigatório")
        return v

    @field_validator("permissoes")
    @classmethod
    def permissoes_validas(cls, v):
        return _valida_permissoes(v)


class RoleUpdate(BaseModel):
    nome: Optional[str] = None
    descricao: Optional[str] = None
    municipio_id: Optional[int] = None
    permissoes: Optional[Dict[str, List[str]]] = None

    @field_validator("nome")
    @classmethod
    def nome_nao_vazio(cls, v):
        if v is None:
            return v
        v = v.strip()
        if not v:
            raise ValueError("nome é obrigatório")
        return v

    @field_validator("permissoes")
    @classmethod
    def permissoes_validas(cls, v):
        if v is None:
            return v
        return _valida_permissoes(v)


class RoleOut(BaseModel):
    id: int
    nome: str
    descricao: Optional[str]
    municipio_id: Optional[int]
    builtin: bool
    permissoes: Dict[str, List[str]]
    usuarios_count: int = 0

    class Config:
        from_attributes = True
```

Rodar o teste de novo → exit 0.

- [ ] **Step 3: Criar `backend/app/api/v1/routers/roles.py`**

```python
from typing import List, Optional

from app.api.deps import get_db, require_role
from app.core.exceptions import (
    AppException,
    ConflictException,
    NotFoundException,
)
from app.models.municipio import Municipio
from app.models.role import Role
from app.models.usuario import Usuario
from app.schemas.role import RoleCreate, RoleOut, RoleUpdate
from fastapi import APIRouter, Depends, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

router = APIRouter(prefix="/roles", tags=["Roles"])


def _to_out(role: Role, usuarios_count: int) -> RoleOut:
    return RoleOut(
        id=role.id,
        nome=role.nome,
        descricao=role.descricao,
        municipio_id=role.municipio_id,
        builtin=role.builtin,
        permissoes=role.permissoes or {},
        usuarios_count=usuarios_count,
    )


def _exigir_municipio_valido(db: Session, municipio_id: Optional[int]) -> None:
    if municipio_id is not None and db.get(Municipio, municipio_id) is None:
        raise NotFoundException("Município não encontrado")


@router.get("", response_model=List[RoleOut])
def listar_roles(
    municipio_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    _: Usuario = Depends(require_role("ADMIN_GLOBAL")),
):
    query = (
        db.query(Role, func.count(Usuario.id))
        .outerjoin(Usuario, Usuario.role_id == Role.id)
        .group_by(Role.id)
        .order_by(Role.builtin.desc(), Role.nome)
    )
    if municipio_id is not None:
        query = query.filter(
            (Role.municipio_id.is_(None)) | (Role.municipio_id == municipio_id)
        )
    return [_to_out(role, count) for role, count in query.all()]


@router.post("", response_model=RoleOut)
def criar_role(
    data: RoleCreate,
    db: Session = Depends(get_db),
    _: Usuario = Depends(require_role("ADMIN_GLOBAL")),
):
    if db.query(Role).filter(Role.nome == data.nome).first():
        raise ConflictException("Já existe uma role com esse nome.")
    _exigir_municipio_valido(db, data.municipio_id)
    role = Role(
        nome=data.nome,
        descricao=data.descricao,
        municipio_id=data.municipio_id,
        builtin=False,
        permissoes=data.permissoes,
    )
    db.add(role)
    db.commit()
    db.refresh(role)
    return _to_out(role, 0)


@router.put("/{role_id}", response_model=RoleOut)
def atualizar_role(
    role_id: int,
    data: RoleUpdate,
    db: Session = Depends(get_db),
    _: Usuario = Depends(require_role("ADMIN_GLOBAL")),
):
    role = db.get(Role, role_id)
    if not role:
        raise NotFoundException("Role não encontrada")
    if role.builtin:
        # 400 (não 403): a requisição é inválida por alvo imutável, cf. spec.
        raise AppException(
            code="BUILTIN_ROLE",
            message="Roles do sistema não podem ser alteradas.",
            status_code=400,
        )
    payload = data.model_dump(exclude_unset=True)
    if "nome" in payload and payload["nome"] != role.nome:
        if db.query(Role).filter(Role.nome == payload["nome"]).first():
            raise ConflictException("Já existe uma role com esse nome.")
    if "municipio_id" in payload:
        _exigir_municipio_valido(db, payload["municipio_id"])
    for field, value in payload.items():
        setattr(role, field, value)
    db.commit()
    db.refresh(role)
    count = db.query(func.count(Usuario.id)).filter(Usuario.role_id == role.id).scalar()
    return _to_out(role, count or 0)


@router.delete("/{role_id}")
def deletar_role(
    role_id: int,
    db: Session = Depends(get_db),
    _: Usuario = Depends(require_role("ADMIN_GLOBAL")),
):
    role = db.get(Role, role_id)
    if not role:
        raise NotFoundException("Role não encontrada")
    if role.builtin:
        raise AppException(
            code="BUILTIN_ROLE",
            message="Roles do sistema não podem ser excluídas.",
            status_code=400,
        )
    em_uso = db.query(func.count(Usuario.id)).filter(Usuario.role_id == role.id).scalar()
    if em_uso:
        raise ConflictException(
            f"Role em uso por {em_uso} usuário(s). Reatribua antes de excluir."
        )
    db.delete(role)
    db.commit()
    return {"ok": True}
```

Nota: conferir o caminho do modelo `Municipio` (`backend/app/models/municipio.py`) — se a classe tiver outro nome/módulo, ajustar o import.

- [ ] **Step 4: Registrar em `backend/app/main.py`**

Adicionar `roles` ao import de routers existente e, junto ao bloco de `include_router` (após a linha 86 `usuarios.router`):

```python
app.include_router(roles.router, prefix=API_PREFIX)
```

- [ ] **Step 5: Sanidade + suite**

De `backend/`:

```powershell
..\venv\Scripts\python.exe -c "import app.main"
..\venv\Scripts\python.exe -m pytest tests -q
```

Expected: exit 0 nos dois.

- [ ] **Step 6: Commit**

```powershell
git add backend/app/schemas/role.py backend/app/api/v1/routers/roles.py backend/app/main.py backend/tests/test_roles_schema.py
git commit -m "feat(roles): CRUD de roles customizadas (ADMIN_GLOBAL)"
```

---

### Task 5: Atribuição validada + delegação de usuários

**Files:**
- Modify: `backend/app/api/v1/routers/usuarios.py`
- Modify: `backend/app/schemas/usuario.py` (linhas 14-19, `UsuarioCreate`)
- Test: `backend/tests/test_usuarios_delegacao.py`

**Interfaces:**
- Consumes: `require_permissao` (Task 3), `pode_gerenciar_usuario`, `valida_atribuicao` (Task 1), `Role` (Task 2).
- Produces: comportamento — `POST/PUT/DELETE /usuarios` aceitam ADMIN_GLOBAL **ou** permissão `usuarios` no verbo correspondente, com guardas anti-escalação. Task 9 (frontend) depende disso.

- [ ] **Step 1: Teste puro das regras de payload da delegação (falha primeiro)**

Criar `backend/tests/test_usuarios_delegacao.py`:

```python
"""Regras puras da delegação de usuários (sem DB)."""
from app.api.v1.routers.usuarios import erros_payload_delegado


def test_delegado_nao_muda_role():
    erros = erros_payload_delegado(
        payload={"role_id": 5}, alvo_role_id=3, alvo_id=10, ator_id=2, alvo_municipio_id=7
    )
    assert any("role" in e for e in erros)


def test_delegado_role_igual_ok():
    erros = erros_payload_delegado(
        payload={"role_id": 3}, alvo_role_id=3, alvo_id=10, ator_id=2, alvo_municipio_id=7
    )
    assert erros == []


def test_delegado_nao_muda_municipio():
    erros = erros_payload_delegado(
        payload={"municipio_id": 8}, alvo_role_id=3, alvo_id=10, ator_id=2, alvo_municipio_id=7
    )
    # "munic" e não "municipio": a mensagem tem acento ("município").
    assert any("munic" in e.lower() for e in erros)


def test_delegado_nao_se_desativa():
    erros = erros_payload_delegado(
        payload={"ativo": False}, alvo_role_id=3, alvo_id=2, ator_id=2, alvo_municipio_id=7
    )
    assert any("si mesmo" in e for e in erros)


def test_delegado_desativa_outro_ok():
    erros = erros_payload_delegado(
        payload={"ativo": False}, alvo_role_id=3, alvo_id=10, ator_id=2, alvo_municipio_id=7
    )
    assert erros == []


def test_payload_normal_ok():
    erros = erros_payload_delegado(
        payload={"nome": "Novo", "email": "a@b.com"},
        alvo_role_id=3, alvo_id=10, ator_id=2, alvo_municipio_id=7,
    )
    assert erros == []
```

Rodar de `backend/`: `..\venv\Scripts\python.exe -m pytest tests/test_usuarios_delegacao.py -v` → exit ≠ 0.

- [ ] **Step 2: Afrouxar `UsuarioCreate` em `backend/app/schemas/usuario.py`**

O delegado não escolhe role nem município (o backend fixa), então esses campos precisam ser
opcionais no payload — a obrigatoriedade para o fluxo do global vira validação no router:

```python
class UsuarioCreate(BaseModel):
    nome: str
    email: EmailStr
    senha: str
    municipio_id: Optional[int] = None
    role_id: Optional[int] = None
```

- [ ] **Step 3: Reescrever `backend/app/api/v1/routers/usuarios.py`** (arquivo completo)

```python
from typing import List

from app.api.deps import get_current_user, get_db, require_permissao
from app.api.pagination import PaginatedResponse
from app.api.response import SuccessResponse
from app.core.exceptions import (
    ConflictException,
    ForbiddenException,
    NotFoundException,
)
from app.core.permissions import pode_gerenciar_usuario, valida_atribuicao
from app.models.role import Role
from app.models.usuario import Usuario
from app.schemas.usuario import UsuarioCreate, UsuarioOut, UsuarioUpdate
from app.services.usuario_service import UsuarioService
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

router = APIRouter(prefix="/usuarios", tags=["Usuários"])


def _is_global(user: Usuario) -> bool:
    return user.role.nome == "ADMIN_GLOBAL"


def erros_payload_delegado(
    payload: dict,
    alvo_role_id: int,
    alvo_id: int,
    ator_id: int,
    alvo_municipio_id: int | None,
) -> list[str]:
    """Regras anti-escalação do delegado (pura, testável sem DB).

    payload: campos presentes no update (model_dump(exclude_unset=True)).
    """
    erros = []
    if "role_id" in payload and payload["role_id"] != alvo_role_id:
        erros.append("Delegado não pode alterar a role de um usuário.")
    if (
        "municipio_id" in payload
        and payload["municipio_id"] != alvo_municipio_id
    ):
        erros.append("Delegado não pode mover usuário de município.")
    if payload.get("ativo") is False and alvo_id == ator_id:
        erros.append("Você não pode desativar a si mesmo.")
    return erros


def _to_out(u: Usuario) -> UsuarioOut:
    return UsuarioOut(
        id=u.id,
        nome=u.nome,
        email=u.email,
        municipio_id=u.municipio_id,
        role=u.role.nome,
        ativo=u.ativo,
    )


def _exigir_gerencia(current_user: Usuario, alvo: Usuario) -> None:
    if not pode_gerenciar_usuario(
        current_user.role.nome,
        current_user.municipio_id,
        alvo.role.nome,
        alvo.municipio_id,
    ):
        raise ForbiddenException("Sem permissão para gerenciar este usuário.")


def _validar_role_para_usuario(
    db: Session, role_id: int, municipio_id: int | None
) -> None:
    role = db.get(Role, role_id)
    if not role:
        raise NotFoundException("Role não encontrada")
    if not valida_atribuicao(role.municipio_id, municipio_id):
        raise ConflictException(
            "Role específica de outro município não pode ser atribuída a este usuário."
        )


@router.get("", response_model=PaginatedResponse[UsuarioOut])
def listar_usuarios(
    skip: int = 0,
    limit: int = 20,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    service = UsuarioService(db)

    # ADMIN_GLOBAL sees all; others are scoped to their municipality
    municipio_filter = (
        None if _is_global(current_user) else current_user.municipio_id
    )

    usuarios, total = service.list(skip=skip, limit=limit, municipio_id=municipio_filter)

    return PaginatedResponse(
        items=[_to_out(u) for u in usuarios],
        total=total,
        skip=skip,
        limit=limit,
    )


@router.post("", response_model=SuccessResponse[UsuarioOut])
def criar_usuario(
    data: UsuarioCreate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_permissao("usuarios", "criar")),
):
    service = UsuarioService(db)

    if _is_global(current_user):
        if data.role_id is None:
            raise ConflictException("role_id é obrigatório.")
        _validar_role_para_usuario(db, data.role_id, data.municipio_id)
    else:
        # Delegado: cria só no próprio município e sempre como VISUALIZADOR.
        visualizador = db.query(Role).filter(Role.nome == "VISUALIZADOR").first()
        data = data.model_copy(
            update={
                "municipio_id": current_user.municipio_id,
                "role_id": visualizador.id,
            }
        )

    usuario = service.create(data)
    return SuccessResponse(data=_to_out(usuario))


@router.put("/{user_id}", response_model=SuccessResponse[UsuarioOut])
def atualizar_usuario(
    user_id: int,
    data: UsuarioUpdate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_permissao("usuarios", "editar")),
):
    service = UsuarioService(db)
    alvo = service.get_by_id(user_id)
    payload = data.model_dump(exclude_unset=True)

    if _is_global(current_user):
        if "role_id" in payload or "municipio_id" in payload:
            role_id = payload.get("role_id", alvo.role_id)
            municipio_id = payload.get("municipio_id", alvo.municipio_id)
            _validar_role_para_usuario(db, role_id, municipio_id)
    else:
        _exigir_gerencia(current_user, alvo)
        erros = erros_payload_delegado(
            payload=payload,
            alvo_role_id=alvo.role_id,
            alvo_id=alvo.id,
            ator_id=current_user.id,
            alvo_municipio_id=alvo.municipio_id,
        )
        if erros:
            raise ForbiddenException(" ".join(erros))

    usuario = service.update(user_id, data)
    return SuccessResponse(data=_to_out(usuario))


@router.delete("/{user_id}")
def deletar_usuario(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_permissao("usuarios", "excluir")),
):
    service = UsuarioService(db)
    if not _is_global(current_user):
        alvo = service.get_by_id(user_id)
        _exigir_gerencia(current_user, alvo)
    service.delete(user_id, current_user.id)
    return {"ok": True}
```

Notas:
- `require_permissao("usuarios", ...)` cobre o ADMIN_GLOBAL pelo bypass — os endpoints que antes eram `require_role("ADMIN_GLOBAL")` continuam funcionando para ele.
- `GET /usuarios` não muda (já era scoped e sem gate de role).
- `data.model_copy(update=...)` é pydantic v2 — `UsuarioCreate` já é BaseModel v2.
- `service.delete` já bloqueia auto-exclusão para todos.

- [ ] **Step 4: Rodar os testes**

```powershell
..\venv\Scripts\python.exe -m pytest tests/test_usuarios_delegacao.py tests/test_permissions.py -v
..\venv\Scripts\python.exe -c "import app.main"
```

Expected: exit 0.

- [ ] **Step 5: Commit**

```powershell
git add backend/app/api/v1/routers/usuarios.py backend/app/schemas/usuario.py backend/tests/test_usuarios_delegacao.py
git commit -m "feat(usuarios): delegacao com guardas anti-escalacao e atribuicao validada"
```

---

### Task 6: Alterar senha + `/auth/me` com permissões

**Files:**
- Modify: `backend/app/schemas/auth.py`
- Modify: `backend/app/services/auth_service.py`
- Modify: `backend/app/api/v1/routers/auth.py`
- Test: `backend/tests/test_alterar_senha_schema.py`

**Interfaces:**
- Consumes: `permissoes_efetivas` (Task 1), `verify_password`/`hash_password` (existentes em `app.core.security`).
- Produces: `POST /api/v1/auth/alterar-senha {senha_atual, nova_senha}` → `{"ok": true}` | 400; `/auth/me` passa a incluir `permissoes: dict`. Tasks 7–9 consomem.

- [ ] **Step 1: Teste do schema (falha primeiro)**

Criar `backend/tests/test_alterar_senha_schema.py`:

```python
"""Validação pura do payload de troca de senha."""
import pytest
from app.schemas.auth import AlterarSenhaPayload


def test_payload_valido():
    p = AlterarSenhaPayload(senha_atual="antiga1", nova_senha="nova123")
    assert p.nova_senha == "nova123"


def test_nova_senha_curta():
    with pytest.raises(ValueError):
        AlterarSenhaPayload(senha_atual="antiga1", nova_senha="12345")


def test_senha_atual_obrigatoria():
    with pytest.raises(ValueError):
        AlterarSenhaPayload(nova_senha="nova123")
```

Rodar → exit ≠ 0 (`ImportError`).

- [ ] **Step 2: Estender `backend/app/schemas/auth.py`**

```python
from pydantic import BaseModel, Field


class AuthenticatedUser(BaseModel):
    id: int
    nome: str
    email: str
    municipio_id: int | None
    estado: str | None = None
    role: str
    ativo: bool
    permissoes: dict = {}

    class Config:
        from_attributes = True


class AlterarSenhaPayload(BaseModel):
    senha_atual: str
    nova_senha: str = Field(min_length=6)
```

- [ ] **Step 3: Adicionar `alterar_senha` ao `AuthService`** (em `backend/app/services/auth_service.py`)

Ajustar o import de security no topo (adicionar `hash_password`) e a exception:

```python
from app.core.exceptions import AppException, UnauthorizedException
from app.core.security import (
    DUMMY_PASSWORD_HASH,
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)
```

Método novo no fim da classe:

```python
    def alterar_senha(self, user, senha_atual: str, nova_senha: str) -> None:
        if not verify_password(senha_atual, user.senha_hash):
            raise AppException(
                code="INVALID_PASSWORD",
                message="Senha atual incorreta.",
                status_code=400,
            )
        user.senha_hash = hash_password(nova_senha)
        self.session.add(user)
        self.session.commit()
```

- [ ] **Step 4: Endpoint + `/auth/me`** (em `backend/app/api/v1/routers/auth.py`)

Import: `from app.schemas.auth import AlterarSenhaPayload, AuthenticatedUser` e `from app.core.permissions import permissoes_efetivas`.

Novo endpoint após `get_me`:

```python
@router.post("/alterar-senha")
def alterar_senha(
    payload: AlterarSenhaPayload,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    service = AuthService(db)
    service.alterar_senha(current_user, payload.senha_atual, payload.nova_senha)
    return {"ok": True}
```

E em `get_me`, adicionar o campo:

```python
            role=current_user.role.nome,
            ativo=current_user.ativo,
            permissoes=permissoes_efetivas(current_user.role),
```

- [ ] **Step 5: Rodar testes + sanidade**

```powershell
..\venv\Scripts\python.exe -m pytest tests/test_alterar_senha_schema.py -v
..\venv\Scripts\python.exe -c "import app.main"
..\venv\Scripts\python.exe -m pytest tests -q
```

Expected: exit 0 em todos.

- [ ] **Step 6: Commit**

```powershell
git add backend/app/schemas/auth.py backend/app/services/auth_service.py backend/app/api/v1/routers/auth.py backend/tests/test_alterar_senha_schema.py
git commit -m "feat(auth): alterar senha self-service e permissoes no /auth/me"
```

---

### Task 7: Frontend — `usePermissao` + menu por permissão + modal Alterar Senha

**Files:**
- Create: `frontend-observatorio/src/hooks/usePermissao.js`
- Create: `frontend-observatorio/src/hooks/usePermissao.test.js`
- Create: `frontend-observatorio/src/components/AlterarSenhaModal.jsx`
- Modify: `frontend-observatorio/src/app/layouts/DashboardLayout.jsx` (bloco Admin linhas 382-393; barra theme/logout linhas ~454-470)

**Interfaces:**
- Consumes: `user.permissoes` (mapa do `/auth/me`, Task 6 — `AuthContext` já repassa o objeto inteiro, nada a mudar nele).
- Produces (Tasks 8–9 consomem):
  - `hasPermissao(user, area, verbo) -> bool` (pura)
  - `usePermissao(area, verbo) -> bool` (hook)
  - `temPermissaoAdmin(user) -> bool` (pura: ADMIN_GLOBAL ou algum verbo em mandato/usuarios)
  - `<AlterarSenhaModal open onClose />`

- [ ] **Step 1: Teste vitest (falha primeiro)**

Criar `frontend-observatorio/src/hooks/usePermissao.test.js`:

```js
import { describe, expect, it } from "vitest";
import { hasPermissao, temPermissaoAdmin } from "./usePermissao";

describe("hasPermissao", () => {
  it("nega sem usuário", () => {
    expect(hasPermissao(null, "projetos", "criar")).toBe(false);
  });
  it("ADMIN_GLOBAL sempre pode", () => {
    expect(hasPermissao({ role: "ADMIN_GLOBAL" }, "projetos", "excluir")).toBe(true);
  });
  it("verbo presente na área", () => {
    const user = { role: "CUSTOM", permissoes: { captacao: ["criar"] } };
    expect(hasPermissao(user, "captacao", "criar")).toBe(true);
    expect(hasPermissao(user, "captacao", "editar")).toBe(false);
  });
  it("área ausente nega", () => {
    const user = { role: "CUSTOM", permissoes: {} };
    expect(hasPermissao(user, "projetos", "criar")).toBe(false);
  });
  it("sem mapa de permissoes nega", () => {
    expect(hasPermissao({ role: "CUSTOM" }, "projetos", "criar")).toBe(false);
  });
});

describe("temPermissaoAdmin", () => {
  it("global tem", () => {
    expect(temPermissaoAdmin({ role: "ADMIN_GLOBAL" })).toBe(true);
  });
  it("mandato ou usuarios contam", () => {
    expect(temPermissaoAdmin({ role: "C", permissoes: { mandato: ["editar"] } })).toBe(true);
    expect(temPermissaoAdmin({ role: "C", permissoes: { usuarios: ["criar"] } })).toBe(true);
  });
  it("área de conteúdo não conta", () => {
    expect(temPermissaoAdmin({ role: "C", permissoes: { captacao: ["criar"] } })).toBe(false);
  });
  it("sem usuário nega", () => {
    expect(temPermissaoAdmin(null)).toBe(false);
  });
});
```

De `frontend-observatorio/`: `npx vitest run src/hooks/usePermissao.test.js` → FAIL (módulo não existe).

- [ ] **Step 2: Criar `frontend-observatorio/src/hooks/usePermissao.js`**

```js
import { useAuth } from "../context/AuthContext";

// Puras (testáveis): o hook abaixo só injeta o user do contexto.
export function hasPermissao(user, area, verbo) {
  if (!user) return false;
  if (user.role === "ADMIN_GLOBAL") return true;
  return (user.permissoes?.[area] || []).includes(verbo);
}

const AREAS_ADMIN = ["mandato", "usuarios"];

export function temPermissaoAdmin(user) {
  if (!user) return false;
  if (user.role === "ADMIN_GLOBAL") return true;
  return AREAS_ADMIN.some((a) => (user.permissoes?.[a] || []).length > 0);
}

export function usePermissao(area, verbo) {
  const { user } = useAuth();
  return hasPermissao(user, area, verbo);
}
```

Rodar o teste de novo → PASS.

- [ ] **Step 3: Criar `frontend-observatorio/src/components/AlterarSenhaModal.jsx`**

```jsx
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { XMarkIcon } from "@heroicons/react/24/outline";
import api from "../services/api";
import { useToast } from "../context/ToastContext";
import { useEscapeKey } from "../hooks/useEscapeKey";

export default function AlterarSenhaModal({ open, onClose }) {
  const { addToast } = useToast();
  const [senhaAtual, setSenhaAtual] = useState("");
  const [novaSenha, setNovaSenha] = useState("");
  const [confirmar, setConfirmar] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEscapeKey(() => open && onClose());

  function reset() {
    setSenhaAtual("");
    setNovaSenha("");
    setConfirmar("");
    setError(null);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    if (novaSenha.length < 6) {
      setError("A nova senha precisa de pelo menos 6 caracteres.");
      return;
    }
    if (novaSenha !== confirmar) {
      setError("A confirmação não confere com a nova senha.");
      return;
    }
    setSaving(true);
    try {
      await api.post("/auth/alterar-senha", {
        senha_atual: senhaAtual,
        nova_senha: novaSenha,
      });
      addToast("Senha alterada com sucesso.", "success");
      reset();
      onClose();
    } catch (err) {
      setError(err.response?.data?.message || "Não foi possível alterar a senha.");
    } finally {
      setSaving(false);
    }
  }

  const inputCls =
    "w-full px-3 py-2 rounded-lg text-sm outline-none";
  const inputStyle = {
    background: "var(--panel-2)",
    border: "1px solid var(--border)",
    color: "var(--text)",
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.5)" }}
          onClick={onClose}
        >
          <motion.form
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            onClick={(e) => e.stopPropagation()}
            onSubmit={handleSubmit}
            className="w-full max-w-sm rounded-xl p-5 space-y-3"
            style={{ background: "var(--panel)", border: "1px solid var(--border)" }}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold" style={{ color: "var(--text)" }}>
                Alterar senha
              </h2>
              <button type="button" onClick={onClose} aria-label="Fechar">
                <XMarkIcon className="w-4 h-4" style={{ color: "var(--text-dim)" }} />
              </button>
            </div>
            <input
              type="password"
              placeholder="Senha atual"
              value={senhaAtual}
              onChange={(e) => setSenhaAtual(e.target.value)}
              required
              className={inputCls}
              style={inputStyle}
            />
            <input
              type="password"
              placeholder="Nova senha (mín. 6 caracteres)"
              value={novaSenha}
              onChange={(e) => setNovaSenha(e.target.value)}
              required
              className={inputCls}
              style={inputStyle}
            />
            <input
              type="password"
              placeholder="Confirmar nova senha"
              value={confirmar}
              onChange={(e) => setConfirmar(e.target.value)}
              required
              className={inputCls}
              style={inputStyle}
            />
            {error && (
              <p className="text-xs" style={{ color: "var(--danger, #ef4444)" }}>
                {error}
              </p>
            )}
            <button
              type="submit"
              disabled={saving}
              className="w-full py-2 rounded-lg text-sm font-medium cursor-pointer disabled:opacity-60"
              style={{ background: "var(--accent)", color: "#fff" }}
            >
              {saving ? "Salvando..." : "Salvar nova senha"}
            </button>
          </motion.form>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
```

Nota: conferir tokens CSS (`var(--panel)`, `var(--accent)` etc.) contra outro modal existente (ex.: o form de `UsuariosAdminPage.jsx`) e alinhar com o padrão real; a API do `addToast` também (assinatura usada em `UsuariosAdminPage`).

- [ ] **Step 4: `DashboardLayout.jsx` — menu por permissão + botão Alterar senha**

1. Imports novos no topo: `import { temPermissaoAdmin } from "../../hooks/usePermissao";`, `import AlterarSenhaModal from "../../components/AlterarSenhaModal";`, `KeyIcon` no import de heroicons.
2. Estado no componente: `const [senhaOpen, setSenhaOpen] = useState(false);`
3. Trocar a condição do bloco Admin (linha 382):

```jsx
        {temPermissaoAdmin(user) && (
```

4. Na barra de theme/logout (linhas ~455-470), adicionar o botão entre `ThemePicker` e o logout, com o mesmo estilo do botão de logout:

```jsx
              <button
                onClick={() => setSenhaOpen(true)}
                className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs cursor-pointer"
                style={{
                  background: "var(--panel-2)",
                  border: "1px solid var(--border)",
                  color: "var(--text-dim)",
                }}
                title="Alterar senha"
              >
                <KeyIcon className="w-4 h-4" />
              </button>
```

5. Renderizar o modal antes do fechamento do componente raiz:

```jsx
      <AlterarSenhaModal open={senhaOpen} onClose={() => setSenhaOpen(false)} />
```

- [ ] **Step 5: Build + testes**

De `frontend-observatorio/`:

```powershell
npx vitest run src/hooks/usePermissao.test.js
npm run build
```

Expected: testes PASS; build exit 0.

- [ ] **Step 6: Commit**

```powershell
git add frontend-observatorio/src/hooks/usePermissao.js frontend-observatorio/src/hooks/usePermissao.test.js frontend-observatorio/src/components/AlterarSenhaModal.jsx frontend-observatorio/src/app/layouts/DashboardLayout.jsx
git commit -m "feat(front): usePermissao, menu admin por permissao e modal alterar senha"
```

---

### Task 8: Frontend — gating por verbo nas telas de conteúdo

**Files:**
- Modify: `frontend-observatorio/src/pages/desenvolvimento-economico/CaptacaoTab.jsx` (linhas 60-61 + usos)
- Modify: `frontend-observatorio/src/pages/desenvolvimento-economico/FunilTab.jsx` (linhas 51-52 + usos)
- Modify: `frontend-observatorio/src/pages/desenvolvimento-economico/EscritaTab.jsx` (linhas 49-50 + usos)
- Modify: `frontend-observatorio/src/pages/desenvolvimento-economico/PremiacoesTab.jsx`
- Modify: `frontend-observatorio/src/pages/desenvolvimento-economico/RetencaoTab.jsx`
- Modify: `frontend-observatorio/src/pages/projetos/AcompanhamentoTab.jsx`
- Modify: `frontend-observatorio/src/pages/dados-internos/IndicadoresInternosPage.jsx` (linha 142 + usos)
- Modify: `frontend-observatorio/src/pages/dados-internos/PlanoGovPage.jsx` (linha 36 + usos)
- Modify: `frontend-observatorio/src/pages/dados-internos/CalendarioPage.jsx` (linha 117 + usos)
- Modify: `frontend-observatorio/src/pages/admin/MandatoAdminPage.jsx`
- Modify: `frontend-observatorio/src/components/CriarOportunidadeCaptacao.jsx` (linha 20)

**Interfaces:**
- Consumes: `usePermissao`/`hasPermissao` (Task 7).
- Produces: nada novo — telas passam a respeitar criar/editar/excluir.

- [ ] **Step 1: Padrão de substituição**

Em cada arquivo, substituir a declaração `canEdit` por três flags. Exemplo concreto — `CaptacaoTab.jsx` linhas 60-61:

```jsx
  const isGlobal = user?.role === "ADMIN_GLOBAL";
  // ADMIN_GLOBAL não cria aqui: o registro nasce no município do usuário.
  const canCriar = usePermissao("captacao", "criar") && !isGlobal;
  const canEditar = usePermissao("captacao", "editar");
  const canExcluir = usePermissao("captacao", "excluir");
```

(Import: `import { usePermissao } from "../../hooks/usePermissao";`.)

Mapa de área por arquivo e regra do `!isGlobal` no `canCriar`:

| Arquivo | Área | `canCriar` exclui global? |
|---|---|---|
| CaptacaoTab | `captacao` | Sim (backend bloqueia criar sem município) |
| FunilTab | `funil` | Sim |
| EscritaTab | `escrita` | Sim |
| PremiacoesTab | `premiacoes` | Sim |
| RetencaoTab | `retencao` | Sim |
| AcompanhamentoTab (projetos) | `projetos` | Sim |
| IndicadoresInternosPage | `dados_internos` | Não (global cria via view-as, backend aceita) |
| PlanoGovPage | `dados_internos` | Não |
| CalendarioPage | `dados_internos` | Não |
| MandatoAdminPage | `mandato` | Não (global passa municipio_id explícito) |

- [ ] **Step 2: Reatribuir cada uso de `canEdit`**

Regra por tipo de elemento (aplicar em TODOS os usos de cada arquivo — buscar `canEdit` no arquivo):

- Botão "Novo/Nova ..." e dica de empty-state ("Clique em ... para começar") → `canCriar`
- Lápis/abrir modal de edição e `<select>` de status/estágio → `canEditar`
- Lixeira/confirmação de exclusão → `canExcluir`
- Formulário do modal: submit de criação → `canCriar`; submit de edição → `canEditar` (se o modal for compartilhado, `editingId ? canEditar : canCriar`)
- Onde `canEdit` era passado como prop (ex.: `IndCell canEdit={...}` em IndicadoresInternosPage:398), passar as flags específicas que o componente filho usa (`canEditar`/`canExcluir`) e ajustar o filho.

Observação: nos arquivos de dados internos e Mandato a declaração atual é `user?.role === "ADMIN_GLOBAL" || user?.role === "ADMIN_MUNICIPIO"`; em AcompanhamentoTab é `ADMIN_MUNICIPIO || ADMIN_GLOBAL`; nos tabs de desenvolvimento econômico é só `ADMIN_MUNICIPIO`. Todas viram o padrão acima.

- [ ] **Step 3: `CriarOportunidadeCaptacao.jsx` (linha 20)**

```jsx
  if (!hasPermissao(user, "captacao", "criar") || user?.role === "ADMIN_GLOBAL" || !canAccess("desenvolvimento_economico.captacao")) return null;
```

(Import `hasPermissao` de `../hooks/usePermissao`; remover a comparação com `ADMIN_MUNICIPIO`.)

- [ ] **Step 4: Build**

De `frontend-observatorio/`: `npm run build` → exit 0.

- [ ] **Step 5: Commit**

```powershell
git add frontend-observatorio/src/pages frontend-observatorio/src/components/CriarOportunidadeCaptacao.jsx
git commit -m "feat(front): gating criar/editar/excluir por permissao nas telas de conteudo"
```

---

### Task 9: Frontend — RolesAdminPage, UsuariosAdminPage com roles dinâmicas e guards de rota

**Files:**
- Create: `frontend-observatorio/src/pages/admin/RolesAdminPage.jsx`
- Modify: `frontend-observatorio/src/pages/admin/UsuariosAdminPage.jsx` (remover `ROLES` hardcoded, linhas 20-26)
- Modify: `frontend-observatorio/src/app/router/AppRouter.jsx` (guards linhas 59-73; rotas /admin linhas 128-186)
- Modify: `frontend-observatorio/src/app/layouts/AdminLayout.jsx` (nav global ~linha 126; bloco non-global linhas 263-266; PAGE_TITLES ~linha 35)

**Interfaces:**
- Consumes: `GET/POST/PUT/DELETE /roles` (Task 4), `temPermissaoAdmin`/`hasPermissao` (Task 7), `AREA_LABELS` espelhado localmente.
- Produces: rota `/admin/roles` (ADMIN_GLOBAL); `/admin/mandato` e `/admin/usuarios` acessíveis por permissão.

- [ ] **Step 1: Criar `frontend-observatorio/src/pages/admin/RolesAdminPage.jsx`**

```jsx
import { useEffect, useState, useCallback } from "react";
import api from "../../services/api";
import { useToast } from "../../context/ToastContext";
import { useEscapeKey } from "../../hooks/useEscapeKey";
import MunicipioPicker from "../../components/nid/MunicipioPicker";
import { motion, AnimatePresence } from "framer-motion";
import { PlusIcon, XMarkIcon, PencilIcon, TrashIcon, LockClosedIcon } from "@heroicons/react/24/outline";

// Espelho de app.core.permissions.AREA_LABELS/VERBOS (backend valida de verdade).
const AREAS = [
  ["projetos", "Projetos"],
  ["captacao", "Captação de Recursos"],
  ["funil", "Funil de Investimentos"],
  ["escrita", "Escrita de Projetos"],
  ["premiacoes", "Premiações"],
  ["retencao", "Retenção & Expansão"],
  ["dados_internos", "Dados Internos"],
  ["mandato", "Timeline do Mandato"],
  ["usuarios", "Usuários do Município"],
];
const VERBOS = ["criar", "editar", "excluir"];

const emptyForm = { nome: "", descricao: "", municipio_id: "", permissoes: {} };

export default function RolesAdminPage() {
  const { addToast } = useToast();
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);

  useEscapeKey(useCallback(() => {
    if (deleteConfirmId) { setDeleteConfirmId(null); return; }
    if (showForm) closeForm();
  }, [deleteConfirmId, showForm]));

  function load() {
    return api
      .get("/roles")
      .then((res) => setRoles(res.data || []))
      .catch(() => addToast("Erro ao carregar roles.", "error"));
  }

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, []);

  function openCreate() {
    setEditingId(null);
    setForm(emptyForm);
    setFormError(null);
    setShowForm(true);
  }

  function openEdit(r) {
    setEditingId(r.id);
    setForm({
      nome: r.nome,
      descricao: r.descricao || "",
      municipio_id: r.municipio_id ?? "",
      permissoes: r.permissoes || {},
    });
    setFormError(null);
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditingId(null);
    setForm(emptyForm);
    setFormError(null);
  }

  function toggleVerbo(area, verbo) {
    setForm((prev) => {
      const atuais = prev.permissoes[area] || [];
      const novos = atuais.includes(verbo)
        ? atuais.filter((v) => v !== verbo)
        : [...atuais, verbo];
      const permissoes = { ...prev.permissoes };
      if (novos.length) permissoes[area] = novos;
      else delete permissoes[area];
      return { ...prev, permissoes };
    });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setFormError(null);
    const payload = {
      nome: form.nome,
      descricao: form.descricao || null,
      municipio_id: form.municipio_id === "" ? null : Number(form.municipio_id),
      permissoes: form.permissoes,
    };
    try {
      if (editingId) await api.put(`/roles/${editingId}`, payload);
      else await api.post("/roles", payload);
      addToast(editingId ? "Role atualizada." : "Role criada.", "success");
      closeForm();
      load();
    } catch (err) {
      setFormError(err.response?.data?.message || "Erro ao salvar a role.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id) {
    try {
      await api.delete(`/roles/${id}`);
      addToast("Role excluída.", "success");
      setDeleteConfirmId(null);
      load();
    } catch (err) {
      addToast(err.response?.data?.message || "Erro ao excluir.", "error");
      setDeleteConfirmId(null);
    }
  }

  if (loading) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm" style={{ color: "var(--text-dim)" }}>
          Roles definem o que usuários de município podem criar, editar e excluir.
          ADMIN_GLOBAL ignora roles (acesso total).
        </p>
        <button
          onClick={openCreate}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium cursor-pointer"
          style={{ background: "var(--accent)", color: "#fff" }}
        >
          <PlusIcon className="w-4 h-4" /> Nova role
        </button>
      </div>

      <div className="grid gap-3">
        {roles.map((r) => (
          <div
            key={r.id}
            className="flex items-center justify-between rounded-xl px-4 py-3"
            style={{ background: "var(--panel)", border: "1px solid var(--border)" }}
          >
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold" style={{ color: "var(--text)" }}>
                  {r.nome}
                </span>
                {r.builtin && <LockClosedIcon className="w-3.5 h-3.5" style={{ color: "var(--text-dim)" }} title="Role do sistema" />}
                <span
                  className="text-[10px] px-1.5 py-0.5 rounded"
                  style={{ background: "var(--panel-2)", color: "var(--text-dim)" }}
                >
                  {r.municipio_id ? "Município" : "Global"}
                </span>
                <span className="text-[10px]" style={{ color: "var(--text-dim)" }}>
                  {r.usuarios_count} usuário(s)
                </span>
              </div>
              <p className="text-xs truncate" style={{ color: "var(--text-dim)" }}>
                {r.builtin && r.nome === "ADMIN_GLOBAL"
                  ? "Acesso total à plataforma"
                  : Object.entries(r.permissoes || {})
                      .map(([a, vs]) => `${a}: ${vs.join("/")}`)
                      .join(" · ") || "Somente leitura"}
              </p>
            </div>
            {!r.builtin && (
              <div className="flex items-center gap-2 flex-shrink-0">
                <button onClick={() => openEdit(r)} title="Editar" className="cursor-pointer">
                  <PencilIcon className="w-4 h-4" style={{ color: "var(--text-dim)" }} />
                </button>
                {deleteConfirmId === r.id ? (
                  <button
                    onClick={() => handleDelete(r.id)}
                    className="text-xs px-2 py-1 rounded cursor-pointer"
                    style={{ background: "var(--danger, #ef4444)", color: "#fff" }}
                  >
                    Confirmar
                  </button>
                ) : (
                  <button onClick={() => setDeleteConfirmId(r.id)} title="Excluir" className="cursor-pointer">
                    <TrashIcon className="w-4 h-4" style={{ color: "var(--danger, #ef4444)" }} />
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      <AnimatePresence>
        {showForm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto"
            style={{ background: "rgba(0,0,0,0.5)" }}
            onClick={closeForm}
          >
            <motion.form
              initial={{ scale: 0.97, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.97, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              onSubmit={handleSubmit}
              className="w-full max-w-2xl rounded-xl p-5 space-y-4 my-8"
              style={{ background: "var(--panel)", border: "1px solid var(--border)" }}
            >
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold" style={{ color: "var(--text)" }}>
                  {editingId ? "Editar role" : "Nova role"}
                </h2>
                <button type="button" onClick={closeForm} aria-label="Fechar">
                  <XMarkIcon className="w-4 h-4" style={{ color: "var(--text-dim)" }} />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <input
                  placeholder="Nome (ex.: Assessor de Captação)"
                  value={form.nome}
                  onChange={(e) => setForm((p) => ({ ...p, nome: e.target.value }))}
                  required
                  className="px-3 py-2 rounded-lg text-sm outline-none col-span-2"
                  style={{ background: "var(--panel-2)", border: "1px solid var(--border)", color: "var(--text)" }}
                />
                <input
                  placeholder="Descrição (opcional)"
                  value={form.descricao}
                  onChange={(e) => setForm((p) => ({ ...p, descricao: e.target.value }))}
                  className="px-3 py-2 rounded-lg text-sm outline-none col-span-2"
                  style={{ background: "var(--panel-2)", border: "1px solid var(--border)", color: "var(--text)" }}
                />
                <div className="col-span-2">
                  <label className="text-xs block mb-1" style={{ color: "var(--text-dim)" }}>
                    Escopo — vazio = global (qualquer município)
                  </label>
                  <MunicipioPicker
                    value={form.municipio_id}
                    onChange={(id) => setForm((p) => ({ ...p, municipio_id: id ?? "" }))}
                  />
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr style={{ color: "var(--text-dim)" }}>
                      <th className="text-left py-1.5">Área</th>
                      {VERBOS.map((v) => (
                        <th key={v} className="text-center py-1.5 capitalize">{v}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {AREAS.map(([area, label]) => (
                      <tr key={area} style={{ borderTop: "1px solid var(--border)" }}>
                        <td className="py-1.5" style={{ color: "var(--text)" }}>{label}</td>
                        {VERBOS.map((verbo) => (
                          <td key={verbo} className="text-center py-1.5">
                            <input
                              type="checkbox"
                              checked={(form.permissoes[area] || []).includes(verbo)}
                              onChange={() => toggleVerbo(area, verbo)}
                              className="cursor-pointer"
                            />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {formError && (
                <p className="text-xs" style={{ color: "var(--danger, #ef4444)" }}>{formError}</p>
              )}

              <button
                type="submit"
                disabled={saving}
                className="w-full py-2 rounded-lg text-sm font-medium cursor-pointer disabled:opacity-60"
                style={{ background: "var(--accent)", color: "#fff" }}
              >
                {saving ? "Salvando..." : editingId ? "Salvar alterações" : "Criar role"}
              </button>
            </motion.form>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
```

Nota: conferir a prop API real do `MunicipioPicker` (usado em `UsuariosAdminPage.jsx`) e adaptar `value/onChange` ao contrato verdadeiro.

- [ ] **Step 2: `UsuariosAdminPage.jsx` — roles dinâmicas**

1. Remover o array `ROLES` hardcoded (linhas 20-24).
2. Estado novo: `const [roles, setRoles] = useState([]);` e, no `useEffect` inicial (linha 55-60), acrescentar o fetch (só global chega aqui hoje; ver passo de guards):

```jsx
  const isGlobal = currentUser?.role === "ADMIN_GLOBAL";

  useEffect(() => {
    const reqs = [loadUsuarios(), api.get("/municipios")];
    if (isGlobal) reqs.push(api.get("/roles"));
    Promise.all(reqs)
      .then(([, munRes, rolesRes]) => {
        setMunicipios(munRes.data || []);
        if (rolesRes) setRoles(rolesRes.data || []);
      })
      .catch((err) => console.error("Erro ao carregar usuários:", err))
      .finally(() => setLoading(false));
  }, []);
```

3. `defaultForm` (linha 26): trocar `role_id: 3` por `role_id: ""` e, ao abrir criação, se `roles` carregado, default para a VISUALIZADOR: `role_id: roles.find((r) => r.nome === "VISUALIZADOR")?.id ?? ""`.
4. `openEdit` (linha 104): `role_id: roles.find((r) => r.nome === u.role)?.id ?? ""`.
5. No `<select>` de role do formulário, gerar as opções filtradas pelo município selecionado no form:

```jsx
  const rolesDisponiveis = roles.filter(
    (r) => r.municipio_id == null || String(r.municipio_id) === String(form.municipio_id)
  );
```

e mapear `rolesDisponiveis` em `<option value={r.id}>{r.nome}</option>`.
6. Se o usuário logado NÃO é global (delegado com permissão `usuarios`): esconder o `<select>` de role e o `MunicipioPicker` no formulário (backend fixa VISUALIZADOR + município do ator) e esconder botões de editar/excluir em linhas cujo `role === "ADMIN_GLOBAL"`. No `handleSubmit`, quando não-global, **omitir** `role_id` e `municipio_id` do payload (não enviar `""` — `Optional[int]` rejeita string vazia).

- [ ] **Step 3: `AppRouter.jsx` — guards por permissão**

Substituir `AdminMunicipioRoute` (linhas 67-73) e adicionar `PermissaoRoute`:

```jsx
import { hasPermissao, temPermissaoAdmin } from "../../hooks/usePermissao";

function AdminAreaRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" />;
  if (!temPermissaoAdmin(user)) return <Navigate to="/app" />;
  return children;
}

function PermissaoRoute({ area, children }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" />;
  const ok =
    user.role === "ADMIN_GLOBAL" ||
    ["criar", "editar", "excluir"].some((v) => hasPermissao(user, area, v));
  if (!ok) return <Navigate to="/app" />;
  return children;
}

function AdminIndexRedirect() {
  const { user } = useAuth();
  if (user?.role === "ADMIN_GLOBAL") return <Navigate to="/admin/municipios" replace />;
  if (["criar", "editar", "excluir"].some((v) => hasPermissao(user, "mandato", v)))
    return <Navigate to="/admin/mandato" replace />;
  return <Navigate to="/admin/usuarios" replace />;
}
```

E nas rotas:
- `/admin` wrapper: `<AdminAreaRoute><AdminLayout /></AdminAreaRoute>` (era `AdminMunicipioRoute`).
- `<Route index element={<AdminIndexRedirect />} />` (era `Navigate to="/admin/municipios"`).
- `<Route path="mandato" element={<PermissaoRoute area="mandato"><MandatoAdminPage /></PermissaoRoute>} />` (era sem guard).
- `<Route path="usuarios" element={<PermissaoRoute area="usuarios"><UsuariosAdminPage /></PermissaoRoute>} />` (era `AdminRoute`).
- Nova rota: `<Route path="roles" element={<AdminRoute><RolesAdminPage /></AdminRoute>} />` + import da página.
- Demais rotas `/admin/*` continuam com `AdminRoute` (ADMIN_GLOBAL).

- [ ] **Step 4: `AdminLayout.jsx`**

1. `PAGE_TITLES` (~linha 35): adicionar `"/admin/roles": "Roles e Permissões"`.
2. Nav global (~linha 126, junto de Usuários): adicionar `{ to: "/admin/roles", label: "Roles", icon: KeyIcon }` (import `KeyIcon`).
3. Bloco non-global (linhas 263-266): trocar o item fixo de mandato por itens por permissão:

```jsx
        {!isGlobal && (
          <div>
            {renderNavItems([
              ...(["criar", "editar", "excluir"].some((v) => hasPermissao(user, "mandato", v))
                ? [{ to: "/admin/mandato", label: "Timeline do Mandato", icon: FlagIcon }]
                : []),
              ...(["criar", "editar", "excluir"].some((v) => hasPermissao(user, "usuarios", v))
                ? [{ to: "/admin/usuarios", label: "Usuários", icon: UsersIcon }]
                : []),
            ])}
          </div>
        )}
```

(Import `hasPermissao` de `../../hooks/usePermissao`; conferir o wrapper JSX real do bloco existente e preservá-lo.)

- [ ] **Step 5: Build**

De `frontend-observatorio/`: `npm run build` → exit 0.

- [ ] **Step 6: Commit**

```powershell
git add frontend-observatorio/src/pages/admin/RolesAdminPage.jsx frontend-observatorio/src/pages/admin/UsuariosAdminPage.jsx frontend-observatorio/src/app/router/AppRouter.jsx frontend-observatorio/src/app/layouts/AdminLayout.jsx
git commit -m "feat(front): pagina de roles, usuarios com roles dinamicas e guards por permissao"
```

---

### Task 10: Verificação final

**Files:** nenhum novo (correções pontuais se a verificação falhar).

- [ ] **Step 1: Suite backend completa**

De `backend/`:

```powershell
..\venv\Scripts\python.exe -m pytest tests -q
```

Expected: exit 0. (NÃO rodar junto com `tests/` da raiz — coleta combinada colide; `tests/` da raiz tem 13 falhas pré-existentes que não são gate.)

- [ ] **Step 2: Testes + build frontend**

De `frontend-observatorio/`:

```powershell
npx vitest run
npm run build
```

Expected: exit 0 nos dois.

- [ ] **Step 3: E2E manual contra a Railway** (subir backend de `backend/` com uvicorn + `npm run dev`)

Checklist:

1. Logar como ADMIN_GLOBAL (igor.cardoso@uaizi.com) → `/admin/roles` visível; criar role global "Assessor de Captação" com `captacao: criar/editar` apenas.
2. Em `/admin/usuarios`, criar usuário de teste em Divinópolis com essa role.
3. Logar com o usuário de teste:
   - Kanban de Captação: botão "Nova Oportunidade" e lápis visíveis; lixeira AUSENTE; criar e editar um card funciona.
   - Kanban de Projetos/Funil/Escrita/Premiações: somente leitura (sem botões).
   - Side menu SEM "Painel admin"; botão de chave (Alterar senha) presente.
   - Alterar senha com senha atual errada → erro; com correta → sucesso; relogar com a nova.
4. De volta como ADMIN_GLOBAL: dar `mandato: editar` à role → relogar teste → "Painel admin" aparece só com Timeline do Mandato.
5. Tentar excluir a role em uso → erro 409 com mensagem amigável.
6. Editar role builtin (ADMIN_MUNICIPIO) → sem controles de edição na UI; `PUT /roles/{id}` direto → 400.
7. Usuário ADMIN_MUNICIPIO existente: comportamento idêntico ao anterior (tudo editável no seu município, painel admin visível).

- [ ] **Step 4: Commit de eventuais correções + atualização do ledger**

Registrar no `.superpowers/sdd/progress.md` os fix-later aceitos (se houver) e commitar.
