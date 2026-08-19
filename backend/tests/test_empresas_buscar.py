"""Busca de empresa individual para o autocomplete da Gestão Empresarial."""
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

import app.models  # noqa: F401
from app.db.base import Base
from app.models.empresa import Empresa
from app.models.municipio import Municipio


@pytest.fixture()
def db():
    engine = create_engine("sqlite://")
    Base.metadata.create_all(engine, tables=[Municipio.__table__, Empresa.__table__])
    session = sessionmaker(bind=engine)()
    m = Municipio(nome="Alfa", estado="MG")
    session.add(m)
    session.flush()
    session.add_all([
        Empresa(municipio_id=m.id, cnpj_basico="12345678", razao_social="ACME LTDA",
                nome_fantasia="ACME"),
        Empresa(municipio_id=m.id, cnpj_basico="87654321", razao_social="BETA COMERCIO"),
    ])
    session.commit()
    session.mid = m.id
    yield session
    session.close()


def test_busca_por_nome(db):
    from app.api.v1.routers.empresas import buscar_empresas
    r = buscar_empresas(q="acme", mid=db.mid, db=db)
    assert [e.razao_social for e in r] == ["ACME LTDA"]


def test_busca_por_cnpj(db):
    from app.api.v1.routers.empresas import buscar_empresas
    r = buscar_empresas(q="12.345", mid=db.mid, db=db)
    assert [e.cnpj_basico for e in r] == ["12345678"]


def test_sem_modulo_devolve_vazio(db):
    from app.api.v1.routers.empresas import buscar_empresas
    assert buscar_empresas(q="acme", mid=None, db=db) == []


def test_rota_no_openapi_e_label_renomeado():
    from app.core.permissions import AREA_LABELS
    from app.main import app
    assert "/api/v1/empresas/buscar" in app.openapi()["paths"]
    assert AREA_LABELS["retencao"] == "Gestão Empresarial"
