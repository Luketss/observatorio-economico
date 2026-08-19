"""Endpoints da Gestão Empresarial: CRUDs de contatos/demandas, detalhe com
perfil_rfb, derivação de cnpj_basico e view-as na listagem."""
from datetime import date

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

import app.models  # noqa: F401
from app.core.exceptions import ForbiddenException
from app.db.base import Base
from app.models.desenvolvimento_economico import (
    ContatoEmpresa, DemandaEmpresa, EmpresaRetencao, VisitaRetencao,
)
from app.models.empresa import Empresa
from app.models.municipio import Municipio
from app.models.role import Role
from app.models.usuario import Usuario
from app.schemas.desenvolvimento_economico import (
    ContatoEmpresaCreate, ContatoEmpresaUpdate,
    DemandaEmpresaCreate, DemandaEmpresaUpdate,
    EmpresaRetencaoCreate, EmpresaRetencaoUpdate,
)


@pytest.fixture()
def ctx():
    engine = create_engine("sqlite://")
    Base.metadata.create_all(engine, tables=[
        Municipio.__table__, Role.__table__, Usuario.__table__,
        EmpresaRetencao.__table__, VisitaRetencao.__table__,
        ContatoEmpresa.__table__, DemandaEmpresa.__table__, Empresa.__table__,
    ])
    db = sessionmaker(bind=engine)()
    role_g = Role(nome="ADMIN_GLOBAL", builtin=True, permissoes={})
    role_m = Role(nome="GESTOR", builtin=False,
                  permissoes={"retencao": ["criar", "editar", "excluir"]})
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


def _criar_empresa(db, user, **kw):
    from app.api.v1.routers.desenvolvimento_economico import criar_retencao
    data = EmpresaRetencaoCreate(nome=kw.pop("nome", "ACME"), **kw)
    return criar_retencao(data, db=db, current_user=user)


def test_criar_deriva_cnpj_basico_do_cnpj(ctx):
    db, _, u1, *_ = ctx
    out = _criar_empresa(db, u1, cnpj="12.345.678/0001-90")
    assert out.cnpj_basico == "12345678"


def test_criar_respeita_cnpj_basico_explicito(ctx):
    db, _, u1, *_ = ctx
    out = _criar_empresa(db, u1, cnpj="99.999.999/0001-99", cnpj_basico="12345678")
    assert out.cnpj_basico == "12345678"


def test_update_parcial_nao_apaga_cnpj_basico(ctx):
    from app.api.v1.routers.desenvolvimento_economico import atualizar_retencao
    db, _, u1, *_ = ctx
    out = _criar_empresa(db, u1, cnpj_basico="12345678")
    upd = atualizar_retencao(out.id, EmpresaRetencaoUpdate(nome="ACME 2"), db=db, current_user=u1)
    assert upd.cnpj_basico == "12345678"


def test_detalhe_inclui_perfil_rfb_contatos_demandas(ctx):
    from app.api.v1.routers.desenvolvimento_economico import (
        adicionar_contato, adicionar_demanda, detalhe_retencao,
    )
    db, _, u1, _, m1, _ = ctx
    db.add(Empresa(municipio_id=m1.id, cnpj_basico="12345678",
                   razao_social="ACME LTDA", situacao="02", porte="03"))
    db.commit()
    e = _criar_empresa(db, u1, cnpj_basico="12345678")
    adicionar_contato(e.id, ContatoEmpresaCreate(data=date(2026, 8, 1), tipo="ligacao"),
                      db=db, current_user=u1)
    adicionar_demanda(e.id, DemandaEmpresaCreate(descricao="Iluminação",
                      data_registro=date(2026, 8, 2)), db=db, current_user=u1)
    det = detalhe_retencao(e.id, db=db, current_user=u1)
    assert det.perfil_rfb is not None and det.perfil_rfb.razao_social == "ACME LTDA"
    assert len(det.contatos) == 1 and det.contatos[0].tipo == "ligacao"
    assert len(det.demandas) == 1 and det.demandas[0].status == "aberta"


def test_detalhe_sem_vinculo_perfil_none(ctx):
    from app.api.v1.routers.desenvolvimento_economico import detalhe_retencao
    db, _, u1, *_ = ctx
    e = _criar_empresa(db, u1)
    det = detalhe_retencao(e.id, db=db, current_user=u1)
    assert det.perfil_rfb is None


def test_contato_update_e_delete_com_tenant(ctx):
    from app.api.v1.routers.desenvolvimento_economico import (
        adicionar_contato, atualizar_contato, deletar_contato,
    )
    db, _, u1, u2, *_ = ctx
    e = _criar_empresa(db, u1)
    c = adicionar_contato(e.id, ContatoEmpresaCreate(data=date(2026, 8, 1)),
                          db=db, current_user=u1)
    upd = atualizar_contato(c.id, ContatoEmpresaUpdate(tipo="email"), db=db, current_user=u1)
    assert upd.tipo == "email"
    with pytest.raises(ForbiddenException):
        atualizar_contato(c.id, ContatoEmpresaUpdate(tipo="outro"), db=db, current_user=u2)
    assert deletar_contato(c.id, db=db, current_user=u1) == {"ok": True}


def test_demanda_muda_status_e_tenant(ctx):
    from app.api.v1.routers.desenvolvimento_economico import (
        adicionar_demanda, atualizar_demanda, deletar_demanda,
    )
    db, _, u1, u2, *_ = ctx
    e = _criar_empresa(db, u1)
    d = adicionar_demanda(e.id, DemandaEmpresaCreate(descricao="X",
                          data_registro=date(2026, 8, 1)), db=db, current_user=u1)
    upd = atualizar_demanda(d.id, DemandaEmpresaUpdate(status="resolvida"), db=db, current_user=u1)
    assert upd.status == "resolvida"
    with pytest.raises(ForbiddenException):
        deletar_demanda(d.id, db=db, current_user=u2)


def test_listar_view_as_para_global(ctx):
    from app.api.v1.routers.desenvolvimento_economico import listar_retencao
    db, admin, u1, u2, m1, m2 = ctx
    _criar_empresa(db, u1, nome="Alfa Co")
    _criar_empresa(db, u2, nome="Beta Co")
    todos = listar_retencao(municipio_id=None, db=db, current_user=admin)
    assert len(todos) == 2
    so_m1 = listar_retencao(municipio_id=m1.id, db=db, current_user=admin)
    assert [e.nome for e in so_m1] == ["Alfa Co"]
    u1_ignora_param = listar_retencao(municipio_id=m2.id, db=db, current_user=u1)
    assert [e.nome for e in u1_ignora_param] == ["Alfa Co"]


def test_rotas_novas_no_openapi():
    from app.main import app
    paths = app.openapi()["paths"]
    assert "/api/v1/desenvolvimento-economico/retencao/{empresa_id}/contatos" in paths
    assert "/api/v1/desenvolvimento-economico/retencao/contatos/{contato_id}" in paths
    assert "/api/v1/desenvolvimento-economico/retencao/{empresa_id}/demandas" in paths
    assert "/api/v1/desenvolvimento-economico/retencao/demandas/{demanda_id}" in paths
