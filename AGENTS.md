# AGENTS.md
AI Agent Operational Context — UAIZI NID (Núcleo de Inteligência de Dados)

---

# 1. Project Overview

## Product

**UAIZI NID** is a multi-tenant SaaS platform providing economic intelligence dashboards for Brazilian municipalities. It consolidates federal data sources, generates AI-powered insights, and produces press releases — all in one place for prefeituras.

## Entry Point

- `/` — Public landing page (Three.js animated scene, UAIZI branding)
- `/login` — Login form
- `/app` — Protected dashboard (requires auth)
- `/admin` — Admin panel (ADMIN_MUNICIPIO or ADMIN_GLOBAL)

## Active Datasets (12)

| Key | Source | Description |
|-----|--------|-------------|
| `geral` | Composite | Dashboard overview |
| `arrecadacao` | SEF/Receita | Monthly tax revenue (ICMS, IPVA, IPI) |
| `pib` | IBGE | Annual GDP by sector |
| `caged` | MTE | Monthly employment flows |
| `rais` | MTE | Annual employment census |
| `bolsa_familia` | MDS | Social benefit beneficiaries |
| `pe_de_meia` | MEC | Student stipend program |
| `inss` | INSS | Social security benefits |
| `estban` | BCB | Banking statistics (credit, deposits) |
| `comex` | MDIC | Exports and imports |
| `empresas` | CNPJ | Company registry snapshot |
| `pix` | BCB | Instant payment transactions |

## Target Users

- Mayors and secretaries (executive view, presentations)
- Municipal technical teams (deep data analysis)
- ADMIN_GLOBAL (platform management, all municipalities)

---

# 2. System Architecture

```
Landing Page (/)
    ↓
Login (/login) → JWT → /app (Dashboard)
                           ↓
                    DashboardLayout (sidebar)
                           ↓
               12 dataset pages + Comparativo + Releases
                           ↓
                    FastAPI backend
                           ↓
                    PostgreSQL (Railway)
                           ↓
               Python ingestion scripts (local → Railway DB)
```

---

# 3. Repository Structure

```
dashboard_prefeituras/
├── frontend-observatorio/          # React SPA
│   └── src/
│       ├── app/
│       │   ├── layouts/
│       │   │   ├── DashboardLayout.jsx   # Sidebar with group nav + mobile drawer
│       │   │   └── AdminLayout.jsx       # Admin sidebar + mobile drawer
│       │   └── router/
│       │       └── AppRouter.jsx         # All routes + auth guards
│       ├── context/
│       │   ├── AuthContext.jsx
│       │   └── ThemeContext.jsx
│       ├── pages/
│       │   ├── landing/LandingPage.jsx   # Three.js public landing
│       │   ├── login/LoginPage.jsx
│       │   ├── DashboardGeralPage.jsx
│       │   ├── arrecadacao/
│       │   ├── pib/
│       │   ├── caged/
│       │   ├── rais/
│       │   ├── beneficios/               # BolsaFamilia + PeDeMeia
│       │   ├── inss/
│       │   ├── estban/
│       │   ├── comex/
│       │   ├── empresas/
│       │   ├── pix/
│       │   ├── comparativo/
│       │   ├── releases/                 # Municipality press releases view
│       │   └── admin/                    # All admin pages
│       └── services/api.js
│
├── backend/                        # FastAPI API
│   └── app/
│       ├── api/v1/routers/         # One router per dataset + auth + insights
│       ├── models/                 # SQLAlchemy models
│       ├── schemas/                # Pydantic schemas
│       ├── services/
│       │   └── insights_service.py # Claude API integration
│       └── main.py
│
├── dados/                          # Ingestion scripts + raw CSVs
├── IDEAS.md                        # Product backlog
└── AGENTS.md                       # This file
```

---

# 4. Frontend Stack

| Technology | Version | Purpose |
|-----------|---------|---------|
| React | 19 | UI framework |
| Vite | latest | Build tool |
| React Router | v7 | Client-side routing |
| Tailwind CSS | v3 | Utility styling |
| Recharts | v3 | Data charts |
| Framer Motion | v12 | Animations |
| Three.js | latest | 3D landing page |
| @react-three/fiber | latest | React + Three.js |
| @react-three/drei | latest | Three.js helpers |
| Heroicons | v2 | Icons |
| Axios | v1 | HTTP client |

---

# 5. Backend Stack

| Technology | Purpose |
|-----------|---------|
| FastAPI | REST API |
| SQLAlchemy 2.0 | ORM |
| Alembic | Migrations |
| PostgreSQL | Database (Railway) |
| JWT | Auth (access + refresh) |
| Anthropic Claude | AI insight generation |
| Pydantic v2 | Schemas / validation |

---

# 6. RBAC

| Role | Scope | Admin panel | Insights | Releases |
|------|-------|-------------|----------|---------|
| `ADMIN_GLOBAL` | All municipalities | Full access | Generate + manage all | Manage all |
| `ADMIN_MUNICIPIO` | Own municipality | Mandato page | View only | View own |
| `VISUALIZADOR` | Own municipality | None | Read (if active) | Read (if active) |

Route guards in `AppRouter.jsx`:
- `ProtectedRoute` — requires any authenticated user → `/login`
- `AdminRoute` — requires `ADMIN_GLOBAL` → `/app`
- `AdminMunicipioRoute` — requires `ADMIN_MUNICIPIO` or `ADMIN_GLOBAL` → `/app`

---

# 7. AI Insights System

- **Model**: Claude (via `ANTHROPIC_API_KEY`)
- **Trigger**: On-demand via admin panel (`POST /insights/gerar`)
- **Storage**: `InsightIA` table — `municipio_id, dataset, periodo, conteudo (JSON), modelo, ativo`
- **`modelo` field**: `"claude-haiku-*"` for AI, `"especialista"` for human-authored
- **Release prefix**: Releases use `dataset = "release_{key}"` (e.g. `release_pib`)
- **Service**: `backend/app/services/insights_service.py`
- **Endpoints**:
  - `POST /insights/gerar` — generate AI insight
  - `POST /insights/gerar_release` — generate AI press release
  - `POST /insights/inserir_release` — insert manual specialist release
  - `GET /insights/admin_releases` — list all releases for a municipality
  - `PATCH /insights/{id}` — toggle active / update
  - `DELETE /insights/{id}` — delete

---

# 8. Sidebar Navigation

`DashboardLayout.jsx` uses a two-level grouped structure:

| Group | Items |
|-------|-------|
| (standalone) | Dashboard |
| Economia | PIB, Arrecadação, Comparativo |
| Emprego | CAGED, RAIS |
| Social | Bolsa Família, Pé-de-Meia, INSS |
| Comércio | Bancos, Comércio Ext., Empresas, PIX |
| (standalone) | Releases |

On `< md` breakpoint: sidebar is a fixed overlay drawer triggered by hamburger. On `md+`: always visible.

---

# 9. Plan Gating (Subscription Tiers)

`PlanoConfig` model stores which modules are active per plan (`free`, `paid`, `premium`). The `DashboardLayout` fetches the plan config on mount and filters the nav items. Dataset pages also respect this gating.

---

# 10. Adding a New Dataset

1. Create SQLAlchemy model in `backend/app/models/`
2. Register in `alembic/env.py` and generate migration
3. Create Pydantic schemas in `backend/app/schemas/`
4. Create router in `backend/app/api/v1/routers/` with `/serie` and `/resumo` endpoints
5. Add dataset key to `insights_service.py` (`_fetch_dados`, `_build_prompt`, `DATASET_LABELS`)
6. Create frontend page in `src/pages/{dataset}/`
7. Add route to `AppRouter.jsx` under `/app`
8. Add nav entry to `NAV_STRUCTURE` in `DashboardLayout.jsx`
9. Add to `DATASETS` array in `InsightsAdminPage.jsx` and `ReleasesAdminPage.jsx`
10. Add to `PlanoConfig` module list if plan-gated

---

# 11. Coding Standards

## Backend

- SQLAlchemy ORM only — no raw SQL
- All DB schema changes require Alembic migration
- All routes enforce RBAC via `Depends(require_role(...))`
- Multi-tenant filtering: always filter by `municipio_id`
- Python string quotes: ASCII straight quotes only (no Unicode curly quotes)

## Frontend

- Functional components + hooks only
- All API calls via `src/services/api.js` (Axios instance)
- Tailwind classes for all styling
- Responsive: use `md:` breakpoints; chart heights must use `h-XX md:h-XX` pattern
- No fixed sidebar widths without mobile fallback

---

# 12. Safe Modification Rules

Agents MAY:
- Add endpoints, datasets, pages
- Refactor internals without changing API shape
- Add UI features

Agents MAY NOT:
- Remove RBAC checks
- Alter DB schema without migration
- Change API response shapes without versioning
- Use Unicode curly quotes in Python files (breaks parsing)

---

# 13. Deployment

- **Platform**: Railway
- **Backend**: Python + Uvicorn container
- **Frontend**: Static site (Vite build → `dist/`)
- **Database**: Railway PostgreSQL
- **Env vars**: `DATABASE_URL`, `SECRET_KEY`, `ANTHROPIC_API_KEY`, `VITE_API_URL`
- Migrations run via `alembic upgrade head` before backend starts

---

# 14. Product Backlog

See `IDEAS.md` for the full backlog. Key strategic items:
- **ISEM** — Composite municipal health score (top priority differentiator)
- **Monthly PDF report** — auto-emailed to municipality admin
- **Chat with data** — natural language Q&A over municipality datasets
- **Presentation mode** — full-screen slideshow for TVs / meetings
- **Mandate balance report** — delta from start of term to today

---

END OF AGENTS.md
