"""Modelos novos da Gestão Empresarial: colunas, relationships e cascade."""
import pytest
from datetime import date, datetime, timezone
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

import app.models  # noqa: F401
from app.db.base import Base
from app.models.desenvolvimento_economico import (
    ContatoEmpresa,
    DemandaEmpresa,
    DemandaStatusHistorico,
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
            DemandaStatusHistorico.__table__,
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


def test_historico_de_status_ordena_por_data_e_apaga_em_cascata(db):
    e = db.query(EmpresaRetencao).one()
    d = DemandaEmpresa(empresa_id=e.id, municipio_id=e.municipio_id, descricao="Via", data_registro=date(2026, 8, 1))
    db.add(d)
    db.flush()
    db.add_all([
        DemandaStatusHistorico(demanda_id=d.id, municipio_id=e.municipio_id, de="aberta", para="em_andamento",
                               alterado_em=datetime(2026, 8, 10, 12, tzinfo=timezone.utc)),
        DemandaStatusHistorico(demanda_id=d.id, municipio_id=e.municipio_id, de=None, para="aberta",
                               alterado_em=datetime(2026, 8, 1, 12, tzinfo=timezone.utc)),
    ])
    db.commit()
    db.refresh(d)
    assert [(h.de, h.para) for h in d.historico] == [(None, "aberta"), ("aberta", "em_andamento")]
    assert d.historico[0].alterado_por_nome is None  # sem usuário
    db.delete(d)
    db.commit()
    assert db.query(DemandaStatusHistorico).count() == 0


def test_migracao_0041_encadeia_no_head_anterior():
    from pathlib import Path
    arquivo = Path(__file__).resolve().parents[1] / "alembic" / "versions" / "0041_demanda_status_historico.py"
    texto = arquivo.read_text(encoding="utf-8")
    assert "revision = '0041_demanda_status_historico'" in texto
    assert "down_revision = '0040_cidade_inteligente'" in texto
    assert "op.create_table('demanda_status_historico'" in texto
    assert "['demanda_empresa.id'], ondelete='CASCADE'" in texto
    assert "['usuarios.id'], ondelete='SET NULL'" in texto
