from typing import List, Optional

from app.api.deps import get_current_user, get_db
from app.core.exceptions import ForbiddenException, NotFoundException
from app.models.dados_internos import EventoMunicipio, IndicadorInterno, PlanoGovAcao
from app.models.usuario import Usuario
from app.schemas.dados_internos import (
    EventoMunicipioCreate,
    EventoMunicipioOut,
    EventoMunicipioUpdate,
    IndicadorInternoCreate,
    IndicadorInternoOut,
    IndicadorInternoUpdate,
    PlanoGovAcaoCreate,
    PlanoGovAcaoOut,
    PlanoGovAcaoUpdate,
)
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

router = APIRouter(prefix="/dados_internos", tags=["Dados Internos"])


def _assert_write(user: Usuario, verbo: str):
    from app.core.permissions import tem_permissao

    if not tem_permissao(user.role, "dados_internos", verbo):
        raise ForbiddenException(f"Sem permissão para {verbo} em dados_internos")


def _assert_own(user: Usuario, municipio_id: int):
    if user.role.nome != "ADMIN_GLOBAL" and user.municipio_id != municipio_id:
        raise ForbiddenException("Insufficient permissions")


def _scoped(query, model, user: Usuario):
    if user.role.nome != "ADMIN_GLOBAL":
        query = query.filter(model.municipio_id == user.municipio_id)
    return query


# ── Indicadores Internos ──────────────────────────────────────────────────────

@router.get("/indicadores", response_model=List[IndicadorInternoOut])
def listar_indicadores(
    area: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    query = _scoped(db.query(IndicadorInterno), IndicadorInterno, current_user)
    if area:
        query = query.filter(IndicadorInterno.area == area)
    return query.order_by(IndicadorInterno.area, IndicadorInterno.nome_metrica, IndicadorInterno.periodo_ano, IndicadorInterno.periodo_mes).all()


@router.post("/indicadores", response_model=IndicadorInternoOut)
def criar_indicador(
    data: IndicadorInternoCreate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    _assert_write(current_user, "criar")
    indicador = IndicadorInterno(
        **data.model_dump(),
        municipio_id=current_user.municipio_id,
    )
    db.add(indicador)
    db.commit()
    db.refresh(indicador)
    return indicador


@router.put("/indicadores/{indicador_id}", response_model=IndicadorInternoOut)
def atualizar_indicador(
    indicador_id: int,
    data: IndicadorInternoUpdate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    _assert_write(current_user, "editar")
    obj = db.get(IndicadorInterno, indicador_id)
    if not obj:
        raise NotFoundException("Indicador not found")
    _assert_own(current_user, obj.municipio_id)
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(obj, field, value)
    db.commit()
    db.refresh(obj)
    return obj


@router.delete("/indicadores/{indicador_id}")
def deletar_indicador(
    indicador_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    _assert_write(current_user, "excluir")
    obj = db.get(IndicadorInterno, indicador_id)
    if not obj:
        raise NotFoundException("Indicador not found")
    _assert_own(current_user, obj.municipio_id)
    db.delete(obj)
    db.commit()
    return {"ok": True}


# ── Plano de Governo ──────────────────────────────────────────────────────────

@router.get("/plano_gov", response_model=List[PlanoGovAcaoOut])
def listar_acoes(
    departamento: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    query = _scoped(db.query(PlanoGovAcao), PlanoGovAcao, current_user)
    if departamento:
        query = query.filter(PlanoGovAcao.departamento == departamento)
    if status:
        query = query.filter(PlanoGovAcao.status == status)
    return query.order_by(PlanoGovAcao.departamento, PlanoGovAcao.titulo).all()


@router.post("/plano_gov", response_model=PlanoGovAcaoOut)
def criar_acao(
    data: PlanoGovAcaoCreate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    _assert_write(current_user, "criar")
    acao = PlanoGovAcao(
        **data.model_dump(),
        municipio_id=current_user.municipio_id,
    )
    db.add(acao)
    db.commit()
    db.refresh(acao)
    return acao


@router.put("/plano_gov/{acao_id}", response_model=PlanoGovAcaoOut)
def atualizar_acao(
    acao_id: int,
    data: PlanoGovAcaoUpdate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    _assert_write(current_user, "editar")
    obj = db.get(PlanoGovAcao, acao_id)
    if not obj:
        raise NotFoundException("Ação not found")
    _assert_own(current_user, obj.municipio_id)
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(obj, field, value)
    db.commit()
    db.refresh(obj)
    return obj


@router.delete("/plano_gov/{acao_id}")
def deletar_acao(
    acao_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    _assert_write(current_user, "excluir")
    obj = db.get(PlanoGovAcao, acao_id)
    if not obj:
        raise NotFoundException("Ação not found")
    _assert_own(current_user, obj.municipio_id)
    db.delete(obj)
    db.commit()
    return {"ok": True}


# ── Eventos ───────────────────────────────────────────────────────────────────

@router.get("/eventos", response_model=List[EventoMunicipioOut])
def listar_eventos(
    ano: Optional[int] = Query(None),
    mes: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    query = _scoped(db.query(EventoMunicipio), EventoMunicipio, current_user)
    if ano:
        from sqlalchemy import extract
        query = query.filter(extract("year", EventoMunicipio.data_inicio) == ano)
    if mes:
        from sqlalchemy import extract
        query = query.filter(extract("month", EventoMunicipio.data_inicio) == mes)
    return query.order_by(EventoMunicipio.data_inicio).all()


@router.post("/eventos", response_model=EventoMunicipioOut)
def criar_evento(
    data: EventoMunicipioCreate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    _assert_write(current_user, "criar")
    evento = EventoMunicipio(
        **data.model_dump(),
        municipio_id=current_user.municipio_id,
        criado_por=current_user.id,
    )
    db.add(evento)
    db.commit()
    db.refresh(evento)
    return evento


@router.put("/eventos/{evento_id}", response_model=EventoMunicipioOut)
def atualizar_evento(
    evento_id: int,
    data: EventoMunicipioUpdate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    _assert_write(current_user, "editar")
    obj = db.get(EventoMunicipio, evento_id)
    if not obj:
        raise NotFoundException("Evento not found")
    _assert_own(current_user, obj.municipio_id)
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(obj, field, value)
    db.commit()
    db.refresh(obj)
    return obj


@router.delete("/eventos/{evento_id}")
def deletar_evento(
    evento_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    _assert_write(current_user, "excluir")
    obj = db.get(EventoMunicipio, evento_id)
    if not obj:
        raise NotFoundException("Evento not found")
    _assert_own(current_user, obj.municipio_id)
    db.delete(obj)
    db.commit()
    return {"ok": True}
