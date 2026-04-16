"""
Central registry of all SQLAlchemy models.

⚠️ IMPORTANT:
This module must import all models so they are registered
in SQLAlchemy metadata before migrations or runtime usage.

Do NOT import models inside db/base.py to avoid circular imports.
"""

from app.models.arrecadacao import ArrecadacaoMensal
from app.models.notificacao import Notificacao, NotificacaoLida
from app.models.bolsa_familia import BolsaFamiliaResumo
from app.models.caged import CagedMovimentacao, CagedPorSexo, CagedPorRaca, CagedSalario, CagedPorCnae
from app.models.comex import ComexMensal
from app.models.empresa import Empresa
from app.models.estban import EstbanMensal
from app.models.insight_ia import InsightIA
from app.models.marco import Marco
from app.models.dashboard_card_custom import DashboardCardCustom
from app.models.plano_config import PlanoConfig
from app.models.dataset_info import DatasetInfo
from app.models.inss import InssAnual
from app.models.municipio import Municipio
from app.models.pe_de_meia import PeDeMeiaResumo
from app.models.pib import PibAnual
from app.models.pix import PixMensal
from app.models.rais import (
    RaisVinculo, RaisPorSexo, RaisPorRaca, RaisPorCnae,
    RaisPorFaixaEtaria, RaisPorEscolaridade, RaisPorFaixaRemuneracao,
    RaisPorFaixaTempoEmprego, RaisMetricasAnuais,
)
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
    "RaisPorFaixaEtaria",
    "RaisPorEscolaridade",
    "RaisPorFaixaRemuneracao",
    "RaisPorFaixaTempoEmprego",
    "RaisMetricasAnuais",
    "PixMensal",
    "BolsaFamiliaResumo",
    "PeDeMeiaResumo",
    "InssAnual",
    "EstbanMensal",
    "ComexMensal",
    "Empresa",
    "InsightIA",
    "Marco",
    "DashboardCardCustom",
    "PlanoConfig",
    "DatasetInfo",
    "Notificacao",
    "NotificacaoLida",
]
