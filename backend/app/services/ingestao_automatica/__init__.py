"""Fontes automáticas de dados (APIs públicas) — pipeline in-app, sem CSV manual.

Importar as fontes aqui garante o auto-registro em FONTES_AUTOMATICAS."""
from app.services.ingestao_automatica.base import (  # noqa: F401
    FONTES_AUTOMATICAS,
    FonteAutomatica,
    ResumoIngestao,
)
from app.services.ingestao_automatica import populacao_ibge  # noqa: F401
