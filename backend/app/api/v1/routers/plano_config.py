import json

from app.api.deps import get_current_user, get_db, require_role
from app.models.plano_config import PlanoConfig
from app.schemas.plano_config import PlanoConfigOut, PlanoConfigUpdate
from fastapi import APIRouter, Depends, HTTPException

from sqlalchemy.orm import Session

router = APIRouter(prefix="/plano-config", tags=["Plano Config"])

PLANOS_VALIDOS = {"free", "paid"}


@router.get("", response_model=PlanoConfigOut)
def get_plano_config(
    plano: str,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    if plano not in PLANOS_VALIDOS:
        raise HTTPException(status_code=400, detail="Plano inválido. Use 'free' ou 'paid'.")

    config = db.query(PlanoConfig).filter(PlanoConfig.plano == plano).first()
    if not config:
        # fallback: all modules
        return PlanoConfigOut(plano=plano, modulos=[])

    return PlanoConfigOut(plano=config.plano, modulos=json.loads(config.modulos))


@router.put("/{plano}", response_model=PlanoConfigOut)
def atualizar_plano_config(
    plano: str,
    data: PlanoConfigUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(require_role("ADMIN_GLOBAL")),
):
    if plano not in PLANOS_VALIDOS:
        raise HTTPException(status_code=400, detail="Plano inválido. Use 'free' ou 'paid'.")

    config = db.query(PlanoConfig).filter(PlanoConfig.plano == plano).first()
    if not config:
        config = PlanoConfig(plano=plano, modulos=json.dumps(data.modulos))
        db.add(config)
    else:
        config.modulos = json.dumps(data.modulos, ensure_ascii=False)

    db.commit()
    db.refresh(config)
    return PlanoConfigOut(plano=config.plano, modulos=json.loads(config.modulos))
