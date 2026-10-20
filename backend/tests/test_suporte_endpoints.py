"""Endpoints de suporte: criacao, tenancy, admin (lista/detalhe/status/anotacao), KPIs, auditoria."""
from types import SimpleNamespace

import pytest
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker

import app.models  # noqa: F401
from app.db.base import Base
from app.models.acao_audit import AcaoAudit
from app.models.municipio import Municipio
from app.models.role import Role
from app.models.suporte import SuporteTicket, SuporteTicketEvento
from app.models.usuario import Usuario
from app.models.usuario_mfa import UsuarioMfa
from app.schemas.suporte import AnotacaoCreate, StatusUpdate, TicketCreate


class _FakeRequest:
    headers = {"user-agent": "pytest"}
    client = SimpleNamespace(host="10.0.0.1")


@pytest.fixture()
def ctx(monkeypatch):
    from app.core.rate_limit import limiter
    monkeypatch.setattr(limiter, "enabled", False)
    engine = create_engine("sqlite://")

    @event.listens_for(engine, "connect")
    def _fk_on(dbapi_conn, _record):
        dbapi_conn.execute("PRAGMA foreign_keys=ON")

    # UsuarioMfa entra porque a Task 5 exclui um usuario (relationship 1:1 com cascade).
    Base.metadata.create_all(engine, tables=[
        Municipio.__table__, Role.__table__, Usuario.__table__, UsuarioMfa.__table__,
        AcaoAudit.__table__, SuporteTicket.__table__, SuporteTicketEvento.__table__,
    ])
    db = sessionmaker(bind=engine)()
    role_g = Role(nome="ADMIN_GLOBAL", builtin=True, permissoes={})
    role_v = Role(nome="VISUALIZADOR", builtin=True, permissoes={})
    m1 = Municipio(nome="Alfa", estado="MG")
    m2 = Municipio(nome="Beta", estado="MG")
    db.add_all([role_g, role_v, m1, m2])
    db.flush()
    admin = Usuario(nome="Admin", email="admin@x.com", senha_hash="x", role_id=role_g.id)
    u1 = Usuario(nome="Ana", email="ana@alfa.gov.br", senha_hash="x", role_id=role_v.id, municipio_id=m1.id)
    u2 = Usuario(nome="Bia", email="bia@beta.gov.br", senha_hash="x", role_id=role_v.id, municipio_id=m2.id)
    db.add_all([admin, u1, u2])
    db.commit()
    yield db, admin, u1, u2, m1, m2
    db.close()


def _criar(db, user, **kw):
    from app.api.v1.routers.suporte import criar_ticket
    data = TicketCreate(**{"mensagem": "Nao consigo exportar o grafico do PIB.", **kw})
    return criar_ticket(request=_FakeRequest(), data=data, db=db, current_user=user)


def test_criar_ticket_preenche_snapshots_e_evento_abertura(ctx):
    db, _, u1, _, m1, _ = ctx
    t = _criar(db, u1, whatsapp="(37) 99999-9999", canal_preferido="whatsapp")
    assert t.status == "aberto"
    assert (t.usuario_id, t.usuario_nome, t.usuario_email, t.usuario_role) == (u1.id, "Ana", "ana@alfa.gov.br", "VISUALIZADOR")
    assert (t.municipio_id, t.municipio_nome) == (m1.id, "Alfa")
    assert t.whatsapp == "5537999999999" and t.canal_preferido == "whatsapp"
    assert [e.tipo for e in t.eventos] == ["abertura"]
    assert t.eventos[0].autor_email == "ana@alfa.gov.br"


def test_admin_global_abre_ticket_sem_municipio(ctx):
    db, admin, *_ = ctx
    t = _criar(db, admin)
    assert t.municipio_id is None and t.municipio_nome is None
    assert t.usuario_role == "ADMIN_GLOBAL"


def test_meus_tickets_so_do_proprio_usuario_mais_recente_primeiro(ctx):
    from app.api.v1.routers.suporte import listar_meus_tickets
    db, _, u1, u2, *_ = ctx
    a = _criar(db, u1, mensagem="Primeiro ticket da Ana")
    _criar(db, u2, mensagem="Ticket da Bia que nao pode vazar")
    b = _criar(db, u1, mensagem="Segundo ticket da Ana")
    meus = listar_meus_tickets(db=db, current_user=u1)
    assert [t.id for t in meus] == [b.id, a.id]


def test_rotas_do_usuario_registradas_no_app():
    from app.main import app
    rotas = {r.path: r for r in app.routes if hasattr(r, "path")}
    assert rotas["/api/v1/suporte/tickets"].methods == {"POST"}
    assert "/api/v1/suporte/tickets/meus" in rotas
