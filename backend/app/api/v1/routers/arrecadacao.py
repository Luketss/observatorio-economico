from typing import List

from app.api.deps import get_db, scoped_modulo
from app.models.arrecadacao import ArrecadacaoMensal
from app.schemas.arrecadacao import ArrecadacaoItem, ArrecadacaoResumo
from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

router = APIRouter(prefix="/arrecadacao", tags=["Arrecadação"])


# ==============================
# Série Mensal
# ==============================
@router.get("/serie", response_model=List[ArrecadacaoItem])
def serie_mensal(
    mid: int | None = Depends(scoped_modulo("arrecadacao")),
    db: Session = Depends(get_db),
):
    if mid is None:
        # ADMIN_GLOBAL sem município selecionado — front exibe "selecione um município".
        return []

    registros = (
        db.query(ArrecadacaoMensal)
        .filter(ArrecadacaoMensal.municipio_id == mid)
        .order_by(ArrecadacaoMensal.ano, ArrecadacaoMensal.mes)
        .all()
    )

    resultado = []

    for r in registros:
        resultado.append(
            ArrecadacaoItem(
                ano=r.ano,
                mes=r.mes,
                periodo=f"{r.ano}-{str(r.mes).zfill(2)}",
                total=r.valor_total,
                icms=r.valor_icms,
                ipva=r.valor_ipva,
                ipi=r.valor_ipi,
            )
        )

    return resultado


# ==============================
# Por Tipo de Imposto
# ==============================
@router.get("/por_tipo")
def por_tipo(
    mid: int | None = Depends(scoped_modulo("arrecadacao")),
    db: Session = Depends(get_db),
):
    """Returns each period's ICMS, IPVA and IPI as separate labeled rows for stacked charts."""
    if mid is None:
        return []
    registros = (
        db.query(ArrecadacaoMensal)
        .filter(ArrecadacaoMensal.municipio_id == mid)
        .order_by(ArrecadacaoMensal.ano, ArrecadacaoMensal.mes)
        .all()
    )
    result = []
    for r in registros:
        periodo = f"{r.ano}-{str(r.mes).zfill(2)}"
        result.append({"periodo": periodo, "ano": r.ano, "mes": r.mes, "tipo": "ICMS", "valor": r.valor_icms or 0})
        result.append({"periodo": periodo, "ano": r.ano, "mes": r.mes, "tipo": "IPVA", "valor": r.valor_ipva or 0})
        result.append({"periodo": periodo, "ano": r.ano, "mes": r.mes, "tipo": "IPI", "valor": r.valor_ipi or 0})
    return result


# ==============================
# Resumo
# ==============================
@router.get("/resumo", response_model=ArrecadacaoResumo)
def resumo_arrecadacao(
    mid: int | None = Depends(scoped_modulo("arrecadacao")),
    db: Session = Depends(get_db),
):
    por_ano = (
        db.query(
            ArrecadacaoMensal.ano,
            func.coalesce(func.sum(ArrecadacaoMensal.valor_total), 0).label("total"),
            func.count(ArrecadacaoMensal.id).label("n"),
        )
        .filter(ArrecadacaoMensal.municipio_id == mid)
        .group_by(ArrecadacaoMensal.ano)
        .order_by(ArrecadacaoMensal.ano)
        .all()
        if mid is not None
        else []
    )

    if not por_ano:
        return ArrecadacaoResumo(
            total_geral=0,
            total_ultimo_ano=0,
            crescimento_percentual=0,
            media_mensal=0,
        )

    total_geral = sum(r.total for r in por_ano)
    n_meses = sum(r.n for r in por_ano)
    total_ultimo_ano = por_ano[-1].total

    crescimento = 0
    if len(por_ano) > 1 and por_ano[-2].total > 0:
        crescimento = ((total_ultimo_ano - por_ano[-2].total) / por_ano[-2].total) * 100

    media_mensal = total_geral / n_meses if n_meses else 0

    return ArrecadacaoResumo(
        total_geral=total_geral,
        total_ultimo_ano=total_ultimo_ano,
        crescimento_percentual=round(crescimento, 2),
        media_mensal=media_mensal,
    )
