# PROJECT_GUIDE.md
Human Developer Guide — Observatório Econômico Municipal

---

# 1. Project Structure

```
dashboard_prefeituras/
├── backend/                  # FastAPI API
│   ├── app/
│   │   ├── api/v1/routers/   # Route handlers
│   │   ├── core/             # Config, security
│   │   ├── db/               # Session, base
│   │   ├── models/           # SQLAlchemy models
│   │   └── schemas/          # Pydantic schemas
│   ├── alembic/              # Migrations
│   ├── alembic.ini
│   ├── Dockerfile
│   └── requirements.txt
├── frontend-observatorio/    # React + Vite SPA (JSX)
│   ├── src/
│   │   ├── app/              # Router, layouts
│   │   ├── context/          # Auth context
│   │   ├── pages/            # Feature pages
│   │   └── services/         # Axios instance
│   ├── Dockerfile
│   └── package.json
├── ingestao/                 # CSV ingestion scripts
│   ├── carregar_tudo.py      # Runs all loaders
│   ├── carregar_arrecadacao.py
│   ├── carregar_pib.py
│   ├── carregar_caged.py
│   ├── carregar_rais.py
│   ├── carregar_bolsa_familia.py
│   ├── carregar_pe_de_meia.py
│   ├── carregar_inss.py
│   ├── carregar_estban.py
│   ├── carregar_comex.py
│   ├── carregar_cnpj.py
│   └── requirements.txt
├── dados/                    # Raw CSV files (not versioned)
│   ├── Arrecadacao_Cidades_MG/
│   ├── PIB_Cidades_Completo/
│   ├── Pacote_Trabalho_Multicidades/
│   │   ├── CAGED/
│   │   └── RAIS/
│   ├── Bolsa_Familia_Cidades_Completo/
│   ├── Pe_De_Meia_Cidades_Completo/
│   ├── INSS_Cidades_Completo/
│   ├── Estban_Cidades_Completo/
│   ├── Comex_Cidades_Completo/
│   └── Pacote_CNPJ_Completo_Corrigido/
├── docker-compose.yml
├── .env                      # Environment variables (Docker)
└── .env.local                # Local overrides (not committed)
```

---

# 2. Environment Variables

All services read from `.env` at the project root.
For local development without Docker, create `.env.local` at the root (it overrides `.env`).

```env
# Database
POSTGRES_DB=observatorio
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres
POSTGRES_HOST=localhost        # Use "db" inside Docker, "localhost" for local dev
POSTGRES_PORT=5432

# Auth
SECRET_KEY=your-secret-key-here
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=60
REFRESH_TOKEN_EXPIRE_DAYS=7

# App
ENVIRONMENT=development
```

> **Key rule:** `POSTGRES_HOST=db` when the API runs inside Docker.
> `POSTGRES_HOST=localhost` when running locally (ingestion scripts, local API dev).

---

# 3. Running with Docker (Recommended)

All three services — database, API, and frontend — are orchestrated via Docker Compose.

## Start everything

```bash
docker compose up
```

## Start in background (detached)

```bash
docker compose up -d
```

## Build images (first time or after code changes)

```bash
docker compose build
```

## Build without cache (when dependencies change)

```bash
docker compose build --no-cache
```

## Stop containers

```bash
docker compose down
```

## Stop and wipe the database volume (full reset)

```bash
docker compose down -v
```

## View live logs

```bash
docker compose logs -f
```

## View logs for a specific service

```bash
docker compose logs -f api
docker compose logs -f db
docker compose logs -f frontend
```

## Access URLs

| Service  | URL                        |
|----------|----------------------------|
| Frontend | http://localhost            |
| API      | http://localhost:8000       |
| API Docs | http://localhost:8000/docs  |
| Database | localhost:5432              |

---

# 4. Running the Backend Locally (Without Docker)

Use this when iterating on the API without rebuilding the container.

## 1. Create and activate the virtual environment

From the **project root**:

```bash
python -m venv venv
```

**Windows (PowerShell):**
```powershell
venv\Scripts\Activate.ps1
```

**Linux / Mac:**
```bash
source venv/bin/activate
```

## 2. Install backend dependencies

```bash
pip install -r backend/requirements.txt
```

## 3. Configure environment

Create `.env.local` at the project root with `POSTGRES_HOST=localhost` (see Section 2).

Start only the database container:

```bash
docker compose up db -d
```

## 4. Run Alembic migrations

```bash
cd backend
alembic upgrade head
cd ..
```

## 5. Start the API in dev mode

```bash
cd backend
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

API runs at `http://localhost:8000`
Interactive docs at `http://localhost:8000/docs`

---

# 5. Running the Frontend Locally (Without Docker)

```bash
cd frontend-observatorio
npm install
npm run dev
```

Frontend runs at `http://localhost:5173`

To point the frontend at the local API, create `frontend-observatorio/.env.local`:

```env
VITE_API_BASE_URL=http://localhost:8000/api/v1
```

---

# 6. Alembic Migrations

All migration commands run from inside the `backend/` directory.

```bash
cd backend
```

## Apply all pending migrations

```bash
alembic upgrade head
```

## Check current revision

```bash
alembic current
```

## View migration history

```bash
alembic history
```

## Generate a new migration (after editing models)

```bash
alembic revision --autogenerate -m "short description"
```

Review the generated file in `alembic/versions/` before applying.

## Roll back one step

```bash
alembic downgrade -1
```

## Roll back to empty database

```bash
alembic downgrade base
```

## Apply migrations inside the running Docker container

```bash
docker exec observatorio_api alembic upgrade head
```

## Copy new migration files into the running container then apply

```bash
docker cp backend/alembic/versions/0004_my_migration.py observatorio_api:/app/alembic/versions/
docker exec observatorio_api alembic upgrade head
```

---

# 7. Data Ingestion

Ingestion scripts load CSV files from the `dados/` folder into the database.
They must run from the **project root** using the venv.

## 1. Activate venv (if not already active)

**Windows:**
```powershell
venv\Scripts\Activate.ps1
```

**Linux / Mac:**
```bash
source venv/bin/activate
```

## 2. Install ingestion dependencies

```bash
pip install -r ingestao/requirements.txt
pip install -r backend/requirements.txt
```

Both are required: `ingestao/requirements.txt` provides DB drivers,
`backend/requirements.txt` provides the SQLAlchemy models.

## 3. Ensure the database is running and migrations are applied

```bash
# Start only the database container
docker compose up db -d

# Apply migrations (from project root with venv active)
cd backend && alembic upgrade head && cd ..
```

## 4. Run all loaders at once

```bash
python -m ingestao.carregar_tudo
```

## 5. Run individual loaders

```bash
python -m ingestao.carregar_arrecadacao
python -m ingestao.carregar_pib
python -m ingestao.carregar_caged
python -m ingestao.carregar_rais
python -m ingestao.carregar_bolsa_familia
python -m ingestao.carregar_pe_de_meia
python -m ingestao.carregar_inss
python -m ingestao.carregar_estban
python -m ingestao.carregar_comex
python -m ingestao.carregar_cnpj
```

## CSV file locations inside `dados/`

| Dataset         | Folder                                          |
|-----------------|-------------------------------------------------|
| Arrecadação     | `Arrecadacao_Cidades_MG/`                       |
| PIB             | `PIB_Cidades_Completo/`                         |
| CAGED           | `Pacote_Trabalho_Multicidades/CAGED/`           |
| RAIS            | `Pacote_Trabalho_Multicidades/RAIS/`            |
| Bolsa Família   | `Bolsa_Familia_Cidades_Completo/`               |
| Pé-de-Meia      | `Pe_De_Meia_Cidades_Completo/`                  |
| INSS            | `INSS_Cidades_Completo/`                        |
| Estban          | `Estban_Cidades_Completo/`                      |
| Comex           | `Comex_Cidades_Completo/`                       |
| CNPJ / Empresas | `Pacote_CNPJ_Completo_Corrigido/`               |

---

# 8. Complete First-Time Setup (Step by Step)

```bash
# 1. Enter the project root
cd dashboard_prefeituras

# 2. Create .env at the root (see Section 2 for values)
#    Set POSTGRES_HOST=localhost for local use

# 3. Create and activate the virtual environment
python -m venv venv
venv\Scripts\Activate.ps1          # Windows PowerShell
# source venv/bin/activate          # Linux / Mac

# 4. Install all Python dependencies
pip install -r backend/requirements.txt
pip install -r ingestao/requirements.txt

# 5. Start the database container
docker compose up db -d

# 6. Apply migrations
cd backend
alembic upgrade head
cd ..

# 7. Run data ingestion
python -m ingestao.carregar_tudo

# 8. Build and start all services
docker compose up --build
```

Access the app at **http://localhost**

---

# 9. Default Users (Seeded via Initial Migration)

| Role            | Email                             | Password  |
|-----------------|-----------------------------------|-----------|
| ADMIN_GLOBAL    | admin@observatorio.com            | admin123  |
| ADMIN_MUNICIPIO | admin.municipio@observatorio.com  | admin123  |

---

# 10. API Reference

Interactive Swagger UI: `http://localhost:8000/docs`

| Method | Endpoint                          | Auth         | Description                          |
|--------|-----------------------------------|--------------|--------------------------------------|
| POST   | /api/v1/auth/login                | Public       | Login (OAuth2 form-urlencoded)       |
| POST   | /api/v1/auth/refresh              | Public       | Refresh access token                 |
| GET    | /api/v1/auth/me                   | Bearer token | Current user info                    |
| GET    | /api/v1/arrecadacao/serie         | Bearer token | Monthly revenue series               |
| GET    | /api/v1/arrecadacao/resumo        | Bearer token | Revenue summary (totals, growth)     |
| GET    | /api/v1/pib/serie                 | Bearer token | Annual PIB series                    |
| GET    | /api/v1/pib/resumo                | Bearer token | PIB summary (latest year, growth)    |
| GET    | /api/v1/caged/serie               | Bearer token | CAGED monthly series                 |
| GET    | /api/v1/caged/resumo              | Bearer token | CAGED totals (admissões, saldo)      |
| GET    | /api/v1/rais/serie                | Bearer token | RAIS annual series by sector         |
| GET    | /api/v1/rais/resumo               | Bearer token | RAIS total vínculos                  |
| GET    | /api/v1/municipios/               | Bearer token | List municipalities                  |
| GET    | /api/v1/usuarios/                 | Bearer token | List users (scoped by role)          |
| POST   | /api/v1/usuarios/                 | ADMIN_GLOBAL | Create user                          |
| GET    | /api/v1/comparativo/arrecadacao   | ADMIN_GLOBAL | Revenue ranking across cities        |
| GET    | /api/v1/comparativo/caged         | ADMIN_GLOBAL | CAGED saldo ranking across cities    |
| GET    | /api/v1/comparativo/rais          | ADMIN_GLOBAL | RAIS vínculos ranking across cities  |

---

# 11. Useful Docker Commands

## Enter a running container

```bash
docker exec -it observatorio_api bash
docker exec -it observatorio_db bash
docker exec -it observatorio_front sh
```

## Run a command inside a container without entering

```bash
docker exec observatorio_api alembic current
docker exec observatorio_api alembic upgrade head
docker exec observatorio_db psql -U postgres -d observatorio -c "\dt"
```

## Copy a file into a running container

```bash
docker cp path/to/local/file observatorio_api:/app/destination/
```

## Inspect database tables

```bash
docker exec observatorio_db psql -U postgres -d observatorio -c "\dt"
```

## Check row counts per table

```bash
docker exec observatorio_db psql -U postgres -d observatorio -c "
  SELECT relname, n_live_tup
  FROM pg_stat_user_tables
  ORDER BY n_live_tup DESC;
"
```

---

# 12. Troubleshooting

### `ModuleNotFoundError: No module named 'app'`

Run ingestion scripts from the **project root** as a module, not as a script:

```bash
# Correct
python -m ingestao.carregar_tudo

# Wrong — do not do this
cd ingestao && python carregar_tudo.py
```

### `could not translate host name "db"`

You are running scripts outside Docker but `POSTGRES_HOST=db` in your env.
Create `.env.local` at the project root:

```env
POSTGRES_HOST=localhost
```

### `Table already defined for this MetaData instance`

Models are being double-imported under different paths.
Always run ingestion as `python -m ingestao.carregar_tudo` from the project root.

### `relation "table_name" does not exist`

Migrations have not been applied. Run:

```bash
# Via Docker container (if API is running)
docker exec observatorio_api alembic upgrade head

# Locally
cd backend && alembic upgrade head
```

### New migration file not picked up by Docker container

The image was built before the new migration existed.
Copy it in and apply without rebuilding:

```bash
docker cp backend/alembic/versions/XXXX_migration.py observatorio_api:/app/alembic/versions/
docker exec observatorio_api alembic upgrade head
```

### Port 8000 already in use (Windows)

```powershell
netstat -ano | findstr :8000
taskkill /PID <pid> /F
```

### Port 5432 already in use

A local PostgreSQL is running on the same port. Stop it or change the host port in `docker-compose.yml`:
```yaml
ports:
  - "5433:5432"   # map to 5433 externally
```
Then update `POSTGRES_PORT=5433` in `.env.local`.

---

# 13. Adding a New Dataset (Developer Checklist)

1. Create `backend/app/models/dataset.py` — SQLAlchemy model
2. Register the model import in `backend/alembic/env.py`
3. Generate migration: `cd backend && alembic revision --autogenerate -m "add dataset table"`
4. Create `backend/app/schemas/dataset.py` — Pydantic schemas
5. Create `backend/app/api/v1/routers/dataset.py` — `/serie` and `/resumo` endpoints with RBAC
6. Register the router in `backend/app/api/v1/__init__.py`
7. Create `ingestao/carregar_dataset.py` — reads CSVs from `dados/`
8. Add the loader to `ingestao/carregar_tudo.py`
9. Create `frontend-observatorio/src/pages/dataset/DatasetPage.jsx`
10. Register the route in `frontend-observatorio/src/app/router/AppRouter.jsx`
11. Add the nav item in `frontend-observatorio/src/app/layouts/DashboardLayout.jsx`

---

END OF PROJECT_GUIDE.md
