"""Registry do benchmark: série anual uniforme (municipio, ano, valor) por
indicador — cada consulta espelha o endpoint comparativo homônimo — e o
cálculo puro de posição nacional/estadual."""
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

import app.models  # noqa: F401
from app.db.base import Base
from app.models.caged import CagedMovimentacao
from app.models.comex import ComexMensal
from app.models.estban import EstbanMensal
from app.models.municipio import Municipio
from app.models.pib import PibAnual
from app.models.pix import PixMensal
from app.models.vaf import VafAnual
from app.services.benchmark_service import (
    INDICADORES_BENCHMARK,
    calcular_posicao,
)

from datetime import date


@pytest.fixture()
def ctx():
    engine = create_engine("sqlite://")
    Base.metadata.create_all(engine, tables=[
        Municipio.__table__, PibAnual.__table__, VafAnual.__table__,
        CagedMovimentacao.__table__, EstbanMensal.__table__,
        ComexMensal.__table__, PixMensal.__table__,
    ])
    db = sessionmaker(bind=engine)()
    m1 = Municipio(nome="Alfa", estado="MG")
    m2 = Municipio(nome="Beta", estado="MG")
    demo = Municipio(nome="Demo", estado="MG", is_demo=True)
    db.add_all([m1, m2, demo])
    db.commit()
    yield db, m1, m2, demo
    db.close()


def test_registry_tem_as_10_chaves_na_ordem():
    assert list(INDICADORES_BENCHMARK) == [
        "pib", "vaf", "arrecadacao", "caged", "rais",
        "estban", "comex", "pix", "bolsa_familia", "inss",
    ]
    for ind in INDICADORES_BENCHMARK.values():
        assert ind.unidade in ("brl", "usd", "numero", "indice")


def test_pib_uma_linha_por_ano_e_demo_fora(ctx):
    db, m1, m2, demo = ctx
    db.add_all([
        PibAnual(municipio_id=m1.id, ano=2021, tipo_dado="REAL", pib_total=100.0),
        PibAnual(municipio_id=m1.id, ano=2022, tipo_dado="REAL", pib_total=110.0),
        # REAL e PROJETADO no MESMO ano: max() não pode virar soma (215).
        PibAnual(municipio_id=m1.id, ano=2022, tipo_dado="PROJETADO", pib_total=105.0),
        PibAnual(municipio_id=m2.id, ano=2022, tipo_dado="REAL", pib_total=220.0),
        PibAnual(municipio_id=demo.id, ano=2022, tipo_dado="REAL", pib_total=999.0),
    ])
    db.commit()
    linhas = INDICADORES_BENCHMARK["pib"].linhas(db)
    assert (m1.id, 2022, 110.0) in linhas and (m2.id, 2022, 220.0) in linhas
    assert all(mid != demo.id for mid, _, _ in linhas)


def test_pib_filtros_de_municipio_e_ano(ctx):
    db, m1, m2, _ = ctx
    db.add_all([
        PibAnual(municipio_id=m1.id, ano=2021, tipo_dado="REAL", pib_total=100.0),
        PibAnual(municipio_id=m1.id, ano=2022, tipo_dado="REAL", pib_total=110.0),
        PibAnual(municipio_id=m2.id, ano=2022, tipo_dado="REAL", pib_total=220.0),
    ])
    db.commit()
    ind = INDICADORES_BENCHMARK["pib"]
    assert ind.linhas(db, municipio_ids=[m1.id]) == [(m1.id, 2021, 100.0), (m1.id, 2022, 110.0)]
    assert {t[0] for t in ind.linhas(db, anos={2022})} == {m1.id, m2.id}


def test_vaf_usa_ano_base_e_unidade_indice(ctx):
    db, m1, _, _ = ctx
    db.add(VafAnual(municipio_id=m1.id, ano_base=2021, pct_ipm=0.1234))
    db.commit()
    ind = INDICADORES_BENCHMARK["vaf"]
    assert ind.unidade == "indice"
    assert ind.linhas(db) == [(m1.id, 2021, 0.1234)]


def test_caged_soma_meses_do_ano(ctx):
    db, m1, _, _ = ctx
    db.add_all([
        CagedMovimentacao(municipio_id=m1.id, ano=2022, mes=1, admissoes=10, desligamentos=4, saldo=6),
        CagedMovimentacao(municipio_id=m1.id, ano=2022, mes=2, admissoes=5, desligamentos=8, saldo=-3),
    ])
    db.commit()
    assert INDICADORES_BENCHMARK["caged"].linhas(db) == [(m1.id, 2022, 3.0)]


def test_estban_agrupa_por_ano_da_data_referencia(ctx):
    db, m1, _, _ = ctx
    db.add_all([
        EstbanMensal(municipio_id=m1.id, data_referencia=date(2022, 1, 1), qtd_agencias=1,
                     valor_operacoes_credito=100.0, valor_depositos_vista=0,
                     valor_poupanca=0, valor_depositos_prazo=0),
        EstbanMensal(municipio_id=m1.id, data_referencia=date(2022, 2, 1), qtd_agencias=1,
                     valor_operacoes_credito=50.0, valor_depositos_vista=0,
                     valor_poupanca=0, valor_depositos_prazo=0),
    ])
    db.commit()
    assert INDICADORES_BENCHMARK["estban"].linhas(db) == [(m1.id, 2022, 150.0)]


def test_comex_soma_so_exportacoes_case_insensitive(ctx):
    db, m1, _, _ = ctx
    db.add_all([
        ComexMensal(municipio_id=m1.id, ano=2022, mes=1, tipo_operacao="export", valor_usd=10.0, peso_kg=100.0),
        ComexMensal(municipio_id=m1.id, ano=2022, mes=2, tipo_operacao="EXP", valor_usd=5.0, peso_kg=50.0),
        ComexMensal(municipio_id=m1.id, ano=2022, mes=3, tipo_operacao="import", valor_usd=99.0, peso_kg=200.0),
    ])
    db.commit()
    ind = INDICADORES_BENCHMARK["comex"]
    assert ind.unidade == "usd"
    assert ind.linhas(db) == [(m1.id, 2022, 15.0)]


def test_pix_soma_pf_e_pj_com_nulos(ctx):
    db, m1, _, _ = ctx
    db.add_all([
        PixMensal(municipio_id=m1.id, ano=2022, mes=1, vl_pagador_pf=10.0, vl_pagador_pj=None),
        PixMensal(municipio_id=m1.id, ano=2022, mes=2, vl_pagador_pf=None, vl_pagador_pj=20.0),
    ])
    db.commit()
    assert INDICADORES_BENCHMARK["pix"].linhas(db) == [(m1.id, 2022, 30.0)]


def test_posicao_nacional_e_estadual():
    valores = [(1, 110.0), (2, 220.0), (3, 60.0)]
    estados = {1: "MG", 2: "MG", 3: "SP"}
    pos = calcular_posicao(valores, estados, foco_id=1, ano=2022)
    assert pos == {
        "ano": 2022,
        "nacional": {"rank": 2, "total": 3},
        "estadual": {"rank": 2, "total": 2},
    }


def test_posicao_sem_valor_do_foco_devolve_none():
    assert calcular_posicao([(2, 220.0)], {2: "MG"}, foco_id=1, ano=2022) is None
