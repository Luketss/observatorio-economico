# Arquitetura

## Estrutura de pastas

```
backend/
├── app/
│   ├── api/
│   │   ├── deps.py           # get_db, get_current_user, require_role
│   │   ├── error_handlers.py # handlers globais de exceção
│   │   ├── middleware.py     # AuditMiddleware (correlation ID + logging)
│   │   └── v1/routers/       # um arquivo por dataset
│   ├── core/
│   │   ├── config.py         # Settings (pydantic-settings, lê .env)
│   │   ├── logging.py        # setup_logging()
│   │   └── security.py       # JWT encode/decode, hash de senha
│   ├── db/
│   │   ├── base.py           # Base declarativa SQLAlchemy
│   │   └── session.py        # engine + SessionLocal
│   ├── models/               # SQLAlchemy ORM models
│   ├── schemas/              # Pydantic schemas (request/response)
│   └── main.py               # app FastAPI + registro de routers
├── alembic/
│   └── versions/             # migrações sequenciais (0001 → 0016+)
└── ingestao/                 # scripts CLI de ingestão de CSV
```

---

## Padrão dos routers

Os routers são "thin controllers" com queries SQLAlchemy diretas — sem camadas de service ou repository separadas. Isso foi uma decisão deliberada para manter o código simples dado o volume atual.

```python
@router.get("/serie", response_model=List[ItemSchema])
def serie(
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user),
):
    query = db.query(Model)
    if current_user.role.nome != "ADMIN_GLOBAL":
        query = query.filter(Model.municipio_id == current_user.municipio_id)
    return query.order_by(Model.ano, Model.mes).all()
```

---

## Filtro por município

Todos os endpoints de dados usam o helper `_municipio_filter()` ou equivalente inline:

```python
if current_user.role.nome != "ADMIN_GLOBAL":
    query = query.filter(Model.municipio_id == current_user.municipio_id)
```

`ADMIN_GLOBAL` recebe dados de todos os municípios sem filtro.

---

## Middleware de auditoria

`AuditMiddleware` injeta um `X-Correlation-ID` (UUID) em cada request e loga método, path, status e duração. Útil para rastrear erros em produção.

---

## Migrações (Alembic)

Cadeia atual: `0001_initial` → `0002` → ... → `0016_drop_rais_setor`

Para aplicar:
```bash
cd backend
alembic upgrade head
```

Para criar nova migração:
```bash
alembic revision --autogenerate -m "descricao_curta"
```

IDs de revisão devem ter ≤ 32 caracteres.

---

## CORS

Configurado via variável de ambiente `CORS_ORIGINS` (lista separada por vírgula):

```
CORS_ORIGINS=http://localhost:5173,https://meudominio.com
```

Não use `*` com `allow_credentials=True` — o browser rejeita.

---

## Relacionamentos principais

```
Municipio (1) ──< (n) ArrecadacaoMensal
Municipio (1) ──< (n) PibAnual
Municipio (1) ──< (n) CagedMovimentacao
Municipio (1) ──< (n) CagedPorSexo / CagedPorRaca / CagedPorCnae / CagedSalario
Municipio (1) ──< (n) RaisVinculo / RaisPorSexo / ...8 tabelas RAIS...
Municipio (1) ──< (n) BolsaFamiliaResumo
Municipio (1) ──< (n) PeDeMeiaResumo / PeDeMeiaEtapa
Municipio (1) ──< (n) InssAnual
Municipio (1) ──< (n) EstbanMensal / EstbanPorInstituicao
Municipio (1) ──< (n) ComexMensal / ComexPorProduto / ComexPorPais
Municipio (1) ──< (n) Empresa
Municipio (1) ──< (n) PixMensal
Usuario (n) >── (1) Municipio
PlanoConfig (per plano)
Notificacao / NotificacaoLida
IndicadorInfo (dataset + indicador_key)
```
