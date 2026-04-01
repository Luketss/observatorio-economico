"""
Central registry of all SQLAlchemy models.

⚠️ IMPORTANT:
This module must import all models so they are registered
in SQLAlchemy metadata before migrations or runtime usage.

Do NOT import models inside db/base.py to avoid circular imports.
"""

from app.models.arrecadacao import ArrecadacaoMensal
from app.models.bolsa_familia import BolsaFamiliaResumo
from app.models.caged import CagedMovimentacao, CagedPorSexo, CagedPorRaca, CagedSalario, CagedPorCnae
from app.models.comex import ComexMensal
from app.models.empresa import Empresa
from app.models.estban import EstbanMensal
from app.models.insight_ia import InsightIA
from app.models.marco import Marco
from app.models.inss import InssAnual
from app.models.municipio import Municipio
from app.models.pe_de_meia import PeDeMeiaResumo
from app.models.pib import PibAnual
from app.models.rais import RaisVinculo, RaisPorSexo, RaisPorRaca, RaisPorCnae
from app.models.role import Role
from app.models.usuario import Usuario

__all__ = [
    "Usuario",
    "Role",
    "Municipio",
    "ArrecadacaoMensal",
    "CagedMovimentacao",
    "CagedPorSexo",
    "CagedPorRaca",
    "CagedSalario",
    "CagedPorCnae",
    "PibAnual",
    "RaisVinculo",
    "RaisPorSexo",
    "RaisPorRaca",
    "RaisPorCnae",
    "BolsaFamiliaResumo",
    "PeDeMeiaResumo",
    "InssAnual",
    "EstbanMensal",
    "ComexMensal",
    "Empresa",
    "InsightIA",
    "Marco",
]
