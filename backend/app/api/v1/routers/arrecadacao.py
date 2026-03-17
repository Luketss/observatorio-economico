from typing import List

from app.api.deps import get_current_user, get_db
from app.models.arrecadacao import ArrecadacaoMensal
from app.schemas.arrecadacao import ArrecadacaoItem, ArrecadacaoResumo
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

router = APIRouter(prefix="/arrecadacao", tags=["Arrecadação"])


# ==============================
# Série Mensal
# ==============================
@router.get("/serie", response_model=List[ArrecadacaoItem])
def serie_mensal(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    query = db.query(ArrecadacaoMensal)

    if current_user.role.nome != "ADMIN_GLOBAL":
        query = query.filter(
            ArrecadacaoMensal.municipio_id == current_user.municipio_id
        )

    registros = query.order_by(ArrecadacaoMensal.ano, ArrecadacaoMensal.mes).all()

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
# Resumo
# ==============================
@router.get("/resumo", response_model=ArrecadacaoResumo)
def resumo_arrecadacao(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    query = db.query(ArrecadacaoMensal)

    if current_user.role.nome != "ADMIN_GLOBAL":
        query = query.filter(
            ArrecadacaoMensal.municipio_id == current_user.municipio_id
        )

    registros = query.all()

    if not registros:
        return ArrecadacaoResumo(
            total_geral=0,
            total_ultimo_ano=0,
            crescimento_percentual=0,
            media_mensal=0,
        )

    total_geral = sum(r.valor_total for r in registros)

    anos = sorted(set(r.ano for r in registros))

    ultimo_ano = anos[-1]
    total_ultimo_ano = sum(r.valor_total for r in registros if r.ano == ultimo_ano)

    crescimento = 0
    if len(anos) > 1:
        ano_anterior = anos[-2]
        total_anterior = sum(r.valor_total for r in registros if r.ano == ano_anterior)
        if total_anterior > 0:
            crescimento = ((total_ultimo_ano - total_anterior) / total_anterior) * 100

    media_mensal = total_geral / len(registros)

    return ArrecadacaoResumo(
        total_geral=total_geral,
        total_ultimo_ano=total_ultimo_ano,
        crescimento_percentual=round(crescimento, 2),
        media_mensal=media_mensal,
    )
