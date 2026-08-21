"""Models do Cidade Inteligente: roundtrip e cascade de requisitos."""
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

import app.models  # noqa: F401
from app.db.base import Base
from app.models.cidade_inteligente import CertificacaoCidade, CertificacaoRequisito
from app.models.municipio import Municipio


@pytest.fixture()
def db():
    engine = create_engine("sqlite://")
    Base.metadata.create_all(engine, tables=[
        Municipio.__table__, CertificacaoCidade.__table__, CertificacaoRequisito.__table__,
    ])
    s = sessionmaker(bind=engine)()
    yield s
    s.close()


def test_roundtrip_com_defaults(db):
    m = Municipio(nome="Alfa", estado="MG")
    db.add(m); db.flush()
    cert = CertificacaoCidade(municipio_id=m.id, nome="ABNT NBR ISO 37122", entidade="ABNT")
    cert.requisitos.append(CertificacaoRequisito(titulo="Plano diretor digital"))
    db.add(cert); db.commit()

    salvo = db.query(CertificacaoCidade).one()
    assert salvo.ativo is True
    assert salvo.criado_em is not None
    req = salvo.requisitos[0]
    assert req.status == "pendente"
    assert req.evidencia_url is None


def test_delete_certificacao_leva_requisitos(db):
    m = Municipio(nome="Alfa", estado="MG")
    db.add(m); db.flush()
    cert = CertificacaoCidade(municipio_id=m.id, nome="Selo X")
    cert.requisitos.append(CertificacaoRequisito(titulo="R1"))
    db.add(cert); db.commit()

    db.delete(cert); db.commit()
    assert db.query(CertificacaoRequisito).count() == 0
