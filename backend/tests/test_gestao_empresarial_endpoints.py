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


# ── relevância e risco calculados (sub-frente A) ─────────────────────────────

def test_listagem_enriquecida_ordenada_por_relevancia_e_nome(ctx):
    from app.api.v1.routers.desenvolvimento_economico import listar_retencao
    db, _, u1, *_ = ctx
    _criar_empresa(db, u1, nome="beta")                                        # 0 pontos
    _criar_empresa(db, u1, nome="Alfa")                                        # 0 pontos
    _criar_empresa(db, u1, nome="Zeta", num_empregos=600, potencial_expansao="alto")  # 40 + 15 = 55
    lista = listar_retencao(municipio_id=None, db=db, current_user=u1)
    assert [e.nome for e in lista] == ["Zeta", "Alfa", "beta"]
    assert [e.relevancia.score for e in lista] == [55, 0, 0]
    assert lista[0].relevancia.faixa == "media" and lista[0].relevancia.parcial is True
    assert lista[0].risco.nivel == "nenhum" and lista[0].risco.sinais == []
    assert {f.chave for f in lista[0].relevancia.fatores} == {"empregos", "porte", "tempo", "capital", "expansao"}


def test_detalhe_traz_relevancia_risco_e_perfil_rfb_numa_leitura(ctx):
    from app.api.v1.routers.desenvolvimento_economico import detalhe_retencao
    db, _, u1, _, m1, _ = ctx
    db.add(Empresa(municipio_id=m1.id, cnpj_basico="12345678", razao_social="ACME LTDA",
                   situacao="02", porte="03", data_inicio=date(2010, 1, 5), capital_social=150_000.0))
    db.commit()
    e = _criar_empresa(db, u1, cnpj_basico="12345678", num_empregos=42, potencial_expansao="alto",
                       proxima_acao="Ligar", proxima_acao_data=date(2026, 1, 1))
    det = detalhe_retencao(e.id, db=db, current_user=u1)
    assert det.perfil_rfb is not None and det.perfil_rfb.razao_social == "ACME LTDA"
    # 20 (empregos) + 12 (EPP) + 15 (10+ anos) + 6 (150 mil) + 15 (alto) = 68
    assert (det.relevancia.score, det.relevancia.faixa, det.relevancia.parcial) == (68, "alta", False)
    assert [s.chave for s in det.risco.sinais][0] == "proxima_acao_vencida"
    assert det.risco.sinais[0].desde == date(2026, 1, 1)


def test_post_e_put_devolvem_enriquecido(ctx):
    from app.api.v1.routers.desenvolvimento_economico import atualizar_retencao
    db, _, u1, *_ = ctx
    out = _criar_empresa(db, u1, num_empregos=10)
    assert out.relevancia.score == 20 and out.risco.nivel == "nenhum"
    upd = atualizar_retencao(out.id, EmpresaRetencaoUpdate(potencial_expansao="alto"), db=db, current_user=u1)
    assert upd.relevancia.score == 35


def test_enriquecer_casa_o_perfil_do_municipio_certo(ctx):
    from app.services.gestao_empresarial import enriquecer
    db, _, u1, u2, m1, m2 = ctx
    db.add_all([
        Empresa(municipio_id=m1.id, cnpj_basico="12345678", razao_social="Filial 1", situacao="02", porte="01"),
        Empresa(municipio_id=m2.id, cnpj_basico="12345678", razao_social="Filial 2", situacao="02", porte="05"),
    ])
    db.commit()
    e1 = _criar_empresa(db, u1, cnpj_basico="12345678")
    e2 = _criar_empresa(db, u2, cnpj_basico="12345678")
    cadastros = db.query(EmpresaRetencao).filter(EmpresaRetencao.id.in_([e1.id, e2.id])).all()
    calc = enriquecer(db, cadastros)
    assert calc[e1.id].perfil_rfb.razao_social == "Filial 1" and calc[e1.id].relevancia.score == 6
    assert calc[e2.id].perfil_rfb.razao_social == "Filial 2" and calc[e2.id].relevancia.score == 20


def test_enriquecer_usa_contatos_visitas_e_demandas(ctx):
    from datetime import timedelta
    from app.api.v1.routers.desenvolvimento_economico import (
        adicionar_contato, adicionar_demanda, adicionar_visita, detalhe_retencao,
    )
    from app.schemas.desenvolvimento_economico import VisitaRetencaoCreate
    db, _, u1, *_ = ctx
    hoje = date.today()
    e = _criar_empresa(db, u1)
    adicionar_contato(e.id, ContatoEmpresaCreate(data=hoje - timedelta(days=200)), db=db, current_user=u1)
    adicionar_visita(e.id, VisitaRetencaoCreate(data_visita=hoje - timedelta(days=10)), db=db, current_user=u1)
    adicionar_demanda(e.id, DemandaEmpresaCreate(descricao="Via", data_registro=hoje - timedelta(days=45)),
                      db=db, current_user=u1)
    det = detalhe_retencao(e.id, db=db, current_user=u1)
    chaves = [s.chave for s in det.risco.sinais]
    assert "sem_contato_90d" not in chaves          # a visita de 10 dias atrás conta como contato
    assert chaves == ["demanda_aberta_30d"] and det.risco.nivel == "atencao"
    assert det.risco.sinais[0].desde == hoje - timedelta(days=45)


# ── descoberta na base RFB (sub-frente B) ────────────────────────────────────

def _args_descobrir(**kw):
    base = dict(situacao="02", porte=None, divisao=None, q=None, limit=20, offset=0)
    base.update(kw)
    return base


def test_descobrir_retencao_devolve_pagina_com_divisao_e_score(ctx):
    from app.api.v1.routers.desenvolvimento_economico import descobrir_divisoes, descobrir_retencao
    db, _, u1, _, m1, _ = ctx
    db.add_all([
        Empresa(municipio_id=m1.id, cnpj_basico="11111111", razao_social="Metal Forte", situacao="02",
                porte="05", cnae_fiscal="2511000", capital_social=5e6, data_inicio=date(2000, 1, 1)),
        Empresa(municipio_id=m1.id, cnpj_basico="22222222", razao_social="Padaria", situacao="02",
                porte="01", cnae_fiscal="4721102"),
    ])
    db.commit()
    _criar_empresa(db, u1, nome="Padaria acompanhada", cnpj_basico="22222222")
    page = descobrir_retencao(**_args_descobrir(), mid=m1.id, db=db)
    assert page.total == 1
    item = page.itens[0]
    assert (item.razao_social, item.divisao, item.divisao_descricao, item.score) == \
        ("Metal Forte", "25", "Fabricação de produtos de metal", 43)
    assert item.data_inicio == date(2000, 1, 1) and item.capital_social == 5e6
    divs = descobrir_divisoes(mid=m1.id, db=db)
    assert [(d.divisao, d.descricao, d.total) for d in divs] == [("25", "Fabricação de produtos de metal", 1)]


def test_descobrir_retencao_sem_municipio_e_codigo_invalido(ctx):
    from fastapi import HTTPException
    from app.api.v1.routers.desenvolvimento_economico import descobrir_divisoes, descobrir_retencao
    db, *_ = ctx
    assert descobrir_retencao(**_args_descobrir(), mid=None, db=db).total == 0
    assert descobrir_divisoes(mid=None, db=db) == []
    with pytest.raises(HTTPException) as exc:
        descobrir_retencao(**_args_descobrir(situacao="99"), mid=1, db=db)
    assert exc.value.status_code == 422


def test_rotas_de_descoberta_vem_antes_do_detalhe_por_id():
    from app.main import app
    caminhos = [getattr(r, "path", "") for r in app.router.routes]
    base = "/api/v1/desenvolvimento-economico/retencao"
    assert caminhos.index(f"{base}/descobrir") < caminhos.index(base + "/{empresa_id}")
    assert caminhos.index(f"{base}/descobrir/divisoes") < caminhos.index(base + "/{empresa_id}")
