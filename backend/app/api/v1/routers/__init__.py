"""
Routers package initializer.

This file explicitly exposes router modules so they can be imported as:

from app.api.v1.routers import arrecadacao, caged, pib, rais, comparativo, usuarios, municipios, auth
"""

# Intentionally left minimal to avoid circular imports.
# Routers should be imported directly in app.main:
# from app.api.v1.routers import arrecadacao
# and then included via app.include_router(arrecadacao.router)

__all__ = []
