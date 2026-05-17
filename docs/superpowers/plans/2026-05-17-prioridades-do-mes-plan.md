# Prioridades do Mês Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an AI-generated "Prioridades do Mês" panel at the top of Dashboard Geral, surfacing the 3 most strategically important cross-dataset observations of the month, each linked to its source dataset page.

**Architecture:** Extend the existing `insights_service.py` with a new `gerar_prioridades` function that bundles raw data from 11 datasets into a single Claude Haiku 4.5 call and stores the result in the existing `InsightIA` table with `dataset='prioridades'`. Add two dedicated routes (`GET /insights/prioridades`, `POST /insights/prioridades/gerar`). On the frontend, mount a new `PrioridadesPanel` component at the top of Dashboard Geral and add a small section to `InsightsAdminPage` for ADMIN_GLOBAL generation. No database migration — reuses the existing unique constraint `(municipio_id, dataset, periodo)`.

**Tech Stack:** FastAPI + SQLAlchemy + Anthropic SDK (claude-haiku-4-5-20251001) · React + Tailwind + Heroicons + framer-motion · pytest with `unittest.mock` (matching the existing `tests/ingestao/test_utils.py` pattern).

**Spec:** [`docs/superpowers/specs/2026-05-17-prioridades-do-mes-design.md`](../specs/2026-05-17-prioridades-do-mes-design.md)

**File map:**
- Create: `tests/backend/__init__.py`
- Create: `tests/backend/test_insights_service.py`
- Modify: `backend/app/services/insights_service.py` (add `gerar_prioridades` + prompt constants)
- Modify: `backend/app/api/v1/routers/insights.py` (add 2 routes + Pydantic models)
- Create: `frontend-observatorio/src/components/PrioridadesPanel.jsx`
- Modify: `frontend-observatorio/src/pages/DashboardGeralPage.jsx` (mount panel)
- Modify: `frontend-observatorio/src/pages/admin/InsightsAdminPage.jsx` (add admin trigger card)

---

## Phase 1 — Backend service (TDD)

### Task 1: Create test scaffolding for backend service tests

**Files:**
- Create: `tests/backend/__init__.py`
- Create: `tests/backend/test_insights_service.py`

- [ ] **Step 1: Create the test package init**

Create `tests/backend/__init__.py` with content:

```python
```

(empty file)

- [ ] **Step 2: Create the test file with a failing skeleton test**

Create `tests/backend/test_insights_service.py`:

```python
"""
Unit tests for insights_service.gerar_prioridades.

Mocks the Anthropic client and _fetch_dados so tests are fast and have
no external dependencies. Same pattern as tests/ingestao/test_utils.py.
"""
import json
from unittest.mock import MagicMock, patch

import pytest

from backend.app.services import insights_service


def test_gerar_prioridades_happy_path():
    """When all datasets return data and Claude returns valid JSON,
    a new InsightIA row is upserted with dataset='prioridades'."""
    db = MagicMock()
    db.query.return_value.filter.return_value.first.return_value = None  # no existing

    municipio = MagicMock()
    municipio.id = 1
    municipio.nome = "Cabo Verde"
    municipio.estado = "MG"
    db.get.return_value = municipio

    claude_response = MagicMock()
    claude_response.content = [MagicMock(text=json.dumps([
        {"titulo": "Atenção: queda em CAGED", "observacao": "Saldo negativo 3 meses.", "dataset_referencia": "caged"},
        {"titulo": "Oportunidade: PIX em alta", "observacao": "Volume +20% YoY.", "dataset_referencia": "pix"},
        {"titulo": "Risco: arrecadação volátil", "observacao": "IPVA concentrado em jan.", "dataset_referencia": "arrecadacao"},
    ]))]

    with patch.object(insights_service, "_fetch_dados") as mock_fetch, \
         patch.object(insights_service, "settings") as mock_settings, \
         patch.object(insights_service, "anthropic") as mock_anthropic:
        mock_settings.ANTHROPIC_API_KEY = "test-key"
        mock_fetch.return_value = ([{"foo": "bar"}], "2026-05")
        mock_anthropic.Anthropic.return_value.messages.create.return_value = claude_response

        result = insights_service.gerar_prioridades(db, municipio_id=1)

    db.add.assert_called_once()
    db.commit.assert_called()
    added = db.add.call_args[0][0]
    assert added.dataset == "prioridades"
    assert added.municipio_id == 1
    parsed = json.loads(added.conteudo)
    assert len(parsed) == 3
    assert parsed[0]["dataset_referencia"] == "caged"
```

- [ ] **Step 3: Run the test to confirm it fails**

Run: `python -m pytest tests/backend/test_insights_service.py::test_gerar_prioridades_happy_path -v`
Expected: FAIL with `AttributeError: module 'backend.app.services.insights_service' has no attribute 'gerar_prioridades'`

- [ ] **Step 4: Commit**

```bash
git add tests/backend/__init__.py tests/backend/test_insights_service.py
git commit -m "test(insights): scaffold gerar_prioridades unit tests"
```

---

### Task 2: Implement minimal `gerar_prioridades` to pass the happy-path test

**Files:**
- Modify: `backend/app/services/insights_service.py` (append at end)

- [ ] **Step 1: Add the prompt constants and function**

Append to `backend/app/services/insights_service.py` (after the existing `gerar_insight` function):

```python
_PROMPT_PRIORIDADES = """Você é um analista estratégico sênior da Uaizi, especialista em prioridades executivas para gestão pública municipal no Brasil.

Sua tarefa é identificar as 3 PRIORIDADES MAIS RELEVANTES do mês corrente para o município de {nome} ({estado}), analisando todos os datasets disponíveis no painel.

O QUE É:
Uma camada de prioridade executiva — não substitui a análise por dataset, mas seleciona, entre todos os movimentos do período, os 3 que mais merecem atenção imediata do gestor.

CRITÉRIOS DE PRIORIZAÇÃO:
- Magnitude da variação vs. baseline histórico do próprio município.
- Persistência (movimento isolado vs. tendência multi-período).
- Implicação para decisão pública.
- Risco de interpretação errada (priorize observações que ajudem o gestor a evitar conclusões equivocadas).

REGRAS DE TOM:
- Use observação ("Atenção a X", "Oportunidade em Y"), nunca prescrição ("Faça Z").
- Cada prioridade aponta UM dataset principal de referência.
- Diversifique: evite que as 3 prioridades venham do mesmo dataset.
- Se um dataset não foi incluído por falta de dados, ignore-o — não invente.

PREFIXOS PERMITIDOS PARA O TÍTULO: "Atenção:", "Oportunidade:", "Risco:".
"""

_FORMATO_PRIORIDADES = """
FORMATO DE SAÍDA:
JSON array de EXATAMENTE 3 objetos. Sem texto fora do array. Sem fences.
[
  {
    "titulo": "Atenção: <5-10 palavras>",
    "observacao": "<2-3 frases com dados concretos do município>",
    "dataset_referencia": "<chave: caged | pib | arrecadacao | rais | bolsa_familia | pe_de_meia | inss | estban | comex | empresas | pix | null>"
  }
]
"""

_DATASETS_PRIORIDADES = [
    "arrecadacao", "pib", "caged", "rais", "bolsa_familia",
    "pe_de_meia", "inss", "estban", "comex", "empresas", "pix",
]


def gerar_prioridades(db: Session, municipio_id: int) -> InsightIA:
    """Generate the top-3 cross-dataset strategic priorities for a município."""
    if not settings.ANTHROPIC_API_KEY:
        raise HTTPException(
            status_code=503, detail="ANTHROPIC_API_KEY não configurada no servidor."
        )

    municipio = db.get(Municipio, municipio_id)
    if not municipio:
        raise HTTPException(status_code=404, detail="Município não encontrado.")

    dados_consolidados: dict[str, list[dict]] = {}
    datasets_ausentes: list[str] = []

    for dataset_key in _DATASETS_PRIORIDADES:
        try:
            dados, _ = _fetch_dados(db, municipio_id, dataset_key)
        except HTTPException:
            datasets_ausentes.append(dataset_key)
            continue
        if not dados:
            datasets_ausentes.append(dataset_key)
            continue
        dados_consolidados[dataset_key] = dados

    if not dados_consolidados:
        raise HTTPException(
            status_code=400, detail="Sem dados suficientes para gerar prioridades."
        )

    prompt = (
        _PROMPT_PRIORIDADES.format(nome=municipio.nome, estado=municipio.estado)
        + _PROIBICOES_GERAIS
        + _QUALITY_FILTER
        + _FORMATO_PRIORIDADES
        + f"\nENTRADA:\n"
        + f"Município: {municipio.nome} ({municipio.estado})\n"
        + f"Datasets sem dados (ignore): {datasets_ausentes}\n"
        + f"Dados consolidados:\n{json.dumps(dados_consolidados, ensure_ascii=False, default=str)}"
    )

    client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)
    message = client.messages.create(
        model=MODEL,
        max_tokens=1500,
        messages=[{"role": "user", "content": prompt}],
    )

    raw = message.content[0].text.strip()
    if raw.startswith("```"):
        lines = raw.splitlines()
        lines = [l for l in lines if not l.strip().startswith("```")]
        raw = "\n".join(lines).strip()

    try:
        prioridades = json.loads(raw)
        if not isinstance(prioridades, list):
            prioridades = [{"titulo": "Prioridade", "observacao": raw, "dataset_referencia": None}]
    except json.JSONDecodeError:
        logger.warning("gerar_prioridades: malformed JSON from Claude, storing fallback")
        prioridades = [{"titulo": "Prioridade", "observacao": raw, "dataset_referencia": None}]

    conteudo = json.dumps(prioridades, ensure_ascii=False)
    periodo = datetime.now(timezone.utc).strftime("%Y-%m")

    existing = buscar_insight(db, municipio_id, "prioridades", periodo)
    if existing:
        existing.conteudo = conteudo
        existing.modelo = MODEL
        existing.gerado_em = datetime.now(timezone.utc)
        db.commit()
        db.refresh(existing)
        return existing

    prioridades_row = InsightIA(
        municipio_id=municipio_id,
        dataset="prioridades",
        periodo=periodo,
        conteudo=conteudo,
        modelo=MODEL,
    )
    db.add(prioridades_row)
    db.commit()
    db.refresh(prioridades_row)
    return prioridades_row
```

- [ ] **Step 2: Run the test to verify it passes**

Run: `python -m pytest tests/backend/test_insights_service.py::test_gerar_prioridades_happy_path -v`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add backend/app/services/insights_service.py
git commit -m "feat(insights): add gerar_prioridades cross-dataset AI service"
```

---

### Task 3: Add edge-case tests

**Files:**
- Modify: `tests/backend/test_insights_service.py`

- [ ] **Step 1: Append "no data" test**

Append to `tests/backend/test_insights_service.py`:

```python
def test_gerar_prioridades_no_data_anywhere_raises_400():
    """When every dataset is empty, raise 400 instead of calling Claude."""
    from fastapi import HTTPException as _HE

    db = MagicMock()
    municipio = MagicMock()
    municipio.id = 1
    municipio.nome = "Vazio"
    municipio.estado = "MG"
    db.get.return_value = municipio

    with patch.object(insights_service, "_fetch_dados") as mock_fetch, \
         patch.object(insights_service, "settings") as mock_settings, \
         patch.object(insights_service, "anthropic") as mock_anthropic:
        mock_settings.ANTHROPIC_API_KEY = "test-key"
        mock_fetch.return_value = ([], "geral")  # every dataset empty

        with pytest.raises(_HE) as exc_info:
            insights_service.gerar_prioridades(db, municipio_id=1)

    assert exc_info.value.status_code == 400
    assert "Sem dados suficientes" in exc_info.value.detail
    mock_anthropic.Anthropic.return_value.messages.create.assert_not_called()


def test_gerar_prioridades_missing_api_key_raises_503():
    """When ANTHROPIC_API_KEY is not set, raise 503."""
    from fastapi import HTTPException as _HE

    db = MagicMock()
    with patch.object(insights_service, "settings") as mock_settings:
        mock_settings.ANTHROPIC_API_KEY = None
        with pytest.raises(_HE) as exc_info:
            insights_service.gerar_prioridades(db, municipio_id=1)

    assert exc_info.value.status_code == 503


def test_gerar_prioridades_malformed_json_uses_fallback():
    """When Claude returns non-JSON, store a single fallback priority and don't crash."""
    db = MagicMock()
    db.query.return_value.filter.return_value.first.return_value = None
    municipio = MagicMock()
    municipio.id = 1
    municipio.nome = "Cabo Verde"
    municipio.estado = "MG"
    db.get.return_value = municipio

    bad_response = MagicMock()
    bad_response.content = [MagicMock(text="not json at all")]

    with patch.object(insights_service, "_fetch_dados") as mock_fetch, \
         patch.object(insights_service, "settings") as mock_settings, \
         patch.object(insights_service, "anthropic") as mock_anthropic:
        mock_settings.ANTHROPIC_API_KEY = "test-key"
        mock_fetch.return_value = ([{"foo": "bar"}], "2026-05")
        mock_anthropic.Anthropic.return_value.messages.create.return_value = bad_response

        result = insights_service.gerar_prioridades(db, municipio_id=1)

    db.add.assert_called_once()
    added = db.add.call_args[0][0]
    parsed = json.loads(added.conteudo)
    assert len(parsed) == 1
    assert parsed[0]["observacao"] == "not json at all"
    assert parsed[0]["dataset_referencia"] is None


def test_gerar_prioridades_some_datasets_missing_still_works():
    """When some datasets 404 in _fetch_dados, they're listed as ausentes and the call proceeds."""
    from fastapi import HTTPException as _HE

    db = MagicMock()
    db.query.return_value.filter.return_value.first.return_value = None
    municipio = MagicMock()
    municipio.id = 1
    municipio.nome = "Parcial"
    municipio.estado = "MG"
    db.get.return_value = municipio

    def fake_fetch(_db, _mid, dataset):
        if dataset in {"caged", "pix"}:
            return ([{"foo": dataset}], "2026-05")
        raise _HE(status_code=404, detail=f"sem dados para {dataset}")

    good_response = MagicMock()
    good_response.content = [MagicMock(text=json.dumps([
        {"titulo": "Atenção: x", "observacao": "y", "dataset_referencia": "caged"},
        {"titulo": "Oportunidade: a", "observacao": "b", "dataset_referencia": "pix"},
        {"titulo": "Risco: c", "observacao": "d", "dataset_referencia": None},
    ]))]

    with patch.object(insights_service, "_fetch_dados", side_effect=fake_fetch), \
         patch.object(insights_service, "settings") as mock_settings, \
         patch.object(insights_service, "anthropic") as mock_anthropic:
        mock_settings.ANTHROPIC_API_KEY = "test-key"
        mock_anthropic.Anthropic.return_value.messages.create.return_value = good_response

        result = insights_service.gerar_prioridades(db, municipio_id=1)

    # The prompt should mention the missing datasets
    prompt_arg = mock_anthropic.Anthropic.return_value.messages.create.call_args.kwargs["messages"][0]["content"]
    assert "Datasets sem dados (ignore):" in prompt_arg
    for missing in ["arrecadacao", "pib", "rais", "bolsa_familia", "pe_de_meia", "inss", "estban", "comex", "empresas"]:
        assert missing in prompt_arg
```

- [ ] **Step 2: Run all 4 service tests**

Run: `python -m pytest tests/backend/test_insights_service.py -v`
Expected: 4 tests PASS.

- [ ] **Step 3: Commit**

```bash
git add tests/backend/test_insights_service.py
git commit -m "test(insights): cover no-data, missing-key, malformed-json, partial-data edges"
```

---

## Phase 2 — Backend API routes

### Task 4: Add Pydantic models and `GET /insights/prioridades`

**Files:**
- Modify: `backend/app/api/v1/routers/insights.py`

- [ ] **Step 1: Add the new response models near the top of the file**

In `backend/app/api/v1/routers/insights.py`, just after the existing `class InserirReleaseRequest(BaseModel):` block (around line 44), add:

```python
class PrioridadeItem(BaseModel):
    titulo: str
    observacao: str
    dataset_referencia: str | None = None


class PrioridadesResponse(BaseModel):
    id: int
    municipio_id: int
    periodo: str
    prioridades: list[PrioridadeItem]
    modelo: str
    gerado_em: datetime
    ativo: bool
    oculto_planos: list[str]

    model_config = {"from_attributes": True}


class GerarPrioridadesRequest(BaseModel):
    municipio_id: int


def _to_prioridades_response(insight) -> PrioridadesResponse:
    try:
        prioridades_raw = json.loads(insight.conteudo)
    except (json.JSONDecodeError, TypeError):
        prioridades_raw = [{"titulo": "Prioridade", "observacao": insight.conteudo, "dataset_referencia": None}]

    items = [
        PrioridadeItem(
            titulo=p.get("titulo", ""),
            observacao=p.get("observacao", ""),
            dataset_referencia=p.get("dataset_referencia"),
        )
        for p in (prioridades_raw if isinstance(prioridades_raw, list) else [])
    ]

    return PrioridadesResponse(
        id=insight.id,
        municipio_id=insight.municipio_id,
        periodo=insight.periodo,
        prioridades=items,
        modelo=insight.modelo,
        gerado_em=insight.gerado_em,
        ativo=insight.ativo,
        oculto_planos=_parse_oculto_planos(insight),
    )
```

- [ ] **Step 2: Add the GET route**

Add this route at the end of `backend/app/api/v1/routers/insights.py`:

```python
@router.get("/prioridades", response_model=PrioridadesResponse)
def get_prioridades(
    municipio_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    is_global = current_user.role.nome == "ADMIN_GLOBAL"
    mid = municipio_id if (is_global and municipio_id) else current_user.municipio_id
    if not mid:
        raise HTTPException(status_code=404, detail="Prioridades ainda não foram geradas.")

    q = db.query(InsightModel).filter(
        InsightModel.municipio_id == mid,
        InsightModel.dataset == "prioridades",
    )

    if not is_global:
        q = q.filter(InsightModel.ativo == True)
        from app.models.municipio import Municipio
        municipio = db.get(Municipio, mid)
        if municipio and municipio.plano == "free":
            from sqlalchemy import or_, not_
            q = q.filter(
                or_(
                    InsightModel.oculto_planos.is_(None),
                    not_(InsightModel.oculto_planos.contains("free")),
                )
            )

    insight = q.order_by(InsightModel.gerado_em.desc()).first()

    if not insight:
        raise HTTPException(status_code=404, detail="Prioridades ainda não foram geradas.")

    return _to_prioridades_response(insight)
```

- [ ] **Step 3: Restart the backend and smoke-test the GET as a regular user**

Run the backend (your usual command, e.g. `uvicorn app.main:app --reload --port 8000` from `backend/`).

In another terminal:
```bash
# First, log in as a regular ADMIN_MUNICIPIO and get a token (use the existing /auth/login flow).
# Then GET the route — expect 404 since no prioridades row exists yet.
curl -i -H "Authorization: Bearer <token>" http://localhost:8000/api/v1/insights/prioridades
```
Expected: `HTTP/1.1 404 Not Found` with `{"detail":"Prioridades ainda não foram geradas."}`

- [ ] **Step 4: Commit**

```bash
git add backend/app/api/v1/routers/insights.py
git commit -m "feat(insights): add GET /insights/prioridades route"
```

---

### Task 5: Add `POST /insights/prioridades/gerar`

**Files:**
- Modify: `backend/app/api/v1/routers/insights.py`

- [ ] **Step 1: Import the new service function**

In `backend/app/api/v1/routers/insights.py`, modify the existing import line (currently around line 7):

Replace:
```python
from app.services.insights_service import buscar_insight, gerar_insight, gerar_release
```

With:
```python
from app.services.insights_service import buscar_insight, gerar_insight, gerar_prioridades, gerar_release
```

- [ ] **Step 2: Add the POST route at the end of the file**

```python
@router.post("/prioridades/gerar", response_model=PrioridadesResponse)
def post_gerar_prioridades(
    body: GerarPrioridadesRequest,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    if current_user.role.nome != "ADMIN_GLOBAL":
        raise HTTPException(status_code=403, detail="Apenas ADMIN_GLOBAL pode gerar prioridades.")

    if not body.municipio_id:
        raise HTTPException(status_code=400, detail="municipio_id é obrigatório.")

    insight = gerar_prioridades(db, body.municipio_id)
    return _to_prioridades_response(insight)
```

- [ ] **Step 3: Smoke-test POST as ADMIN_GLOBAL**

```bash
# Get an ADMIN_GLOBAL token, then:
curl -i -X POST -H "Authorization: Bearer <admin_token>" \
  -H "Content-Type: application/json" \
  -d '{"municipio_id": 1}' \
  http://localhost:8000/api/v1/insights/prioridades/gerar
```

Expected: `HTTP/1.1 200 OK` with JSON body matching `PrioridadesResponse` — `prioridades` array of 3 items, `modelo="claude-haiku-4-5-20251001"`, `periodo` like `"2026-05"`.

- [ ] **Step 4: Smoke-test that a non-admin gets 403**

```bash
# As a regular ADMIN_MUNICIPIO token:
curl -i -X POST -H "Authorization: Bearer <regular_token>" \
  -H "Content-Type: application/json" \
  -d '{"municipio_id": 1}' \
  http://localhost:8000/api/v1/insights/prioridades/gerar
```

Expected: `HTTP/1.1 403 Forbidden`.

- [ ] **Step 5: Re-run GET as regular user to confirm the new row is now returned**

```bash
curl -i -H "Authorization: Bearer <regular_token>" http://localhost:8000/api/v1/insights/prioridades
```

Expected: `HTTP/1.1 200 OK` with the 3 priorities just generated.

- [ ] **Step 6: Commit**

```bash
git add backend/app/api/v1/routers/insights.py
git commit -m "feat(insights): add POST /insights/prioridades/gerar route"
```

---

## Phase 3 — Frontend panel

### Task 6: Create the `PrioridadesPanel` component

**Files:**
- Create: `frontend-observatorio/src/components/PrioridadesPanel.jsx`

- [ ] **Step 1: Write the component**

Create `frontend-observatorio/src/components/PrioridadesPanel.jsx`:

```jsx
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { SparklesIcon, ArrowRightIcon } from "@heroicons/react/24/outline";
import api from "../services/api";

const DATASET_ROUTE = {
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

const DATASET_LABEL = {
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

const PREFIX_STYLES = {
  "Atenção": { badge: "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400", label: "Atenção" },
  "Oportunidade": { badge: "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400", label: "Oportunidade" },
  "Risco": { badge: "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400", label: "Risco" },
};
const DEFAULT_STYLE = { badge: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300", label: "Prioridade" };

function parsePrefix(titulo) {
  const match = /^(Atenção|Oportunidade|Risco):\s*/.exec(titulo || "");
  if (!match) return { style: DEFAULT_STYLE, body: titulo || "" };
  return { style: PREFIX_STYLES[match[1]], body: titulo.slice(match[0].length) };
}

function fmtDate(dt) {
  if (!dt) return "";
  return new Date(dt).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export default function PrioridadesPanel() {
  const [state, setState] = useState({ status: "loading", data: null });

  useEffect(() => {
    api.get("/insights/prioridades")
      .then((res) => setState({ status: "ok", data: res.data }))
      .catch((err) => {
        if (err.response?.status === 404) setState({ status: "empty", data: null });
        else setState({ status: "error", data: null });
      });
  }, []);

  if (state.status === "loading") {
    return (
      <div className="rounded-2xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
        <div className="h-5 w-48 bg-slate-100 dark:bg-slate-800 rounded animate-pulse" />
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 mt-5">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-32 bg-slate-100 dark:bg-slate-800 rounded-xl animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (state.status === "error") return null;

  if (state.status === "empty") {
    return (
      <div className="rounded-2xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
        <div className="flex items-center gap-2 mb-2">
          <SparklesIcon className="w-5 h-5 text-violet-500" />
          <h2 className="text-base font-bold text-slate-800 dark:text-white">Prioridades do mês</h2>
        </div>
        <p className="text-sm text-slate-400 dark:text-slate-500">
          As prioridades ainda não foram geradas. Aguarde o próximo ciclo de análise.
        </p>
      </div>
    );
  }

  const { prioridades, gerado_em } = state.data;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="rounded-2xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 p-6"
    >
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <SparklesIcon className="w-5 h-5 text-violet-500" />
          <h2 className="text-base font-bold text-slate-800 dark:text-white">Prioridades do mês</h2>
        </div>
        <span className="text-xs text-slate-400 dark:text-slate-500">gerado em {fmtDate(gerado_em)}</span>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {prioridades.map((p, i) => {
          const { style, body } = parsePrefix(p.titulo);
          const route = p.dataset_referencia ? DATASET_ROUTE[p.dataset_referencia] : null;
          const datasetLabel = p.dataset_referencia ? DATASET_LABEL[p.dataset_referencia] : null;
          return (
            <div key={i} className="flex flex-col gap-2 p-4 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30">
              <span className={`inline-flex w-fit text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${style.badge}`}>
                {style.label}
              </span>
              <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100 leading-snug">{body}</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">{p.observacao}</p>
              {route && datasetLabel && (
                <Link
                  to={route}
                  className="inline-flex items-center gap-1 text-xs font-medium text-violet-600 hover:text-violet-700 dark:text-violet-400 mt-1"
                >
                  Ver em {datasetLabel}
                  <ArrowRightIcon className="w-3.5 h-3.5" />
                </Link>
              )}
            </div>
          );
        })}
      </div>
    </motion.div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend-observatorio/src/components/PrioridadesPanel.jsx
git commit -m "feat(frontend): add PrioridadesPanel component"
```

---

### Task 7: Mount `PrioridadesPanel` on Dashboard Geral

**Files:**
- Modify: `frontend-observatorio/src/pages/DashboardGeralPage.jsx`

- [ ] **Step 1: Import the panel**

In `frontend-observatorio/src/pages/DashboardGeralPage.jsx`, add to the imports block (next to the existing `InsightsPanel` import around line 5):

```jsx
import PrioridadesPanel from "../components/PrioridadesPanel";
```

- [ ] **Step 2: Render between the page header and the KPI hero**

In `frontend-observatorio/src/pages/DashboardGeralPage.jsx`, the return statement starts at line 221. The structure is `<motion.div>` → `<NidPageHeader … />` (line 227-230) → `{/* Hero KPIs */}` (line 232). Insert `<PrioridadesPanel />` between the `NidPageHeader` close and the `{/* Hero KPIs */}` comment.

Replace:
```jsx
      <NidPageHeader
        title="Dashboard Geral"
        sub="Indicadores econômicos consolidados do município"
      />

      {/* Hero KPIs (neon design) */}
```

With:
```jsx
      <NidPageHeader
        title="Dashboard Geral"
        sub="Indicadores econômicos consolidados do município"
      />

      <div className="mt-4 mb-6">
        <PrioridadesPanel />
      </div>

      {/* Hero KPIs (neon design) */}
```

- [ ] **Step 3: Manual UI test**

Run `npm run dev` in `frontend-observatorio/`. Log in as a regular `ADMIN_MUNICIPIO` user.

Open `/app`. Verify:
- Panel renders at the top, ABOVE the existing KPI hero.
- If no prioridades exist yet (and you haven't run the admin trigger), the empty state shows "As prioridades ainda não foram geradas."
- After running `POST /insights/prioridades/gerar` (via curl or via Task 8's admin UI), reload `/app`. Three priorities appear with correct badge colors and drill-down links.
- Click each "Ver em [Dataset] →" link. Confirm correct navigation.

- [ ] **Step 4: Commit**

```bash
git add frontend-observatorio/src/pages/DashboardGeralPage.jsx
git commit -m "feat(dashboard): mount PrioridadesPanel at top of Dashboard Geral"
```

---

## Phase 4 — Admin trigger

### Task 8: Add Prioridades admin section to `InsightsAdminPage`

**Files:**
- Modify: `frontend-observatorio/src/pages/admin/InsightsAdminPage.jsx`

- [ ] **Step 1: Add state for the priorities row**

In `frontend-observatorio/src/pages/admin/InsightsAdminPage.jsx`, after the existing state declarations (around line 53 where `submittingManual` is declared), add:

```jsx
  const [prioridades, setPrioridades] = useState(null);
  const [generatingPrioridades, setGeneratingPrioridades] = useState(false);
```

- [ ] **Step 2: Fetch priorities when a município is selected**

Modify the existing `loadInsights` function to also fetch the priorities row. Replace the body of `loadInsights` with:

```jsx
  const loadInsights = (id) => {
    setLoadingInsights(true);
    setInsights({});
    setReleases({});
    setPrioridades(null);
    Promise.all([
      api.get("/insights/admin", { params: { municipio_id: id } }),
      api.get("/insights/admin_releases", { params: { municipio_id: id } }),
      api.get("/insights/prioridades", { params: { municipio_id: id } }).catch((err) => {
        if (err.response?.status === 404) return { data: null };
        throw err;
      }),
    ])
      .then(([insRes, relRes, priRes]) => {
        const map = {};
        (insRes.data || []).forEach((ins) => { map[ins.dataset] = ins; });
        setInsights(map);

        const relMap = {};
        (relRes.data || []).forEach((ins) => {
          const baseKey = ins.dataset.replace(/^release_/, "");
          relMap[baseKey] = ins;
        });
        setReleases(relMap);

        setPrioridades(priRes.data);
      })
      .catch(() => { setInsights({}); setReleases({}); setPrioridades(null); })
      .finally(() => setLoadingInsights(false));
  };
```

- [ ] **Step 3: Add the generation handler**

Add this handler near the other `handleGerar*` functions (after `handleGerarTodos`):

```jsx
  const handleGerarPrioridades = async () => {
    setGeneratingPrioridades(true);
    try {
      const res = await api.post("/insights/prioridades/gerar", {
        municipio_id: parseInt(selectedId),
      });
      setPrioridades(res.data);
    } catch (err) {
      console.error("Erro ao gerar prioridades:", err.response?.data?.detail || err.message);
    } finally {
      setGeneratingPrioridades(false);
    }
  };
```

- [ ] **Step 4: Render the prioridades section above the Datasets table**

Inside the `{selectedId && (...)}` block, just before the existing `{/* Dataset table */}` comment / div (around line 299), insert:

```jsx
      {/* Prioridades do mês */}
      {selectedId && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm p-6">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-base font-bold text-slate-800 dark:text-white">Prioridades do mês</h3>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                Top 3 observações cruzando todos os datasets. Renderizado no topo do Dashboard Geral.
              </p>
            </div>
            <button
              onClick={handleGerarPrioridades}
              disabled={generatingPrioridades || loadingInsights}
              className="inline-flex items-center gap-2 text-sm font-medium text-violet-600 hover:text-violet-700 dark:text-violet-400 disabled:opacity-40 transition-colors px-3 py-2 rounded-xl hover:bg-violet-50 dark:hover:bg-violet-950/40"
            >
              <ArrowPathIcon className={`w-4 h-4 ${generatingPrioridades ? "animate-spin" : ""}`} />
              {generatingPrioridades
                ? "Gerando..."
                : prioridades
                  ? "Regenerar"
                  : "Gerar"}
            </button>
          </div>
          {prioridades ? (
            <div className="text-xs text-slate-500 dark:text-slate-400">
              Última geração: {fmtDate(prioridades.gerado_em)} · período {prioridades.periodo} · {prioridades.prioridades.length} prioridade(s)
            </div>
          ) : (
            <div className="text-xs text-slate-400 dark:text-slate-500">Ainda não gerado para este município.</div>
          )}
        </div>
      )}
```

- [ ] **Step 5: Manual admin flow test**

Run `npm run dev` and log in as ADMIN_GLOBAL. Open `/admin/insights`. Select a município with data.

Verify:
- A new card "Prioridades do mês" appears above the Datasets table.
- "Gerar" button is enabled. Click it. Spinner shows. After ~5-10s, button becomes "Regenerar" and the card shows "Última geração: …" with today's date.
- Open `/app` in another tab as a regular user of that município. PrioridadesPanel now shows 3 priorities.
- Back in `/admin/insights`, click "Regenerar". Confirm spinner + updated timestamp.
- Try clicking with no município selected — button should be disabled (loadingInsights is false but no selectedId; verify by selecting "Selecione um município..."). NOTE: the section only renders when selectedId is truthy, so this case won't appear in practice.

- [ ] **Step 6: Commit**

```bash
git add frontend-observatorio/src/pages/admin/InsightsAdminPage.jsx
git commit -m "feat(admin): add Prioridades do Mês trigger to InsightsAdminPage"
```

---

## Phase 5 — End-to-end verification

### Task 9: Full happy-path smoke test

- [ ] **Step 1: Run all backend tests**

```bash
python -m pytest tests/backend/ -v
```
Expected: 4 tests PASS.

- [ ] **Step 2: Run a full integration cycle in the browser**

1. Backend running (`uvicorn` from `backend/`), frontend running (`npm run dev` from `frontend-observatorio/`).
2. Log in as ADMIN_GLOBAL.
3. Go to `/admin/insights`, select a município with data, click "Gerar" in the Prioridades card. Confirm success (timestamp appears).
4. Log out, log in as an ADMIN_MUNICIPIO of that município.
5. Go to `/app`. Confirm PrioridadesPanel renders at the top with 3 items, each with a colored badge and a "Ver em [Dataset] →" link.
6. Click each drill-down link. Confirm navigation to the correct page.
7. Back at `/admin/insights` as ADMIN_GLOBAL, click "Regenerar". Confirm the timestamp updates. Reload `/app` as the regular user — confirm the 3 priorities may have changed (or stayed similar) and the timestamp is fresh.
8. Visit `/admin/insights` and use the existing PATCH UI (e.g. the existing oculto/ativo controls on insights) to confirm patterns are consistent. (The Prioridades row itself doesn't expose those controls in this v1 — admin uses the API directly if needed.)

- [ ] **Step 3: Run the frontend build to ensure no compile errors**

```bash
cd frontend-observatorio && npx vite build 2>&1 | tail -20
```
Expected: "built in Xs" with no errors.

- [ ] **Step 4: Final commit (only if anything was tweaked during verification)**

```bash
# Only run if tweaks were made:
git add -A
git commit -m "fix(prioridades): smoke-test adjustments"
```

---

## Out of scope for this plan (deferred to follow-ups)

These are in [IDEAS.md](../../../IDEAS.md) and the spec's "Future follow-ups" section:

- ADMIN_MUNICIPIO self-service "Atualizar" button on the panel.
- Auto-regeneration triggered by ingestion (needs APScheduler).
- Útil / Não-útil feedback per priority.
- Historical view: previous months' priorities + delta.
- Cross-município "portfolio priorities" for ADMIN_GLOBAL.
- FastAPI TestClient harness for integration tests (the repo doesn't have one yet; this plan uses service-level unit tests with mocks instead, matching the existing `tests/ingestao/test_utils.py` pattern).
