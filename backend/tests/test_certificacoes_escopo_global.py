"""Escopo global em Captação, Escrita e Premiações (Certificações e Premiações).

O ADMIN_GLOBAL cadastra sem município; o registro global aparece para todos
os municípios (inclusive os criados depois) e só ele pode alterá-lo. Os
registros municipais continuam isolados. Os testes HTTP passam pelo
require_permissao real (só get_db e get_current_user são substituídos)."""
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import app.models  # noqa: F401
from app.db.base import Base
from app.models.desenvolvimento_economico import CaptacaoRecurso, EscritaProjeto, Premiacao
from app.models.municipio import Municipio
from app.models.role import Role
from app.models.usuario import Usuario

ROTAS = {
    "premiacoes": {"titulo": "Prêmio Global", "status": "conquistado"},
    "captacao": {"titulo": "Edital Global", "estagio": "aprovado", "valor_estimado": 1000.0},
    "escrita": {"titulo": "Modelo Global", "estagio": "submissao", "resultado": "aprovado"},
}
NEUTRO = {
    "premiacoes": {"status": "oportunidade"},
    "captacao": {"estagio": "oportunidade"},
    "escrita": {"estagio": "ideia", "resultado": None},
}
TODAS = {"premiacoes": ["criar", "editar", "excluir"], "captacao": ["criar", "editar", "excluir"],
         "escrita": ["criar", "editar", "excluir"]}


@pytest.fixture()
def ctx():
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool,
    )

    @event.listens_for(engine, "connect")
    def _fk_on(dbapi_conn, _record):
        dbapi_conn.execute("PRAGMA foreign_keys=ON")

    Base.metadata.create_all(engine, tables=[
        Municipio.__table__, Role.__table__, Usuario.__table__,
        CaptacaoRecurso.__table__, EscritaProjeto.__table__, Premiacao.__table__,
    ])
    Session = sessionmaker(bind=engine)
    db = Session()
    role_g = Role(nome="ADMIN_GLOBAL", builtin=True, permissoes={})
    role_m = Role(nome="GESTOR", builtin=False, permissoes=TODAS)
    m1 = Municipio(nome="Alfa", estado="MG")
    m2 = Municipio(nome="Beta", estado="MG")
    db.add_all([role_g, role_m, m1, m2])
    db.flush()
    admin = Usuario(nome="G", email="g@x.com", senha_hash="x", role_id=role_g.id)
    u1 = Usuario(nome="U1", email="u1@x.com", senha_hash="x", role_id=role_m.id, municipio_id=m1.id)
    u2 = Usuario(nome="U2", email="u2@x.com", senha_hash="x", role_id=role_m.id, municipio_id=m2.id)
    db.add_all([admin, u1, u2])
    db.commit()

    from app.api.deps import get_current_user, get_db
    from app.main import app

    estado = {"user_id": admin.id}

    def _db():
        s = Session()
        try:
            yield s
        finally:
            s.close()

    def _user():
        s = Session()
        u = s.get(Usuario, estado["user_id"])
        _ = u.role.nome  # carrega a role antes de devolver
        return u

    app.dependency_overrides[get_db] = _db
    app.dependency_overrides[get_current_user] = _user
    client = TestClient(app)

    def como(usuario):
        estado["user_id"] = usuario.id
        return client

    yield db, Session, como, admin, u1, u2, m1, m2, role_m
    app.dependency_overrides.clear()
    db.close()


def _url(rota, sufixo=""):
    return f"/api/v1/desenvolvimento-economico/{rota}{sufixo}"


def _titulos(resp):
    assert resp.status_code == 200, resp.text
    return sorted(i["titulo"] for i in resp.json())


@pytest.mark.parametrize("rota", list(ROTAS))
def test_admin_global_cria_sem_municipio_e_todos_os_municipios_veem(ctx, rota):
    db, Session, como, admin, u1, u2, m1, m2, role_m = ctx
    r = como(admin).post(_url(rota), json=ROTAS[rota])
    assert r.status_code == 200, r.text
    corpo = r.json()
    assert corpo["escopo"] == "global" and corpo["municipio_id"] is None
    # Andamento é municipal: o registro global nasce no estado neutro.
    for campo, valor in NEUTRO[rota].items():
        assert corpo[campo] == valor

    # Registro municipal de Alfa para conferir o isolamento.
    r = como(u1).post(_url(rota), json={"titulo": "Privado Alfa"})
    assert r.status_code == 200 and r.json()["escopo"] == "municipal"

    titulo = ROTAS[rota]["titulo"]
    assert _titulos(como(u1).get(_url(rota))) == sorted([titulo, "Privado Alfa"])
    assert _titulos(como(u2).get(_url(rota))) == [titulo]
    # Município cadastrado depois também recebe o global.
    m3 = Municipio(nome="Gama", estado="MG")
    db.add(m3)
    db.flush()
    u3 = Usuario(nome="U3", email="u3@x.com", senha_hash="x", role_id=role_m.id, municipio_id=m3.id)
    db.add(u3)
    db.commit()
    assert _titulos(como(u3).get(_url(rota))) == [titulo]
    # Persistência: nova sessão de banco lê o mesmo registro.
    assert _titulos(como(u3).get(_url(rota))) == [titulo]
    # Município não força ver o outro via parâmetro.
    assert _titulos(como(u2).get(_url(rota), params={"municipio_id": m1.id})) == [titulo]
    # ADMIN_GLOBAL: sem view-as só globais; com view-as globais + do município.
    assert _titulos(como(admin).get(_url(rota))) == [titulo]
    assert _titulos(como(admin).get(_url(rota), params={"municipio_id": m1.id})) == sorted([titulo, "Privado Alfa"])
    assert _titulos(como(admin).get(_url(rota), params={"municipio_id": m2.id})) == [titulo]


@pytest.mark.parametrize("rota", list(ROTAS))
def test_municipio_nao_cria_nem_altera_global_por_chamada_direta(ctx, rota):
    db, Session, como, admin, u1, u2, *_ = ctx
    gid = como(admin).post(_url(rota), json=ROTAS[rota]).json()["id"]

    # Tentar forjar escopo/município no payload é ignorado: nasce municipal.
    forjado = {"titulo": "Forjado", "escopo": "global", "municipio_id": None}
    r = como(u1).post(_url(rota), json=forjado)
    assert r.status_code == 200 and r.json()["escopo"] == "municipal"
    assert r.json()["municipio_id"] == u1.municipio_id

    assert como(u1).put(_url(rota, f"/{gid}"), json={"titulo": "Hack"}).status_code == 403
    assert como(u1).delete(_url(rota, f"/{gid}")).status_code == 403
    assert _titulos(como(u2).get(_url(rota))) == [ROTAS[rota]["titulo"]]


@pytest.mark.parametrize("rota", list(ROTAS))
def test_admin_global_edita_e_exclui_global_mantendo_estado_neutro(ctx, rota):
    _, _, como, admin, *_ = ctx
    gid = como(admin).post(_url(rota), json=ROTAS[rota]).json()["id"]
    r = como(admin).put(_url(rota, f"/{gid}"), json={**ROTAS[rota], "titulo": "Editado"})
    assert r.status_code == 200 and r.json()["titulo"] == "Editado"
    for campo, valor in NEUTRO[rota].items():
        assert r.json()[campo] == valor
    assert como(admin).delete(_url(rota, f"/{gid}")).status_code == 200
    assert como(admin).get(_url(rota)).json() == []


@pytest.mark.parametrize("rota", list(ROTAS))
def test_registros_municipais_continuam_isolados(ctx, rota):
    _, _, como, admin, u1, u2, *_ = ctx
    pid = como(u1).post(_url(rota), json={"titulo": "Privado Alfa"}).json()["id"]
    assert _titulos(como(u2).get(_url(rota))) == []
    assert como(u2).put(_url(rota, f"/{pid}"), json={"titulo": "x"}).status_code == 403
    assert como(u2).delete(_url(rota, f"/{pid}")).status_code == 403
    # Dono continua editando o próprio, inclusive o andamento.
    campo, valor = next(iter({k: v for k, v in ROTAS[rota].items() if k != "titulo"}.items()))
    r = como(u1).put(_url(rota, f"/{pid}"), json={campo: valor})
    assert r.status_code == 200 and r.json()[campo] == valor


def test_escrita_vincula_captacao_somente_visivel(ctx):
    _, _, como, admin, u1, u2, *_ = ctx
    cap_global = como(admin).post(_url("captacao"), json={"titulo": "Edital Global"}).json()["id"]
    cap_alfa = como(u1).post(_url("captacao"), json={"titulo": "Edital Alfa"}).json()["id"]

    # Municipal: aceita global e a do próprio município; recusa a de outro.
    assert como(u1).post(_url("escrita"), json={"titulo": "P1", "oportunidade_captacao_id": cap_global}).status_code == 200
    assert como(u1).post(_url("escrita"), json={"titulo": "P2", "oportunidade_captacao_id": cap_alfa}).status_code == 200
    assert como(u2).post(_url("escrita"), json={"titulo": "P3", "oportunidade_captacao_id": cap_alfa}).status_code == 422
    # Global: só aceita captação global (não expõe captação privada).
    assert como(admin).post(_url("escrita"), json={"titulo": "G1", "oportunidade_captacao_id": cap_alfa}).status_code == 422
    assert como(admin).post(_url("escrita"), json={"titulo": "G2", "oportunidade_captacao_id": cap_global}).status_code == 200

    # Excluir a captação global desfaz os vínculos em vez de falhar na FK.
    assert como(admin).delete(_url("captacao", f"/{cap_global}")).status_code == 200
    vinculos = {i["titulo"]: i["oportunidade_captacao_id"] for i in como(u1).get(_url("escrita")).json()}
    assert vinculos == {"P1": None, "P2": cap_alfa, "G2": None}


def test_check_constraint_impede_global_com_municipio_e_municipal_sem(ctx):
    db, _, _, _, _, _, m1, _, _ = ctx
    db.add(Premiacao(titulo="x", escopo="global", municipio_id=m1.id))
    with pytest.raises(IntegrityError):
        db.commit()
    db.rollback()
    db.add(Premiacao(titulo="y", municipio_id=None))  # escopo default = municipal
    with pytest.raises(IntegrityError):
        db.commit()
    db.rollback()
