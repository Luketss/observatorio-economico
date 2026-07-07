from app.api.deps import get_db, municipio_scope
from app.schemas.fpm import AlertaFpm, FpmSerie
from app.services.fpm_service import calcular_alerta, montar_serie
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

# FPM é livre em todos os planos (decisão de produto): usa municipio_scope,
# não scoped_modulo — o alerta é o principal argumento de venda.
router = APIRouter(prefix="/fpm", tags=["FPM"])


@router.get("/alerta", response_model=AlertaFpm)
def alerta_fpm(
    mid: int | None = Depends(municipio_scope),
    db: Session = Depends(get_db),
):
    if mid is None:
        # ADMIN_GLOBAL sem município selecionado — front pede seleção.
        return AlertaFpm(disponivel=False, motivo="selecione_municipio")
    return AlertaFpm(**calcular_alerta(db, mid))


@router.get("/serie", response_model=FpmSerie)
def serie_fpm(
    mid: int | None = Depends(municipio_scope),
    db: Session = Depends(get_db),
):
    if mid is None:
        return FpmSerie()
    return FpmSerie(**montar_serie(db, mid))
