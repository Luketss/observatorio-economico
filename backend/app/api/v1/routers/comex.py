from typing import List, Optional

from app.api.deps import get_current_user, get_db
from app.models.comex import ComexMensal, ComexPorProduto as ComexProdModel, ComexPorPais as ComexPaisModel
from app.schemas.comex import ComexSerieItem, ComexResumo, ComexPorProdutoItem, ComexPorPaisItem
from fastapi import APIRouter, Depends, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

router = APIRouter(prefix="/comex", tags=["Comex"])


@router.get("/serie", response_model=List[ComexSerieItem])
def serie_comex(db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    query = db.query(ComexMensal)
    if current_user.role.nome != "ADMIN_GLOBAL":
        query = query.filter(ComexMensal.municipio_id == current_user.municipio_id)
    registros = query.order_by(ComexMensal.ano, ComexMensal.mes).all()
    return [
        ComexSerieItem(
            ano=r.ano,
            mes=r.mes,
            tipo_operacao=r.tipo_operacao,
            valor_usd=r.valor_usd,
            peso_kg=r.peso_kg,
        )
        for r in registros
    ]


@router.get("/resumo", response_model=ComexResumo)
def resumo_comex(db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    query = db.query(ComexMensal)
    if current_user.role.nome != "ADMIN_GLOBAL":
        query = query.filter(ComexMensal.municipio_id == current_user.municipio_id)
    registros = query.all()
    exportado = sum(r.valor_usd for r in registros if r.tipo_operacao == "export")
    importado = sum(r.valor_usd for r in registros if r.tipo_operacao == "import")
    return ComexResumo(
        total_exportado_usd=exportado,
        total_importado_usd=importado,
        balanca_comercial=exportado - importado,
    )


@router.get("/por_produto", response_model=List[ComexPorProdutoItem])
def por_produto(
    ano: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    query = db.query(
        ComexProdModel.produto,
        func.sum(ComexProdModel.valor_usd).label("valor_usd"),
        func.sum(ComexProdModel.peso_kg).label("peso_kg"),
    )
    if current_user.role.nome != "ADMIN_GLOBAL":
        query = query.filter(ComexProdModel.municipio_id == current_user.municipio_id)
    if ano:
        query = query.filter(ComexProdModel.ano == ano)
    resultados = query.group_by(ComexProdModel.produto).order_by(
        func.sum(ComexProdModel.valor_usd).desc()
    ).limit(15).all()
    return [
        ComexPorProdutoItem(produto=r.produto, valor_usd=r.valor_usd or 0, peso_kg=r.peso_kg or 0)
        for r in resultados
    ]


@router.get("/saldo_mensal")
def saldo_mensal(db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    """Monthly export, import and trade balance (exports − imports)."""
    query = db.query(ComexMensal)
    if current_user.role.nome != "ADMIN_GLOBAL":
        query = query.filter(ComexMensal.municipio_id == current_user.municipio_id)
    registros = query.order_by(ComexMensal.ano, ComexMensal.mes).all()
    periodos: dict = {}
    for r in registros:
        key = f"{r.ano}-{str(r.mes).zfill(2)}"
        if key not in periodos:
            periodos[key] = {"periodo": key, "ano": r.ano, "mes": r.mes, "exportacoes": 0, "importacoes": 0}
        if r.tipo_operacao == "EXP":
            periodos[key]["exportacoes"] += r.valor_usd or 0
        elif r.tipo_operacao == "IMP":
            periodos[key]["importacoes"] += r.valor_usd or 0
    result = []
    for p in sorted(periodos.values(), key=lambda x: x["periodo"]):
        p["saldo"] = p["exportacoes"] - p["importacoes"]
        result.append(p)
    return result


@router.get("/por_pais", response_model=List[ComexPorPaisItem])
def por_pais(
    ano: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    query = db.query(
        ComexPaisModel.pais,
        func.sum(ComexPaisModel.valor_usd).label("valor_usd"),
    )
    if current_user.role.nome != "ADMIN_GLOBAL":
        query = query.filter(ComexPaisModel.municipio_id == current_user.municipio_id)
    if ano:
        query = query.filter(ComexPaisModel.ano == ano)
    resultados = query.group_by(ComexPaisModel.pais).order_by(
        func.sum(ComexPaisModel.valor_usd).desc()
    ).limit(15).all()
    return [ComexPorPaisItem(pais=r.pais, valor_usd=r.valor_usd or 0) for r in resultados]
