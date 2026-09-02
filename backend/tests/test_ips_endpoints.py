"""Endpoints do IPS: anos disponíveis e ano padrão dinâmico.

Bug reportado (set/2026): o IPS 2026 foi carregado pela tela de coletas e o
front não tinha como filtrá-lo — a lista de anos era fixa ([2024, 2025]) e o
backend assumia 2025 quando o ano não vinha na chamada (caso do Painel do
Prefeito, que também não mandava municipio_id e recebia 422 em silêncio).
"""
import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

import app.models  # noqa: F401
from app.api.v1.routers.ips import (
    comparativo,
    destaques,
    listar_anos,
    listar_municipios,
    ranking,
    scorecard,
    sugestoes,
)
from app.db.base import Base
from app.models.ips import IpsMunicipio
from app.models.municipio import Municipio
from app.models.role import Role
from app.models.usuario import Usuario


@pytest.fixture()
def ctx():
    engine = create_engine("sqlite://")
    Base.metadata.create_all(engine, tables=[
        Municipio.__table__, Role.__table__, Usuario.__table__, IpsMunicipio.__table__,
    ])
    db = sessionmaker(bind=engine)()
    alfa = Municipio(nome="Alfa", estado="MG")                 # 2024, 2025, 2026
    beta = Municipio(nome="Beta", estado="MG")                 # 2024, 2025
    gama = Municipio(nome="Gama", estado="SP")                 # sem IPS
    demo = Municipio(nome="Demo", estado="MG", is_demo=True)   # 2026 — não conta
    db.add_all([alfa, beta, gama, demo])
    db.flush()
    linhas = [
        (alfa, 2024, 60.0), (alfa, 2025, 62.0), (alfa, 2026, 64.0),
        (beta, 2024, 55.0), (beta, 2025, 57.0),
        (demo, 2026, 99.0),
    ]
    db.add_all([
        IpsMunicipio(municipio_id=m.id, ano=ano, ips_geral=v, pib_per_capita=30000.0)
        for m, ano, v in linhas
    ])
    role = Role(nome="GESTOR", builtin=False, permissoes={})
    db.add(role)
    db.flush()
    u_beta = Usuario(nome="B", email="b@x.com", senha_hash="x", role_id=role.id, municipio_id=beta.id)
    u_sem = Usuario(nome="S", email="s@x.com", senha_hash="x", role_id=role.id, municipio_id=None)
    db.add_all([u_beta, u_sem])
    db.commit()
    yield db, alfa, beta, gama, u_beta, u_sem
    db.close()


# ── /ips/anos ────────────────────────────────────────────────────────────────

def test_listar_anos_mais_recente_primeiro_com_cobertura_sem_demo(ctx):
    db, *_ = ctx
    out = listar_anos(municipio_id=None, db=db, _=None)
    assert [(a.ano, a.municipios, a.tem_municipio) for a in out] == [
        (2026, 1, None), (2025, 2, None), (2024, 2, None),
    ]


def test_listar_anos_marca_os_anos_em_que_o_municipio_tem_linha(ctx):
    db, _alfa, beta, *_ = ctx
    out = listar_anos(municipio_id=beta.id, db=db, _=None)
    assert [(a.ano, a.tem_municipio) for a in out] == [(2026, False), (2025, True), (2024, True)]


def test_listar_anos_municipio_sem_ips_marca_tudo_false(ctx):
    db, _alfa, _beta, gama, *_ = ctx
    out = listar_anos(municipio_id=gama.id, db=db, _=None)
    assert [a.tem_municipio for a in out] == [False, False, False]


def test_ano_padrao_da_base_ignora_demo(ctx):
    # Só a linha demo fica com 2026 → /anos não lista 2026 e o ano padrão da
    # base (usado por /municipios sem ano) cai para 2025.
    db, alfa, *_ = ctx
    (db.query(IpsMunicipio)
       .filter(IpsMunicipio.municipio_id == alfa.id, IpsMunicipio.ano == 2026)
       .delete())
    db.commit()
    assert [a.ano for a in listar_anos(municipio_id=None, db=db, _=None)] == [2025, 2024]
    out = listar_municipios(ano=None, estado=None, db=db, _=None)
    assert [m.nome for m in out] == ["Alfa", "Beta"]


def test_listar_anos_base_vazia(ctx):
    db, *_ = ctx
    db.query(IpsMunicipio).delete()
    db.commit()
    assert listar_anos(municipio_id=None, db=db, _=None) == []


# ── ano padrão = último ano com dados ────────────────────────────────────────

def test_scorecard_sem_ano_usa_o_ultimo_ano_do_municipio(ctx):
    db, alfa, beta, _gama, _u_beta, u_sem = ctx
    assert scorecard(municipio_id=alfa.id, ano=None, db=db, current_user=u_sem).ano == 2026
    assert scorecard(municipio_id=beta.id, ano=None, db=db, current_user=u_sem).ano == 2025


def test_scorecard_ano_explicito_continua_valendo(ctx):
    db, alfa, _beta, _gama, _u_beta, u_sem = ctx
    out = scorecard(municipio_id=alfa.id, ano=2024, db=db, current_user=u_sem)
    assert (out.ano, out.ips_geral) == (2024, 60.0)


def test_scorecard_ano_sem_dados_e_404(ctx):
    db, _alfa, beta, _gama, _u_beta, u_sem = ctx
    with pytest.raises(HTTPException) as exc:
        scorecard(municipio_id=beta.id, ano=2026, db=db, current_user=u_sem)
    assert exc.value.status_code == 404


def test_scorecard_sem_municipio_cai_no_municipio_do_usuario(ctx):
    # O Painel do Prefeito chama /ips/scorecard sem parâmetro nenhum.
    db, _alfa, beta, _gama, u_beta, _u_sem = ctx
    out = scorecard(municipio_id=None, ano=None, db=db, current_user=u_beta)
    assert (out.municipio_id, out.ano) == (beta.id, 2025)


def test_scorecard_sem_municipio_e_usuario_sem_municipio_e_400(ctx):
    db, _alfa, _beta, _gama, _u_beta, u_sem = ctx
    with pytest.raises(HTTPException) as exc:
        scorecard(municipio_id=None, ano=None, db=db, current_user=u_sem)
    assert exc.value.status_code == 400
    assert "municipio_id" in exc.value.detail


def test_scorecard_municipio_sem_ips_e_404(ctx):
    db, _alfa, _beta, gama, _u_beta, u_sem = ctx
    with pytest.raises(HTTPException) as exc:
        scorecard(municipio_id=gama.id, ano=None, db=db, current_user=u_sem)
    assert exc.value.status_code == 404


def test_listar_municipios_sem_ano_usa_o_ultimo_ano_da_base(ctx):
    db, *_ = ctx
    out = listar_municipios(ano=None, estado=None, db=db, _=None)
    assert [m.nome for m in out] == ["Alfa"]   # só Alfa tem 2026; Demo não entra


def test_listar_municipios_ano_explicito(ctx):
    db, *_ = ctx
    out = listar_municipios(ano=2025, estado="mg", db=db, _=None)
    assert [m.nome for m in out] == ["Alfa", "Beta"]


def test_ranking_sem_ano_usa_o_ultimo_ano_do_municipio(ctx):
    db, _alfa, beta, *_ = ctx
    out = ranking(municipio_id=beta.id, ano=None, db=db, _=None)
    # 2025: Alfa 62 > Beta 57 → Beta é 2º de 2 (nacional e em MG)
    assert (out.ranking_nacional, out.total_nacional) == (2, 2)
    assert (out.ranking_estadual, out.total_estadual) == (2, 2)


def test_ranking_municipio_sem_ips_e_404(ctx):
    db, _alfa, _beta, gama, *_ = ctx
    with pytest.raises(HTTPException) as exc:
        ranking(municipio_id=gama.id, ano=None, db=db, _=None)
    assert exc.value.status_code == 404


def test_destaques_sem_ano_usa_o_ultimo_ano_do_municipio(ctx):
    db, _alfa, beta, *_ = ctx
    out = destaques(municipio_id=beta.id, ano=None, db=db, _=None)
    assert (out.melhores, out.piores) == ([], [])   # sem componentes carregados, mas sem 404


def test_sugestoes_e_comparativo_sem_dados_devolvem_lista_vazia(ctx):
    db, _alfa, _beta, gama, *_ = ctx
    assert sugestoes(municipio_id=gama.id, ano=None, limit=5, db=db, _=None) == []
    assert comparativo(municipio_id=gama.id, ano=None, municipio_ids="", db=db, _=None) == []


def test_sugestoes_sem_ano_usa_o_ultimo_ano_do_municipio(ctx):
    db, alfa, beta, *_ = ctx
    # Beta em 2025: Alfa (mesmo PIB per capita, IPS 62) é a única sugestão.
    out = sugestoes(municipio_id=beta.id, ano=None, limit=5, db=db, _=None)
    assert [s.municipio_id for s in out] == [alfa.id]
