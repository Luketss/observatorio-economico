from typing import List

from app.api.deps import get_current_user, get_db, scoped_modulo
from app.models.arrecadacao import ArrecadacaoMensal
from app.models.municipio import Municipio
from app.models.vaf import VafAnual
from app.schemas.pares import MunicipioRefOut
from app.schemas.vaf import (
    IcmsProjetadoItem,
    VafComparativoItem,
    VafComparativoOut,
    VafItem,
    VafResumo,
)
from app.services.pares_service import (
    carregar_refs,
    elegiveis_por_cobertura,
    parse_fixados,
    resolver_grupo,
)
from fastapi import APIRouter, Depends, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

router = APIRouter(prefix="/vaf", tags=["VAF"])


def _to_item(r: VafAnual) -> VafItem:
    return VafItem(
        ano_base=r.ano_base,
        ano_aplicacao=r.ano_aplicacao,
        vaf_individual=r.vaf_individual,
        pct_vaf_individual=r.pct_vaf_individual,
        vaf_estado=r.vaf_estado,
        pct_vaf_estado=r.pct_vaf_estado,
        indice=r.indice,
        pct_indice=r.pct_indice,
        indice_medio=r.indice_medio,
        pct_indice_medio=r.pct_indice_medio,
        indice_participacao_municipal=r.indice_participacao_municipal,
        pct_ipm=r.pct_ipm,
    )


# ==============================
# Série Anual
# ==============================
@router.get("/serie", response_model=List[VafItem])
def serie_vaf(
    mid: int | None = Depends(scoped_modulo("vaf")),
    db: Session = Depends(get_db),
):
    if mid is None:
        # ADMIN_GLOBAL sem município selecionado — front exibe "selecione um município".
        return []

    registros = (
        db.query(VafAnual)
        .filter(VafAnual.municipio_id == mid)
        .order_by(VafAnual.ano_base)
        .all()
    )

    return [_to_item(r) for r in registros]


# ==============================
# Resumo
# ==============================
@router.get("/resumo", response_model=VafResumo)
def resumo_vaf(
    mid: int | None = Depends(scoped_modulo("vaf")),
    db: Session = Depends(get_db),
):
    registros = (
        db.query(VafAnual)
        .filter(VafAnual.municipio_id == mid)
        .order_by(VafAnual.ano_base)
        .all()
        if mid is not None
        else []
    )

    if not registros:
        return VafResumo(
            ultimo_ano=0,
            ipm_ultimo_ano=0,
            variacao_ipm_percentual=0,
        )

    ultimo = registros[-1]

    return VafResumo(
        ultimo_ano=ultimo.ano_base,
        ipm_ultimo_ano=ultimo.indice_participacao_municipal or 0,
        variacao_ipm_percentual=round(ultimo.pct_ipm or 0, 2),
    )


# ==============================
# ICMS projetado a partir do IPM (ancorado no ICMS realizado)
# ==============================
@router.get("/icms_projetado", response_model=List[IcmsProjetadoItem])
def icms_projetado_vaf(
    mid: int | None = Depends(scoped_modulo("vaf")),
    db: Session = Depends(get_db),
):
    """Projeta o repasse de ICMS por ano de aplicação escalando o ICMS realizado
    (Arrecadação) pela razão do IPM: projetado = ICMS_base × (IPM_ano / IPM_base).
    O ano-base do VAF reflete no repasse 2 anos depois (ano de aplicação)."""
    if mid is None:
        return []

    vaf_rows = (
        db.query(VafAnual)
        .filter(VafAnual.municipio_id == mid)
        .order_by(VafAnual.ano_base)
        .all()
    )
    if not vaf_rows:
        return []

    # ICMS realizado por ano (soma anual de valor_icms da arrecadação)
    icms_por_ano = dict(
        db.query(ArrecadacaoMensal.ano, func.sum(ArrecadacaoMensal.valor_icms))
        .filter(ArrecadacaoMensal.municipio_id == mid)
        .group_by(ArrecadacaoMensal.ano)
        .all()
    )
    icms_por_ano = {a: float(v or 0) for a, v in icms_por_ano.items() if v}
    if not icms_por_ano:
        return []  # sem ICMS realizado não há âncora para projetar

    baseline_year = max(icms_por_ano)
    baseline_icms = icms_por_ano[baseline_year]

    # IPM aplicado no ano-base do ICMS = linha VAF com ano_aplicacao == baseline_year
    by_aplic = {r.ano_aplicacao: r for r in vaf_rows if r.ano_aplicacao}
    base_row = by_aplic.get(baseline_year) or vaf_rows[-1]
    baseline_ipm = base_row.indice_participacao_municipal or 0
    if not baseline_ipm:
        return []

    return [
        IcmsProjetadoItem(
            ano_base=r.ano_base,
            ano_aplicacao=r.ano_aplicacao,
            ipm=r.indice_participacao_municipal,
            icms_projetado=round(baseline_icms * ((r.indice_participacao_municipal or 0) / baseline_ipm), 2),
            realizado=icms_por_ano.get(r.ano_aplicacao),
        )
        for r in vaf_rows
    ]


# ==============================
# Comparativo — foco + pares comparáveis
# ==============================
def _ref_out(r) -> MunicipioRefOut:
    return MunicipioRefOut(municipio_id=r.id, nome=r.nome, estado=r.estado)


@router.get("/comparativo", response_model=VafComparativoOut)
def comparativo_vaf(
    mid: int | None = Depends(scoped_modulo("vaf")),
    fixados: str | None = Query(default=None, description="ids separados por vírgula, máx. 3"),
    db: Session = Depends(get_db),
):
    """IPM do município em foco + até 6 pares comparáveis (mesma UF + faixa
    populacional do FPM), mais os fixados pelo usuário. Ver comentário gêmeo em
    `routers/pib.py`: antes daqui a rota devolvia a base inteira."""
    if mid is None:
        return VafComparativoOut(motivo="sem_municipio")

    anos_foco = {
        a for (a,) in db.query(VafAnual.ano_base).filter(VafAnual.municipio_id == mid).all()
    }
    if not anos_foco:
        return VafComparativoOut(motivo="sem_municipio")

    cobertura = (
        db.query(VafAnual.municipio_id, VafAnual.ano_base)
        .join(Municipio, VafAnual.municipio_id == Municipio.id)
        .filter(VafAnual.ano_base.in_(anos_foco), Municipio.is_demo.is_(False))
        .all()
    )
    elegiveis = elegiveis_por_cobertura([(m, a) for m, a in cobertura], anos_foco)

    grupo = resolver_grupo(carregar_refs(db), mid, elegiveis, parse_fixados(fixados))
    if grupo.foco is None:
        return VafComparativoOut(motivo=grupo.motivo or "sem_municipio")

    ids = [grupo.foco.id] + [p.id for p in grupo.pares] + [f.id for f in grupo.fixados]
    registros = (
        db.query(VafAnual, Municipio.nome)
        .join(Municipio, VafAnual.municipio_id == Municipio.id)
        .filter(VafAnual.municipio_id.in_(ids))
        .order_by(VafAnual.ano_base)
        .all()
    )
    return VafComparativoOut(
        foco=_ref_out(grupo.foco),
        pares=[_ref_out(p) for p in grupo.pares],
        fixados=[_ref_out(f) for f in grupo.fixados],
        criterio_pares=grupo.criterio,
        motivo=grupo.motivo,
        itens=[
            VafComparativoItem(municipio_id=r.municipio_id, cidade=nome, **_to_item(r).model_dump())
            for r, nome in registros
        ],
    )


@router.get("/ranking")
def ranking_vaf(
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
            VafAnual.indice_participacao_municipal.label("indice_participacao_municipal"),
        )
        .join(VafAnual, VafAnual.municipio_id == Municipio.id)
        .filter(Municipio.is_demo.is_(False))
    )
    if ano:
        query = query.filter(VafAnual.ano_base == ano)
    else:
        latest = db.query(func.max(VafAnual.ano_base)).scalar()
        if latest:
            query = query.filter(VafAnual.ano_base == latest)
    if estado:
        query = query.filter(Municipio.estado == estado.upper())

    resultados = query.order_by(
        VafAnual.indice_participacao_municipal.desc()
    ).all()
    return [
        {
            "municipio": r.municipio,
            "municipio_id": r.municipio_id,
            "estado": r.estado,
            "indice_participacao_municipal": r.indice_participacao_municipal or 0,
        }
        for r in resultados
    ]
