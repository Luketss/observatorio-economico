# Observatório Econômico Municipal

Multi-tenant economic dashboard SaaS for Brazilian municipalities. Centralizes and visualizes public economic data by city, with role-based access control and AI-generated insights.

---

## Features

### Datasets & Pages

| Page | Dataset | Source |
|------|---------|--------|
| Dashboard Geral | KPIs across all datasets | Aggregated |
| Arrecadação | Monthly tax revenue (ICMS, IPVA, IPI) | Secretaria da Fazenda MG |
| PIB | Annual GDP per municipality | IBGE |
| CAGED | Formal employment flows (admissions, dismissals, gender, race, salary, CNAE) | MTE |
| RAIS | Employment census (total, gender, race, CNAE, avg. wage) | MTE |
| Bolsa Família | Beneficiaries, total transferred, Primeira Infância | MDS |
| Pé-de-Meia | Students benefited, school stage breakdown | MEC |
| INSS | Social security benefits by category | INSS |
| Bancos (Estban) | Bank deposits, credit operations, savings per institution | BACEN |
| Comércio Exterior | Exports/imports by product and country | MDIC |
| Empresas | Active companies by size and CNAE sector | Receita Federal |
| Comparativo | Side-by-side ranking across municipalities | Aggregated |

### Core Features

- **Multi-tenant RBAC** — `ADMIN_GLOBAL` sees all municipalities; `ADMIN_MUNICIPIO` and `VISUALIZADOR` are scoped to their own city
- **AI Insights** — Claude-powered analysis per dataset, generated on demand and cached in the database
- **Timeline do Mandato** — Admins register milestones (term starts, public works, policies, events) shown as a scrollable timeline on the dashboard
- **JWT Authentication** — OAuth2 Password flow with access + refresh tokens
- **City filter on ingestion** — Choose which municipalities to load in `carregar_tudo.py`

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

## Quick Start (Docker)

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
| `0001_initial_schema_and_roles` | Users, roles, municipalities, seed data |
| `0002_caged_rais_tables` | CAGED and RAIS base tables |
| `0003_new_datasets` | Bolsa Família, Pé-de-Meia, INSS, Estban, Comex, Empresas |
| `0004_detail_tables` | Pé-de-Meia by stage, Estban by institution, Comex by product/country |
| `0005_caged_rais_detail_insights` | CAGED breakdown tables (sexo, raça, salário, CNAE), RAIS breakdowns, `insights_ia` table |
| `0006_marcos_mandato` | Timeline do Mandato milestones table |

---

## Data Ingestion

CSV files live in `dados/` (not versioned). Scripts run locally and connect directly to the database.

### Setup

```powershell
# From project root, with venv active
pip install -r backend/requirements.txt
pip install -r ingestao/requirements.txt
```

### Load data

Edit `ingestao/carregar_tudo.py` to select cities:

```python
# Load specific cities
CIDADES = ["Nova Serrana", "Claudio", "Para de Minas"]

# Load all available cities
CIDADES = []
```

Then run:

```bash
python -m ingestao.carregar_tudo
```

Or load a single dataset:

```bash
python -m ingestao.carregar_caged
python -m ingestao.carregar_rais
python -m ingestao.carregar_arrecadacao
# ... etc
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

Milestones appear as a scrollable horizontal timeline on the main Dashboard.

**Access:** sidebar → Admin → Timeline (available to `ADMIN_GLOBAL` and `ADMIN_MUNICIPIO`)

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
├── backend/
│   ├── app/
│   │   ├── api/v1/routers/   # One router per dataset + auth, insights, marcos
│   │   ├── core/             # Config, security, logging
│   │   ├── db/               # Session, base
│   │   ├── models/           # SQLAlchemy models
│   │   ├── schemas/          # Pydantic schemas
│   │   └── services/         # Auth service, AI insights service
│   ├── alembic/versions/     # Migration files (0001–0006)
│   ├── Dockerfile
│   └── requirements.txt
├── frontend-observatorio/
│   └── src/
│       ├── app/              # Router, DashboardLayout
│       ├── components/       # InsightsPanel, MandatoTimeline (reusable)
│       ├── context/          # AuthContext
│       ├── pages/            # One folder per feature
│       └── services/         # Axios instance
├── ingestao/                 # CSV → DB scripts
├── dados/                    # Raw CSV files (not committed)
├── IDEAS.md                  # Product improvement backlog
├── PROJECT_GUIDE.md          # Full developer reference
├── AGENTS.md                 # AI agent operational context
├── docker-compose.yml
└── .env
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
| Valor/Qtd Pagador PF e PJ por ano | PIX | ✅ Implemented | `pix_mensal` table — **requer `carregar_pix.py`** |
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
| **Painel IPS** | — | ❌ Sem dados | Índice de Progresso Social não disponível nas fontes atuais |
| **Índice de Progresso Social** | — | ❌ Sem dados | Requer dados do IPS Brasil (não disponível localmente) |
| **Acesso à Cultura, Lazer e Esporte** | — | ❌ Sem dados | Componente do IPS — sem fonte disponível |
| **Acesso a Direitos Humanos** | — | ❌ Sem dados | Componente do IPS — sem fonte disponível |
| **Acesso ao Conhecimento Básico** | — | ❌ Sem dados | Componente do IPS — sem fonte disponível |
| **Acesso à Informação e Comunicação** | — | ❌ Sem dados | Componente do IPS — sem fonte disponível |
| **Acesso à Educação Superior** | — | ❌ Sem dados | Componente do IPS — sem fonte disponível |
| **Faixa Permanência Bolsa Família** | — | ❌ Sem dados | Campo não presente no CSV do MDS usado na ingestão |
| **Localização / Conexões Logísticas** | — | ❌ Sem dados | Requer dados geoespaciais (shapefiles, OpenStreetMap) não disponíveis |

### Notes on "requires reingest"

After running `alembic upgrade head` (migration `0010_rais_extra_pix`), re-run:

```bash
python -m ingestao.carregar_rais   # populates new RAIS breakdown tables
python -m ingestao.carregar_pix    # loads dados/pix_*.csv files (one per city)
```

PIX data is currently available only for Nova Lima (`dados/pix_nova_lima.csv`). For other cities, obtain the file from BCB and name it `dados/pix_{cidade_normalizada}.csv`.

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
| GET | `/api/v1/rais/serie` | RAIS annual series |
| GET | `/api/v1/bolsa_familia/serie` | Bolsa Família monthly series |
| GET | `/api/v1/estban/por_instituicao` | Bank stats per institution |
| GET | `/api/v1/comex/por_produto` | Trade by product |
| GET | `/api/v1/comex/por_pais` | Trade by country |
| GET | `/api/v1/insights` | Get stored AI insight |
| POST | `/api/v1/insights/gerar` | Generate AI insight via Claude |
| GET | `/api/v1/marcos` | List mandate milestones |
| POST | `/api/v1/marcos` | Create milestone (admin) |
| PUT | `/api/v1/marcos/{id}` | Update milestone (admin) |
| DELETE | `/api/v1/marcos/{id}` | Delete milestone (admin) |
| GET | `/api/v1/comparativo/arrecadacao` | Revenue ranking (ADMIN_GLOBAL) |
