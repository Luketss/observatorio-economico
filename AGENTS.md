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
│       │   ├── ThemeContext.jsx
│       │   └── PlanContext.jsx          # modulos[] + canAccess(key) for plan gating
│       ├── components/
│       │   ├── KpiCard.jsx              # Shared KPI card — label/value/sub/icon/color/accent/delay/dataset/indicadorKey
│       │   ├── PlanGate.jsx             # Blur + padlock overlay for restricted content
│       │   ├── InfoTooltip.jsx          # Dataset-level tooltip (hover)
│       │   └── ...                      # InsightsPanel, ReleasesPanel, FilterBar, etc.
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
│       ├── api/v1/routers/         # One router per dataset + auth + insights + indicadores
│       ├── models/                 # SQLAlchemy models (incl. IndicadorInfo)
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

Three tiers: **free**, **pro**, **premium**. (Legacy `paid` was renamed to `pro` in migration `0012_rename_paid_to_pro_add_premium`.)

**Backend:** `PlanoConfig` model stores a `modulos: JSON` array per plan. ADMIN_GLOBAL manages this via `GET/PUT /plano-config?plano={tier}`.

**Module keys** follow a two-level convention:
- Page-level: `"pib"`, `"caged"`, `"rais"`, etc.
- Component-level (advanced charts): `"pib.por_setor"`, `"caged.por_sexo"`, `"rais.metricas"`, etc.

**Frontend flow:**
1. `DashboardLayout` fetches `municipio.plano` then `GET /plano-config?plano={tier}` on mount.
2. Result stored in `PlanContext` (`modulos` array + `canAccess(key)` function).
3. Nav items filtered by page-level module keys via `isVisible()`.
4. Individual chart sections wrapped in `<PlanGate planKey="...">` which renders blur + padlock overlay if `canAccess()` returns false.

**Admin page:** `PlanoConfigAdminPage.jsx` shows three columns (one per plan), each with two sections: "Módulos (Páginas)" and "Componentes Avançados". Toggles save immediately to `/plano-config/{tier}`.

**Municipality plan:** Cycled free → pro → premium → free in `MunicipiosAdminPage.jsx`.

---

# 10. KPI Indicator Descriptions

Each KPI card can display a short hover tooltip and a full modal description, editable by ADMIN_GLOBAL.

**Backend:** `IndicadorInfo` model (`indicadores_info` table) — upserted by `(dataset, indicador_key)`.
- `GET /indicadores?dataset={d}&indicador_key={k}` — returns empty strings if not configured (never 404)
- `PUT /indicadores/{dataset}/{indicador_key}` — ADMIN_GLOBAL only, upserts tooltip/descricao/fonte

**Frontend:** `KpiCard` component accepts optional `dataset` + `indicadorKey` props.
- Fetches on mount; shows teal `ⓘ` icon if content exists (grey for admin with no content yet)
- Hover → dark tooltip popover with short `tooltip` text
- Click → modal with full `descricao` and `fonte`
- ADMIN_GLOBAL: modal shows "Editar" button → inline edit form

**Key slugs by dataset:** (examples)
- `pib`: `ultimo_ano`, `crescimento`, `anos_serie`
- `caged`: `admissoes`, `desligamentos`, `saldo_liquido`
- `rais`: `total_vinculos`, `ultimo_ano`, `remuneracao_media`
- `estban`: `agencias`, `credito_total`, `depositos_total`
- See each page's `cards` array for the full list.

---

# 11. Adding a New Dataset

1. Create SQLAlchemy model in `backend/app/models/`
2. Register in `alembic/env.py` and generate migration
3. Create Pydantic schemas in `backend/app/schemas/`
4. Create router in `backend/app/api/v1/routers/` with `/serie` and `/resumo` endpoints
5. Add dataset key to `insights_service.py` (`_fetch_dados`, `_build_prompt`, `DATASET_LABELS`)
6. Create frontend page in `src/pages/{dataset}/`
   - Use shared `KpiCard` from `../../components/KpiCard` (add `dataset` + `indicadorKey` props to each card)
   - Wrap advanced chart sections with `<PlanGate planKey="{dataset}.{component}">` for paid-only content
7. Add route to `AppRouter.jsx` under `/app`
8. Add nav entry to `NAV_STRUCTURE` in `DashboardLayout.jsx` with the correct `modulo` key
9. Add to `DATASETS` array in `InsightsAdminPage.jsx` and `ReleasesAdminPage.jsx`
10. Add page-level key to `MODULOS` in `PlanoConfigAdminPage.jsx`
11. Add component-level keys (if any) to `COMPONENTES` in `PlanoConfigAdminPage.jsx`

---

# 12. Coding Standards

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

# 13. Safe Modification Rules

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

# 14. Deployment

- **Platform**: Railway
- **Backend**: Python + Uvicorn container
- **Frontend**: Static site (Vite build → `dist/`)
- **Database**: Railway PostgreSQL
- **Env vars**: `DATABASE_URL`, `SECRET_KEY`, `ANTHROPIC_API_KEY`, `VITE_API_URL`
- Migrations run via `alembic upgrade head` before backend starts

---

# 15. Product Backlog

See `IDEAS.md` for the full backlog. Key strategic items:
- **ISEM** — Composite municipal health score (top priority differentiator)
- **Monthly PDF report** — auto-emailed to municipality admin
- **Chat with data** — natural language Q&A over municipality datasets
- **Presentation mode** — full-screen slideshow for TVs / meetings
- **Mandate balance report** — delta from start of term to today

---

END OF AGENTS.md
