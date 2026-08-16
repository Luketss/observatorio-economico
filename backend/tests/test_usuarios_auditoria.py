"""Handlers de usuários gravam trilha em acao_audit (sqlite in-memory,
handlers chamados direto — sem TestClient, padrão do repo)."""
import pytest
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker

import app.models  # noqa: F401
from app.api.v1.routers.usuarios import (
    atualizar_usuario,
    criar_usuario,
    deletar_usuario,
)
from app.db.base import Base
from app.models.acao_audit import AcaoAudit
from app.models.login_audit import LoginAudit
from app.models.municipio import Municipio
from app.models.role import Role
from app.models.usuario import Usuario
from app.schemas.usuario import UsuarioCreate, UsuarioUpdate


class _FakeClient:
    host = "10.0.0.1"


class _FakeRequest:
    headers = {"user-agent": "pytest"}
    client = _FakeClient()


@pytest.fixture()
def db():
    engine = create_engine("sqlite://")

    @event.listens_for(engine, "connect")
    def _fk_on(dbapi_conn, _record):
        dbapi_conn.execute("PRAGMA foreign_keys=ON")

    Base.metadata.create_all(
        engine,
        tables=[
            Municipio.__table__, Role.__table__, Usuario.__table__,
            LoginAudit.__table__, AcaoAudit.__table__,
        ],
    )
    session = sessionmaker(bind=engine)()
    session.add(Role(nome="ADMIN_GLOBAL", builtin=True, permissoes={}))
    session.add(Role(nome="VISUALIZADOR", builtin=True, permissoes={}))
    session.commit()
    yield session
    session.close()


def _ator(db):
    role = db.query(Role).filter(Role.nome == "ADMIN_GLOBAL").one()
    u = Usuario(nome="Ator", email="ator@x.com", senha_hash="x", role_id=role.id)
    db.add(u)
    db.commit()
    return u


def _criar_alvo(db, ator):
    role = db.query(Role).filter(Role.nome == "VISUALIZADOR").one()
    payload = UsuarioCreate(
        nome="Alvo", email="alvo@x.com", senha="segredo123", role_id=role.id,
    )
    resp = criar_usuario(payload, _FakeRequest(), db=db, current_user=ator)
    return resp.data.id


def test_criar_usuario_gera_evento(db):
    ator = _ator(db)
    _criar_alvo(db, ator)

    linha = db.query(AcaoAudit).filter(AcaoAudit.acao == "usuario_criado").one()
    assert linha.categoria == "acao"
    assert linha.ator_email == "ator@x.com"
    assert linha.alvo_email == "alvo@x.com"
    assert "VISUALIZADOR" in (linha.detalhe or "")


def test_atualizar_com_senha_nao_vaza_valor(db):
    ator = _ator(db)
    alvo_id = _criar_alvo(db, ator)

    atualizar_usuario(
        alvo_id,
        UsuarioUpdate(senha="novaSenha456", nome="Renomeado"),
        _FakeRequest(), db=db, current_user=ator,
    )

    linha = db.query(AcaoAudit).filter(
        AcaoAudit.acao == "usuario_atualizado"
    ).one()
    assert "senha" in linha.detalhe and "nome" in linha.detalhe
    assert "novaSenha456" not in linha.detalhe


def test_atualizar_role_registra_de_para(db):
    ator = _ator(db)
    alvo_id = _criar_alvo(db, ator)
    role_global = db.query(Role).filter(Role.nome == "ADMIN_GLOBAL").one()

    atualizar_usuario(
        alvo_id, UsuarioUpdate(role_id=role_global.id),
        _FakeRequest(), db=db, current_user=ator,
    )

    linha = db.query(AcaoAudit).filter(
        AcaoAudit.acao == "usuario_atualizado"
    ).one()
    assert "VISUALIZADOR → ADMIN_GLOBAL" in linha.detalhe


def test_excluir_usuario_com_historico(db):
    ator = _ator(db)
    alvo_id = _criar_alvo(db, ator)
    db.add(LoginAudit(usuario_id=alvo_id, email_tentado="alvo@x.com", sucesso=True))
    db.commit()

    deletar_usuario(alvo_id, _FakeRequest(), db=db, current_user=ator)

    linha = db.query(AcaoAudit).filter(AcaoAudit.acao == "usuario_excluido").one()
    assert linha.alvo_usuario_id is None       # alvo já não existe
    assert linha.alvo_email == "alvo@x.com"    # snapshot preserva identidade
    assert f"usuario_id: {alvo_id}" in linha.detalhe
    assert db.query(Usuario).filter(Usuario.id == alvo_id).count() == 0
