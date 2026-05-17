# Spec: Prioridades do Mês (AI cross-dataset priority panel)

**Date:** 2026-05-17
**Status:** Approved for implementation planning
**Surface:** Dashboard Geral
**Dependencies:** Existing `InsightIA` model, `insights_service.py`, `/insights` router, Claude Haiku 4.5

## Context

The platform already runs Claude-generated **per-dataset insights** (5 strategic bullets per dataset, careful guardrails per dataset in [insights_service.py](../../../backend/app/services/insights_service.py)) and per-dataset releases (5-paragraph press). Users see useful analysis when they visit a specific data page — but the Dashboard Geral lacks an actionable cross-dataset entry point: "of everything that's moved this month across the 11 economic datasets, what matters most?"

This spec introduces a small AI surface — **Prioridades do Mês** — that lives at the top of Dashboard Geral. It generates the 3 most strategically important observations of the month across all datasets, each linked to its source data page so the user can drill in.

Why this feature, why now: the existing insights infra has done the hard prompt-engineering work for each dataset. A prioritization layer on top is the cheapest, lowest-risk way to expand AI presence to the most-visited page of the app, and gives every user an AI moment on every visit without changing any data flow.

## Goals

- Surface the 3 highest-priority cross-dataset observations for a município at the top of Dashboard Geral.
- Provide a one-click drill-down from each priority to the underlying dataset page.
- Reuse existing `InsightIA` storage, `_fetch_dados`, generation/permission patterns — no new model, no new ingestion.
- Match the careful tone of existing prompts (observation, not directive).

## Non-goals (v1)

- Background/auto-generation. ADMIN_GLOBAL triggers manually (matches today's `POST /insights/gerar` flow).
- Feedback / útil-não-útil voting.
- ADMIN_MUNICIPIO self-service generation.
- Notifications when new priorities are published.
- Historical view of past months' priorities.
- Mobile-specific layout (the page already works on mobile via existing Tailwind responsive utilities).

## User experience

**Where:** New `PrioridadesPanel` mounted at the very top of [DashboardGeralPage.jsx](../../../frontend-observatorio/src/pages/DashboardGeralPage.jsx), above the current KPI grid.

**What the user sees** (regular `ADMIN_MUNICIPIO` / `VISUALIZADOR`):
- Header: "Prioridades do mês" + small "gerado em DD/MM/AAAA" timestamp.
- 3 stacked priority rows (3-column grid at `xl` breakpoint).
- Each row: colored badge (Atenção→amber, Oportunidade→blue, Risco→red, fallback→slate), bold title, 1-2 line observation, "Ver em [Dataset] →" link when `dataset_referencia` is present.
- Click the link → navigates to the dataset's existing page (e.g. `/app/caged`).

**States:**
- Loading: skeleton placeholder (3 grey blocks).
- Empty / 404: "As prioridades ainda não foram geradas. Aguarde o próximo ciclo de análise."
- Error: hidden panel + toast via existing `ToastContext`.

**Admin trigger:** Added to [InsightsAdminPage.jsx](../../../frontend-observatorio/src/pages/admin/InsightsAdminPage.jsx) as a new row beside the per-dataset generation buttons. ADMIN_GLOBAL clicks "Gerar" / "Regenerar"; result is cached for the period (`YYYY-MM`).

**Plan gating:** Reuses the existing `oculto_planos` mechanism. Default v1: empty → visible to all plans. Business can later hide for free via the admin patch endpoint.

## Architecture

```
[DashboardGeralPage] ─ GET /insights/prioridades ─► [insights router]
                                                          │
                                                          ▼
                                            [_to_prioridades_response]
                                                          │
                                                          ▼
                                            latest InsightIA row where
                                            dataset='prioridades'
                                            municipio_id=current user's
                                            ativo=true (non-admins)
                                            plan-gating applied

[InsightsAdminPage] ─ POST /insights/prioridades/gerar ─► [insights router]
                                                                │
                                                                ▼
                                              [insights_service.gerar_prioridades]
                                                                │
                                                                ├─► for each dataset in 11 datasets:
                                                                │        _fetch_dados(db, municipio_id, dataset)
                                                                │        (skip on HTTPException 404)
                                                                │
                                                                ├─► assemble bundled prompt
                                                                │
                                                                ├─► anthropic.messages.create(
                                                                │        model='claude-haiku-4-5-20251001',
                                                                │        max_tokens=1500)
                                                                │
                                                                ├─► parse JSON array of 3 objects
                                                                │
                                                                ▼
                                            UPSERT InsightIA(
                                              municipio_id, dataset='prioridades',
                                              periodo='YYYY-MM',
                                              conteudo=json.dumps([{titulo, observacao, dataset_referencia}, …]))
```

## Backend

### New service function: `gerar_prioridades`

**Location:** [backend/app/services/insights_service.py](../../../backend/app/services/insights_service.py)

**Signature:**
```python
def gerar_prioridades(db: Session, municipio_id: int) -> InsightIA:
```

**Behavior:**
1. Validate `ANTHROPIC_API_KEY` is set (503 if not).
2. Load `Municipio` (404 if not found).
3. For each dataset in the 11 keys of `DATASET_LABELS` minus `"geral"`:
   - Call `_fetch_dados(db, municipio_id, dataset)`.
   - On `HTTPException(404)`, append the dataset key to `datasets_ausentes` and continue.
   - On success, store `(dataset_key, dataset_label, dados, periodo_dataset)` in a list.
4. If zero datasets had data: `raise HTTPException(400, "Sem dados suficientes para gerar prioridades.")`.
5. Build the bundled prompt (see "Prompt design").
6. Call Claude (`max_tokens=1500`).
7. Parse output (reuse the fence-stripping + `json.loads` fallback pattern from `gerar_insight`).
8. Determine the storage `periodo`: current UTC `strftime("%Y-%m")`.
9. Upsert `InsightIA` row via the same pattern as `gerar_insight` (find by unique key, update or insert).

### Prompt design

Follows the existing template pattern. New body sections, reuses `_PROIBICOES_GERAIS` and `_QUALITY_FILTER` verbatim.

```
Você é um analista estratégico sênior da Uaizi, especialista em prioridades
executivas para gestão pública municipal no Brasil.

Sua tarefa é identificar as 3 PRIORIDADES MAIS RELEVANTES do mês corrente
para o município de {nome} ({estado}), analisando todos os datasets
disponíveis no painel.

O QUE É:
Uma camada de prioridade executiva — não substitui a análise por dataset,
mas seleciona, entre todos os movimentos do período, os 3 que mais
merecem atenção imediata do gestor.

CRITÉRIOS DE PRIORIZAÇÃO:
- Magnitude da variação vs. baseline histórico do próprio município.
- Persistência (movimento isolado vs. tendência multi-período).
- Implicação para decisão pública.
- Risco de interpretação errada (priorize observações que ajudem o gestor
  a evitar conclusões equivocadas).

REGRAS DE TOM:
- Use observação ("Atenção a X", "Oportunidade em Y"), nunca prescrição
  ("Faça Z").
- Cada prioridade aponta UM dataset principal de referência.
- Diversifique: evite que as 3 prioridades venham do mesmo dataset.
- Se um dataset não foi incluído por falta de dados, ignore-o — não invente.

PREFIXOS PERMITIDOS PARA O TÍTULO:
"Atenção:", "Oportunidade:", "Risco:".

[_PROIBICOES_GERAIS — herdado verbatim]
[_QUALITY_FILTER — herdado verbatim]

FORMATO DE SAÍDA:
JSON array de EXATAMENTE 3 objetos. Sem texto fora do array. Sem fences.
[
  {
    "titulo": "Atenção: <5-10 palavras>",
    "observacao": "<2-3 frases com dados concretos do município>",
    "dataset_referencia": "<chave: caged | pib | arrecadacao | rais | bolsa_familia | pe_de_meia | inss | estban | comex | empresas | pix | null>"
  },
  ...
]

ENTRADA:
Município: {nome} ({estado})
Datasets sem dados (ignore): {lista}
Dados consolidados:
{json com dados de cada dataset disponível, agrupados por chave}
```

### Storage

Reuses `InsightIA` table — no migration:
- `municipio_id` — current user's município
- `dataset` — literal `"prioridades"`
- `periodo` — current UTC `YYYY-MM` at generation time
- `conteudo` — `json.dumps([{titulo, observacao, dataset_referencia}, …], ensure_ascii=False)`
- `modelo` — `"claude-haiku-4-5-20251001"`
- `ativo` — `True` (default)
- `oculto_planos` — `NULL` (default; admin can patch later)

The existing unique constraint `(municipio_id, dataset, periodo)` makes the upsert collision-safe — re-running for the same month overwrites the existing row.

### Output parsing fallback

Reuses the existing fence-stripping pattern:
1. `raw = message.content[0].text.strip()`
2. If starts with ` ``` `, drop all fence lines.
3. `json.loads(raw)` → list of dicts.
4. On `JSONDecodeError` or wrong shape: store as single fallback priority `[{"titulo": "Prioridade", "observacao": <raw>, "dataset_referencia": null}]` and log a warning. Don't retry.

## API

### `GET /insights/prioridades`

**Auth:** any authenticated user.
**Permissions:** uses the same filters as `GET /insights`:
- `municipio_id` resolved from the current user (ADMIN_GLOBAL can pass `?municipio_id=` query param).
- Non-admins only see `ativo=True` rows.
- Plan-based `oculto_planos` filter applied (current implementation checks `free`).

**Response:** `200` with `PrioridadesResponse`, or `404 {"detail": "Prioridades ainda não foram geradas."}`.

```python
class PrioridadeItem(BaseModel):
    titulo: str
    observacao: str
    dataset_referencia: str | None

class PrioridadesResponse(BaseModel):
    id: int
    municipio_id: int
    periodo: str             # "YYYY-MM"
    prioridades: list[PrioridadeItem]
    modelo: str
    gerado_em: datetime
    ativo: bool
    oculto_planos: list[str]
```

### `POST /insights/prioridades/gerar`

**Auth:** ADMIN_GLOBAL only (matches `POST /insights/gerar`).
**Request:** `{"municipio_id": int}`.
**Response:** `200` with `PrioridadesResponse` of the newly created/updated row.

### Reused

- `PATCH /insights/{id}` — already exists; works for toggling `ativo` and setting `oculto_planos` on the priorities row too.
- `DELETE /insights/{id}` — already exists.

## Frontend

### New component: `PrioridadesPanel`

**Location:** [frontend-observatorio/src/components/PrioridadesPanel.jsx](../../../frontend-observatorio/src/components/PrioridadesPanel.jsx)

**Responsibility:** fetch and render `GET /insights/prioridades`. Self-contained loading/empty/error states. No internal admin trigger.

**Render approximation:**
```jsx
<div className="rounded-2xl border ... p-5">
  <header>
    <h2>Prioridades do mês</h2>
    <span className="text-xs text-slate-400">gerado em {fmtDate(gerado_em)}</span>
  </header>
  <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 mt-4">
    {prioridades.map(p => <PrioridadeItem key={...} item={p} />)}
  </div>
</div>
```

**Per-item:**
```jsx
<div>
  <span className={badgeColorFromTitulo(p.titulo)}>{prefixOf(p.titulo)}</span>
  <h3>{stripPrefix(p.titulo)}</h3>
  <p>{p.observacao}</p>
  {p.dataset_referencia && DATASET_ROUTE[p.dataset_referencia] && (
    <Link to={DATASET_ROUTE[p.dataset_referencia]}>Ver em {DATASET_LABEL[p.dataset_referencia]} →</Link>
  )}
</div>
```

**Dataset key → route map** lives in the component (small frontend table):
```js
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
```

**Badge color** by prefix regex on `titulo`:
- `Atenção:` → amber
- `Oportunidade:` → blue
- `Risco:` → red
- otherwise → slate

### Dashboard mount

[DashboardGeralPage.jsx](../../../frontend-observatorio/src/pages/DashboardGeralPage.jsx) imports and renders `<PrioridadesPanel />` at the very top of the page content, above the KPI grid.

### Admin trigger

[InsightsAdminPage.jsx](../../../frontend-observatorio/src/pages/admin/InsightsAdminPage.jsx) gains a new row in its existing dataset list:
- Label: "Prioridades do mês"
- Buttons: "Gerar" (first time) / "Regenerar" (updates current period)
- Calls `POST /insights/prioridades/gerar` with the currently selected `municipio_id`.
- Existing `ativo` / `oculto_planos` controls reused via `PATCH /insights/{id}`.

## Edge cases

| Case | Handling |
|---|---|
| Município has no data for some datasets | Skipped during `gerar_prioridades`. Skipped list passed into the prompt so AI doesn't hallucinate. |
| Município has zero data overall | 400 "Sem dados suficientes para gerar prioridades." Admin sees toast. |
| Claude returns malformed JSON | Fence-strip + `json.loads`; on failure store single fallback priority with raw text; warning logged. |
| Fewer/more than 3 items returned | Accept; truncate to first 3 if more; render whatever is there if fewer. |
| `dataset_referencia` returns an invalid key | Frontend `DATASET_ROUTE` lookup returns undefined → no link rendered. Backend doesn't validate (forward-compatible). |
| `ANTHROPIC_API_KEY` not set | 503 from service. |
| Concurrent generation | Unique constraint `(municipio_id, dataset, periodo)` + upsert pattern handles last-write-wins. |
| Cross-month cache | `periodo` derived from current UTC at generation. New month → new row. |
| Token budget | Bundled prompt ≈ 10–15k input tokens (11 datasets × ~1k + system). Haiku 4.5 handles comfortably. `max_tokens=1500` output. |
| Plan gating | Existing `oculto_planos` mechanism. Default empty → visible to all. |

## Testing strategy

**Backend (pytest):**
- Unit test `gerar_prioridades` with mocked `anthropic.Anthropic.messages.create` returning canned JSON. Assert upsert, modelo, periodo format, parsing of `conteudo`.
- Test the "all datasets empty" path → 400.
- Test the "malformed JSON" path → fallback priority stored.
- Test that `_fetch_dados` 404 for one dataset is swallowed and `datasets_ausentes` populated.

**Backend (integration):**
- `POST /insights/prioridades/gerar` with ADMIN_GLOBAL → 200; without → 403.
- `GET /insights/prioridades` filtering (active/plan) returns the expected row.
- `PATCH` to set `oculto_planos: ["free"]` then GET as free-plan user → 404.

**Frontend (manual, no Vitest in current repo):**
1. Run `npm run dev` in `frontend-observatorio`.
2. As ADMIN_GLOBAL, navigate to `/admin/insights`, select a município with data, click "Gerar prioridades". Confirm spinner → success toast.
3. Switch to a regular user of that município. Open `/app`. Confirm the panel renders 3 priorities with correct badge colors, observations, and drill-down links.
4. Click each link. Confirm navigation to the correct dataset page.
5. As ADMIN_GLOBAL, patch the priorities row to `ativo=false`. Reload as regular user. Confirm panel shows empty state.
6. Patch `oculto_planos=["free"]`, log in as a free-plan user. Confirm empty state.

## Future follow-ups (out of scope for v1, in IDEAS.md)

- ADMIN_MUNICIPIO self-service "Atualizar" button on the panel itself.
- Auto-regeneration triggered by ingestion (needs APScheduler).
- Útil / Não-útil feedback per priority (improves prompt tuning).
- Historical view: previous months' priorities + delta comparison.
- Cross-município "portfolio priorities" for ADMIN_GLOBAL.
