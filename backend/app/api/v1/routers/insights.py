import json
from datetime import datetime

from app.api.deps import get_current_user, get_db
from app.services.insights_service import buscar_insight, gerar_insight
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

router = APIRouter(prefix="/insights", tags=["Insights IA"])


class InsightResponse(BaseModel):
    id: int
    municipio_id: int
    dataset: str
    periodo: str
    bullets: list[str]
    modelo: str
    gerado_em: datetime

    model_config = {"from_attributes": True}


class GerarInsightRequest(BaseModel):
    dataset: str
    municipio_id: int | None = None


def _to_response(insight) -> InsightResponse:
    try:
        bullets = json.loads(insight.conteudo)
    except (json.JSONDecodeError, TypeError):
        bullets = [insight.conteudo]
    return InsightResponse(
        id=insight.id,
        municipio_id=insight.municipio_id,
        dataset=insight.dataset,
        periodo=insight.periodo,
        bullets=bullets,
        modelo=insight.modelo,
        gerado_em=insight.gerado_em,
    )


@router.get("", response_model=InsightResponse)
def get_insight(
    dataset: str = Query(...),
    periodo: str | None = Query(default=None),
    municipio_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    from app.models.insight_ia import InsightIA as InsightModel

    mid = municipio_id if (current_user.role.nome == "ADMIN_GLOBAL" and municipio_id) else current_user.municipio_id
    if not mid:
        raise HTTPException(status_code=400, detail="municipio_id é obrigatório para ADMIN_GLOBAL.")

    if periodo and periodo != "latest":
        insight = buscar_insight(db, mid, dataset, periodo)
    else:
        # Return the most recently generated insight for this dataset
        insight = (
            db.query(InsightModel)
            .filter(InsightModel.municipio_id == mid, InsightModel.dataset == dataset)
            .order_by(InsightModel.gerado_em.desc())
            .first()
        )

    if not insight:
        raise HTTPException(status_code=404, detail="Insight não encontrado. Use POST /gerar para criar.")

    return _to_response(insight)


@router.post("/gerar", response_model=InsightResponse)
def post_gerar_insight(
    body: GerarInsightRequest,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    if current_user.role.nome != "ADMIN_GLOBAL":
        raise HTTPException(status_code=403, detail="Apenas ADMIN_GLOBAL pode gerar insights.")

    if not body.municipio_id:
        raise HTTPException(status_code=400, detail="municipio_id é obrigatório.")

    insight = gerar_insight(db, body.municipio_id, body.dataset)
    return _to_response(insight)
