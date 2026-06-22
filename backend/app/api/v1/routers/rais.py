from typing import List

from app.api.deps import get_db, scoped_modulo
from app.models.rais import (
    RaisVinculo, RaisPorCnae, RaisPorRaca, RaisPorSexo,
    RaisPorFaixaEtaria, RaisPorEscolaridade, RaisPorFaixaRemuneracao,
    RaisPorFaixaTempoEmprego, RaisMetricasAnuais,
    RaisPorMotivoDesligamento, RaisPorTipoAdmissao, RaisPorCbo,
    RaisPorTamanhoEstabelecimento, RaisPorNaturezaJuridica, RaisTurnoverMensal,
)
from app.schemas.rais import (
    RaisCnaeItem, RaisItem, RaisRacaItem, RaisResumo, RaisSexoItem,
    RaisFaixaEtariaItem, RaisEscolaridadeItem, RaisFaixaRemuneracaoItem,
    RaisFaixaTempoEmpregoItem, RaisMetricasAnuaisItem,
    RaisMotivoDesligamentoItem, RaisTipoAdmissaoItem, RaisCboItem,
    RaisTamanhoEstabelecimentoItem, RaisNaturezaJuridicaItem, RaisTurnoverMensalItem,
)
from fastapi import APIRouter, Depends, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

router = APIRouter(prefix="/rais", tags=["RAIS"])


@router.get("/serie", response_model=List[RaisItem])
def serie_rais(
    mid: int | None = Depends(scoped_modulo("rais")),
    db: Session = Depends(get_db),
):
    if mid is None:
        return []
    registros = (
        db.query(RaisVinculo)
        .filter(RaisVinculo.municipio_id == mid)
        .order_by(RaisVinculo.ano)
        .all()
    )
    return [
        RaisItem(
            ano=r.ano,
            total_vinculos=r.total_vinculos,
            remuneracao_media=r.remuneracao_media,
        )
        for r in registros
    ]


@router.get("/resumo", response_model=RaisResumo)
def resumo_rais(
    mid: int | None = Depends(scoped_modulo("rais")),
    db: Session = Depends(get_db),
):
    if mid is None:
        return RaisResumo(total_vinculos=0, remuneracao_media=None)
    row = (
        db.query(
            func.coalesce(func.sum(RaisVinculo.total_vinculos), 0),
            func.avg(RaisVinculo.remuneracao_media),  # AVG ignora NULLs
        )
        .filter(RaisVinculo.municipio_id == mid)
        .one()
    )
    return RaisResumo(
        total_vinculos=int(row[0] or 0),
        remuneracao_media=float(row[1]) if row[1] is not None else None,
    )


@router.get("/por_sexo", response_model=List[RaisSexoItem])
def por_sexo(
    ano: int = Query(None),
    mid: int | None = Depends(scoped_modulo("rais")),
    db: Session = Depends(get_db),
):
    if mid is None:
        return []
    query = db.query(RaisPorSexo).filter(RaisPorSexo.municipio_id == mid)
    if ano:
        query = query.filter(RaisPorSexo.ano == ano)
    registros = query.order_by(RaisPorSexo.ano, RaisPorSexo.sexo).all()
    return [
        RaisSexoItem(
            ano=r.ano,
            sexo=r.sexo,
            total_vinculos=r.total_vinculos,
            remuneracao_media=r.remuneracao_media,
        )
        for r in registros
    ]


@router.get("/por_raca", response_model=List[RaisRacaItem])
def por_raca(
    ano: int = Query(None),
    mid: int | None = Depends(scoped_modulo("rais")),
    db: Session = Depends(get_db),
):
    if mid is None:
        return []
    query = db.query(RaisPorRaca).filter(RaisPorRaca.municipio_id == mid)
    if ano:
        query = query.filter(RaisPorRaca.ano == ano)
    registros = query.order_by(RaisPorRaca.ano, RaisPorRaca.raca_cor).all()
    return [
        RaisRacaItem(
            ano=r.ano,
            raca_cor=r.raca_cor,
            total_vinculos=r.total_vinculos,
            remuneracao_media=r.remuneracao_media,
        )
        for r in registros
    ]


@router.get("/por_cnae", response_model=List[RaisCnaeItem])
def por_cnae(
    ano: int = Query(None),
    mid: int | None = Depends(scoped_modulo("rais")),
    db: Session = Depends(get_db),
):
    if mid is None:
        return []
    query = db.query(RaisPorCnae).filter(RaisPorCnae.municipio_id == mid)
    if ano:
        query = query.filter(RaisPorCnae.ano == ano)
    registros = query.order_by(RaisPorCnae.ano, RaisPorCnae.secao).all()
    return [
        RaisCnaeItem(
            ano=r.ano,
            secao=r.secao,
            descricao_secao=r.descricao_secao,
            total_vinculos=r.total_vinculos,
            remuneracao_media=r.remuneracao_media,
        )
        for r in registros
    ]


@router.get("/por_faixa_etaria", response_model=List[RaisFaixaEtariaItem])
def por_faixa_etaria(
    ano: int = Query(None),
    mid: int | None = Depends(scoped_modulo("rais")),
    db: Session = Depends(get_db),
):
    if mid is None:
        return []
    query = db.query(RaisPorFaixaEtaria).filter(RaisPorFaixaEtaria.municipio_id == mid)
    if ano:
        query = query.filter(RaisPorFaixaEtaria.ano == ano)
    registros = query.order_by(RaisPorFaixaEtaria.ano, RaisPorFaixaEtaria.faixa_etaria).all()
    return [
        RaisFaixaEtariaItem(
            ano=r.ano,
            faixa_etaria=r.faixa_etaria,
            total_vinculos=r.total_vinculos,
            remuneracao_media=r.remuneracao_media,
        )
        for r in registros
    ]


@router.get("/por_escolaridade", response_model=List[RaisEscolaridadeItem])
def por_escolaridade(
    ano: int = Query(None),
    mid: int | None = Depends(scoped_modulo("rais")),
    db: Session = Depends(get_db),
):
    if mid is None:
        return []
    query = db.query(RaisPorEscolaridade).filter(RaisPorEscolaridade.municipio_id == mid)
    if ano:
        query = query.filter(RaisPorEscolaridade.ano == ano)
    registros = query.order_by(RaisPorEscolaridade.ano, RaisPorEscolaridade.grau_instrucao).all()
    return [
        RaisEscolaridadeItem(
            ano=r.ano,
            grau_instrucao=r.grau_instrucao,
            total_vinculos=r.total_vinculos,
            remuneracao_media=r.remuneracao_media,
        )
        for r in registros
    ]


@router.get("/por_faixa_remuneracao", response_model=List[RaisFaixaRemuneracaoItem])
def por_faixa_remuneracao(
    ano: int = Query(None),
    mid: int | None = Depends(scoped_modulo("rais")),
    db: Session = Depends(get_db),
):
    if mid is None:
        return []
    query = db.query(RaisPorFaixaRemuneracao).filter(RaisPorFaixaRemuneracao.municipio_id == mid)
    if ano:
        query = query.filter(RaisPorFaixaRemuneracao.ano == ano)
    registros = query.order_by(RaisPorFaixaRemuneracao.ano, RaisPorFaixaRemuneracao.faixa_remuneracao_sm).all()
    return [
        RaisFaixaRemuneracaoItem(
            ano=r.ano,
            faixa_remuneracao_sm=r.faixa_remuneracao_sm,
            total_vinculos=r.total_vinculos,
        )
        for r in registros
    ]


@router.get("/por_faixa_tempo_emprego", response_model=List[RaisFaixaTempoEmpregoItem])
def por_faixa_tempo_emprego(
    ano: int = Query(None),
    mid: int | None = Depends(scoped_modulo("rais")),
    db: Session = Depends(get_db),
):
    if mid is None:
        return []
    query = db.query(RaisPorFaixaTempoEmprego).filter(RaisPorFaixaTempoEmprego.municipio_id == mid)
    if ano:
        query = query.filter(RaisPorFaixaTempoEmprego.ano == ano)
    registros = query.order_by(RaisPorFaixaTempoEmprego.ano, RaisPorFaixaTempoEmprego.faixa_tempo_emprego).all()
    return [
        RaisFaixaTempoEmpregoItem(
            ano=r.ano,
            faixa_tempo_emprego=r.faixa_tempo_emprego,
            total_vinculos=r.total_vinculos,
        )
        for r in registros
    ]


@router.get("/metricas_anuais", response_model=List[RaisMetricasAnuaisItem])
def metricas_anuais(
    mid: int | None = Depends(scoped_modulo("rais")),
    db: Session = Depends(get_db),
):
    if mid is None:
        return []
    registros = (
        db.query(RaisMetricasAnuais)
        .filter(RaisMetricasAnuais.municipio_id == mid)
        .order_by(RaisMetricasAnuais.ano)
        .all()
    )
    return [
        RaisMetricasAnuaisItem(
            ano=r.ano,
            total_vinculos=r.total_vinculos,
            total_pcd=r.total_pcd,
            total_outro_municipio=r.total_outro_municipio,
            media_dias_afastamento=r.media_dias_afastamento,
            total_ativo_dezembro=r.total_ativo_dezembro,
            total_parcial=r.total_parcial,
            total_intermitente=r.total_intermitente,
            total_simples=r.total_simples,
            total_aprendiz_estimado=r.total_aprendiz_estimado,
        )
        for r in registros
    ]


# ──────────────────────────────────────────────────────────────────
# New endpoints (added 2026-05) — surface previously-dropped CSV columns
# ──────────────────────────────────────────────────────────────────

@router.get("/por_motivo_desligamento", response_model=List[RaisMotivoDesligamentoItem])
def por_motivo_desligamento(
    ano: int = Query(None),
    mid: int | None = Depends(scoped_modulo("rais")),
    db: Session = Depends(get_db),
):
    """Why people leave — counts only rows where mes_desligamento > 0 in the year."""
    if mid is None:
        return []
    query = db.query(RaisPorMotivoDesligamento).filter(RaisPorMotivoDesligamento.municipio_id == mid)
    if ano:
        query = query.filter(RaisPorMotivoDesligamento.ano == ano)
    registros = query.order_by(
        RaisPorMotivoDesligamento.ano,
        RaisPorMotivoDesligamento.total_desligamentos.desc(),
    ).all()
    return [
        RaisMotivoDesligamentoItem(ano=r.ano, motivo=r.motivo, total_desligamentos=r.total_desligamentos)
        for r in registros
    ]


@router.get("/por_tipo_admissao", response_model=List[RaisTipoAdmissaoItem])
def por_tipo_admissao(
    ano: int = Query(None),
    mid: int | None = Depends(scoped_modulo("rais")),
    db: Session = Depends(get_db),
):
    """How people are hired (primeiro emprego, reemprego, transferência, etc.)."""
    if mid is None:
        return []
    query = db.query(RaisPorTipoAdmissao).filter(RaisPorTipoAdmissao.municipio_id == mid)
    if ano:
        query = query.filter(RaisPorTipoAdmissao.ano == ano)
    registros = query.order_by(
        RaisPorTipoAdmissao.ano,
        RaisPorTipoAdmissao.total_admissoes.desc(),
    ).all()
    return [
        RaisTipoAdmissaoItem(ano=r.ano, tipo=r.tipo, total_admissoes=r.total_admissoes)
        for r in registros
    ]


@router.get("/por_cbo", response_model=List[RaisCboItem])
def por_cbo(
    ano: int = Query(None),
    limite: int = Query(20, ge=1, le=100),
    mid: int | None = Depends(scoped_modulo("rais")),
    db: Session = Depends(get_db),
):
    """Top occupations by CBO 2002 family code."""
    if mid is None:
        return []
    query = db.query(RaisPorCbo).filter(RaisPorCbo.municipio_id == mid)
    if ano:
        query = query.filter(RaisPorCbo.ano == ano)
    registros = query.order_by(RaisPorCbo.ano, RaisPorCbo.total_vinculos.desc()).limit(limite).all()
    return [
        RaisCboItem(
            ano=r.ano, cbo_familia=r.cbo_familia, descricao=r.descricao,
            total_vinculos=r.total_vinculos, remuneracao_media=r.remuneracao_media,
        )
        for r in registros
    ]


@router.get("/por_tamanho_estabelecimento", response_model=List[RaisTamanhoEstabelecimentoItem])
def por_tamanho_estabelecimento(
    ano: int = Query(None),
    mid: int | None = Depends(scoped_modulo("rais")),
    db: Session = Depends(get_db),
):
    """Workforce share by establishment size band."""
    if mid is None:
        return []
    query = db.query(RaisPorTamanhoEstabelecimento).filter(RaisPorTamanhoEstabelecimento.municipio_id == mid)
    if ano:
        query = query.filter(RaisPorTamanhoEstabelecimento.ano == ano)
    registros = query.order_by(RaisPorTamanhoEstabelecimento.ano, RaisPorTamanhoEstabelecimento.tamanho).all()
    return [
        RaisTamanhoEstabelecimentoItem(
            ano=r.ano, tamanho=r.tamanho,
            total_vinculos=r.total_vinculos, remuneracao_media=r.remuneracao_media,
        )
        for r in registros
    ]


@router.get("/por_natureza_juridica", response_model=List[RaisNaturezaJuridicaItem])
def por_natureza_juridica(
    ano: int = Query(None),
    mid: int | None = Depends(scoped_modulo("rais")),
    db: Session = Depends(get_db),
):
    """Public / private / nonprofit composition of the formal workforce."""
    if mid is None:
        return []
    query = db.query(RaisPorNaturezaJuridica).filter(RaisPorNaturezaJuridica.municipio_id == mid)
    if ano:
        query = query.filter(RaisPorNaturezaJuridica.ano == ano)
    registros = query.order_by(RaisPorNaturezaJuridica.ano, RaisPorNaturezaJuridica.total_vinculos.desc()).all()
    return [
        RaisNaturezaJuridicaItem(ano=r.ano, grupo=r.grupo, total_vinculos=r.total_vinculos)
        for r in registros
    ]


@router.get("/turnover_mensal", response_model=List[RaisTurnoverMensalItem])
def turnover_mensal(
    ano: int = Query(None),
    mid: int | None = Depends(scoped_modulo("rais")),
    db: Session = Depends(get_db),
):
    """Monthly admissions vs desligamentos derived from mes_admissao / mes_desligamento."""
    if mid is None:
        return []
    query = db.query(RaisTurnoverMensal).filter(RaisTurnoverMensal.municipio_id == mid)
    if ano:
        query = query.filter(RaisTurnoverMensal.ano == ano)
    registros = query.order_by(RaisTurnoverMensal.ano, RaisTurnoverMensal.mes).all()
    return [
        RaisTurnoverMensalItem(
            ano=r.ano, mes=r.mes,
            total_admissoes=r.total_admissoes, total_desligamentos=r.total_desligamentos,
        )
        for r in registros
    ]
