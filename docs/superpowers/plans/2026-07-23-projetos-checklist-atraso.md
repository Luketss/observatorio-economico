# Projetos: Checklist + Alerta de Atraso — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Checklist de tarefas (título + prazo + feito) gerenciado no modal de detalhes de projetos, com barra de progresso e alerta visual de atraso no card, modal, tabela e KPIs.

**Architecture:** Tabela nova `projeto_tarefa` (migration 0034) com endpoints aninhados sob `require_permissao("projetos", "editar")`; `ProjetoOut` embute as tarefas via `selectinload`; "atrasado" é derivado no cliente por helpers puros (`utils/projetoStatus.js`); o checklist interativo vive num componente próprio (`ChecklistProjeto.jsx`) consumido pelo modal redesenhado do `AcompanhamentoTab.jsx`.

**Tech Stack:** FastAPI + SQLAlchemy (sync) + Alembic + PostgreSQL; React + Vite + Tailwind + framer-motion; pytest (pure-logic) + vitest.

**Spec:** `docs/superpowers/specs/2026-07-23-projetos-checklist-atraso-design.md`

## Global Constraints

- Branch de trabalho: `feat/projetos-checklist` a partir de `main`.
- `backend/tests` NUNCA abre DB/rede — testes novos são pure-logic (schemas pydantic).
- Rodar pytest de `backend/`: `..\venv\Scripts\python.exe -m pytest tests/<arquivo> -v`. O resumo do pytest é engolido nesta máquina — **confie no exit code**.
- `backend/.env` aponta para o Postgres da RAILWAY (dev real). `alembic upgrade head` de `backend/`.
- Frontend: `npm run build` como gate (eslint baseline sujo: "motion unused" e set-state-in-effect são falsos-positivos endêmicos — ignorar apenas esses). Erros de API lidos de `err?.response?.data?.detail` (interceptor).
- Regra de atraso (verbatim do spec): projeto — `data_prazo < hoje` (data local) E `status !== "concluido"`; prazo HOJE não é atraso. Tarefa — não concluída E `prazo < hoje`; sem prazo → nunca atrasada.
- Permissão: TODA mutação de tarefa usa `require_permissao("projetos", "editar")` + tenant check do projeto pai (mesma ordem dos endpoints atuais: 404 projeto inexistente; 403 de outro município para não-global).
- Ordem de exibição das tarefas: `id` asc (ordem de criação). Sem reordenação manual, sem responsável por tarefa, sem checklist em templates (não-objetivos do spec).
- Pill de atraso usa o componente existente `StatusPill` com `kind="err"` (kinds disponíveis: ok/warn/err/draft/info/pro/premium/free).
- Commits em pt-BR estilo `feat(escopo): descrição`.

---

### Task 1: Backend — modelo `ProjetoTarefa` + migration 0034 + schemas

**Files:**
- Modify: `backend/app/models/projeto.py` (imports linha 4; nova classe após `Projeto`; relationship em `Projeto` ~linha 96)
- Create: `backend/alembic/versions/0034_projeto_tarefa.py`
- Modify: `backend/app/schemas/projeto.py` (novas classes + campo em `ProjetoOut` linha 83-100)
- Test: `backend/tests/test_projeto_tarefa_schema.py`

**Interfaces:**
- Consumes: `Base`, padrões de model/migration existentes.
- Produces (Tasks 2-3 e 5-6 dependem):
  - Model `ProjetoTarefa {id, projeto_id, titulo, prazo: date|None, concluida: bool, criado_em}` e `Projeto.tarefas` (ordenada por id, cascade delete-orphan)
  - Schemas `TarefaOut {id, titulo, prazo, concluida}`, `TarefaCreate {titulo, prazo?}`, `TarefaUpdate {titulo?, prazo?, concluida?}` (parcial)
  - `ProjetoOut.tarefas: list[TarefaOut] = []`

- [ ] **Step 1: Criar a branch**

```powershell
git checkout -b feat/projetos-checklist
```

- [ ] **Step 2: Teste de schema que falha**

Criar `backend/tests/test_projeto_tarefa_schema.py`:

```python
"""Validação pura dos schemas de tarefa de projeto (pydantic, sem DB)."""
from datetime import date

import pytest
from app.schemas.projeto import TarefaCreate, TarefaOut, TarefaUpdate


def test_create_valido():
    t = TarefaCreate(titulo="Licitação concluída", prazo="2026-08-01")
    assert t.prazo == date(2026, 8, 1)


def test_create_sem_prazo():
    t = TarefaCreate(titulo="Vistoria final")
    assert t.prazo is None


def test_create_titulo_obrigatorio():
    with pytest.raises(ValueError):
        TarefaCreate(prazo="2026-08-01")


def test_create_titulo_vazio():
    with pytest.raises(ValueError):
        TarefaCreate(titulo="   ")


def test_create_data_invalida():
    with pytest.raises(ValueError):
        TarefaCreate(titulo="X", prazo="31/08/2026")


def test_update_parcial_so_concluida():
    u = TarefaUpdate(concluida=True)
    assert u.model_dump(exclude_unset=True) == {"concluida": True}


def test_update_limpa_prazo_explicitamente():
    u = TarefaUpdate(prazo=None)
    assert u.model_dump(exclude_unset=True) == {"prazo": None}


def test_out_from_attributes():
    class Fake:
        id = 1
        titulo = "Obra iniciada"
        prazo = date(2026, 6, 1)
        concluida = False

    out = TarefaOut.model_validate(Fake())
    assert out.concluida is False
```

- [ ] **Step 3: Rodar e ver falhar**

De `backend/`:

```powershell
..\venv\Scripts\python.exe -m pytest tests/test_projeto_tarefa_schema.py -v
```

Expected: exit ≠ 0 (`ImportError: cannot import name 'TarefaCreate'`).

- [ ] **Step 4: Schemas em `backend/app/schemas/projeto.py`**

Adicionar `field_validator` ao import pydantic (linha 4) e, antes de `ProjetoOut`, a seção:

```python
# ── Tarefas (checklist do projeto) ────────────────────────────────────────────

class TarefaOut(BaseModel):
    id: int
    titulo: str
    prazo: Optional[date] = None
    concluida: bool

    class Config:
        from_attributes = True


class TarefaCreate(BaseModel):
    titulo: str
    prazo: Optional[date] = None

    @field_validator("titulo")
    @classmethod
    def titulo_nao_vazio(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("titulo é obrigatório")
        return v


class TarefaUpdate(BaseModel):
    titulo: Optional[str] = None
    prazo: Optional[date] = None
    concluida: Optional[bool] = None

    @field_validator("titulo")
    @classmethod
    def titulo_nao_vazio(cls, v):
        if v is None:
            return v
        v = v.strip()
        if not v:
            raise ValueError("titulo é obrigatório")
        return v
```

E em `ProjetoOut` (após `conteudo`, linha ~95):

```python
    tarefas: list[TarefaOut] = []
```

Rodar o teste de novo → exit 0.

- [ ] **Step 5: Model em `backend/app/models/projeto.py`**

Linha 4 ganha `Boolean`:

```python
from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Integer, String, Text
```

Em `Projeto`, junto às relationships (linha ~96):

```python
    tarefas = relationship(
        "ProjetoTarefa",
        back_populates="projeto",
        cascade="all, delete-orphan",
        order_by="ProjetoTarefa.id",
    )
```

Nova classe no fim do arquivo:

```python
class ProjetoTarefa(Base):
    """Item do checklist de um projeto em acompanhamento (título + prazo + feito)."""
    __tablename__ = "projeto_tarefa"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    projeto_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("projetos.id", ondelete="CASCADE"), nullable=False, index=True
    )
    titulo: Mapped[str] = mapped_column(String(255), nullable=False)
    prazo: Mapped[date | None] = mapped_column(Date, nullable=True)
    concluida: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    criado_em: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
    )

    projeto = relationship("Projeto", back_populates="tarefas")
```

- [ ] **Step 6: Migration `backend/alembic/versions/0034_projeto_tarefa.py`**

```python
"""add projeto_tarefa (checklist de projetos)

Tarefas do acompanhamento: titulo + prazo opcional + concluida.
FK com ondelete=CASCADE — some junto com o projeto (inclusive no bulk
delete do municipio_management, que nao dispara cascade Python).

Revision ID: 0034_projeto_tarefa
Revises: 0033_roles_permissoes
Create Date: 2026-07-23
"""

import sqlalchemy as sa
from alembic import op


revision = "0034_projeto_tarefa"
down_revision = "0033_roles_permissoes"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "projeto_tarefa",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("projeto_id", sa.Integer(), nullable=False),
        sa.Column("titulo", sa.String(length=255), nullable=False),
        sa.Column("prazo", sa.Date(), nullable=True),
        sa.Column("concluida", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column(
            "criado_em",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["projeto_id"], ["projetos.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_projeto_tarefa_id"), "projeto_tarefa", ["id"], unique=False)
    op.create_index(
        op.f("ix_projeto_tarefa_projeto_id"), "projeto_tarefa", ["projeto_id"], unique=False
    )


def downgrade():
    op.drop_index(op.f("ix_projeto_tarefa_projeto_id"), table_name="projeto_tarefa")
    op.drop_index(op.f("ix_projeto_tarefa_id"), table_name="projeto_tarefa")
    op.drop_table("projeto_tarefa")
```

- [ ] **Step 7: Aplicar na Railway e verificar**

De `backend/`:

```powershell
..\venv\Scripts\python.exe -m alembic upgrade head
..\venv\Scripts\python.exe -c "from app.db.session import SessionLocal; from sqlalchemy import text; db=SessionLocal(); print(db.execute(text('SELECT count(*) FROM projeto_tarefa')).scalar())"
```

Expected: `Running upgrade 0033_roles_permissoes -> 0034_projeto_tarefa`; depois `0`.

- [ ] **Step 8: Suite completa**

```powershell
..\venv\Scripts\python.exe -m pytest tests -q
..\venv\Scripts\python.exe -c "import app.main"
```

Expected: exit 0 nos dois.

- [ ] **Step 9: Commit**

```powershell
git add backend/app/models/projeto.py backend/alembic/versions/0034_projeto_tarefa.py backend/app/schemas/projeto.py backend/tests/test_projeto_tarefa_schema.py
git commit -m "feat(projetos): modelo e migration 0034 do checklist de tarefas"
```

---

### Task 2: Backend — endpoints aninhados de tarefas + tarefas embutidas no GET

**Files:**
- Modify: `backend/app/api/v1/routers/projetos.py` (imports linhas 3-21; `listar_projetos` linha ~212; seção nova no fim)

**Interfaces:**
- Consumes: `ProjetoTarefa`, `TarefaOut/TarefaCreate/TarefaUpdate` (Task 1), `require_permissao` (existente em deps).
- Produces (Task 5 consome):
  - `POST /api/v1/projetos/{projeto_id}/tarefas` body `{titulo, prazo?}` → `TarefaOut`
  - `PUT /api/v1/projetos/{projeto_id}/tarefas/{tarefa_id}` body parcial → `TarefaOut`
  - `DELETE /api/v1/projetos/{projeto_id}/tarefas/{tarefa_id}` → `{"ok": true}`
  - `GET /projetos` passa a devolver `tarefas: [...]` em cada projeto

- [ ] **Step 1: Ajustar imports**

- Linha 5: adicionar `ProjetoTarefa` → `from app.models.projeto import Projeto, ProjetoEixo, ProjetoImagemPreset, ProjetoTarefa, ProjetoTemplate`
- Bloco de schemas (linhas 7-19): adicionar `TarefaCreate, TarefaOut, TarefaUpdate`
- Linha 21: `from sqlalchemy.orm import Session, selectinload`

- [ ] **Step 2: `listar_projetos` com selectinload** (linha ~218)

```python
    query = db.query(Projeto).options(selectinload(Projeto.tarefas))
```

(resto da função inalterado.)

- [ ] **Step 3: Seção nova no fim do arquivo**

```python
# ── Tarefas (checklist do projeto) ────────────────────────────────────────────

def _get_projeto_do_usuario(db: Session, projeto_id: int, current_user: Usuario) -> Projeto:
    """Projeto existente e do município do usuário (global passa)."""
    projeto = db.get(Projeto, projeto_id)
    if not projeto:
        raise NotFoundException("Projeto not found")
    if current_user.role.nome != "ADMIN_GLOBAL" and projeto.municipio_id != current_user.municipio_id:
        raise ForbiddenException("Insufficient permissions")
    return projeto


@router.post("/{projeto_id}/tarefas", response_model=TarefaOut)
def criar_tarefa(
    projeto_id: int,
    data: TarefaCreate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_permissao("projetos", "editar")),
):
    projeto = _get_projeto_do_usuario(db, projeto_id, current_user)
    tarefa = ProjetoTarefa(projeto_id=projeto.id, **data.model_dump())
    db.add(tarefa)
    db.commit()
    db.refresh(tarefa)
    return tarefa


@router.put("/{projeto_id}/tarefas/{tarefa_id}", response_model=TarefaOut)
def atualizar_tarefa(
    projeto_id: int,
    tarefa_id: int,
    data: TarefaUpdate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_permissao("projetos", "editar")),
):
    projeto = _get_projeto_do_usuario(db, projeto_id, current_user)
    tarefa = db.get(ProjetoTarefa, tarefa_id)
    if not tarefa or tarefa.projeto_id != projeto.id:
        raise NotFoundException("Tarefa not found")
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(tarefa, field, value)
    db.commit()
    db.refresh(tarefa)
    return tarefa


@router.delete("/{projeto_id}/tarefas/{tarefa_id}")
def deletar_tarefa(
    projeto_id: int,
    tarefa_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_permissao("projetos", "editar")),
):
    projeto = _get_projeto_do_usuario(db, projeto_id, current_user)
    tarefa = db.get(ProjetoTarefa, tarefa_id)
    if not tarefa or tarefa.projeto_id != projeto.id:
        raise NotFoundException("Tarefa not found")
    db.delete(tarefa)
    db.commit()
    return {"ok": True}
```

Nota: os paths `/{projeto_id}/tarefas...` não colidem com as rotas existentes (`/imagens`, `/eixos`, `/acervo`, `/{projeto_id}`) — segmentos distintos.

- [ ] **Step 4: Sanidade + suite**

De `backend/`:

```powershell
..\venv\Scripts\python.exe -c "import app.main"
..\venv\Scripts\python.exe -m pytest tests -q
```

Expected: exit 0 nos dois.

- [ ] **Step 5: Commit**

```powershell
git add backend/app/api/v1/routers/projetos.py
git commit -m "feat(projetos): endpoints de tarefas e tarefas embutidas no GET"
```

---

### Task 3: Backend — clone de município copia as tarefas

**Files:**
- Modify: `backend/app/services/municipio_management.py` (import ~linha 60; loop de `clone_municipio_data` linhas ~210-226)

**Interfaces:**
- Consumes: `ProjetoTarefa` (Task 1), `Projeto.tarefas`.
- Produces: comportamento — clone de município copia os projetos COM seus checklists (mapeando os PKs novos). Delete de município NÃO muda (bulk delete + FK `ondelete=CASCADE` cobre as tarefas — verificar apenas).

- [ ] **Step 1: Import** (junto à linha 60)

```python
from app.models.projeto import Projeto, ProjetoTarefa
```

- [ ] **Step 2: Special-case no loop de `clone_municipio_data`**

O loop genérico (linhas ~210-226) usa `_copy_row` + `add_all`, que não preserva o mapeamento PK antigo→novo — as tarefas precisam do id novo do projeto. Inserir ANTES do caminho genérico, dentro do `for model in ALL_MODELS:` (após o `if not rows: continue`):

```python
        if model is Projeto:
            # Projetos precisam de flush por linha: as tarefas do checklist
            # penduram no PK novo (o caminho genérico add_all não mapeia PKs).
            new_rows = []
            for r in rows:
                novo = _copy_row(r, target_id)
                db.add(novo)
                db.flush()
                for t in r.tarefas:
                    db.add(
                        ProjetoTarefa(
                            projeto_id=novo.id,
                            titulo=t.titulo,
                            prazo=t.prazo,
                            concluida=t.concluida,
                        )
                    )
                new_rows.append(novo)
            try:
                db.commit()
            except Exception:
                db.rollback()
                logger.exception("Clone failed at model %s", model.__name__)
                raise HTTPException(
                    status_code=500,
                    detail=f"Falha ao clonar tabela {model.__name__}. Operação parcial — verifique o município destino.",
                )
            summary[model.__name__] = len(new_rows)
            logger.info(
                "Cloned %s rows from %s (source=%s → target=%s)",
                len(new_rows), model.__name__, source_id, target_id,
            )
            continue
```

(o caminho genérico continua valendo para os demais models.)

- [ ] **Step 3: Verificar o delete (sem mudança de código)**

Ler `delete_municipio_cascade` e confirmar que `Projeto` é removido por bulk delete (`.delete(synchronize_session=False)` ou equivalente) — nesse caso as tarefas caem pelo FK de banco `ondelete=CASCADE` e NENHUMA mudança é necessária. Registrar a confirmação no report/commit. Se o delete for por instância ORM, o cascade Python (`delete-orphan`) cobre igualmente — também sem mudança.

- [ ] **Step 4: Sanidade + suite**

De `backend/`:

```powershell
..\venv\Scripts\python.exe -c "import app.main"
..\venv\Scripts\python.exe -m pytest tests -q
```

Expected: exit 0.

- [ ] **Step 5: Commit**

```powershell
git add backend/app/services/municipio_management.py
git commit -m "feat(projetos): clone de municipio copia o checklist dos projetos"
```

---

### Task 4: Frontend — helpers puros de atraso e progresso

**Files:**
- Create: `frontend-observatorio/src/utils/projetoStatus.js`
- Test: `frontend-observatorio/src/utils/projetoStatus.test.js`

**Interfaces:**
- Consumes: nada.
- Produces (Tasks 5-6 consomem):
  - `diasAtraso(projeto, hoje?) -> null | int>=1` (dias corridos; prazo hoje → null)
  - `tarefaAtrasada(tarefa, hoje?) -> boolean`
  - `progresso(tarefas) -> null | {feitas, total, pct}`

- [ ] **Step 1: Teste vitest que falha**

Criar `frontend-observatorio/src/utils/projetoStatus.test.js`:

```js
import { describe, expect, it } from "vitest";
import { diasAtraso, progresso, tarefaAtrasada } from "./projetoStatus";

const HOJE = new Date("2026-07-23T12:00:00");

describe("diasAtraso", () => {
  it("null sem data_prazo", () => {
    expect(diasAtraso({ status: "em_andamento" }, HOJE)).toBe(null);
  });
  it("null quando concluido, mesmo vencido", () => {
    expect(diasAtraso({ data_prazo: "2026-07-01", status: "concluido" }, HOJE)).toBe(null);
  });
  it("prazo hoje nao e atraso", () => {
    expect(diasAtraso({ data_prazo: "2026-07-23", status: "em_andamento" }, HOJE)).toBe(null);
  });
  it("prazo ontem = 1 dia", () => {
    expect(diasAtraso({ data_prazo: "2026-07-22", status: "em_andamento" }, HOJE)).toBe(1);
  });
  it("12 dias de atraso", () => {
    expect(diasAtraso({ data_prazo: "2026-07-11", status: "nao_iniciado" }, HOJE)).toBe(12);
  });
});

describe("tarefaAtrasada", () => {
  it("false sem prazo", () => {
    expect(tarefaAtrasada({ concluida: false }, HOJE)).toBe(false);
  });
  it("false quando concluida", () => {
    expect(tarefaAtrasada({ prazo: "2026-07-01", concluida: true }, HOJE)).toBe(false);
  });
  it("false com prazo hoje", () => {
    expect(tarefaAtrasada({ prazo: "2026-07-23", concluida: false }, HOJE)).toBe(false);
  });
  it("true com prazo vencido e nao concluida", () => {
    expect(tarefaAtrasada({ prazo: "2026-07-22", concluida: false }, HOJE)).toBe(true);
  });
});

describe("progresso", () => {
  it("null para lista vazia ou ausente", () => {
    expect(progresso([])).toBe(null);
    expect(progresso(undefined)).toBe(null);
  });
  it("parcial", () => {
    expect(
      progresso([{ concluida: true }, { concluida: true }, { concluida: false }])
    ).toEqual({ feitas: 2, total: 3, pct: 67 });
  });
  it("completa", () => {
    expect(progresso([{ concluida: true }])).toEqual({ feitas: 1, total: 1, pct: 100 });
  });
});
```

De `frontend-observatorio/`: `npx vitest run src/utils/projetoStatus.test.js` → FAIL (módulo não existe).

- [ ] **Step 2: Criar `frontend-observatorio/src/utils/projetoStatus.js`**

```js
// Regras de atraso e progresso do acompanhamento de projetos.
// Datas "YYYY-MM-DD" comparadas em data local (mesmo tratamento do fmtDate
// das páginas: new Date(d + "T00:00:00")).

const DIA_MS = 24 * 60 * 60 * 1000;

function dataLocal(iso) {
  return new Date(iso + "T00:00:00");
}

function hojeZerado(hoje) {
  const d = hoje ? new Date(hoje) : new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export function diasAtraso(projeto, hoje) {
  if (!projeto?.data_prazo || projeto.status === "concluido") return null;
  const diff = Math.round((hojeZerado(hoje) - dataLocal(projeto.data_prazo)) / DIA_MS);
  return diff >= 1 ? diff : null;
}

export function tarefaAtrasada(tarefa, hoje) {
  if (!tarefa?.prazo || tarefa.concluida) return false;
  return dataLocal(tarefa.prazo) < hojeZerado(hoje);
}

export function progresso(tarefas) {
  if (!tarefas || tarefas.length === 0) return null;
  const feitas = tarefas.filter((t) => t.concluida).length;
  return {
    feitas,
    total: tarefas.length,
    pct: Math.round((feitas / tarefas.length) * 100),
  };
}
```

- [ ] **Step 3: Rodar e ver passar**

```powershell
npx vitest run src/utils/projetoStatus.test.js
```

Expected: 12 passed, exit 0.

- [ ] **Step 4: Commit**

```powershell
git add frontend-observatorio/src/utils/projetoStatus.js frontend-observatorio/src/utils/projetoStatus.test.js
git commit -m "feat(projetos): helpers puros de atraso e progresso"
```

---

### Task 5: Frontend — componente `ChecklistProjeto`

**Files:**
- Create: `frontend-observatorio/src/pages/projetos/ChecklistProjeto.jsx`

**Interfaces:**
- Consumes: endpoints de tarefas (Task 2), `tarefaAtrasada` (Task 4), `api`, `useToast`.
- Produces (Task 6 consome): `<ChecklistProjeto projeto={p} canEditar={bool} onChange={(tarefas) => ...} />` — gerencia as chamadas de API internamente e devolve a lista atualizada via `onChange`.

- [ ] **Step 1: Criar o componente**

```jsx
import { useState } from "react";
import { CheckIcon, PencilIcon, PlusIcon, TrashIcon, XMarkIcon } from "@heroicons/react/24/outline";
import api from "../../services/api";
import { useToast } from "../../context/ToastContext";
import { tarefaAtrasada } from "../../utils/projetoStatus";

function fmtData(d) {
  if (!d) return null;
  return new Date(d + "T00:00:00").toLocaleDateString("pt-BR");
}

export default function ChecklistProjeto({ projeto, canEditar, onChange }) {
  const { addToast } = useToast();
  const tarefas = projeto.tarefas || [];
  const [novoTitulo, setNovoTitulo] = useState("");
  const [novoPrazo, setNovoPrazo] = useState("");
  const [editandoId, setEditandoId] = useState(null);
  const [editTitulo, setEditTitulo] = useState("");
  const [editPrazo, setEditPrazo] = useState("");
  const [saving, setSaving] = useState(false);

  async function adicionar(e) {
    e.preventDefault();
    const titulo = novoTitulo.trim();
    if (!titulo) return;
    setSaving(true);
    try {
      const res = await api.post(`/projetos/${projeto.id}/tarefas`, {
        titulo,
        prazo: novoPrazo || null,
      });
      onChange([...tarefas, res.data]);
      setNovoTitulo("");
      setNovoPrazo("");
    } catch (err) {
      addToast(err?.response?.data?.detail || "Erro ao adicionar tarefa", "error");
    } finally {
      setSaving(false);
    }
  }

  async function toggle(t) {
    try {
      const res = await api.put(`/projetos/${projeto.id}/tarefas/${t.id}`, {
        concluida: !t.concluida,
      });
      onChange(tarefas.map((x) => (x.id === t.id ? res.data : x)));
    } catch {
      addToast("Erro ao atualizar tarefa", "error");
    }
  }

  function comecarEdicao(t) {
    setEditandoId(t.id);
    setEditTitulo(t.titulo);
    setEditPrazo(t.prazo || "");
  }

  async function salvarEdicao(e) {
    e.preventDefault();
    const titulo = editTitulo.trim();
    if (!titulo) return;
    setSaving(true);
    try {
      const res = await api.put(`/projetos/${projeto.id}/tarefas/${editandoId}`, {
        titulo,
        prazo: editPrazo || null,
      });
      onChange(tarefas.map((x) => (x.id === editandoId ? res.data : x)));
      setEditandoId(null);
    } catch (err) {
      addToast(err?.response?.data?.detail || "Erro ao salvar tarefa", "error");
    } finally {
      setSaving(false);
    }
  }

  async function excluir(t) {
    try {
      await api.delete(`/projetos/${projeto.id}/tarefas/${t.id}`);
      onChange(tarefas.filter((x) => x.id !== t.id));
      addToast("Tarefa excluída", "success");
    } catch {
      addToast("Erro ao excluir tarefa", "error");
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <p style={{ fontSize: 10, fontFamily: "var(--font-mono)", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-mute)", margin: 0 }}>
        Checklist
      </p>

      {tarefas.length === 0 && (
        <p style={{ fontSize: 12, color: "var(--text-mute)", margin: 0 }}>Nenhuma tarefa ainda.</p>
      )}

      {tarefas.map((t) => {
        const atrasada = tarefaAtrasada(t);
        if (editandoId === t.id) {
          return (
            <form key={t.id} onSubmit={salvarEdicao} style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <input
                value={editTitulo}
                onChange={(e) => setEditTitulo(e.target.value)}
                className="nid-form-input"
                style={{ flex: 1, fontSize: 12, padding: "4px 8px" }}
                aria-label="Título da tarefa"
                autoFocus
              />
              <input
                type="date"
                value={editPrazo}
                onChange={(e) => setEditPrazo(e.target.value)}
                className="nid-form-input"
                style={{ fontSize: 12, padding: "4px 8px", width: 140 }}
                aria-label="Prazo da tarefa"
              />
              <button type="submit" disabled={saving} aria-label="Salvar tarefa" className="proj-card__icon-btn">
                <CheckIcon className="w-4 h-4" />
              </button>
              <button type="button" onClick={() => setEditandoId(null)} aria-label="Cancelar edição" className="proj-card__icon-btn">
                <XMarkIcon className="w-4 h-4" />
              </button>
            </form>
          );
        }
        return (
          <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input
              type="checkbox"
              checked={t.concluida}
              onChange={() => toggle(t)}
              disabled={!canEditar}
              aria-label={`Concluir ${t.titulo}`}
              style={{ cursor: canEditar ? "pointer" : "default", flexShrink: 0 }}
            />
            <span
              style={{
                flex: 1,
                fontSize: 13,
                color: atrasada ? "var(--accent-2)" : t.concluida ? "var(--text-mute)" : "var(--text)",
                textDecoration: t.concluida ? "line-through" : "none",
              }}
            >
              {t.titulo}
            </span>
            {t.prazo && (
              <span style={{ fontSize: 11, fontFamily: "var(--font-mono)", color: atrasada ? "var(--accent-2)" : "var(--text-mute)", flexShrink: 0 }}>
                {fmtData(t.prazo)}
                {atrasada && " !"}
              </span>
            )}
            {canEditar && (
              <span style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                <button onClick={() => comecarEdicao(t)} aria-label="Editar tarefa" className="proj-card__icon-btn">
                  <PencilIcon className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => excluir(t)} aria-label="Excluir tarefa" className="proj-card__icon-btn proj-card__icon-btn--danger">
                  <TrashIcon className="w-3.5 h-3.5" />
                </button>
              </span>
            )}
          </div>
        );
      })}

      {canEditar && (
        <form onSubmit={adicionar} style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 4 }}>
          <input
            value={novoTitulo}
            onChange={(e) => setNovoTitulo(e.target.value)}
            placeholder="+ Nova tarefa"
            className="nid-form-input"
            style={{ flex: 1, fontSize: 12, padding: "4px 8px" }}
            aria-label="Nova tarefa"
          />
          <input
            type="date"
            value={novoPrazo}
            onChange={(e) => setNovoPrazo(e.target.value)}
            className="nid-form-input"
            style={{ fontSize: 12, padding: "4px 8px", width: 140 }}
            aria-label="Prazo da nova tarefa"
          />
          <button type="submit" disabled={saving || !novoTitulo.trim()} aria-label="Adicionar tarefa" className="proj-card__icon-btn">
            <PlusIcon className="w-4 h-4" />
          </button>
        </form>
      )}
    </div>
  );
}
```

Nota: `var(--accent-2)` é o tom de alerta/vermelho usado para erros no app (ex.: `formError` em AcompanhamentoTab linha 691). `proj-card__icon-btn` é a classe dos botões de ícone já usada nos cards.

- [ ] **Step 2: Build**

De `frontend-observatorio/`: `npm run build` → exit 0.

- [ ] **Step 3: Commit**

```powershell
git add frontend-observatorio/src/pages/projetos/ChecklistProjeto.jsx
git commit -m "feat(projetos): componente ChecklistProjeto interativo"
```

---

### Task 6: Frontend — modal redesenhado + card + tabela + KPI

**Files:**
- Modify: `frontend-observatorio/src/pages/projetos/AcompanhamentoTab.jsx` (imports; KPIs linha ~104 e ~333; `ProjetoCard` linhas 233-328; tabela linha ~459; modal de detalhes linhas 485-534)

**Interfaces:**
- Consumes: `ChecklistProjeto` (Task 5), `diasAtraso`/`progresso` (Task 4), `StatusPill kind="err"`, `tarefas` embutidas no `GET /projetos` (Task 2).
- Produces: UI final — nada novo exportado.

- [ ] **Step 1: Imports**

```jsx
import ChecklistProjeto from "./ChecklistProjeto";
import { diasAtraso, progresso } from "../../utils/projetoStatus";
```

- [ ] **Step 2: Sincronização das tarefas** (junto aos handlers, após `handleStatusChange`)

```jsx
  function handleTarefasChange(projetoId, tarefas) {
    setProjetos((prev) => prev.map((p) => (p.id === projetoId ? { ...p, tarefas } : p)));
    setViewingProjeto((prev) => (prev && prev.id === projetoId ? { ...prev, tarefas } : prev));
  }
```

- [ ] **Step 3: KPI "Atrasados"**

No `useMemo` de `kpis` (linha ~104), adicionar:

```jsx
    atrasados: projetos.filter((p) => diasAtraso(p) !== null).length,
```

Na renderização (linha ~333): array ganha `{ label: "Atrasados", value: kpis.atrasados, accent: "var(--accent-2)" }` e o grid vira `grid grid-cols-2 md:grid-cols-5 gap-4`.

- [ ] **Step 4: Card do kanban** (`ProjetoCard`, linhas 233-328)

No topo do componente:

```jsx
    const atraso = diasAtraso(projeto);
    const prog = progresso(projeto.tarefas);
```

Na seção "Meta info" (linhas 292-308), a linha do prazo passa a incluir a pill quando atrasado:

```jsx
          {projeto.data_prazo && (
            <span style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
              <CalendarDaysIcon style={{ width: 12, height: 12 }} /> Prazo: {fmtDate(projeto.data_prazo)}
              {atraso !== null && <StatusPill kind="err" dot label={`Atrasado há ${atraso}d`} />}
            </span>
          )}
```

Logo após o bloco de meta (antes do footer, linha ~310), a mini barra de progresso:

```jsx
        {prog && (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ flex: 1, height: 4, borderRadius: 999, background: "var(--panel-2)", overflow: "hidden" }}>
              <div style={{ width: `${prog.pct}%`, height: "100%", borderRadius: 999, background: "var(--accent-1)" }} />
            </div>
            <span style={{ fontSize: 10, fontFamily: "var(--font-mono)", color: "var(--text-mute)", flexShrink: 0 }}>
              {prog.feitas}/{prog.total}
            </span>
          </div>
        )}
```

- [ ] **Step 5: Tabela** — célula do prazo (linha ~459):

```jsx
                      <td style={{ padding: "10px 20px", color: diasAtraso(p) !== null ? "var(--accent-2)" : "var(--text-mute)", fontSize: 11 }}>
                        {fmtDate(p.data_prazo) || "—"}
                        {diasAtraso(p) !== null && " · atrasado"}
                      </td>
```

- [ ] **Step 6: Modal de detalhes redesenhado**

No `motion.div` `nid-modal` do modal de detalhes (linha ~500), `style={{ maxWidth: 520 }}` vira `style={{ maxWidth: 680 }}`. TODO o conteúdo interno atual (o header com pill+título+close das linhas 503-514, a descrição, o conteúdo e o rodapé de meta das linhas 516-530) é substituído pelo corpo novo abaixo — o backdrop, o `motion.div` e seus handlers de fechar não mudam:

```jsx
              {(() => {
                const st = STATUS_CONFIG[viewingProjeto.status] || STATUS_CONFIG.nao_iniciado;
                const atraso = diasAtraso(viewingProjeto);
                const prog = progresso(viewingProjeto.tarefas);
                return (
                  <>
                    {/* Cabeçalho: pills + título + progresso */}
                    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          <StatusPill kind={st.kind} dot label={st.label} />
                          {atraso !== null && <StatusPill kind="err" dot label={`⚠ Atrasado há ${atraso}d`} />}
                        </div>
                        <h2 style={{ fontSize: 17, fontWeight: 700, color: "var(--text)", margin: "8px 0 0" }}>{viewingProjeto.titulo}</h2>
                        {prog && (
                          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10 }}>
                            <div style={{ flex: 1, height: 6, borderRadius: 999, background: "var(--panel-2)", overflow: "hidden" }}>
                              <div style={{ width: `${prog.pct}%`, height: "100%", borderRadius: 999, background: "var(--accent-1)" }} />
                            </div>
                            <span style={{ fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--text-dim)", flexShrink: 0 }}>
                              {prog.feitas}/{prog.total} tarefas · {prog.pct}%
                            </span>
                          </div>
                        )}
                      </div>
                      <button onClick={() => setViewingProjeto(null)} className="nid-modal__close">
                        <XMarkIcon className="w-5 h-5" />
                      </button>
                    </div>

                    {/* Metadados */}
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "10px 20px", borderTop: "1px solid var(--border)", paddingTop: 12, fontSize: 11, color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>
                      {eixoLabel(viewingProjeto.eixo_id) && <span><span style={{ fontWeight: 600 }}>Eixo:</span> {eixoLabel(viewingProjeto.eixo_id)}</span>}
                      {viewingProjeto.departamento && <span><span style={{ fontWeight: 600 }}>Departamento:</span> {viewingProjeto.departamento}</span>}
                      {viewingProjeto.responsavel && <span><span style={{ fontWeight: 600 }}>Responsável:</span> {viewingProjeto.responsavel}</span>}
                      {viewingProjeto.data_inicio && <span><span style={{ fontWeight: 600 }}>Início:</span> {fmtDate(viewingProjeto.data_inicio)}</span>}
                      {viewingProjeto.data_prazo && (
                        <span style={{ color: atraso !== null ? "var(--accent-2)" : undefined }}>
                          <span style={{ fontWeight: 600 }}>Prazo:</span> {fmtDate(viewingProjeto.data_prazo)}
                        </span>
                      )}
                    </div>

                    {/* Descrição */}
                    {viewingProjeto.descricao && (
                      <p style={{ fontSize: 13, color: "var(--text-dim)", lineHeight: 1.6, borderTop: "1px solid var(--border)", paddingTop: 12 }}>{viewingProjeto.descricao}</p>
                    )}

                    {/* Checklist */}
                    <div style={{ borderTop: "1px solid var(--border)", paddingTop: 12 }}>
                      <ChecklistProjeto
                        projeto={viewingProjeto}
                        canEditar={canEditar}
                        onChange={(tarefas) => handleTarefasChange(viewingProjeto.id, tarefas)}
                      />
                    </div>

                    {/* Notas */}
                    {viewingProjeto.conteudo && (
                      <div style={{ fontSize: 13, color: "var(--text-dim)", whiteSpace: "pre-line", borderTop: "1px solid var(--border)", paddingTop: 12, lineHeight: 1.6 }}>
                        <p style={{ fontSize: 10, fontFamily: "var(--font-mono)", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-mute)", margin: "0 0 6px" }}>Notas</p>
                        {viewingProjeto.conteudo}
                      </div>
                    )}
                  </>
                );
              })()}
```

- [ ] **Step 7: vitest + build**

De `frontend-observatorio/`:

```powershell
npx vitest run
npm run build
```

Expected: exit 0 nos dois.

- [ ] **Step 8: Commit**

```powershell
git add frontend-observatorio/src/pages/projetos/AcompanhamentoTab.jsx
git commit -m "feat(projetos): modal redesenhado com checklist, progresso e alerta de atraso"
```

---

### Task 7: Verificação final

**Files:** nenhum novo (correções pontuais se falhar).

- [ ] **Step 1: Gates**

De `backend/`: `..\venv\Scripts\python.exe -m pytest tests -q` → exit 0.
De `frontend-observatorio/`: `npx vitest run` e `npm run build` → exit 0.

- [ ] **Step 2: E2E de API contra a Railway** (script no scratchpad, `TestClient(app)` + token forjado via `create_access_token`, padrão da verificação da feature de roles; limpar TUDO ao final com try/finally)

1. Como usuário de município com `projetos/editar` (forjar token de um ADMIN_MUNICIPIO de Divinópolis ou criar usuário de teste): `POST /projetos` com `data_prazo` vencida → criar 3 tarefas via `POST /projetos/{id}/tarefas` (uma com prazo vencido) → `GET /projetos` retorna o projeto com `tarefas` embutidas (3 itens).
2. `PUT .../tarefas/{tid}` marcando `concluida: true` → resposta reflete; `PUT` parcial só de `prazo: null` limpa a data.
3. `DELETE .../tarefas/{tid}` → some do GET.
4. Tarefa de projeto de OUTRO município → 403 (para usuário não-global); tarefa inexistente → 404; PUT de tarefa cujo id pertence a outro projeto → 404.
5. Usuário sem `projetos/editar` (VISUALIZADOR) → `POST tarefas` 403.
6. Cleanup: excluir projeto de teste (tarefas caem via cascade — confirmar com `SELECT count(*)` na tabela) e usuário de teste se criado.

- [ ] **Step 3: Checklist visual (fica para o usuário)**

No browser contra a Railway: card com pill "Atrasado há Nd" + mini barra N/M; modal 680px com seções, checklist interativo (marcar/adicionar/editar/excluir), tarefa vencida em vermelho; KPI "Atrasados"; tabela com prazo vermelho; usuário somente-leitura vê checklist sem controles.

- [ ] **Step 4: Ledger**

Registrar conclusão e residuais no `.superpowers/sdd/progress.md`.
