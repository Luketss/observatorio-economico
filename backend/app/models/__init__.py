"""
Central registry of all SQLAlchemy models.

⚠️ IMPORTANT:
This module must import all models so they are registered
in SQLAlchemy metadata before migrations or runtime usage.

Do NOT import models inside db/base.py to avoid circular imports.
"""

from app.models.arrecadacao import ArrecadacaoMensal
from app.models.caged import CagedMovimentacao
from app.models.municipio import Municipio
from app.models.pib import PibAnual
from app.models.rais import RaisVinculo
from app.models.role import Role
from app.models.usuario import Usuario

__all__ = [
    "Usuario",
    "Role",
    "Municipio",
    "ArrecadacaoMensal",
    "CagedMovimentacao",
    "PibAnual",
    "RaisVinculo",
]
