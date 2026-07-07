from app.api.deps import get_db, municipio_scope, scoped_modulo
from app.schemas.captacao_federal import CaptacaoDiagnostico, CaptacaoResumo, CaptacaoSerie
from app.services.captacao_federal_service import calcular_diagnostico, calcular_resumo
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

# Híbrido (decisão de produto): /resumo é livre (teaser no Painel do Prefeito);
# /diagnostico e /serie exigem o módulo "captacao_federal" no plano.
router = APIRouter(prefix="/captacao-federal", tags=["Captação Federal"])


@router.get("/resumo", response_model=CaptacaoResumo)
def resumo_captacao(
    mid: int | None = Depends(municipio_scope),
    db: Session = Depends(get_db),
):
    if mid is None:
        return CaptacaoResumo(disponivel=False, motivo="selecione_municipio")
    return CaptacaoResumo(**calcular_resumo(db, mid))


@router.get("/diagnostico", response_model=CaptacaoDiagnostico)
def diagnostico_captacao(
    mid: int | None = Depends(scoped_modulo("captacao_federal")),
    db: Session = Depends(get_db),
):
    if mid is None:
        return CaptacaoDiagnostico(disponivel=False, motivo="selecione_municipio")
    return CaptacaoDiagnostico(**calcular_diagnostico(db, mid))


@router.get("/serie", response_model=CaptacaoSerie)
def serie_captacao(
    mid: int | None = Depends(scoped_modulo("captacao_federal")),
    db: Session = Depends(get_db),
):
    if mid is None:
        return CaptacaoSerie()
    return CaptacaoSerie(serie=calcular_diagnostico(db, mid)["serie"])
