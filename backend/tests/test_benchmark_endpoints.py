"""/benchmark/* — envelope de pares uniforme + posição. Handlers chamados
direto (padrão do repo, sem TestClient); contrato da rota via OpenAPI."""
import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

import app.models  # noqa: F401
from app.api.v1.routers.benchmark import comparativo_benchmark, listar_indicadores
from app.db.base import Base
from app.models.municipio import Municipio
from app.models.pib import PibAnual
from app.models.populacao import PopulacaoMunicipio
from app.models.vaf import VafAnual


@pytest.fixture()
def ctx():
    engine = create_engine("sqlite://")
    Base.metadata.create_all(engine, tables=[
        Municipio.__table__, PopulacaoMunicipio.__table__,
        PibAnual.__table__, VafAnual.__table__,
    ])
    db = sessionmaker(bind=engine)()
    m1 = Municipio(nome="Alfa", estado="MG")
    m2 = Municipio(nome="Beta", estado="MG")
    m3 = Municipio(nome="Gama", estado="SP")
    demo = Municipio(nome="Demo", estado="MG", is_demo=True)
    db.add_all([m1, m2, m3, demo])
    db.flush()
    # Mesma faixa FPM (10k hab) para a cascata de pares escolher m2 e m3.
    for m in (m1, m2, m3, demo):
        db.add(PopulacaoMunicipio(municipio_id=m.id, ano=2024, populacao=10_000))
    db.commit()
    yield db, m1, m2, m3, demo
    db.close()


def _seed_pib(db, *linhas):
    for mid, ano, valor in linhas:
        db.add(PibAnual(municipio_id=mid, ano=ano, tipo_dado="REAL", pib_total=valor))
    db.commit()


def test_listar_indicadores_devolve_os_10():
    out = listar_indicadores(_mid=None)
    assert [i.key for i in out] == [
        "pib", "vaf", "arrecadacao", "caged", "rais",
        "estban", "comex", "pix", "bolsa_familia", "inss",
    ]
    assert out[0].label and out[0].unidade


def test_sem_municipio_devolve_envelope_vazio():
    out = comparativo_benchmark(indicador="pib", fixados=None, mid=None, db=object())
    assert out.motivo == "sem_municipio"
    assert out.indicador.key == "pib"
    assert out.posicao is None and out.itens == []


def test_indicador_desconhecido_da_400():
    with pytest.raises(HTTPException) as exc:
        comparativo_benchmark(indicador="nao_existe", fixados=None, mid=1, db=object())
    assert exc.value.status_code == 400


def test_municipio_sem_dado_devolve_sem_serie(ctx):
    db, m1, *_ = ctx
    out = comparativo_benchmark(indicador="pib", fixados=None, mid=m1.id, db=db)
    assert out.motivo == "sem_serie"
    assert out.itens == []


def test_envelope_com_pares_posicao_e_itens_uniformes(ctx):
    db, m1, m2, m3, demo = ctx
    _seed_pib(db, (m1.id, 2021, 100.0), (m1.id, 2022, 110.0),
              (m2.id, 2021, 200.0), (m2.id, 2022, 220.0),
              (m3.id, 2021, 50.0), (m3.id, 2022, 60.0),
              (demo.id, 2021, 999.0), (demo.id, 2022, 999.0))
    out = comparativo_benchmark(indicador="pib", fixados=None, mid=m1.id, db=db)
    assert out.foco.nome == "Alfa"
    assert {p.nome for p in out.pares} == {"Beta", "Gama"}
    # Posição no último ano (2022): nacional 110 < 220 → #2 de 3; MG: #2 de 2.
    assert out.posicao.ano == 2022
    assert out.posicao.nacional.rank == 2 and out.posicao.nacional.total == 3
    assert out.posicao.estadual.rank == 2 and out.posicao.estadual.total == 2
    ids = {i.municipio_id for i in out.itens}
    assert demo.id not in ids and ids == {m1.id, m2.id, m3.id}
    primeiro = out.itens[0]
    assert {"ano", "municipio_id", "cidade", "valor"} <= set(primeiro.model_dump())
    assert [i.ano for i in out.itens] == sorted(i.ano for i in out.itens)


def test_fixado_sai_dos_pares_e_entra_em_fixados(ctx):
    db, m1, m2, m3, _ = ctx
    _seed_pib(db, (m1.id, 2022, 100.0), (m2.id, 2022, 200.0), (m3.id, 2022, 50.0))
    out = comparativo_benchmark(indicador="pib", fixados=str(m3.id), mid=m1.id, db=db)
    assert [f.municipio_id for f in out.fixados] == [m3.id]
    assert all(p.municipio_id != m3.id for p in out.pares)


def test_vaf_serie_por_ano_base(ctx):
    db, m1, m2, *_ = ctx
    db.add_all([
        VafAnual(municipio_id=m1.id, ano_base=2021, indice_participacao_municipal=0.5),
        VafAnual(municipio_id=m1.id, ano_base=2022, indice_participacao_municipal=0.6),
        VafAnual(municipio_id=m2.id, ano_base=2021, indice_participacao_municipal=0.4),
        VafAnual(municipio_id=m2.id, ano_base=2022, indice_participacao_municipal=0.7),
    ])
    db.commit()
    out = comparativo_benchmark(indicador="vaf", fixados=None, mid=m1.id, db=db)
    assert out.indicador.unidade == "indice"
    assert {i.ano for i in out.itens} == {2021, 2022}
    assert out.posicao.nacional.rank == 2  # 0.6 < 0.7 em 2022


def _openapi():
    from app.main import app
    return app.openapi()


def test_rota_expoe_envelope_e_parametros():
    schema = _openapi()
    op = schema["paths"]["/api/v1/benchmark/comparativo"]["get"]
    ref = op["responses"]["200"]["content"]["application/json"]["schema"]["$ref"]
    assert ref.endswith("BenchmarkComparativoOut")
    props = schema["components"]["schemas"]["BenchmarkComparativoOut"]["properties"]
    assert {"indicador", "foco", "pares", "fixados", "criterio_pares",
            "motivo", "posicao", "itens"} <= set(props)
    params = {p["name"] for p in op.get("parameters", [])}
    assert {"municipio_id", "indicador", "fixados"} <= params


def test_rota_de_indicadores_registrada():
    assert "/api/v1/benchmark/indicadores" in _openapi()["paths"]


def test_foco_demo_ve_a_propria_serie_sem_posicao(ctx):
    db, m1, m2, m3, demo = ctx
    _seed_pib(db, (demo.id, 2021, 100.0), (demo.id, 2022, 110.0),
              (m1.id, 2021, 200.0), (m1.id, 2022, 220.0),
              (m2.id, 2021, 50.0), (m2.id, 2022, 60.0))
    out = comparativo_benchmark(indicador="pib", fixados=None, mid=demo.id, db=db)
    # Paridade com /pib/comparativo: demo em FOCO vê a própria série…
    assert out.motivo != "sem_serie"
    assert demo.id in {i.municipio_id for i in out.itens}
    # …mas segue fora do ranking (cobertura é demo-free → posição None).
    assert out.posicao is None


def test_municipio_inativo_fora_da_posicao(ctx):
    db, m1, m2, m3, _ = ctx
    inativo = Municipio(nome="Omega", estado="MG", ativo=False)
    db.add(inativo)
    db.flush()
    db.add(PopulacaoMunicipio(municipio_id=inativo.id, ano=2024, populacao=10_000))
    db.commit()
    _seed_pib(db, (m1.id, 2022, 110.0), (m2.id, 2022, 220.0),
              (inativo.id, 2022, 999.0))
    out = comparativo_benchmark(indicador="pib", fixados=None, mid=m1.id, db=db)
    # Nacional e estadual contam a MESMA população (refs = ativos): o inativo
    # não entra em nenhum dos dois totais.
    assert out.posicao.nacional.total == 2
    assert out.posicao.nacional.rank == 2
