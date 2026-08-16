"""Purga de auditoria: cortes puros + comportamento real em sqlite."""
from datetime import datetime, timedelta, timezone

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
from app.services.audit_service import cortes_retencao, purgar_auditoria

AGORA = datetime(2026, 8, 16, 12, 0, tzinfo=timezone.utc)


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
    yield session
    session.close()


def test_cortes_12_meses_e_5_anos():
    corte_acessos, corte_acoes = cortes_retencao(AGORA)
    assert corte_acessos == AGORA - timedelta(days=365)
    assert corte_acoes == AGORA - timedelta(days=5 * 365)


def _linha(categoria, meses_atras):
    return AcaoAudit(
        categoria=categoria, acao="usuario_criado", ator_email="a@x.com",
        criado_em=AGORA - timedelta(days=30 * meses_atras),
    )


def test_purga_respeita_os_dois_prazos(db):
    db.add(_linha("leitura", meses_atras=13))   # some (>12m)
    db.add(_linha("leitura", meses_atras=1))    # fica
    db.add(_linha("acao", meses_atras=13))      # fica (<5a)
    db.add(_linha("acao", meses_atras=6 * 12))  # some (>5a)
    db.add(LoginAudit(
        email_tentado="a@x.com", sucesso=True,
        criado_em=AGORA - timedelta(days=400),  # some (>12m)
    ))
    db.commit()

    contagens = purgar_auditoria(db, agora=AGORA)

    assert contagens == {"login_audit": 1, "leituras": 1, "acoes": 1}
    esperados = {
        ("leitura", AGORA - timedelta(days=30 * 1)),
        ("acao", AGORA - timedelta(days=30 * 13)),
    }
    restantes = {(l.categoria, l.criado_em) for l in db.query(AcaoAudit).all()}
    # SQLite may return naive datetimes; normalize both sides for comparison
    restantes_norm = {(cat, dt.replace(tzinfo=None) if dt.tzinfo else dt) for cat, dt in restantes}
    esperados_norm = {(cat, dt.replace(tzinfo=None) if dt.tzinfo else dt) for cat, dt in esperados}
    assert restantes_norm == esperados_norm
    assert db.query(LoginAudit).count() == 0


def test_purga_engole_falha():
    class _DBQuebrado:
        def query(self, *_):
            raise RuntimeError("sem banco")

        def rollback(self):
            pass

    assert purgar_auditoria(_DBQuebrado()) == {}
