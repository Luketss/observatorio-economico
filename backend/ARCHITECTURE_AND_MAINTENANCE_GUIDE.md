# Backend — Architecture & Maintenance Guide
Observatório Econômico API

---

## Visão Geral

Plataforma SaaS de inteligência econômica municipal com suporte multi-estado. O backend é uma API REST construída com FastAPI + SQLAlchemy + PostgreSQL, servindo dados de 11 fontes diferentes com controle de acesso por role e plano.

**Stack:**
- FastAPI (framework HTTP)
- SQLAlchemy síncrono (ORM)
- Alembic (migrações de banco)
- Pydantic v2 (validação + serialização)
- JWT (access + refresh token)
- PostgreSQL

---

## Estrutura de Pastas

```
backend/
├── app/
│   ├── api/
│   │   ├── deps.py                 # get_db, get_current_user, require_role
│   │   ├── error_handlers.py       # handlers globais de exceção
│   │   ├── middleware.py           # AuditMiddleware (correlation ID)
│   │   └── v1/routers/             # um arquivo por dataset/funcionalidade
│   ├── core/
│   │   ├── config.py               # Settings (lê .env via pydantic-settings)
│   │   ├── logging.py              # setup_logging()
│   │   └── security.py             # JWT, bcrypt
│   ├── db/
│   │   ├── base.py                 # Base declarativa SQLAlchemy
│   │   └── session.py              # engine + SessionLocal
│   ├── models/                     # ORM models (um por domínio)
│   ├── schemas/                    # Pydantic schemas (request/response)
│   └── main.py                     # bootstrap: app + routers + middleware
├── alembic/
│   └── versions/                   # 0001 → 0016+ (cadeia sequencial)
└── ingestao/                       # scripts CLI de ingestão CSV
```

---

## Padrão dos Routers

Thin controllers com queries SQLAlchemy diretas. Sem camada de service ou repository separados.

```python
@router.get("/serie", response_model=List[ItemSchema])
def serie(db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    query = db.query(Model)
    if current_user.role.nome != "ADMIN_GLOBAL":
        query = query.filter(Model.municipio_id == current_user.municipio_id)
    return query.order_by(Model.ano, Model.mes).all()
```

---

## Controle de Acesso

**Roles:**
| Role | Acesso |
|------|--------|
| `ADMIN_GLOBAL` | Todos os dados, todos os municípios, painel admin |
| `ADMIN_MUNICIPIO` | Dados do próprio município + usuários locais |
| `VISUALIZADOR` | Somente leitura do próprio município |

**Planos:** `free` / `pro` / `premium` — configurados em `PlanoConfig`, aplicados no frontend via `PlanContext` + `PlanGate`.

---

## Datasets

| Dataset | Tabelas principais | Endpoints |
|---------|-------------------|-----------|
| Arrecadação | `arrecadacao_mensal` | `/arrecadacao` |
| PIB | `pib_anuais` | `/pib` |
| CAGED | 5 tabelas | `/caged` |
| RAIS | 9 tabelas | `/rais` |
| Bolsa Família | `bolsa_familia_resumos` | `/bolsa_familia` |
| Pé-de-Meia | 2 tabelas | `/pe_de_meia` |
| INSS | `inss_anuais` | `/inss` |
| ESTBAN | 2 tabelas | `/estban` |
| Comex | 3 tabelas | `/comex` |
| Empresas | `empresas` | `/empresas` |
| PIX | `pix_mensais` | `/pix` |
| IPS | `ips_municipio` | `/ips` |

Todos têm endpoint `/comparativo` que aceita `?estado=MG` para filtro por UF.

IPS não filtra por `municipio_id` — todos os usuários autenticados têm acesso a todos os municípios (dados de benchmarking público).

---

## Multi-Estado

O campo `estado` (UF) é armazenado em `Municipio`. Municípios são deduplicados por código IBGE (primary key) ou `(nome, estado)` como fallback.

Ingestão:
```bash
python -m ingestao.carregar_tudo --estado MG
python -m ingestao.carregar_tudo --estado MT --cidades Cuiaba

# IPS (arquivo nacional — não entra no carregar_tudo)
python -m ingestao.carregar_ips --ano 2024 2025
python -m ingestao.carregar_ips --ano 2024 --estado MG   # filter by state
```

---

## Migrações

Cadeia: `0001_initial` → ... → `0016_drop_rais_setor`

```bash
alembic upgrade head          # aplicar tudo
alembic current               # ver versão atual
alembic revision --autogenerate -m "descricao"  # nova migração
```

IDs: formato `NNNN_descricao`, máximo 32 chars.

---

## Variáveis de Ambiente

```
DATABASE_URL=postgresql://user:pass@host/db
SECRET_KEY=chave-secreta-forte
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30
REFRESH_TOKEN_EXPIRE_DAYS=7
CORS_ORIGINS=http://localhost:5173,https://meudominio.com
```

> **CORS:** Nunca use `*` com `allow_credentials=True`. Use origens explícitas.

---

## Executar Localmente

```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload
# Acesse: http://localhost:8000/docs
```

---

## Checklist de Produção

- [ ] `SECRET_KEY` forte e única
- [ ] `CORS_ORIGINS` com domínios reais
- [ ] `DATABASE_URL` de produção
- [ ] `alembic upgrade head` executado
- [ ] HTTPS ativo (Nginx + Let's Encrypt)
- [ ] Logs em nível `INFO`
- [ ] Backup automático do banco configurado

---

## Como Adicionar Nova Feature

1. Criar `app/models/{dataset}.py`
2. Criar `app/schemas/{dataset}.py`
3. Criar `app/api/v1/routers/{dataset}.py`
4. Registrar em `main.py`
5. `alembic revision --autogenerate -m "add_{dataset}"` → revisar → `alembic upgrade head`
6. Criar `ingestao/carregar_{dataset}.py` com padrão `obter_ou_criar_municipio(db, nome, estado)` + `carregar_csv(db, caminho, estado)`
7. Adicionar ao `LOADERS` em `ingestao/carregar_tudo.py`
