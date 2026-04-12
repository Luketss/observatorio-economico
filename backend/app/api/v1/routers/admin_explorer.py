from typing import Any, Dict, List

from app.api.deps import get_db, require_role
from app.api.pagination import PaginatedResponse
from app.models.arrecadacao import ArrecadacaoMensal
from app.models.bolsa_familia import BolsaFamiliaResumo
from app.models.caged import (
    CagedMovimentacao,
    CagedPorCnae,
    CagedPorRaca,
    CagedPorSexo,
    CagedSalario,
)
from app.models.comex import ComexMensal, ComexPorPais, ComexPorProduto
from app.models.dashboard_card_custom import DashboardCardCustom
from app.models.dataset_info import DatasetInfo
from app.models.empresa import Empresa
from app.models.estban import EstbanMensal, EstbanPorInstituicao
from app.models.insight_ia import InsightIA
from app.models.inss import InssAnual
from app.models.marco import Marco
from app.models.municipio import Municipio
from app.models.pe_de_meia import PeDeMeiaEtapa, PeDeMeiaResumo
from app.models.pib import PibAnual
from app.models.pix import PixMensal
from app.models.plano_config import PlanoConfig
from app.models.rais import (
    RaisMetricasAnuais,
    RaisPorCnae,
    RaisPorEscolaridade,
    RaisPorFaixaEtaria,
    RaisPorFaixaRemuneracao,
    RaisPorFaixaTempoEmprego,
    RaisPorRaca,
    RaisPorSexo,
    RaisVinculo,
)
from app.models.role import Role
from app.models.usuario import Usuario
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import String, Text, asc, desc
from sqlalchemy.orm import Session

router = APIRouter(prefix="/admin/explore", tags=["Admin Explorer"])

# ==============================
# Table registry — explicit whitelist (no dynamic SQL)
# ==============================
TABLE_REGISTRY = [
    {"table": "municipios", "label": "Municípios", "group": "Sistema", "model": Municipio},
    {"table": "usuarios", "label": "Usuários", "group": "Sistema", "model": Usuario},
    {"table": "roles", "label": "Roles", "group": "Sistema", "model": Role},
    {"table": "insights_ia", "label": "Insights IA", "group": "Admin", "model": InsightIA},
    {"table": "marcos_mandato", "label": "Marcos do Mandato", "group": "Admin", "model": Marco},
    {"table": "dashboard_cards_custom", "label": "Cards Customizados", "group": "Admin", "model": DashboardCardCustom},
    {"table": "plano_config", "label": "Planos de Acesso", "group": "Admin", "model": PlanoConfig},
    {"table": "dataset_info", "label": "Informações de Dataset", "group": "Admin", "model": DatasetInfo},
    {"table": "arrecadacao_mensal", "label": "Arrecadação Mensal", "group": "Economia", "model": ArrecadacaoMensal},
    {"table": "pib_anual", "label": "PIB Anual", "group": "Economia", "model": PibAnual},
    {"table": "caged_movimentacao", "label": "CAGED Movimentação", "group": "CAGED", "model": CagedMovimentacao},
    {"table": "caged_por_sexo", "label": "CAGED por Sexo", "group": "CAGED", "model": CagedPorSexo},
    {"table": "caged_por_raca", "label": "CAGED por Raça/Cor", "group": "CAGED", "model": CagedPorRaca},
    {"table": "caged_salario", "label": "CAGED Salário", "group": "CAGED", "model": CagedSalario},
    {"table": "caged_por_cnae", "label": "CAGED por CNAE", "group": "CAGED", "model": CagedPorCnae},
    {"table": "rais_vinculos", "label": "RAIS Vínculos", "group": "RAIS", "model": RaisVinculo},
    {"table": "rais_por_sexo", "label": "RAIS por Sexo", "group": "RAIS", "model": RaisPorSexo},
    {"table": "rais_por_raca", "label": "RAIS por Raça/Cor", "group": "RAIS", "model": RaisPorRaca},
    {"table": "rais_por_cnae", "label": "RAIS por CNAE", "group": "RAIS", "model": RaisPorCnae},
    {"table": "rais_por_faixa_etaria", "label": "RAIS por Faixa Etária", "group": "RAIS", "model": RaisPorFaixaEtaria},
    {"table": "rais_por_escolaridade", "label": "RAIS por Escolaridade", "group": "RAIS", "model": RaisPorEscolaridade},
    {"table": "rais_por_faixa_remuneracao", "label": "RAIS por Faixa de Remuneração", "group": "RAIS", "model": RaisPorFaixaRemuneracao},
    {"table": "rais_por_faixa_tempo_emprego", "label": "RAIS por Tempo de Emprego", "group": "RAIS", "model": RaisPorFaixaTempoEmprego},
    {"table": "rais_metricas_anuais", "label": "RAIS Métricas Anuais", "group": "RAIS", "model": RaisMetricasAnuais},
    {"table": "empresas", "label": "Empresas (CNPJ)", "group": "Comércio", "model": Empresa},
    {"table": "pix_mensal", "label": "PIX Mensal", "group": "Comércio", "model": PixMensal},
    {"table": "estban_mensal", "label": "Estban Mensal", "group": "Comércio", "model": EstbanMensal},
    {"table": "estban_por_instituicao", "label": "Estban por Instituição", "group": "Comércio", "model": EstbanPorInstituicao},
    {"table": "comex_mensal", "label": "Comex Mensal", "group": "Comércio", "model": ComexMensal},
    {"table": "comex_por_produto", "label": "Comex por Produto", "group": "Comércio", "model": ComexPorProduto},
    {"table": "comex_por_pais", "label": "Comex por País", "group": "Comércio", "model": ComexPorPais},
    {"table": "bolsa_familia_resumo", "label": "Bolsa Família Resumo", "group": "Social", "model": BolsaFamiliaResumo},
    {"table": "inss_anual", "label": "INSS Anual", "group": "Social", "model": InssAnual},
    {"table": "pe_de_meia_resumo", "label": "Pé-de-Meia Resumo", "group": "Social", "model": PeDeMeiaResumo},
    {"table": "pe_de_meia_etapa", "label": "Pé-de-Meia por Etapa", "group": "Social", "model": PeDeMeiaEtapa},
]

_TABLE_LOOKUP: Dict[str, Any] = {entry["table"]: entry for entry in TABLE_REGISTRY}
_RESERVED_PARAMS = {"skip", "limit", "sort_by", "sort_order"}


def _col_type_name(col) -> str:
    return type(col.type).__name__.lower()


def _get_column_meta(model) -> List[Dict]:
    return [
        {
            "name": col.name,
            "type": _col_type_name(col),
            "nullable": col.nullable if col.nullable is not None else True,
        }
        for col in model.__table__.columns
    ]


def _serialize_row(row, model) -> Dict:
    result = {}
    for col in model.__table__.columns:
        val = getattr(row, col.name)
        if val is not None and hasattr(val, "isoformat"):
            val = val.isoformat()
        result[col.name] = val
    return result


# ==============================
# List available tables with column metadata
# ==============================
@router.get("", response_model=List[Dict])
def listar_tabelas(
    current_user=Depends(require_role("ADMIN_GLOBAL")),
):
    return [
        {
            "table": entry["table"],
            "label": entry["label"],
            "group": entry["group"],
            "columns": _get_column_meta(entry["model"]),
        }
        for entry in TABLE_REGISTRY
    ]


# ==============================
# Query a specific table with dynamic filters, sort, pagination
# ==============================
@router.get("/{table_name}")
def consultar_tabela(
    table_name: str,
    request: Request,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    sort_by: str = Query("id"),
    sort_order: str = Query("asc", pattern="^(asc|desc)$"),
    db: Session = Depends(get_db),
    current_user=Depends(require_role("ADMIN_GLOBAL")),
):
    if table_name not in _TABLE_LOOKUP:
        raise HTTPException(status_code=404, detail=f"Tabela '{table_name}' nao encontrada.")

    model = _TABLE_LOOKUP[table_name]["model"]
    table_cols = {col.name: col for col in model.__table__.columns}

    query = db.query(model)

    # Apply column filters from extra query params
    for param, value in request.query_params.items():
        if param in _RESERVED_PARAMS or param not in table_cols or not value:
            continue
        col = table_cols[param]
        if isinstance(col.type, (String, Text)):
            query = query.filter(col.ilike(f"%{value}%"))
        else:
            try:
                query = query.filter(col == value)
            except Exception:
                pass

    # Apply sorting
    if sort_by in table_cols:
        sort_col = table_cols[sort_by]
        order_fn = asc if sort_order == "asc" else desc
        query = query.order_by(order_fn(sort_col))

    total = query.count()
    rows = query.offset(skip).limit(limit).all()
    items = [_serialize_row(row, model) for row in rows]

    return PaginatedResponse(items=items, total=total, skip=skip, limit=limit)
