from typing import List

from app.api.deps import get_current_user, get_db
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
from sqlalchemy.orm import Session

router = APIRouter(prefix="/rais", tags=["RAIS"])


def _municipio_filter(query, model, current_user):
    if current_user.role.nome != "ADMIN_GLOBAL":
        query = query.filter(model.municipio_id == current_user.municipio_id)
    return query


@router.get("/serie", response_model=List[RaisItem])
def serie_rais(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    query = _municipio_filter(db.query(RaisVinculo), RaisVinculo, current_user)
    registros = query.order_by(RaisVinculo.ano).all()
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
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    query = _municipio_filter(db.query(RaisVinculo), RaisVinculo, current_user)
    registros = query.all()
    total = sum(r.total_vinculos for r in registros)
    rem_lista = [r.remuneracao_media for r in registros if r.remuneracao_media]
    rem_media = sum(rem_lista) / len(rem_lista) if rem_lista else None
    return RaisResumo(total_vinculos=total, remuneracao_media=rem_media)


@router.get("/por_sexo", response_model=List[RaisSexoItem])
def por_sexo(
    ano: int = Query(None),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    query = _municipio_filter(db.query(RaisPorSexo), RaisPorSexo, current_user)
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
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    query = _municipio_filter(db.query(RaisPorRaca), RaisPorRaca, current_user)
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
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    query = _municipio_filter(db.query(RaisPorCnae), RaisPorCnae, current_user)
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
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    query = _municipio_filter(db.query(RaisPorFaixaEtaria), RaisPorFaixaEtaria, current_user)
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
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    query = _municipio_filter(db.query(RaisPorEscolaridade), RaisPorEscolaridade, current_user)
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
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    query = _municipio_filter(db.query(RaisPorFaixaRemuneracao), RaisPorFaixaRemuneracao, current_user)
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
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    query = _municipio_filter(db.query(RaisPorFaixaTempoEmprego), RaisPorFaixaTempoEmprego, current_user)
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
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    query = _municipio_filter(db.query(RaisMetricasAnuais), RaisMetricasAnuais, current_user)
    registros = query.order_by(RaisMetricasAnuais.ano).all()
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
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Why people leave — counts only rows where mes_desligamento > 0 in the year."""
    query = _municipio_filter(db.query(RaisPorMotivoDesligamento), RaisPorMotivoDesligamento, current_user)
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
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """How people are hired (primeiro emprego, reemprego, transferência, etc.)."""
    query = _municipio_filter(db.query(RaisPorTipoAdmissao), RaisPorTipoAdmissao, current_user)
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
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Top occupations by CBO 2002 family code."""
    query = _municipio_filter(db.query(RaisPorCbo), RaisPorCbo, current_user)
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
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Workforce share by establishment size band."""
    query = _municipio_filter(db.query(RaisPorTamanhoEstabelecimento), RaisPorTamanhoEstabelecimento, current_user)
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
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Public / private / nonprofit composition of the formal workforce."""
    query = _municipio_filter(db.query(RaisPorNaturezaJuridica), RaisPorNaturezaJuridica, current_user)
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
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Monthly admissions vs desligamentos derived from mes_admissao / mes_desligamento."""
    query = _municipio_filter(db.query(RaisTurnoverMensal), RaisTurnoverMensal, current_user)
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
