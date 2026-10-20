"""Modelos de suporte: defaults, relacionamento e cascade dos eventos."""
import pytest
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker

import app.models  # noqa: F401
from app.db.base import Base
from app.models.municipio import Municipio
from app.models.role import Role
from app.models.suporte import SuporteTicket, SuporteTicketEvento
from app.models.usuario import Usuario


@pytest.fixture()
def db():
    engine = create_engine("sqlite://")

    @event.listens_for(engine, "connect")
    def _fk_on(dbapi_conn, _record):
        dbapi_conn.execute("PRAGMA foreign_keys=ON")

    Base.metadata.create_all(engine, tables=[
        Municipio.__table__, Role.__table__, Usuario.__table__,
        SuporteTicket.__table__, SuporteTicketEvento.__table__,
    ])
    s = sessionmaker(bind=engine)()
    yield s
    s.close()


def _ticket(**kw):
    base = dict(usuario_nome="Ana", usuario_email="ana@x.com", usuario_role="VISUALIZADOR",
                mensagem="Nao consigo exportar o grafico do PIB.", canal_preferido="email")
    base.update(kw)
    return SuporteTicket(**base)


def test_defaults_status_aberto_e_timestamps(db):
    t = _ticket()
    db.add(t)
    db.commit()
    db.refresh(t)
    assert t.status == "aberto"
    assert t.criado_em is not None and t.atualizado_em is not None
    assert t.primeiro_contato_em is None and t.resolvido_em is None
    assert t.whatsapp is None and t.municipio_id is None


def test_eventos_ordenados_por_id_e_cascade_no_delete(db):
    t = _ticket()
    t.eventos.append(SuporteTicketEvento(tipo="abertura", autor_email="ana@x.com"))
    t.eventos.append(SuporteTicketEvento(tipo="anotacao", texto="liguei", autor_email="adm@x.com"))
    db.add(t)
    db.commit()
    assert [e.tipo for e in t.eventos] == ["abertura", "anotacao"]
    db.delete(t)
    db.commit()
    assert db.query(SuporteTicketEvento).count() == 0


def test_migracao_0045_encadeia_na_0044():
    # Le o arquivo: `alembic/` local colide com o pacote instalado, nao da para importar.
    import pathlib
    import re
    src = pathlib.Path(__file__).resolve().parents[1] / "alembic" / "versions" / "0045_suporte_tickets.py"
    texto = src.read_text(encoding="utf-8")
    assert re.search(r'^revision\s*=\s*"0045_suporte_tickets"', texto, re.M)
    assert re.search(r'^down_revision\s*=\s*"0044_usuario_mfa_email"', texto, re.M)
