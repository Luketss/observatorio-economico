"""Dataset 'geral' consolidado do insights_service: payload compacto por base,
bases sem dado omitidas, prompt executivo registrado."""
from datetime import date

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

import app.models  # noqa: F401
from app.db.base import Base
from app.models.arrecadacao import ArrecadacaoMensal
from app.models.municipio import Municipio
from app.models.pib import PibAnual


@pytest.fixture()
def db():
    engine = create_engine("sqlite://")
    Base.metadata.create_all(engine)  # todas as tabelas — o branch geral toca várias
    session = sessionmaker(bind=engine)()
    m = Municipio(nome="Alfa", estado="MG")
    session.add(m)
    session.flush()
    session.add_all([
        PibAnual(municipio_id=m.id, ano=2021, tipo_dado="REAL", pib_total=1000000.0),
        PibAnual(municipio_id=m.id, ano=2022, tipo_dado="REAL", pib_total=1100000.0),
    ])
    for i in range(24):
        ano = 2026 if i < 12 else 2025
        mes = 12 - (i % 12)
        session.add(ArrecadacaoMensal(
            municipio_id=m.id, ano=ano, mes=mes,
            nome_mes=str(mes), data_base=date(ano, mes, 1),
            valor_icms=0.0, valor_ipva=0.0, valor_ipi=0.0,
            valor_total=100.0 if i < 12 else 80.0,
        ))
    session.commit()
    session.mid = m.id
    yield session
    session.close()


def test_payload_geral_tem_bases_semeadas_e_omite_vazias(db):
    from app.services.insights_service import _fetch_dados
    dados, periodo = _fetch_dados(db, db.mid, "geral")
    assert len(dados) == 1
    bases = dados[0]["bases"]
    assert bases["pib"]["ano"] == 2022
    assert bases["pib"]["yoy_crescimento_pct"] == 10.0
    assert bases["arrecadacao"]["total_12m"] == 1200.0
    assert bases["arrecadacao"]["yoy_crescimento_pct"] == 25.0
    # bases sem dado semeado não aparecem
    for ausente in ("comex", "pix", "estban", "empresas", "caged", "vaf", "bolsa_familia"):
        assert ausente not in bases
    assert periodo == "2022"


def test_payload_geral_sem_nada_devolve_bases_vazias(db):
    from app.models.municipio import Municipio
    from app.services.insights_service import _fetch_dados
    m2 = Municipio(nome="Beta", estado="MG")
    db.add(m2)
    db.commit()
    dados, periodo = _fetch_dados(db, m2.id, "geral")
    assert dados[0]["bases"] == {}
    assert periodo == "geral"


def test_prompt_geral_registrado():
    from app.services.insights_service import _DATASET_PROMPT_MAP, _PROMPT_GERAL
    assert _DATASET_PROMPT_MAP["geral"] is _PROMPT_GERAL
    assert "cenário" in _PROMPT_GERAL.lower()
