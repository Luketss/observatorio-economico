"""
Central registry of all SQLAlchemy models.

⚠️ IMPORTANT:
This module must import all models so they are registered
in SQLAlchemy metadata before migrations or runtime usage.

Do NOT import models inside db/base.py to avoid circular imports.
"""

from app.models.arrecadacao import ArrecadacaoMensal
from app.models.login_audit import LoginAudit
from app.models.acao_audit import AcaoAudit
from app.models.ingestao_audit import IngestaoAudit
from app.models.ingestao_job import IngestaoJob
from app.models.ingestao_arquivo import IngestaoArquivo
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
from app.models.ips import IpsMunicipio
from app.models.municipio import Municipio
from app.models.pe_de_meia import PeDeMeiaResumo
from app.models.pib import PibAnual
from app.models.pix import PixMensal
from app.models.vaf import VafAnual
from app.models.rais import (
    RaisVinculo, RaisPorSexo, RaisPorRaca, RaisPorCnae,
    RaisPorFaixaEtaria, RaisPorEscolaridade, RaisPorFaixaRemuneracao,
    RaisPorFaixaTempoEmprego, RaisMetricasAnuais,
)
from app.models.role import Role
from app.models.usuario import Usuario
from app.models.desenvolvimento_economico import (
    InvestimentoFunil,
    EmpresaRetencao,
    VisitaRetencao,
    CaptacaoRecurso,
    EscritaProjeto,
    Premiacao,
)
from app.models.populacao import PopulacaoMunicipio
from app.models.fpm import FpmMensal
from app.models.captacao_federal import CaptacaoFederalAnual
from app.models.emenda import EmendaParlamentar

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
    "VafAnual",
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
    "IpsMunicipio",
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
    "LoginAudit",
    "AcaoAudit",
    "IngestaoAudit",
    "IngestaoJob",
    "IngestaoArquivo",
    "InvestimentoFunil",
    "EmpresaRetencao",
    "VisitaRetencao",
    "CaptacaoRecurso",
    "EscritaProjeto",
    "Premiacao",
    "PopulacaoMunicipio",
    "FpmMensal",
    "CaptacaoFederalAnual",
    "EmendaParlamentar",
]
