from typing import List

from app.api.deps import get_db, scoped_modulo
from app.models.caged import (
    CagedMovimentacao, CagedPorCnae, CagedPorEscolaridade, CagedPorFaixaEtaria,
    CagedPorRaca, CagedPorSexo, CagedPorTipoMovimentacao, CagedSalario,
    CagedPorTipoDeficiencia, CagedPorTamanhoEstabelecimento,
    CagedPorTipoEmpregador, CagedPorTipoEstabelecimento, CagedIndicadoresContrato,
)
from app.schemas.caged import (
    CagedCnaeItem,
    CagedEscolaridadeItem,
    CagedFaixaEtariaItem,
    CagedItem,
    CagedRacaItem,
    CagedResumo,
    CagedSalarioItem,
    CagedSexoItem,
    CagedTipoMovimentacaoItem,
    CagedTipoDeficienciaItem, CagedTamanhoEstabelecimentoItem,
    CagedTipoEmpregadorItem, CagedTipoEstabelecimentoItem,
    CagedIndicadoresContratoItem,
)
from fastapi import APIRouter, Depends, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

router = APIRouter(prefix="/caged", tags=["CAGED"])


@router.get("/serie", response_model=List[CagedItem])
def serie_caged(
    mid: int | None = Depends(scoped_modulo("caged")),
    db: Session = Depends(get_db),
):
    if mid is None:
        return []
    query = db.query(CagedMovimentacao).filter(CagedMovimentacao.municipio_id == mid)
    return query.order_by(CagedMovimentacao.ano, CagedMovimentacao.mes).all()


@router.get("/resumo", response_model=CagedResumo)
def resumo_caged(
    mid: int | None = Depends(scoped_modulo("caged")),
    db: Session = Depends(get_db),
):
    if mid is None:
        return CagedResumo(total_admissoes=0, total_desligamentos=0, saldo_total=0)

    query = db.query(
        func.sum(CagedMovimentacao.admissoes).label("total_admissoes"),
        func.sum(CagedMovimentacao.desligamentos).label("total_desligamentos"),
        func.sum(CagedMovimentacao.saldo).label("saldo_total"),
    ).filter(CagedMovimentacao.municipio_id == mid)
    resultado = query.one_or_none()

    if not resultado:
        return CagedResumo(total_admissoes=0, total_desligamentos=0, saldo_total=0)

    return CagedResumo(
        total_admissoes=resultado.total_admissoes or 0,
        total_desligamentos=resultado.total_desligamentos or 0,
        saldo_total=resultado.saldo_total or 0,
    )


@router.get("/por_sexo", response_model=List[CagedSexoItem])
def por_sexo(
    ano: int = Query(None),
    mid: int | None = Depends(scoped_modulo("caged")),
    db: Session = Depends(get_db),
):
    if mid is None:
        return []
    query = db.query(CagedPorSexo).filter(CagedPorSexo.municipio_id == mid)
    if ano:
        query = query.filter(CagedPorSexo.ano == ano)
    registros = query.order_by(CagedPorSexo.ano, CagedPorSexo.mes, CagedPorSexo.sexo).all()
    return [
        CagedSexoItem(
            ano=r.ano,
            mes=r.mes,
            sexo=r.sexo,
            admissoes=r.admissoes,
            desligamentos=r.desligamentos,
            saldo=r.saldo,
        )
        for r in registros
    ]


@router.get("/por_raca", response_model=List[CagedRacaItem])
def por_raca(
    ano: int = Query(None),
    mid: int | None = Depends(scoped_modulo("caged")),
    db: Session = Depends(get_db),
):
    if mid is None:
        return []
    query = db.query(CagedPorRaca).filter(CagedPorRaca.municipio_id == mid)
    if ano:
        query = query.filter(CagedPorRaca.ano == ano)
    registros = query.order_by(CagedPorRaca.ano, CagedPorRaca.mes, CagedPorRaca.raca_cor).all()
    return [
        CagedRacaItem(
            ano=r.ano,
            mes=r.mes,
            raca_cor=r.raca_cor,
            admissoes=r.admissoes,
            desligamentos=r.desligamentos,
            saldo=r.saldo,
        )
        for r in registros
    ]


@router.get("/salario", response_model=List[CagedSalarioItem])
def salario(
    ano: int = Query(None),
    mid: int | None = Depends(scoped_modulo("caged")),
    db: Session = Depends(get_db),
):
    if mid is None:
        return []
    query = db.query(CagedSalario).filter(CagedSalario.municipio_id == mid)
    if ano:
        query = query.filter(CagedSalario.ano == ano)
    registros = query.order_by(CagedSalario.ano, CagedSalario.mes).all()
    return [
        CagedSalarioItem(
            ano=r.ano,
            mes=r.mes,
            salario_medio_admissoes=r.salario_medio_admissoes,
            salario_medio_desligamentos=r.salario_medio_desligamentos,
        )
        for r in registros
    ]


@router.get("/por_cnae", response_model=List[CagedCnaeItem])
def por_cnae(
    ano: int = Query(None),
    mid: int | None = Depends(scoped_modulo("caged")),
    db: Session = Depends(get_db),
):
    if mid is None:
        return []
    query = db.query(CagedPorCnae).filter(CagedPorCnae.municipio_id == mid)
    if ano:
        query = query.filter(CagedPorCnae.ano == ano)
    registros = query.order_by(CagedPorCnae.ano, CagedPorCnae.mes, CagedPorCnae.secao).all()
    return [
        CagedCnaeItem(
            ano=r.ano,
            mes=r.mes,
            secao=r.secao,
            descricao_secao=r.descricao_secao,
            admissoes=r.admissoes,
            desligamentos=r.desligamentos,
            saldo=r.saldo,
        )
        for r in registros
    ]


@router.get("/por_escolaridade", response_model=List[CagedEscolaridadeItem])
def por_escolaridade(
    ano: int = Query(None),
    mid: int | None = Depends(scoped_modulo("caged")),
    db: Session = Depends(get_db),
):
    if mid is None:
        return []
    query = db.query(CagedPorEscolaridade).filter(CagedPorEscolaridade.municipio_id == mid)
    if ano:
        query = query.filter(CagedPorEscolaridade.ano == ano)
    registros = query.order_by(CagedPorEscolaridade.ano, CagedPorEscolaridade.mes, CagedPorEscolaridade.grau_instrucao).all()
    return [
        CagedEscolaridadeItem(
            ano=r.ano,
            mes=r.mes,
            grau_instrucao=r.grau_instrucao,
            admissoes=r.admissoes,
            desligamentos=r.desligamentos,
            saldo=r.saldo,
        )
        for r in registros
    ]


@router.get("/por_faixa_etaria", response_model=List[CagedFaixaEtariaItem])
def por_faixa_etaria(
    ano: int = Query(None),
    mid: int | None = Depends(scoped_modulo("caged")),
    db: Session = Depends(get_db),
):
    if mid is None:
        return []
    query = db.query(CagedPorFaixaEtaria).filter(CagedPorFaixaEtaria.municipio_id == mid)
    if ano:
        query = query.filter(CagedPorFaixaEtaria.ano == ano)
    registros = query.order_by(CagedPorFaixaEtaria.ano, CagedPorFaixaEtaria.mes, CagedPorFaixaEtaria.faixa_etaria).all()
    return [
        CagedFaixaEtariaItem(
            ano=r.ano,
            mes=r.mes,
            faixa_etaria=r.faixa_etaria,
            admissoes=r.admissoes,
            desligamentos=r.desligamentos,
            saldo=r.saldo,
        )
        for r in registros
    ]


@router.get("/por_tipo_movimentacao", response_model=List[CagedTipoMovimentacaoItem])
def por_tipo_movimentacao(
    ano: int = Query(None),
    mid: int | None = Depends(scoped_modulo("caged")),
    db: Session = Depends(get_db),
):
    if mid is None:
        return []
    query = db.query(CagedPorTipoMovimentacao).filter(CagedPorTipoMovimentacao.municipio_id == mid)
    if ano:
        query = query.filter(CagedPorTipoMovimentacao.ano == ano)
    registros = query.order_by(CagedPorTipoMovimentacao.ano, CagedPorTipoMovimentacao.mes, CagedPorTipoMovimentacao.tipo_movimentacao).all()
    return [
        CagedTipoMovimentacaoItem(
            ano=r.ano,
            mes=r.mes,
            tipo_movimentacao=r.tipo_movimentacao,
            admissoes=r.admissoes,
            desligamentos=r.desligamentos,
            saldo=r.saldo,
        )
        for r in registros
    ]


# ──────────────────────────────────────────────────────────────────
# New endpoints (added 2026-05) — surface previously-dropped CSV columns
# ──────────────────────────────────────────────────────────────────

@router.get("/por_tipo_deficiencia", response_model=List[CagedTipoDeficienciaItem])
def por_tipo_deficiencia(
    ano: int = Query(None),
    mid: int | None = Depends(scoped_modulo("caged")),
    db: Session = Depends(get_db),
):
    """Movimentações de PCD por tipo de deficiência."""
    if mid is None:
        return []
    query = db.query(CagedPorTipoDeficiencia).filter(CagedPorTipoDeficiencia.municipio_id == mid)
    if ano:
        query = query.filter(CagedPorTipoDeficiencia.ano == ano)
    registros = query.order_by(
        CagedPorTipoDeficiencia.ano, CagedPorTipoDeficiencia.mes, CagedPorTipoDeficiencia.tipo_deficiencia,
    ).all()
    return [
        CagedTipoDeficienciaItem(
            ano=r.ano, mes=r.mes, tipo_deficiencia=r.tipo_deficiencia,
            admissoes=r.admissoes, desligamentos=r.desligamentos, saldo=r.saldo,
        )
        for r in registros
    ]


@router.get("/por_tamanho_estabelecimento", response_model=List[CagedTamanhoEstabelecimentoItem])
def por_tamanho_estabelecimento(
    ano: int = Query(None),
    mid: int | None = Depends(scoped_modulo("caged")),
    db: Session = Depends(get_db),
):
    """Movimentações por tamanho do estabelecimento (em janeiro)."""
    if mid is None:
        return []
    query = db.query(CagedPorTamanhoEstabelecimento).filter(CagedPorTamanhoEstabelecimento.municipio_id == mid)
    if ano:
        query = query.filter(CagedPorTamanhoEstabelecimento.ano == ano)
    registros = query.order_by(
        CagedPorTamanhoEstabelecimento.ano, CagedPorTamanhoEstabelecimento.mes,
    ).all()
    return [
        CagedTamanhoEstabelecimentoItem(
            ano=r.ano, mes=r.mes, tamanho=r.tamanho,
            admissoes=r.admissoes, desligamentos=r.desligamentos, saldo=r.saldo,
        )
        for r in registros
    ]


@router.get("/por_tipo_empregador", response_model=List[CagedTipoEmpregadorItem])
def por_tipo_empregador(
    ano: int = Query(None),
    mid: int | None = Depends(scoped_modulo("caged")),
    db: Session = Depends(get_db),
):
    """Movimentações por tipo de empregador (CNPJ, CPF, particular, rural CEI...)."""
    if mid is None:
        return []
    query = db.query(CagedPorTipoEmpregador).filter(CagedPorTipoEmpregador.municipio_id == mid)
    if ano:
        query = query.filter(CagedPorTipoEmpregador.ano == ano)
    registros = query.order_by(
        CagedPorTipoEmpregador.ano, CagedPorTipoEmpregador.mes,
    ).all()
    return [
        CagedTipoEmpregadorItem(
            ano=r.ano, mes=r.mes, tipo_empregador=r.tipo_empregador,
            admissoes=r.admissoes, desligamentos=r.desligamentos, saldo=r.saldo,
        )
        for r in registros
    ]


@router.get("/por_tipo_estabelecimento", response_model=List[CagedTipoEstabelecimentoItem])
def por_tipo_estabelecimento(
    ano: int = Query(None),
    mid: int | None = Depends(scoped_modulo("caged")),
    db: Session = Depends(get_db),
):
    """Movimentações por tipo de estabelecimento (privado, público, doméstico...)."""
    if mid is None:
        return []
    query = db.query(CagedPorTipoEstabelecimento).filter(CagedPorTipoEstabelecimento.municipio_id == mid)
    if ano:
        query = query.filter(CagedPorTipoEstabelecimento.ano == ano)
    registros = query.order_by(
        CagedPorTipoEstabelecimento.ano, CagedPorTipoEstabelecimento.mes,
    ).all()
    return [
        CagedTipoEstabelecimentoItem(
            ano=r.ano, mes=r.mes, tipo_estabelecimento=r.tipo_estabelecimento,
            admissoes=r.admissoes, desligamentos=r.desligamentos, saldo=r.saldo,
        )
        for r in registros
    ]


@router.get("/indicadores_contrato", response_model=List[CagedIndicadoresContratoItem])
def indicadores_contrato(
    mid: int | None = Depends(scoped_modulo("caged")),
    db: Session = Depends(get_db),
):
    """Annual contract-quality counts: parcial, intermitente, aprendiz, PCD, fora-do-prazo."""
    if mid is None:
        return []
    query = db.query(CagedIndicadoresContrato).filter(CagedIndicadoresContrato.municipio_id == mid)
    registros = query.order_by(CagedIndicadoresContrato.ano).all()
    return [
        CagedIndicadoresContratoItem(
            ano=r.ano,
            total_movimentacoes=r.total_movimentacoes,
            total_parcial=r.total_parcial,
            total_intermitente=r.total_intermitente,
            total_aprendiz=r.total_aprendiz,
            total_pcd=r.total_pcd,
            total_fora_prazo=r.total_fora_prazo,
        )
        for r in registros
    ]
