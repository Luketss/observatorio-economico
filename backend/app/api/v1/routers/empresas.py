from datetime import date
from typing import List
import re

from app.api.deps import get_current_user, get_db, scoped_modulo
from app.core.cnae import CNAE_SECAO
from app.models.empresa import Empresa
from app.schemas.empresa import EmpresaResumo, EmpresaPorPorteItem, EmpresaPorCnaeItem, EmpresaOut
from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, case, or_
from sqlalchemy.orm import Session

PORTE_LABELS = {
    "00": "Não informado",
    "01": "Micro",
    "03": "Pequena",
    "05": "Média",
    "07": "Grande",
}

SITUACAO_LABELS = {
    "01": "Nula",
    "02": "Ativa",
    "03": "Suspensa",
    "04": "Inapta",
    "08": "Baixada",
}

router = APIRouter(prefix="/empresas", tags=["Empresas"])


@router.get("/resumo", response_model=EmpresaResumo)
def resumo_empresas(
    abertas_de: date | None = Query(None, description="Início do período de abertura (data_inicio >=)"),
    abertas_ate: date | None = Query(None, description="Fim do período de abertura (data_inicio <=)"),
    mid: int | None = Depends(scoped_modulo("empresas")),
    db: Session = Depends(get_db),
):
    """Resumo do cadastro. `abertas_periodo` = COUNT de empresas com
    `data_inicio` dentro de [abertas_de, abertas_ate] (sem datas: todo o
    histórico). Empresas com `data_inicio` NULL ficam FORA dessa contagem —
    cadastro legado, não há como situá-las no tempo (decisão de produto;
    contagem audível não se aplica). Demais campos seguem contando tudo."""
    if mid is None:
        return EmpresaResumo(
            total_empresas=0, total_ativas=0, total_mei=0, total_simples=0,
            abertas_periodo=0,
        )
    row = (
        db.query(
            func.count(Empresa.id),
            func.coalesce(func.sum(case((Empresa.situacao == "02", 1), else_=0)), 0),
            func.coalesce(func.sum(case((Empresa.opcao_mei.is_(True), 1), else_=0)), 0),
            func.coalesce(func.sum(case((Empresa.opcao_simples.is_(True), 1), else_=0)), 0),
        )
        .filter(Empresa.municipio_id == mid)
        .one()
    )
    abertas_q = db.query(func.count(Empresa.id)).filter(
        Empresa.municipio_id == mid,
        Empresa.data_inicio.isnot(None),
    )
    if abertas_de is not None:
        abertas_q = abertas_q.filter(Empresa.data_inicio >= abertas_de)
    if abertas_ate is not None:
        abertas_q = abertas_q.filter(Empresa.data_inicio <= abertas_ate)
    return EmpresaResumo(
        total_empresas=row[0] or 0,
        total_ativas=int(row[1] or 0),
        total_mei=int(row[2] or 0),
        total_simples=int(row[3] or 0),
        abertas_periodo=int(abertas_q.scalar() or 0),
    )


@router.get("/buscar", response_model=List[EmpresaOut])
def buscar_empresas(
    q: str = Query(min_length=2),
    mid: int | None = Depends(scoped_modulo("empresas")),
    db: Session = Depends(get_db),
):
    """Autocomplete da Gestão Empresarial: match por nome ou raiz de CNPJ."""
    if mid is None:
        return []
    digitos = re.sub(r"\D", "", q)
    query = db.query(Empresa).filter(Empresa.municipio_id == mid)
    if len(digitos) >= 3:
        query = query.filter(Empresa.cnpj_basico.like(f"{digitos[:8]}%"))
    else:
        like = f"%{q}%"
        query = query.filter(or_(
            Empresa.razao_social.ilike(like),
            Empresa.nome_fantasia.ilike(like),
        ))
    return query.order_by(Empresa.razao_social).limit(10).all()


@router.get("/por_porte", response_model=List[EmpresaPorPorteItem])
def por_porte(mid: int | None = Depends(scoped_modulo("empresas")), db: Session = Depends(get_db)):
    if mid is None:
        return []
    query = db.query(Empresa.porte, func.count(Empresa.id).label("total")).filter(
        Empresa.municipio_id == mid
    )
    resultados = query.group_by(Empresa.porte).order_by(func.count(Empresa.id).desc()).all()
    return [
        EmpresaPorPorteItem(
            porte=PORTE_LABELS.get(r.porte or "00", r.porte or "Não informado"),
            total=r.total,
        )
        for r in resultados
    ]


@router.get("/por_cnae", response_model=List[EmpresaPorCnaeItem])
def por_cnae(mid: int | None = Depends(scoped_modulo("empresas")), db: Session = Depends(get_db)):
    if mid is None:
        return []
    query = db.query(Empresa.cnae_fiscal, func.count(Empresa.id).label("total")).filter(
        Empresa.municipio_id == mid
    )
    resultados = (
        query.filter(Empresa.cnae_fiscal.isnot(None))
        .group_by(Empresa.cnae_fiscal)
        .order_by(func.count(Empresa.id).desc())
        .limit(10)
        .all()
    )
    return [EmpresaPorCnaeItem(cnae_fiscal=r.cnae_fiscal, total=r.total) for r in resultados]


@router.get("/por_situacao")
def por_situacao(mid: int | None = Depends(scoped_modulo("empresas")), db: Session = Depends(get_db)):
    """Count of companies grouped by situacao (active, closed, etc.)."""
    if mid is None:
        return []
    query = db.query(Empresa.situacao, func.count(Empresa.id).label("total")).filter(
        Empresa.municipio_id == mid
    )
    resultados = query.group_by(Empresa.situacao).order_by(func.count(Empresa.id).desc()).all()
    return [
        {
            "label": SITUACAO_LABELS.get(r.situacao or "", r.situacao or "Não informado"),
            "situacao": r.situacao or "",
            "total": r.total,
        }
        for r in resultados
    ]


@router.get("/situacao_por_porte")
def situacao_por_porte(mid: int | None = Depends(scoped_modulo("empresas")), db: Session = Depends(get_db)):
    """Per-porte breakdown of active vs. closed companies."""
    if mid is None:
        return []
    query = db.query(
        Empresa.porte,
        func.count(Empresa.id).label("total"),
        func.sum(case((Empresa.situacao == "02", 1), else_=0)).label("ativas"),
        func.sum(case((Empresa.situacao != "02", 1), else_=0)).label("fechadas"),
    ).filter(Empresa.municipio_id == mid)
    resultados = query.group_by(Empresa.porte).order_by(func.count(Empresa.id).desc()).all()
    return [
        {
            "porte": PORTE_LABELS.get(r.porte or "00", r.porte or "Não informado"),
            "total": r.total,
            "ativas": r.ativas or 0,
            "fechadas": r.fechadas or 0,
            "saldo": (r.ativas or 0) - (r.fechadas or 0),
        }
        for r in resultados
    ]


@router.get("/por_cnae_secao")
def por_cnae_secao(mid: int | None = Depends(scoped_modulo("empresas")), db: Session = Depends(get_db)):
    """Count of companies by CNAE 2-digit division with human-readable description."""
    if mid is None:
        return []
    query = db.query(Empresa.cnae_fiscal, func.count(Empresa.id).label("total")).filter(
        Empresa.municipio_id == mid
    )
    resultados = (
        query.filter(Empresa.cnae_fiscal.isnot(None))
        .group_by(Empresa.cnae_fiscal)
        .order_by(func.count(Empresa.id).desc())
        .all()
    )
    # Aggregate by 2-digit division
    divisoes: dict = {}
    for r in resultados:
        div = (r.cnae_fiscal or "")[:2]
        label = CNAE_SECAO.get(div, f"Divisão {div}")
        if label not in divisoes:
            divisoes[label] = 0
        divisoes[label] += r.total
    return sorted(
        [{"descricao": k, "total_vinculos": v} for k, v in divisoes.items()],
        key=lambda x: x["total_vinculos"],
        reverse=True,
    )[:20]


@router.get("/capital_por_porte")
def capital_por_porte(mid: int | None = Depends(scoped_modulo("empresas")), db: Session = Depends(get_db)):
    """Average and total capital social grouped by porte (active companies only)."""
    if mid is None:
        return []
    query = db.query(
        Empresa.porte,
        func.avg(Empresa.capital_social).label("capital_medio"),
        func.sum(Empresa.capital_social).label("capital_total"),
        func.count(Empresa.id).label("total"),
    ).filter(
        Empresa.capital_social.isnot(None),
        Empresa.capital_social > 0,
        Empresa.municipio_id == mid,
    )
    resultados = query.group_by(Empresa.porte).order_by(func.sum(Empresa.capital_social).desc()).all()
    return [
        {
            "porte": PORTE_LABELS.get(r.porte or "00", r.porte or "Não informado"),
            "capital_medio": round(r.capital_medio or 0, 2),
            "capital_total": round(r.capital_total or 0, 2),
            "total": r.total,
        }
        for r in resultados
    ]


@router.get("/comparativo")
def comparativo_empresas(
    estado: str | None = None,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    from app.models.municipio import Municipio
    from app.models.empresa import Empresa
    from sqlalchemy import func

    query = (
        db.query(
            Municipio.nome.label("municipio"),
            Municipio.id.label("municipio_id"),
            Municipio.estado.label("estado"),
            func.count(Empresa.id).label("total_empresas"),
        )
        .join(Empresa, Empresa.municipio_id == Municipio.id)
        .filter(Municipio.is_demo.is_(False))
        .filter(Empresa.situacao == "02")
    )
    if estado:
        query = query.filter(Municipio.estado == estado.upper())
    resultados = (
        query.group_by(Municipio.nome, Municipio.id, Municipio.estado)
        .order_by(func.count(Empresa.id).desc())
        .all()
    )
    return [
        {"municipio": r.municipio, "municipio_id": r.municipio_id, "estado": r.estado, "total_empresas": r.total_empresas or 0}
        for r in resultados
    ]
