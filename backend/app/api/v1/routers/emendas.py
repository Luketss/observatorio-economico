from app.api.deps import get_db, municipio_scope, scoped_modulo
from app.schemas.emendas import EmendasRadar, EmendasResumo
from app.services.emendas_service import calcular_resumo_emendas, montar_radar
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

# Híbrido (decisão de produto): /resumo é livre (teaser no Painel do Prefeito);
# /radar exige o módulo "emendas" no plano.
router = APIRouter(prefix="/emendas", tags=["Emendas Parlamentares"])


@router.get("/resumo", response_model=EmendasResumo)
def resumo_emendas(
    mid: int | None = Depends(municipio_scope),
    db: Session = Depends(get_db),
):
    if mid is None:
        return EmendasResumo(disponivel=False, motivo="selecione_municipio")
    return EmendasResumo(**calcular_resumo_emendas(db, mid))


@router.get("/radar", response_model=EmendasRadar)
def radar_emendas(
    ano: int | None = Query(default=None),
    mid: int | None = Depends(scoped_modulo("emendas")),
    db: Session = Depends(get_db),
):
    if mid is None:
        return EmendasRadar(disponivel=False, motivo="selecione_municipio")
    return EmendasRadar(**montar_radar(db, mid, ano))
