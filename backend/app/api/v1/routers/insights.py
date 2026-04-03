import json
from datetime import datetime
from typing import List

from app.api.deps import get_current_user, get_db
from app.models.insight_ia import InsightIA as InsightModel
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
    ativo: bool
    oculto_planos: list[str]

    model_config = {"from_attributes": True}


class GerarInsightRequest(BaseModel):
    dataset: str
    municipio_id: int | None = None


class InsightUpdateRequest(BaseModel):
    ativo: bool | None = None
    oculto_planos: list[str] | None = None


def _parse_oculto_planos(insight) -> list[str]:
    if not insight.oculto_planos:
        return []
    try:
        return json.loads(insight.oculto_planos)
    except (json.JSONDecodeError, TypeError):
        return []


def _to_response(insight) -> InsightResponse:
    try:
        bullets = json.loads(insight.conteudo)
    except (json.JSONDecodeError, TypeError):
        bullets = [insight.conteudo]

    # Handle case where Claude returned a code-fenced JSON stored as a single string
    if isinstance(bullets, list) and len(bullets) == 1 and isinstance(bullets[0], str):
        candidate = bullets[0].strip()
        if candidate.startswith("["):
            try:
                parsed = json.loads(candidate)
                if isinstance(parsed, list):
                    bullets = parsed
            except json.JSONDecodeError:
                pass

    return InsightResponse(
        id=insight.id,
        municipio_id=insight.municipio_id,
        dataset=insight.dataset,
        periodo=insight.periodo,
        bullets=bullets,
        modelo=insight.modelo,
        gerado_em=insight.gerado_em,
        ativo=insight.ativo,
        oculto_planos=_parse_oculto_planos(insight),
    )


@router.get("", response_model=InsightResponse)
def get_insight(
    dataset: str = Query(...),
    periodo: str | None = Query(default=None),
    municipio_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    is_global = current_user.role.nome == "ADMIN_GLOBAL"
    mid = municipio_id if (is_global and municipio_id) else current_user.municipio_id
    if not mid:
        raise HTTPException(status_code=400, detail="municipio_id é obrigatório para ADMIN_GLOBAL.")

    q = db.query(InsightModel).filter(
        InsightModel.municipio_id == mid,
        InsightModel.dataset == dataset,
    )

    if periodo and periodo != "latest":
        q = q.filter(InsightModel.periodo == periodo)

    # Non-admins only see active insights
    if not is_global:
        q = q.filter(InsightModel.ativo == True)

        # Also check plan-based visibility
        from app.models.municipio import Municipio
        municipio = db.get(Municipio, mid)
        if municipio and municipio.plano == "free":
            # Exclude insights hidden from free plan
            # oculto_planos is NULL or does not contain "free"
            from sqlalchemy import or_, not_
            q = q.filter(
                or_(
                    InsightModel.oculto_planos.is_(None),
                    not_(InsightModel.oculto_planos.contains("free")),
                )
            )

    insight = q.order_by(InsightModel.gerado_em.desc()).first()

    if not insight:
        raise HTTPException(status_code=404, detail="Insight não encontrado.")

    return _to_response(insight)


@router.get("/admin", response_model=List[InsightResponse])
def listar_insights_admin(
    municipio_id: int = Query(...),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Returns all insights (including inactive) for a municipality. ADMIN_GLOBAL only."""
    if current_user.role.nome != "ADMIN_GLOBAL":
        raise HTTPException(status_code=403, detail="Acesso negado.")

    rows = (
        db.query(InsightModel)
        .filter(InsightModel.municipio_id == municipio_id)
        .order_by(InsightModel.dataset, InsightModel.gerado_em.desc())
        .all()
    )

    # Return only the latest per dataset
    seen = set()
    result = []
    for row in rows:
        if row.dataset not in seen:
            seen.add(row.dataset)
            result.append(_to_response(row))

    return result


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


@router.patch("/{insight_id}", response_model=InsightResponse)
def atualizar_insight(
    insight_id: int,
    body: InsightUpdateRequest,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    if current_user.role.nome != "ADMIN_GLOBAL":
        raise HTTPException(status_code=403, detail="Acesso negado.")

    insight = db.get(InsightModel, insight_id)
    if not insight:
        raise HTTPException(status_code=404, detail="Insight não encontrado.")

    if body.ativo is not None:
        insight.ativo = body.ativo

    if body.oculto_planos is not None:
        insight.oculto_planos = json.dumps(body.oculto_planos) if body.oculto_planos else None

    db.commit()
    db.refresh(insight)
    return _to_response(insight)


@router.delete("/{insight_id}")
def deletar_insight(
    insight_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    if current_user.role.nome != "ADMIN_GLOBAL":
        raise HTTPException(status_code=403, detail="Acesso negado.")

    insight = db.get(InsightModel, insight_id)
    if not insight:
        raise HTTPException(status_code=404, detail="Insight não encontrado.")

    db.delete(insight)
    db.commit()
    return {"ok": True}
