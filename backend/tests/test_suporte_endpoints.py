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


def _admin_dep(handler):
    import inspect
    return inspect.signature(handler).parameters["current_user"].default.dependency


def test_rotas_admin_exigem_admin_global(ctx):
    from app.api.v1.routers.suporte import detalhar_ticket_admin, kpis_suporte, listar_tickets_admin
    from app.core.exceptions import ForbiddenException
    _, _, u1, *_ = ctx
    for h in (kpis_suporte, listar_tickets_admin, detalhar_ticket_admin):
        with pytest.raises(ForbiddenException):
            _admin_dep(h)(current_user=u1)


def test_lista_admin_filtra_status_e_municipio_e_audita(ctx):
    from app.api.v1.routers.suporte import listar_tickets_admin
    db, admin, u1, u2, m1, m2 = ctx
    a = _criar(db, u1)
    b = _criar(db, u2)
    pagina = listar_tickets_admin(request=_FakeRequest(), skip=0, limit=25, status_=None,
                                  municipio_filtro=m2.id, db=db, current_user=admin)
    assert pagina.total == 1 and [t.id for t in pagina.items] == [b.id]
    pagina = listar_tickets_admin(request=_FakeRequest(), skip=0, limit=25, status_="resolvido",
                                  municipio_filtro=None, db=db, current_user=admin)
    assert pagina.total == 0
    todos = listar_tickets_admin(request=_FakeRequest(), skip=0, limit=25, status_=None,
                                 municipio_filtro=None, db=db, current_user=admin)
    assert [t.id for t in todos.items] == [b.id, a.id]
    assert todos.items[0].usuario_email == "bia@beta.gov.br"
    trilha = db.query(AcaoAudit).filter(AcaoAudit.acao == "suporte_tickets_listados").order_by(AcaoAudit.id).all()
    assert len(trilha) == 3 and trilha[0].categoria == "leitura" and trilha[0].ator_email == "admin@x.com"
    assert f"municipio={m2.id}" in trilha[0].detalhe


def test_lista_clampa_skip_e_limit(ctx):
    from app.api.v1.routers.suporte import listar_tickets_admin
    db, admin, u1, *_ = ctx
    for _ in range(3):
        _criar(db, u1)
    pagina = listar_tickets_admin(request=_FakeRequest(), skip=-5, limit=1000, status_=None,
                                  municipio_filtro=None, db=db, current_user=admin)
    assert (pagina.skip, pagina.limit, pagina.total, len(pagina.items)) == (0, 100, 3, 3)


def test_detalhe_inclui_eventos_e_audita_com_alvo(ctx):
    from app.api.v1.routers.suporte import detalhar_ticket_admin
    db, admin, u1, *_ = ctx
    t = _criar(db, u1)
    d = detalhar_ticket_admin(request=_FakeRequest(), ticket_id=t.id, db=db, current_user=admin)
    assert d.id == t.id and [e.tipo for e in d.eventos] == ["abertura"]
    row = db.query(AcaoAudit).filter(AcaoAudit.acao == "suporte_ticket_consultado").one()
    assert (row.categoria, row.alvo_usuario_id, row.alvo_email, row.municipio_id) == ("leitura", u1.id, u1.email, u1.municipio_id)


def test_detalhe_de_ticket_com_usuario_excluido_usa_snapshot(ctx):
    from app.api.v1.routers.suporte import detalhar_ticket_admin
    db, admin, u1, *_ = ctx
    t = _criar(db, u1)
    db.delete(u1)
    db.commit()
    d = detalhar_ticket_admin(request=_FakeRequest(), ticket_id=t.id, db=db, current_user=admin)
    assert d.usuario_id is None and d.usuario_email == "ana@alfa.gov.br"
    row = db.query(AcaoAudit).filter(AcaoAudit.acao == "suporte_ticket_consultado").one()
    assert row.alvo_usuario_id is None and row.alvo_email == "ana@alfa.gov.br"


def test_detalhe_inexistente_404(ctx):
    from app.api.v1.routers.suporte import detalhar_ticket_admin
    from app.core.exceptions import NotFoundException
    db, admin, *_ = ctx
    with pytest.raises(NotFoundException):
        detalhar_ticket_admin(request=_FakeRequest(), ticket_id=999, db=db, current_user=admin)


def test_kpis_contagens_e_media_de_horas(ctx):
    from datetime import datetime, timedelta, timezone
    from app.api.v1.routers.suporte import kpis_suporte
    db, admin, u1, *_ = ctx
    agora = datetime.now(timezone.utc)
    t1 = _criar(db, u1)  # aberto, sem contato
    t2 = _criar(db, u1)  # em atendimento, contato 2h depois
    t3 = _criar(db, u1)  # resolvido, contato 4h depois
    t2.status = "em_atendimento"; t2.criado_em = agora - timedelta(hours=10); t2.primeiro_contato_em = agora - timedelta(hours=8)
    t3.status = "resolvido"; t3.criado_em = agora - timedelta(hours=20); t3.primeiro_contato_em = agora - timedelta(hours=16); t3.resolvido_em = agora - timedelta(hours=1)
    db.commit()
    k = kpis_suporte(db=db, current_user=admin)
    assert (k.abertos, k.em_atendimento, k.abertos_30d, k.resolvidos_30d) == (1, 1, 3, 1)
    assert k.tempo_medio_primeiro_contato_horas == 3.0


def test_kpis_sem_contato_media_none(ctx):
    from app.api.v1.routers.suporte import kpis_suporte
    db, admin, u1, *_ = ctx
    _criar(db, u1)
    assert kpis_suporte(db=db, current_user=admin).tempo_medio_primeiro_contato_horas is None
