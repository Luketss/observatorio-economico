from typing import List

from app.api.deps import get_current_user, get_db
from app.models.municipio import Municipio
from app.models.vaf import VafAnual
from app.schemas.vaf import VafComparativoItem, VafItem, VafResumo
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

router = APIRouter(prefix="/vaf", tags=["VAF"])


def _to_item(r: VafAnual) -> VafItem:
    return VafItem(
        ano_base=r.ano_base,
        ano_aplicacao=r.ano_aplicacao,
        vaf_individual=r.vaf_individual,
        pct_vaf_individual=r.pct_vaf_individual,
        vaf_estado=r.vaf_estado,
        pct_vaf_estado=r.pct_vaf_estado,
        indice=r.indice,
        pct_indice=r.pct_indice,
        indice_medio=r.indice_medio,
        pct_indice_medio=r.pct_indice_medio,
        indice_participacao_municipal=r.indice_participacao_municipal,
        pct_ipm=r.pct_ipm,
    )


# ==============================
# Série Anual
# ==============================
@router.get("/serie", response_model=List[VafItem])
def serie_vaf(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    query = db.query(VafAnual)

    if current_user.role.nome != "ADMIN_GLOBAL":
        query = query.filter(VafAnual.municipio_id == current_user.municipio_id)

    registros = query.order_by(VafAnual.ano_base).all()

    return [_to_item(r) for r in registros]


# ==============================
# Resumo
# ==============================
@router.get("/resumo", response_model=VafResumo)
def resumo_vaf(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    query = db.query(VafAnual)

    if current_user.role.nome != "ADMIN_GLOBAL":
        query = query.filter(VafAnual.municipio_id == current_user.municipio_id)

    registros = query.order_by(VafAnual.ano_base).all()

    if not registros:
        return VafResumo(
            ultimo_ano=0,
            ipm_ultimo_ano=0,
            variacao_ipm_percentual=0,
        )

    ultimo = registros[-1]

    return VafResumo(
        ultimo_ano=ultimo.ano_base,
        ipm_ultimo_ano=ultimo.indice_participacao_municipal or 0,
        variacao_ipm_percentual=round(ultimo.pct_ipm or 0, 2),
    )


# ==============================
# Comparativo entre Municípios (ADMIN_GLOBAL)
# ==============================
@router.get("/comparativo", response_model=List[VafComparativoItem])
def comparativo_vaf(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    if current_user.role.nome != "ADMIN_GLOBAL":
        municipio = (
            db.query(Municipio)
            .filter(Municipio.id == current_user.municipio_id)
            .first()
        )
        registros = (
            db.query(VafAnual)
            .filter(VafAnual.municipio_id == current_user.municipio_id)
            .order_by(VafAnual.ano_base)
            .all()
        )
        nome = municipio.nome if municipio else ""
        return [
            VafComparativoItem(cidade=nome, **_to_item(r).model_dump())
            for r in registros
        ]

    # ADMIN_GLOBAL vê todos (exceto municípios demo)
    registros = (
        db.query(VafAnual, Municipio.nome)
        .join(Municipio, VafAnual.municipio_id == Municipio.id)
        .filter(Municipio.is_demo.is_(False))
        .order_by(VafAnual.ano_base)
        .all()
    )
    return [
        VafComparativoItem(cidade=nome, **_to_item(r).model_dump())
        for r, nome in registros
    ]


@router.get("/ranking")
def ranking_vaf(
    ano: int | None = None,
    estado: str | None = None,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    from sqlalchemy import func

    query = (
        db.query(
            Municipio.nome.label("municipio"),
            Municipio.id.label("municipio_id"),
            Municipio.estado.label("estado"),
            VafAnual.indice_participacao_municipal.label("indice_participacao_municipal"),
        )
        .join(VafAnual, VafAnual.municipio_id == Municipio.id)
        .filter(Municipio.is_demo.is_(False))
    )
    if ano:
        query = query.filter(VafAnual.ano_base == ano)
    else:
        latest = db.query(func.max(VafAnual.ano_base)).scalar()
        if latest:
            query = query.filter(VafAnual.ano_base == latest)
    if estado:
        query = query.filter(Municipio.estado == estado.upper())

    resultados = query.order_by(
        VafAnual.indice_participacao_municipal.desc()
    ).all()
    return [
        {
            "municipio": r.municipio,
            "municipio_id": r.municipio_id,
            "estado": r.estado,
            "indice_participacao_municipal": r.indice_participacao_municipal or 0,
        }
        for r in resultados
    ]
