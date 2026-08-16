import logging
from contextlib import asynccontextmanager

import app.api.v1.routers.ips as ips
import app.api.v1.routers.projetos as projetos
import app.api.v1.routers.desenvolvimento_economico as desenvolvimento_economico
import app.api.v1.routers.dados_internos as dados_internos
import app.api.v1.routers.arrecadacao as arrecadacao
import app.api.v1.routers.insights as insights
import app.api.v1.routers.marcos as marcos
import app.api.v1.routers.custom_cards as custom_cards
import app.api.v1.routers.plano_config as plano_config
import app.api.v1.routers.dataset_info as dataset_info
import app.api.v1.routers.admin_explorer as admin_explorer
import app.api.v1.routers.indicadores as indicadores
import app.api.v1.routers.notificacoes as notificacoes
import app.api.v1.routers.login_audit as login_audit
import app.api.v1.routers.auth as auth
import app.api.v1.routers.bolsa_familia as bolsa_familia
import app.api.v1.routers.caged as caged
import app.api.v1.routers.comex as comex
import app.api.v1.routers.comparativo as comparativo
import app.api.v1.routers.empresas as empresas
import app.api.v1.routers.fpm as fpm
import app.api.v1.routers.ingestao_automatica as ingestao_automatica
import app.api.v1.routers.captacao_federal as captacao_federal
import app.api.v1.routers.emendas as emendas
import app.api.v1.routers.estban as estban
import app.api.v1.routers.inss as inss
import app.api.v1.routers.municipios as municipios
import app.api.v1.routers.pe_de_meia as pe_de_meia
import app.api.v1.routers.pib as pib
import app.api.v1.routers.pix as pix
import app.api.v1.routers.rais as rais
import app.api.v1.routers.roles as roles
import app.api.v1.routers.vaf as vaf
import app.api.v1.routers.usuarios as usuarios
from app.api.error_handlers import register_exception_handlers
from app.api.middleware import AuditMiddleware
from app.core.config import settings
from app.core.logging import setup_logging
from app.core.rate_limit import limiter
from app.db.base import Base
from app.db.session import engine
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

# Setup logging
setup_logging()

_logger = logging.getLogger("app.main")


@asynccontextmanager
async def lifespan(_app):
    # Purga de retenção da auditoria (docs/lgpd.md). Railway redeploya a cada
    # push, então "no startup" honra os prazos na prática. Nunca derruba o boot.
    try:
        from app.db.session import SessionLocal
        from app.services.audit_service import purgar_auditoria

        db = SessionLocal()
        try:
            purgar_auditoria(db)
        finally:
            db.close()
    except Exception:
        _logger.exception("Purga de auditoria indisponível no startup")
    yield


# In production, hide the interactive docs and the OpenAPI schema so the
# full API surface (routes, table names) isn't publicly enumerable.
_docs_kwargs = (
    {"docs_url": None, "redoc_url": None, "openapi_url": None}
    if settings.ENVIRONMENT == "production"
    else {}
)

app = FastAPI(
    title="Observatório Econômico API", version="1.0.0",
    lifespan=lifespan, **_docs_kwargs,
)

# Rate limiting (slowapi) — see app/core/rate_limit.py
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# Register global exception handlers
register_exception_handlers(app)

_origins = [o.strip() for o in settings.CORS_ORIGINS.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Audit middleware (request logging + correlation ID)
app.add_middleware(AuditMiddleware)

# ⚠️ Banco agora é controlado via Alembic
# Não utilizamos mais create_all nem seed automático aqui.


API_PREFIX = "/api/v1"

app.include_router(auth.router, prefix=API_PREFIX)
app.include_router(usuarios.router, prefix=API_PREFIX)
app.include_router(roles.router, prefix=API_PREFIX)
app.include_router(municipios.router, prefix=API_PREFIX)
app.include_router(arrecadacao.router, prefix=API_PREFIX)
app.include_router(pib.router, prefix=API_PREFIX)
app.include_router(vaf.router, prefix=API_PREFIX)
app.include_router(fpm.router, prefix=API_PREFIX)
app.include_router(ingestao_automatica.router, prefix=API_PREFIX)
app.include_router(captacao_federal.router, prefix=API_PREFIX)
app.include_router(emendas.router, prefix=API_PREFIX)
app.include_router(caged.router, prefix=API_PREFIX)
app.include_router(rais.router, prefix=API_PREFIX)
app.include_router(pix.router, prefix=API_PREFIX)
app.include_router(comparativo.router, prefix=API_PREFIX)
app.include_router(bolsa_familia.router, prefix=API_PREFIX)
app.include_router(pe_de_meia.router, prefix=API_PREFIX)
app.include_router(inss.router, prefix=API_PREFIX)
app.include_router(estban.router, prefix=API_PREFIX)
app.include_router(comex.router, prefix=API_PREFIX)
app.include_router(empresas.router, prefix=API_PREFIX)
app.include_router(insights.router, prefix=API_PREFIX)
app.include_router(marcos.router, prefix=API_PREFIX)
app.include_router(custom_cards.router, prefix=API_PREFIX)
app.include_router(plano_config.router, prefix=API_PREFIX)
app.include_router(dataset_info.router, prefix=API_PREFIX)
app.include_router(admin_explorer.router, prefix=API_PREFIX)
app.include_router(indicadores.router, prefix=API_PREFIX)
app.include_router(notificacoes.router, prefix=API_PREFIX)
app.include_router(login_audit.router, prefix=API_PREFIX)
app.include_router(login_audit.router_acoes, prefix=API_PREFIX)
app.include_router(projetos.router, prefix=API_PREFIX)
app.include_router(dados_internos.router, prefix=API_PREFIX)
app.include_router(desenvolvimento_economico.router, prefix=API_PREFIX)
app.include_router(ips.router, prefix=API_PREFIX)


@app.get("/health")
def health_check():
    return {"status": "ok"}
