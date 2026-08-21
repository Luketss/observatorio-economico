"""Endpoints do Cidade Inteligente: CRUD, tenancy, permissões, progresso,
validação de evidência e view-as — moldes da F3 (contatos/demandas)."""
import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

import app.models  # noqa: F401
from app.core.exceptions import ForbiddenException, NotFoundException
from app.db.base import Base
from app.models.cidade_inteligente import CertificacaoCidade, CertificacaoRequisito
from app.models.municipio import Municipio
from app.models.role import Role
from app.models.usuario import Usuario
from app.schemas.cidade_inteligente import (
    CertificacaoCreate, CertificacaoUpdate, RequisitoCreate, RequisitoUpdate,
)


@pytest.fixture()
def ctx():
    engine = create_engine("sqlite://")
    Base.metadata.create_all(engine, tables=[
        Municipio.__table__, Role.__table__, Usuario.__table__,
        CertificacaoCidade.__table__, CertificacaoRequisito.__table__,
    ])
    db = sessionmaker(bind=engine)()
    role_g = Role(nome="ADMIN_GLOBAL", builtin=True, permissoes={})
    role_m = Role(nome="GESTOR", builtin=False,
                  permissoes={"cidade_inteligente": ["criar", "editar", "excluir"]})
    role_sem = Role(nome="LEITOR", builtin=False, permissoes={})
    m1 = Municipio(nome="Alfa", estado="MG")
    m2 = Municipio(nome="Beta", estado="MG")
    db.add_all([role_g, role_m, role_sem, m1, m2])
    db.flush()
    admin = Usuario(nome="G", email="g@x.com", senha_hash="x", role_id=role_g.id)
    u1 = Usuario(nome="U1", email="u1@x.com", senha_hash="x", role_id=role_m.id, municipio_id=m1.id)
    u2 = Usuario(nome="U2", email="u2@x.com", senha_hash="x", role_id=role_m.id, municipio_id=m2.id)
    leitor = Usuario(nome="L", email="l@x.com", senha_hash="x", role_id=role_sem.id, municipio_id=m1.id)
    db.add_all([admin, u1, u2, leitor])
    db.commit()
    yield db, admin, u1, u2, leitor, m1, m2
    db.close()


def _criar_cert(db, user, **kw):
    from app.api.v1.routers.cidade_inteligente import criar_certificacao
    data = CertificacaoCreate(nome=kw.pop("nome", "ISO 37122"), **kw)
    return criar_certificacao(data, db=db, current_user=user)


def _add_req(db, user, cert_id, **kw):
    from app.api.v1.routers.cidade_inteligente import adicionar_requisito
    data = RequisitoCreate(titulo=kw.pop("titulo", "R"), **kw)
    return adicionar_requisito(cert_id, data, db=db, current_user=user)


def test_criar_e_listar_com_contadores(ctx):
    from app.api.v1.routers.cidade_inteligente import listar_certificacoes
    db, _, u1, *_ = ctx
    cert = _criar_cert(db, u1, entidade="ABNT")
    _add_req(db, u1, cert.id, titulo="A", status="atendido")
    _add_req(db, u1, cert.id, titulo="B", status="em_andamento")
    _add_req(db, u1, cert.id, titulo="C")
    out = listar_certificacoes(municipio_id=None, db=db, current_user=u1)
    assert len(out) == 1
    r = out[0]
    assert (r.total, r.atendidos, r.em_andamento, r.pendentes) == (3, 1, 1, 1)


def test_listar_nao_vaza_outro_municipio(ctx):
    from app.api.v1.routers.cidade_inteligente import listar_certificacoes
    db, _, u1, u2, *_ = ctx
    _criar_cert(db, u1)
    # u2 não vê a certificação de m1; e o query param não fura o escopo
    assert listar_certificacoes(municipio_id=None, db=db, current_user=u2) == []
    assert listar_certificacoes(municipio_id=1, db=db, current_user=u2) == []


def test_view_as_global_le_por_municipio(ctx):
    from app.api.v1.routers.cidade_inteligente import listar_certificacoes
    db, admin, u1, _, _, m1, m2 = ctx
    _criar_cert(db, u1)
    assert len(listar_certificacoes(municipio_id=m1.id, db=db, current_user=admin)) == 1
    assert listar_certificacoes(municipio_id=m2.id, db=db, current_user=admin) == []


def test_detalhe_com_requisitos_e_tenancy(ctx):
    from app.api.v1.routers.cidade_inteligente import detalhe_certificacao
    db, _, u1, u2, *_ = ctx
    cert = _criar_cert(db, u1)
    _add_req(db, u1, cert.id, titulo="Z", categoria="Energia")
    out = detalhe_certificacao(cert.id, db=db, current_user=u1)
    assert [r.titulo for r in out.requisitos] == ["Z"]
    with pytest.raises(ForbiddenException):
        detalhe_certificacao(cert.id, db=db, current_user=u2)


def test_sem_permissao_nao_cria(ctx):
    db, _, _, _, leitor, *_ = ctx
    with pytest.raises(ForbiddenException):
        _criar_cert(db, leitor)


def test_status_invalido_rejeitado_no_schema():
    with pytest.raises(Exception):
        RequisitoCreate(titulo="X", status="feito")


def test_evidencia_url_validada(ctx):
    db, _, u1, *_ = ctx
    cert = _criar_cert(db, u1)
    with pytest.raises(HTTPException) as exc:
        _add_req(db, u1, cert.id, evidencia_url="ftp://x")
    assert exc.value.status_code == 400
    ok = _add_req(db, u1, cert.id, evidencia_url="https://doc.gov.br/x")
    assert ok.evidencia_url == "https://doc.gov.br/x"
    vazio = _add_req(db, u1, cert.id, evidencia_url="")
    assert vazio.evidencia_url is None


def test_update_requisito_e_limpar_evidencia(ctx):
    from app.api.v1.routers.cidade_inteligente import atualizar_requisito
    db, _, u1, *_ = ctx
    cert = _criar_cert(db, u1)
    req = _add_req(db, u1, cert.id, evidencia_url="https://x.gov.br")
    upd = atualizar_requisito(req.id, RequisitoUpdate(status="atendido"), db=db, current_user=u1)
    assert upd.status == "atendido" and upd.evidencia_url == "https://x.gov.br"
    limpo = atualizar_requisito(req.id, RequisitoUpdate(evidencia_url=""), db=db, current_user=u1)
    assert limpo.evidencia_url is None


def test_update_requisito_tenancy(ctx):
    from app.api.v1.routers.cidade_inteligente import atualizar_requisito
    db, _, u1, u2, *_ = ctx
    cert = _criar_cert(db, u1)
    req = _add_req(db, u1, cert.id)
    with pytest.raises(ForbiddenException):
        atualizar_requisito(req.id, RequisitoUpdate(status="atendido"), db=db, current_user=u2)


def test_excluir_certificacao_leva_requisitos(ctx):
    from app.api.v1.routers.cidade_inteligente import excluir_certificacao
    db, _, u1, *_ = ctx
    cert = _criar_cert(db, u1)
    _add_req(db, u1, cert.id)
    excluir_certificacao(cert.id, db=db, current_user=u1)
    assert db.query(CertificacaoRequisito).count() == 0


def test_atualizar_certificacao(ctx):
    from app.api.v1.routers.cidade_inteligente import atualizar_certificacao
    db, _, u1, *_ = ctx
    cert = _criar_cert(db, u1)
    upd = atualizar_certificacao(cert.id, CertificacaoUpdate(descricao="meta 2027"), db=db, current_user=u1)
    assert upd.descricao == "meta 2027" and upd.nome == "ISO 37122"


def test_rota_registrada_no_app():
    from app.main import app
    paths = app.openapi()["paths"]
    assert "/api/v1/cidade-inteligente/certificacoes" in paths
