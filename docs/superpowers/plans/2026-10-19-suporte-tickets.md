# Suporte com formulário de atendimento (tickets) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O botão "Falar com o suporte" passa a oferecer "Abrir solicitação", "Meus atendimentos" e "WhatsApp"; tickets ficam no banco e o ADMIN_GLOBAL os trata numa tela nova `/admin/suporte` com KPIs, lista, detalhe com contatos, status e anotações internas.

**Architecture:** Duas tabelas novas (`suporte_tickets` com snapshots do solicitante, `suporte_ticket_eventos` append-only). Um router `/suporte` com lado do usuário (`POST /tickets`, `GET /tickets/meus`) e lado admin (`/admin/kpis`, `/admin/tickets`, `/{id}`, `/{id}/status`, `/{id}/anotacoes`) gated por `require_role("ADMIN_GLOBAL")`, com trilha `AcaoAudit` de leitura e de ação. Frontend: pasta `components/suporte/` (botão com menu, dois modais, chip de status, helper de erro) e `pages/admin/SuporteAdminPage.jsx` + `SuporteTicketDetalhe.jsx`. Resposta ao usuário acontece fora da plataforma (mailto / wa.me).

**Tech Stack:** FastAPI + SQLAlchemy 2 + Alembic + Pydantic v2 + slowapi 0.1.9 (sem dependência nova); React 19 + Tailwind 3.4 + framer-motion + Heroicons v2 + Vitest 2 + jsdom + @testing-library/react (sem dependência nova).

**Spec:** `docs/superpowers/specs/2026-10-19-suporte-tickets-design.md`

## Global Constraints

- Branch de trabalho: `feat/suporte-tickets` (criar de `main` no início). Repo `C:\Users\lucas\Documents\projetos\dashboard_prefeituras`. Backend: rodar testes de `backend/` com `../venv/Scripts/python -m pytest tests/<arquivo> -v` (o `pytest.ini` já aponta `pythonpath = .`). Frontend: de `frontend-observatorio/`, `npx vitest run <caminho>` e `npx eslint <arquivos>`.
- Testes backend não abrem Postgres: SQLite em memória com `Base.metadata.create_all(engine, tables=[...])` e handlers chamados direto (molde `tests/test_cidade_inteligente_endpoints.py`). Handlers decorados com `@limiter.limit` exigem `monkeypatch.setattr(limiter, "enabled", False)` e um `_FakeRequest` (`headers = {"user-agent": "pytest"}`, `client = SimpleNamespace(host="10.0.0.1")`).
- Python: aspas ASCII retas; SQLAlchemy ORM (sem SQL cru); toda mudança de schema via Alembic; migração `0045_suporte_tickets` com `down_revision = "0044_usuario_mfa_email"`.
- Status válidos: `aberto`, `em_atendimento`, `resolvido`. Canais: `email`, `whatsapp`. Mensagem: 10 a 4000 caracteres após `strip`. Anotação: 1 a 2000. WhatsApp armazenado só com dígitos e **sempre com DDI 55** (12 ou 13 dígitos).
- Ações de auditoria (`AcaoAudit.acao`): `suporte_tickets_listados`, `suporte_ticket_consultado` (categoria `leitura`); `suporte_ticket_status`, `suporte_ticket_anotacao` (categoria `acao`). `detalhe` nunca carrega o texto da anotação nem a mensagem do usuário.
- Filtro de município na lista admin chama-se `municipio_filtro` (nunca `municipio_id`: o interceptor do Axios injeta `municipio_id` do view-as em todo GET).
- Paginação admin: `PaginatedResponse[...]` de `app/api/pagination.py` (`items, total, skip, limit`), `limit` clampado a `[1, 100]`, `skip` a `>= 0`.
- Rate limit `5/hour` por usuário em `POST /suporte/tickets` via `key_func=chave_por_usuario` (chave `user:{sub}`; sem token válido, IP).
- Erros no front: o interceptor de `src/services/api.js` normaliza `{error:{message}}` para `detail`; 422 do Pydantic chega como lista em `detail` com prefixo `"Value error, "`; 429 do slowapi chega como `{ "error": "..." }` **sem** normalização (string, não objeto).
- Copy em português; estilos via variáveis do tema (`--panel`, `--panel-2`, `--border`, `--text`, `--text-dim`, `--text-mute`, `--accent-N`); alturas responsivas `h-XX md:h-XX`; sem `??=`/`||=`.
- Commits em ASCII (sem acento), `tipo(escopo): descricao`, **sem** linha `Co-Authored-By` (pedido do usuário). Nunca stage `.claude/settings.local.json`, `node_modules/`, `dados/`, nem a alteração pré-existente e não relacionada em `docs/email.md`.
- Em testes backend que consultam `AcaoAudit`, sempre `.order_by(AcaoAudit.id)` antes de indexar.
- Listas responsivas no front: **uma única árvore DOM** que reflui por CSS (`grid-cols-1 md:grid-cols-[...]`), nunca duas cópias (`hidden md:block` + `md:hidden`): o jsdom não aplica Tailwind e `getByText` quebraria com duplicatas.
- Fora do escopo (não implementar): e-mails de aviso, resposta na plataforma, anexos, categorias, exclusão/purga de tickets, números fora do Brasil.

## Review Focus

Entradas que a spec implica, mas que nenhum teste da primeira passada cobria; cada uma ganhou um teste na task dona do código:

1. ADMIN_GLOBAL abrindo ticket (sem município): `municipio_id`/`municipio_nome` nulos não podem quebrar criação, lista nem detalhe. → Task 4 (`test_admin_global_abre_ticket_sem_municipio`) e Task 12 (linha com "—").
2. Ticket cujo usuário foi excluído (`usuario_id` NULL): detalhe e auditoria usam o snapshot de e-mail. → Task 5 (`test_detalhe_de_ticket_com_usuario_excluido_usa_snapshot`).
3. WhatsApp com prefixo de operadora/zero à esquerda ou DDI estrangeiro (`0 37 99999-9999`, `+1 415 555 0100`): deve ser 422, nunca salvo como está. → Task 2 (`test_whatsapp_invalido_rejeita`).
4. `limit=1000` ou `skip=-5` na lista admin: clamp em vez de erro ou dump da tabela. → Task 5 (`test_lista_clampa_skip_e_limit`).
5. 429 do slowapi com corpo `{ "error": "Rate limit exceeded: 5 per 1 hour" }` (string, não `detail`): o modal mostra texto amigável, não `undefined`. → Task 7 (`erroApi.test.js`) e Task 9 (teste do modal com 429).

---

## Mapa de arquivos

Backend
- Create: `backend/app/models/suporte.py` — `SuporteTicket`, `SuporteTicketEvento`
- Create: `backend/alembic/versions/0045_suporte_tickets.py`
- Create: `backend/app/schemas/suporte.py` — schemas + `normalizar_whatsapp`
- Create: `backend/app/api/v1/routers/suporte.py` — router `/suporte`
- Modify: `backend/app/models/__init__.py` (import + `__all__`)
- Modify: `backend/app/core/rate_limit.py` (+ `chave_por_usuario`)
- Modify: `backend/app/main.py` (import + `include_router`)
- Test: `backend/tests/test_suporte_models.py`, `test_suporte_schemas.py`, `test_rate_limit_chave.py`, `test_suporte_endpoints.py`

Frontend
- Create: `frontend-observatorio/src/components/suporte/SuporteButton.jsx` (substitui `components/SuporteWhatsAppButton.jsx`)
- Create: `.../components/suporte/SuporteTicketModal.jsx`, `SuporteMeusTicketsModal.jsx`, `StatusChip.jsx`, `statusTicket.js`, `erroApi.js` (+ testes ao lado)
- Create: `.../pages/admin/SuporteAdminPage.jsx`, `SuporteTicketDetalhe.jsx` (+ testes)
- Modify: `.../src/config/contato.js` (+ `linkWhatsAppPara`), `app/layouts/DashboardLayout.jsx`, `app/layouts/AdminLayout.jsx`, `app/router/AppRouter.jsx`
- Delete: `components/SuporteWhatsAppButton.jsx`, `components/SuporteWhatsAppButton.test.jsx`

Docs
- Modify: `docs/lgpd.md` (seções 2 e 4), `AGENTS.md` (seção nova "Suporte (tickets)")

---

### Task 1: Modelos + migração

**Files:**
- Create: `backend/app/models/suporte.py`
- Create: `backend/alembic/versions/0045_suporte_tickets.py`
- Modify: `backend/app/models/__init__.py`
- Test: `backend/tests/test_suporte_models.py`

**Interfaces:**
- Produces: `SuporteTicket` (tabela `suporte_tickets`) e `SuporteTicketEvento` (tabela `suporte_ticket_eventos`) com os campos da spec; `SuporteTicket.eventos` (relationship, `order_by="SuporteTicketEvento.id"`, `cascade="all, delete-orphan"`, `passive_deletes=True`); `SuporteTicketEvento.ticket` (back_populates).

- [ ] **Step 1: Criar a branch e commitar spec, plano e backlog**

```bash
git checkout -b feat/suporte-tickets main
git add docs/superpowers/specs/2026-10-19-suporte-tickets-design.md docs/superpowers/plans/2026-10-19-suporte-tickets.md IDEAS.md
git commit -m "docs(suporte): spec e plano dos tickets de atendimento; e-mails do suporte no backlog"
```

- [ ] **Step 2: Escrever o teste que falha**

`backend/tests/test_suporte_models.py`:

```python
"""Modelos de suporte: defaults, relacionamento e cascade dos eventos."""
import pytest
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker

import app.models  # noqa: F401
from app.db.base import Base
from app.models.municipio import Municipio
from app.models.role import Role
from app.models.suporte import SuporteTicket, SuporteTicketEvento
from app.models.usuario import Usuario


@pytest.fixture()
def db():
    engine = create_engine("sqlite://")

    @event.listens_for(engine, "connect")
    def _fk_on(dbapi_conn, _record):
        dbapi_conn.execute("PRAGMA foreign_keys=ON")

    Base.metadata.create_all(engine, tables=[
        Municipio.__table__, Role.__table__, Usuario.__table__,
        SuporteTicket.__table__, SuporteTicketEvento.__table__,
    ])
    s = sessionmaker(bind=engine)()
    yield s
    s.close()


def _ticket(**kw):
    base = dict(usuario_nome="Ana", usuario_email="ana@x.com", usuario_role="VISUALIZADOR",
                mensagem="Nao consigo exportar o grafico do PIB.", canal_preferido="email")
    base.update(kw)
    return SuporteTicket(**base)


def test_defaults_status_aberto_e_timestamps(db):
    t = _ticket()
    db.add(t)
    db.commit()
    db.refresh(t)
    assert t.status == "aberto"
    assert t.criado_em is not None and t.atualizado_em is not None
    assert t.primeiro_contato_em is None and t.resolvido_em is None
    assert t.whatsapp is None and t.municipio_id is None


def test_eventos_ordenados_por_id_e_cascade_no_delete(db):
    t = _ticket()
    t.eventos.append(SuporteTicketEvento(tipo="abertura", autor_email="ana@x.com"))
    t.eventos.append(SuporteTicketEvento(tipo="anotacao", texto="liguei", autor_email="adm@x.com"))
    db.add(t)
    db.commit()
    assert [e.tipo for e in t.eventos] == ["abertura", "anotacao"]
    db.delete(t)
    db.commit()
    assert db.query(SuporteTicketEvento).count() == 0


def test_migracao_0045_encadeia_na_0044():
    # Le o arquivo: `alembic/` local colide com o pacote instalado, nao da para importar.
    import pathlib
    import re
    src = pathlib.Path(__file__).resolve().parents[1] / "alembic" / "versions" / "0045_suporte_tickets.py"
    texto = src.read_text(encoding="utf-8")
    assert re.search(r'^revision\s*=\s*"0045_suporte_tickets"', texto, re.M)
    assert re.search(r'^down_revision\s*=\s*"0044_usuario_mfa_email"', texto, re.M)
```

- [ ] **Step 3: Rodar e ver falhar**

Run (de `backend/`): `../venv/Scripts/python -m pytest tests/test_suporte_models.py -v`
Expected: FAIL com `ModuleNotFoundError: No module named 'app.models.suporte'`

- [ ] **Step 4: Implementar `backend/app/models/suporte.py`**

Dois modelos `Base` com os campos exatos da seção "Modelo de dados" da spec. Pinos: `__tablename__ = "suporte_tickets"` / `"suporte_ticket_eventos"`; FKs de usuário/município com `ondelete="SET NULL"`; `ticket_id` com `ondelete="CASCADE"`; `status` `String(20), nullable=False, default="aberto", index=True`; `canal_preferido` `String(10), nullable=False, default="email"`; `criado_em` `DateTime(timezone=True), server_default=func.now(), nullable=False, index=True`; `atualizado_em` igual + `onupdate=func.now()`; `primeiro_contato_em`, `resolvido_em` `DateTime(timezone=True), nullable=True`; índices em `usuario_id`, `municipio_id`, `status`, `criado_em`, `ticket_id`. Relationships: `eventos` conforme o bloco Interfaces e `usuario = relationship("Usuario")` (sem `back_populates`; serve ao `alvo` da auditoria na Task 5). Docstring curta citando a spec.

- [ ] **Step 5: Registrar em `backend/app/models/__init__.py`**

Adicionar `from app.models.suporte import SuporteTicket, SuporteTicketEvento` ao bloco de imports e os dois nomes ao `__all__`.

- [ ] **Step 6: Criar a migração `backend/alembic/versions/0045_suporte_tickets.py`**

Cabeçalho no molde de `0044_usuario_mfa_email.py` (docstring com propósito e referência "Spec 2026-10-19-suporte-tickets, seção Modelo de dados"; `revision = "0045_suporte_tickets"`, `down_revision = "0044_usuario_mfa_email"`). `upgrade()` cria `suporte_tickets` e `suporte_ticket_eventos` com `op.create_table` + `op.create_index` espelhando o modelo (tipos, nullability, `server_default=sa.text("now()")`, FKs com `ondelete`). `downgrade()` dropa índices e tabelas na ordem inversa.

- [ ] **Step 7: Rodar e ver passar**

Run: `../venv/Scripts/python -m pytest tests/test_suporte_models.py -v`
Expected: 3 passed

- [ ] **Step 8: Conferir que a migração compila e é head única**

Run (de `backend/`): `../venv/Scripts/python -m py_compile alembic/versions/0045_suporte_tickets.py` e, em seguida:

```bash
../venv/Scripts/python -c "import re,glob;revs={};downs=set()
for f in glob.glob('alembic/versions/*.py'):
    s=open(f,encoding='utf-8').read();r=re.search(r'^revision\s*[:=]\s*[\"\']([^\"\']+)',s,re.M);d=re.search(r'^down_revision\s*[:=]\s*[\"\']([^\"\']+)',s,re.M)
    if r: revs[r.group(1)]=f
    if d: downs.add(d.group(1))
print([k for k in revs if k not in downs])"
```

Expected: sem erro de compilação e a lista impressa é exatamente `['0045_suporte_tickets']`.

- [ ] **Step 9: Commit**

```bash
git add backend/app/models/suporte.py backend/app/models/__init__.py backend/alembic/versions/0045_suporte_tickets.py backend/tests/test_suporte_models.py
git commit -m "feat(suporte): modelos SuporteTicket e SuporteTicketEvento com migracao 0045"
```

---

### Task 2: Schemas Pydantic + normalização de WhatsApp

**Files:**
- Create: `backend/app/schemas/suporte.py`
- Test: `backend/tests/test_suporte_schemas.py`

**Interfaces:**
- Produces:
  - `STATUS_VALIDOS = ("aberto", "em_atendimento", "resolvido")`, `CANAIS = ("email", "whatsapp")`
  - `normalizar_whatsapp(valor: str | None) -> str | None` — `None`/vazio → `None`; senão só dígitos: 10–11 dígitos → prefixa `"55"`; 12–13 dígitos começando com `"55"` → mantém; qualquer outro → `ValueError("Informe um numero brasileiro com DDD")`.
  - `TicketCreate(mensagem: str, whatsapp: str | None = None, canal_preferido: Literal["email", "whatsapp"] = "email")` — `mensagem` com `strip`, 10..4000 (`ValueError("Descreva sua solicitacao com pelo menos 10 caracteres")` / `"...no maximo 4000 caracteres"`); `whatsapp` passa por `normalizar_whatsapp`; `model_validator(mode="after")`: canal `whatsapp` sem número → `ValueError("Informe o WhatsApp para ser contatado por esse canal")`.
  - `TicketMeuOut(id, mensagem, whatsapp, canal_preferido, status, criado_em, atualizado_em)` (`from_attributes`)
  - `EventoOut(id, tipo, status_de, status_para, texto, autor_email, criado_em)`
  - `TicketAdminOut(id, usuario_id, usuario_nome, usuario_email, usuario_role, municipio_id, municipio_nome, mensagem, whatsapp, canal_preferido, status, criado_em, atualizado_em, primeiro_contato_em, resolvido_em)`
  - `TicketAdminDetalheOut(TicketAdminOut)` + `eventos: list[EventoOut]`
  - `StatusUpdate(status: Literal["aberto", "em_atendimento", "resolvido"], texto: str | None = None)` — `texto` `strip`, max 2000, vazio vira `None`
  - `AnotacaoCreate(texto: str)` — `strip`, 1..2000 (`ValueError("Escreva a anotacao")`)
  - `KpisOut(abertos: int, em_atendimento: int, abertos_30d: int, resolvidos_30d: int, tempo_medio_primeiro_contato_horas: float | None)`

- [ ] **Step 1: Escrever o teste que falha**

`backend/tests/test_suporte_schemas.py`:

```python
import pytest
from pydantic import ValidationError

from app.schemas.suporte import AnotacaoCreate, StatusUpdate, TicketCreate, normalizar_whatsapp


@pytest.mark.parametrize("entrada,esperado", [
    ("(37) 99999-9999", "5537999999999"),
    ("+55 37 3333-4444", "553733334444"),
    ("5537999999999", "5537999999999"),
    ("37 3333 4444", "553733334444"),
    ("", None),
    (None, None),
])
def test_normalizar_whatsapp_aceita_formatos_brasileiros(entrada, esperado):
    assert normalizar_whatsapp(entrada) == esperado


@pytest.mark.parametrize("entrada", ["99999-9999", "0 37 99999-9999", "+1 415 555 0100", "abc"])
def test_whatsapp_invalido_rejeita(entrada):
    with pytest.raises(ValueError):
        normalizar_whatsapp(entrada)


def test_ticket_create_normaliza_e_strip():
    t = TicketCreate(mensagem="  Nao consigo exportar o PIB  ", whatsapp="(37) 99999-9999")
    assert t.mensagem == "Nao consigo exportar o PIB"
    assert t.whatsapp == "5537999999999"
    assert t.canal_preferido == "email"


def test_ticket_create_canal_whatsapp_exige_numero():
    with pytest.raises(ValidationError) as exc:
        TicketCreate(mensagem="Preciso de ajuda com o login", canal_preferido="whatsapp")
    assert "Informe o WhatsApp" in str(exc.value)


@pytest.mark.parametrize("msg", ["curta", "   oi   ", "x" * 4001])
def test_ticket_create_mensagem_fora_do_tamanho(msg):
    with pytest.raises(ValidationError):
        TicketCreate(mensagem=msg)


def test_status_update_e_anotacao():
    s = StatusUpdate(status="em_atendimento", texto="   ")
    assert s.texto is None
    with pytest.raises(ValidationError):
        StatusUpdate(status="fechado")
    with pytest.raises(ValidationError):
        AnotacaoCreate(texto="  ")
    assert AnotacaoCreate(texto=" liguei ").texto == "liguei"
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `../venv/Scripts/python -m pytest tests/test_suporte_schemas.py -v`
Expected: FAIL com `ModuleNotFoundError: No module named 'app.schemas.suporte'`

- [ ] **Step 3: Implementar `backend/app/schemas/suporte.py`**

Conforme o bloco Interfaces (Pydantic v2: `field_validator`, `model_validator`, `model_config = {"from_attributes": True}` nos `*Out`). `normalizar_whatsapp` usa `re.sub(r"\D", "", valor)`.

- [ ] **Step 4: Rodar e ver passar**

Run: `../venv/Scripts/python -m pytest tests/test_suporte_schemas.py -v`
Expected: all passed

- [ ] **Step 5: Commit**

```bash
git add backend/app/schemas/suporte.py backend/tests/test_suporte_schemas.py
git commit -m "feat(suporte): schemas do ticket com normalizacao de WhatsApp (DDI 55)"
```

---

### Task 3: Chave de rate limit por usuário

**Files:**
- Modify: `backend/app/core/rate_limit.py`
- Test: `backend/tests/test_rate_limit_chave.py`

**Interfaces:**
- Produces: `chave_por_usuario(request) -> str` em `app/core/rate_limit.py`. Lê `request.headers.get("authorization")`; se for `Bearer <jwt>` e `decode_token(jwt)` (de `app.core.security`, import dentro da função) devolver payload com `sub`, retorna `f"user:{sub}"`; caso contrário `get_remote_address(request)`.

- [ ] **Step 1: Escrever o teste que falha**

`backend/tests/test_rate_limit_chave.py`:

```python
from types import SimpleNamespace

from app.core.rate_limit import chave_por_usuario
from app.core.security import create_access_token


def _req(headers=None, host="10.0.0.1"):
    return SimpleNamespace(headers=headers or {}, client=SimpleNamespace(host=host))


def test_com_bearer_valido_chave_e_o_usuario():
    token = create_access_token("42")
    assert chave_por_usuario(_req({"authorization": f"Bearer {token}"})) == "user:42"


def test_sem_token_ou_token_invalido_cai_para_ip():
    assert chave_por_usuario(_req()) == "10.0.0.1"
    assert chave_por_usuario(_req({"authorization": "Bearer nao-e-jwt"})) == "10.0.0.1"
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `../venv/Scripts/python -m pytest tests/test_rate_limit_chave.py -v`
Expected: FAIL com `ImportError: cannot import name 'chave_por_usuario'`

- [ ] **Step 3: Implementar `chave_por_usuario` em `backend/app/core/rate_limit.py`**

Assinatura e regra do bloco Interfaces; docstring de uma linha explicando o porquê (IP sozinho limitaria uma prefeitura atrás de um NAT). Manter `limiter = Limiter(key_func=get_remote_address)` intacto.

- [ ] **Step 4: Rodar e ver passar**

Run: `../venv/Scripts/python -m pytest tests/test_rate_limit_chave.py -v`
Expected: 2 passed

- [ ] **Step 5: Commit**

```bash
git add backend/app/core/rate_limit.py backend/tests/test_rate_limit_chave.py
git commit -m "feat(rate-limit): chave por usuario autenticado com fallback para IP"
```

---

### Task 4: Router — lado do usuário (`POST /suporte/tickets`, `GET /suporte/tickets/meus`)

**Files:**
- Create: `backend/app/api/v1/routers/suporte.py`
- Modify: `backend/app/main.py` (import `app.api.v1.routers.suporte as suporte` no bloco de imports; `app.include_router(suporte.router, prefix=API_PREFIX)` após `cidade_inteligente`)
- Test: `backend/tests/test_suporte_endpoints.py`

**Interfaces:**
- Consumes: Task 1 modelos; Task 2 schemas; Task 3 `chave_por_usuario`; `get_db`, `get_current_user`, `require_role` de `app.api.deps`; `limiter` de `app.core.rate_limit`.
- Produces (em `app/api/v1/routers/suporte.py`):
  - `router = APIRouter(prefix="/suporte", tags=["Suporte"])`
  - `criar_ticket(request: Request, data: TicketCreate, db: Session = Depends(get_db), current_user: Usuario = Depends(get_current_user)) -> SuporteTicket` — `@router.post("/tickets", response_model=TicketMeuOut, status_code=201)` + `@limiter.limit("5/hour", key_func=chave_por_usuario)`. Snapshots: `usuario_nome/email` do usuário, `usuario_role = current_user.role.nome`, `municipio_id = current_user.municipio_id`, `municipio_nome = current_user.municipio.nome if current_user.municipio else None`. Grava `SuporteTicketEvento(tipo="abertura", autor_id=current_user.id, autor_email=current_user.email)`. Commit + refresh.
  - `listar_meus_tickets(db, current_user) -> list[SuporteTicket]` — `@router.get("/tickets/meus", response_model=list[TicketMeuOut])`, filtro `usuario_id == current_user.id`, `order_by(SuporteTicket.criado_em.desc(), SuporteTicket.id.desc())`.
  - Fixture compartilhada do teste: `ctx` → `(db, admin, u1, u2, m1, m2)`.

- [ ] **Step 1: Escrever o teste que falha**

`backend/tests/test_suporte_endpoints.py` (início; as tasks 5 e 6 acrescentam testes neste mesmo arquivo):

```python
"""Endpoints de suporte: criacao, tenancy, admin (lista/detalhe/status/anotacao), KPIs, auditoria."""
from types import SimpleNamespace

import pytest
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker

import app.models  # noqa: F401
from app.db.base import Base
from app.models.acao_audit import AcaoAudit
from app.models.municipio import Municipio
from app.models.role import Role
from app.models.suporte import SuporteTicket, SuporteTicketEvento
from app.models.usuario import Usuario
from app.models.usuario_mfa import UsuarioMfa
from app.schemas.suporte import AnotacaoCreate, StatusUpdate, TicketCreate


class _FakeRequest:
    headers = {"user-agent": "pytest"}
    client = SimpleNamespace(host="10.0.0.1")


@pytest.fixture()
def ctx(monkeypatch):
    from app.core.rate_limit import limiter
    monkeypatch.setattr(limiter, "enabled", False)
    engine = create_engine("sqlite://")

    @event.listens_for(engine, "connect")
    def _fk_on(dbapi_conn, _record):
        dbapi_conn.execute("PRAGMA foreign_keys=ON")

    # UsuarioMfa entra porque a Task 5 exclui um usuario (relationship 1:1 com cascade).
    Base.metadata.create_all(engine, tables=[
        Municipio.__table__, Role.__table__, Usuario.__table__, UsuarioMfa.__table__,
        AcaoAudit.__table__, SuporteTicket.__table__, SuporteTicketEvento.__table__,
    ])
    db = sessionmaker(bind=engine)()
    role_g = Role(nome="ADMIN_GLOBAL", builtin=True, permissoes={})
    role_v = Role(nome="VISUALIZADOR", builtin=True, permissoes={})
    m1 = Municipio(nome="Alfa", estado="MG")
    m2 = Municipio(nome="Beta", estado="MG")
    db.add_all([role_g, role_v, m1, m2])
    db.flush()
    admin = Usuario(nome="Admin", email="admin@x.com", senha_hash="x", role_id=role_g.id)
    u1 = Usuario(nome="Ana", email="ana@alfa.gov.br", senha_hash="x", role_id=role_v.id, municipio_id=m1.id)
    u2 = Usuario(nome="Bia", email="bia@beta.gov.br", senha_hash="x", role_id=role_v.id, municipio_id=m2.id)
    db.add_all([admin, u1, u2])
    db.commit()
    yield db, admin, u1, u2, m1, m2
    db.close()


def _criar(db, user, **kw):
    from app.api.v1.routers.suporte import criar_ticket
    data = TicketCreate(**{"mensagem": "Nao consigo exportar o grafico do PIB.", **kw})
    return criar_ticket(request=_FakeRequest(), data=data, db=db, current_user=user)


def test_criar_ticket_preenche_snapshots_e_evento_abertura(ctx):
    db, _, u1, _, m1, _ = ctx
    t = _criar(db, u1, whatsapp="(37) 99999-9999", canal_preferido="whatsapp")
    assert t.status == "aberto"
    assert (t.usuario_id, t.usuario_nome, t.usuario_email, t.usuario_role) == (u1.id, "Ana", "ana@alfa.gov.br", "VISUALIZADOR")
    assert (t.municipio_id, t.municipio_nome) == (m1.id, "Alfa")
    assert t.whatsapp == "5537999999999" and t.canal_preferido == "whatsapp"
    assert [e.tipo for e in t.eventos] == ["abertura"]
    assert t.eventos[0].autor_email == "ana@alfa.gov.br"


def test_admin_global_abre_ticket_sem_municipio(ctx):
    db, admin, *_ = ctx
    t = _criar(db, admin)
    assert t.municipio_id is None and t.municipio_nome is None
    assert t.usuario_role == "ADMIN_GLOBAL"


def test_meus_tickets_so_do_proprio_usuario_mais_recente_primeiro(ctx):
    from app.api.v1.routers.suporte import listar_meus_tickets
    db, _, u1, u2, *_ = ctx
    a = _criar(db, u1, mensagem="Primeiro ticket da Ana")
    _criar(db, u2, mensagem="Ticket da Bia que nao pode vazar")
    b = _criar(db, u1, mensagem="Segundo ticket da Ana")
    meus = listar_meus_tickets(db=db, current_user=u1)
    assert [t.id for t in meus] == [b.id, a.id]


def test_rotas_do_usuario_registradas_no_app():
    from app.main import app
    rotas = {r.path: r for r in app.routes if hasattr(r, "path")}
    assert rotas["/api/v1/suporte/tickets"].methods == {"POST"}
    assert "/api/v1/suporte/tickets/meus" in rotas
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `../venv/Scripts/python -m pytest tests/test_suporte_endpoints.py -v`
Expected: FAIL com `ModuleNotFoundError: No module named 'app.api.v1.routers.suporte'`

- [ ] **Step 3: Implementar o router (lado do usuário) e registrar em `main.py`**

Conforme o bloco Interfaces. Importar `Query` e `Request` de `fastapi`; `limiter` e `chave_por_usuario` de `app.core.rate_limit`. Decorators na ordem `@router.post(...)` por cima de `@limiter.limit(...)` (igual a `routers/auth.py`).

- [ ] **Step 4: Rodar e ver passar**

Run: `../venv/Scripts/python -m pytest tests/test_suporte_endpoints.py -v`
Expected: 4 passed

- [ ] **Step 5: Rodar a suíte inteira do backend para garantir que nada quebrou**

Run: `../venv/Scripts/python -m pytest -q`
Expected: tudo verde (mesma contagem de falhas que `main` tinha antes, se houver alguma pré-existente — anotar).

- [ ] **Step 6: Commit**

```bash
git add backend/app/api/v1/routers/suporte.py backend/app/main.py backend/tests/test_suporte_endpoints.py
git commit -m "feat(suporte): POST /suporte/tickets e GET /suporte/tickets/meus com rate limit por usuario"
```

---

### Task 5: Router — admin: KPIs, lista paginada, detalhe (com auditoria de leitura) + `docs/lgpd.md`

**Files:**
- Modify: `backend/app/api/v1/routers/suporte.py`
- Modify: `docs/lgpd.md` (seções 2 e 4)
- Test: `backend/tests/test_suporte_endpoints.py` (acrescentar)

**Interfaces:**
- Consumes: Task 4 router/fixture; `PaginatedResponse` de `app.api.pagination`; `registrar_acao` de `app.services.audit_service`; `NotFoundException` de `app.core.exceptions`.
- Produces:
  - `kpis_suporte(db, current_user=Depends(require_role("ADMIN_GLOBAL"))) -> KpisOut` — `@router.get("/admin/kpis", response_model=KpisOut)`. Janela = `agora - timedelta(days=30)`. `abertos`/`em_atendimento` = contagem atual por status; `abertos_30d` = `criado_em >= janela`; `resolvidos_30d` = `resolvido_em >= janela`; média = sobre tickets com `criado_em >= janela` e `primeiro_contato_em` não nulo, `(primeiro_contato_em - criado_em)` em horas, `round(..., 1)`, `None` se vazio. Helper `_horas_entre(a: datetime, b: datetime) -> float` que trata naive como UTC (SQLite devolve naive).
  - `listar_tickets_admin(request: Request, skip: int = 0, limit: int = 25, status_: str | None = Query(default=None, alias="status"), municipio_filtro: int | None = None, db, current_user) -> PaginatedResponse[TicketAdminOut]` — `@router.get("/admin/tickets", ...)`. Clamp `skip = max(skip, 0)`, `limit = min(max(limit, 1), 100)`. `status_` fora de `STATUS_VALIDOS` → `HTTPException(422, "Status invalido")`. Ordem `criado_em desc, id desc`. Auditoria: `registrar_acao(db, categoria="leitura", acao="suporte_tickets_listados", ator=current_user, detalhe=f"status={status_ or 'todos'} municipio={municipio_filtro or 'todos'} skip={skip}", request=request)`.
  - `_carregar_ticket(db, ticket_id) -> SuporteTicket` — `NotFoundException("Ticket nao encontrado")` se não existir.
  - `detalhar_ticket_admin(request, ticket_id: int, db, current_user) -> SuporteTicket` — `@router.get("/admin/tickets/{ticket_id}", response_model=TicketAdminDetalheOut)`. Auditoria: `categoria="leitura"`, `acao="suporte_ticket_consultado"`, `alvo=ticket.usuario` se houver (relationship `usuario` em `SuporteTicket`, lazy), senão `alvo_email=ticket.usuario_email`; `municipio_id=ticket.municipio_id`; `detalhe=f"ticket #{ticket.id}"`.
  - A relationship `SuporteTicket.usuario` vem da Task 1.

- [ ] **Step 1: Escrever os testes que falham (acrescentar ao arquivo)**

```python
def _admin_dep(handler):
    import inspect
    return inspect.signature(handler).parameters["current_user"].default.dependency


def test_rotas_admin_exigem_admin_global(ctx):
    from app.api.v1.routers.suporte import detalhar_ticket_admin, kpis_suporte, listar_tickets_admin
    from app.core.exceptions import ForbiddenException
    _, _, u1, *_ = ctx
    for h in (kpis_suporte, listar_tickets_admin, detalhar_ticket_admin):
        with pytest.raises(ForbiddenException):
            _admin_dep(h)(current_user=u1)


def test_lista_admin_filtra_status_e_municipio_e_audita(ctx):
    from app.api.v1.routers.suporte import listar_tickets_admin
    db, admin, u1, u2, m1, m2 = ctx
    a = _criar(db, u1)
    b = _criar(db, u2)
    pagina = listar_tickets_admin(request=_FakeRequest(), skip=0, limit=25, status_=None,
                                  municipio_filtro=m2.id, db=db, current_user=admin)
    assert pagina.total == 1 and [t.id for t in pagina.items] == [b.id]
    pagina = listar_tickets_admin(request=_FakeRequest(), skip=0, limit=25, status_="resolvido",
                                  municipio_filtro=None, db=db, current_user=admin)
    assert pagina.total == 0
    todos = listar_tickets_admin(request=_FakeRequest(), skip=0, limit=25, status_=None,
                                 municipio_filtro=None, db=db, current_user=admin)
    assert [t.id for t in todos.items] == [b.id, a.id]
    assert todos.items[0].usuario_email == "bia@beta.gov.br"
    trilha = db.query(AcaoAudit).filter(AcaoAudit.acao == "suporte_tickets_listados").order_by(AcaoAudit.id).all()
    assert len(trilha) == 3 and trilha[0].categoria == "leitura" and trilha[0].ator_email == "admin@x.com"
    assert f"municipio={m2.id}" in trilha[0].detalhe


def test_lista_clampa_skip_e_limit(ctx):
    from app.api.v1.routers.suporte import listar_tickets_admin
    db, admin, u1, *_ = ctx
    for _ in range(3):
        _criar(db, u1)
    pagina = listar_tickets_admin(request=_FakeRequest(), skip=-5, limit=1000, status_=None,
                                  municipio_filtro=None, db=db, current_user=admin)
    assert (pagina.skip, pagina.limit, pagina.total, len(pagina.items)) == (0, 100, 3, 3)


def test_detalhe_inclui_eventos_e_audita_com_alvo(ctx):
    from app.api.v1.routers.suporte import detalhar_ticket_admin
    db, admin, u1, *_ = ctx
    t = _criar(db, u1)
    d = detalhar_ticket_admin(request=_FakeRequest(), ticket_id=t.id, db=db, current_user=admin)
    assert d.id == t.id and [e.tipo for e in d.eventos] == ["abertura"]
    row = db.query(AcaoAudit).filter(AcaoAudit.acao == "suporte_ticket_consultado").one()
    assert (row.categoria, row.alvo_usuario_id, row.alvo_email, row.municipio_id) == ("leitura", u1.id, u1.email, u1.municipio_id)


def test_detalhe_de_ticket_com_usuario_excluido_usa_snapshot(ctx):
    from app.api.v1.routers.suporte import detalhar_ticket_admin
    db, admin, u1, *_ = ctx
    t = _criar(db, u1)
    db.delete(u1)
    db.commit()
    d = detalhar_ticket_admin(request=_FakeRequest(), ticket_id=t.id, db=db, current_user=admin)
    assert d.usuario_id is None and d.usuario_email == "ana@alfa.gov.br"
    row = db.query(AcaoAudit).filter(AcaoAudit.acao == "suporte_ticket_consultado").one()
    assert row.alvo_usuario_id is None and row.alvo_email == "ana@alfa.gov.br"


def test_detalhe_inexistente_404(ctx):
    from app.api.v1.routers.suporte import detalhar_ticket_admin
    from app.core.exceptions import NotFoundException
    db, admin, *_ = ctx
    with pytest.raises(NotFoundException):
        detalhar_ticket_admin(request=_FakeRequest(), ticket_id=999, db=db, current_user=admin)


def test_kpis_contagens_e_media_de_horas(ctx):
    from datetime import datetime, timedelta, timezone
    from app.api.v1.routers.suporte import kpis_suporte
    db, admin, u1, *_ = ctx
    agora = datetime.now(timezone.utc)
    t1 = _criar(db, u1)  # aberto, sem contato
    t2 = _criar(db, u1)  # em atendimento, contato 2h depois
    t3 = _criar(db, u1)  # resolvido, contato 4h depois
    t2.status = "em_atendimento"; t2.criado_em = agora - timedelta(hours=10); t2.primeiro_contato_em = agora - timedelta(hours=8)
    t3.status = "resolvido"; t3.criado_em = agora - timedelta(hours=20); t3.primeiro_contato_em = agora - timedelta(hours=16); t3.resolvido_em = agora - timedelta(hours=1)
    db.commit()
    k = kpis_suporte(db=db, current_user=admin)
    assert (k.abertos, k.em_atendimento, k.abertos_30d, k.resolvidos_30d) == (1, 1, 3, 1)
    assert k.tempo_medio_primeiro_contato_horas == 3.0


def test_kpis_sem_contato_media_none(ctx):
    from app.api.v1.routers.suporte import kpis_suporte
    db, admin, u1, *_ = ctx
    _criar(db, u1)
    assert kpis_suporte(db=db, current_user=admin).tempo_medio_primeiro_contato_horas is None
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `../venv/Scripts/python -m pytest tests/test_suporte_endpoints.py -v`
Expected: os testes novos falham com `ImportError` (`kpis_suporte` etc.); os 4 da Task 4 continuam passando.

- [ ] **Step 3: Implementar os três handlers admin + `_carregar_ticket` + `_horas_entre`**

Conforme o bloco Interfaces. Se o teste de usuário excluído falhar por FK, confirmar `ondelete="SET NULL"` em `usuario_id` (Task 1) e `passive_deletes=True` não é necessário aqui (o DELETE do usuário acontece via ORM com `PRAGMA foreign_keys=ON`, o banco faz o SET NULL; dar `db.expire_all()` antes de consultar se o objeto estiver em cache).

- [ ] **Step 4: Rodar e ver passar**

Run: `../venv/Scripts/python -m pytest tests/test_suporte_endpoints.py -v`
Expected: 12 passed

- [ ] **Step 5: Atualizar `docs/lgpd.md`**

- Seção 2: trocar "A plataforma trata três classes de dados pessoais" por "quatro" e acrescentar, após o bloco **(c)**, o bloco **(d) Solicitações de suporte.** cobrindo: nome, e-mail, papel e município do solicitante (retrato no momento da abertura), número de WhatsApp informado voluntariamente, texto livre da solicitação, status e histórico de ações/anotações do suporte; o formulário orienta a não incluir dados pessoais de terceiros; o acesso é restrito ao ADMIN_GLOBAL e cada leitura/ação fica em `acao_audit` (`suporte_tickets_listados`, `suporte_ticket_consultado`, `suporte_ticket_status`, `suporte_ticket_anotacao`).
- Seção 3 (bases legais): uma frase ligando a classe (d) à execução de contrato/atendimento ao usuário (art. 7º, V) e ao legítimo interesse na rastreabilidade das ações do suporte.
- Seção 4: parágrafo novo: tickets de suporte (`suporte_tickets`, `suporte_ticket_eventos`) são mantidos enquanto o município estiver cadastrado; não há purga automática nesta versão (registrado no backlog); quando o usuário é excluído, o ticket preserva nome e e-mail como retrato, com a mesma base da trilha de auditoria.

- [ ] **Step 6: Commit**

```bash
git add backend/app/api/v1/routers/suporte.py backend/app/models/suporte.py backend/tests/test_suporte_endpoints.py docs/lgpd.md
git commit -m "feat(suporte): KPIs, lista paginada e detalhe admin com trilha de leitura; LGPD classe (d)"
```

---

### Task 6: Router — admin: mudança de status e anotação interna

**Files:**
- Modify: `backend/app/api/v1/routers/suporte.py`
- Test: `backend/tests/test_suporte_endpoints.py` (acrescentar)

**Interfaces:**
- Consumes: Task 5 `_carregar_ticket`; `StatusUpdate`, `AnotacaoCreate` (Task 2).
- Produces:
  - `alterar_status_ticket(request, ticket_id: int, data: StatusUpdate, db, current_user) -> SuporteTicket` — `@router.patch("/admin/tickets/{ticket_id}/status", response_model=TicketAdminDetalheOut)`. Mesmo status → `HTTPException(400, "O ticket ja esta com esse status")`. `agora = datetime.now(timezone.utc)`; evento `tipo="status", status_de, status_para, texto=data.texto, autor_id/autor_email=current_user`; se `status_para == "em_atendimento"` e `primeiro_contato_em is None` → seta `agora`; se `status_para == "resolvido"` → `resolvido_em = agora`; se `status_de == "resolvido"` → `resolvido_em = None`; `atualizado_em = agora`. Auditoria `categoria="acao"`, `acao="suporte_ticket_status"`, `alvo`/`alvo_email` como no detalhe, `detalhe=f"ticket #{id}: {de} -> {para}"`.
  - `anotar_ticket(request, ticket_id: int, data: AnotacaoCreate, db, current_user) -> SuporteTicket` — `@router.post("/admin/tickets/{ticket_id}/anotacoes", response_model=TicketAdminDetalheOut, status_code=201)`. Evento `tipo="anotacao", texto`; `atualizado_em = agora`. Auditoria `acao="suporte_ticket_anotacao"`, `detalhe=f"ticket #{id}"` (sem o texto).

- [ ] **Step 1: Escrever os testes que falham (acrescentar ao arquivo)**

```python
def _status(db, admin, ticket_id, status, texto=None):
    from app.api.v1.routers.suporte import alterar_status_ticket
    return alterar_status_ticket(request=_FakeRequest(), ticket_id=ticket_id,
                                 data=StatusUpdate(status=status, texto=texto), db=db, current_user=admin)


def test_status_grava_evento_primeiro_contato_e_resolvido(ctx):
    db, admin, u1, *_ = ctx
    t = _criar(db, u1)
    d = _status(db, admin, t.id, "em_atendimento", texto="liguei, vai mandar print")
    assert d.status == "em_atendimento" and d.primeiro_contato_em is not None
    primeiro = d.primeiro_contato_em
    d = _status(db, admin, t.id, "resolvido")
    assert d.resolvido_em is not None and d.primeiro_contato_em == primeiro
    d = _status(db, admin, t.id, "aberto")          # reabrir
    assert d.resolvido_em is None and d.primeiro_contato_em == primeiro
    d = _status(db, admin, t.id, "em_atendimento")  # segunda vez nao sobrescreve
    assert d.primeiro_contato_em == primeiro
    tipos = [(e.tipo, e.status_de, e.status_para) for e in d.eventos]
    assert tipos == [("abertura", None, None), ("status", "aberto", "em_atendimento"),
                     ("status", "em_atendimento", "resolvido"), ("status", "resolvido", "aberto"),
                     ("status", "aberto", "em_atendimento")]
    assert d.eventos[1].texto == "liguei, vai mandar print"
    trilha = db.query(AcaoAudit).filter(AcaoAudit.acao == "suporte_ticket_status").order_by(AcaoAudit.id).all()
    assert len(trilha) == 4 and trilha[0].categoria == "acao"
    assert trilha[0].detalhe == f"ticket #{t.id}: aberto -> em_atendimento"
    assert trilha[0].alvo_email == "ana@alfa.gov.br"


def test_mesmo_status_400(ctx):
    from fastapi import HTTPException
    db, admin, u1, *_ = ctx
    t = _criar(db, u1)
    with pytest.raises(HTTPException) as exc:
        _status(db, admin, t.id, "aberto")
    assert exc.value.status_code == 400


def test_anotacao_grava_evento_e_audita_sem_texto(ctx):
    from app.api.v1.routers.suporte import anotar_ticket
    db, admin, u1, *_ = ctx
    t = _criar(db, u1)
    d = anotar_ticket(request=_FakeRequest(), ticket_id=t.id, data=AnotacaoCreate(texto="respondido por e-mail"),
                      db=db, current_user=admin)
    assert d.eventos[-1].tipo == "anotacao" and d.eventos[-1].texto == "respondido por e-mail"
    assert d.eventos[-1].autor_email == "admin@x.com"
    row = db.query(AcaoAudit).filter(AcaoAudit.acao == "suporte_ticket_anotacao").one()
    assert row.categoria == "acao" and "respondido" not in (row.detalhe or "")


def test_status_e_anotacao_exigem_admin_global(ctx):
    from app.api.v1.routers.suporte import alterar_status_ticket, anotar_ticket
    from app.core.exceptions import ForbiddenException
    _, _, u1, *_ = ctx
    for h in (alterar_status_ticket, anotar_ticket):
        with pytest.raises(ForbiddenException):
            _admin_dep(h)(current_user=u1)


def test_openapi_expoe_todas_as_rotas_de_suporte():
    from app.main import app
    paths = app.openapi()["paths"]
    for p in ("/api/v1/suporte/tickets", "/api/v1/suporte/tickets/meus", "/api/v1/suporte/admin/kpis",
              "/api/v1/suporte/admin/tickets", "/api/v1/suporte/admin/tickets/{ticket_id}",
              "/api/v1/suporte/admin/tickets/{ticket_id}/status",
              "/api/v1/suporte/admin/tickets/{ticket_id}/anotacoes"):
        assert p in paths, p
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `../venv/Scripts/python -m pytest tests/test_suporte_endpoints.py -v`
Expected: 5 novos falham com `ImportError`; os 12 anteriores passam.

- [ ] **Step 3: Implementar `alterar_status_ticket` e `anotar_ticket`**

Conforme o bloco Interfaces. Depois de `db.commit()`, `db.refresh(ticket)` para `eventos` refletir a inserção.

- [ ] **Step 4: Rodar e ver passar**

Run: `../venv/Scripts/python -m pytest tests/test_suporte_endpoints.py -v`
Expected: 17 passed

- [ ] **Step 5: Suíte inteira do backend**

Run: `../venv/Scripts/python -m pytest -q`
Expected: verde.

- [ ] **Step 6: Commit**

```bash
git add backend/app/api/v1/routers/suporte.py backend/tests/test_suporte_endpoints.py
git commit -m "feat(suporte): mudanca de status com reabertura e anotacoes internas auditadas"
```

---

### Task 7: Helper `linkWhatsAppPara` + chip de status compartilhado + helper de erro

**Files:**
- Modify: `frontend-observatorio/src/config/contato.js`
- Modify: `frontend-observatorio/src/config/contato.test.js`
- Create: `frontend-observatorio/src/components/suporte/statusTicket.js`
- Create: `frontend-observatorio/src/components/suporte/StatusChip.jsx`
- Create: `frontend-observatorio/src/components/suporte/erroApi.js`
- Test: `frontend-observatorio/src/components/suporte/erroApi.test.js`, `StatusChip.test.jsx`

**Interfaces:**
- Produces:
  - `linkWhatsAppPara(numero, texto)` em `config/contato.js`: `https://wa.me/${numero}` + `?text=` codificado quando `texto`; `linkWhatsApp(texto)` passa a delegar com `WHATSAPP_NUMERO`.
  - `STATUS_TICKET` em `statusTicket.js`: `{ aberto: { label: "Aberto", cor: "var(--accent-4)" }, em_atendimento: { label: "Em atendimento", cor: "var(--accent-1)" }, resolvido: { label: "Resolvido", cor: "var(--accent-5)" } }`; `STATUS_ORDEM = ["aberto", "em_atendimento", "resolvido"]`; `labelStatus(status)` → label ou o próprio valor.
  - `<StatusChip status />` em `StatusChip.jsx`: `<span>` com o label, borda/texto na cor do status, `data-status={status}`.
  - `mensagemErroApi(error, fallback = "Nao foi possivel concluir. Tente novamente.")` em `erroApi.js`: 429 → `"Voce enviou muitas solicitacoes. Aguarde um pouco e tente de novo."`; `detail` array → mensagens `msg` sem o prefixo `"Value error, "`, unidas por `" "`; `detail` string → ela; senão `fallback`. (Usar acentos normais nas strings do front: "Você enviou muitas solicitações…", "Não foi possível concluir…".)

- [ ] **Step 1: Escrever os testes que falham**

Acrescentar em `src/config/contato.test.js`:

```js
import { linkWhatsApp, linkWhatsAppPara } from "./contato";

describe("linkWhatsAppPara", () => {
  it("monta o link para um numero arbitrario", () => {
    expect(linkWhatsAppPara("5537999999999")).toBe("https://wa.me/5537999999999");
    expect(linkWhatsAppPara("5537999999999", "Olá x")).toBe("https://wa.me/5537999999999?text=Ol%C3%A1%20x");
  });
});
```

`src/components/suporte/erroApi.test.js`:

```js
import { describe, expect, it } from "vitest";
import { mensagemErroApi } from "./erroApi";

const err = (status, data) => ({ response: { status, data } });

describe("mensagemErroApi", () => {
  it("429 do slowapi vira texto amigavel mesmo sem detail", () => {
    expect(mensagemErroApi(err(429, { error: "Rate limit exceeded: 5 per 1 hour" })))
      .toBe("Você enviou muitas solicitações. Aguarde um pouco e tente de novo.");
  });
  it("422 do pydantic junta as mensagens sem o prefixo Value error", () => {
    const e = err(422, { detail: [{ msg: "Value error, Informe o WhatsApp para ser contatado por esse canal" }] });
    expect(mensagemErroApi(e)).toBe("Informe o WhatsApp para ser contatado por esse canal");
  });
  it("detail string e fallback", () => {
    expect(mensagemErroApi(err(404, { detail: "Ticket nao encontrado" }))).toBe("Ticket nao encontrado");
    expect(mensagemErroApi({}, "Falhou")).toBe("Falhou");
  });
});
```

`src/components/suporte/StatusChip.test.jsx`:

```jsx
// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import StatusChip from "./StatusChip";

describe("StatusChip", () => {
  it("mostra o rotulo do status", () => {
    render(<StatusChip status="em_atendimento" />);
    expect(screen.getByText("Em atendimento")).toHaveAttribute("data-status", "em_atendimento");
  });
  it("status desconhecido cai no proprio valor", () => {
    render(<StatusChip status="xyz" />);
    expect(screen.getByText("xyz")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run (de `frontend-observatorio/`): `npx vitest run src/config/contato.test.js src/components/suporte`
Expected: FAIL (`linkWhatsAppPara is not a function`, módulos inexistentes).

- [ ] **Step 3: Implementar os quatro arquivos**

Conforme o bloco Interfaces.

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/config/contato.test.js src/components/suporte`
Expected: all passed

- [ ] **Step 5: Commit**

```bash
git add frontend-observatorio/src/config/contato.js frontend-observatorio/src/config/contato.test.js frontend-observatorio/src/components/suporte
git commit -m "feat(suporte): helpers de link WhatsApp, chip de status e mensagem de erro da API"
```

---

### Task 8: `SuporteButton` com menu de três opções (substitui `SuporteWhatsAppButton`)

**Files:**
- Create: `frontend-observatorio/src/components/suporte/SuporteButton.jsx`
- Create: `frontend-observatorio/src/components/suporte/SuporteButton.test.jsx`
- Delete: `frontend-observatorio/src/components/SuporteWhatsAppButton.jsx`, `frontend-observatorio/src/components/SuporteWhatsAppButton.test.jsx`
- Modify: `frontend-observatorio/src/app/layouts/DashboardLayout.jsx:14` e `:230`; `frontend-observatorio/src/app/layouts/AdminLayout.jsx:7` e `:351` (import `SuporteButton from "../../components/suporte/SuporteButton"`; `<SuporteButton />`)

**Interfaces:**
- Consumes: `linkWhatsApp` (config/contato), `useAuth`, `useEscapeKey`.
- Produces: `export default function SuporteButton()`; estado interno `modal: null | "novo" | "meus"` exposto para as Tasks 9/10 via dois pontos de renderização marcados com comentário `{/* modais: Task 9 e 10 */}`. Mensagem do WhatsApp igual à atual: `Olá! Sou ${nome} (${email}) e preciso de atendimento no NID.` / `Olá! Preciso de atendimento no NID.`

- [ ] **Step 1: Escrever o teste que falha**

`src/components/suporte/SuporteButton.test.jsx`:

```jsx
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import SuporteButton from "./SuporteButton";
import { linkWhatsApp } from "../../config/contato";

let mockUser = null;
vi.mock("../../context/AuthContext", () => ({ useAuth: () => ({ user: mockUser }) }));
vi.mock("../../context/ToastContext", () => ({ useToast: () => ({ addToast: vi.fn() }) }));
vi.mock("../../services/api", () => ({ default: { get: vi.fn(), post: vi.fn() } }));

afterEach(cleanup);

function abrir() {
  fireEvent.click(screen.getByRole("button", { name: /Falar com o suporte/i }));
}

describe("SuporteButton", () => {
  it("menu fechado por padrao; ao clicar mostra as tres opcoes", () => {
    mockUser = { nome: "Ana Souza", email: "ana@prefeitura.gov.br" };
    render(<SuporteButton />);
    expect(screen.queryByRole("menu")).toBeNull();
    abrir();
    const itens = screen.getAllByRole("menuitem");
    expect(itens.map((i) => i.textContent)).toEqual([
      expect.stringContaining("Abrir solicitação"),
      expect.stringContaining("Meus atendimentos"),
      expect.stringContaining("WhatsApp"),
    ]);
  });

  it("item WhatsApp mantem o link personalizado em nova aba", () => {
    mockUser = { nome: "Ana Souza", email: "ana@prefeitura.gov.br" };
    render(<SuporteButton />);
    abrir();
    const link = screen.getByRole("menuitem", { name: /WhatsApp/i });
    expect(link.getAttribute("href")).toBe(
      linkWhatsApp("Olá! Sou Ana Souza (ana@prefeitura.gov.br) e preciso de atendimento no NID.")
    );
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
  });

  it("sem usuario: mensagem generica", () => {
    mockUser = null;
    render(<SuporteButton />);
    abrir();
    expect(screen.getByRole("menuitem", { name: /WhatsApp/i }).getAttribute("href"))
      .toBe(linkWhatsApp("Olá! Preciso de atendimento no NID."));
  });

  it("Esc fecha o menu", () => {
    render(<SuporteButton />);
    abrir();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/components/suporte/SuporteButton.test.jsx`
Expected: FAIL (módulo inexistente).

- [ ] **Step 3: Implementar `SuporteButton.jsx`**

- `<div ref={ref} className="relative">`; botão com o mesmo visual do componente atual (classes e `style` copiados de `SuporteWhatsAppButton.jsx`), `aria-haspopup="menu"`, `aria-expanded`.
- Menu: `<div role="menu">` posicionado `absolute bottom-full left-0 right-0 mb-2` com `background: var(--panel)`, `border: 1px solid var(--border)`, `rounded-lg`, `shadow-lg`, `z-20`. Três itens: dois `<button role="menuitem">` (ícones `PencilSquareIcon`, `ClipboardDocumentListIcon`) e um `<a role="menuitem">` (`ChatBubbleLeftRightIcon`), cada um com título e linha de ajuda da spec em `text-[11px]` `var(--text-mute)`.
- Fecha com `useEscapeKey(() => setOpen(false), open)`, com `mousedown` fora do `ref`, e ao escolher. Os dois botões fazem `setModal("novo" | "meus")` e fecham o menu; por ora nada é renderizado para `modal` (comentário marcando o ponto).

- [ ] **Step 4: Trocar o componente nos dois layouts e apagar o antigo**

`git rm frontend-observatorio/src/components/SuporteWhatsAppButton.jsx frontend-observatorio/src/components/SuporteWhatsAppButton.test.jsx`; ajustar os imports/usos em `DashboardLayout.jsx` e `AdminLayout.jsx`.

- [ ] **Step 5: Rodar testes e lint**

Run: `npx vitest run src/components/suporte src/app` e `npx eslint src/components/suporte src/app/layouts`
Expected: testes verdes, lint limpo. Conferir que `grep -rn SuporteWhatsAppButton src` não devolve nada.

- [ ] **Step 6: Commit**

```bash
git add -A frontend-observatorio/src/components frontend-observatorio/src/app/layouts
git commit -m "feat(suporte): botao Falar com o suporte vira menu com solicitacao, meus atendimentos e WhatsApp"
```

---

### Task 9: Modal "Abrir solicitação" (`SuporteTicketModal`)

**Files:**
- Create: `frontend-observatorio/src/components/suporte/SuporteTicketModal.jsx`
- Create: `frontend-observatorio/src/components/suporte/SuporteTicketModal.test.jsx`
- Modify: `frontend-observatorio/src/components/suporte/SuporteButton.jsx` (renderizar `<SuporteTicketModal open={modal === "novo"} onClose={() => setModal(null)} />`)

**Interfaces:**
- Consumes: `api.post("/suporte/tickets", body)`; `useToast().addToast(message, type)`; `useEscapeKey`; `mensagemErroApi` (Task 7); `useAuth().user` (`nome`, `email`).
- Produces: `export default function SuporteTicketModal({ open, onClose })`. Body enviado: `{ mensagem, whatsapp: whatsapp.trim() || null, canal_preferido }`.

- [ ] **Step 1: Escrever o teste que falha**

`src/components/suporte/SuporteTicketModal.test.jsx`:

```jsx
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const addToast = vi.fn();
vi.mock("../../context/AuthContext", () => ({ useAuth: () => ({ user: { nome: "Ana", email: "ana@x.gov.br" } }) }));
vi.mock("../../context/ToastContext", () => ({ useToast: () => ({ addToast }) }));
vi.mock("../../services/api", () => ({ default: { post: vi.fn() } }));

import api from "../../services/api";
import SuporteTicketModal from "./SuporteTicketModal";

afterEach(cleanup);
beforeEach(() => vi.clearAllMocks());

const digitar = (label, valor) => fireEvent.change(screen.getByLabelText(label), { target: { value: valor } });
const enviar = () => fireEvent.click(screen.getByRole("button", { name: /^Enviar/ }));

describe("SuporteTicketModal", () => {
  it("mostra nome e e-mail que vao junto e o aviso de terceiros", () => {
    render(<SuporteTicketModal open onClose={() => {}} />);
    expect(screen.getByText(/Ana · ana@x.gov.br/)).toBeInTheDocument();
    expect(screen.getByText(/Não inclua dados pessoais de terceiros/)).toBeInTheDocument();
  });

  it("bloqueia envio com mensagem curta", () => {
    render(<SuporteTicketModal open onClose={() => {}} />);
    digitar(/Conte o que aconteceu/, "oi");
    enviar();
    expect(screen.getByText(/pelo menos 10 caracteres/)).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
  });

  it("canal WhatsApp exige numero", () => {
    render(<SuporteTicketModal open onClose={() => {}} />);
    digitar(/Conte o que aconteceu/, "Nao consigo exportar o PIB");
    fireEvent.click(screen.getByLabelText(/^WhatsApp$/));
    enviar();
    expect(screen.getByText(/Informe o WhatsApp/)).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
  });

  it("envia o payload, mostra toast e fecha", async () => {
    api.post.mockResolvedValue({ data: { id: 1 } });
    const onClose = vi.fn();
    render(<SuporteTicketModal open onClose={onClose} />);
    digitar(/Conte o que aconteceu/, "Nao consigo exportar o PIB");
    digitar(/WhatsApp para contato/, "(37) 99999-9999");
    fireEvent.click(screen.getByLabelText(/^WhatsApp$/));
    enviar();
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(api.post).toHaveBeenCalledWith("/suporte/tickets", {
      mensagem: "Nao consigo exportar o PIB", whatsapp: "(37) 99999-9999", canal_preferido: "whatsapp",
    });
    expect(addToast).toHaveBeenCalledWith("Solicitação enviada. Vamos entrar em contato por WhatsApp.", "success");
  });

  it("erro 429 mostra texto amigavel e nao fecha", async () => {
    api.post.mockRejectedValue({ response: { status: 429, data: { error: "Rate limit exceeded" } } });
    const onClose = vi.fn();
    render(<SuporteTicketModal open onClose={onClose} />);
    digitar(/Conte o que aconteceu/, "Nao consigo exportar o PIB");
    enviar();
    await screen.findByText(/muitas solicitações/);
    expect(onClose).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/components/suporte/SuporteTicketModal.test.jsx`
Expected: FAIL (módulo inexistente).

- [ ] **Step 3: Implementar `SuporteTicketModal.jsx`**

Esqueleto de `AlterarSenhaModal.jsx` (`AnimatePresence`, overlay, `XMarkIcon`, `useEscapeKey(handleClose, open)`). Título "Abrir solicitação de suporte". Campos com `<label htmlFor>`: textarea `id="suporte-mensagem"` (label "Conte o que aconteceu ou o que você precisa", `maxLength={4000}`, contador `{n}/4000`), input `id="suporte-whatsapp"` (label "WhatsApp para contato", placeholder `(37) 99999-9999`, `inputMode="tel"`), fieldset "Prefiro ser contatado por" com dois `<input type="radio">` rotulados "E-mail" (default) e "WhatsApp". Linha "Vamos usar: {nome} · {email}" e a ajuda de terceiros. Validação client-side com as mensagens exatas dos testes; erro inline em `role="alert"`. Botões "Cancelar" e "Enviar solicitação" (desabilitado enquanto `saving`). Sucesso: `addToast(..., "success")`, reset, `onClose()`. Falha: `setError(mensagemErroApi(err, "Não foi possível enviar. Tente novamente."))`.

- [ ] **Step 4: Ligar no `SuporteButton`**

Renderizar o modal no ponto marcado; o teste da Task 8 continua verde (modal fechado não renderiza nada).

- [ ] **Step 5: Rodar testes e lint**

Run: `npx vitest run src/components/suporte` e `npx eslint src/components/suporte`
Expected: verde.

- [ ] **Step 6: Commit**

```bash
git add frontend-observatorio/src/components/suporte
git commit -m "feat(suporte): modal Abrir solicitacao com validacao, canal preferido e envio"
```

---

### Task 10: Modal "Meus atendimentos" (`SuporteMeusTicketsModal`)

**Files:**
- Create: `frontend-observatorio/src/components/suporte/SuporteMeusTicketsModal.jsx`
- Create: `frontend-observatorio/src/components/suporte/SuporteMeusTicketsModal.test.jsx`
- Modify: `frontend-observatorio/src/components/suporte/SuporteButton.jsx` (renderizar `<SuporteMeusTicketsModal open={modal === "meus"} onClose={() => setModal(null)} onAbrirNovo={() => setModal("novo")} />`)

**Interfaces:**
- Consumes: `api.get("/suporte/tickets/meus")` → `TicketMeuOut[]`; `StatusChip`; `useEscapeKey`.
- Produces: `export default function SuporteMeusTicketsModal({ open, onClose, onAbrirNovo })`. Busca ao abrir (`useEffect` em `open`).

- [ ] **Step 1: Escrever o teste que falha**

```jsx
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

vi.mock("../../services/api", () => ({ default: { get: vi.fn() } }));
import api from "../../services/api";
import SuporteMeusTicketsModal from "./SuporteMeusTicketsModal";

afterEach(cleanup);
beforeEach(() => vi.clearAllMocks());

const T = (over) => ({ id: 1, mensagem: "Nao consigo exportar o PIB", whatsapp: null, canal_preferido: "email",
  status: "aberto", criado_em: "2026-10-19T12:00:00Z", atualizado_em: "2026-10-19T12:00:00Z", ...over });

describe("SuporteMeusTicketsModal", () => {
  it("lista os tickets com data, status e texto, sem botao de responder", async () => {
    api.get.mockResolvedValue({ data: [T(), T({ id: 2, status: "resolvido", mensagem: "Login nao funciona" })] });
    render(<SuporteMeusTicketsModal open onClose={() => {}} onAbrirNovo={() => {}} />);
    expect(await screen.findByText("Nao consigo exportar o PIB")).toBeInTheDocument();
    expect(screen.getByText("Aberto")).toBeInTheDocument();
    expect(screen.getByText("Resolvido")).toBeInTheDocument();
    expect(screen.getByText(/19\/10\/2026/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Responder/i })).toBeNull();
    expect(api.get).toHaveBeenCalledWith("/suporte/tickets/meus");
  });

  it("estado vazio oferece abrir solicitacao", async () => {
    api.get.mockResolvedValue({ data: [] });
    const onAbrirNovo = vi.fn();
    render(<SuporteMeusTicketsModal open onClose={() => {}} onAbrirNovo={onAbrirNovo} />);
    await screen.findByText(/ainda não abriu nenhuma solicitação/);
    fireEvent.click(screen.getByRole("button", { name: /Abrir solicitação/ }));
    expect(onAbrirNovo).toHaveBeenCalled();
  });

  it("fechado nao busca nada", () => {
    render(<SuporteMeusTicketsModal open={false} onClose={() => {}} onAbrirNovo={() => {}} />);
    expect(api.get).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/components/suporte/SuporteMeusTicketsModal.test.jsx`
Expected: FAIL (módulo inexistente).

- [ ] **Step 3: Implementar `SuporteMeusTicketsModal.jsx`**

Mesmo esqueleto de modal. Título "Meus atendimentos". Estados `loading` ("Carregando…"), erro ("Não foi possível carregar suas solicitações."), vazio (texto + botão "Abrir solicitação" → `onAbrirNovo()`), lista: cada item com data `toLocaleString("pt-BR", {day,month,year,hour,minute})`, `<StatusChip>`, texto com `line-clamp-3` que expande ao clicar (`useState` por item). Sem ações de resposta.

- [ ] **Step 4: Ligar no `SuporteButton`**; rodar `npx vitest run src/components/suporte` e `npx eslint src/components/suporte`

Expected: verde.

- [ ] **Step 5: Commit**

```bash
git add frontend-observatorio/src/components/suporte
git commit -m "feat(suporte): modal Meus atendimentos com status das solicitacoes do usuario"
```

---

### Task 11: Página admin `/admin/suporte` — KPIs, filtros, lista paginada, rota e nav

**Files:**
- Create: `frontend-observatorio/src/pages/admin/SuporteAdminPage.jsx`
- Create: `frontend-observatorio/src/pages/admin/SuporteAdminPage.test.jsx`
- Modify: `frontend-observatorio/src/app/router/AppRouter.jsx` (import + `<Route path="suporte" element={<AdminRoute><SuporteAdminPage /></AdminRoute>} />` após `login-audit`)
- Modify: `frontend-observatorio/src/app/layouts/AdminLayout.jsx` (import `LifebuoyIcon`; em `GESTAO_ITEMS`, após "Usuários": `{ to: "/admin/suporte", label: "Atendimento", icon: LifebuoyIcon }`)

**Interfaces:**
- Consumes: `api.get("/suporte/admin/kpis")`, `api.get("/suporte/admin/tickets", { params: { skip, limit: 25, status, municipio_filtro } })` (omitir chaves vazias), `api.get("/municipios")` → `[{ id, nome, estado }]`; `KpiCard` (`label`, `value`, `sub`, `icon`, `delay`); `StatusChip`, `STATUS_ORDEM`, `labelStatus`.
- Produces: `export default function SuporteAdminPage()`; estado `selecionadoId` e renderização de `<SuporteTicketDetalhe ticketId={selecionadoId} onClose={() => setSelecionadoId(null)} onAtualizado={recarregar} />` (Task 12; nesta task, placeholder `null` com comentário). Exporta também `function formatarHoras(h)` → `"—"` se `null`, senão `${h.toFixed(1)} h`.

- [ ] **Step 1: Escrever o teste que falha**

```jsx
// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

vi.mock("../../services/api", () => ({ default: { get: vi.fn(), patch: vi.fn(), post: vi.fn() } }));
vi.mock("../../context/AuthContext", () => ({ useAuth: () => ({ user: { role: "ADMIN_GLOBAL", nome: "Admin" } }) }));

import api from "../../services/api";
import SuporteAdminPage from "./SuporteAdminPage";

const KPIS = { abertos: 3, em_atendimento: 1, abertos_30d: 5, resolvidos_30d: 2, tempo_medio_primeiro_contato_horas: 4.25 };
const TICKET = { id: 7, usuario_id: 2, usuario_nome: "Ana", usuario_email: "ana@alfa.gov.br", usuario_role: "VISUALIZADOR",
  municipio_id: 1, municipio_nome: "Alfa", mensagem: "Nao consigo exportar o grafico do PIB.", whatsapp: "5537999999999",
  canal_preferido: "whatsapp", status: "aberto", criado_em: "2026-10-19T12:00:00Z", atualizado_em: "2026-10-19T12:00:00Z",
  primeiro_contato_em: null, resolvido_em: null };

function mockApi({ tickets = [TICKET], total = 1 } = {}) {
  api.get.mockImplementation((url) => {
    if (url === "/suporte/admin/kpis") return Promise.resolve({ data: KPIS });
    if (url === "/suporte/admin/tickets") return Promise.resolve({ data: { items: tickets, total, skip: 0, limit: 25 } });
    if (url === "/municipios") return Promise.resolve({ data: [{ id: 1, nome: "Alfa", estado: "MG" }, { id: 2, nome: "Beta", estado: "MG" }] });
    return Promise.resolve({ data: {} });
  });
}

describe("SuporteAdminPage", () => {
  beforeEach(() => { vi.clearAllMocks(); mockApi(); });

  it("mostra os KPIs e a lista", async () => {
    render(<SuporteAdminPage />);
    expect(await screen.findByText("ana@alfa.gov.br")).toBeInTheDocument();
    expect(screen.getByText("4")).toBeInTheDocument();          // em aberto = abertos + em_atendimento
    expect(screen.getByText(/3 aguardando primeiro contato/)).toBeInTheDocument();
    expect(screen.getByText("4.3 h")).toBeInTheDocument();
    expect(screen.getByText("Alfa")).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith("/suporte/admin/tickets", expect.objectContaining({
      params: expect.objectContaining({ skip: 0, limit: 25 }),
    }));
  });

  it("filtro de status e municipio usa municipio_filtro, nunca municipio_id", async () => {
    render(<SuporteAdminPage />);
    await screen.findByText("ana@alfa.gov.br");
    fireEvent.click(screen.getByRole("button", { name: /^Em atendimento$/ }));
    fireEvent.change(screen.getByLabelText(/Município/), { target: { value: "2" } });
    await waitFor(() => {
      const ultima = api.get.mock.calls.filter((c) => c[0] === "/suporte/admin/tickets").pop();
      expect(ultima[1].params).toEqual({ skip: 0, limit: 25, status: "em_atendimento", municipio_filtro: 2 });
      expect("municipio_id" in ultima[1].params).toBe(false);
    });
  });

  it("ticket sem municipio mostra travessao", async () => {
    mockApi({ tickets: [{ ...TICKET, municipio_id: null, municipio_nome: null }] });
    render(<SuporteAdminPage />);
    await screen.findByText("ana@alfa.gov.br");
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  });

  it("lista vazia tem estado vazio", async () => {
    mockApi({ tickets: [], total: 0 });
    render(<SuporteAdminPage />);
    expect(await screen.findByText(/Nenhuma solicitação/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/pages/admin/SuporteAdminPage.test.jsx`
Expected: FAIL (módulo inexistente).

- [ ] **Step 3: Implementar `SuporteAdminPage.jsx`**

Molde `LoginAuditAdminPage.jsx` (cabeçalho com ícone `LifebuoyIcon`, `fmtDateTime`, `PAGE_SIZE = 25`, paginação com `ChevronLeftIcon/RightIcon`). Topo: grid `grid-cols-2 md:grid-cols-4` com 4 `KpiCard`: "Em aberto" (`abertos + em_atendimento`, `sub` = `${abertos} aguardando primeiro contato`), "Abertos (30 dias)", "Resolvidos (30 dias)", "Tempo até 1º contato" (`formatarHoras`). Filtros: chips de status (`<button>` "Todos", "Aberto", "Em atendimento", "Resolvido" via `STATUS_ORDEM`/`labelStatus`, `aria-pressed`) e `<select id="filtro-municipio">` com `<label htmlFor>` "Município" (opção "Todos os municípios" + `nome – estado`). Trocar filtro zera `skip`. Lista: **uma única** lista de linhas em grid responsivo (`grid-cols-1 md:grid-cols-[auto_1fr_1fr_auto_2fr_auto]` ou equivalente), com cabeçalho só em `md+` (`hidden md:grid`) e as células Data, Usuário [nome + e-mail], Município, Canal, Mensagem [`truncate`, 80 chars], Status; nada de segunda cópia para mobile. Município nulo → "—". Linha clicável (`role="button"`, `cliqueAcessivel` de `src/utils` se servir) → `setSelecionadoId(id)`. Vazio: "Nenhuma solicitação encontrada." KPIs e lista recarregam via `recarregar()`.

- [ ] **Step 4: Rota e nav**

Edições de `AppRouter.jsx` e `AdminLayout.jsx` do bloco Files.

- [ ] **Step 5: Rodar testes e lint**

Run: `npx vitest run src/pages/admin/SuporteAdminPage.test.jsx src/app` e `npx eslint src/pages/admin/SuporteAdminPage.jsx src/app`
Expected: verde.

- [ ] **Step 6: Commit**

```bash
git add frontend-observatorio/src/pages/admin/SuporteAdminPage.jsx frontend-observatorio/src/pages/admin/SuporteAdminPage.test.jsx frontend-observatorio/src/app
git commit -m "feat(suporte): pagina admin Atendimento com KPIs, filtros e lista paginada"
```

---

### Task 12: Detalhe do ticket no admin — contatos, status, anotações, histórico + `AGENTS.md`

**Files:**
- Create: `frontend-observatorio/src/pages/admin/SuporteTicketDetalhe.jsx`
- Create: `frontend-observatorio/src/pages/admin/SuporteTicketDetalhe.test.jsx`
- Modify: `frontend-observatorio/src/pages/admin/SuporteAdminPage.jsx` (renderizar o detalhe no placeholder)
- Modify: `AGENTS.md` (seção nova `# 16. Suporte (tickets de atendimento)` antes de `END OF AGENTS.md`)

**Interfaces:**
- Consumes: `api.get(`/suporte/admin/tickets/${id}`)` → `TicketAdminDetalheOut`; `api.patch(`/suporte/admin/tickets/${id}/status`, { status, texto })`; `api.post(`/suporte/admin/tickets/${id}/anotacoes`, { texto })`; `linkWhatsAppPara`; `StatusChip`, `STATUS_ORDEM`, `labelStatus`; `mensagemErroApi`; `useToast`; `useEscapeKey`.
- Produces: `export default function SuporteTicketDetalhe({ ticketId, onClose, onAtualizado })` — painel lateral (`fixed inset-y-0 right-0 w-full md:w-[520px]`, overlay) com: cabeçalho "Solicitação #{id}" + `StatusChip`; mensagem completa (`whitespace-pre-wrap`); bloco "Contato" (nome, e-mail, município ou "—", papel, WhatsApp formatado ou "não informado", canal preferido); `<a>` "Responder por e-mail" (`mailto:${email}?subject=${encodeURIComponent(`Suporte NID – solicitação #${id}`)}`) e `<a>` "Chamar no WhatsApp" (`linkWhatsAppPara(whatsapp, `Olá ${nome}, aqui é o suporte do NID sobre a sua solicitação #${id}.`)`, `target=_blank`, `rel`; sem número → `<span aria-disabled="true">`); bloco "Status": `<select aria-label="Novo status">` com as 3 opções (valor inicial = atual), input "Motivo/observação (opcional)", botão "Alterar status" (desabilitado se igual ao atual); bloco "Anotação interna": textarea + botão "Registrar"; "Histórico": eventos em ordem com data, autor e rótulo (`abertura` → "Solicitação aberta"; `status` → `${labelStatus(de)} → ${labelStatus(para)}`; `anotacao` → "Anotação"), e o `texto` do evento, quando houver, **num elemento próprio** abaixo do rótulo (os testes buscam o texto exato). Após PATCH/POST: atualiza o detalhe com a resposta, `addToast("Status atualizado." | "Anotação registrada.", "success")`, chama `onAtualizado()`. Erro → `addToast(mensagemErroApi(err), "error")`.

- [ ] **Step 1: Escrever o teste que falha**

```jsx
// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const addToast = vi.fn();
vi.mock("../../services/api", () => ({ default: { get: vi.fn(), patch: vi.fn(), post: vi.fn() } }));
vi.mock("../../context/ToastContext", () => ({ useToast: () => ({ addToast }) }));

import api from "../../services/api";
import SuporteTicketDetalhe from "./SuporteTicketDetalhe";

const DET = { id: 7, usuario_id: 2, usuario_nome: "Ana", usuario_email: "ana@alfa.gov.br", usuario_role: "VISUALIZADOR",
  municipio_id: 1, municipio_nome: "Alfa", mensagem: "Nao consigo exportar o grafico do PIB.", whatsapp: "5537999999999",
  canal_preferido: "whatsapp", status: "aberto", criado_em: "2026-10-19T12:00:00Z", atualizado_em: "2026-10-19T12:00:00Z",
  primeiro_contato_em: null, resolvido_em: null,
  eventos: [{ id: 1, tipo: "abertura", status_de: null, status_para: null, texto: null, autor_email: "ana@alfa.gov.br", criado_em: "2026-10-19T12:00:00Z" }] };

describe("SuporteTicketDetalhe", () => {
  beforeEach(() => { vi.clearAllMocks(); api.get.mockResolvedValue({ data: DET }); });

  it("mostra contatos com links de e-mail e WhatsApp e o historico", async () => {
    render(<SuporteTicketDetalhe ticketId={7} onClose={() => {}} onAtualizado={() => {}} />);
    expect(await screen.findByText("Nao consigo exportar o grafico do PIB.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Responder por e-mail/ }).getAttribute("href"))
      .toBe("mailto:ana@alfa.gov.br?subject=" + encodeURIComponent("Suporte NID – solicitação #7"));
    const wa = screen.getByRole("link", { name: /Chamar no WhatsApp/ });
    expect(wa.getAttribute("href")).toContain("https://wa.me/5537999999999?text=");
    expect(decodeURIComponent(wa.getAttribute("href"))).toContain("solicitação #7");
    expect(screen.getByText("Solicitação aberta")).toBeInTheDocument();
  });

  it("sem WhatsApp o botao fica desabilitado", async () => {
    api.get.mockResolvedValue({ data: { ...DET, whatsapp: null, canal_preferido: "email" } });
    render(<SuporteTicketDetalhe ticketId={7} onClose={() => {}} onAtualizado={() => {}} />);
    await screen.findByText(/não informado/);
    expect(screen.queryByRole("link", { name: /Chamar no WhatsApp/ })).toBeNull();
  });

  it("alterar status chama o PATCH e avisa", async () => {
    const atualizado = { ...DET, status: "em_atendimento", primeiro_contato_em: "2026-10-19T13:00:00Z",
      eventos: [...DET.eventos, { id: 2, tipo: "status", status_de: "aberto", status_para: "em_atendimento", texto: "liguei", autor_email: "admin@x.com", criado_em: "2026-10-19T13:00:00Z" }] };
    api.patch.mockResolvedValue({ data: atualizado });
    const onAtualizado = vi.fn();
    render(<SuporteTicketDetalhe ticketId={7} onClose={() => {}} onAtualizado={onAtualizado} />);
    await screen.findByText("Solicitação aberta");
    fireEvent.change(screen.getByLabelText("Novo status"), { target: { value: "em_atendimento" } });
    fireEvent.change(screen.getByLabelText(/Motivo/), { target: { value: "liguei" } });
    fireEvent.click(screen.getByRole("button", { name: /Alterar status/ }));
    await waitFor(() => expect(api.patch).toHaveBeenCalledWith("/suporte/admin/tickets/7/status", { status: "em_atendimento", texto: "liguei" }));
    expect(await screen.findByText(/Aberto → Em atendimento/)).toBeInTheDocument();
    expect(onAtualizado).toHaveBeenCalled();
    expect(addToast).toHaveBeenCalledWith("Status atualizado.", "success");
  });

  it("registrar anotacao chama o POST", async () => {
    api.post.mockResolvedValue({ data: { ...DET, eventos: [...DET.eventos, { id: 3, tipo: "anotacao", status_de: null, status_para: null, texto: "respondido por e-mail", autor_email: "admin@x.com", criado_em: "2026-10-19T14:00:00Z" }] } });
    render(<SuporteTicketDetalhe ticketId={7} onClose={() => {}} onAtualizado={() => {}} />);
    await screen.findByText("Solicitação aberta");
    fireEvent.change(screen.getByLabelText(/Anotação interna/), { target: { value: "respondido por e-mail" } });
    fireEvent.click(screen.getByRole("button", { name: /Registrar/ }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith("/suporte/admin/tickets/7/anotacoes", { texto: "respondido por e-mail" }));
    expect(await screen.findByText("respondido por e-mail")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/pages/admin/SuporteTicketDetalhe.test.jsx`
Expected: FAIL (módulo inexistente).

- [ ] **Step 3: Implementar `SuporteTicketDetalhe.jsx` e ligar na página**

Conforme o bloco Interfaces. Formatar WhatsApp para exibição: `55DD9XXXXXXXX` → `(DD) 9XXXX-XXXX` (helper local `formatarWhatsapp`). `body` do PATCH: `{ status, texto: motivo.trim() || null }`.

- [ ] **Step 4: Seção em `AGENTS.md`**

Acrescentar `# 16. Suporte (tickets de atendimento)` com: o que é (botão → menu → ticket; admin responde fora da plataforma), tabelas, endpoints (lado usuário e admin, roles), ações de auditoria, arquivos do front (`components/suporte/*`, `pages/admin/SuporteAdminPage.jsx`, `SuporteTicketDetalhe.jsx`), parâmetro `municipio_filtro` e o porquê, e o que ficou para o backlog (e-mails). Atualizar também a tabela da seção 8 / lista de rotas admin se houver lista equivalente para `/admin` (há apenas prosa; adicionar `/admin/suporte` à frase da seção 1 "Entry Point" não é necessário).

- [ ] **Step 5: Rodar tudo do front, lint e build**

Run: `npx vitest run` ; `npx eslint src` ; `npm run build`
Expected: testes verdes, lint limpo, build sem erro.

- [ ] **Step 6: Commit**

```bash
git add frontend-observatorio/src/pages/admin AGENTS.md
git commit -m "feat(suporte): detalhe do ticket com contatos, status, anotacoes e historico; AGENTS.md"
```

---

### Task 13: Verificação final e integração

**Files:** nenhum novo.

- [ ] **Step 1: Suíte completa do backend**

Run (de `backend/`): `../venv/Scripts/python -m pytest -q`
Expected: verde.

- [ ] **Step 2: Suíte completa do frontend + build**

Run (de `frontend-observatorio/`): `npx vitest run` e `npm run build`
Expected: verde / build ok.

- [ ] **Step 3: Checagem manual rápida com a skill `run` (se o ambiente permitir)**

Subir backend e frontend; logar como VISUALIZADOR: botão → menu → abrir ticket → "Meus atendimentos" mostra "Aberto". Logar como ADMIN_GLOBAL: `/admin/suporte` mostra KPIs, lista, detalhe, PATCH de status e anotação; "Meus atendimentos" do usuário mostra "Em atendimento". Com view-as ativo no admin, a lista continua completa.

- [ ] **Step 4: Revisão de branch e merge local**

Seguir `superpowers:finishing-a-development-branch`: revisão final, `git checkout main && git merge --no-ff feat/suporte-tickets` (o push é do usuário). Migração `0045` roda com `alembic upgrade head` no deploy.
