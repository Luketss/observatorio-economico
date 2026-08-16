"""Comportamento de banco do AcaoAudit e da FK corrigida do LoginAudit.

Exceção deliberada ao padrão "sem DB": sqlite in-memory hermético com
PRAGMA foreign_keys=ON — é a única forma de testar ondelete=SET NULL e
a purga sem Postgres. Valida o METADATA dos modelos; a migração 0037
espelha o mesmo DDL (conferida por revisão, não por este teste).
"""
import pytest
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker

import app.models  # noqa: F401 — registra todos os mappers
from app.db.base import Base
from app.models.acao_audit import AcaoAudit
from app.models.login_audit import LoginAudit
from app.models.municipio import Municipio
from app.models.role import Role
from app.models.usuario import Usuario


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
    yield session
    session.close()


def _novo_usuario(db, email="ator@x.com", role_nome="ADMIN_GLOBAL"):
    role = db.query(Role).filter(Role.nome == role_nome).first()
    if not role:
        role = Role(nome=role_nome, builtin=True, permissoes={})
        db.add(role)
        db.flush()
    u = Usuario(nome="Teste", email=email, senha_hash="x", role_id=role.id)
    db.add(u)
    db.commit()
    return u


def test_excluir_ator_seta_null_e_preserva_snapshot(db):
    ator = _novo_usuario(db)
    db.add(AcaoAudit(
        categoria="acao", acao="usuario_criado",
        ator_id=ator.id, ator_email=ator.email,
    ))
    db.commit()

    db.delete(ator)
    db.commit()

    linha = db.query(AcaoAudit).one()
    assert linha.ator_id is None
    assert linha.ator_email == "ator@x.com"


def test_excluir_usuario_com_login_audit_nao_estoura(db):
    u = _novo_usuario(db, email="logou@x.com")
    db.add(LoginAudit(
        usuario_id=u.id, email_tentado=u.email, sucesso=True, motivo="ok",
    ))
    db.commit()

    db.delete(u)
    db.commit()  # antes do fix (FK sem ondelete) isto estourava

    linha = db.query(LoginAudit).one()
    assert linha.usuario_id is None
    assert linha.email_tentado == "logou@x.com"
