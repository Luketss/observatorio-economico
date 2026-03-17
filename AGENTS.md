# AGENTS.md  
AI Agent Operational Context — Observatório Econômico Municipal

---

# 1. Project Overview

## Objective

The Observatório Econômico Municipal is a multi-tenant SaaS platform designed to provide economic intelligence dashboards for Brazilian municipalities.

It centralizes, processes, and visualizes:

- Fiscal data (Arrecadação)
- Economic production (PIB)
- Labor market flows (CAGED)
- Employment stock (RAIS)
- Social indicators
- Comparative inter-municipality analytics

## Problem It Solves

Municipal governments often operate with fragmented economic data sources. This system:

- Consolidates heterogeneous datasets
- Applies consistent aggregation logic
- Enforces data isolation between municipalities
- Enables secure access via role-based access control (RBAC)
- Provides comparative analytics for regional decision-making

## Current Scope

Implemented modules:

- Authentication (JWT-based)
- Role-based access control
- Multi-tenant isolation
- Arrecadação
- PIB
- CAGED
- RAIS
- Comparative inter-municipal dashboard
- Administrative user management

## Target Audience

- Municipal administrators
- Public policy analysts
- Economic development teams
- State/regional analysts (ADMIN_GLOBAL)

---

# 2. System Architecture

## Architectural Style

Modular Monolith with Layered Architecture

The system is composed of:

Frontend (React + Vite)
↓
Backend API (FastAPI)
↓
Database (PostgreSQL)
↓
Data Ingestion Scripts
↓
Alembic (Schema versioning)

---

## Layer Responsibilities

### Frontend Layer
Location: `observatorio-economico/`

Responsibilities:
- Presentation layer
- Role-based UI restrictions
- API consumption
- Data visualization

Must NOT:
- Perform heavy business logic
- Perform cross-tenant filtering logic
- Calculate global aggregates

---

### API Layer
Location: `backend/app/api/v1/routers/`

Responsibilities:
- Endpoint definition
- RBAC enforcement
- Data aggregation
- Multi-tenant filtering

Must NOT:
- Contain raw SQL outside ORM
- Bypass RBAC validation

---

### Domain / Models
Location: `backend/app/models/`

Responsibilities:
- Data models (SQLAlchemy)
- Table definitions
- Relationships

Must NOT:
- Contain business logic
- Contain HTTP logic

---

### Schemas
Location: `backend/app/schemas/`

Responsibilities:
- Request/response contracts
- Validation layer

Must NOT:
- Access database
- Contain business rules

---

### Database Layer
- PostgreSQL
- Managed via Alembic migrations
- No `create_all` usage

All schema changes must go through migrations.

---

### Data Flow

1. CSV files → Ingestion Scripts
2. Ingestion Scripts → Database
3. Frontend → API (JWT)
4. API → Database (filtered by tenant)
5. Aggregated results → Frontend

---

# 3. Repository Structure

## Backend

```
backend/
  app/
    api/
    core/
    db/
    models/
    schemas/
  alembic/
```

### `/api`
HTTP routes. Each dataset has its own router.

### `/models`
SQLAlchemy models only.

### `/schemas`
Pydantic schemas only.

### `/core`
Configuration and security.

### `/db`
Session and base definitions.

### `/alembic`
Schema migrations.

---

## Frontend

```
observatorio-economico/
  src/
    pages/
    components/
    layouts/
    services/
    app/
```

### `/pages`
Feature entry points.

### `/components`
Reusable UI components.

### `/services`
API abstraction layer.

### `/layouts`
Structural UI composition.

### `/app/store`
Global state (auth, theme).

---

# 4. Coding Standards

## Backend

- Use SQLAlchemy ORM only.
- All DB changes require migration.
- All routes must validate RBAC.
- Use dependency injection for DB session.

Naming:

- Models: PascalCase
- Tables: snake_case
- Routes: lowercase paths
- Variables: snake_case

---

## Frontend

- Functional components only.
- Hooks for side effects.
- API calls centralized in `services/api.ts`.
- No direct fetch calls outside service layer.

Naming:

- Pages: PascalCase
- Components: PascalCase
- Hooks: useSomething

---

# 5. Feature Development Guide

## Adding a New Dataset

1. Create SQLAlchemy model.
2. Register in `alembic/env.py`.
3. Generate migration.
4. Create Pydantic schemas.
5. Create router with:
   - `/serie`
   - `/resumo`
6. Enforce RBAC.
7. Add ingestion script.
8. Add frontend page.
9. Register route.
10. Update documentation.

---

# 6. Architectural Decisions

- FastAPI chosen for async performance and type safety.
- PostgreSQL chosen for analytical workload.
- Alembic enforced to prevent schema drift.
- JWT for stateless authentication.
- Modular monolith to reduce operational complexity.

---

# 7. Dependency Management

Backend:
- FastAPI
- SQLAlchemy
- Pydantic
- Alembic

Frontend:
- React
- Recharts
- Lucide
- Zustand

New dependencies require:
- Justification
- Impact analysis
- Compatibility validation

---

# 8. Testing Strategy

Currently:
- Manual integration testing

Recommended:
- Pytest for backend
- React Testing Library for frontend
- Minimum 70% coverage for critical services

---

# 9. Refactoring Guidelines

Agents must:

- Preserve API contracts
- Maintain RBAC logic
- Maintain multi-tenant filters
- Create migrations before altering models

Never:
- Remove tenant filtering
- Remove role validation

---

# 10. Safe Modification Rules

Agents MAY:
- Add endpoints
- Add new datasets
- Refactor internals
- Improve queries

Agents MAY NOT:
- Modify API response shape without versioning
- Remove RBAC checks
- Alter DB schema without migration

---

# 11. Deployment Awareness

- Docker-based
- PostgreSQL container
- API container
- Frontend container
- Migrations run before deploy

---

# 12. Product Evolution Guidelines

Future direction:

- Regional benchmarking
- Predictive analytics
- Time-based filtering
- Export features
- Performance optimization via materialized views
- Multi-state support

Principle:
Keep core simple. Add features modularly.

---

END OF AGENTS.md
