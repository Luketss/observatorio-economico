from typing import List

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_db
from app.models.ips import IpsMunicipio
from app.models.municipio import Municipio
from app.schemas.ips import (
    IpsComparativoItem,
    IpsDestaque,
    IpsDestaques,
    IpsEvolucaoItem,
    IpsMunicipioItem,
    IpsRanking,
    IpsScorecardItem,
    IpsSugestao,
)

router = APIRouter(prefix="/ips", tags=["IPS"])

COMPONENTS = [
    ("nutricao_cuidados_medicos", "Nutricao e Cuidados Medicos"),
    ("agua_saneamento", "Agua e Saneamento"),
    ("moradia", "Moradia"),
    ("seguranca_pessoal", "Seguranca Pessoal"),
    ("acesso_conhecimento_basico", "Acesso ao Conhecimento"),
    ("acesso_informacao_comunicacao", "Acesso a Informacao"),
    ("saude_bem_estar", "Saude e Bem-estar"),
    ("qualidade_meio_ambiente", "Meio Ambiente"),
    ("direitos_individuais", "Direitos Individuais"),
    ("liberdades_individuais", "Liberdades Individuais"),
    ("inclusao_social", "Inclusao Social"),
    ("acesso_educacao_superior", "Educacao Superior"),
]


@router.get("/municipios", response_model=List[IpsMunicipioItem])
def listar_municipios(
    ano: int = Query(2025),
    estado: str | None = Query(None),
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
):
    query = (
        db.query(Municipio.id, Municipio.nome, Municipio.estado)
        .join(IpsMunicipio, IpsMunicipio.municipio_id == Municipio.id)
        .filter(IpsMunicipio.ano == ano)
    )
    if estado:
        query = query.filter(Municipio.estado == estado.upper())
    rows = query.order_by(Municipio.nome).all()
    return [IpsMunicipioItem(municipio_id=r.id, nome=r.nome, estado=r.estado) for r in rows]


@router.get("/scorecard", response_model=IpsScorecardItem)
def scorecard(
    municipio_id: int = Query(...),
    ano: int = Query(2025),
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
):
    row = (
        db.query(IpsMunicipio)
        .filter(IpsMunicipio.municipio_id == municipio_id, IpsMunicipio.ano == ano)
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="IPS data not found")
    return IpsScorecardItem(
        **{c.name: getattr(row, c.name) for c in IpsMunicipio.__table__.columns}
    )


@router.get("/evolucao", response_model=List[IpsEvolucaoItem])
def evolucao(
    municipio_id: int = Query(...),
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
):
    rows = (
        db.query(IpsMunicipio)
        .filter(IpsMunicipio.municipio_id == municipio_id)
        .order_by(IpsMunicipio.ano)
        .all()
    )
    return [
        IpsEvolucaoItem(
            ano=r.ano,
            ips_geral=r.ips_geral,
            necessidades_humanas_basicas=r.necessidades_humanas_basicas,
            fundamentos_bem_estar=r.fundamentos_bem_estar,
            oportunidades=r.oportunidades,
        )
        for r in rows
    ]


@router.get("/ranking", response_model=IpsRanking)
def ranking(
    municipio_id: int = Query(...),
    ano: int = Query(2025),
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
):
    city = (
        db.query(IpsMunicipio)
        .filter(IpsMunicipio.municipio_id == municipio_id, IpsMunicipio.ano == ano)
        .first()
    )
    if not city or city.ips_geral is None:
        raise HTTPException(status_code=404, detail="IPS data not found")

    municipio = db.query(Municipio).filter(Municipio.id == municipio_id).first()
    estado = municipio.estado if municipio else None

    total_nacional = (
        db.query(func.count(IpsMunicipio.id))
        .filter(IpsMunicipio.ano == ano, IpsMunicipio.ips_geral.isnot(None))
        .scalar() or 0
    )
    above_nacional = (
        db.query(func.count(IpsMunicipio.id))
        .filter(IpsMunicipio.ano == ano, IpsMunicipio.ips_geral > city.ips_geral)
        .scalar() or 0
    )

    total_estadual = above_estadual = 0
    if estado:
        total_estadual = (
            db.query(func.count(IpsMunicipio.id))
            .join(Municipio, IpsMunicipio.municipio_id == Municipio.id)
            .filter(IpsMunicipio.ano == ano, Municipio.estado == estado, IpsMunicipio.ips_geral.isnot(None))
            .scalar() or 0
        )
        above_estadual = (
            db.query(func.count(IpsMunicipio.id))
            .join(Municipio, IpsMunicipio.municipio_id == Municipio.id)
            .filter(IpsMunicipio.ano == ano, Municipio.estado == estado, IpsMunicipio.ips_geral > city.ips_geral)
            .scalar() or 0
        )

    return IpsRanking(
        ranking_nacional=above_nacional + 1,
        total_nacional=total_nacional,
        ranking_estadual=above_estadual + 1,
        total_estadual=total_estadual,
    )


@router.get("/comparativo", response_model=List[IpsComparativoItem])
def comparativo(
    municipio_id: int = Query(...),
    ano: int = Query(2025),
    municipio_ids: str = Query(""),
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
):
    ids = {municipio_id}
    if municipio_ids:
        for part in municipio_ids.split(","):
            part = part.strip()
            if part.isdigit():
                ids.add(int(part))

    rows = (
        db.query(IpsMunicipio, Municipio.nome, Municipio.estado)
        .join(Municipio, IpsMunicipio.municipio_id == Municipio.id)
        .filter(IpsMunicipio.municipio_id.in_(ids), IpsMunicipio.ano == ano)
        .all()
    )
    return [
        IpsComparativoItem(
            municipio_id=r.municipio_id,
            nome=nome,
            estado=estado,
            ips_geral=r.ips_geral,
            necessidades_humanas_basicas=r.necessidades_humanas_basicas,
            fundamentos_bem_estar=r.fundamentos_bem_estar,
            oportunidades=r.oportunidades,
        )
        for r, nome, estado in rows
    ]


@router.get("/destaques", response_model=IpsDestaques)
def destaques(
    municipio_id: int = Query(...),
    ano: int = Query(2025),
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
):
    city = (
        db.query(IpsMunicipio)
        .filter(IpsMunicipio.municipio_id == municipio_id, IpsMunicipio.ano == ano)
        .first()
    )
    if not city:
        raise HTTPException(status_code=404, detail="IPS data not found")

    # Compute all 12 component averages in a single query
    avg_cols = [
        func.avg(getattr(IpsMunicipio, campo)).label(campo)
        for campo, _ in COMPONENTS
    ]
    avg_row = db.query(*avg_cols).filter(IpsMunicipio.ano == ano).first()

    resultados = []
    for campo, label in COMPONENTS:
        valor = getattr(city, campo)
        media = getattr(avg_row, campo) if avg_row else None
        if valor is None or media is None:
            continue
        resultados.append(
            IpsDestaque(
                campo=campo,
                label=label,
                valor=round(valor, 2),
                media_nacional=round(float(media), 2),
                diferenca=round(valor - float(media), 2),
            )
        )

    resultados.sort(key=lambda x: x.diferenca, reverse=True)
    return IpsDestaques(melhores=resultados[:3], piores=resultados[-3:])


@router.get("/sugestoes", response_model=List[IpsSugestao])
def sugestoes(
    municipio_id: int = Query(...),
    ano: int = Query(2025),
    limit: int = Query(5),
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
):
    city = (
        db.query(IpsMunicipio)
        .filter(IpsMunicipio.municipio_id == municipio_id, IpsMunicipio.ano == ano)
        .first()
    )
    if not city or city.pib_per_capita is None or city.ips_geral is None:
        return []

    low = city.pib_per_capita * 0.8
    high = city.pib_per_capita * 1.2

    rows = (
        db.query(IpsMunicipio, Municipio.nome, Municipio.estado)
        .join(Municipio, IpsMunicipio.municipio_id == Municipio.id)
        .filter(
            IpsMunicipio.ano == ano,
            IpsMunicipio.municipio_id != municipio_id,
            IpsMunicipio.pib_per_capita.between(low, high),
            IpsMunicipio.ips_geral.isnot(None),
        )
        .order_by(func.abs(IpsMunicipio.ips_geral - city.ips_geral))
        .limit(limit)
        .all()
    )
    return [
        IpsSugestao(
            municipio_id=r.municipio_id,
            nome=nome,
            estado=estado,
            ips_geral=r.ips_geral,
            pib_per_capita=r.pib_per_capita,
        )
        for r, nome, estado in rows
    ]
