"""Dataset 'geral' consolidado do insights_service: payload compacto por base,
bases sem dado omitidas, prompt executivo registrado."""
from datetime import date

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

import app.models  # noqa: F401
from app.db.base import Base
from app.models.arrecadacao import ArrecadacaoMensal
from app.models.bolsa_familia import BolsaFamiliaResumo
from app.models.caged import CagedMovimentacao
from app.models.comex import ComexMensal
from app.models.empresa import Empresa
from app.models.estban import EstbanMensal
from app.models.municipio import Municipio
from app.models.pib import PibAnual
from app.models.pix import PixMensal
from app.models.vaf import VafAnual


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
    assert bases["pib"]["tipo_dado"] == "REAL"
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


def test_payload_geral_agrega_as_6_bases_restantes_quando_ha_dados(db):
    """Caminho 'com dados' das bases caged/vaf/empresas/estban/comex/pix/bolsa_familia
    — a fixture `db` só semeia pib/arrecadacao; aqui completamos com o mínimo de
    linhas reais (campos NOT NULL preenchidos) para exercitar a agregação de cada
    bloco, não só a ausência."""
    from app.services.insights_service import _fetch_dados

    mid = db.mid

    db.add_all([
        CagedMovimentacao(municipio_id=mid, ano=2026, mes=12, admissoes=100, desligamentos=80, saldo=20),
        CagedMovimentacao(municipio_id=mid, ano=2026, mes=11, admissoes=90, desligamentos=95, saldo=-5),
    ])
    db.add(VafAnual(municipio_id=mid, ano_base=2024, pct_ipm=0.5432))
    db.add_all([
        Empresa(municipio_id=mid, cnpj_basico="11111111", razao_social="Empresa Ativa", situacao="02"),
        Empresa(municipio_id=mid, cnpj_basico="22222222", razao_social="Empresa Baixada", situacao="08"),
    ])
    db.add(EstbanMensal(
        municipio_id=mid, data_referencia=date(2026, 12, 1), qtd_agencias=3,
        valor_operacoes_credito=500.0, valor_depositos_vista=100.0,
        valor_poupanca=50.0, valor_depositos_prazo=25.0,
    ))
    db.add_all([
        ComexMensal(municipio_id=mid, ano=2026, mes=12, tipo_operacao="export", valor_usd=1000.0, peso_kg=10.0),
        ComexMensal(municipio_id=mid, ano=2026, mes=12, tipo_operacao="import", valor_usd=400.0, peso_kg=5.0),
    ])
    db.add(PixMensal(municipio_id=mid, ano=2026, mes=12, vl_pagador_pf=300.0, vl_pagador_pj=700.0))
    db.add(BolsaFamiliaResumo(
        municipio_id=mid, ano=2026, mes=12,
        total_beneficiarios=150, valor_total=30000.0, valor_bolsa=25000.0,
    ))
    db.commit()

    dados, _ = _fetch_dados(db, mid, "geral")
    bases = dados[0]["bases"]

    assert bases["caged"]["saldo_12m"] == 15
    assert bases["caged"]["ultimo_mes"] == "2026-12"

    assert bases["vaf"]["ano_base"] == 2024
    assert bases["vaf"]["pct_ipm"] == 0.5432

    assert bases["empresas"] == {"total": 2, "ativas": 1}

    assert bases["estban"]["ultimo_mes"] == "2026-12"
    assert bases["estban"]["credito_total"] == 500.0
    assert bases["estban"]["depositos_total"] == 175.0

    assert bases["comex"]["exportado_12m"] == 1000.0
    assert bases["comex"]["importado_12m"] == 400.0
    assert bases["comex"]["balanca_12m"] == 600.0

    assert bases["pix"]["volume_pf_12m"] == 300.0
    assert bases["pix"]["volume_pj_12m"] == 700.0

    assert bases["bolsa_familia"]["ultimo_mes"] == "2026-12"
    assert bases["bolsa_familia"]["beneficiarios"] == 150


def test_prompt_geral_registrado():
    from app.services.insights_service import _DATASET_PROMPT_MAP, _PROMPT_GERAL
    assert _DATASET_PROMPT_MAP["geral"] is _PROMPT_GERAL
    assert "cenário" in _PROMPT_GERAL.lower()
