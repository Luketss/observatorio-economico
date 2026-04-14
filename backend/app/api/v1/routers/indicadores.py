from datetime import datetime, timezone

from app.api.deps import get_current_user, get_db, require_role
from app.models.indicador_info import IndicadorInfo
from app.schemas.indicador_info import IndicadorInfoOut, IndicadorInfoUpdate
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

router = APIRouter(prefix="/indicadores", tags=["Indicadores"])


# ==============================
# Get indicator info (any authenticated user)
# ==============================
@router.get("", response_model=IndicadorInfoOut)
def get_indicador(
    dataset: str,
    indicador_key: str,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    info = (
        db.query(IndicadorInfo)
        .filter(
            IndicadorInfo.dataset == dataset,
            IndicadorInfo.indicador_key == indicador_key,
        )
        .first()
    )

    if not info:
        # Return empty — never 404, component handles empty state gracefully
        return IndicadorInfoOut(
            dataset=dataset,
            indicador_key=indicador_key,
            tooltip="",
            descricao="",
            fonte=None,
            atualizado_em=None,
        )

    return IndicadorInfoOut(
        dataset=info.dataset,
        indicador_key=info.indicador_key,
        tooltip=info.tooltip,
        descricao=info.descricao,
        fonte=info.fonte,
        atualizado_em=info.atualizado_em,
    )


# ==============================
# Upsert indicator info (ADMIN_GLOBAL only)
# ==============================
@router.put("/{dataset}/{indicador_key}", response_model=IndicadorInfoOut)
def upsert_indicador(
    dataset: str,
    indicador_key: str,
    data: IndicadorInfoUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(require_role("ADMIN_GLOBAL")),
):
    info = (
        db.query(IndicadorInfo)
        .filter(
            IndicadorInfo.dataset == dataset,
            IndicadorInfo.indicador_key == indicador_key,
        )
        .first()
    )

    now = datetime.now(timezone.utc)

    if not info:
        info = IndicadorInfo(
            dataset=dataset,
            indicador_key=indicador_key,
            tooltip=data.tooltip,
            descricao=data.descricao,
            fonte=data.fonte,
            atualizado_em=now,
        )
        db.add(info)
    else:
        info.tooltip = data.tooltip
        info.descricao = data.descricao
        info.fonte = data.fonte
        info.atualizado_em = now

    db.commit()
    db.refresh(info)

    return IndicadorInfoOut(
        dataset=info.dataset,
        indicador_key=info.indicador_key,
        tooltip=info.tooltip,
        descricao=info.descricao,
        fonte=info.fonte,
        atualizado_em=info.atualizado_em,
    )
