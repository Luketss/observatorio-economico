from typing import List

from app.api.deps import get_current_user, get_db, scoped_modulo
from app.models.municipio import Municipio
from app.models.pib import PibAnual
from app.schemas.pares import MunicipioRefOut
from app.schemas.pib import (
    PibComparativoItem,
    PibComparativoOut,
    PibItem,
    PibResumo,
)
from app.services.pares_service import (
    MunicipioRef,
    carregar_refs,
    elegiveis_por_cobertura,
    parse_fixados,
    resolver_grupo,
)
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

router = APIRouter(prefix="/pib", tags=["PIB"])


# ==============================
# Série Anual
# ==============================
@router.get("/serie", response_model=List[PibItem])
def serie_pib(
    mid: int | None = Depends(scoped_modulo("pib")),
    db: Session = Depends(get_db),
):
    if mid is None:
        # ADMIN_GLOBAL sem município selecionado — front exibe "selecione um município".
        return []

    registros = (
        db.query(PibAnual)
        .filter(PibAnual.municipio_id == mid)
        .order_by(PibAnual.ano)
        .all()
    )

    return [
        PibItem(
            ano=r.ano,
            pib_total=r.pib_total,
            tipo_dado=r.tipo_dado,
        )
        for r in registros
    ]


# ==============================
# Resumo
# ==============================
@router.get("/resumo", response_model=PibResumo)
def resumo_pib(
    mid: int | None = Depends(scoped_modulo("pib")),
    db: Session = Depends(get_db),
):
    registros = (
        db.query(PibAnual)
        .filter(PibAnual.municipio_id == mid)
        .order_by(PibAnual.ano)
        .all()
        if mid is not None
        else []
    )

    if not registros:
        return PibResumo(
            ultimo_ano=0,
            pib_ultimo_ano=0,
            crescimento_percentual=0,
        )

    ultimo = registros[-1]
    crescimento = 0

    if len(registros) > 1:
        anterior = registros[-2]
        if anterior.pib_total > 0:
            crescimento = (
                (ultimo.pib_total - anterior.pib_total) / anterior.pib_total
            ) * 100

    return PibResumo(
        ultimo_ano=ultimo.ano,
        pib_ultimo_ano=ultimo.pib_total,
        crescimento_percentual=round(crescimento, 2),
    )


# ==============================
# Comparativo — foco + pares comparáveis
# ==============================
def _ref_out(r: MunicipioRef) -> MunicipioRefOut:
    return MunicipioRefOut(municipio_id=r.id, nome=r.nome, estado=r.estado)


@router.get("/comparativo", response_model=PibComparativoOut)
def comparativo_pib(
    mid: int | None = Depends(scoped_modulo("pib")),
    fixados: str | None = Query(default=None, description="ids separados por vírgula, máx. 3"),
    db: Session = Depends(get_db),
):
    """Série do município em foco + até 6 pares comparáveis (mesma UF + faixa
    populacional do FPM), mais os municípios que o usuário fixou. Antes daqui
    esta rota devolvia a base inteira para ADMIN_GLOBAL, o que tornava o gráfico
    e a legenda ilegíveis assim que a ingestão passou a cobrir todo o país."""
    if mid is None:
        # ADMIN_GLOBAL sem município selecionado — front exibe "selecione um município".
        return PibComparativoOut(motivo="sem_municipio")

    anos_foco = {
        a for (a,) in db.query(PibAnual.ano).filter(PibAnual.municipio_id == mid).all()
    }
    if not anos_foco:
        # Distinto do "sem_municipio" acima: aqui HÁ município (e view-as, se
        # for o caso), só falta série dele. Motivo próprio para o front não
        # confundir "selecione um município" com "este município ainda não
        # tem dado".
        return PibComparativoOut(motivo="sem_serie")

    cobertura = (
        db.query(PibAnual.municipio_id, PibAnual.ano)
        .join(Municipio, PibAnual.municipio_id == Municipio.id)
        .filter(PibAnual.ano.in_(anos_foco), Municipio.is_demo.is_(False))
        .all()
    )
    elegiveis = elegiveis_por_cobertura([(m, a) for m, a in cobertura], anos_foco)

    grupo = resolver_grupo(carregar_refs(db), mid, elegiveis, parse_fixados(fixados))
    if grupo.foco is None:
        return PibComparativoOut(motivo=grupo.motivo or "sem_municipio")

    ids = [grupo.foco.id] + [p.id for p in grupo.pares] + [f.id for f in grupo.fixados]
    registros = (
        db.query(PibAnual, Municipio.nome)
        .join(Municipio, PibAnual.municipio_id == Municipio.id)
        .filter(PibAnual.municipio_id.in_(ids))
        .order_by(PibAnual.ano)
        .all()
    )
    return PibComparativoOut(
        foco=_ref_out(grupo.foco),
        pares=[_ref_out(p) for p in grupo.pares],
        fixados=[_ref_out(f) for f in grupo.fixados],
        criterio_pares=grupo.criterio,
        motivo=grupo.motivo,
        itens=[
            PibComparativoItem(
                ano=r.ano,
                municipio_id=r.municipio_id,
                cidade=nome,
                pib_total=r.pib_total,
                va_agropecuaria=r.va_agropecuaria,
                va_governo=r.va_governo,
                va_industria=r.va_industria,
                va_servicos=r.va_servicos,
            )
            for r, nome in registros
        ],
    )


@router.get("/ranking")
def ranking_pib(
    ano: int | None = None,
    estado: str | None = None,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    from sqlalchemy import func

    query = (
        db.query(
            Municipio.nome.label("municipio"),
            Municipio.id.label("municipio_id"),
            Municipio.estado.label("estado"),
            func.sum(PibAnual.pib_total).label("pib_total"),
        )
        .join(PibAnual, PibAnual.municipio_id == Municipio.id)
        .filter(Municipio.is_demo.is_(False))
    )
    if ano:
        query = query.filter(PibAnual.ano == ano)
    else:
        latest = db.query(func.max(PibAnual.ano)).scalar()
        if latest:
            query = query.filter(PibAnual.ano == latest)
    if estado:
        query = query.filter(Municipio.estado == estado.upper())

    resultados = (
        query.group_by(Municipio.nome, Municipio.id, Municipio.estado)
        .order_by(func.sum(PibAnual.pib_total).desc())
        .all()
    )
    return [
        {"municipio": r.municipio, "municipio_id": r.municipio_id, "estado": r.estado, "pib_total": r.pib_total or 0}
        for r in resultados
    ]
