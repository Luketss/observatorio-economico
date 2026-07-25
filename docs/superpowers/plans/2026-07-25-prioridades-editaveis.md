# Prioridades do mês editáveis — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir que ADMIN_GLOBAL (em /admin/insights) e usuários de município com permissão (inline no `PrioridadesPanel`) editem as prioridades do mês, hoje geradas só por IA.

**Architecture:** Nova área `"prioridades"` no sistema de permissões (migration data-only para o builtin ADMIN_MUNICIPIO) + `PUT /insights/prioridades` com upsert do mês corrente (`modelo="especialista"`, espelho do precedente `inserir_release`). No frontend, um `PrioridadesEditorModal` compartilhado pelas duas personas e helpers puros em `utils/prioridadesForm.js`.

**Tech Stack:** FastAPI + SQLAlchemy + Alembic (backend), React + Vite + framer-motion (frontend), pytest puro + vitest.

**Spec:** `docs/superpowers/specs/2026-07-25-prioridades-editaveis-design.md`

## Global Constraints

- Área nova: `"prioridades"`, label `"Prioridades do Mês"`. O backend consulta **apenas** o verbo `editar` para essa área.
- Migration 0035 é **data-only** (zero schema): adiciona `"prioridades": ["criar", "editar", "excluir"]` ao JSON `permissoes` do builtin ADMIN_MUNICIPIO (paridade com `PERMISSOES_TODAS`/seed; verbos extras inertes). `backend/app/db/seed.py` NÃO muda (deriva de `PERMISSOES_TODAS`).
- **Formato armazenado inalterado:** `conteudo` = JSON de `[{titulo, observacao, dataset_referencia}]`; o tipo (Atenção/Oportunidade/Risco) é prefixo do `titulo`, composto no frontend.
- PUT: upsert por `(municipio_id, "prioridades", periodo=UTC "%Y-%m")`; update preserva `ativo`/`oculto_planos`; `modelo="especialista"`; `gerado_em=now(UTC)`.
- Guard do PUT: ADMIN_GLOBAL exige `municipio_id` no body (400 `"municipio_id é obrigatório."` sem); usuário comum exige `tem_permissao(role, "prioridades", "editar")` (403 `"Sem permissão para editar prioridades."`) e grava SEMPRE em `current_user.municipio_id` (body.municipio_id ignorado); usuário sem município: 400 `"Usuário sem município."`.
- `GET /insights/prioridades` e `POST /insights/prioridades/gerar` NÃO mudam.
- Editor: 1–3 itens; tipos `["Atenção", "Oportunidade", "Risco"]` + "Sem destaque" (= sem prefixo); dataset opcional.
- Toast de sucesso do editor: `"Prioridades atualizadas"`. Erro inline: `detail` do backend se string, senão `"Erro ao salvar."`.
- Confirm do Regenerar (só quando `prioridades?.modelo === "especialista"`): `"Há edição manual deste mês — regenerar substitui o conteúdo pela versão de IA. Continuar?"`.
- Gates por task: backend `venv\Scripts\python -m pytest backend/tests -q` da RAIZ com **exit code 0** (o resumo "N passed" é engolido nesta máquina); frontend `npm run test` e `npm run build` de `frontend-observatorio/` com exit 0. Eslint tem baseline sujo conhecido — não é gate.
- `backend/.env` aponta para o Postgres da RAILWAY (DB real): alembic roda contra ele.
- Commits com escopo `feat(prioridades):`. NÃO commitar WIP do usuário: `.claude/settings.local.json`, `README.md`, `dados/`, `docs/superpowers/plans/2026-05-06-ips-feature.md`, `IDEAS.md`.

---

### Task 1: Branch + área "prioridades" em permissions.py — TDD

**Files:**
- Modify: `backend/app/core/permissions.py:8-33` (AREAS e AREA_LABELS)
- Test: `backend/tests/test_permissions.py` (append)

**Interfaces:**
- Consumes: nada.
- Produces: `"prioridades"` presente em `AREAS` e `AREA_LABELS` (`"Prioridades do Mês"`). `tem_permissao(role, "prioridades", "editar")` passa a funcionar para roles com a área. Os testes de paridade existentes (`test_area_labels_cobre_todas_as_areas`, `test_permissoes_todas_cobre_tudo`) continuam verdes automaticamente.

- [ ] **Step 1: Criar a branch a partir do main**

```bash
git checkout main
git checkout -b feat/prioridades-editaveis
```

- [ ] **Step 2: Escrever os testes que falham**

Append em `backend/tests/test_permissions.py` (após `test_permissoes_todas_cobre_tudo`):

```python
# ── área prioridades (10ª área, verbo consultado: editar) ────────────────

def test_prioridades_na_lista_de_areas():
    assert "prioridades" in AREAS
    assert AREA_LABELS["prioridades"] == "Prioridades do Mês"


def test_prioridades_editar_concedido():
    r = role(permissoes={"prioridades": ["editar"]})
    assert tem_permissao(r, "prioridades", "editar") is True


def test_prioridades_negado_sem_area():
    r = role(permissoes={"captacao": ["criar", "editar", "excluir"]})
    assert tem_permissao(r, "prioridades", "editar") is False


def test_prioridades_efetivas_aparece():
    r = role(permissoes={"prioridades": ["editar"]})
    assert permissoes_efetivas(r) == {"prioridades": ["editar"]}
```

- [ ] **Step 3: Rodar e ver falhar**

Run (da raiz do repo): `venv\Scripts\python -m pytest backend/tests/test_permissions.py -q`
Expected: FAIL — `test_prioridades_na_lista_de_areas` com AssertionError (área ausente).

- [ ] **Step 4: Implementar**

Em `backend/app/core/permissions.py`, adicionar `"prioridades"` ao FINAL da tupla `AREAS`:

```python
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
    "prioridades",
)
```

E ao final do dict `AREA_LABELS`:

```python
    "usuarios": "Usuários do Município",
    "prioridades": "Prioridades do Mês",
```

- [ ] **Step 5: Rodar e ver passar**

Run: `venv\Scripts\python -m pytest backend/tests/test_permissions.py -q`
Expected: exit 0 (25 testes no arquivo: 21 existentes + 4 novos).

Run a suite inteira: `venv\Scripts\python -m pytest backend/tests -q`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add backend/app/core/permissions.py backend/tests/test_permissions.py
git commit -m "feat(prioridades): area prioridades no nucleo de permissoes"
```

---

### Task 2: Migration 0035 data-only (builtin ADMIN_MUNICIPIO)

**Files:**
- Create: `backend/alembic/versions/0035_prioridades_permissao.py`

**Interfaces:**
- Consumes: chain de migrations (head atual: `0034_projeto_tarefa`).
- Produces: builtin ADMIN_MUNICIPIO com `"prioridades": ["criar", "editar", "excluir"]` no JSON `permissoes`, aplicado na Railway. `backend/app/db/seed.py` NÃO muda (usa `PERMISSOES_TODAS`, que já inclui a área após a Task 1).

- [ ] **Step 1: Escrever a migration**

Criar `backend/alembic/versions/0035_prioridades_permissao.py`:

```python
"""prioridades: permissao para ADMIN_MUNICIPIO builtin (data-only)

Concede a area "prioridades" (todos os verbos, paridade com
app.core.permissions.PERMISSOES_TODAS/seed; o backend consulta apenas
"editar") a role builtin ADMIN_MUNICIPIO. Zero mudanca de schema.

Revision ID: 0035_prioridades_permissao
Revises: 0034_projeto_tarefa
Create Date: 2026-07-25
"""

import json

import sqlalchemy as sa
from alembic import op


revision = "0035_prioridades_permissao"
down_revision = "0034_projeto_tarefa"
branch_labels = None
depends_on = None

# Copia literal (migrations nao importam codigo da app).
PRIORIDADES_VERBOS = ["criar", "editar", "excluir"]


def _carregar(conn):
    row = conn.execute(
        sa.text(
            "SELECT id, permissoes FROM roles "
            "WHERE nome = 'ADMIN_MUNICIPIO' AND builtin = true"
        )
    ).first()
    if row is None:
        return None, None
    permissoes = row.permissoes
    if not isinstance(permissoes, dict):
        permissoes = json.loads(permissoes or "{}")
    return row.id, permissoes


def upgrade():
    conn = op.get_bind()
    role_id, permissoes = _carregar(conn)
    if role_id is None:
        return  # sem builtin ADMIN_MUNICIPIO (banco vazio): seed cobre
    permissoes["prioridades"] = PRIORIDADES_VERBOS
    conn.execute(
        sa.text("UPDATE roles SET permissoes = :p WHERE id = :id"),
        {"p": json.dumps(permissoes), "id": role_id},
    )


def downgrade():
    conn = op.get_bind()
    role_id, permissoes = _carregar(conn)
    if role_id is None:
        return
    permissoes.pop("prioridades", None)
    conn.execute(
        sa.text("UPDATE roles SET permissoes = :p WHERE id = :id"),
        {"p": json.dumps(permissoes), "id": role_id},
    )
```

- [ ] **Step 2: Aplicar na Railway**

De `backend/` (precisa de `backend/.env`, que aponta para a Railway):

```bash
cd backend && ../venv/Scripts/python -m alembic upgrade head
```

Expected: `Running upgrade 0034_projeto_tarefa -> 0035_prioridades_permissao`.

- [ ] **Step 3: Verificar o dado**

```bash
cd backend && ../venv/Scripts/python -c "
from app.core.config import settings
import sqlalchemy as sa
e = sa.create_engine(settings.DATABASE_URL)
with e.connect() as c:
    row = c.execute(sa.text(\"SELECT permissoes FROM roles WHERE nome='ADMIN_MUNICIPIO' AND builtin=true\")).first()
    print(row.permissoes)
"
```

Expected: JSON contendo `"prioridades": ["criar", "editar", "excluir"]` (e as 9 áreas anteriores intactas).

- [ ] **Step 4: Suite backend intacta**

Da raiz: `venv\Scripts\python -m pytest backend/tests -q`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add backend/alembic/versions/0035_prioridades_permissao.py
git commit -m "feat(prioridades): migration 0035 concede area ao builtin ADMIN_MUNICIPIO"
```

---

### Task 3: `PUT /insights/prioridades` — schemas TDD + endpoint

**Files:**
- Modify: `backend/app/api/v1/routers/insights.py` (imports linha 9; schemas após `GerarPrioridadesRequest` linha 66; endpoint após `get_prioridades` linha 429)
- Test: Create `backend/tests/test_prioridades_schema.py`

**Interfaces:**
- Consumes: `tem_permissao` (Task 1), `buscar_insight`/`InsightModel`/`_to_prioridades_response` (existentes no router/service).
- Produces: `PUT /insights/prioridades` com body `SalvarPrioridadesRequest {municipio_id: int|None, prioridades: list[PrioridadeEditItem] (1–3)}`; `PrioridadeEditItem {titulo: str (1–255), observacao: str (1–1000), dataset_referencia: str|None}`. Response: `PrioridadesResponse` existente. O frontend (Tasks 5–7) envia exatamente esse shape.

- [ ] **Step 1: Escrever os testes de schema que falham**

Criar `backend/tests/test_prioridades_schema.py`:

```python
"""Testes puros dos schemas do PUT /insights/prioridades (sem DB)."""
import pytest
from pydantic import ValidationError

from app.api.v1.routers.insights import PrioridadeEditItem, SalvarPrioridadesRequest


def item(**kw):
    base = {"titulo": "Atenção: ICMS caiu", "observacao": "Queda de 12% no trimestre."}
    base.update(kw)
    return base


def test_item_valido_com_dataset_opcional():
    p = PrioridadeEditItem(**item())
    assert p.dataset_referencia is None
    p2 = PrioridadeEditItem(**item(dataset_referencia="arrecadacao"))
    assert p2.dataset_referencia == "arrecadacao"


def test_titulo_vazio_rejeitado():
    with pytest.raises(ValidationError):
        PrioridadeEditItem(**item(titulo=""))


def test_observacao_vazia_rejeitada():
    with pytest.raises(ValidationError):
        PrioridadeEditItem(**item(observacao=""))


def test_titulo_max_255():
    PrioridadeEditItem(**item(titulo="x" * 255))
    with pytest.raises(ValidationError):
        PrioridadeEditItem(**item(titulo="x" * 256))


def test_observacao_max_1000():
    PrioridadeEditItem(**item(observacao="x" * 1000))
    with pytest.raises(ValidationError):
        PrioridadeEditItem(**item(observacao="x" * 1001))


def test_request_1_a_3_itens():
    SalvarPrioridadesRequest(prioridades=[item()])
    SalvarPrioridadesRequest(prioridades=[item(), item(), item()])
    with pytest.raises(ValidationError):
        SalvarPrioridadesRequest(prioridades=[])
    with pytest.raises(ValidationError):
        SalvarPrioridadesRequest(prioridades=[item(), item(), item(), item()])


def test_request_municipio_id_opcional():
    req = SalvarPrioridadesRequest(prioridades=[item()])
    assert req.municipio_id is None
    req2 = SalvarPrioridadesRequest(municipio_id=7, prioridades=[item()])
    assert req2.municipio_id == 7
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `venv\Scripts\python -m pytest backend/tests/test_prioridades_schema.py -q`
Expected: FAIL — `ImportError: cannot import name 'PrioridadeEditItem'`.

- [ ] **Step 3: Implementar schemas + endpoint**

Em `backend/app/api/v1/routers/insights.py`:

1. Linha 9, trocar o import do pydantic:

```python
from pydantic import BaseModel, Field
```

2. Após a classe `GerarPrioridadesRequest` (linha 66), adicionar:

```python
class PrioridadeEditItem(BaseModel):
    titulo: str = Field(min_length=1, max_length=255)
    observacao: str = Field(min_length=1, max_length=1000)
    dataset_referencia: str | None = None


class SalvarPrioridadesRequest(BaseModel):
    municipio_id: int | None = None  # usado APENAS por ADMIN_GLOBAL
    prioridades: list[PrioridadeEditItem] = Field(min_length=1, max_length=3)
```

3. Após o endpoint `get_prioridades` (linha 429, antes de `post_gerar_prioridades`), adicionar:

```python
@router.put("/prioridades", response_model=PrioridadesResponse)
def salvar_prioridades(
    body: SalvarPrioridadesRequest,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Edição manual das prioridades (upsert do mês corrente, modelo=especialista).

    ADMIN_GLOBAL grava no municipio_id do body; usuário comum precisa da
    permissão (prioridades, editar) e grava SEMPRE no próprio município.
    """
    from app.core.permissions import tem_permissao

    is_global = current_user.role.nome == "ADMIN_GLOBAL"
    if is_global:
        if not body.municipio_id:
            raise HTTPException(status_code=400, detail="municipio_id é obrigatório.")
        mid = body.municipio_id
    else:
        if not tem_permissao(current_user.role, "prioridades", "editar"):
            raise HTTPException(status_code=403, detail="Sem permissão para editar prioridades.")
        mid = current_user.municipio_id
        if not mid:
            raise HTTPException(status_code=400, detail="Usuário sem município.")

    from datetime import timezone

    periodo = datetime.now(timezone.utc).strftime("%Y-%m")
    conteudo = json.dumps(
        [
            {
                "titulo": p.titulo,
                "observacao": p.observacao,
                "dataset_referencia": p.dataset_referencia,
            }
            for p in body.prioridades
        ],
        ensure_ascii=False,
    )

    existing = buscar_insight(db, mid, "prioridades", periodo)
    if existing:
        existing.conteudo = conteudo
        existing.modelo = "especialista"
        existing.gerado_em = datetime.now(timezone.utc)
        db.commit()
        db.refresh(existing)
        return _to_prioridades_response(existing)

    insight = InsightModel(
        municipio_id=mid,
        dataset="prioridades",
        periodo=periodo,
        conteudo=conteudo,
        modelo="especialista",
    )
    db.add(insight)
    db.commit()
    db.refresh(insight)
    return _to_prioridades_response(insight)
```

- [ ] **Step 4: Rodar e ver passar**

Run: `venv\Scripts\python -m pytest backend/tests/test_prioridades_schema.py -q`
Expected: exit 0 (7 testes).

Run a suite inteira: `venv\Scripts\python -m pytest backend/tests -q`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add backend/app/api/v1/routers/insights.py backend/tests/test_prioridades_schema.py
git commit -m "feat(prioridades): PUT /insights/prioridades com upsert do mes corrente"
```

---

### Task 4: `utils/prioridadesForm.js` — TDD + rewire do PrioridadesPanel

**Files:**
- Create: `frontend-observatorio/src/utils/prioridadesForm.js`
- Create: `frontend-observatorio/src/utils/prioridadesForm.test.js`
- Modify: `frontend-observatorio/src/components/PrioridadesPanel.jsx:1-51` (imports/mapas/parsePrefix) e `:112-115` (uso)

**Interfaces:**
- Consumes: nada.
- Produces (Tasks 5–6 dependem dos nomes EXATOS): `TIPOS_PRIORIDADE = ["Atenção", "Oportunidade", "Risco"]`; `parseTitulo(titulo) => {tipo: string|null, texto: string}`; `montarTitulo(tipo, texto) => string`; `validarItens(itens) => string|null` (itens = `[{texto, observacao, ...}]`); `DATASET_ROUTE`; `DATASET_LABEL` (movidos do painel, conteúdo idêntico).

- [ ] **Step 1: Escrever os testes que falham**

Criar `frontend-observatorio/src/utils/prioridadesForm.test.js`:

```js
import { describe, it, expect } from "vitest";
import {
  TIPOS_PRIORIDADE,
  DATASET_LABEL,
  DATASET_ROUTE,
  parseTitulo,
  montarTitulo,
  validarItens,
} from "./prioridadesForm";

describe("parseTitulo", () => {
  it("extrai cada um dos 3 prefixos", () => {
    expect(parseTitulo("Atenção: ICMS caiu")).toEqual({ tipo: "Atenção", texto: "ICMS caiu" });
    expect(parseTitulo("Oportunidade: edital aberto")).toEqual({ tipo: "Oportunidade", texto: "edital aberto" });
    expect(parseTitulo("Risco: perda de faixa")).toEqual({ tipo: "Risco", texto: "perda de faixa" });
  });

  it("sem prefixo retorna tipo null e texto integral", () => {
    expect(parseTitulo("Só um título")).toEqual({ tipo: null, texto: "Só um título" });
  });

  it("tolera vazio/null", () => {
    expect(parseTitulo("")).toEqual({ tipo: null, texto: "" });
    expect(parseTitulo(null)).toEqual({ tipo: null, texto: "" });
  });
});

describe("montarTitulo", () => {
  it("com tipo prefixa", () => {
    expect(montarTitulo("Risco", "perda de faixa")).toBe("Risco: perda de faixa");
  });

  it("sem tipo retorna o texto puro (trim)", () => {
    expect(montarTitulo(null, "  título  ")).toBe("título");
  });

  it("roundtrip com parseTitulo", () => {
    for (const tipo of TIPOS_PRIORIDADE) {
      expect(parseTitulo(montarTitulo(tipo, "abc"))).toEqual({ tipo, texto: "abc" });
    }
  });
});

describe("validarItens", () => {
  const ok = { texto: "t", observacao: "o" };

  it("aceita 1 a 3 itens válidos", () => {
    expect(validarItens([ok])).toBeNull();
    expect(validarItens([ok, ok, ok])).toBeNull();
  });

  it("rejeita lista vazia e mais de 3", () => {
    expect(validarItens([])).toMatch(/ao menos uma/);
    expect(validarItens([ok, ok, ok, ok])).toMatch(/Máximo de 3/);
  });

  it("rejeita título/observação em branco", () => {
    expect(validarItens([{ texto: "  ", observacao: "o" }])).toMatch(/Título/);
    expect(validarItens([{ texto: "t", observacao: "" }])).toMatch(/Observação/);
  });
});

describe("mapas de dataset", () => {
  it("route e label cobrem as mesmas chaves", () => {
    expect(Object.keys(DATASET_ROUTE).sort()).toEqual(Object.keys(DATASET_LABEL).sort());
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd frontend-observatorio && npm run test`
Expected: FAIL — `Cannot find module './prioridadesForm'`.

- [ ] **Step 3: Implementar**

Criar `frontend-observatorio/src/utils/prioridadesForm.js`:

```js
// Lógica pura das prioridades do mês: prefixo de tipo no título, validação
// do editor e mapas de dataset (compartilhados por PrioridadesPanel e
// PrioridadesEditorModal).

export const TIPOS_PRIORIDADE = ["Atenção", "Oportunidade", "Risco"];

export const DATASET_ROUTE = {
  caged: "/app/caged",
  pib: "/app/pib",
  arrecadacao: "/app/arrecadacao",
  rais: "/app/rais",
  bolsa_familia: "/app/bolsa-familia",
  pe_de_meia: "/app/pe-de-meia",
  inss: "/app/inss",
  estban: "/app/estban",
  comex: "/app/comex",
  empresas: "/app/empresas",
  pix: "/app/pix",
};

export const DATASET_LABEL = {
  caged: "CAGED",
  pib: "PIB",
  arrecadacao: "Arrecadação",
  rais: "RAIS",
  bolsa_familia: "Bolsa Família",
  pe_de_meia: "Pé-de-Meia",
  inss: "INSS",
  estban: "Bancos",
  comex: "Comércio Exterior",
  empresas: "Empresas",
  pix: "PIX",
};

const PREFIXO_RE = /^(Atenção|Oportunidade|Risco):\s*/;

export function parseTitulo(titulo) {
  const match = PREFIXO_RE.exec(titulo || "");
  if (!match) return { tipo: null, texto: titulo || "" };
  return { tipo: match[1], texto: (titulo || "").slice(match[0].length) };
}

export function montarTitulo(tipo, texto) {
  const t = (texto || "").trim();
  if (!tipo) return t;
  return `${tipo}: ${t}`;
}

export function validarItens(itens) {
  if (!itens || itens.length === 0) return "Inclua ao menos uma prioridade.";
  if (itens.length > 3) return "Máximo de 3 prioridades.";
  for (const item of itens) {
    if (!(item.texto || "").trim()) return "Título é obrigatório em todas as prioridades.";
    if (!(item.observacao || "").trim()) return "Observação é obrigatória em todas as prioridades.";
  }
  return null;
}
```

- [ ] **Step 4: Rewire do PrioridadesPanel (sem mudança visual)**

Em `frontend-observatorio/src/components/PrioridadesPanel.jsx`:

1. Remover os blocos locais `DATASET_ROUTE` (linhas 7–19), `DATASET_LABEL` (linhas 21–33) e a função `parsePrefix` (linhas 42–46).
2. Adicionar ao bloco de imports (após a linha 5):

```js
import { DATASET_ROUTE, DATASET_LABEL, parseTitulo } from "../utils/prioridadesForm";
```

3. No map de renderização (linha 113), trocar:

```js
          const { style, body } = parsePrefix(p.titulo);
```

por:

```js
          const { tipo, texto: body } = parseTitulo(p.titulo);
          const style = tipo ? PREFIX_STYLES[tipo] : DEFAULT_STYLE;
```

(`PREFIX_STYLES`/`DEFAULT_STYLE` das linhas 35–40 ficam como estão.)

- [ ] **Step 5: Rodar e ver passar**

```bash
cd frontend-observatorio && npm run test && npm run build
```

Expected: vitest exit 0 (41 + 10 novos = 51); build exit 0.

- [ ] **Step 6: Commit**

```bash
git add frontend-observatorio/src/utils/prioridadesForm.js frontend-observatorio/src/utils/prioridadesForm.test.js frontend-observatorio/src/components/PrioridadesPanel.jsx
git commit -m "feat(prioridades): helpers puros do form e rewire do painel"
```

---

### Task 5: `PrioridadesEditorModal.jsx`

**Files:**
- Create: `frontend-observatorio/src/components/PrioridadesEditorModal.jsx`

**Interfaces:**
- Consumes: `TIPOS_PRIORIDADE`, `DATASET_LABEL`, `parseTitulo`, `montarTitulo`, `validarItens` (Task 4); `PUT /insights/prioridades` (Task 3); `useToast`, `useEscapeKey`, `api` (existentes).
- Produces: `<PrioridadesEditorModal aberto onClose inicial municipioId onSaved />` — `inicial`: PrioridadesResponse | null; `municipioId`: number (ADMIN_GLOBAL) | null (usuário do município); `onSaved(data)` recebe a resposta do PUT. Tasks 6–7 montam este componente.

- [ ] **Step 1: Criar o componente**

Criar `frontend-observatorio/src/components/PrioridadesEditorModal.jsx`:

```jsx
import { useEffect, useState, useCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { XMarkIcon, PlusIcon, TrashIcon } from "@heroicons/react/24/outline";
import api from "../services/api";
import { useToast } from "../context/ToastContext";
import { useEscapeKey } from "../hooks/useEscapeKey";
import {
  TIPOS_PRIORIDADE,
  DATASET_LABEL,
  parseTitulo,
  montarTitulo,
  validarItens,
} from "../utils/prioridadesForm";

const itemVazio = () => ({ tipo: "", texto: "", observacao: "", dataset_referencia: "" });

function itensDe(inicial) {
  if (!inicial?.prioridades?.length) return [itemVazio()];
  return inicial.prioridades.slice(0, 3).map((p) => {
    const { tipo, texto } = parseTitulo(p.titulo);
    return {
      tipo: tipo || "",
      texto,
      observacao: p.observacao || "",
      dataset_referencia: p.dataset_referencia || "",
    };
  });
}

export default function PrioridadesEditorModal({ aberto, onClose, inicial, municipioId, onSaved }) {
  const { addToast } = useToast();
  const [itens, setItens] = useState([itemVazio()]);
  const [erro, setErro] = useState(null);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (aberto) {
      setItens(itensDe(inicial));
      setErro(null);
    }
  }, [aberto, inicial]);

  useEscapeKey(useCallback(() => {
    if (aberto && !salvando) onClose();
  }, [aberto, salvando, onClose]));

  function setItem(i, patch) {
    setItens((prev) => prev.map((it, j) => (j === i ? { ...it, ...patch } : it)));
  }

  function addItem() {
    setItens((prev) => (prev.length >= 3 ? prev : [...prev, itemVazio()]));
  }

  function removeItem(i) {
    setItens((prev) => (prev.length <= 1 ? prev : prev.filter((_, j) => j !== i)));
  }

  async function handleSalvar() {
    const msg = validarItens(itens);
    if (msg) { setErro(msg); return; }
    setSalvando(true);
    setErro(null);
    const payload = {
      prioridades: itens.map((it) => ({
        titulo: montarTitulo(it.tipo || null, it.texto),
        observacao: it.observacao.trim(),
        dataset_referencia: it.dataset_referencia || null,
      })),
    };
    if (typeof municipioId === "number") payload.municipio_id = municipioId;
    try {
      const res = await api.put("/insights/prioridades", payload);
      addToast("Prioridades atualizadas", "success");
      onSaved(res.data);
      onClose();
    } catch (err) {
      const d = err?.response?.data?.detail;
      setErro(typeof d === "string" ? d : "Erro ao salvar.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <AnimatePresence>
      {aberto && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
          onClick={(e) => { if (e.target === e.currentTarget && !salvando) onClose(); }}
        >
          <motion.div
            initial={{ scale: 0.95 }}
            animate={{ scale: 1 }}
            exit={{ scale: 0.95 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="bg-[var(--panel)] rounded-2xl shadow-xl w-full max-w-2xl p-6 max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-base font-bold text-[var(--text)]">Editar prioridades do mês</h3>
              <button
                onClick={onClose}
                aria-label="Fechar"
                className="p-1.5 rounded-lg text-[var(--text-mute)] hover:text-[var(--text)] hover:bg-[var(--panel-2)] transition-colors cursor-pointer"
              >
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-5">
              {itens.map((item, i) => (
                <div key={i} className="rounded-xl border border-[var(--border)] p-4 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-[var(--text-dim)] uppercase tracking-wider">
                      Prioridade {i + 1}
                    </span>
                    {itens.length > 1 && (
                      <button
                        onClick={() => removeItem(i)}
                        aria-label={`Remover prioridade ${i + 1}`}
                        className="p-1.5 rounded-lg text-[var(--text-mute)] hover:text-red-400 hover:bg-[var(--panel-2)] transition-colors cursor-pointer"
                      >
                        <TrashIcon className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="flex flex-col gap-1">
                      <label className="text-xs font-semibold text-[var(--text-dim)] uppercase tracking-wider">Tipo</label>
                      <select
                        value={item.tipo}
                        onChange={(e) => setItem(i, { tipo: e.target.value })}
                        className="px-3 py-2 rounded-lg border border-[var(--border)] text-sm bg-[var(--panel-2)] text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="">Sem destaque</option>
                        {TIPOS_PRIORIDADE.map((t) => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>

                    <div className="flex flex-col gap-1">
                      <label className="text-xs font-semibold text-[var(--text-dim)] uppercase tracking-wider">Dataset relacionado</label>
                      <select
                        value={item.dataset_referencia}
                        onChange={(e) => setItem(i, { dataset_referencia: e.target.value })}
                        className="px-3 py-2 rounded-lg border border-[var(--border)] text-sm bg-[var(--panel-2)] text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="">Nenhum</option>
                        {Object.entries(DATASET_LABEL).map(([k, label]) => (
                          <option key={k} value={k}>{label}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-semibold text-[var(--text-dim)] uppercase tracking-wider">Título *</label>
                    <input
                      value={item.texto}
                      onChange={(e) => setItem(i, { texto: e.target.value })}
                      maxLength={200}
                      className="px-3 py-2 rounded-lg border border-[var(--border)] text-sm bg-[var(--panel-2)] text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-semibold text-[var(--text-dim)] uppercase tracking-wider">Observação *</label>
                    <textarea
                      value={item.observacao}
                      onChange={(e) => setItem(i, { observacao: e.target.value })}
                      rows={3}
                      maxLength={1000}
                      className="px-3 py-2 rounded-lg border border-[var(--border)] text-sm bg-[var(--panel-2)] text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                    />
                  </div>
                </div>
              ))}

              {itens.length < 3 && (
                <button
                  onClick={addItem}
                  className="flex items-center gap-2 text-sm font-medium text-blue-500 hover:opacity-80 cursor-pointer"
                >
                  <PlusIcon className="w-4 h-4" />
                  Adicionar prioridade
                </button>
              )}

              <div className="flex items-center gap-3 pt-2">
                {erro && <p className="text-sm text-red-600 flex-1">{erro}</p>}
                <div className="flex gap-3 ml-auto">
                  <button
                    type="button"
                    onClick={onClose}
                    disabled={salvando}
                    className="px-4 py-2 rounded-lg border border-[var(--border)] text-sm text-[var(--text-dim)] hover:bg-[var(--panel-2)] cursor-pointer disabled:opacity-50"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={handleSalvar}
                    disabled={salvando}
                    className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium disabled:opacity-50 cursor-pointer"
                  >
                    {salvando ? "Salvando..." : "Salvar"}
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
```

Nota: `maxLength={200}` no input de título deixa folga para o prefixo do tipo (máx ~14 chars) dentro dos 255 do backend.

- [ ] **Step 2: Gates**

```bash
cd frontend-observatorio && npm run test && npm run build
```

Expected: 51 testes, build exit 0 (componente ainda sem uso).

- [ ] **Step 3: Commit**

```bash
git add frontend-observatorio/src/components/PrioridadesEditorModal.jsx
git commit -m "feat(prioridades): modal de edicao compartilhado"
```

---

### Task 6: PrioridadesPanel — lápis, empty-state CTA e "editado em"

**Files:**
- Modify: `frontend-observatorio/src/components/PrioridadesPanel.jsx`

**Interfaces:**
- Consumes: `PrioridadesEditorModal` (Task 5), `usePermissao` (existente: `usePermissao(area, verbo) => boolean`).
- Produces: nada (folha).

- [ ] **Step 1: Imports e estado**

Em `PrioridadesPanel.jsx` (já rewired na Task 4), atualizar imports:

```js
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { SparklesIcon, ArrowRightIcon, PencilIcon } from "@heroicons/react/24/outline";
import api from "../services/api";
import { usePermissao } from "../hooks/usePermissao";
import PrioridadesEditorModal from "./PrioridadesEditorModal";
import { DATASET_ROUTE, DATASET_LABEL, parseTitulo } from "../utils/prioridadesForm";
```

No corpo do componente, após `const [state, setState] = useState(...)`:

```js
  const canEditar = usePermissao("prioridades", "editar");
  const [editorAberto, setEditorAberto] = useState(false);

  function handleSaved(data) {
    setState({ status: "ok", data });
  }
```

- [ ] **Step 2: Empty state com CTA**

Substituir o bloco do empty state (retorno de `state.status === "empty"`, linhas 80–92 do arquivo original) por:

```jsx
  if (state.status === "empty") {
    return (
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-6">
        <div className="flex items-center gap-2 mb-2">
          <SparklesIcon className="w-5 h-5 text-violet-500" />
          <h2 className="text-base font-bold text-[var(--text)]">Prioridades do mês</h2>
        </div>
        <p className="text-sm text-[var(--text-mute)]">
          As prioridades ainda não foram geradas. Aguarde o próximo ciclo de análise.
        </p>
        {canEditar && (
          <button
            onClick={() => setEditorAberto(true)}
            className="mt-3 flex items-center gap-2 text-sm font-medium text-blue-500 hover:opacity-80 cursor-pointer"
          >
            <PencilIcon className="w-4 h-4" />
            Adicionar prioridades
          </button>
        )}
        <PrioridadesEditorModal
          aberto={editorAberto}
          onClose={() => setEditorAberto(false)}
          inicial={null}
          municipioId={null}
          onSaved={handleSaved}
        />
      </div>
    );
  }
```

- [ ] **Step 3: Header com lápis e "editado em"**

No retorno principal, substituir o bloco do header (linhas 103–109 do original):

```jsx
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <SparklesIcon className="w-5 h-5 text-violet-500" />
          <h2 className="text-base font-bold text-[var(--text)]">Prioridades do mês</h2>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-[var(--text-mute)]">
            {state.data.modelo === "especialista" ? "editado em" : "gerado em"} {fmtDate(gerado_em)}
          </span>
          {canEditar && (
            <button
              onClick={() => setEditorAberto(true)}
              aria-label="Editar prioridades"
              className="p-1.5 rounded-lg text-[var(--text-mute)] hover:text-blue-500 hover:bg-[var(--panel-2)] transition-colors cursor-pointer"
            >
              <PencilIcon className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
```

E antes do fechamento do `motion.div` principal (após o grid de cards, linha 135 do original), montar o modal:

```jsx
      <PrioridadesEditorModal
        aberto={editorAberto}
        onClose={() => setEditorAberto(false)}
        inicial={state.data}
        municipioId={null}
        onSaved={handleSaved}
      />
```

- [ ] **Step 4: Gates**

```bash
cd frontend-observatorio && npm run test && npm run build
```

Expected: 51 testes, build exit 0.

- [ ] **Step 5: Commit**

```bash
git add frontend-observatorio/src/components/PrioridadesPanel.jsx
git commit -m "feat(prioridades): edicao inline no painel com lapis e CTA no empty state"
```

---

### Task 7: /admin/insights (Editar + confirm) e RolesAdminPage (linha só-editar)

**Files:**
- Modify: `frontend-observatorio/src/pages/admin/InsightsAdminPage.jsx` (imports; `handleGerarPrioridades` linha 397; seção prioridades linhas 592–638)
- Modify: `frontend-observatorio/src/pages/admin/RolesAdminPage.jsx:10-21` (AREAS/AREA_VERBOS) e `:277-287` (células da matriz)

**Interfaces:**
- Consumes: `PrioridadesEditorModal` (Task 5).
- Produces: nada (folha).

- [ ] **Step 1: InsightsAdminPage — imports, estado e confirm**

1. Adicionar aos imports (junto dos componentes):

```js
import PrioridadesEditorModal from "../../components/PrioridadesEditorModal";
import { PencilIcon } from "@heroicons/react/24/outline";
```

(Se `PencilIcon` já estiver importado do heroicons na página, apenas reutilizar o import existente.)

2. Junto dos estados de prioridades (linha 301–302):

```js
  const [editandoPrioridades, setEditandoPrioridades] = useState(false);
```

3. Em `handleGerarPrioridades` (linha 397), adicionar o confirm como PRIMEIRA linha do corpo:

```js
  const handleGerarPrioridades = async () => {
    if (
      prioridades?.modelo === "especialista" &&
      !confirm("Há edição manual deste mês — regenerar substitui o conteúdo pela versão de IA. Continuar?")
    ) return;
    setGeneratingPrioridades(true);
    ...resto inalterado...
  };
```

- [ ] **Step 2: InsightsAdminPage — botão Editar + modal na seção de prioridades**

Na seção "Prioridades do mês" (linhas 592–638), o botão único de Gerar vira um grupo de dois botões — substituir o `<button onClick={handleGerarPrioridades} ...>...</button>` por:

```jsx
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() => setEditandoPrioridades(true)}
                disabled={loadingInsights}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 6,
                  fontFamily: "var(--font-display)", fontSize: 12, fontWeight: 600,
                  color: "var(--admin-accent)",
                  background: "transparent", border: "1px solid var(--border)",
                  borderRadius: 8, padding: "7px 12px", cursor: "pointer",
                  opacity: loadingInsights ? 0.45 : 1,
                }}
              >
                <PencilIcon style={{ width: 14, height: 14 }} />
                Editar
              </button>
              <button
                onClick={handleGerarPrioridades}
                disabled={generatingPrioridades || loadingInsights}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 6,
                  fontFamily: "var(--font-display)", fontSize: 12, fontWeight: 600,
                  color: "var(--admin-accent)",
                  background: "transparent", border: "1px solid var(--border)",
                  borderRadius: 8, padding: "7px 12px", cursor: "pointer",
                  opacity: (generatingPrioridades || loadingInsights) ? 0.45 : 1,
                }}
              >
                <ArrowPathIcon style={{ width: 14, height: 14 }} className={generatingPrioridades ? "animate-spin" : ""} />
                {generatingPrioridades ? "Gerando..." : prioridades ? "Regenerar" : "Gerar"}
              </button>
            </div>
```

E logo antes do fechamento do `<div>` da seção de prioridades (após o bloco `{prioridades ? (...) : (...)}`), montar o modal:

```jsx
          <PrioridadesEditorModal
            aberto={editandoPrioridades}
            onClose={() => setEditandoPrioridades(false)}
            inicial={prioridades}
            municipioId={parseInt(selectedId)}
            onSaved={(d) => setPrioridades(d)}
          />
```

- [ ] **Step 3: RolesAdminPage — área nova com verbo único**

1. Adicionar a entrada ao final da lista `AREAS` (linha 10–20) e a config de verbos por área logo abaixo de `VERBOS`:

```js
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
  ["prioridades", "Prioridades do Mês"],
];
const VERBOS = ["criar", "editar", "excluir"];
// Áreas com verbo único: só "editar" faz sentido para prioridades.
const AREA_VERBOS = { prioridades: ["editar"] };
```

2. Nas células da matriz (linhas 277–287), renderizar checkbox só para verbos aplicáveis:

```jsx
                        {VERBOS.map((verbo) => (
                          <td key={verbo} className="text-center py-1.5">
                            {(AREA_VERBOS[area] || VERBOS).includes(verbo) ? (
                              <input
                                type="checkbox"
                                checked={(form.permissoes[area] || []).includes(verbo)}
                                onChange={() => toggleVerbo(area, verbo)}
                                className="cursor-pointer"
                              />
                            ) : (
                              <span style={{ color: "var(--text-mute)" }}>—</span>
                            )}
                          </td>
                        ))}
```

- [ ] **Step 4: Gates**

```bash
cd frontend-observatorio && npm run test && npm run build
```

Expected: 51 testes, build exit 0.

- [ ] **Step 5: Commit**

```bash
git add frontend-observatorio/src/pages/admin/InsightsAdminPage.jsx frontend-observatorio/src/pages/admin/RolesAdminPage.jsx
git commit -m "feat(prioridades): editar no admin de insights e linha so-editar na matriz de roles"
```

---

### Task 8: Verificação final (sem commit de código)

**Files:** nenhum (somente verificação).

**Interfaces:** n/a.

- [ ] **Step 1: Gates completos**

```bash
venv\Scripts\python -m pytest backend/tests -q          # da raiz; exit 0
cd frontend-observatorio && npm run test && npm run build  # 51 testes; build exit 0
```

- [ ] **Step 2: E2E API real na Railway**

Com um script Python temporário (scratchpad, não commitado) usando `requests` contra a API da Railway, credenciais do ADMIN_GLOBAL de dev (igor.cardoso@uaizi.com — senha com o usuário) OU criando usuários de teste descartáveis via API:

1. Login ADMIN_GLOBAL → `PUT /insights/prioridades` SEM `municipio_id` → **400**.
2. `PUT /insights/prioridades` com `municipio_id` de um município de teste e 2 itens → **200**, response com `modelo="especialista"` e `periodo` = mês corrente.
3. `GET /insights/prioridades?municipio_id=X` → reflete os 2 itens (título com prefixo).
4. Criar usuário de teste VISUALIZADOR no município → login → PUT → **403** (`Sem permissão para editar prioridades.`).
5. Criar role custom com `{"prioridades": ["editar"]}` + usuário com ela → login → PUT com 1 item → **200**; body com `municipio_id` de OUTRO município → grava no próprio (conferir via GET).
6. PUT com 4 itens → **422**; com `prioridades: []` → **422**.
7. Cleanup: excluir usuários/role de teste; restaurar prioridades originais do município de teste (ou deixar a edição de teste explícita e avisar o usuário).

Expected: 7/7 checks. Registrar resultados no ledger.

- [ ] **Step 3: Reportar pendências para o usuário**

Checklist visual (spec, seção "Testes e gates"): lápis no painel só com permissão; editor 1–3 itens
com selects de tipo/dataset; salvar reflete na hora com "editado em"; empty state com CTA;
botão Editar + confirm de regenerar em /admin/insights; linha só-editar na matriz de roles.

---

## Self-review do plano (executado na escrita)

- **Spec coverage:** decisões 1–6 → Global Constraints; área+labels → Task 1; migration/seed → Task 2; PUT/guards/upsert → Task 3; helpers/mapas/parseTitulo → Task 4; modal → Task 5; painel (lápis/CTA/"editado em") → Task 6; admin (Editar/confirm) + matriz só-editar → Task 7; testes/E2E/checklist → Tasks 1/3/4/8. Casos de borda da spec: free plan (GET inalterado — sem task, correto), mês novo (semântica atual — sem task), last-write-wins (aceito), dataset fora do mapa (painel atual já ignora).
- **Placeholders:** nenhum — todo step de código tem o código completo.
- **Consistência de nomes:** `parseTitulo/montarTitulo/validarItens/TIPOS_PRIORIDADE/DATASET_LABEL/DATASET_ROUTE` idênticos nas Tasks 4–7; `PrioridadeEditItem/SalvarPrioridadesRequest` idênticos nas Tasks 3 e 8; props do modal (`aberto/onClose/inicial/municipioId/onSaved`) idênticas nas Tasks 5–7; payload do modal (Task 5) casa com o schema do PUT (Task 3): `titulo` composto, `observacao` trim, `dataset_referencia` null quando vazio, `municipio_id` só quando number.
