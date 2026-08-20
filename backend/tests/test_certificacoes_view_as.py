"""View-as (municipio_id) nas listagens de captação, escrita e premiações —
espelho do comportamento do listar_retencao (F3)."""
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

import app.models  # noqa: F401
from app.db.base import Base
from app.models.desenvolvimento_economico import (
    CaptacaoRecurso, EscritaProjeto, Premiacao,
)
from app.models.municipio import Municipio
from app.models.role import Role
from app.models.usuario import Usuario


@pytest.fixture()
def ctx():
    engine = create_engine("sqlite://")
    Base.metadata.create_all(engine, tables=[
        Municipio.__table__, Role.__table__, Usuario.__table__,
        CaptacaoRecurso.__table__, EscritaProjeto.__table__, Premiacao.__table__,
    ])
    db = sessionmaker(bind=engine)()
    role_g = Role(nome="ADMIN_GLOBAL", builtin=True, permissoes={})
    role_m = Role(nome="GESTOR", builtin=False, permissoes={})
    m1 = Municipio(nome="Alfa", estado="MG")
    m2 = Municipio(nome="Beta", estado="MG")
    db.add_all([role_g, role_m, m1, m2])
    db.flush()
    admin = Usuario(nome="G", email="g@x.com", senha_hash="x", role_id=role_g.id)
    u1 = Usuario(nome="U1", email="u1@x.com", senha_hash="x", role_id=role_m.id, municipio_id=m1.id)
    db.add_all([admin, u1])
    db.add_all([
        CaptacaoRecurso(municipio_id=m1.id, titulo="Edital Alfa"),
        CaptacaoRecurso(municipio_id=m2.id, titulo="Edital Beta"),
        EscritaProjeto(municipio_id=m1.id, titulo="Projeto Alfa"),
        EscritaProjeto(municipio_id=m2.id, titulo="Projeto Beta"),
        Premiacao(municipio_id=m1.id, titulo="Prêmio Alfa"),
        Premiacao(municipio_id=m2.id, titulo="Prêmio Beta"),
    ])
    db.commit()
    yield db, admin, u1, m1, m2
    db.close()


def test_captacao_view_as(ctx):
    from app.api.v1.routers.desenvolvimento_economico import listar_captacao
    db, admin, u1, m1, m2 = ctx
    assert len(listar_captacao(municipio_id=None, db=db, current_user=admin)) == 2
    so_m1 = listar_captacao(municipio_id=m1.id, db=db, current_user=admin)
    assert [i.titulo for i in so_m1] == ["Edital Alfa"]
    u1_ignora = listar_captacao(municipio_id=m2.id, db=db, current_user=u1)
    assert [i.titulo for i in u1_ignora] == ["Edital Alfa"]


def test_escrita_view_as(ctx):
    from app.api.v1.routers.desenvolvimento_economico import listar_escrita
    db, admin, u1, m1, m2 = ctx
    assert len(listar_escrita(municipio_id=None, db=db, current_user=admin)) == 2
    assert [i.titulo for i in listar_escrita(municipio_id=m2.id, db=db, current_user=admin)] == ["Projeto Beta"]
    assert [i.titulo for i in listar_escrita(municipio_id=m2.id, db=db, current_user=u1)] == ["Projeto Alfa"]


def test_premiacoes_view_as(ctx):
    from app.api.v1.routers.desenvolvimento_economico import listar_premiacoes
    db, admin, u1, m1, m2 = ctx
    assert len(listar_premiacoes(municipio_id=None, db=db, current_user=admin)) == 2
    assert [i.titulo for i in listar_premiacoes(municipio_id=m1.id, db=db, current_user=admin)] == ["Prêmio Alfa"]
    assert [i.titulo for i in listar_premiacoes(municipio_id=m1.id, db=db, current_user=u1)] == ["Prêmio Alfa"]
