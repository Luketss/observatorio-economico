# UAIZI NID — Frontend

**Núcleo de Inteligência de Dados** — Observatório Econômico Municipal

React SPA that provides economic intelligence dashboards for Brazilian municipalities.

---

## Stack

| Layer | Technology |
|-------|-----------|
| Framework | React 19 + Vite |
| Routing | React Router v7 |
| Styling | Tailwind CSS v3 |
| Charts | Recharts |
| Animations | Framer Motion |
| 3D / Landing | Three.js + @react-three/fiber + @react-three/drei |
| Icons | Heroicons v2 |
| HTTP | Axios |

---

## Project Structure

```
src/
├── app/
│   ├── layouts/
│   │   ├── DashboardLayout.jsx   # Main sidebar layout (collapsible on mobile)
│   │   └── AdminLayout.jsx       # Admin panel layout (collapsible on mobile)
│   └── router/
│       └── AppRouter.jsx         # Route definitions + auth guards
├── context/
│   ├── AuthContext.jsx           # JWT auth state
│   └── ThemeContext.jsx          # Dark/light theme
├── pages/
│   ├── landing/                  # Public landing page (Three.js)
│   ├── login/                    # Login form
│   ├── DashboardGeralPage.jsx    # Overview dashboard
│   ├── arrecadacao/
│   ├── pib/
│   ├── caged/
│   ├── rais/
│   ├── beneficios/               # Bolsa Família + Pé-de-Meia
│   ├── inss/
│   ├── estban/
│   ├── comex/
│   ├── empresas/
│   ├── pix/
│   ├── comparativo/
│   ├── releases/                 # Published press releases (municipality view)
│   └── admin/                    # Admin-only pages
└── services/
    └── api.js                    # Axios instance with base URL + auth header
```

---

## Routes

| Path | Access | Description |
|------|--------|-------------|
| `/` | Public | UAIZI landing page (Three.js) |
| `/login` | Public | Login form |
| `/app` | Auth | Dashboard overview |
| `/app/pib` | Auth | PIB page |
| `/app/arrecadacao` | Auth | Tax revenue page |
| `/app/caged` | Auth | CAGED employment page |
| `/app/rais` | Auth | RAIS employment census |
| `/app/bolsa-familia` | Auth | Bolsa Família |
| `/app/pe-de-meia` | Auth | Pé-de-Meia |
| `/app/inss` | Auth | INSS benefits |
| `/app/estban` | Auth | Banking (Estban) |
| `/app/comex` | Auth | Foreign trade |
| `/app/empresas` | Auth | Company registry |
| `/app/pix` | Auth | PIX transactions |
| `/app/comparativo` | Auth | Cross-municipality ranking |
| `/app/releases` | Auth | Press releases (VISUALIZADOR/ADMIN_MUNICIPIO) |
| `/admin/*` | ADMIN_MUNICIPIO+ | Admin panel |

---

## Roles

| Role | Access |
|------|--------|
| `ADMIN_GLOBAL` | All pages + all municipalities |
| `ADMIN_MUNICIPIO` | Dashboard + admin panel (own municipality) |
| `VISUALIZADOR` | Dashboard only (own municipality) |

---

## Key Features

- **Grouped sidebar navigation** — collapsible groups (Economia, Emprego, Social, Comércio) with mobile hamburger drawer
- **AI Insights** — Claude-generated bullet-point analysis per dataset, cached in backend
- **Press Releases** — AI-generated or specialist-written releases per dataset/municipality
- **Custom KPI cards** — configurable per municipality by admin
- **Plan gating** — modules visible/hidden per subscription tier (`PlanoConfig`)
- **Mandate timeline** — political milestones overlaid on time-series charts
- **Fully responsive** — mobile-first sidebar drawer, responsive chart heights, responsive grids

---

## Development

```bash
npm install
npm run dev
```

Requires a `.env.local` with:

```
VITE_API_URL=http://localhost:8000
```

---

## Build

```bash
npm run build
```

Output in `dist/`. Deployed via Railway static site.
