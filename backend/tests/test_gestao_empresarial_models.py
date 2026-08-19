"""Modelos novos da Gestão Empresarial: colunas, relationships e cascade."""
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

import app.models  # noqa: F401
from app.db.base import Base
from app.models.desenvolvimento_economico import (
    ContatoEmpresa,
    DemandaEmpresa,
    EmpresaRetencao,
    VisitaRetencao,
)
from app.models.municipio import Municipio
from app.models.role import Role
from app.models.usuario import Usuario


@pytest.fixture()
def db():
    engine = create_engine("sqlite://")
    Base.metadata.create_all(
        engine,
        tables=[
            Municipio.__table__, Role.__table__, Usuario.__table__,
            EmpresaRetencao.__table__, VisitaRetencao.__table__,
            ContatoEmpresa.__table__, DemandaEmpresa.__table__,
        ],
    )
    session = sessionmaker(bind=engine)()
    m = Municipio(nome="Teste", estado="MG")
    session.add(m)
    session.flush()
    session.add(EmpresaRetencao(municipio_id=m.id, nome="ACME"))
    session.commit()
    yield session
    session.close()


def test_colunas_novas_da_empresa(db):
    e = db.query(EmpresaRetencao).one()
    assert e.cnpj_basico is None
    assert e.proxima_acao is None
    assert e.proxima_acao_data is None
    e.cnpj_basico = "12345678"
    e.proxima_acao = "Agendar reunião"
    db.commit()
    assert db.query(EmpresaRetencao).one().cnpj_basico == "12345678"


def test_relationships_e_defaults(db):
    from datetime import date
    e = db.query(EmpresaRetencao).one()
    e.contatos.append(ContatoEmpresa(municipio_id=e.municipio_id, data=date(2026, 8, 1)))
    e.demandas.append(DemandaEmpresa(
        municipio_id=e.municipio_id, descricao="Acesso pavimentado",
        data_registro=date(2026, 8, 2),
    ))
    db.commit()
    e = db.query(EmpresaRetencao).one()
    assert e.contatos[0].tipo == "reuniao"
    assert e.demandas[0].status == "aberta"


def test_cascade_delete(db):
    from datetime import date
    e = db.query(EmpresaRetencao).one()
    e.contatos.append(ContatoEmpresa(municipio_id=e.municipio_id, data=date(2026, 8, 1)))
    e.demandas.append(DemandaEmpresa(
        municipio_id=e.municipio_id, descricao="X", data_registro=date(2026, 8, 2),
    ))
    db.commit()
    db.delete(e)
    db.commit()
    assert db.query(ContatoEmpresa).count() == 0
    assert db.query(DemandaEmpresa).count() == 0
