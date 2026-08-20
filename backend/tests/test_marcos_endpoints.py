"""Timeline do Mandato: 4 tipos novos de marco, campo link (validação http(s))
e tenancy básica do listar."""
from datetime import date

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

import app.models  # noqa: F401
from app.db.base import Base
from app.models.marco import Marco
from app.models.municipio import Municipio
from app.models.role import Role
from app.models.usuario import Usuario


@pytest.fixture()
def ctx():
    engine = create_engine("sqlite://")
    Base.metadata.create_all(engine, tables=[
        Municipio.__table__, Role.__table__, Usuario.__table__, Marco.__table__,
    ])
    db = sessionmaker(bind=engine)()
    role_g = Role(nome="ADMIN_GLOBAL", builtin=True, permissoes={})
    role_m = Role(nome="GESTOR", builtin=False,
                  permissoes={"mandato": ["criar", "editar", "excluir"]})
    m1 = Municipio(nome="Alfa", estado="MG")
    m2 = Municipio(nome="Beta", estado="MG")
    db.add_all([role_g, role_m, m1, m2])
    db.flush()
    admin = Usuario(nome="G", email="g@x.com", senha_hash="x", role_id=role_g.id)
    u1 = Usuario(nome="U1", email="u1@x.com", senha_hash="x", role_id=role_m.id, municipio_id=m1.id)
    u2 = Usuario(nome="U2", email="u2@x.com", senha_hash="x", role_id=role_m.id, municipio_id=m2.id)
    db.add_all([admin, u1, u2])
    db.commit()
    yield db, admin, u1, u2, m1, m2
    db.close()


def test_criar_marco_aceita_tipos_novos(ctx):
    from app.api.v1.routers.marcos import MarcoCreate, criar_marco
    db, _, u1, *_ = ctx
    for tipo in ("premiacao", "legislacao", "convenio", "investimento"):
        out = criar_marco(
            MarcoCreate(data=date(2026, 8, 1), titulo=f"Marco {tipo}", tipo=tipo),
            db=db, current_user=u1,
        )
        assert out.tipo == tipo


def test_criar_marco_tipo_invalido_400(ctx):
    from app.api.v1.routers.marcos import MarcoCreate, criar_marco
    db, _, u1, *_ = ctx
    with pytest.raises(HTTPException) as exc:
        criar_marco(MarcoCreate(data=date(2026, 8, 1), titulo="X", tipo="invalido"),
                    db=db, current_user=u1)
    assert exc.value.status_code == 400


def test_criar_marco_com_link_http_e_https_roundtrip(ctx):
    from app.api.v1.routers.marcos import MarcoCreate, criar_marco
    db, _, u1, *_ = ctx
    out1 = criar_marco(MarcoCreate(data=date(2026, 8, 1), titulo="A", link="http://exemplo.com/a"),
                       db=db, current_user=u1)
    out2 = criar_marco(MarcoCreate(data=date(2026, 8, 1), titulo="B", link="https://exemplo.com/b"),
                       db=db, current_user=u1)
    assert out1.link == "http://exemplo.com/a"
    assert out2.link == "https://exemplo.com/b"


def test_criar_marco_link_invalido_400(ctx):
    from app.api.v1.routers.marcos import MarcoCreate, criar_marco
    db, _, u1, *_ = ctx
    with pytest.raises(HTTPException) as exc:
        criar_marco(MarcoCreate(data=date(2026, 8, 1), titulo="X", link="ftp://x"),
                    db=db, current_user=u1)
    assert exc.value.status_code == 400


def test_criar_marco_link_vazio_vira_none(ctx):
    from app.api.v1.routers.marcos import MarcoCreate, criar_marco
    db, _, u1, *_ = ctx
    out = criar_marco(MarcoCreate(data=date(2026, 8, 1), titulo="X", link=""),
                      db=db, current_user=u1)
    assert out.link is None


def test_atualizar_link_persiste(ctx):
    from app.api.v1.routers.marcos import MarcoCreate, MarcoUpdate, atualizar_marco, criar_marco
    db, _, u1, *_ = ctx
    out = criar_marco(MarcoCreate(data=date(2026, 8, 1), titulo="X"), db=db, current_user=u1)
    upd = atualizar_marco(out.id, MarcoUpdate(link="https://exemplo.com/z"), db=db, current_user=u1)
    assert upd.link == "https://exemplo.com/z"


def test_atualizar_outro_campo_nao_apaga_link(ctx):
    from app.api.v1.routers.marcos import MarcoCreate, MarcoUpdate, atualizar_marco, criar_marco
    db, _, u1, *_ = ctx
    out = criar_marco(MarcoCreate(data=date(2026, 8, 1), titulo="X", link="https://exemplo.com/z"),
                      db=db, current_user=u1)
    upd = atualizar_marco(out.id, MarcoUpdate(titulo="Y"), db=db, current_user=u1)
    assert upd.titulo == "Y"
    assert upd.link == "https://exemplo.com/z"


def test_listar_retorna_apenas_ativos_do_municipio_do_usuario(ctx):
    from app.api.v1.routers.marcos import (
        MarcoCreate, MarcoUpdate, atualizar_marco, criar_marco, listar_marcos,
    )
    db, _, u1, u2, *_ = ctx
    criar_marco(MarcoCreate(data=date(2026, 8, 1), titulo="Ativo M1"), db=db, current_user=u1)
    inativo = criar_marco(MarcoCreate(data=date(2026, 8, 2), titulo="Inativo M1"), db=db, current_user=u1)
    atualizar_marco(inativo.id, MarcoUpdate(ativo=False), db=db, current_user=u1)
    criar_marco(MarcoCreate(data=date(2026, 8, 1), titulo="M2"), db=db, current_user=u2)

    out = listar_marcos(municipio_id=None, db=db, current_user=u1)
    assert [m.titulo for m in out] == ["Ativo M1"]
