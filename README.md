# Observatório Econômico Municipal

Multi-tenant economic dashboard SaaS for Brazilian municipalities. Centralizes and visualizes public economic data by city, with role-based access control and AI-generated insights.

---

## Features

### Datasets & Pages

| Page | Dataset | Source |
|------|---------|--------|
| Dashboard Geral | KPIs across all datasets | Aggregated |
| Arrecadação | Monthly tax revenue (ICMS, IPVA, IPI) | Secretaria da Fazenda MG |
| PIB | Annual GDP per municipality | IBGE — automática |
| VAF | Annual Fiscal Value Added + IPM (basis for ICMS distribution), with projected ICMS | Secretaria da Fazenda MG |
| CAGED | Formal employment flows (admissions, dismissals, gender, race, salary, CNAE) | MTE |
| RAIS | Employment census (total, gender, race, CNAE, avg. wage) | MTE |
| Bolsa Família | Beneficiaries, total transferred, Primeira Infância | Portal da Transparência — automática |
| Pé-de-Meia | Students benefited, school stage breakdown | Portal da Transparência — automática |
| INSS | Social security benefits by category | INSS |
| Bancos (Estban) | Bank deposits, credit operations, savings per institution | BACEN — automática |
| Comércio Exterior | Exports/imports by product and country | MDIC — automática |
| Empresas | Active companies by size and CNAE sector | Receita Federal |
| PIX | Transactions per município (payer/receiver, PF/PJ, monthly) | BCB — automática |
| Comparativo | Side-by-side ranking across municipalities | Aggregated |
| IPS | Social progress index (79 metrics, 3 dimensions, 12 components) | IPS Brasil |
| FPM | Population-band alert + monthly transfers (coefficient, band-change opportunity/risk) | STN + IBGE |
| Dinheiro na Mesa | Federal grants (SICONV) vs. peer municipalities | Transferegov/SICONV |
| Emendas | Parliamentary amendments earmarked to the city (incl. emendas Pix) | Portal da Transparência |

### Core Features

- **Multi-tenant RBAC** — `ADMIN_GLOBAL` sees all municipalities; `ADMIN_MUNICIPIO` and `VISUALIZADOR` are scoped to their own city
- **Plan-based module access** — `free`/`pro`/`premium` plans gate features per municipality, enforced **on the backend** (a user can't reach a dataset's API unless their plan includes its module); configured in **Planos & Acessos**
- **AI Insights** — Claude-powered analysis per dataset (incl. VAF), generated on demand and cached in the database
- **Admin data management** — per-dataset and whole-ingestion wipe, **CSV re-ingestion via upload** (with `codigo_ibge` validation to block wrong-city loads), per-município **data-sanity diagnostics** (e.g. MEI all-zero, single-year series), and an **ingestion audit trail**
- **VAF / projected ICMS** — IPM trend plus ICMS repasse projected from realized revenue × IPM ratio
- **Fontes de Dados Automáticas** — in-app ingestion from public APIs/bulk CSVs (no manual CSV): População IBGE, FPM (STN), Captação Federal (SICONV), Emendas (Portal da Transparência), PIB (IBGE), PIX (BCB), Estban (BCB), Comex (MDIC), Bolsa Família and Pé-de-Meia (Portal da Transparência), triggered from **Admin → Fontes de Dados**, run as a **background job** (`POST .../{key}/executar` → 202 `{job_id}`, polled via `GET .../jobs/{id}`) with audit trail — see [Fontes de Dados Automáticas](#fontes-de-dados-automáticas-ingestão-in-app)
- **Alerta de Faixa do FPM** — population vs. the 18 FPM coefficient bands (DL 1.881/81): band-change opportunity/risk with R$/year estimates, card on Painel do Prefeito + `/app/fpm` (free on all plans)
- **Dinheiro na Mesa & Radar de Emendas** — federal grants captured vs. peer municipalities and parliamentary amendments by author/execution; **hybrid gating**: headline cards free on the Painel do Prefeito, full pages gated by the `captacao_federal`/`emendas` plan modules — see [usage](#dinheiro-na-mesa--radar-de-emendas)
- **Automatic notifications** — data-driven alerts in the bell (FPM band events, first-load captação diagnostic, new current-year emendas), deduplicated per município
- **Timeline do Mandato** — Admins register milestones (term starts, public works, policies, events) shown as a scrollable timeline on the dashboard
- **JWT Authentication** — OAuth2 Password flow with access + refresh tokens
- **City filter on ingestion** — Choose which municipalities to load in `carregar_tudo.py`; IPS loads separately via `carregar_ips.py`

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | FastAPI, SQLAlchemy 2.0, Pydantic v2, Alembic |
| Database | PostgreSQL |
| Frontend | React 19 (JSX), Vite, Tailwind CSS, Recharts, Framer Motion |
| AI | Anthropic Claude API (`claude-haiku-4-5`) |
| Deploy | Railway (backend + frontend + PostgreSQL) |
| Local dev | Docker Compose |

---

## Quick Start — Dev Container (recommended)

The dev container provides Python 3.11 + Node 20 + PostgreSQL 16 in an isolated environment. No local installs needed beyond Docker and VS Code.

**Prerequisites:** [Docker Desktop](https://www.docker.com/products/docker-desktop/) + [VS Code](https://code.visualstudio.com/) with the [Dev Containers](https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.remote-containers) extension.

**1. Open in container**

```
Ctrl+Shift+P → "Dev Containers: Reopen in Container"
```

First run takes ~3–5 min: builds the image, starts PostgreSQL, installs Python + Node deps, and runs `alembic upgrade head` automatically.

**2. Start the servers**

Press `Ctrl+Shift+B` (default build task) to start backend + frontend in parallel, or manually:

```bash
# Terminal 1 — Backend
cd backend && uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# Terminal 2 — Frontend
cd frontend-observatorio && npm run dev -- --host
```

**3. Open the app**

VS Code auto-forwards ports and shows a notification. Click "Open in Browser" or go to:

| Service | URL |
|---------|-----|
| Frontend | http://localhost:5173 |
| API | http://localhost:8000 |
| Swagger UI | http://localhost:8000/docs |

No `.env` file needed — the frontend defaults to `http://localhost:8000/api/v1` and the backend reads DB credentials from the container environment.

**Dev DB credentials (local only):**

```
Host: localhost:5432  Database: observatorio_dev
User: observatorio    Password: observatorio
```

**Other available tasks** (`Ctrl+Shift+P → Run Task`):

| Task | Action |
|------|--------|
| Start All Dev Servers | Backend + frontend in parallel |
| Backend: Run Migrations | `alembic upgrade head` |
| Ingestão: Carregar Tudo (MG) | Load all datasets for MG |

---

## Quick Start (Docker Compose — production-like)

```bash
# 1. Copy and fill in the environment file
cp .env.example .env     # or create .env manually (see Environment Variables below)

# 2. Start everything
docker compose up --build

# 3. Open the app
# Frontend:  http://localhost
# API docs:  http://localhost:8000/docs
```

Default login credentials (seeded by initial migration):

| Role | Email | Password |
|------|-------|----------|
| ADMIN_GLOBAL | admin@observatorio.com | admin123 |
| ADMIN_MUNICIPIO | admin.municipio@observatorio.com | admin123 |

---

## Environment Variables

Create `.env` at the project root:

```env
# Database
POSTGRES_DB=observatorio
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres
POSTGRES_HOST=db          # "db" inside Docker, "localhost" for local dev
POSTGRES_PORT=5432

# Auth
SECRET_KEY=change-this-in-production
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=60
REFRESH_TOKEN_EXPIRE_DAYS=7

# App
ENVIRONMENT=production

# AI Insights (required to generate insights)
ANTHROPIC_API_KEY=sk-ant-...
```

For local development (ingestion scripts, local API), create `.env.local` which overrides `.env`:

```env
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
# ... rest of the vars
```

---

## Alembic Migrations

Run from the **project root** (not from inside `backend/`):

```powershell
# Windows PowerShell — from project root
$env:PYTHONPATH = "$PWD\backend"; alembic -c backend\alembic.ini upgrade head
```

```bash
# Linux / Mac — from project root
PYTHONPATH=backend alembic -c backend/alembic.ini upgrade head
```

### Migration history

| Migration | Description |
|-----------|-------------|
| `0001` | Users, roles, municipalities, seed data |
| `0002` | CAGED and RAIS base tables |
| `0003` | Bolsa Família, Pé-de-Meia, INSS, Estban, Comex, Empresas |
| `0004` | Detail tables (by institution, product, country, stage) |
| `0005` | CAGED/RAIS breakdowns, `insights_ia` table |
| `0006` | Timeline do Mandato milestones table |
| `0007` | Plano, brasão, custom cards |
| `0008–0011` | Insight visibility, dataset info, RAIS extras, PIX, Estban fields |
| `0012` | Rename `paid` → `pro`, add `premium` plan |
| `0013` | Notificações + NotificacaoLida tables |
| `0014` | Drop always-NULL `setor` column from CAGED |
| `0015` | Add `qt_pes_recebedor_pf` to PIX |
| `0016` | Drop always-NULL `setor` column from RAIS |
| `0017` | Rename `admissões` → `admissoes` in CAGED (remove accent) |
| `0018` | `projeto_eixos` + `projetos` tables |
| `0019` | `indicadores_internos` + `plano_gov_acoes` + `eventos_municipio` tables |
| `0020` (68bbe475...) | Add `ips_municipio` table with unique constraint on (municipio_id, ano) |
| `0021–0022` | RAIS + CAGED extra aggregate tables |
| `a06cfa9f…` / `b002efc4…` | Desenvolvimento Econômico tables; CAGED escolaridade/faixa-etária |
| `0023` | `is_demo` flag on municipalities |
| `0024` | Per-dataset unique constraints |
| `0025` | `login_audit` table |
| `0026` | `fonte` + `data_atualizacao` on `dataset_info` |
| `0027` | `vaf_anual` table (VAF / IPM) |
| `0028` | `ingestao_audit` table (data-load audit trail) |
| `0029` | `imagem`/preset fields on `projetos` |
| `0030` | `populacao_municipio` + `fpm_mensal` tables (FPM band alert) |
| `0031` | `captacao_federal_anual` + `emenda_parlamentar` tables (Dinheiro na Mesa / Radar de Emendas) |
| `0032` | `ingestao_job` table (background jobs for Fontes de Dados Automáticas: status, progresso/heartbeat, resumo/erro) |

---

## Data Ingestion

CSV files live in `dados/` at the **project root** (not versioned). The loaders
live in **`backend/ingestao/`** (packaged with the backend so the admin "Reprocessar"
upload works in production) and connect directly to the database — so they need
`backend/` on the Python path. `dados/` stays at the root and is resolved
automatically.

### Setup

```powershell
# From project root, with venv active
pip install -r backend/requirements.txt
pip install -r backend/ingestao/requirements.txt
```

### Load data

Run from the **project root** with `backend` on `PYTHONPATH`. `--cidades` are the
folder names under `dados/`; `--ibge` (optional) lists the IBGE codes in the same
order. Environment is read automatically from `.env.local`.

```powershell
# Windows PowerShell
$env:PYTHONPATH = "backend"
python -m ingestao.carregar_tudo --estado MG --cidades "Simão Pereira" --ibge 3167509
```

```bash
# Linux / Mac / Git Bash — multiple cities
PYTHONPATH=backend python -m ingestao.carregar_tudo --estado MG --cidades cabo_verde nova_lima --ibge 3105905 3136702
```

Individual datasets aren't separate CLIs — `carregar_tudo` runs every loader for
the chosen cities. To re-ingest a **single** dataset with a corrected CSV, use the
admin UI: **Painel Admin → Datasets → Reprocessar** (uploads the CSV, validates
`codigo_ibge`, wipes and reloads that dataset, and records an audit entry).

```bash
# IPS (Índice de Progresso Social) — separate script, national CSV
PYTHONPATH=backend python -m ingestao.carregar_ips --ano 2024 2025
PYTHONPATH=backend python -m ingestao.carregar_ips --ano 2024 --estado MG   # filter by state
```

### Load to Railway (remote DB)

Set Railway connection details in `.env.local`:

```env
POSTGRES_HOST=your-project.proxy.rlwy.net
POSTGRES_PORT=12345
POSTGRES_DB=railway
POSTGRES_USER=postgres
POSTGRES_PASSWORD=your-password
```

Then run normally — scripts connect over the internet to Railway's PostgreSQL.

---

## Fontes de Dados Automáticas (ingestão in-app)

Besides the CSV loaders, the backend ingests ten datasets directly from public
sources — no manual CSV. Trigger them from **Admin → Fontes de Dados**
(`/admin/fontes`, `ADMIN_GLOBAL` only): pick an optional UF filter (or specific
municípios), choose whether to generate notifications, and click **Executar**.
Every run records an `IngestaoAudit` entry (`acao="auto_ingest"`) and refreshes
the dataset's "última atualização".

| Fonte (key) | Source | What it loads | Notes |
|-------------|--------|---------------|-------|
| `populacao` | IBGE API (agregado 6579) | Annual population estimates per município | Base for FPM bands and peer groups. Fires the FPM band notifications. IBGE didn't publish 2022/2023 estimates |
| `fpm` | STN / Tesouro Transparente (CSV ~30 MB) | Monthly FPM transfers (gross) | Matched by name+UF (CSV has no IBGE code); default last 3 years |
| `captacao_federal` | Transferegov/SICONV (4 zipped CSVs, ~230 MB total) | Federal grants per município/year: firmado (`VL_REPASSE_CONV`), desembolsado, via-emenda split, nº of convênios (2019→current) | **Run for a whole UF (or national)** — the peer comparison needs every município of the UF. Takes a few minutes (the proposta file is ~190 MB). A município with no grants simply gets no rows (zero is data, not an error) |
| `emendas` | Portal da Transparência (zip ~32 MB) | Parliamentary amendments per município: author, type, function, empenhado/liquidado/pago + restos (2019→current) | CSV has a native IBGE-code column. Amendments earmarked "Nacional"/state-wide aren't municipalizable — municipal totals are a floor. Includes emendas Pix (since May/2026) |
| `pib` | IBGE — PIB dos Municípios (agregado 5938) | Annual GDP per município: total + VA (agropecuária, indústria, serviços, governo) | API returns "Mil Reais"; the loader converts ×1000 and stores full reais (matching the legacy `pib_anual` table). Only writes `tipo_dado="REAL"` — legacy `PROJETADO` rows are untouched. Default window: last 6 published periods |
| `pix` | BCB — Estatísticas do PIX por município (Olinda) | Monthly PIX transaction aggregates (payer/receiver, PF/PJ) | One request per competência (national payload, filtered client-side by `AnoMes` — the OData `$filter=AnoMes eq …` is what actually filters; the `DataBase` function parameter does not). Series starts 2020-11 |
| `estban` | BCB — ESTBAN por agência | Monthly bank deposits/credit per município and per institution | Source is the **new** BCB channel (`bcb.gov.br/content/estatisticas/estatistica_bancaria_estban`, listing via `.../api/servico/sitebcb/Documentos/byListGuid`) — the legacy `www4.bcb.gov.br/fis/cosif/...` path was decommissioned. Values are full reais, no unit conversion. Published with a ~60–90 day lag |
| `comex` | MDIC — Comex Stat (CSVs `EXP/IMP_{ano}_MUN.csv`) | Exports/imports per município by month, product (SH4) and country | **Replace-by-year** semantics (not upsert): an aggregate dataset needs stale products/countries removed. A year is only replaced if both EXP and IMP downloaded successfully |
| `bolsa_familia` | Portal da Transparência (ZIPs mensais nacionais) | Monthly beneficiaries, total transferred, Primeira Infância | National file per competência (hundreds of MB); parsed streaming, matched by name+UF. Default window: last 12 months |
| `pe_de_meia` | Portal da Transparência (ZIPs mensais nacionais) | Monthly students benefited, breakdown by school stage/incentive type | Same shape as Bolsa Família; series starts 2024-01 |
| `rais` | MTE — RAIS, microdados de vínculos (PDET/FTP; ~4–6 GB decompressed per região) | Annual employment ties per município across 15 tables: total vínculos, sexo, raça, CNAE, faixa etária, escolaridade, faixa de remuneração, tempo de emprego, motivo de desligamento, tipo de admissão, CBO, tamanho do estabelecimento, natureza jurídica, turnover mensal | **Not part of the "todas" meta-job** (`FONTES_FORA_DO_TODAS` — heavy/annual, run on demand). **Replace-by-(município, ano)**, never a full wipe. Região file picked from the município's UF (`UF_REGIAO`); default year = latest published on the FTP (falls back to "`X` Parcial" with a warning). Strongly recommended with the separate worker (`INGESTAO_EXECUTOR=worker`) — one região download + parse can take tens of minutes |

Operational tips:

- Run `populacao` **before** `captacao_federal` — peer groups come from the latest population.
- Re-running is safe: all ten sources upsert (update-or-insert) or replace-by-period and never duplicate rows.
- Notifications are deduplicated per `(title, município)`: FPM band events, the
  first-load captação diagnostic ("R$ X na mesa" / "acima da média dos pares")
  and new current-year emendas.
- If a source changes its CSV/API layout, the run fails loudly with a
  *"layout mudou?"* error in the audit trail instead of loading garbage.

### Fluxo em background (jobs)

`POST /ingestao-automatica/{key}/executar` doesn't run the source inline — it
creates an `ingestao_job` row and starts a daemon thread, returning **202**
immediately with `{"job_id": ...}`. The frontend polls
`GET /ingestao-automatica/jobs/{id}` (status, `progresso_atual`/`progresso_total`,
`etapa`, and — once finished — `resumo`/`erro`) until the status leaves
`pendente`/`executando`. A refresh mid-run just resumes polling; progress isn't lost.

- **Trava global** — only one job may be `pendente`/`executando` at a time (the
  Railway container shares memory with the API; two heavy sources in parallel
  risk OOM). A second `executar` call while one is active gets **409**.
- **Heartbeat / abortado** — the job row's `atualizado_em` is written periodically
  (roughly every 25 municípios or on a step change) as a heartbeat. If the API
  process restarts mid-job, the next `iniciar_job` call finds the stale
  `executando`/`pendente` row (no heartbeat for 10+ minutes) and marks it
  `abortado` before starting the new one — so a crashed deploy never leaves the
  lock stuck forever.
- **Meta-job "todas"** — `POST /ingestao-automatica/todas/executar` runs the ten
  sources sequentially inside a single job (order: `populacao` first,
  `captacao_federal`/`emendas` last). A failing source is recorded in its own
  audit row and the sequence continues — the job only ends `erro` if every
  source fails. The final `resumo` becomes
  `{"fontes": [{key, status: ok|aviso|erro, linhas, ...}]}`, and per-source
  audits keep each card's "última execução" accurate.
- Job `status` values: `pendente` → `executando` → `concluido` | `erro` |
  `abortado`.

### Worker de ingestão separado (opcional, recomendado para fontes pesadas)

Por padrão (`INGESTAO_EXECUTOR=inline`) os jobs rodam em uma thread do próprio
processo da API. Com `INGESTAO_EXECUTOR=worker` na API, o `POST` apenas cria o
job `pendente` e um processo separado (`python -m app.worker`) reivindica o job
mais antigo (`FOR UPDATE SKIP LOCKED`) e executa — mesma semântica de
heartbeat, trava global e órfãos. No docker-compose o serviço `worker` já sobe
nesse modo. Não escalar o serviço worker para mais de 1 réplica — a trava de
1 job ativo por vez pressupõe exatamente 1 worker.

**Railway (passos manuais):**
1. Criar um serviço novo no mesmo repositório, root `backend/` (mesmo Dockerfile
   da API), com **Custom Start Command** `python -m app.worker`.
2. Copiar as variáveis de ambiente do serviço da API (banco etc.) para o worker.
3. Adicionar `INGESTAO_EXECUTOR=worker` **no serviço da API** e redeploy.

**Rollback:** remover `INGESTAO_EXECUTOR` da API (volta ao modo inline) e pausar
o serviço worker. Um job que ficar `pendente` indica worker parado — conferir
os logs do serviço. Não existe abortar manual, mas o sweep da API marca
`abortado` qualquer job ativo (`pendente` ou `executando`) sem atividade há
mais de 10 minutos, na próxima consulta às telas de coleta — isso cobre tanto
um worker que nunca chegou a reivindicar o job quanto uma queda no meio da
execução. Depois é só disparar de novo com o worker de pé.

### Dinheiro na Mesa & Radar de Emendas

**Dinheiro na Mesa** (`/app/dinheiro-na-mesa`) compares the município's federal
grant capture against its **peers** — municípios in the same FPM population band
and the same UF (national band average as secondary reference). The headline uses
the last complete calendar year; the current year appears in the series marked as
partial (`*`). The hero also shows how many peers have data, so coverage gaps are
visible instead of silently deflating the average. Capitals are out of scope
(FPM-Capitais regime).

**Radar de Emendas** (`/app/emendas`) shows who sends money (and who doesn't):
ranking by parliamentarian with execution bars (pago total = pago no exercício +
restos a pagar pagos), breakdown by função (saúde, urbanismo, …), the full
amendment list with a year filter, and a per-row CTA.

How the pieces connect:

- **Hybrid gating** — the `/resumo` endpoints are free (they power the two teaser
  cards on the Painel do Prefeito); the full pages require the `captacao_federal`
  and `emendas` modules in the município's plan (**Admin → Planos & Acessos**),
  enforced server-side (403 without the module).
- **CTA → funil de captação** — "Registrar no funil de captação" (page level on
  Dinheiro na Mesa, per-emenda on the Radar) creates a pre-filled
  `CaptacaoRecurso` in the *oportunidade* stage of the Desenv. Econômico kanban.
  Visible only to `ADMIN_MUNICIPIO` with the captação module in the plan.
- **Empty states** tell the admin exactly which fonte to run when data is missing
  (`sem_populacao` → População IBGE; `sem_dados` → Captação Federal for the whole UF).

---

## Railway Deployment

### Services to create

1. **PostgreSQL** — add via Railway database templates
2. **Backend** — GitHub repo, Root Directory: `backend/`
3. **Frontend** — GitHub repo, Root Directory: `frontend-observatorio/`

### Backend environment variables (Railway dashboard)

```
POSTGRES_HOST=${{Postgres.PGHOST}}
POSTGRES_PORT=${{Postgres.PGPORT}}
POSTGRES_DB=${{Postgres.PGDATABASE}}
POSTGRES_USER=${{Postgres.PGUSER}}
POSTGRES_PASSWORD=${{Postgres.PGPASSWORD}}
SECRET_KEY=your-secret-key
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=60
REFRESH_TOKEN_EXPIRE_DAYS=7
ENVIRONMENT=production
ANTHROPIC_API_KEY=sk-ant-...
```

### Frontend environment variables

```
VITE_API_BASE_URL=https://your-backend.up.railway.app/api/v1
```

The backend Dockerfile automatically runs `alembic upgrade head` before starting gunicorn, so migrations apply on every deploy.

---

## AI Insights

Each dashboard page has an **Insights IA** panel powered by Claude (`claude-haiku-4-5`).

- Click **"Gerar Insights com IA"** on any page to generate a 4-bullet analysis
- Insights are stored in the database per `(municipio, dataset, periodo)` — subsequent loads are instant
- Click **"Atualizar"** to regenerate with fresh data
- Requires `ANTHROPIC_API_KEY` set in the backend environment

---

## Timeline do Mandato

Administrators can register milestones for their municipality:

- **Início de Mandato** — term start dates
- **Obras** — public works and infrastructure projects
- **Política Pública** — policy launches
- **Evento** — other notable events

Milestones appear on the dedicated **Timeline** page (`/app/timeline`) accessible from the sidebar.

**Manage:** sidebar → Admin → Timeline do Mandato (available to `ADMIN_GLOBAL` and `ADMIN_MUNICIPIO`)

---

## Local Backend Development

```bash
# From project root
python -m venv venv
venv\Scripts\Activate.ps1   # Windows
# source venv/bin/activate  # Linux/Mac

pip install -r backend/requirements.txt

# Start only the database
docker compose up db -d

# Apply migrations
$env:PYTHONPATH = "$PWD\backend"
alembic -c backend\alembic.ini upgrade head

# Run the API
cd backend
uvicorn app.main:app --reload --port 8000
```

### Tests

A local pytest suite (pure logic, no DB) covers the sensitive pieces — MEI/Simples
parsing, `codigo_ibge` re-ingestion validation, and plan access control:

```bash
cd backend
python -m pytest
```

## Local Frontend Development

```bash
cd frontend-observatorio
npm install
npm run dev     # http://localhost:5173
```

Create `frontend-observatorio/.env.local`:

```env
VITE_API_BASE_URL=http://localhost:8000/api/v1
```

---

## Project Structure

```
dashboard_prefeituras/
├── .devcontainer/            # Dev container (Dockerfile + docker-compose + devcontainer.json)
├── .vscode/tasks.json        # Start servers, run migrations, run ingestion
├── backend/
│   ├── app/
│   │   ├── api/v1/routers/   # One router per dataset + auth, insights, marcos, projetos, dados_internos
│   │   ├── core/             # Config, security, logging
│   │   ├── db/               # Session, base, repositories
│   │   ├── models/           # SQLAlchemy models
│   │   ├── schemas/          # Pydantic v2
│   │   └── services/         # Auth, AI insights, municipio management, ingestao_automatica/ (fontes in-app)
│   ├── ingestao/             # CSV → DB loaders (packaged with backend; run via PYTHONPATH=backend)
│   ├── tests/                # Local pytest suite (parsing, IBGE validation, access control, fontes)
│   ├── alembic/versions/     # Migration chain 0001 → 0031
│   ├── docs/                 # Technical documentation
│   ├── Dockerfile
│   ├── pytest.ini
│   └── requirements.txt
├── frontend-observatorio/
│   └── src/
│       ├── app/              # Router, DashboardLayout, AdminLayout
│       ├── components/       # KpiCard, ChartInfoIcon, NotificationBell, PlanGate, …
│       ├── context/          # AuthContext, PlanContext, ToastContext
│       ├── hooks/            # useEscapeKey
│       ├── pages/            # One folder per feature
│       │   ├── admin/        # Admin pages (usuarios, municipios, projetos-eixos, …)
│       │   ├── dados-internos/  # Indicadores, Plano de Governo, Calendário
│       │   ├── projetos/     # Projetos page
│       │   ├── timeline/     # Timeline do Mandato page
│       │   └── …             # Dataset pages (caged, rais, pib, …)
│       └── services/         # Axios instance with JWT interceptors
├── dados/                    # Raw CSV files (not committed) — one folder per city
├── docker-compose.yml        # Production-like compose (gunicorn + nginx)
└── .env                      # Environment variables (never commit secrets)
```

For the full developer guide including troubleshooting, Alembic commands reference, Docker commands, and the dataset developer checklist, see [PROJECT_GUIDE.md](PROJECT_GUIDE.md).

---

## Requested Views — Data Availability

The table below maps each requested chart/view to its implementation status.

| View | Page | Status | Notes |
|------|------|--------|-------|
| Empresas Fechadas | Empresas | ✅ Implemented | `situacao != "02"` from `empresas` table |
| Saldo de Empresas | Empresas | ✅ Implemented | Ativas − Fechadas count |
| Empresas Fechadas por Porte | Empresas | ✅ Implemented | GROUP BY porte WHERE fechada |
| Saldo de Empresas por Porte | Empresas | ✅ Implemented | (ativas − fechadas) by porte |
| Empresas por Setor CNAE | Empresas | ✅ Implemented | CNAE division description mapping |
| Total Crédito e Captação por Instituição | Bancos (Estban) | ✅ Implemented | `estban_por_instituicao` table |
| Total Captação por Data e Tipo | Bancos (Estban) | ✅ Implemented | Deposits breakdown in `estban_mensal` |
| Total de Captação | Bancos (Estban) | ✅ Implemented | Sum vista+poupança+prazo over time |
| Soma de Empréstimos por Ano e Mês | Bancos (Estban) | ✅ Implemented | `valor_operacoes_credito` in `estban_mensal` |
| Total Operações de Crédito Por Banco | Bancos (Estban) | ✅ Implemented | `estban_por_instituicao` |
| Crédito Estratégico | Bancos (Estban) | ✅ Implemented | Credit KPIs + ratios from ESTBAN |
| Soma Arrecadado por Ano/Mês/Tipo Imposto | Arrecadação | ✅ Implemented | ICMS / IPVA / IPI breakdown in `arrecadacao_mensal` |
| Soma Arrecadado por Mês/Tipo Imposto | Arrecadação | ✅ Implemented | Same data, stacked by tax type |
| PIB Comparativo por Cidade | PIB | ✅ Implemented | `/pib/comparativo` endpoint (ADMIN_GLOBAL) |
| Total Agro/GOV/Indu/Serviços por Cidade | PIB | ✅ Implemented | VA components in `pib_anual` |
| Média Salarial por Gênero | RAIS | ✅ Implemented | `rais_por_sexo` table |
| Vínculos por Atividade e Descrição | RAIS | ✅ Implemented | `rais_por_cnae` table |
| Média Salarial / Vínculos por Atividade | RAIS | ✅ Implemented | `rais_por_cnae` table |
| Faixa Etária | RAIS | ✅ Implemented | `rais_por_faixa_etaria` (requires reingest) |
| Grau Escolaridade | RAIS | ✅ Implemented | `rais_por_escolaridade` (requires reingest) |
| Vínculos por Remuneração | RAIS | ✅ Implemented | `rais_por_faixa_remuneracao` (requires reingest) |
| Vínculos por Faixa Tempo Casa | RAIS | ✅ Implemented | `rais_por_faixa_tempo_emprego` (requires reingest) |
| Média Dias Afastamento por Atividade | RAIS | ✅ Implemented | `rais_metricas_anuais` (requires reingest) |
| PCD's | RAIS | ✅ Implemented | `rais_metricas_anuais.total_pcd` (requires reingest) |
| Trabalham em outro Município | RAIS | ✅ Implemented | `rais_metricas_anuais.total_outro_municipio` (requires reingest) |
| Valor/Qtd Pagador PF e PJ por ano | PIX | ✅ Implemented | `pix_mensal` table — populado via `carregar_tudo` (PIX incluído) |
| Valor Recebido por PJ por Ano e Mês | PIX | ✅ Implemented | `pix_mensal` table |
| Dinâmica do Comércio (PIX) | PIX | ✅ Implemented | Nova página com dados PIX |
| Total Exportados/Importados por Produto | Comex | ✅ Implemented | `comex_por_produto` table |
| Valor e Saldo Comercial por Mês/Tipo | Comex | ✅ Implemented | `comex_mensal` + computed saldo |
| Ticket Médio por Família | Bolsa Família | ✅ Implemented | `valor_total / total_beneficiarios` |
| Famílias com Pé-de-Meia | Bolsa Família | ✅ Implemented | Cross-reference com `pe_de_meia_resumo` |
| Total Pé-de-Meia por Ano e Mês | Pé-de-Meia | ✅ Implemented | Já existia na página |
| Calendário de Ações da Prefeitura | Dashboard | ✅ Implementado | `marcos_mandato` table (Timeline do Mandato) |
| ADM Pública e Saúde | RAIS | ✅ Implemented | CNAE sections O (Public Admin) + Q (Health) |
| Comércio Local | RAIS | ✅ Implemented | CNAE section G (Commerce) |
| **Café e Agricultura** | Comex | ⚠️ Parcial | Filtrar por produto no COMEX — requer limpeza dos códigos NCM |
| **Vínculos Ativos por Ocupação (CBO)** | RAIS | ⚠️ Reingest | Raw CSV has `cbo_2002` — run `carregar_rais.py` after migration 0010 |
| **Painel IPS** | IPS | ✅ Implementado | Página /app/ips com scorecard, ranking, comparativo e evolução |
| **Índice de Progresso Social** | IPS | ✅ Implementado | 79 métricas por município em `ips_municipio` |
| **Acesso à Cultura, Lazer e Esporte** | IPS | ✅ Implementado | Componente IPS — campo `acesso_cultura_lazer_esporte` |
| **Acesso a Direitos Humanos** | IPS | ✅ Implementado | Componente IPS — campo `acesso_prog_direitos_humanos` |
| **Acesso ao Conhecimento Básico** | IPS | ✅ Implementado | Componente IPS — campo `acesso_conhecimento_basico` |
| **Acesso à Informação e Comunicação** | IPS | ✅ Implementado | Componente IPS — campo `acesso_informacao_comunicacao` |
| **Acesso à Educação Superior** | IPS | ✅ Implementado | Componente IPS — campo `acesso_educacao_superior` |
| **Faixa Permanência Bolsa Família** | — | ❌ Sem dados | Campo não presente no CSV do MDS usado na ingestão |
| **Localização / Conexões Logísticas** | — | ❌ Sem dados | Requer dados geoespaciais (shapefiles, OpenStreetMap) não disponíveis |

### Notes on "requires reingest"

After running `alembic upgrade head` (migration `0010_rais_extra_pix`), re-run the
full loader for the affected cities (it runs every dataset, including the new RAIS
breakdowns and PIX):

```bash
PYTHONPATH=backend python -m ingestao.carregar_tudo --estado MG --cidades nova_lima --ibge 3136702
```

Or, for a single dataset, use **Painel Admin → Datasets → Reprocessar** (CSV upload).
PIX (like PIB, Estban, Comex, Bolsa Família and Pé-de-Meia) also has an
**automatic source** now — see [Fontes de Dados Automáticas](#fontes-de-dados-automáticas-ingestão-in-app) —
so the manual CSV path below is a fallback only.

---

## API Reference

Interactive docs at `/docs` (Swagger UI) when the API is running.

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/auth/login` | Login (OAuth2 form) |
| GET | `/api/v1/auth/me` | Current user |
| GET | `/api/v1/arrecadacao/serie` | Monthly revenue series |
| GET | `/api/v1/caged/serie` | CAGED monthly series |
| GET | `/api/v1/caged/por_sexo` | CAGED breakdown by gender |
| GET | `/api/v1/caged/por_raca` | CAGED breakdown by race |
| GET | `/api/v1/caged/salario` | CAGED average salaries |
| GET | `/api/v1/caged/por_cnae` | CAGED breakdown by CNAE section |
| GET | `/api/v1/vaf/serie` | VAF / IPM annual series |
| GET | `/api/v1/vaf/icms_projetado` | ICMS projected from the IPM trend |
| GET | `/api/v1/fpm/alerta` | FPM band alert (free on all plans) |
| GET | `/api/v1/fpm/serie` | FPM monthly/annual series + population |
| GET | `/api/v1/rais/serie` | RAIS annual series |
| GET | `/api/v1/bolsa_familia/serie` | Bolsa Família monthly series |
| GET | `/api/v1/estban/por_instituicao` | Bank stats per institution |
| GET | `/api/v1/comex/por_produto` | Trade by product |
| GET | `/api/v1/comex/por_pais` | Trade by country |
| GET | `/api/v1/insights` | Get stored AI insight |
| POST | `/api/v1/insights/gerar` | Generate AI insight via Claude |
| GET | `/api/v1/municipios/{id}/datasets-summary` | Per-dataset row counts (admin) |
| GET | `/api/v1/municipios/{id}/sanidade` | Data-sanity findings (admin) |
| POST | `/api/v1/municipios/{id}/datasets/{key}/reingest` | Re-ingest a dataset from uploaded CSV (admin) |
| DELETE | `/api/v1/municipios/{id}/datasets[/{key}]` | Wipe whole ingestion / one dataset (admin) |
| GET | `/api/v1/ingestao-automatica/fontes` | List automatic sources + last run + active job (admin) |
| POST | `/api/v1/ingestao-automatica/{key}/executar` | Start an automatic source as a background job (admin; body: `estado`, `municipio_ids`, `anos`, `notificar`) → 202 `{job_id}`; 409 if another job is active; `key="todas"` chains all ten sources sequentially in one job (captação expands to the full UF(s) of the selected municípios) |
| GET | `/api/v1/ingestao-automatica/jobs/{id}` | Poll job status/progress/resumo (admin) |
| GET | `/api/v1/ingestao-automatica/jobs` | List recent jobs, optionally filtered by `dataset` (admin) |
| GET | `/api/v1/marcos` | List mandate milestones |
| POST | `/api/v1/marcos` | Create milestone (admin) |
| PUT | `/api/v1/marcos/{id}` | Update milestone (admin) |
| DELETE | `/api/v1/marcos/{id}` | Delete milestone (admin) |
| GET | `/api/v1/ips/municipios` | City list with IPS data (filter by ano, estado) |
| GET | `/api/v1/ips/scorecard` | All 79 IPS metrics for a municipality/year |
| GET | `/api/v1/ips/evolucao` | Year-over-year IPS trend |
| GET | `/api/v1/ips/ranking` | National + state rank |
| GET | `/api/v1/ips/comparativo` | Side-by-side comparison of multiple cities |
| GET | `/api/v1/ips/destaques` | Top 3 best + 3 worst components vs national avg |
| GET | `/api/v1/ips/sugestoes` | Similar cities by GDP per capita |
| GET | `/api/v1/comparativo/arrecadacao` | Revenue ranking (ADMIN_GLOBAL) |
| GET | `/api/v1/captacao-federal/resumo` | Captação headline (free teaser for the Painel card) |
| GET | `/api/v1/captacao-federal/diagnostico` | Full peer-comparison diagnostic (gated: `captacao_federal` module) |
| GET | `/api/v1/captacao-federal/serie` | Annual series você vs. peers (gated: `captacao_federal` module) |
| GET | `/api/v1/emendas/resumo` | Amendments headline (free teaser for the Painel card) |
| GET | `/api/v1/emendas/radar?ano=` | Amendments radar by author/execution (gated: `emendas` module) |
