# PROJECT_GUIDE.md  
Human Developer Guide — Observatório Econômico Municipal

---

# 1. Project Introduction

## Overview

The Observatório Econômico Municipal is a multi-tenant economic intelligence platform built to support municipal decision-making.

It consolidates fiscal, labor, and economic datasets into interactive dashboards with strict data isolation and role-based access control.

---

# 2. Product Vision

The system aims to become:

- A municipal economic intelligence hub  
- A benchmarking platform across regions  
- A decision-support system for public policy  

Future roadmap:

- Global time filters  
- Export (CSV / PDF)  
- Predictive analytics  
- Regional clustering  
- Performance optimization  
- Multi-state deployment  

---

# 3. Technology Stack

## Backend

- Python 3.11+
- FastAPI
- SQLAlchemy 2.0
- PostgreSQL
- Alembic (migrations)
- Passlib (bcrypt)
- python-jose (JWT)
- Gunicorn + Uvicorn worker

## Frontend

- React (Vite)
- TypeScript
- Zustand
- Recharts
- TailwindCSS

## Infrastructure

- Docker
- Docker Compose
- PostgreSQL container
- Nginx (frontend serving)

---

# 4. System Architecture

Frontend → FastAPI → PostgreSQL

- Multi-tenant enforced at API layer
- RBAC enforced via dependency injection
- Database managed strictly via Alembic
- No `create_all` in runtime

---

# 5. Running the Project

---

# ✅ Option 1 — Run With Docker (Recommended)

## Build Containers

```bash
docker compose build
```

## Start Environment

```bash
docker compose up
```

## Stop Environment

```bash
docker compose down
```

## Stop and Remove Database Volume (RESET DB)

```bash
docker compose down -v
```

---

# ✅ Force Clean Rebuild (When Imports Break)

```bash
docker compose down -v
docker compose build --no-cache
docker compose up
```

---

# 6. Running Backend Without Docker (Local Dev)

## 1. Create Virtual Environment

```bash
cd backend
python -m venv venv
```

### Windows
```bash
venv\Scripts\activate
```

### Linux / Mac
```bash
source venv/bin/activate
```

---

## 2. Install Dependencies

```bash
pip install -r requirements.txt
```

---

## 3. Configure Environment Variables

Create `.env` inside `/backend`:

```
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/observatorio
SECRET_KEY=supersecret
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=60
```

---

## 4. Run PostgreSQL Locally

If not using Docker DB:

```bash
createdb observatorio
```

Or via Docker only for DB:

```bash
docker run --name observatorio_db -e POSTGRES_PASSWORD=postgres -p 5432:5432 -d postgres:16
```

---

## 5. Run Alembic Migrations

Inside `/backend`:

```bash
alembic upgrade head
```

---

## 6. Start API (Dev Mode)

```bash
uvicorn app.main:app --reload
```

API will run at:

```
http://localhost:8000
```

---

# 7. Running Frontend Without Docker

```bash
cd observatorio-economico
npm install
npm run dev
```

Frontend runs at:

```
http://localhost:5173
```

---

# 8. Alembic Commands

## Generate New Migration

```bash
alembic revision --autogenerate -m "description"
```

## Apply Migration

```bash
alembic upgrade head
```

## Downgrade One Step

```bash
alembic downgrade -1
```

## Downgrade to Base

```bash
alembic downgrade base
```

## Show Current Revision

```bash
alembic current
```

## Show Migration History

```bash
alembic history
```

---

# 9. Database Reset (Development)

If using Docker:

```bash
docker compose down -v
docker compose up
```

If local:

```bash
dropdb observatorio
createdb observatorio
alembic upgrade head
```

---

# 10. Default Users (Seeded via Alembic)

After fresh migration:

### ADMIN_GLOBAL
Email: `admin@observatorio.com`  
Password: `admin123`

### ADMIN_MUNICIPIO
Email: `admin.municipio@observatorio.com`  
Password: `admin123`

---

# 11. Health Check

```
GET /health
```

Returns:

```json
{
  "status": "ok"
}
```

---

# 12. Running Production API (Manual)

```bash
gunicorn app.main:app -k uvicorn.workers.UvicornWorker -w 4 -b 0.0.0.0:8000
```

---

# 13. Debugging Commands

## Enter API Container

```bash
docker compose exec api bash
```

## Inspect Routers Inside Container

```bash
ls app/api/v1/routers
```

## Check Installed Packages

```bash
pip list
```

---

# 14. Common Issues

### ImportError
Fix:

```bash
docker compose build --no-cache
```

### Migration not running
Check:

```bash
alembic current
```

### Port already in use

```bash
netstat -ano | findstr :8000
```

---

# 15. Maintenance

- Backup DB regularly
- Monitor slow queries
- Rotate SECRET_KEY in production
- Never modify DB schema without Alembic

---

# 16. Recommended Dev Workflow

1. Create feature branch  
2. Modify models  
3. Generate migration  
4. Test locally  
5. Update documentation  
6. Open PR  

---

# 17. Production Deployment Flow

1. Build image  
2. Run migrations  
3. Start containers  
4. Health check  
5. Enable reverse proxy  

---

END OF PROJECT_GUIDE.md
