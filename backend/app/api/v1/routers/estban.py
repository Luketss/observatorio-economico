from typing import List

from app.api.deps import get_current_user, get_db
from app.models.estban import EstbanMensal, EstbanPorInstituicao as EstbanInstModel
from app.schemas.estban import EstbanSerieItem, EstbanPorInstituicaoItem, EstbanResumo
from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

router = APIRouter(prefix="/estban", tags=["Estban"])


@router.get("/serie", response_model=List[EstbanSerieItem])
def serie_estban(db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    query = db.query(EstbanMensal)
    if current_user.role.nome != "ADMIN_GLOBAL":
        query = query.filter(EstbanMensal.municipio_id == current_user.municipio_id)
    registros = query.order_by(EstbanMensal.data_referencia).all()
    return [
        EstbanSerieItem(
            data_referencia=r.data_referencia,
            qtd_agencias=r.qtd_agencias,
            valor_operacoes_credito=r.valor_operacoes_credito,
            valor_depositos_vista=r.valor_depositos_vista,
            valor_poupanca=r.valor_poupanca,
            valor_depositos_prazo=r.valor_depositos_prazo,
            emprestimos_titulos_descontados=r.emprestimos_titulos_descontados,
            financiamentos_gerais=r.financiamentos_gerais,
            financiamento_agropecuario=r.financiamento_agropecuario,
            financiamentos_imobiliarios=r.financiamentos_imobiliarios,
            arrendamento_mercantil=r.arrendamento_mercantil,
            emprestimos_setor_publico=r.emprestimos_setor_publico,
            outros_creditos=r.outros_creditos,
        )
        for r in registros
    ]


@router.get("/resumo", response_model=EstbanResumo)
def resumo_estban(db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    query = db.query(EstbanMensal)
    if current_user.role.nome != "ADMIN_GLOBAL":
        query = query.filter(EstbanMensal.municipio_id == current_user.municipio_id)
    registros = query.all()
    if not registros:
        return EstbanResumo(total_operacoes_credito=0, total_depositos=0, qtd_agencias=0)
    latest = max(registros, key=lambda r: r.data_referencia)
    total_dep = latest.valor_depositos_vista + latest.valor_poupanca + latest.valor_depositos_prazo
    return EstbanResumo(
        total_operacoes_credito=latest.valor_operacoes_credito,
        total_depositos=total_dep,
        qtd_agencias=latest.qtd_agencias,
    )


@router.get("/captacao_serie")
def captacao_serie(db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    """Total deposits (vista + poupança + prazo) and credit by date."""
    query = db.query(EstbanMensal)
    if current_user.role.nome != "ADMIN_GLOBAL":
        query = query.filter(EstbanMensal.municipio_id == current_user.municipio_id)
    registros = query.order_by(EstbanMensal.data_referencia).all()
    return [
        {
            "data_referencia": r.data_referencia,
            "depositos_vista": r.valor_depositos_vista or 0,
            "poupanca": r.valor_poupanca or 0,
            "depositos_prazo": r.valor_depositos_prazo or 0,
            "total_captacao": (r.valor_depositos_vista or 0) + (r.valor_poupanca or 0) + (r.valor_depositos_prazo or 0),
            "operacoes_credito": r.valor_operacoes_credito or 0,
        }
        for r in registros
    ]


@router.get("/por_instituicao", response_model=List[EstbanPorInstituicaoItem])
def por_instituicao(db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    query = db.query(
        EstbanInstModel.nome_instituicao,
        func.sum(EstbanInstModel.qtd_agencias).label("qtd_agencias"),
        func.sum(EstbanInstModel.valor_operacoes_credito).label("valor_operacoes_credito"),
        func.sum(EstbanInstModel.valor_depositos_vista).label("valor_depositos_vista"),
        func.sum(EstbanInstModel.valor_poupanca).label("valor_poupanca"),
        func.sum(EstbanInstModel.valor_depositos_prazo).label("valor_depositos_prazo"),
    )
    if current_user.role.nome != "ADMIN_GLOBAL":
        query = query.filter(EstbanInstModel.municipio_id == current_user.municipio_id)
    resultados = query.group_by(EstbanInstModel.nome_instituicao).order_by(
        func.sum(EstbanInstModel.valor_operacoes_credito).desc()
    ).all()
    return [
        EstbanPorInstituicaoItem(
            nome_instituicao=r.nome_instituicao,
            qtd_agencias=r.qtd_agencias or 0,
            valor_operacoes_credito=r.valor_operacoes_credito or 0,
            valor_depositos_vista=r.valor_depositos_vista or 0,
            valor_poupanca=r.valor_poupanca or 0,
            valor_depositos_prazo=r.valor_depositos_prazo or 0,
            emprestimos_titulos_descontados=r.emprestimos_titulos_descontados,
            financiamentos_gerais=r.financiamentos_gerais,
            financiamento_agropecuario=r.financiamento_agropecuario,
            financiamentos_imobiliarios=r.financiamentos_imobiliarios,
            arrendamento_mercantil=r.arrendamento_mercantil,
            emprestimos_setor_publico=r.emprestimos_setor_publico,
            outros_creditos=r.outros_creditos,
        )
        for r in resultados
    ]


@router.get("/composicao_credito")
def composicao_credito(db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    """Credit breakdown by type over time (latest record per month)."""
    query = db.query(EstbanMensal)
    if current_user.role.nome != "ADMIN_GLOBAL":
        query = query.filter(EstbanMensal.municipio_id == current_user.municipio_id)
    registros = query.order_by(EstbanMensal.data_referencia).all()
    return [
        {
            "data_referencia": r.data_referencia,
            "emprestimos_titulos_descontados": r.emprestimos_titulos_descontados or 0,
            "financiamentos_gerais": r.financiamentos_gerais or 0,
            "financiamento_agropecuario": r.financiamento_agropecuario or 0,
            "financiamentos_imobiliarios": r.financiamentos_imobiliarios or 0,
            "arrendamento_mercantil": r.arrendamento_mercantil or 0,
            "emprestimos_setor_publico": r.emprestimos_setor_publico or 0,
            "outros_creditos": r.outros_creditos or 0,
        }
        for r in registros
    ]


@router.get("/comparativo")
def comparativo_estban(
    ano: int | None = None,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    from app.models.municipio import Municipio
    from sqlalchemy import extract

    query = (
        db.query(
            Municipio.nome.label("municipio"),
            Municipio.id.label("municipio_id"),
            func.sum(EstbanMensal.valor_operacoes_credito).label("credito_total"),
        )
        .join(EstbanMensal, EstbanMensal.municipio_id == Municipio.id)
    )
    if ano:
        query = query.filter(extract("year", EstbanMensal.data_referencia) == ano)
    resultados = (
        query.group_by(Municipio.nome, Municipio.id)
        .order_by(func.sum(EstbanMensal.valor_operacoes_credito).desc())
        .all()
    )
    return [
        {"municipio": r.municipio, "municipio_id": r.municipio_id, "credito_total": r.credito_total or 0}
        for r in resultados
    ]
