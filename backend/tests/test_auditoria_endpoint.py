"""Contrato OpenAPI da rota nova + filtros do handler em sqlite."""
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

import app.models  # noqa: F401
from app.db.base import Base
from app.models.acao_audit import AcaoAudit
from app.models.login_audit import LoginAudit
from app.models.municipio import Municipio
from app.models.role import Role
from app.models.usuario import Usuario


def test_rota_acoes_existe_e_pagina_acao_audit_out():
    from app.main import app
    schema = app.openapi()
    op = schema["paths"]["/api/v1/admin/auditoria/acoes"]["get"]
    resp = op["responses"]["200"]["content"]["application/json"]["schema"]
    assert resp["$ref"].endswith("PaginatedResponse_AcaoAuditOut_")


@pytest.fixture()
def db():
    engine = create_engine("sqlite://")
    Base.metadata.create_all(
        engine,
        tables=[
            Municipio.__table__, Role.__table__, Usuario.__table__,
            LoginAudit.__table__, AcaoAudit.__table__,
        ],
    )
    session = sessionmaker(bind=engine)()
    role = Role(nome="ADMIN_GLOBAL", builtin=True, permissoes={})
    session.add(role)
    session.flush()
    session.add(Usuario(nome="Admin", email="admin@x.com", senha_hash="x",
                        role_id=role.id))
    session.commit()
    yield session
    session.close()


class _FakeRequest:
    headers = {}
    client = None


def test_filtros_categoria_e_email(db):
    from app.api.v1.routers.login_audit import listar_acoes_audit

    admin = db.query(Usuario).one()
    db.add(AcaoAudit(categoria="acao", acao="usuario_criado",
                     ator_email="admin@x.com", alvo_email="a@x.com"))
    db.add(AcaoAudit(categoria="leitura", acao="usuarios_listados",
                     ator_email="outro@x.com"))
    db.commit()

    resp = listar_acoes_audit(
        _FakeRequest(), categoria="acao", db=db, current_user=admin,
    )
    assert resp.total == 1
    assert resp.items[0].acao == "usuario_criado"

    resp = listar_acoes_audit(
        _FakeRequest(), email="outro", db=db, current_user=admin,
    )
    assert resp.total == 1
    assert resp.items[0].acao == "usuarios_listados"


def test_consulta_gera_evento_de_leitura(db):
    from app.api.v1.routers.login_audit import listar_acoes_audit

    admin = db.query(Usuario).one()
    listar_acoes_audit(_FakeRequest(), db=db, current_user=admin)

    linha = db.query(AcaoAudit).filter(
        AcaoAudit.acao == "auditoria_consultada"
    ).one()
    assert linha.categoria == "leitura"
    assert linha.detalhe == "acoes"


def test_rota_acoes_exige_admin_global():
    """403 para não-global — testa a dependency factory direto (padrão do
    repo, test_access_control.py): o Depends do handler é require_role."""
    import inspect
    from types import SimpleNamespace

    from app.api.v1.routers.login_audit import listar_acoes_audit
    from app.core.exceptions import ForbiddenException

    dep = inspect.signature(listar_acoes_audit).parameters["current_user"].default
    nao_global = SimpleNamespace(role=SimpleNamespace(nome="VISUALIZADOR"))
    with pytest.raises(ForbiddenException):
        dep.dependency(current_user=nao_global)
    admin = SimpleNamespace(role=SimpleNamespace(nome="ADMIN_GLOBAL"))
    assert dep.dependency(current_user=admin) is admin
