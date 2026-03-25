from typing import List

from app.api.deps import get_current_user, get_db
from app.models.empresa import Empresa
from app.schemas.empresa import EmpresaResumo, EmpresaPorPorteItem, EmpresaPorCnaeItem
from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

PORTE_LABELS = {
    "00": "Não informado",
    "01": "Micro",
    "03": "Pequena",
    "05": "Média",
    "07": "Grande",
}

router = APIRouter(prefix="/empresas", tags=["Empresas"])


@router.get("/resumo", response_model=EmpresaResumo)
def resumo_empresas(db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    query = db.query(Empresa)
    if current_user.role.nome != "ADMIN_GLOBAL":
        query = query.filter(Empresa.municipio_id == current_user.municipio_id)
    registros = query.all()
    total = len(registros)
    ativas = sum(1 for r in registros if r.situacao == "02")
    mei = sum(1 for r in registros if r.opcao_mei)
    simples = sum(1 for r in registros if r.opcao_simples)
    return EmpresaResumo(total_empresas=total, total_ativas=ativas, total_mei=mei, total_simples=simples)


@router.get("/por_porte", response_model=List[EmpresaPorPorteItem])
def por_porte(db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    query = db.query(Empresa.porte, func.count(Empresa.id).label("total"))
    if current_user.role.nome != "ADMIN_GLOBAL":
        query = query.filter(Empresa.municipio_id == current_user.municipio_id)
    resultados = query.group_by(Empresa.porte).order_by(func.count(Empresa.id).desc()).all()
    return [
        EmpresaPorPorteItem(
            porte=PORTE_LABELS.get(r.porte or "00", r.porte or "Não informado"),
            total=r.total,
        )
        for r in resultados
    ]


@router.get("/por_cnae", response_model=List[EmpresaPorCnaeItem])
def por_cnae(db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    query = db.query(Empresa.cnae_fiscal, func.count(Empresa.id).label("total"))
    if current_user.role.nome != "ADMIN_GLOBAL":
        query = query.filter(Empresa.municipio_id == current_user.municipio_id)
    resultados = (
        query.filter(Empresa.cnae_fiscal.isnot(None))
        .group_by(Empresa.cnae_fiscal)
        .order_by(func.count(Empresa.id).desc())
        .limit(10)
        .all()
    )
    return [EmpresaPorCnaeItem(cnae_fiscal=r.cnae_fiscal, total=r.total) for r in resultados]
