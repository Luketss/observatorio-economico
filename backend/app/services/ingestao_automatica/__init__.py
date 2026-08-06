"""Fontes automáticas de dados (APIs públicas) — pipeline in-app, sem CSV manual.

Importar as fontes aqui garante o auto-registro em FONTES_AUTOMATICAS."""
from app.services.ingestao_automatica.base import (  # noqa: F401
    FONTES_AUTOMATICAS,
    FonteAutomatica,
    ResumoIngestao,
)
from app.services.ingestao_automatica import populacao_ibge  # noqa: F401
from app.services.ingestao_automatica import fpm_stn  # noqa: F401
from app.services.ingestao_automatica import captacao_siconv  # noqa: F401
from app.services.ingestao_automatica import emendas_portal  # noqa: F401
from app.services.ingestao_automatica import pib_ibge  # noqa: F401
from app.services.ingestao_automatica import pix_bcb  # noqa: F401
from app.services.ingestao_automatica import comex_mdic  # noqa: F401
from app.services.ingestao_automatica import estban_bcb  # noqa: F401
from app.services.ingestao_automatica import bolsa_familia_portal  # noqa: F401
from app.services.ingestao_automatica import pe_de_meia_portal  # noqa: F401
from app.services.ingestao_automatica import inss_emps  # noqa: F401
from app.services.ingestao_automatica import arrecadacao  # noqa: F401 — roteador MG/PR/RS (importa arrecadacao_mg/pr/rs)
from app.services.ingestao_automatica import caged_pdet  # noqa: F401
from app.services.ingestao_automatica import cnpj_rfb  # noqa: F401
from app.services.ingestao_automatica import rais_pdet  # noqa: F401
